import { parseAmount } from '../src/cash.js';
import {
  newId, sharesOf, exactShares, expenseProblem, balances, settleUp, totalSpent, mergeGroups, encodeGroup, decodeGroup,
  formatAmount, homeOf, inHome, CURRENCIES, rateFromTable, chargesOf, personBreakdown, summaryText, parsePayNow, payNowPayload,
  encodeSummary, decodeSummary,
} from '../src/split.js';
import { $, esc, switchTab, toast } from '../shared/ui.js';

const STORAGE_KEY = 'split-v1';
const RATES_KEY = 'split-rates'; // today's exchange rates, so they're fetched once a day
const RATES_URL = 'https://open.er-api.com/v6/latest/';
const QR_LIB = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';

// ---- Persistent state -----------------------------------------------------------------

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.groups)) return saved;
  } catch { /* storage unavailable or corrupt: start fresh */ }
  return { groups: [], current: null };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    toast('Could not save — your browser is blocking storage.');
  }
}

const state = load();
let shared = null; // the group from a read-only #s= link, while one is open
const group = () => state.groups.find((g) => g.id === state.current) || null;
const liveMembers = (g) => g.members.filter((m) => !m.deleted);
const memberName = (g, id) => g.members.find((m) => m.id === id)?.name ?? '?';
const touch = (record) => { record.updatedAt = Date.now(); return record; };
const money = (cents, g = group()) => formatAmount(cents, homeOf(g));
// A share kept exact (e.g. 3133.75 cents is $31.3375), with up to 4 decimal places and
// ≈ when it goes on further (like $3.3333…).
function exactMoney(cents, g) {
  if (Math.abs(cents - Math.round(cents)) < 1e-6) return money(Math.round(cents), g);
  const home = homeOf(g);
  const fmt = new Intl.NumberFormat('en-SG', { style: 'currency', currency: home, currencyDisplay: home === 'SGD' ? 'narrowSymbol' : 'code', minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const shown = fmt.format(cents / 100).replace(/\u00a0/g, ' ');
  return Math.abs(Math.round(cents * 100) - cents * 100) > 1e-4 ? `≈ ${shown}` : shown;
}

// ---- Form draft -------------------------------------------------------------------------

let editingId = null;
let draft = null; // { split: 'equal' | 'exact' | 'weights', among: Set, exact: {id: text}, weights: {id: n} }

function resetDraft() {
  const g = group();
  const ids = g ? liveMembers(g).map((m) => m.id) : [];
  editingId = null;
  draft = { split: 'equal', among: new Set(ids), exact: {}, weights: Object.fromEntries(ids.map((id) => [id, 1])) };
  $('desc').value = '';
  $('amount').value = '';
  $('service').checked = false;
  $('gst').checked = false;
  $('paid-by').innerHTML = '';
  $('paid-to').innerHTML = '';
  if (g) {
    // A trip abroad is usually one currency, so start with the last one used.
    $('currency').innerHTML = CURRENCIES.map((c) => `<option ${c === (g.lastCurrency || homeOf(g)) ? 'selected' : ''}>${c}</option>`).join('');
    $('rate').value = cachedRate(homeOf(g), $('currency').value) ?? '';
  }
  document.querySelector('input[name="kind"][value="expense"]').checked = true;
  document.querySelector('input[name="split"][value="equal"]').checked = true;
  if (g && isForeign() && !$('rate').value) fetchRate();
}

const formKind = () => document.querySelector('input[name="kind"]:checked').value;
const formCurrency = () => (formKind() === 'payment' ? homeOf(group()) : $('currency').value || homeOf(group()));
const isForeign = () => formCurrency() !== homeOf(group());

function formCents() {
  const typed = parseAmount($('amount').value);
  if (typed == null) return null;
  return formKind() === 'expense' ? chargesOf(typed, chargeRates()).total : typed;
}

// The ticked charges, for chargesOf.
const chargeRates = () => ({ serviceBp: $('service').checked ? 1000 : 0, gstBp: $('gst').checked ? 900 : 0 });

// Builds the expense the form describes (not yet saved).
function formExpense() {
  const g = group();
  const cents = formCents();
  const kind = formKind();
  let split;
  if (kind === 'payment') split = { type: 'exact', shares: { [$('paid-to').value]: cents ?? 0 } };
  else if (draft.split === 'equal') split = { type: 'equal', among: [...draft.among] };
  else if (draft.split === 'weights') split = { type: 'weights', weights: { ...draft.weights } };
  else {
    const shares = {};
    for (const m of liveMembers(g)) {
      const c = parseAmount(draft.exact[m.id] ?? '');
      if (c) shares[m.id] = c;
    }
    split = { type: 'exact', shares };
  }
  const old = g.expenses.find((e) => e.id === editingId);
  const e = {
    id: editingId || newId(),
    kind,
    desc: kind === 'payment' ? 'Payment' : $('desc').value.trim() || 'Expense',
    cents: cents ?? 0,
    paidBy: $('paid-by').value,
    split,
    at: old?.at ?? Date.now(),
    updatedAt: Date.now(),
  };
  if (isForeign()) {
    e.currency = formCurrency();
    e.rate = Number($('rate').value.replace(/,/g, '')) || 0;
  }
  return e;
}

// ---- Exchange rates -----------------------------------------------------------------------

function cachedRate(home, currency) {
  if (home === currency) return null;
  try {
    const c = JSON.parse(localStorage.getItem(RATES_KEY));
    if (c?.base === home && c.date === new Date().toDateString()) return rateFromTable(c, currency);
  } catch { /* no cache */ }
  return null;
}

// Fills in today's rate for the chosen currency, unless one is already typed in.
async function fetchRate() {
  const g = group();
  const home = homeOf(g);
  const currency = formCurrency();
  if (home === currency) return;
  const cached = cachedRate(home, currency);
  if (cached) { $('rate').value = cached; return renderForm(); }
  $('fx-note').textContent = 'Getting today\'s rate…';
  try {
    const res = await fetch(RATES_URL + home);
    const table = await res.json();
    if (table.result !== 'success') throw new Error();
    try { localStorage.setItem(RATES_KEY, JSON.stringify({ base: home, date: new Date().toDateString(), rates: table.rates })); } catch { /* not cached */ }
    if (formCurrency() === currency) $('rate').value = rateFromTable(table, currency) ?? '';
  } catch {
    $('fx-note').textContent = 'Couldn\'t get the rate (offline?). Type it in.';
    return;
  }
  renderForm();
}

function formProblem(e) {
  if (e.kind === 'payment' && Object.keys(e.split.shares)[0] === e.paidBy) return 'Pick two different people.';
  return expenseProblem(e);
}

// ---- Rendering --------------------------------------------------------------------------

function render() {
  $('view-shared').hidden = !shared;
  if (shared) {
    $('view-groups').hidden = true;
    $('view-group').hidden = true;
    return renderShared();
  }
  const g = group();
  $('view-groups').hidden = !!g;
  $('view-group').hidden = !g;
  $('back').textContent = g ? '‹ Groups' : '‹ Apps';
  if (!g) return renderGroups();
  renderHeader();
  renderForm();
  renderExpenses();
  renderYou();
  renderBalances();
  renderPeople();
}

function myLine(g) {
  if (!g.me) return null;
  const c = balances(g)[g.me] ?? 0;
  if (c > 0) return `You're owed ${money(c, g)}`;
  if (c < 0) return `You owe ${money(-c, g)}`;
  return "You're settled up";
}

function renderGroups() {
  $('pending-banner').hidden = !pendingAdd;
  if (pendingAdd) {
    $('pending-banner').textContent = state.groups.length
      ? `Pick a group to add "${pendingAdd.desc}" (${formatAmount(pendingAdd.cents)}) to.`
      : `Make a group below, then "${pendingAdd.desc}" (${formatAmount(pendingAdd.cents)}) is added to it.`;
  }
  $('eyebrow').textContent = 'Split with friends';
  $('headline').textContent = 'Groups';
  $('subline').textContent = 'Share costs, see who owes whom, settle up';
  $('groups-empty').hidden = state.groups.length > 0;
  $('group-list').innerHTML = state.groups.map((g) => `
    <li class="tap" data-group="${esc(g.id)}">
      <div class="top"><strong>${esc(g.name)}</strong><span class="amt">${money(totalSpent(g), g)}</span></div>
      <div class="meta">${liveMembers(g).length} people${myLine(g) ? ` · ${esc(myLine(g))}` : ''}</div>
    </li>`).join('');
}

function renderHeader() {
  const g = group();
  $('eyebrow').textContent = g.name;
  $('headline').textContent = money(totalSpent(g));
  $('subline').textContent = myLine(g) ?? `spent by ${liveMembers(g).length} people`;
}

function options(g, selected) {
  return liveMembers(g).map((m) => `<option value="${esc(m.id)}" ${m.id === selected ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
}

function renderForm() {
  const g = group();
  const kind = formKind();
  const isPayment = kind === 'payment';
  const keepPaidBy = $('paid-by').value || g.me || liveMembers(g)[0]?.id;
  $('paid-by').innerHTML = options(g, keepPaidBy);
  const keepPaidTo = $('paid-to').value || liveMembers(g).find((m) => m.id !== $('paid-by').value)?.id;
  $('paid-to').innerHTML = options(g, keepPaidTo);

  $('form-title').textContent = editingId ? (isPayment ? 'Edit payment' : 'Edit expense') : (isPayment ? 'Record a payment' : 'Add an expense');
  $('save-expense').textContent = editingId ? 'Save changes' : 'Add';
  $('cancel-edit').hidden = !editingId;
  $('delete-expense').hidden = !editingId;
  $('desc-field').hidden = isPayment;
  $('charges-row').hidden = isPayment;
  $('split-field').hidden = isPayment;
  $('paid-to-field').hidden = !isPayment;
  $('paid-by-label').textContent = isPayment ? 'Who paid' : 'Paid by';
  $('currency').hidden = isPayment;

  const typed = parseAmount($('amount').value);
  const cur = formCurrency();
  const ch = chargesOf(typed ?? 0, chargeRates());
  const parts = [ch.service && `${formatAmount(ch.service, cur)} service charge`, ch.gst && `${formatAmount(ch.gst, cur)} GST`].filter(Boolean);
  $('charges-total').textContent = typed && parts.length ? `Total ${formatAmount(ch.total, cur)} (${formatAmount(typed, cur)} + ${parts.join(' + ')})` : '';
  $('fx-row').hidden = !isForeign();
  if (isForeign()) {
    $('fx-from').textContent = cur;
    $('fx-to').textContent = homeOf(g);
    const e = formExpense();
    if (e.rate > 0 && e.cents) $('fx-note').textContent = `≈ ${money(inHome(e, homeOf(g)).cents)}`;
    else if (e.rate > 0) $('fx-note').textContent = 'Today\'s rate; change it to match your card or money changer.';
  }
  renderSplitRows();

  const e = formExpense();
  const problem = $('amount').value.trim() ? formProblem(e) : null;
  $('form-status').hidden = !problem;
  $('form-status').className = 'status warn';
  $('form-status').textContent = problem ?? '';
  $('save-expense').disabled = !!formProblem(e);
}

function renderSplitRows() {
  const g = group();
  const ids = liveMembers(g).map((m) => m.id);
  const e = formExpense();
  const shares = e.kind === 'expense' ? sharesOf(e, ids) : {};
  $('split-rows').innerHTML = liveMembers(g).map((m) => {
    const share = shares[m.id] ? formatAmount(shares[m.id], formCurrency()) : '—';
    let control;
    if (draft.split === 'equal') {
      control = `<input type="checkbox" class="big-check" data-among="${esc(m.id)}" ${draft.among.has(m.id) ? 'checked' : ''} aria-label="Include ${esc(m.name)}">`;
    } else if (draft.split === 'exact') {
      control = `<input class="cents-input" inputmode="decimal" data-exact="${esc(m.id)}" value="${esc(draft.exact[m.id] ?? '')}" placeholder="0.00" aria-label="${esc(m.name)}'s amount">`;
    } else {
      const w = draft.weights[m.id] ?? 0;
      control = `<div class="stepper">
        <button type="button" data-weight="${esc(m.id)}" data-delta="-1" ${w === 0 ? 'disabled' : ''} aria-label="One share fewer for ${esc(m.name)}">−</button>
        <span class="count">${w}</span>
        <button type="button" data-weight="${esc(m.id)}" data-delta="1" aria-label="One share more for ${esc(m.name)}">+</button>
      </div>`;
    }
    const note = draft.split === 'exact' ? '' : `<small>${share}</small>`;
    return `<li class="${shares[m.id] ? '' : 'zero'}"><div class="label"><strong>${esc(m.name)}</strong>${note}</div>${control}</li>`;
  }).join('');
}

function fmtDate(t) {
  return new Date(t).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
}

function renderExpenses() {
  const g = group();
  const ids = g.members.map((m) => m.id);
  const home = homeOf(g);
  const list = g.expenses.filter((e) => !e.deleted).sort((a, b) => b.at - a.at);
  const all = exactShares(g);
  $('expenses-empty').hidden = list.length > 0;
  $('expense-list').innerHTML = list.map((e) => {
    const shares = all[e.id];
    let title;
    let meta;
    if (e.kind === 'payment') {
      const to = Object.keys(e.split.shares)[0];
      title = `💸 ${esc(memberName(g, e.paidBy))} paid ${esc(memberName(g, to))}`;
      meta = fmtDate(e.at);
    } else {
      const n = Object.values(shares).filter((c) => c > 0).length;
      const h = inHome(e, home);
      title = esc(e.desc);
      meta = `${esc(memberName(g, e.paidBy))} paid · split ${n} way${n === 1 ? '' : 's'} · ${fmtDate(e.at)}`;
      if (h !== e) meta += ` · ≈ ${money(h.cents)}`;
      if (g.me) {
        const mine = Math.round((h.paidBy === g.me ? h.cents : 0) - (shares[g.me] || 0));
        if (mine > 0) meta += ` · <span class="pos">you lent ${money(mine)}</span>`;
        if (mine < 0) meta += ` · <span class="neg">you owe ${money(-mine)}</span>`;
      }
    }
    return `<li class="tap ${e.id === editingId ? 'editing' : ''}" data-expense="${esc(e.id)}">
      <div class="top"><span>${title}</span><span class="amt">${formatAmount(e.cents, e.currency || home)}</span></div>
      <div class="meta">${meta}</div>
    </li>`;
  }).join('');
}

// The top of Summary: what this phone's person owes or is owed, which is usually all
// someone opening a shared link wants to know. Asks who they are first.
function renderYou(g = group(), card = $('you-card'), readOnly = false) {
  const people = liveMembers(g);
  if (!g.me || !people.some((m) => m.id === g.me)) {
    card.innerHTML = `<h2>Who are you?</h2>
      <p class="hint">Tap your name to see what you owe or are owed. Only saved on this phone.</p>
      <div class="who-btns">${people.map((m) => `<button class="secondary" data-me="${esc(m.id)}">${esc(m.name)}</button>`).join('')}</div>`;
    return;
  }
  const b = personBreakdown(g, g.me);
  const mine = settleUp(balances(g), liveMembers(g).map((m) => m.id)).map((t, i) => ({ ...t, i })).filter((t) => t.from === g.me || t.to === g.me);
  let head;
  if (!mine.length) head = `<p class="you-big">You're all square 🎉</p>`;
  else head = mine.map((t) => {
    const owe = t.from === g.me;
    const other = g.members.find((m) => m.id === (owe ? t.to : t.from));
    const qr = owe && homeOf(g) === 'SGD' && parsePayNow(other?.paynow) ? `<button class="primary small" data-qr="${t.i}">Pay by PayNow</button>` : '';
    const btns = readOnly ? qr : owe
      ? `${qr}<button class="secondary small" data-paid="${t.i}">I've paid</button>`
      : `<button class="secondary small" data-paid="${t.i}">${esc(other?.name ?? '?')} has paid me</button>`;
    return `<div class="you-line ${owe ? 'owe' : 'owed'}">
      <p class="you-big"><span>${owe ? `You owe <b>${esc(other?.name ?? '?')}</b>` : `<b>${esc(other?.name ?? '?')}</b> owes you`}</span>
        <span class="amt ${owe ? 'neg' : 'pos'}">${money(t.cents, g)}</span></p>
      ${btns ? `<div class="row-btns">${btns}</div>` : ''}
    </div>`;
  }).join('');
  const rows = b.items.map((it) => {
    if (it.kind === 'payment') {
      return it.to
        ? `<li><div class="top"><span>💸 You paid ${esc(memberName(g, it.to))}</span><span class="amt pos">+${money(it.cents, g)}</span></div><div class="meta">${readOnly ? '' : fmtDate(it.at)}</div></li>`
        : `<li><div class="top"><span>💸 ${esc(memberName(g, it.from))} paid you</span><span class="amt neg">−${money(it.cents, g)}</span></div><div class="meta">${readOnly ? '' : fmtDate(it.at)}</div></li>`;
    }
    const who = it.paid ? 'You paid' : `${esc(memberName(g, it.paidBy))} paid`;
    return `<li><div class="top"><span>${esc(it.desc)}</span><span class="amt">${it.share ? exactMoney(it.share, g) : '—'}</span></div>
      <div class="meta">${who} ${money(it.cents, g)}${readOnly ? '' : ` · ${fmtDate(it.at)}`}${it.share ? '' : ' · not in your split'}</div></li>`;
  }).join('');
  const totals = [
    ['Your share of everything', money(b.share, g)],
    ['You paid for the group', money(b.paid, g)],
    b.sent && ['Payments you sent', money(b.sent, g)],
    b.received && ['Payments you got', money(b.received, g)],
  ].filter(Boolean).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  card.innerHTML = `<p class="eyebrow">${esc(memberName(g, g.me))} · <button class="link" data-me="">Not you?</button></p>
    ${head}
    ${b.items.length ? `<details class="you-how"><summary>How it adds up</summary>
      <dl class="summary">${totals}</dl>
      <p class="hint">Your share of each expense${b.items.some((it) => Math.abs(it.share % 1) > 1e-6) ? ', kept exact. Only your total is rounded to the cent' : ''}:</p>
      <ul class="history">${rows}</ul></details>` : ''}`;
}

// A read-only summary from a #s= link: who you are, what you owe, and the expenses.
function renderShared() {
  const g = shared;
  const net = balances(g);
  const ids = g.members.map((m) => m.id);
  $('back').textContent = '‹ Apps';
  $('eyebrow').textContent = g.name;
  $('headline').textContent = money(totalSpent(g), g);
  $('subline').textContent = `spent by ${g.members.length} people${g.sharedAt ? ` · as of ${fmtDate(g.sharedAt)}` : ''}`;
  renderYou(g, $('sh-you'), true);
  $('sh-balances').innerHTML = g.members.map((m) => {
    const c = net[m.id] ?? 0;
    const label = c > 0 ? `gets back ${money(c, g)}` : c < 0 ? `owes ${money(-c, g)}` : 'settled';
    return `<div><dt>${esc(m.name)}${m.id === g.me ? ' (you)' : ''}</dt><dd class="${c > 0 ? 'pos' : c < 0 ? 'neg' : ''}">${label}</dd></div>`;
  }).join('');
  const transfers = settleUp(net, ids);
  $('sh-settled').hidden = transfers.length > 0;
  $('sh-settle').innerHTML = transfers.map((t) => `<li><div class="top"><span>${esc(memberName(g, t.from))} → ${esc(memberName(g, t.to))}</span><span class="amt">${money(t.cents, g)}</span></div></li>`).join('');
  const list = g.expenses;
  $('sh-expenses-empty').hidden = list.length > 0;
  $('sh-expenses').innerHTML = list.map((e) => {
    if (e.kind === 'payment') return `<li><div class="top"><span>💸 ${esc(memberName(g, e.paidBy))} paid ${esc(memberName(g, Object.keys(e.split.shares)[0]))}</span><span class="amt">${money(e.cents, g)}</span></div></li>`;
    const n = Object.values(sharesOf(e, ids)).filter((c) => c > 0).length;
    return `<li><div class="top"><span>${esc(e.desc)}</span><span class="amt">${money(e.cents, g)}</span></div>
      <div class="meta">${esc(memberName(g, e.paidBy))} paid · split ${n} way${n === 1 ? '' : 's'}</div></li>`;
  }).join('');
  $('sh-foot').innerHTML = `A read-only summary someone shared${g.sharedAt ? ` on ${fmtDate(g.sharedAt)}` : ''}. Ask them for a new link after expenses change. <a href="./">Open Split</a> to make your own groups.`;
}

// Who you are on a shared summary is remembered per group name, so reopening a newer
// link for the same group doesn't ask again.
const SHARED_ME_KEY = 'split-shared-me';
function sharedMe(g) {
  try {
    const name = JSON.parse(localStorage.getItem(SHARED_ME_KEY))?.[g.name];
    return g.members.find((m) => m.name === name)?.id ?? null;
  } catch { return null; }
}
function setSharedMe(id) {
  shared.me = id;
  try {
    const all = JSON.parse(localStorage.getItem(SHARED_ME_KEY)) || {};
    all[shared.name] = id ? memberName(shared, id) : undefined;
    localStorage.setItem(SHARED_ME_KEY, JSON.stringify(all));
  } catch { /* not remembered */ }
  render();
}

function renderBalances() {
  const g = group();
  const net = balances(g);
  const ids = liveMembers(g).map((m) => m.id);
  $('balance-list').innerHTML = liveMembers(g).map((m) => {
    const c = net[m.id] ?? 0;
    const label = c > 0 ? `gets back ${money(c)}` : c < 0 ? `owes ${money(-c)}` : 'settled';
    return `<div><dt>${esc(m.name)}${m.id === g.me ? ' (you)' : ''}</dt><dd class="${c > 0 ? 'pos' : c < 0 ? 'neg' : ''}">${label}</dd></div>`;
  }).join('');

  const transfers = settleUp(net, ids);
  $('settled').hidden = transfers.length > 0;
  $('settle-list').innerHTML = transfers.map((t, i) => {
    const to = g.members.find((m) => m.id === t.to);
    return `<li>
      <div class="top"><span>${esc(memberName(g, t.from))} → ${esc(to?.name ?? '?')}</span><span class="amt">${money(t.cents)}</span></div>
      <div class="row-btns">
        ${homeOf(g) === 'SGD' && parsePayNow(to?.paynow) ? `<button class="secondary small" data-qr="${i}">PayNow QR</button>` : ''}
        <button class="secondary small" data-paid="${i}">Mark as paid</button>
      </div>
    </li>`;
  }).join('');
}

function renderPeople() {
  const g = group();
  $('me').innerHTML = `<option value="">Choose…</option>${options(g, g.me)}`;
  if (document.activeElement !== $('group-name')) $('group-name').value = g.name;
  const hasExpenses = g.expenses.some((e) => !e.deleted);
  $('home-currency').innerHTML = CURRENCIES.map((c) => `<option ${c === homeOf(g) ? 'selected' : ''}>${c}</option>`).join('');
  $('home-currency').disabled = hasExpenses;
  $('home-currency-hint').hidden = !hasExpenses;
  const used = new Set(g.expenses.filter((e) => !e.deleted).flatMap((e) => [e.paidBy, ...Object.keys(sharesOf(e, g.members.map((m) => m.id)))]));
  $('member-list').innerHTML = liveMembers(g).map((m) => `
    <li>
      <input class="name" data-member-name="${esc(m.id)}" value="${esc(m.name)}" aria-label="Name">
      <input class="paynow" data-member-paynow="${esc(m.id)}" value="${esc(m.paynow ?? '')}" inputmode="tel" placeholder="PayNow no." aria-label="${esc(m.name)}'s PayNow number">
      <button class="icon-btn" data-remove-member="${esc(m.id)}" ${used.has(m.id) ? 'disabled title="Has expenses"' : ''} aria-label="Remove ${esc(m.name)}">✕</button>
    </li>`).join('');
}

// ---- Actions ----------------------------------------------------------------------------

// Opens on Summary once there is something to sum up, else on adding the first expense.
function openGroup(id, tab) {
  state.current = id;
  save();
  resetDraft();
  switchTab(tab ?? (pendingAdd || !group().expenses.some((e) => !e.deleted) ? 'expenses' : 'balances'));
  if (pendingAdd) {
    // A bill handed over from another app (e.g. Sushiro): already nett, in SGD.
    $('desc').value = pendingAdd.desc;
    $('amount').value = (pendingAdd.cents / 100).toFixed(2);
    $('currency').value = homeOf(group());
    pendingAdd = null;
    toast('Check who to split it with, then tap Add.');
  }
  render();
}

function createGroup() {
  const name = $('new-name').value.trim() || 'Group';
  const names = $('new-members').value.split(',').map((s) => s.trim()).filter(Boolean);
  if (names.length < 2) return toast('Add at least two people.');
  const now = Date.now();
  const members = names.map((n) => ({ id: newId(), name: n, updatedAt: now }));
  const g = { id: newId(), name, updatedAt: now, members, expenses: [], me: members[0].id };
  if (pendingTripId) g.tripId = pendingTripId;
  pendingTripId = null;
  state.groups.unshift(g);
  $('new-name').value = '';
  $('new-members').value = '';
  openGroup(g.id);
}

function saveExpense() {
  const g = group();
  const e = formExpense();
  if (formProblem(e)) return;
  const i = g.expenses.findIndex((x) => x.id === e.id);
  if (i >= 0) g.expenses[i] = e; else g.expenses.push(e);
  if (e.kind !== 'payment') g.lastCurrency = e.currency || homeOf(g);
  save();
  toast(editingId ? 'Saved.' : `${e.kind === 'payment' ? 'Payment' : formatAmount(e.cents, e.currency || homeOf(g))} added.`);
  resetDraft();
  render();
}

function editExpense(id) {
  const g = group();
  const e = g.expenses.find((x) => x.id === id);
  if (!e) return;
  resetDraft();
  editingId = id;
  document.querySelector(`input[name="kind"][value="${e.kind === 'payment' ? 'payment' : 'expense'}"]`).checked = true;
  $('desc').value = e.kind === 'payment' ? '' : e.desc;
  $('amount').value = (e.cents / 100).toFixed(2);
  $('paid-by').innerHTML = options(g, e.paidBy);
  $('currency').value = e.currency || homeOf(g);
  $('rate').value = e.rate ?? '';
  if (e.kind === 'payment') {
    $('paid-to').innerHTML = options(g, Object.keys(e.split.shares)[0]);
  } else {
    draft.split = e.split.type;
    if (e.split.type === 'equal') draft.among = new Set(e.split.among);
    if (e.split.type === 'weights') draft.weights = { ...e.split.weights };
    if (e.split.type === 'exact') draft.exact = Object.fromEntries(Object.entries(e.split.shares).map(([k, c]) => [k, (c / 100).toFixed(2)]));
    document.querySelector(`input[name="split"][value="${e.split.type}"]`).checked = true;
  }
  render();
  $('expense-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function deleteExpense() {
  const g = group();
  const e = g.expenses.find((x) => x.id === editingId);
  if (!e || !confirm(`Delete "${e.desc}"?`)) return;
  e.deleted = true;
  touch(e);
  save();
  toast('Deleted.');
  resetDraft();
  render();
}

function recordPayment(t) {
  const g = group();
  g.expenses.push({ id: newId(), kind: 'payment', desc: 'Payment', cents: t.cents, paidBy: t.from, split: { type: 'exact', shares: { [t.to]: t.cents } }, at: Date.now(), updatedAt: Date.now() });
  save();
  toast(`${memberName(g, t.from)} paid ${memberName(g, t.to)} ${money(t.cents)}.`);
  render();
}

const currentTransfers = () => {
  const g = group();
  return settleUp(balances(g), liveMembers(g).map((m) => m.id));
};

let qrLib = null;
function loadQrLib() {
  qrLib ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = QR_LIB;
    s.onload = () => resolve(window.qrcode);
    s.onerror = () => { qrLib = null; reject(new Error('offline')); };
    document.head.append(s);
  });
  return qrLib;
}

let qrTransfer = null;
async function showQr(t, g = group()) {
  const to = g.members.find((m) => m.id === t.to);
  qrTransfer = t;
  $('qr-title').textContent = `${memberName(g, t.from)} pays ${to.name} ${money(t.cents, g)}`;
  $('qr-paid').hidden = g === shared;
  $('qr-code').textContent = 'Loading…';
  $('qr-dialog').showModal();
  try {
    const qrcode = await loadQrLib();
    const qr = qrcode(0, 'M');
    qr.addData(payNowPayload({ proxy: parsePayNow(to.paynow), cents: t.cents, name: to.name, ref: g.name }));
    qr.make();
    $('qr-code').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 3, scalable: true });
  } catch {
    $('qr-code').textContent = `Couldn't load the QR maker (are you offline?). Pay ${to.paynow} by PayNow instead.`;
  }
}

