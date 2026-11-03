import { keepUnreadable } from '../shared/store.js';
import {
  DENOMINATIONS, emptyCounts, totalCents, parseAmount, formatCents,
  checkTransaction, applyDelta, lowDenominations, historyCsv, periodRange, spendStats,
} from '../src/cash.js';
import { $, switchTab, toast } from '../shared/ui.js';

const STORAGE_KEY = 'petty-cash-v1';

// ---- Persistent state -------------------------------------------------------

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.stash) return { threshold: 2, history: [], ...saved, stash: { ...emptyCounts(), ...saved.stash } };
  } catch { /* storage unavailable or corrupt: start fresh */ }
  return { stash: emptyCounts(), threshold: 2, history: [], setupDone: false };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    toast('Could not save — your browser is blocking storage.');
  }
}

keepUnreadable(STORAGE_KEY, (s) => !!s.stash);
const state = load();

// ---- Draft (unsaved) state --------------------------------------------------

let draft = { paid: emptyCounts(), change: emptyCounts() };
let stashDraft = null; // non-null while editing inventory counts

// ---- Rendering --------------------------------------------------------------

function stepperRow(d, count, { onChange, canAdd = true, note = '', noteClass = '' }) {
  const li = document.createElement('li');
  li.className = count === 0 ? 'zero' : '';
  li.innerHTML = `
    <div class="label"><strong>${d.label}</strong><small class="${noteClass}">${note}</small></div>
    <div class="stepper">
      <button type="button" aria-label="Remove one ${d.label}" ${count === 0 ? 'disabled' : ''}>−</button>
      <span class="count" aria-live="polite">${count}</span>
      <button type="button" aria-label="Add one ${d.label}" ${canAdd ? '' : 'disabled'}>+</button>
    </div>`;
  const [minus, plus] = li.querySelectorAll('button');
  minus.addEventListener('click', () => onChange(-1));
  plus.addEventListener('click', () => onChange(1));
  return li;
}

function renderBalance() {
  $('balance').textContent = formatCents(totalCents(state.stash));
  const low = lowDenominations(state.stash, state.threshold);
  const warn = $('low-warning');
  warn.hidden = low.length === 0 || !state.setupDone;
  warn.textContent = low.length <= 3
    ? `Running low: ${low.map((d) => d.label).join(', ')}`
    : `Running low on ${low.length} notes and coins — see Cash on hand`;
}

function renderSpend() {
  const amountCents = parseAmount($('amount').value);

  const paidList = $('paid-list');
  paidList.replaceChildren(...DENOMINATIONS.map((d) => {
    const have = state.stash[d.id];
    const used = draft.paid[d.id];
    return stepperRow(d, used, {
      canAdd: used < have,
      note: `${formatCents(d.cents)} each · ${have - used} left in stash`,
      noteClass: used > have ? 'over' : '',
      onChange: (delta) => { draft.paid[d.id] = Math.max(0, used + delta); renderSpend(); },
    });
  }));

  const changeList = $('change-list');
  changeList.replaceChildren(...DENOMINATIONS.map((d) => {
    const got = draft.change[d.id];
    return stepperRow(d, got, {
      note: `${formatCents(d.cents)} each`,
      onChange: (delta) => { draft.change[d.id] = Math.max(0, got + delta); renderSpend(); },
    });
  }));

  const r = checkTransaction({ amountCents, paid: draft.paid, change: draft.change, stash: state.stash });
  $('sum-amount').textContent = formatCents(amountCents ?? 0);
  $('sum-paid').textContent = formatCents(r.paidCents);
  $('sum-change').textContent = `−${formatCents(r.changeCents)}`;
  $('sum-change-row').hidden = r.changeCents === 0;
  $('sum-diff').textContent = formatCents(r.differenceCents, { sign: true });

  const status = $('status');
  const messages = {
    'no-amount': ['neutral', $('amount').value.trim() && amountCents == null
      ? 'That purchase amount doesn’t look right — use a number like 10.30.'
      : 'Enter the purchase amount to get started.'],
    'no-cash': ['neutral', 'Now add the notes and coins you took out of the stash.'],
    overdrawn: ['bad', 'You’ve selected more of a note or coin than you have in the stash.'],
    'too-much': ['warn', `Amount mismatch: you’ve selected ${formatCents(r.differenceCents)} too much cash. Remove some, or add the change you received.`],
    'too-little': ['warn', `Amount mismatch: you’re ${formatCents(-r.differenceCents)} short. Add more cash until the difference is $0.00.`],
    ok: ['ok', 'Amounts tally. Confirm to deduct this from your cash on hand.'],
  };
  const [tone, text] = messages[r.status];
  status.className = `status ${tone}`;
  status.textContent = text;
  $('confirm-tx').disabled = !r.canConfirm;
}

