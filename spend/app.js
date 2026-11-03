import { newId } from '../src/sync.js';
import {
  allCategories, categoryOf, parseAmount, formatCents, localIso, addDays, periodOf, shiftPeriod, periodLabel, shortDate, dayLabel,
  inPeriod, total, monthSummary, byCategory, cumulative, groupByDay, matches, applyRepeats, toCsv, keypadInput,
} from '../src/spend.js';
import { $, esc, switchTab, toast } from '../shared/ui.js';

const STORAGE_KEY = 'spend-v1';

// ---- Saved state ------------------------------------------------------------------------------

function fresh() {
  return { expenses: [], budget: { total: 0, cats: {} }, startDay: 1, custom: [], repeats: [], lastCat: 'food' };
}

// False when saved data couldn't be read: then nothing is saved over it (see save()).
let canSave = true;

function load() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    canSave = false; // storage blocked; shared/pwa.js explains
    return fresh();
  }
  if (raw == null) return fresh();
  try {
    const saved = JSON.parse(raw);
    if (saved && Array.isArray(saved.expenses)) {
      const f = fresh();
      return { ...f, ...saved, budget: { ...f.budget, ...saved.budget } };
    }
  } catch { /* unreadable: kept below */ }
  // Keep the unreadable copy rather than saving an empty month over it.
  try {
    localStorage.setItem(`${STORAGE_KEY}-unreadable-${Date.now()}`, raw);
  } catch {
    canSave = false;
  }
  return fresh();
}

function save() {
  if (!canSave) {
    toast('Not saved: this browser is blocking storage.');
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    toast('Could not save. Your phone may be out of space, or the browser is blocking storage.');
  }
}

const state = load();
const today = () => localIso();
const cats = () => allCategories(state.custom);
const cat = (id) => categoryOf(id, state.custom);
const money = (c) => formatCents(c);
// Whole dollars where the cents don't matter (budgets, chart labels).
const round = (c) => (c % 100 === 0 ? formatCents(c).slice(0, -3) : formatCents(c));

let period = periodOf(today(), state.startDay);
let tab = 'month';
let query = '';
let catFilter = 'all';
let editingId = null;

function addRepeats() {
  const n = applyRepeats(state, today(), newId);
  if (n) { save(); toast(`Added ${n} monthly repeat${n === 1 ? '' : 's'}`); }
}

// ---- Rendering --------------------------------------------------------------------------------

function render() {
  renderNav();
  renderHeader();
  renderMonth();
  renderHistory();
  renderBudget();
}

function renderNav() {
  const isNow = period.key === periodOf(today(), state.startDay).key;
  $('month-label').textContent = isNow ? `${periodLabel(period)} · now` : periodLabel(period);
  $('month-nav').hidden = tab === 'budget';
  $('next').disabled = isNow;
}

function renderHeader() {
  const s = monthSummary(state.expenses, state.budget.total, period, today());
  const isNow = s.current;
  $('eyebrow').textContent = isNow ? 'This month' : periodLabel(period);
  if (s.status === 'none') {
    $('headline').textContent = money(s.spent);
    $('subline').textContent = isNow ? 'spent so far' : 'spent';
  } else if (s.left >= 0) {
    $('headline').textContent = money(s.left);
    $('subline').textContent = `left of ${round(s.budget)}${isNow && s.perDay ? ` · ${money(s.perDay)} a day` : ''}`;
  } else {
    $('headline').textContent = `−${money(-s.left)}`;
    $('subline').textContent = `over the ${round(s.budget)} budget`;
  }
}

function renderMonth() {
  const list = inPeriod(state.expenses, period);
  const s = monthSummary(state.expenses, state.budget.total, period, today());
  $('month-empty').hidden = list.length > 0 || s.status !== 'none';
  $('chart-card').hidden = !list.length;
  $('cats-card').hidden = !list.length && !Object.values(state.budget.cats).some((b) => b > 0);
  $('recent-card').hidden = !list.length;
  $('budget-card').hidden = !list.length && s.status === 'none';
  renderBudgetCard(s);
  renderChart(s);
  renderCats(list);
  const latest = groupByDay(list).flatMap((d) => d.items).slice(0, 5);
  $('recent').innerHTML = `<ul class="sp-rows">${latest.map((e) => rowHtml(e, true)).join('')}</ul>`;
}

