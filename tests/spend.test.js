import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  periodOf, shiftPeriod, periodLabel, monthSummary, byCategory, cumulative, groupByDay, dueRepeats, applyRepeats, toCsv,
  dayLabel, allCategories, categoryOf, parseAmount,
} from '../src/spend.js';

const ex = (date, cents, cat = 'food', note = '') => ({ id: `${date}-${cents}`, date, cents, cat, note });

test('calendar months, and months that start on payday', () => {
  const p = periodOf('2026-11-15');
  assert.deepEqual([p.start, p.end, p.days, p.key], ['2026-11-01', '2026-11-30', 30, '2026-11']);
  assert.equal(periodLabel(p), 'November 2026');
  const pay = periodOf('2026-11-10', 25);
  assert.deepEqual([pay.start, pay.end, pay.days, pay.key], ['2026-10-25', '2026-11-24', 31, '2026-10']);
  assert.equal(periodLabel(pay), '25 Oct – 24 Nov');
  assert.equal(periodOf('2026-11-25', 25).start, '2026-11-25');
  const late = periodOf('2027-02-28', 31);
  assert.deepEqual([late.start, late.end], ['2027-02-28', '2027-03-30'], 'the 31st falls on the last day of shorter months');
  assert.deepEqual([periodOf('2027-01-31', 31).start, periodOf('2027-01-31', 31).end], ['2027-01-31', '2027-02-27']);
  const next = shiftPeriod(periodOf('2026-12-03'), 1);
  assert.deepEqual([next.start, next.end], ['2027-01-01', '2027-01-31']);
  assert.equal(shiftPeriod(pay, -1).start, '2026-09-25');
});

test('budget summary: what is left, a daily allowance and a warning when ahead of pace', () => {
  const p = periodOf('2026-11-01');
  const spend = [ex('2026-11-02', 30000), ex('2026-11-08', 20000), ex('2026-10-30', 99999), ex('2026-12-01', 99999)];
  const s = monthSummary(spend, 200000, p, '2026-11-10');
  assert.equal(s.spent, 50000);
  assert.equal(s.left, 150000);
  assert.equal(s.elapsed, 10);
  assert.equal(s.daysLeft, 21, 'today still counts');
  assert.equal(s.perDay, Math.floor(150000 / 21));
  assert.equal(s.projected, 150000);
  assert.equal(s.status, 'ok');
  assert.equal(monthSummary(spend, 120000, p, '2026-11-10').status, 'watch', '$500 by day 10 is on course for $1,500');
  assert.equal(monthSummary(spend, 40000, p, '2026-11-10').status, 'over');
  const past = monthSummary(spend, 200000, p, '2026-12-05');
  assert.deepEqual([past.elapsed, past.daysLeft, past.perDay, past.status], [30, 0, 0, 'ok']);
  const none = monthSummary(spend, 0, p, '2026-11-10');
  assert.equal(none.status, 'none');
  assert.equal(monthSummary([], 100, periodOf('2026-12-01'), '2026-11-10').daysLeft, 31, 'a month not started yet');
});

test('categories: biggest first, with budgets, and your own categories', () => {
  const rows = byCategory([ex('2026-11-01', 500, 'food'), ex('2026-11-02', 900, 'transport'), ex('2026-11-03', 700, 'food')], { fun: 5000, food: 1000 });
  assert.deepEqual(rows.map((r) => [r.cat, r.cents, r.budget]), [['food', 1200, 1000], ['transport', 900, 0], ['fun', 0, 5000]]);
  const mine = [{ id: 'c-kids', name: 'Kids', emoji: '🧸' }];
  assert.equal(allCategories(mine).at(-1).id, 'other', 'Other stays last');
  assert.equal(categoryOf('c-kids', mine).name, 'Kids');
  assert.equal(categoryOf('gone').name, 'Other');
  assert.equal(parseAmount('12.5'), 1250);
});

test('running totals for the chart and history grouped by day', () => {
  const p = periodOf('2026-11-01');
  const spend = [ex('2026-11-01', 100), ex('2026-11-03', 250), ex('2026-11-03', 50), ex('2026-11-20', 999)];
  assert.deepEqual(cumulative(spend, p, '2026-11-04'), [100, 100, 400, 400]);
  assert.equal(cumulative(spend, p, '2026-12-09').length, 30);
  assert.equal(cumulative(spend, p, '2026-10-09').length, 0);
  const days = groupByDay(spend);
  assert.deepEqual(days.map((d) => [d.date, d.total, d.items.length]), [['2026-11-20', 999, 1], ['2026-11-03', 300, 2], ['2026-11-01', 100, 1]]);
  assert.equal(dayLabel('2026-11-03', '2026-11-03'), 'Today');
  assert.equal(dayLabel('2026-11-02', '2026-11-03'), 'Yesterday');
  assert.equal(dayLabel('2026-11-01', '2026-11-03'), 'Sun 1 Nov');
  assert.equal(dayLabel('2025-12-25', '2026-11-03'), 'Thu 25 Dec 2025');
});

test('monthly repeats are added once each month, on their day or the month end', () => {
  const rule = { id: 'r', cents: 1599, cat: 'bills', note: 'Netflix', day: 31, from: '2026-10-31' };
  assert.deepEqual(dueRepeats(rule, '2027-01-15'), ['2026-10-31', '2026-11-30', '2026-12-31']);
  assert.deepEqual(dueRepeats({ ...rule, day: 1, from: '2026-11-05' }, '2027-01-15'), ['2026-12-01', '2027-01-01'], 'starts from its first date');
  const state = { expenses: [], repeats: [rule] };
  let n = 0;
  assert.equal(applyRepeats(state, '2026-12-01', () => `id${++n}`), 2);
  assert.equal(applyRepeats(state, '2026-12-20', () => `id${++n}`), 0, 'nothing twice');
  state.expenses.pop();
  assert.equal(applyRepeats(state, '2026-12-20', () => `id${++n}`), 0, 'a deleted one stays deleted');
  assert.equal(applyRepeats(state, '2026-12-31', () => `id${++n}`), 1);
  assert.deepEqual(state.expenses.map((e) => [e.date, e.note, e.repeat]), [['2026-10-31', 'Netflix', 'r'], ['2026-12-31', 'Netflix', 'r']]);
});

test('CSV export', () => {
  const csv = toCsv([{ ...ex('2026-11-02', 1250, 'food', 'Lunch, with "Ann"'), repeat: '' }, { ...ex('2026-11-01', 5, 'bills', ''), repeat: 'r' }]);
  assert.equal(csv, 'Date,Amount,Category,Note,Repeats\r\n2026-11-01,0.05,Bills,,Monthly\r\n2026-11-02,12.50,Food,"Lunch, with ""Ann""",');
});