function renderStash() {
  const editing = stashDraft !== null;
  const counts = editing ? stashDraft : state.stash;
  const low = new Set(lowDenominations(state.stash, state.threshold).map((d) => d.id));

  $('stash-list').replaceChildren(...DENOMINATIONS.map((d) => {
    const n = counts[d.id];
    if (editing) {
      return stepperRow(d, n, {
        note: `${formatCents(d.cents)} each · ${formatCents(n * d.cents)}`,
        onChange: (delta) => { stashDraft[d.id] = Math.max(0, n + delta); renderStash(); },
      });
    }
    const li = document.createElement('li');
    li.className = n === 0 ? 'zero' : '';
    const isLow = low.has(d.id) && state.setupDone;
    li.innerHTML = `
      <div class="label"><strong>${d.label}</strong>
        <small class="${isLow ? 'low' : ''}">${formatCents(n * d.cents)}${isLow ? ' · running low' : ''}</small></div>
      <span class="count">${n}</span>`;
    return li;
  }));

  $('edit-stash').hidden = editing;
  $('stash-actions').hidden = !editing;
  const intro = state.setupDone
    ? 'Count what’s physically in the box.'
    : 'Welcome! Start by entering how many of each note and coin you have right now.';
  $('stash-hint').textContent = editing
    ? `${intro} Total: ${formatCents(totalCents(counts))}`
    : 'How many of each note and coin are in the petty cash box.';
  $('threshold').value = state.threshold;
}

function describeCounts(counts) {
  return DENOMINATIONS.filter((d) => counts[d.id]).map((d) => `${counts[d.id]} × ${d.label}`).join(', ');
}

function canUndo(entry) {
  if (entry.undone) return false;
  const reverted = revertedStash(entry);
  return DENOMINATIONS.every((d) => reverted[d.id] >= 0);
}

function revertedStash(entry) {
  if (entry.type === 'adjust') {
    // Undo the change in counts, keeping anything that happened since.
    const next = { ...state.stash };
    for (const d of DENOMINATIONS) next[d.id] += (entry.before[d.id] || 0) - (entry.after[d.id] || 0);
    return next;
  }
  return applyDelta(state.stash, entry.paid, entry.change, -1);
}

function renderHistory() {
  const list = $('history-list');
  $('history-empty').hidden = state.history.length > 0;
  list.replaceChildren(...state.history.map((entry) => {
    const li = document.createElement('li');
    li.className = entry.undone ? 'undone' : '';
    const when = new Date(entry.at).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' });
    let title, amount, detail;
    if (entry.type === 'adjust') {
      const delta = totalCents(entry.after) - totalCents(entry.before);
      title = entry.wasSetUp ? 'Counts adjusted' : 'Opening balance';
      amount = formatCents(delta, { sign: true });
      detail = `New total ${formatCents(totalCents(entry.after))}`;
    } else {
      title = entry.note || 'Purchase';
      amount = `−${formatCents(entry.amountCents)}`;
      detail = `Paid: ${describeCounts(entry.paid)}`
        + (totalCents(entry.change) ? ` · Change: ${describeCounts(entry.change)}` : '');
    }
    li.innerHTML = `
      <div class="top"><strong></strong><span class="amt">${amount}</span></div>
      <div class="meta">${when}${entry.undone ? ' · undone' : ''}</div>
      <div class="denom-detail">${detail}</div>`;
    li.querySelector('strong').textContent = title; // user-entered text
    if (!entry.undone) {
      const btn = document.createElement('button');
      btn.className = 'secondary small undo';
      btn.textContent = 'Undo';
      if (!canUndo(entry)) {
        btn.disabled = true;
        btn.title = 'Can’t undo: some of these notes or coins have since been spent.';
      }
      btn.addEventListener('click', () => undo(entry.id));
      li.append(btn);
    }
    return li;
  }));
}

