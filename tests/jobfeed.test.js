import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromMcf, mergeFeed, looksLikeSoftware, titleCase, filterFeed, salaryText, toTracker } from '../src/jobfeed.js';
import { newJob } from '../src/jobs.js';

// A real MyCareersFuture result (descriptions trimmed).
const real = JSON.parse(readFileSync(new URL('./fixtures/mcf-job.json', import.meta.url), 'utf8'));
const variant = (over) => ({ ...real, ...over, metadata: { ...real.metadata, ...over.metadata } });

test('a MyCareersFuture job becomes a small record', () => {
  const j = fromMcf(real);
  assert.equal(j.id, real.uuid);
  assert.equal(j.title, 'Software Engineer');
  assert.equal(j.company, 'Corvanta Trading Pte. Ltd.');
  assert.deepEqual([j.min, j.max], [4300, 7000]);
  assert.equal(j.posted, '2026-11-09');
  assert.match(j.url, /^https:\/\/www\.mycareersfuture\.gov\.sg\/job\//);
  assert.ok(j.skills.length <= 8 && j.level.length && j.types.length);
  assert.equal(JSON.stringify(j).length < 900, true, 'small enough for a daily feed of hundreds');
});

test('hidden salaries and names stay hidden; overseas, non-software and odd links are left out', () => {
  assert.deepEqual([fromMcf(variant({ metadata: { isHideSalary: true } })).min], [null]);
  assert.equal(fromMcf(variant({ metadata: { isHideEmployerName: true } })).company, '');
  assert.equal(fromMcf(variant({ salary: { minimum: 30, maximum: 40, type: { salaryType: 'Hourly' } } })).max, null);
  assert.equal(fromMcf(variant({ address: { ...real.address, isOverseas: true } })), null);
  assert.equal(fromMcf(variant({ title: 'Project Engineer (HVAC / ACMV)' })), null);
  assert.equal(fromMcf(variant({ metadata: { jobDetailsUrl: 'javascript:alert(1)' } })), null);
  assert.equal(fromMcf({}), null);
  for (const t of ['Senior Backend Engineer (Go)', 'Full-Stack Developer', 'SRE', 'DevOps Engineer', 'Machine Learning Engineer']) assert.ok(looksLikeSoftware(t), t);
  for (const t of ['Sales Engineer', 'M&E Engineer', 'Service Engineer (Data Center)', 'Civil Engineer']) assert.ok(!looksLikeSoftware(t), t);
  assert.equal(titleCase('ACME (ASIA) PTE. LTD.'), 'Acme (Asia) Pte. Ltd.');
  assert.equal(titleCase('Grab Holdings'), 'Grab Holdings', 'mixed case is kept');
});

test('merging searches keeps one of each, newest first', () => {
  const a = variant({ uuid: 'a', metadata: { newPostingDate: '2026-11-01' } });
  const b = variant({ uuid: 'b', metadata: { newPostingDate: '2026-11-05' } });
  const feed = mergeFeed([[a, b], [b, variant({ uuid: 'c', title: 'Sales Executive' })]]);
  assert.deepEqual(feed.map((j) => j.id), ['b', 'a']);
  assert.equal(mergeFeed([[a, b]], 1).length, 1);
});

test('searching, filtering and saving to the tracker', () => {
  const base = fromMcf(real);
  const jobs = [
    { ...base, id: '1', title: 'Backend Engineer', skills: ['Go', 'Kubernetes'], min: 6000, max: 9000, level: ['Professional'] },
    { ...base, id: '2', title: 'Frontend Developer', skills: ['React'], min: 3500, max: 4500, level: ['Fresh/entry level'] },
    { ...base, id: '3', title: 'Engineering Manager', skills: [], min: null, max: null, level: ['Senior Management'] },
  ];
  assert.deepEqual(filterFeed(jobs, { query: 'kubernetes' }).map((j) => j.id), ['1']);
  assert.deepEqual(filterFeed(jobs, { query: 'corvanta react' }).map((j) => j.id), ['2'], 'company and skills match');
  assert.deepEqual(filterFeed(jobs, { minSalary: 5000 }).map((j) => j.id), ['1'], 'no salary means no match');
  assert.deepEqual(filterFeed(jobs, { level: 'entry' }).map((j) => j.id), ['2']);
  assert.deepEqual(filterFeed(jobs, { level: 'lead' }).map((j) => j.id), ['3']);
  assert.equal(salaryText(jobs[0]), '$6k–9k');
  assert.equal(salaryText({ min: 4300, max: 7000 }), '$4.3k–7k');
  assert.equal(salaryText(jobs[2]), '');
  const t = toTracker(jobs[0]);
  assert.equal(t.stage, 'wishlist');
  assert.equal(t.salary, '$6k–9k/month');
  assert.match(t.notes, /Skills: Go, Kubernetes/);
  const tracked = newJob(t, '2026-11-09', 'x');
  assert.deepEqual([tracked.stage, tracked.link, tracked.role], ['wishlist', jobs[0].url, 'Backend Engineer']);
});
