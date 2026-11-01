// Spending: expenses by category against a monthly budget. Money is in integer cents and
// dates are local 'YYYY-MM-DD' strings. A "month" can start on any day (e.g. payday, the 25th).

export { parseAmount, formatCents } from './cash.js';

export const CATEGORIES = [
  { id: 'food', name: 'Food', emoji: '🍜' },
  { id: 'groceries', name: 'Groceries', emoji: '🛒' },
  { id: 'transport', name: 'Transport', emoji: '🚇' },
  { id: 'shopping', name: 'Shopping', emoji: '🛍️' },
  { id: 'bills', name: 'Bills', emoji: '🧾' },
  { id: 'home', name: 'Home', emoji: '🏠' },
  { id: 'health', name: 'Health', emoji: '💊' },
  { id: 'fun', name: 'Fun', emoji: '🎬' },
  { id: 'travel', name: 'Travel', emoji: '✈️' },
  { id: 'other', name: 'Other', emoji: '📦' },
];

export const allCategories = (custom = []) => [...CATEGORIES.slice(0, -1), ...custom, CATEGORIES[CATEGORIES.length - 1]];
export const categoryOf = (id, custom = []) => allCategories(custom).find((c) => c.id === id) || { id, name: 'Other', emoji: '📦' };

// ---- Dates ---------------------------------------------------------------------------------

const pad = (n) => String(n).padStart(2, '0');
export const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`; // m is 1-12
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export function localIso(date = new Date()) {
  return iso(date.getFullYear(), date.getMonth() + 1, date.getDate());
}
const parts = (s) => s.split('-').map(Number);
export function addDays(s, n) {
  const [y, m, d] = parts(s);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
export const daysBetween = (a, b) => {
  const [y1, m1, d1] = parts(a);
  const [y2, m2, d2] = parts(b);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5);
};
const monthStart = (y, m, startDay) => iso(y, m, Math.min(startDay, daysInMonth(y, m)));
const shiftMonth = (y, m, n) => { const t = y * 12 + (m - 1) + n; return [Math.floor(t / 12), (t % 12) + 1]; };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = MONTHS.map((m) => m.slice(0, 3));

// The budget month containing `date`: { start, end } inclusive, `days` long, named by the
// calendar month it starts in (so with payday on the 25th, 25 Oct – 24 Nov is "October").
export function periodOf(date, startDay = 1) {
  const [y, m] = parts(date);
  let [sy, sm] = [y, m];
  if (date < monthStart(y, m, startDay)) [sy, sm] = shiftMonth(y, m, -1);
  const start = monthStart(sy, sm, startDay);
  const [ny, nm] = shiftMonth(sy, sm, 1);
  const end = addDays(monthStart(ny, nm, startDay), -1);
  return { start, end, days: daysBetween(start, end) + 1, key: `${sy}-${pad(sm)}`, startDay };
}

export function shiftPeriod(period, n) {
  const [y, m] = parts(period.key);
  const [sy, sm] = shiftMonth(y, m, n);
  return periodOf(monthStart(sy, sm, period.startDay), period.startDay);
}

export function periodLabel(period) {
  const [y, m] = parts(period.key);
  if (period.startDay === 1) return `${MONTHS[m - 1]} ${y}`;
  const [, em, ed] = parts(period.end);
  const [, , sd] = parts(period.start);
  return `${sd} ${SHORT[m - 1]} – ${ed} ${SHORT[em - 1]}`;
}

export const shortDate = (s) => { const [, m, d] = parts(s); return `${d} ${SHORT[m - 1]}`; };

export function dayLabel(s, today) {
  if (s === today) return 'Today';
  if (s === addDays(today, -1)) return 'Yesterday';
  const [y, m, d] = parts(s);
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${wd} ${d} ${SHORT[m - 1]}${y !== parts(today)[0] ? ` ${y}` : ''}`;
}

// ---- Totals ----------------------------------------------------------------------------------

export const inPeriod = (expenses, p) => expenses.filter((e) => e.date >= p.start && e.date <= p.end);
export const total = (expenses) => expenses.reduce((s, e) => s + e.cents, 0);