function render() {
  renderBalance();
  renderSpend();
  renderStash();
  renderHistory();
  renderStats();
}

// ---- Stats ------------------------------------------------------------------

const PERIOD_TEXT = {
  '7d': ['Spent in the last 7 days', 'the previous 7 days'],
  '30d': ['Spent in the last 30 days', 'the previous 30 days'],
  month: ['Spent this month', 'the same days last month'],
  all: ['Spent in total', null],
};

// Whole dollars on axes and tiles once amounts get big, cents otherwise.
const shortMoney = (cents) => (cents >= 100000 ? `$${Math.round(cents / 100).toLocaleString('en-SG')}` : formatCents(cents));
const dayLabel = (d) => d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
const monthLabel = (d) => d.toLocaleDateString('en-SG', { month: 'short', year: '2-digit' });

// Round axis steps (1, 2, 2.5 or 5 × a power of ten) giving three gridlines above zero.
function niceMax(cents) {
  if (cents <= 0) return { max: 3000, step: 1000 }; // an empty chart still shows $0–$30
  const raw = cents / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((x) => x >= raw);
  return { max: step * 3, step };
}

function renderStats() {
  const period = document.querySelector('input[name="period"]:checked').value;
  const range = periodRange(period, state.history);
  const s = spendStats(state.history, range, { stash: state.stash });
  const [label, prevLabel] = PERIOD_TEXT[period];

  $('hero-label').textContent = label;
  $('hero-value').textContent = formatCents(s.total);
  const delta = $('hero-delta');
  delta.className = 'hero-delta';
  if (s.prevTotal == null) delta.textContent = s.count ? `since ${range.from.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}` : '';
  else if (!s.prevTotal) delta.textContent = s.total ? `nothing spent in ${prevLabel}` : '';
  else {
    const pct = Math.round(((s.total - s.prevTotal) / s.prevTotal) * 100);
    // Spending more is the direction to watch, so it gets the warning colour (and an arrow).
    delta.classList.add(pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat');
    delta.textContent = `${pct > 0 ? '▲' : pct < 0 ? '▼' : '='} ${Math.abs(pct)}% vs ${prevLabel} (${formatCents(s.prevTotal)})`;
  }

  const tiles = [
    ['Purchases', String(s.count)],
    ['Average purchase', s.count ? formatCents(s.average) : '–'],
    ['Cash on hand', shortMoney(s.onHand)],
    ['Lasts about', s.lastsDays == null ? '–' : `${s.lastsDays} day${s.lastsDays === 1 ? '' : 's'}`, 'at the last 30 days’ rate'],
  ];
  if (s.topUps.count) tiles.push(['Topped up', shortMoney(s.topUps.cents), `${s.topUps.count} time${s.topUps.count === 1 ? '' : 's'}`]);
  $('kpis').replaceChildren(...tiles.map(([k, v, note]) => {
    const div = document.createElement('div');
    div.innerHTML = '<dt></dt><dd></dd>';
    div.querySelector('dt').textContent = k;
    div.querySelector('dd').textContent = v;
    if (note) {
      const small = document.createElement('small');
      small.textContent = note;
      div.append(small);
    }
    return div;
  }));

  $('stats-empty').hidden = s.count > 0;
  renderTimeChart(s, range);
  renderHbars($('note-chart'), s.byNote.map((n) => ({
    label: n.note === null ? `Other (${n.other} notes)` : n.note || 'No note',
    value: n.cents,
    text: `${formatCents(n.cents)} · ${n.count}×`,
  })));
  renderHbars($('denom-chart'), s.denominations.map((d) => ({ label: d.label, value: d.count, text: `${d.count}×` })));
  $('biggest').replaceChildren(...s.biggest.map((e) => {
    const li = document.createElement('li');
    li.innerHTML = '<div class="top"><span></span><span class="amt"></span></div><div class="meta"></div>';
    li.querySelector('.top span').textContent = e.note || 'Purchase';
    li.querySelector('.amt').textContent = formatCents(e.amountCents);
    li.querySelector('.meta').textContent = new Date(e.at).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' });
    return li;
  }));
  for (const id of ['note-chart', 'denom-chart', 'biggest']) $(id).closest('.card').hidden = !s.count;
}

// Columns for each day (or month), on one baseline, with round gridlines; the tallest is
// labelled and every column shows its value on hover or focus, and in the table below.
function renderTimeChart(s, range) {
  const monthly = range.bucket === 'month';
  const buckets = monthly ? s.buckets.slice(-12) : s.buckets;
  $('time-title').textContent = monthly ? `Spending by month${s.buckets.length > 12 ? ' (last 12)' : ''}` : 'Spending by day';
  const peak = Math.max(0, ...buckets.map((b) => b.cents));
  const { max, step } = niceMax(peak);
  const chart = $('time-chart');
  const grid = [3, 2, 1, 0].map((i) => `<span class="grid" style="bottom:${(i * step / max) * 100}%"><i>${shortMoney(i * step)}</i></span>`).join('');
  const peakIndex = buckets.findIndex((b) => b.cents === peak && peak > 0);
  chart.innerHTML = `${grid}<div class="cols"></div><div class="xlabels"></div>`;
  const cols = chart.querySelector('.cols');
  buckets.forEach((b, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'col';
    const when = monthly ? monthLabel(b.date) : dayLabel(b.date);
    btn.dataset.tip = `${formatCents(b.cents)} · ${when}${b.count ? ` · ${b.count} purchase${b.count === 1 ? '' : 's'}` : ''}`;
    btn.setAttribute('aria-label', btn.dataset.tip);
    const bar = document.createElement('span');
    bar.className = 'bar';
    bar.style.height = `${(b.cents / max) * 100}%`;
    btn.append(bar);
    if (i === peakIndex) {
      const v = document.createElement('span');
      v.className = 'peak';
      v.style.bottom = `${(b.cents / max) * 100}%`;
      v.textContent = shortMoney(b.cents);
      btn.append(v);
    }
    cols.append(btn);
  });
  // A few x labels: first, middle and last.
  const xl = chart.querySelector('.xlabels');
  const pick = [...new Set([0, Math.floor((buckets.length - 1) / 2), buckets.length - 1])];
  xl.replaceChildren(...pick.map((i) => {
    const span = document.createElement('span');
    span.textContent = monthly ? monthLabel(buckets[i].date) : dayLabel(buckets[i].date);
    span.style.left = `${((i + 0.5) / buckets.length) * 100}%`;
    return span;
  }));
  // The same numbers as a table.
  const rows = buckets.filter((b) => b.count).map((b) => `<tr><td></td><td class="num"></td><td class="num">${b.count}</td></tr>`);
  const table = $('time-table');
  table.innerHTML = `<thead><tr><th>${monthly ? 'Month' : 'Day'}</th><th class="num">Spent</th><th class="num">Purchases</th></tr></thead><tbody>${rows.join('') || '<tr><td colspan="3">Nothing spent</td></tr>'}</tbody>`;
  buckets.filter((b) => b.count).forEach((b, i) => {
    const tr = table.tBodies[0].rows[i];
    tr.cells[0].textContent = monthly ? monthLabel(b.date) : dayLabel(b.date);
    tr.cells[1].textContent = formatCents(b.cents);
  });
}

// Horizontal bars, largest first, value at each bar's tip.
function renderHbars(list, rows) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  list.replaceChildren(...rows.map((r) => {
    const li = document.createElement('li');
    li.innerHTML = '<span class="hb-label"></span><span class="hb-track"><span class="hb-bar"></span><span class="hb-value"></span></span>';
    li.querySelector('.hb-label').textContent = r.label;
    // Scaled within the track minus room for the value, so every bar keeps its true proportion.
    li.querySelector('.hb-bar').style.width = `calc((100% - 5.5rem) * ${r.value / max})`;
    li.querySelector('.hb-value').textContent = r.text;
    return li;
  }));
}