function renderBudgetCard(s) {
  const card = $('budget-card');
  if (s.status === 'none') {
    card.innerHTML = `<div class="sp-big-line"><strong>${money(s.spent)}</strong> spent${s.current ? ' so far' : ''}</div>
      ${compareLine(s)}
      <button type="button" class="secondary small sp-set" data-goto="budget">Set a monthly budget</button>`;
    return;
  }
  const pct = Math.min(1, s.pct) * 100;
  const level = s.status === 'over' ? 'bad' : s.status === 'watch' || s.pct >= 0.85 ? 'warn' : 'ok';
  let line;
  if (s.status === 'over') line = `⛔ Over budget by <b>${money(-s.left)}</b>.`;
  else if (!s.current && s.elapsed === s.days) line = `✅ Finished <b>${money(s.left)}</b> under budget.`;
  else if (!s.current) line = `This month hasn’t started yet. Budget: <b>${round(s.budget)}</b>.`;
  else if (s.status === 'watch') line = `⚠️ Spending faster than planned: on course for <b>${round(Math.round(s.projected / 100) * 100)}</b>. Keep to <b>${money(s.perDay)}</b> a day to stay in budget.`;
  else line = `✅ On track. You can spend about <b>${money(s.perDay)}</b> a day for the next ${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'}.`;
  card.innerHTML = `
    <div class="sp-big-line"><strong>${money(s.spent)}</strong> of ${round(s.budget)} spent</div>
    <div class="sp-meter ${level}" role="img" aria-label="${Math.round(s.pct * 100)}% of the budget spent${s.current ? `, ${Math.round(s.pacePct * 100)}% of the month gone` : ''}">
      <i style="width:${pct}%"></i>${s.current ? `<b class="sp-pace" style="left:${s.pacePct * 100}%"></b>` : ''}
    </div>
    <div class="sp-meter-key"><span>${Math.round(s.pct * 100)}% spent</span>${s.current ? `<span>${s.daysLeft === 1 ? 'Last day' : `${s.daysLeft} days left`} · <i class="sp-pace-key"></i> today</span>` : ''}</div>
    <p class="sp-status ${level}">${line}</p>
    ${compareLine(s)}`;
}

// The same number of days into last month, so early in the month the comparison is fair.
function compareLine(s) {
  const prev = shiftPeriod(period, -1);
  const upto = s.current ? addDays(prev.start, s.elapsed - 1) : prev.end;
  const before = total(inPeriod(state.expenses, prev).filter((e) => e.date <= upto));
  if (!before || !s.spent) return '';
  const diff = s.spent - before;
  const name = periodLabel(prev).replace(/ \d{4}$/, '');
  if (Math.abs(diff) < 100) return `<p class="sp-compare">About the same as ${esc(name)}${s.current ? ' by this point' : ''}.</p>`;
  return `<p class="sp-compare">${money(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than ${esc(name)}${s.current ? ' by this point' : ''}.</p>`;
}

