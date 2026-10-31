// Pure logic for the job application tracker. Dates are local ISO days ("2026-10-31"),
// so "applied 5 days ago" and "due today" follow the phone's own calendar.

export const STAGES = [
  { id: 'wishlist', name: 'Wishlist', icon: '⭐', hint: 'Want to apply' },
  { id: 'applied', name: 'Applied', icon: '📨', hint: 'Waiting to hear back' },
  { id: 'interview', name: 'Interviewing', icon: '💬', hint: 'Talking to them' },
  { id: 'offer', name: 'Offer', icon: '🎉', hint: 'Got an offer' },
  { id: 'accepted', name: 'Accepted', icon: '✅', hint: 'Taking it' },
  { id: 'rejected', name: 'Rejected', icon: '✖️', hint: 'They said no' },
  { id: 'withdrawn', name: 'Withdrawn', icon: '↩️', hint: 'You stepped back' },
  { id: 'ghosted', name: 'No reply', icon: '👻', hint: 'Never heard back' },
];

export const stage = (id) => STAGES.find((s) => s.id === id) || STAGES[0];
export const CLOSED = new Set(['accepted', 'rejected', 'withdrawn', 'ghosted']);
export const isActive = (job) => !CLOSED.has(job.stage);

// How far along each stage is, for "got at least this far" in the stats.
const DEPTH = { wishlist: 0, applied: 1, ghosted: 1, withdrawn: 1, rejected: 1, interview: 2, offer: 3, accepted: 4 };

const DAY = 86400000;
const toDay = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY;
export const daysBetween = (from, to) => Math.round(toDay(to) - toDay(from));
export const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

export function localIso(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function addDays(iso, n) {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n));
  return d.toISOString().slice(0, 10);
}

// A new application. Applying today is the usual case, so that's the default stage.
export function newJob(fields, today, id) {
  const st = fields.stage || 'applied';
  return {
    id,
    company: '',
    role: '',
    location: '',
    link: '',
    salary: '',
    contact: '',
    notes: '',
    nextStep: '',
    nextDate: '',
    ...fields,
    stage: st,
    applied: fields.applied || (st === 'wishlist' ? '' : today),
    history: [{ stage: st, date: today }],
  };
}

// Moves a job to another stage and records when. Applying from the wishlist sets the
// applied date; a step that no longer applies (e.g. after a rejection) is cleared.
export function moveStage(job, to, today) {
  if (job.stage === to) return job;
  job.stage = to;
  job.history = [...(job.history || []), { stage: to, date: today }];
  if (to !== 'wishlist' && !job.applied) job.applied = today;
  if (CLOSED.has(to)) { job.nextStep = ''; job.nextDate = ''; }
  return job;
}

// The date a job first moved past "applied" (an interview, offer or rejection), if it did.
export function firstReply(job) {
  return (job.history || []).find((h) => ['interview', 'offer', 'accepted', 'rejected'].includes(h.stage))?.date || null;
}

// Applications that have waited long enough for a nudge: applied, nothing since, no step planned.
export function needsFollowUp(job, today, afterDays = 14) {
  return job.stage === 'applied' && !job.nextDate && isIsoDate(job.applied) && daysBetween(job.applied, today) >= afterDays;
}

// Planned next steps from active applications, soonest first, each marked overdue/today/soon.
export function upcoming(jobs, today) {
  return jobs
    .filter((j) => isActive(j) && isIsoDate(j.nextDate))
    .map((j) => {
      const inDays = daysBetween(today, j.nextDate);
      return { job: j, inDays, when: inDays < 0 ? 'overdue' : inDays === 0 ? 'today' : inDays <= 7 ? 'soon' : 'later' };
    })
    .sort((a, b) => a.inDays - b.inDays || a.job.company.localeCompare(b.job.company));
}

// "today", "yesterday", "5 days ago", "in 3 days", "3 weeks ago".
export function relDay(iso, today) {
  if (!isIsoDate(iso)) return '';
  const d = daysBetween(today, iso);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d === -1) return 'yesterday';
  const n = Math.abs(d);
  const unit = n >= 14 ? `${Math.round(n / 7)} weeks` : `${n} days`;
  return d > 0 ? `in ${unit}` : `${unit} ago`;
}

// The numbers behind the Stats tab. Rates are out of applications actually sent (not the
// wishlist), so they read as "of the jobs I applied to, how many replied".
export function stats(jobs, today) {
  const counts = Object.fromEntries(STAGES.map((s) => [s.id, 0]));
  for (const j of jobs) counts[j.stage] = (counts[j.stage] || 0) + 1;
  const sent = jobs.filter((j) => j.stage !== 'wishlist');
  const reached = (depth) => sent.filter((j) => Math.max(DEPTH[j.stage], ...(j.history || []).map((h) => DEPTH[h.stage] ?? 0)) >= depth).length;
  const replied = sent.filter((j) => firstReply(j));
  const waits = replied.filter((j) => isIsoDate(j.applied)).map((j) => daysBetween(j.applied, firstReply(j))).filter((d) => d >= 0).sort((a, b) => a - b);
  const median = waits.length ? (waits.length % 2 ? waits[(waits.length - 1) / 2] : Math.round((waits[waits.length / 2 - 1] + waits[waits.length / 2]) / 2)) : null;
  const pct = (n) => (sent.length ? Math.round((n / sent.length) * 100) : 0);
  const weekAgo = addDays(today, -6);
  return {
    total: jobs.length,
    active: jobs.filter(isActive).length,
    sent: sent.length,
    counts,
    funnel: [
      { label: 'Applied', n: sent.length },
      { label: 'Interview', n: reached(2) },
      { label: 'Offer', n: reached(3) },
    ],
    replyRate: pct(replied.length),
    interviewRate: pct(reached(2)),
    offerRate: pct(reached(3)),
    medianReplyDays: median,
    thisWeek: sent.filter((j) => isIsoDate(j.applied) && j.applied >= weekAgo && j.applied <= today).length,
  };
}

// Search across the text fields, case-insensitively.
export function matches(job, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [job.company, job.role, job.location, job.notes, job.contact, job.salary].some((f) => String(f || '').toLowerCase().includes(q));
}

// Active jobs first by what's most pressing (offers, interviews, then the rest), newest first within.
export function sortJobs(jobs) {
  const rank = { offer: 0, interview: 1, applied: 2, wishlist: 3, accepted: 4, rejected: 5, withdrawn: 6, ghosted: 7 };
  const last = (j) => (j.history || []).at(-1)?.date || j.applied || '';
  return [...jobs].sort((a, b) => rank[a.stage] - rank[b.stage] || last(b).localeCompare(last(a)) || a.company.localeCompare(b.company));
}

// A spreadsheet of everything, for Excel, Numbers or Google Sheets.
export function toCsv(jobs) {
  const cols = [['Company', 'company'], ['Role', 'role'], ['Stage', (j) => stage(j.stage).name], ['Applied', 'applied'],
    ['Location', 'location'], ['Salary', 'salary'], ['Next step', 'nextStep'], ['Next date', 'nextDate'],
    ['Contact', 'contact'], ['Link', 'link'], ['Notes', 'notes']];
  const cell = (v) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [cols.map(([h]) => h), ...jobs.map((j) => cols.map(([, k]) => (typeof k === 'function' ? k(j) : j[k])))];
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

// A link the user typed, made safe to open: only http(s), with https added when missing.
export function safeUrl(text) {
  const s = String(text || '').trim();
  if (!s) return '';
  const url = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  return /^https?:\/\//i.test(url) ? url : '';
}