// Where the month stands against the budget. `today` decides how much of the month has gone:
// a past month is all gone, a future one not started.
export function monthSummary(expenses, budgetCents, period, today) {
  const spent = total(inPeriod(expenses, period));
  const elapsed = today < period.start ? 0 : today > period.end ? period.days : daysBetween(period.start, today) + 1;
  const daysLeft = period.days - elapsed + (today >= period.start && today <= period.end ? 1 : 0); // today still counts
  const s = { spent, budget: budgetCents || 0, elapsed, daysLeft, days: period.days, current: today >= period.start && today <= period.end };
  s.projected = elapsed ? Math.round((spent / elapsed) * period.days) : spent;
  if (!s.budget) return { ...s, left: 0, pct: 0, pacePct: 0, perDay: 0, status: 'none' };
  s.left = s.budget - spent;
  s.pct = spent / s.budget;
  s.pacePct = elapsed / period.days;
  s.perDay = s.left > 0 && daysLeft > 0 ? Math.floor(s.left / daysLeft) : 0;
  // Over budget; ahead of an even pace (and on course to overrun) is worth a warning.
  s.status = s.left < 0 ? 'over' : s.current && s.pct > s.pacePct + 0.05 && s.projected > s.budget ? 'watch' : 'ok';
  return s;
}

// Spending per category, biggest first, with each category's budget where one is set.
// Categories with a budget but no spending yet are listed too.
export function byCategory(expenses, catBudgets = {}) {
  const sums = {};
  for (const e of expenses) sums[e.cat] = (sums[e.cat] || 0) + e.cents;
  for (const [id, b] of Object.entries(catBudgets)) if (b > 0 && !(id in sums)) sums[id] = 0;
  return Object.entries(sums)
    .map(([cat, cents]) => ({ cat, cents, budget: catBudgets[cat] || 0 }))
    .sort((a, b) => b.cents - a.cents || b.budget - a.budget || a.cat.localeCompare(b.cat));
}

// Running total for each day of the period (up to `today` for the current month).
export function cumulative(expenses, period, today) {
  const perDay = new Array(period.days).fill(0);
  for (const e of inPeriod(expenses, period)) perDay[daysBetween(period.start, e.date)] += e.cents;
  const upto = today < period.start ? 0 : today > period.end ? period.days : daysBetween(period.start, today) + 1;
  let run = 0;
  return perDay.slice(0, upto).map((c) => (run += c));
}

// Newest first, grouped by day with each day's total.
export function groupByDay(expenses) {
  const sorted = [...expenses].sort((a, b) => b.date.localeCompare(a.date) || (b.added || 0) - (a.added || 0));
  const days = [];
  for (const e of sorted) {
    if (days.at(-1)?.date !== e.date) days.push({ date: e.date, total: 0, items: [] });
    days.at(-1).items.push(e);
    days.at(-1).total += e.cents;
  }
  return days;
}

export function matches(e, query, custom = []) {
  const q = query.trim().toLowerCase();
  return !q || `${e.note || ''} ${categoryOf(e.cat, custom).name}`.toLowerCase().includes(q);
}

// ---- Repeating expenses ------------------------------------------------------------------------

// The expenses a monthly repeat owes up to `today`: one each month on its day (the last
// day in shorter months), from its first date. `rule.last` is the latest date already added,
// so an added one that you delete doesn't come back.
export function dueRepeats(rule, today) {
  const out = [];
  let [y, m] = parts(rule.from);
  for (let guard = 0; guard < 240; guard++, [y, m] = shiftMonth(y, m, 1)) {
    const date = iso(y, m, Math.min(rule.day, daysInMonth(y, m)));
    if (date > today) break;
    if (date >= rule.from && (!rule.last || date > rule.last)) out.push(date);
  }
  return out;
}

// Adds what every repeat owes; returns how many were added.
export function applyRepeats(state, today, makeId, now = Date.now()) {
  let n = 0;
  for (const r of state.repeats || []) {
    for (const date of dueRepeats(r, today)) {
      state.expenses.push({ id: makeId(), cents: r.cents, cat: r.cat, note: r.note, date, repeat: r.id, added: now });
      r.last = date;
      n++;
    }
  }
  return n;
}

// ---- Export -------------------------------------------------------------------------------------

export function toCsv(expenses, custom = []) {
  const q = (v) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = [...expenses].sort((a, b) => a.date.localeCompare(b.date)).map((e) => [
    e.date, (e.cents / 100).toFixed(2), categoryOf(e.cat, custom).name, e.note || '', e.repeat ? 'Monthly' : '',
  ].map((v) => q(String(v))).join(','));
  return ['Date,Amount,Category,Note,Repeats', ...rows].join('\r\n');
}