// Running total against an even pace to the budget, with a tap-to-read crosshair.
function renderChart(s) {
  const run = cumulative(state.expenses, period, today());
  const el = $('chart');
  if (!run.length) { el.innerHTML = ''; $('legend').innerHTML = ''; return; }
  const W = 320; const H = 150; const L = 4; const R = 4; const T = 12; const B = 22;
  const budget = s.budget;
  const top = Math.max(budget, run.at(-1), 1) * 1.08;
  const x = (i) => L + (i / Math.max(1, period.days - 1)) * (W - L - R);
  const y = (c) => T + (1 - c / top) * (H - T - B);
  const pts = run.map((c, i) => `${x(i).toFixed(1)},${y(c).toFixed(1)}`);
  const area = `M${x(0)},${y(0)} L${pts.join(' L')} L${x(run.length - 1)},${y(0)} Z`;
  const last = run.length - 1;
  const ticks = [0, Math.floor((period.days - 1) / 2), period.days - 1];
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Running total of spending this month${budget ? ', against an even pace to the budget' : ''}">
    <line class="sp-axis" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>
    ${budget ? `<line class="sp-budget-line" x1="${L}" x2="${W - R}" y1="${y(budget)}" y2="${y(budget)}"/>
      <text class="sp-tick" x="${L}" y="${y(budget) - 4}">Budget ${esc(round(budget))}</text>
      <line class="sp-pace-line" x1="${x(0)}" y1="${y(0)}" x2="${x(period.days - 1)}" y2="${y(budget)}"/>` : ''}
    <path class="sp-area" d="${area}"/>
    <polyline class="sp-line" points="${pts.join(' ')}"/>
    <circle class="sp-dot" cx="${x(last)}" cy="${y(run[last])}" r="4"/>
    ${ticks.map((i, k) => `<text class="sp-tick" x="${x(i)}" y="${H - 6}" text-anchor="${['start', 'middle', 'end'][k]}">${esc(shortDate(addDays(period.start, i)))}</text>`).join('')}
    <g class="sp-cross" hidden><line y1="${T}" y2="${y(0)}"/><circle r="4"/></g>
    <rect class="sp-hit" x="0" y="0" width="${W}" height="${H}"/>
  </svg><div class="sp-tip" hidden></div>`;
  $('legend').innerHTML = budget
    ? '<span><i class="sp-key-line"></i>Spent</span><span><i class="sp-key-dash"></i>Even pace to budget</span>'
    : '';
  const svg = el.querySelector('svg');
  const cross = svg.querySelector('.sp-cross');
  const tip = el.querySelector('.sp-tip');
  const show = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(last, Math.round(((px - L) / (W - L - R)) * (period.days - 1))));
    cross.hidden = false;
    cross.querySelector('line').setAttribute('x1', x(i));
    cross.querySelector('line').setAttribute('x2', x(i));
    cross.querySelector('circle').setAttribute('cx', x(i));
    cross.querySelector('circle').setAttribute('cy', y(run[i]));
    const pace = budget ? Math.round((budget * (i + 1)) / period.days) : 0;
    tip.innerHTML = `<b>${esc(shortDate(addDays(period.start, i)))}</b> ${esc(money(run[i]))} spent${budget ? `<br><span>Even pace: ${esc(money(pace))}</span>` : ''}`;
    tip.hidden = false;
    const left = (x(i) / W) * r.width;
    tip.style.left = `${Math.max(0, Math.min(r.width - tip.offsetWidth, left - tip.offsetWidth / 2))}px`;
  };
  const hide = () => { cross.hidden = true; tip.hidden = true; };
  svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerdown', show);
  svg.addEventListener('pointerleave', hide);
}

function renderCats(list) {
  const rows = byCategory(list, state.budget.cats);
  const spent = total(list) || 1;
  const max = Math.max(...rows.map((r) => r.cents), 1);
  $('cats').innerHTML = rows.map((r) => {
    const c = cat(r.cat);
    let width; let level = '';
    let right;
    if (r.budget) {
      const p = r.cents / r.budget;
      width = Math.min(1, p) * 100;
      level = p > 1 ? 'bad' : p >= 0.85 ? 'warn' : '';
      right = `${esc(money(r.cents))} <small>of ${esc(round(r.budget))}</small>`;
    } else {
      width = (r.cents / max) * 100;
      right = `${esc(money(r.cents))} <small>${Math.round((r.cents / spent) * 100)}%</small>`;
    }
    const note = r.budget && r.cents > r.budget ? `<span class="sp-cat-note bad">${esc(money(r.cents - r.budget))} over</span>`
      : r.budget && level === 'warn' ? `<span class="sp-cat-note warn">${esc(money(r.budget - r.cents))} left</span>` : '';
    return `<li><button type="button" class="sp-cat-row" data-cat="${esc(r.cat)}">
      <span class="sp-cat-top"><span>${esc(c.emoji)} ${esc(c.name)}${note}</span><span class="sp-cat-amt">${right}</span></span>
      <span class="sp-bar ${level}"><i style="width:${width}%"></i></span></button></li>`;
  }).join('');
}

function rowHtml(e, withDate = false) {
  const c = cat(e.cat);
  const title = e.note || c.name;
  const sub = [e.note ? c.name : '', withDate ? dayLabel(e.date, today()) : '', e.repeat ? '↻ monthly' : ''].filter(Boolean).join(' · ');
  return `<li><button type="button" class="sp-row" data-edit="${esc(e.id)}">
    <span class="sp-emoji" aria-hidden="true">${esc(c.emoji)}</span>
    <span class="sp-row-main"><strong>${esc(title)}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}</span>
    <span class="sp-row-amt">${esc(money(e.cents))}</span></button></li>`;
}

function renderHistory() {
  const used = new Set(inPeriod(state.expenses, period).map((e) => e.cat));
  const chips = [{ id: 'all', name: 'All', emoji: '' }, ...cats().filter((c) => used.has(c.id) || c.id === catFilter)];
  $('cat-filter').innerHTML = chips.map((c) => `<button type="button" class="jb-chip" data-filter="${esc(c.id)}" aria-pressed="${c.id === catFilter}">${c.emoji ? `${esc(c.emoji)} ` : ''}${esc(c.name)}</button>`).join('');
  const list = inPeriod(state.expenses, period).filter((e) => (catFilter === 'all' || e.cat === catFilter) && matches(e, query, state.custom));
  const days = groupByDay(list);
  const sum = total(list);
  $('history').innerHTML = days.length
    ? `<p class="sp-history-total">${list.length} expense${list.length === 1 ? '' : 's'} · <b>${esc(money(sum))}</b></p>${days.map((d) => `
      <div class="card sp-day"><div class="sp-day-head"><span>${esc(dayLabel(d.date, today()))}</span><span>${esc(money(d.total))}</span></div>
      <ul class="sp-rows">${d.items.map((e) => rowHtml(e)).join('')}</ul></div>`).join('')}`
    : `<div class="card sp-empty"><p class="hint">${query || catFilter !== 'all' ? 'Nothing matches.' : `No expenses in ${esc(periodLabel(period))}.`}</p></div>`;
}

function renderBudget() {
  const totalInput = $('b-total');
  // Don't overwrite a box someone is typing in (a keypad-only box can always be refreshed).
  if (document.activeElement !== totalInput || totalInput.readOnly) totalInput.value = state.budget.total ? (state.budget.total / 100).toString() : '';
  const sel = $('b-start');
  if (!sel.options.length) {
    sel.innerHTML = Array.from({ length: 28 }, (_, i) => i + 1).map((d) => `<option value="${d}">${d === 1 ? '1st (calendar month)' : `${d}${d === 2 || d === 22 ? 'nd' : d === 3 || d === 23 ? 'rd' : d === 21 ? 'st' : 'th'} of each month`}</option>`).join('');
  }
  sel.value = String(state.startDay);
  const focused = document.activeElement?.dataset?.catBudget;
  $('cat-budgets').innerHTML = cats().map((c) => `<label class="sp-cb-row"><span>${esc(c.emoji)} ${esc(c.name)}</span>
    <span class="sp-money-field small"><span>$</span><input ${useKeypad ? `inputmode="none"${lockBox ? ' readonly' : ''}` : 'inputmode="decimal"'} autocomplete="off" data-cat-budget="${esc(c.id)}" value="${state.budget.cats[c.id] ? state.budget.cats[c.id] / 100 : ''}" placeholder="—" aria-label="${esc(c.name)} limit"></span></label>`).join('');
  if (focused) document.querySelector(`[data-cat-budget="${CSS.escape(focused)}"]`)?.focus();
  const set = Object.values(state.budget.cats).filter((b) => b > 0);
  const sumCats = set.reduce((a, b) => a + b, 0);
  $('cat-budgets-card').querySelector('.jb-bank-sub').textContent = set.length
    ? `${set.length} set, ${round(sumCats)} in all${state.budget.total && sumCats > state.budget.total ? ` — more than the ${round(state.budget.total)} monthly budget` : ''}.`
    : 'e.g. $400 for food. Bars on the Month tab turn amber near the limit and red past it.';
  $('repeats').innerHTML = state.repeats.length
    ? state.repeats.map((r) => `<li><span class="sp-emoji" aria-hidden="true">${esc(cat(r.cat).emoji)}</span>
      <span class="sp-row-main"><strong>${esc(r.note || cat(r.cat).name)}</strong><small>${esc(money(r.cents))} on the ${ordinal(r.day)} of each month</small></span>
      <button type="button" class="text-btn danger" data-stop="${esc(r.id)}">Stop</button></li>`).join('')
    : '<li class="sp-none">None yet.</li>';
  $('my-cats').innerHTML = state.custom.length
    ? state.custom.map((c) => `<span class="sp-chip">${esc(c.emoji)} ${esc(c.name)}<button type="button" data-remove-cat="${esc(c.id)}" aria-label="Remove ${esc(c.name)}">×</button></span>`).join('')
    : '<p class="hint">Add your own, like Kids, Pets or Gifts. The built-in ones always stay.</p>';
}

const ordinal = (d) => `${d}${d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th'}`;

// ---- Tabs and month -------------------------------------------------------------------------

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
function showTab(name) {
  tab = name;
  switchTab(name);
  $('add').hidden = name === 'budget';
  renderNav();
}

$('prev').addEventListener('click', () => { period = shiftPeriod(period, -1); render(); });
$('next').addEventListener('click', () => { period = shiftPeriod(period, 1); render(); });
$('month-label').addEventListener('click', () => { period = periodOf(today(), state.startDay); render(); });
$('see-all').addEventListener('click', () => showTab('history'));

$('budget-card').addEventListener('click', (e) => {
  if (!e.target.closest('[data-goto]')) return;
  showTab('budget');
  if (useKeypad) editTotalBudget(); else $('b-total').focus();
});
$('cats').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  catFilter = b.dataset.cat;
  renderHistory();
  showTab('history');
});

