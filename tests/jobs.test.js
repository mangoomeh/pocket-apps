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

test('a next step becomes a calendar event, timed or all day', async () => {
  const { nextStepIcs, googleCalendarUrl } = await import('../src/jobs.js');
  const j = newJob({ company: 'Grab, Inc', role: 'Designer', location: 'One-North', nextStep: 'Final interview', nextDate: '2026-11-03', nextTime: '14:30', link: 'grab.com/jobs/1' }, T, 'j1');
  const ics = nextStepIcs(j, new Date('2026-10-31T01:02:03Z'));
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /\r\nDTSTART:20261103T143000\r\nDURATION:PT1H\r\n/);
  assert.match(ics, /\r\nSUMMARY:Final interview · Grab\\, Inc\r\n/);
  assert.match(ics, /TRIGGER:-PT1H/);
  assert.ok(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75), 'long lines are folded');
  const allDay = nextStepIcs({ ...j, nextTime: '' });
  assert.match(allDay, /DTSTART;VALUE=DATE:20261103\r\nDTEND;VALUE=DATE:20261104/);
  assert.doesNotMatch(allDay, /VALARM/);
  assert.equal(nextStepIcs({ ...j, nextDate: '' }), null);
  const g = new URL(googleCalendarUrl(j));
  assert.equal(g.searchParams.get('dates'), '20261103T143000/20261103T153000');
  assert.equal(g.searchParams.get('text'), 'Final interview · Grab, Inc');
  assert.match(g.searchParams.get('details'), /Job ad: https:\/\/grab\.com\/jobs\/1/);
  assert.equal(new URL(googleCalendarUrl({ ...j, nextTime: '23:30' })).searchParams.get('dates'), '20261103T233000/20261104T003000');
  assert.equal(new URL(googleCalendarUrl({ ...j, nextTime: '' })).searchParams.get('dates'), '20261103/20261104');
});

test('the question bank is complete, searchable and picks fresh questions to practise', async () => {
  const { QUESTIONS, CATEGORIES, questionList, pickPractice } = await import('../src/interview.js');
  assert.equal(new Set(QUESTIONS.map((q) => q.id)).size, QUESTIONS.length, 'ids are unique');
  assert.ok(QUESTIONS.length >= 45);
  for (const c of CATEGORIES) assert.ok(QUESTIONS.some((q) => q.cat === c.id), c.id);
  for (const q of QUESTIONS) assert.ok(CATEGORIES.some((c) => c.id === q.cat) && q.q.endsWith('?') || q.q.endsWith('.'), q.id);
  const custom = [{ id: 'my1', cat: 'behavioural', q: 'Why did you leave Acme?' }];
  assert.equal(questionList(custom, { cat: 'mine' }).length, 1);
  assert.equal(questionList(custom, { cat: 'behavioural' }).filter((q) => q.mine).length, 0, 'your own questions are a group of their own');
  assert.equal(questionList(custom, { cat: 'all' }).length, QUESTIONS.length + 1);
  assert.ok(questionList(custom, { query: 'salary' }).every((q) => /salary/i.test(q.q + q.tip)));
  assert.ok(questionList([], { cat: 'ask' }).every((q) => q.cat === 'ask'));
  const list = questionList([], { cat: 'practical' });
  const practised = Object.fromEntries(list.slice(1).map((q) => [q.id, true]));
  assert.equal(pickPractice(list, practised, null).id, list[0].id, 'unpractised first');
  assert.notEqual(pickPractice(list, practised, list[0].id).id, list[0].id, 'never the same twice');
  assert.equal(pickPractice([], {}), null);
});

test('prep: progress, stories and the checklist for one interview', async () => {
  const { QUESTIONS, MOST_ASKED, CORE, progressOf, storyQuestions, newStory, storyReady, storiesFor, prepSteps, interviewsToPrep, LOGISTICS } = await import('../src/interview.js');
  const ids = new Set(QUESTIONS.map((q) => q.id));
  for (const id of [...MOST_ASKED, ...CORE]) assert.ok(ids.has(id), id);
  assert.equal(MOST_ASKED.length, 10);
  const list = QUESTIONS.filter((q) => MOST_ASKED.includes(q.id));
  assert.deepEqual(progressOf(list, { 'intro-1': 'x', 'mot-1': '  ' }, { 'beh-1': true }), { total: 10, drafted: 1, practised: 1 });
  const sq = storyQuestions([{ id: 'my1', cat: 'intro', q: 'Why the switch?' }]);
  assert.ok(sq.some((q) => q.id === 'beh-1') && sq.some((q) => q.id === 'my1') && !sq.some((q) => q.id === 'prac-1'));
  const st = { ...newStory('s1'), title: 'Rescued launch', a: 'Re-planned', r: 'Shipped on time', qids: ['beh-1', 'beh-3'] };
  assert.ok(storyReady(st));
  assert.ok(!storyReady({ ...st, r: ' ' }));
  assert.deepEqual(storiesFor([st], 'beh-3').map((x) => x.id), ['s1']);
  const empty = prepSteps({}, {});
  assert.equal(empty.done, 0);
  assert.equal(empty.total, 6);
  const full = prepSteps(
    { research: 'Fintech, 3k staff', whyCompany: 'Mission', whyRole: 'Craft', stories: ['s1', 's2', 'gone'], ask: ['ask-1'], askOwn: 'How big is the team?\n', logistics: Object.fromEntries(LOGISTICS.map(([k]) => [k, true])) },
    { answers: Object.fromEntries(CORE.map((id) => [id, 'drafted'])), stories: [st, { ...st, id: 's2' }] },
  );
  assert.equal(full.done, 6);
  assert.equal(prepSteps({ stories: ['s1', 'gone'] }, { stories: [st] }).steps.find((x) => x.id === 'stories').done, false, 'deleted stories do not count');
  // Your own choice of questions replaces the six defaults.
  const picked = prepSteps({ qids: ['my1', 'beh-9'] }, { answers: { my1: 'yes' } }).steps.find((x) => x.id === 'core');
  assert.equal(picked.detail, '1 of 2 answers drafted');
  assert.equal(picked.done, false);
  assert.equal(prepSteps({ qids: ['my1'] }, { answers: { my1: 'yes' } }).steps.find((x) => x.id === 'core').done, true);
  assert.equal(prepSteps({ qids: [] }, {}).steps.find((x) => x.id === 'core').detail, 'None chosen yet');
  const T = '2026-10-31';
  const jobs = [
    { company: 'A', stage: 'interview', nextDate: '' },
    { company: 'B', stage: 'applied', nextStep: 'Phone screen', nextDate: '2026-11-02' },
    { company: 'C', stage: 'applied', nextStep: 'Send portfolio', nextDate: '2026-11-01' },
    { company: 'D', stage: 'interview', nextStep: 'Final round', nextDate: '2026-11-05' },
    { company: 'E', stage: 'rejected', nextDate: '2026-11-01' },
  ];
  assert.deepEqual(interviewsToPrep(jobs, T).map((j) => j.company), ['B', 'D', 'A']);
});