// The read-only summary link friends normally get; editable copies use #g=.
async function shareUrl(editable = false) {
  const g = group();
  return `${location.origin}${location.pathname}${editable ? `#g=${await encodeGroup(g)}` : `#s=${await encodeSummary(g)}`}`;
}

async function shareLink(editable = false) {
  const g = group();
  const url = await shareUrl(editable);
  if (navigator.share) {
    const text = editable ? `An editable copy of ${g.name}` : `What everyone owes for ${g.name}`;
    try { await navigator.share({ title: `${g.name} · Split`, text, url }); return; } catch { /* cancelled: fall back to copying */ }
  }
  try {
    await navigator.clipboard.writeText(url);
    $('share-note').textContent = 'Link copied. Paste it into your group chat.';
  } catch {
    $('share-note').textContent = url;
  }
}

async function copySummary() {
  const text = summaryText(group(), await shareUrl());
  try {
    await navigator.clipboard.writeText(text);
    toast('Summary copied.');
  } catch {
    if (navigator.share) navigator.share({ text }).catch(() => {});
  }
}

function removeMember(id) {
  const g = group();
  const m = g.members.find((x) => x.id === id);
  if (!m || !confirm(`Remove ${m.name}?`)) return;
  m.deleted = true;
  touch(m);
  if (g.me === id) g.me = null;
  draft.among.delete(id);
  save();
  render();
}