// One tooltip for every column: shown on hover, focus or tap, positioned above the column.
function showTip(target) {
  const tip = $('chart-tip');
  tip.textContent = target.dataset.tip;
  tip.hidden = false;
  const r = target.getBoundingClientRect();
  const w = tip.offsetWidth;
  tip.style.left = `${Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8)}px`;
  tip.style.top = `${r.top + window.scrollY - tip.offsetHeight - 8}px`;
}
const hideTip = () => { $('chart-tip').hidden = true; };

// ---- Actions ----------------------------------------------------------------

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function resetDraft() {
  draft = { paid: emptyCounts(), change: emptyCounts() };
  $('amount').value = '';
  $('note').value = '';
  $('change-card').open = false;
}

function confirmPurchase() {
  const amountCents = parseAmount($('amount').value);
  const r = checkTransaction({ amountCents, paid: draft.paid, change: draft.change, stash: state.stash });
  if (!r.canConfirm) return; // only ever deduct when the amounts tally
  state.stash = applyDelta(state.stash, draft.paid, draft.change);
  state.history.unshift({
    id: newId(), type: 'purchase', at: new Date().toISOString(),
    note: $('note').value.trim(), amountCents, paid: { ...draft.paid }, change: { ...draft.change },
  });
  save();
  resetDraft();
  render();
  toast(`Purchase of ${formatCents(amountCents)} recorded.`);
}