$('search').addEventListener('input', (e) => { query = e.target.value; renderHistory(); });
$('cat-filter').addEventListener('click', (e) => {
  const b = e.target.closest('[data-filter]');
  if (!b) return;
  catFilter = b.dataset.filter;
  renderHistory();
});

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-edit]');
  if (b) openSheet(b.dataset.edit);
});

// ---- Budget settings ------------------------------------------------------------------------

$('budget-form').addEventListener('submit', (e) => { e.preventDefault(); $('b-total').blur(); });
$('b-total').addEventListener('change', (e) => {
  const v = e.target.value.trim();
  const c = v ? parseAmount(v) : 0;
  if (c === null) { toast('Type the budget as a number, like 2000'); return; }
  setTotalBudget(c);
});

$('b-start').addEventListener('change', (e) => {
  state.startDay = Number(e.target.value) || 1;
  period = periodOf(today(), state.startDay);
  save();
  render();
});

$('cat-budgets').addEventListener('change', (e) => {
  const id = e.target.dataset.catBudget;
  if (!id) return;
  const v = e.target.value.trim();
  const c = v ? parseAmount(v) : 0;
  if (c === null) { toast('Type the limit as a number, like 400'); return; }
  setCatBudget(id, c);
});

$('repeats').addEventListener('click', (e) => {
  const b = e.target.closest('[data-stop]');
  if (!b) return;
  const i = state.repeats.findIndex((r) => r.id === b.dataset.stop);
  if (i < 0) return;
  const [rule] = state.repeats.splice(i, 1);
  save();
  render();
  showUndo(`Stopped “${rule.note || cat(rule.cat).name}”. Past ones stay.`, () => { state.repeats.splice(i, 0, rule); save(); render(); });
});

