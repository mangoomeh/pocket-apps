import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGES, newJob, moveStage, isActive, needsFollowUp, upcoming, relDay, stats, matches, sortJobs, toCsv, safeUrl,
  addDays, daysBetween, firstReply,
} from '../src/jobs.js';

const T = '2026-10-31';

test('a new application starts as applied today, or on the wishlist with no date', () => {
  const j = newJob({ company: 'Grab', role: 'Designer' }, T, 'a');
  assert.equal(j.stage, 'applied');
  assert.equal(j.applied, T);
  assert.deepEqual(j.history, [{ stage: 'applied', date: T }]);
  const w = newJob({ company: 'Shopee', stage: 'wishlist' }, T, 'b');
  assert.equal(w.applied, '');
  assert.equal(new Set(STAGES.map((s) => s.id)).size, STAGES.length);
});

test('moving stages keeps a history, sets the applied date and clears steps once closed', () => {
  const j = newJob({ company: 'DBS', stage: 'wishlist' }, '2026-10-01', 'a');
  moveStage(j, 'applied', '2026-10-03');
  assert.equal(j.applied, '2026-10-03');
  j.nextStep = 'Phone screen'; j.nextDate = '2026-10-10';
  moveStage(j, 'interview', '2026-10-08');
  assert.equal(firstReply(j), '2026-10-08');
  assert.ok(isActive(j));
  moveStage(j, 'rejected', '2026-10-20');
  assert.ok(!isActive(j));
  assert.equal(j.nextDate, '');
  assert.deepEqual(j.history.map((h) => h.stage), ['wishlist', 'applied', 'interview', 'rejected']);
  moveStage(j, 'rejected', '2026-10-21');
  assert.equal(j.history.length, 4, 'the same stage again is not a move');
});

test('follow-up nudges and upcoming steps', () => {
  const old = newJob({ company: 'A', applied: '2026-10-10' }, T, 'a');
  const recent = newJob({ company: 'B', applied: '2026-10-25' }, T, 'b');
  assert.ok(needsFollowUp(old, T));
  assert.ok(!needsFollowUp(recent, T));
  const planned = newJob({ company: 'C', applied: '2026-10-01', nextStep: 'Interview', nextDate: '2026-11-02' }, T, 'c');
  assert.ok(!needsFollowUp(planned, T), 'a planned step means no nudge');
  const late = newJob({ company: 'D', nextStep: 'Send portfolio', nextDate: '2026-10-29' }, T, 'd');
  const closed = moveStage(newJob({ company: 'E', nextDate: '2026-11-01' }, T, 'e'), 'rejected', T);
  const u = upcoming([planned, late, closed, old], T);
  assert.deepEqual(u.map((x) => [x.job.company, x.when, x.inDays]), [['D', 'overdue', -2], ['C', 'soon', 2]]);
});

test('relative days read naturally', () => {
  assert.equal(relDay(T, T), 'today');
  assert.equal(relDay('2026-10-30', T), 'yesterday');
  assert.equal(relDay('2026-11-01', T), 'tomorrow');
  assert.equal(relDay('2026-10-26', T), '5 days ago');
  assert.equal(relDay('2026-10-10', T), '3 weeks ago');
  assert.equal(relDay('2026-11-04', T), 'in 4 days');
  assert.equal(relDay('', T), '');
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(daysBetween('2026-02-27', '2026-03-01'), 2);
});

test('stats count from applications sent, and remember how far each got', () => {
  const mk = (company, stages, applied = '2026-10-01') => {
    const j = newJob({ company, applied }, applied, company);
    stages.forEach(([s, d]) => moveStage(j, s, d));
    return j;
  };
  const jobs = [
    newJob({ company: 'W', stage: 'wishlist' }, T, 'w'),
    mk('A', []),
    mk('B', [['interview', '2026-10-05']]),
    mk('C', [['interview', '2026-10-09'], ['rejected', '2026-10-20']]),
    mk('D', [['interview', '2026-10-03'], ['offer', '2026-10-15']]),
    mk('E', [['rejected', '2026-10-12']], '2026-10-27'),
  ];
  const s = stats(jobs, T);
  assert.equal(s.total, 6);
  assert.equal(s.sent, 5);
  assert.equal(s.active, 4);
  assert.deepEqual(s.funnel.map((f) => f.n), [5, 3, 1], 'a rejection after an interview still counts as reaching it');
  assert.equal(s.replyRate, 80);
  assert.equal(s.interviewRate, 60);
  assert.equal(s.offerRate, 20);
  assert.equal(s.medianReplyDays, 4, 'waits of 2, 4, 8 and −15 (ignored) days');
  assert.equal(s.thisWeek, 1);
  assert.equal(stats([], T).replyRate, 0);
  assert.equal(stats([], T).medianReplyDays, null);
});

test('search, sorting and the CSV export', () => {
  const a = newJob({ company: 'Grab', role: 'Product Designer', notes: 'Referral from Mei' }, '2026-10-20', 'a');
  const b = moveStage(newJob({ company: 'Sea, Ltd', role: 'Engineer "L4"' }, '2026-10-01', 'b'), 'interview', '2026-10-25');
  const c = newJob({ company: 'Zendesk', stage: 'wishlist' }, '2026-10-30', 'c');
  assert.ok(matches(a, 'mei'));
  assert.ok(matches(a, 'DESIGN'));
  assert.ok(!matches(a, 'engineer'));
  assert.deepEqual(sortJobs([c, a, b]).map((j) => j.id), ['b', 'a', 'c']);
  const csv = toCsv([b]);
  assert.equal(csv.split('\r\n')[0], 'Company,Role,Stage,Applied,Location,Salary,Next step,Next date,Contact,Link,Notes');
  assert.match(csv, /^"Sea, Ltd","Engineer ""L4""",Interviewing,2026-10-01,/m);
});

test('links are only ever http(s)', () => {
  assert.equal(safeUrl('careers.grab.com/jobs/1'), 'https://careers.grab.com/jobs/1');
  assert.equal(safeUrl('http://x.com'), 'http://x.com');
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl(''), '');
});