function undo(id) {
  const entry = state.history.find((e) => e.id === id);
  if (!entry || !canUndo(entry)) return;
  if (!confirm('Undo this transaction and put the cash back?')) return;
  state.stash = revertedStash(entry);
  entry.undone = true;
  save();
  render();
  toast('Transaction undone.');
}

function startEditStash() {
  stashDraft = { ...state.stash };
  renderStash();
}

function saveStash() {
  const before = { ...state.stash };
  const changed = DENOMINATIONS.some((d) => before[d.id] !== stashDraft[d.id]);
  if (changed) {
    state.history.unshift({
      id: newId(), type: 'adjust', at: new Date().toISOString(),
      before, after: { ...stashDraft }, wasSetUp: state.setupDone,
    });
    state.stash = stashDraft;
  }
  const firstSetup = !state.setupDone;
  state.setupDone = true;
  stashDraft = null;
  save();
  render();
  if (firstSetup) switchTab('spend');
  toast(changed ? 'Counts saved.' : 'No changes.');
}

// ---- Wiring -----------------------------------------------------------------

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { hideTip(); switchTab(b.dataset.tab); }));
document.querySelectorAll('input[name="period"]').forEach((r) => r.addEventListener('change', () => { hideTip(); renderStats(); }));
for (const type of ['pointerover', 'focusin', 'click']) {
  $('time-chart').addEventListener(type, (e) => { const c = e.target.closest('.col'); if (c) showTip(c); });
}
$('time-chart').addEventListener('pointerleave', hideTip);
$('time-chart').addEventListener('focusout', hideTip);
$('export-csv').addEventListener('click', () => {
  if (!state.history.length) return toast('No transactions to export yet.');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([historyCsv(state.history)], { type: 'text/csv' }));
  a.download = `petty-cash-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
});
$('amount').addEventListener('input', renderSpend);
$('reset-tx').addEventListener('click', () => { resetDraft(); renderSpend(); });
$('confirm-tx').addEventListener('click', confirmPurchase);
$('edit-stash').addEventListener('click', startEditStash);
$('cancel-stash').addEventListener('click', () => { stashDraft = null; renderStash(); });
$('save-stash').addEventListener('click', saveStash);
$('threshold').addEventListener('change', (e) => {
  state.threshold = Math.max(0, Math.floor(Number(e.target.value) || 0));
  save();
  render();
});

// ---- Theme: modern or Windows 95 ---------------------------------------------

const THEME_KEY = 'petty-cash-theme';

function applyTheme(theme) {
  const win95 = theme === 'win95';
  document.documentElement.classList.toggle('theme-win95', win95);
  $('theme-toggle').textContent = win95 ? '✨ Modern' : '🖥️ Win 95';
  $('theme-toggle').setAttribute('aria-label', win95 ? 'Switch to modern theme' : 'Switch to Windows 95 theme');
  document.querySelector('meta[name="theme-color"]').content = win95 ? '#000080' : '#0f766e';
}

function updateClock() {
  $('win-clock').textContent = new Date().toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit' });
}

$('theme-toggle').addEventListener('click', () => {
  const next = document.documentElement.classList.contains('theme-win95') ? 'modern' : 'win95';
  try { localStorage.setItem(THEME_KEY, next); } catch { /* theme just won't be remembered */ }
  applyTheme(next);
});
applyTheme(document.documentElement.classList.contains('theme-win95') ? 'win95' : 'modern');
updateClock();
setInterval(updateClock, 15000);

render();
if (!state.setupDone) {
  // First run: start with the opening balance setup.
  switchTab('stash');
  startEditStash();
}
