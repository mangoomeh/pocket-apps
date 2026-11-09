// Fetches software jobs in Singapore from MyCareersFuture and writes the feed the Job Tracker's
// "Find jobs" tab reads. Run by .github/workflows/data.yml once a day:
//   node tools/fetch-jobs.mjs out/jobs.json
// Requests go one at a time with a pause between them, so the load on the site stays light.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { SEARCHES, mergeFeed } from '../src/jobfeed.js';

const API = 'https://api.mycareersfuture.gov.sg/v2/jobs';
const PAGE = 100;
const PAGES = 2; // the newest 200 for each search
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function search(term, page) {
  const url = `${API}?search=${encodeURIComponent(term)}&limit=${PAGE}&page=${page}&sortBy=new_posting_date`;
  const res = await fetch(url, { headers: { 'User-Agent': 'pocket-apps job feed (github.com/mangoomeh/pocket-apps)', Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} for "${term}" page ${page}`);
  const data = await res.json();
  return Array.isArray(data.results) ? data.results : [];
}

const out = process.argv[2] || 'out/jobs.json';
const lists = [];
let failures = 0;
for (const term of SEARCHES) {
  for (let page = 0; page < PAGES; page++) {
    try {
      const results = await search(term, page);
      lists.push(results);
      if (results.length < PAGE) break;
    } catch (e) {
      failures++;
      console.warn(`skipped: ${e.message}`);
    }
    await pause(1000);
  }
}
const jobs = mergeFeed(lists);
// A run where most searches failed shouldn't replace a good feed with a thin one.
if (!jobs.length || failures > SEARCHES.length) {
  console.error(`Only ${jobs.length} jobs with ${failures} failed requests; not writing the feed.`);
  process.exit(1);
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ source: 'MyCareersFuture', fetchedAt: new Date().toISOString(), jobs }));
console.log(`Wrote ${jobs.length} jobs to ${out}`);