function addMember() {
  const g = group();
  const name = $('add-member-name').value.trim();
  if (!name) return;
  const m = touch({ id: newId(), name });
  g.members.push(m);
  draft.among.add(m.id);
  draft.weights[m.id] = 1;
  $('add-member-name').value = '';
  save();
  render();
}

function deleteGroup() {
  const g = group();
  if (!confirm(`Remove "${g.name}" from this phone? Friends keep their copies, and you can open a shared link to get it back.`)) return;
  state.groups = state.groups.filter((x) => x.id !== g.id);
  state.current = null;
  save();
  render();
}

let pendingAdd = null; // { desc, cents } from Sushiro's "Split this bill"
let pendingTripId = null; // the trip a new group is for, from Trip Planner

function readJsonHash(text) {
  try { return JSON.parse(decodeURIComponent(text)); } catch { return null; }
}

// Links from other apps: #add={"desc","cents"} adds a bill to a group you pick, and
// #trip={"id","name"} opens the trip's group, or starts one for it.
function handOff(hash) {
  const add = hash.match(/^#add=(.+)/);
  const trip = hash.match(/^#trip=(.+)/);
  history.replaceState(null, '', location.pathname);
  if (add) {
    const a = readJsonHash(add[1]);
    if (!(a?.cents > 0)) return;
    pendingAdd = { desc: String(a.desc || 'Bill').slice(0, 80), cents: Math.round(a.cents) };
    state.current = null;
    render();
  }
  if (trip) {
    const t = readJsonHash(trip[1]);
    if (!t?.id) return;
    const existing = state.groups.find((g) => g.tripId === t.id);
    if (existing) return openGroup(existing.id);
    pendingTripId = String(t.id);
    state.current = null;
    render();
    $('new-name').value = String(t.name || '').slice(0, 80);
    $('new-members').focus();
    toast(`Add who's going on ${t.name || 'the trip'}.`);
  }
}

// Opening a share link adds the group, or merges it into the copy already here.
async function importFromHash() {
  if (/^#(add|trip)=/.test(location.hash)) return handOff(location.hash);
  const s = location.hash.match(/^#s=([A-Za-z0-9_-]+)/);
  if (s) {
    // Kept in the address bar, so reloading shows it again; nothing is saved to the groups.
    shared = await decodeSummary(s[1]);
    if (!shared) toast("That link couldn't be read. Ask for it to be sent again.");
    else shared.me = sharedMe(shared);
    return render();
  }
  if (shared) { shared = null; render(); }
  const m = location.hash.match(/^#g=([A-Za-z0-9_-]+)/);
  if (!m) return;
  history.replaceState(null, '', location.pathname);
  const incoming = await decodeGroup(m[1]);
  if (!incoming) return toast("That link couldn't be read. Ask for it to be sent again.");
  const existing = state.groups.find((g) => g.id === incoming.id);
  if (existing) {
    const { group: merged, changed } = mergeGroups(existing, incoming);
    Object.assign(existing, merged);
    toast(changed ? `Updated: ${changed} new or changed expense${changed === 1 ? '' : 's'}.` : 'Already up to date.');
  } else {
    state.groups.unshift({ ...incoming, me: null });
    toast(`Added "${incoming.name}".`);
  }
  save();
  openGroup(incoming.id, 'balances');
}

// ---- Wiring -----------------------------------------------------------------------------

$('back').addEventListener('click', (ev) => {
  if (!group()) return;
  ev.preventDefault();
  state.current = null;
  save();
  render();
});
$('group-list').addEventListener('click', (ev) => {
  const li = ev.target.closest('[data-group]');
  if (li) openGroup(li.dataset.group);
});
$('create-group').addEventListener('click', createGroup);
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

for (const id of ['desc', 'amount']) $(id).addEventListener('input', renderForm);
for (const id of ['service', 'gst', 'paid-by', 'paid-to']) $(id).addEventListener('change', renderForm);
$('currency').addEventListener('change', () => { $('rate').value = ''; renderForm(); fetchRate(); });
$('rate').addEventListener('input', renderForm);
$('home-currency').addEventListener('change', () => {
  const g = group();
  g.currency = $('home-currency').value;
  g.lastCurrency = g.currency;
  touch(g);
  save();
  resetDraft();
  render();
});
document.querySelectorAll('input[name="kind"]').forEach((r) => r.addEventListener('change', renderForm));
document.querySelectorAll('input[name="split"]').forEach((r) => r.addEventListener('change', () => { draft.split = r.value; renderForm(); }));
$('split-rows').addEventListener('change', (ev) => {
  const id = ev.target.dataset.among;
  if (id) { if (ev.target.checked) draft.among.add(id); else draft.among.delete(id); renderForm(); }
});
$('split-rows').addEventListener('input', (ev) => {
  const id = ev.target.dataset.exact;
  if (!id) return;
  draft.exact[id] = ev.target.value;
  // Re-render only the status so the box being typed in keeps focus.
  const e = formExpense();
  const problem = formProblem(e);
  $('form-status').hidden = !problem;
  $('form-status').textContent = problem ?? '';
  $('save-expense').disabled = !!problem;
});
$('split-rows').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-weight]');
  if (!b) return;
  draft.weights[b.dataset.weight] = Math.max(0, (draft.weights[b.dataset.weight] ?? 0) + Number(b.dataset.delta));
  renderForm();
});
$('save-expense').addEventListener('click', saveExpense);
$('cancel-edit').addEventListener('click', () => { resetDraft(); render(); });
$('delete-expense').addEventListener('click', deleteExpense);
$('expense-list').addEventListener('click', (ev) => {
  const li = ev.target.closest('[data-expense]');
  if (li) editExpense(li.dataset.expense);
});

$('settle-list').addEventListener('click', (ev) => {
  const t = currentTransfers();
  const paid = ev.target.closest('[data-paid]');
  const qr = ev.target.closest('[data-qr]');
  if (paid) recordPayment(t[paid.dataset.paid]);
  if (qr) showQr(t[qr.dataset.qr]);
});
$('you-card').addEventListener('click', (ev) => {
  const t = currentTransfers();
  const me = ev.target.closest('[data-me]');
  const paid = ev.target.closest('[data-paid]');
  const qr = ev.target.closest('[data-qr]');
  if (me) setMe(me.dataset.me || null);
  if (paid) recordPayment(t[paid.dataset.paid]);
  if (qr) showQr(t[qr.dataset.qr]);
});
$('sh-you').addEventListener('click', (ev) => {
  const me = ev.target.closest('[data-me]');
  const qr = ev.target.closest('[data-qr]');
  if (me) setSharedMe(me.dataset.me || null);
  if (qr) showQr(settleUp(balances(shared), shared.members.map((m) => m.id))[qr.dataset.qr], shared);
});
$('qr-close').addEventListener('click', () => $('qr-dialog').close());
$('qr-paid').addEventListener('click', () => { $('qr-dialog').close(); if (qrTransfer) recordPayment(qrTransfer); });
$('copy-summary').addEventListener('click', copySummary);

$('share-link').addEventListener('click', () => shareLink());
$('share-edit').addEventListener('click', () => shareLink(true));
function setMe(id) {
  group().me = id;
  if (!editingId) $('paid-by').innerHTML = ''; // so "Paid by" now defaults to you
  save();
  render();
}
$('me').addEventListener('change', () => setMe($('me').value || null));
$('group-name').addEventListener('change', () => {
  const g = group();
  g.name = $('group-name').value.trim() || g.name;
  touch(g);
  save();
  render();
});
$('member-list').addEventListener('change', (ev) => {
  const g = group();
  const nameId = ev.target.dataset.memberName;
  const payId = ev.target.dataset.memberPaynow;
  const m = g.members.find((x) => x.id === (nameId || payId));
  if (!m) return;
  if (nameId) m.name = ev.target.value.trim() || m.name;
  if (payId) {
    const v = ev.target.value.trim();
    if (v && !parsePayNow(v)) toast('That doesn\'t look like a Singapore mobile number or UEN.');
    m.paynow = v;
  }
  touch(m);
  save();
  render();
});
$('member-list').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-remove-member]');
  if (b) removeMember(b.dataset.removeMember);
});
$('add-member').addEventListener('click', addMember);
$('delete-group').addEventListener('click', deleteGroup);
window.addEventListener('hashchange', importFromHash);

resetDraft();
render();
importFromHash();