$('cat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('cat-name').value.replace(/\s+/g, ' ').trim();
  if (!name) { $('cat-name').focus(); return; }
  if (cats().some((c) => c.name.toLowerCase() === name.toLowerCase())) { toast('There’s already a category with that name'); return; }
  state.custom.push({ id: `c-${newId()}`, name, emoji: $('cat-emoji').value.trim() || '🏷️' });
  $('cat-name').value = '';
  $('cat-emoji').value = '';
  save();
  render();
});

$('my-cats').addEventListener('click', (e) => {
  const b = e.target.closest('[data-remove-cat]');
  if (!b) return;
  const id = b.dataset.removeCat;
  const used = state.expenses.filter((x) => x.cat === id).length;
  const c = cat(id);
  if (used && !confirm(`Remove “${c.name}”? Its ${used} expense${used === 1 ? '' : 's'} will move to Other.`)) return;
  state.custom = state.custom.filter((x) => x.id !== id);
  state.expenses.forEach((x) => { if (x.cat === id) x.cat = 'other'; });
  state.repeats.forEach((x) => { if (x.cat === id) x.cat = 'other'; });
  delete state.budget.cats[id];
  if (catFilter === id) catFilter = 'all';
  save();
  render();
});

$('export').addEventListener('click', () => {
  if (!state.expenses.length) { toast('Nothing to export yet'); return; }
  const blob = new Blob([`﻿${toCsv(state.expenses, state.custom)}`], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `spending-${today()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ---- Add and edit ---------------------------------------------------------------------------

let pickedCat = state.lastCat;

function renderCatGrid() {
  $('f-cats').innerHTML = cats().map((c) => `<button type="button" role="radio" class="sp-cat-pick" data-pick="${esc(c.id)}" aria-checked="${c.id === pickedCat}"><b aria-hidden="true">${esc(c.emoji)}</b>${esc(c.name)}</button>`).join('');
}

function repeatHint() {
  const d = $('f-date').value;
  $('repeat-hint').textContent = d ? `(on the ${ordinal(Number(d.slice(8)))})` : '';
}

function openSheet(id = null) {
  const e = id && state.expenses.find((x) => x.id === id);
  editingId = e ? e.id : null;
  pickedCat = e ? e.cat : (cats().some((c) => c.id === state.lastCat) ? state.lastCat : 'food');
  // A new expense in a past month defaults to that month's last day, not today.
  const defaultDate = today() >= period.start && today() <= period.end ? today() : period.end < today() ? period.end : period.start;
  $('sheet-title').textContent = e ? 'Edit expense' : 'New expense';
  $('f-amount').value = e ? (e.cents / 100).toFixed(2) : '';
  $('f-note').value = e?.note || '';
  $('f-date').value = e ? e.date : defaultDate;
  $('f-repeat').checked = !!(e?.repeat && state.repeats.some((r) => r.id === e.repeat));
  $('form-error').hidden = true;
  $('delete-row').hidden = !e;
  renderCatGrid();
  repeatHint();
  $('sheet').showModal();
  if (!e && !useKeypad) $('f-amount').focus();
}

// Phones type the amount on the keypad in the sheet: the amount box never opens the phone
// keyboard, so there's no keyboard to hide (hiding a number pad could type a digit).
// Any touch screen gets it (some phones report a stylus or mouse as their main pointer). Only
// phones lock the box: a touch laptop's own keyboard can still type into it.
const useKeypad = navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse), (any-pointer: coarse)').matches;
const lockBox = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);

// Each key types into `input`, through keypadInput's rules.
function wireKeypad(pad, input, onKey = () => {}) {
  pad.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-key]');
    if (!b) return;
    if (document.activeElement !== document.body) document.activeElement?.blur?.(); // closes the keyboard if the note was open
    input.value = keypadInput(input.value, b.dataset.key);
    onKey();
  });
}

if (useKeypad) {
  const amount = $('f-amount');
  amount.readOnly = lockBox;
  amount.inputMode = 'none';
  $('keypad').hidden = false;
  wireKeypad($('keypad'), amount, () => { $('form-error').hidden = true; });
}

// Budgets on phones: tapping a budget box opens a small sheet with the keypad.
let amtSave = null;
function openAmountSheet({ title, hint, cents, onSave, clearLabel = 'No budget' }) {
  $('amt-title').textContent = title;
  $('amt-clear').textContent = clearLabel;
  $('amt-hint').textContent = hint;
  $('amt-input').value = cents ? String(cents / 100) : '';
  amtSave = onSave;
  $('amt-sheet').showModal();
}
wireKeypad($('amt-keypad'), $('amt-input'));
$('amt-cancel').addEventListener('click', () => $('amt-sheet').close());
$('amt-clear').addEventListener('click', () => { $('amt-sheet').close(); amtSave?.(0); });
$('amt-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const v = $('amt-input').value;
  const c = v ? parseAmount(v) : 0;
  if (c === null) return;
  $('amt-sheet').close();
  amtSave?.(c);
});

function setTotalBudget(c) {
  state.budget.total = c;
  save();
  render();
  toast(c ? `Monthly budget set to ${round(c)}` : 'Monthly budget removed');
}

function setCatBudget(id, c) {
  if (c) state.budget.cats[id] = c; else delete state.budget.cats[id];
  save();
  render();
}

function editTotalBudget() {
  openAmountSheet({ title: 'Monthly budget', hint: 'How much you want to spend in a month, everything included.', cents: state.budget.total, onSave: setTotalBudget });
}

if (useKeypad) {
  $('b-total').readOnly = lockBox;
  $('b-total').inputMode = 'none';
  $('b-total').addEventListener('click', editTotalBudget);
  $('cat-budgets').addEventListener('click', (ev) => {
    const input = ev.target.closest('[data-cat-budget]');
    if (!input) return;
    const c = cat(input.dataset.catBudget);
    openAmountSheet({
      title: `${c.emoji} ${c.name} limit`,
      hint: `The most you want to spend on ${c.name.toLowerCase()} in a month.`,
      cents: state.budget.cats[c.id] || 0,
      clearLabel: 'No limit',
      onSave: (cents) => setCatBudget(c.id, cents),
    });
  });
}
// Done on the keyboard closes it, rather than saving before a category is picked.
$('f-note').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && useKeypad) { ev.preventDefault(); ev.target.blur(); }
});

$('add').addEventListener('click', () => openSheet());
$('cancel').addEventListener('click', () => $('sheet').close());
$('f-date').addEventListener('change', repeatHint);
$('f-cats').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pick]');
  if (!b) return;
  pickedCat = b.dataset.pick;
  renderCatGrid();
});

function fail(msg, field) {
  $('form-error').textContent = msg;
  $('form-error').hidden = false;
  field?.focus();
}

$('form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const cents = parseAmount($('f-amount').value);
  if (!cents || cents > 1e10) return fail('Type the amount, like 12.50', $('f-amount'));
  const date = $('f-date').value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('Pick a date', $('f-date'));
  const note = $('f-note').value.replace(/\s+/g, ' ').trim().slice(0, 80);
  const repeat = $('f-repeat').checked;
  let e = editingId && state.expenses.find((x) => x.id === editingId);
  if (!e) {
    e = { id: newId(), added: Date.now() };
    state.expenses.push(e);
  }
  Object.assign(e, { cents, cat: pickedCat, note, date });
  let rule = e.repeat && state.repeats.find((r) => r.id === e.repeat);
  if (repeat && !rule) {
    rule = { id: newId(), from: date, last: date };
    state.repeats.push(rule);
    e.repeat = rule.id;
  }
  if (rule && repeat) Object.assign(rule, { cents, cat: pickedCat, note, day: Number(date.slice(8)), last: rule.last > date ? rule.last : date });
  if (rule && !repeat) { state.repeats = state.repeats.filter((r) => r !== rule); delete e.repeat; }
  if (!repeat) delete e.repeat;
  state.lastCat = pickedCat;
  save();
  $('sheet').close();
  if (date < period.start || date > period.end) period = periodOf(date, state.startDay);
  render();
  toast(editingId ? 'Saved' : `${money(cents)} added${repeat ? ' · repeats monthly' : ''}`);
});

$('delete').addEventListener('click', () => {
  const i = state.expenses.findIndex((x) => x.id === editingId);
  if (i < 0) return;
  const [gone] = state.expenses.splice(i, 1);
  save();
  $('sheet').close();
  render();
  showUndo(`Deleted ${money(gone.cents)}${gone.note ? ` · ${gone.note}` : ''}`, () => { state.expenses.splice(i, 0, gone); save(); render(); });
});

// ---- Undo bar ---------------------------------------------------------------------------------

let undoFn = null;
let undoTimer;
function showUndo(text, fn) {
  undoFn = fn;
  $('undo-text').textContent = text;
  $('undo').hidden = false;
  $('toast').hidden = true;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => { $('undo').hidden = true; undoFn = null; }, 6000);
}
$('undo-btn').addEventListener('click', () => {
  const fn = undoFn;
  undoFn = null;
  $('undo').hidden = true;
  fn?.();
});

// A new day (or month) while the app stays open: add repeats that fell due, move to the new month.
let lastDay = today();
document.addEventListener('visibilitychange', () => {
  if (document.hidden || today() === lastDay) return;
  const wasNow = period.key === periodOf(lastDay, state.startDay).key;
  lastDay = today();
  addRepeats();
  if (wasNow) period = periodOf(today(), state.startDay);
  render();
});

window.addEventListener('storage', (e) => {
  if (e.key !== STORAGE_KEY) return;
  Object.assign(state, load());
  render();
});

addRepeats();
render();
