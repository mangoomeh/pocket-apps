import { newId } from '../src/sync.js';
import {
  STAGES, CLOSED, stage, isActive, newJob, moveStage, needsFollowUp, upcoming, relDay, stats, matches, sortJobs, toCsv,
  safeUrl, localIso, isIsoDate, nextStepIcs, googleCalendarUrl,
} from '../src/jobs.js';
import { CATEGORIES as Q_CATS, QUESTIONS, STAR, questionList, pickPractice } from '../src/interview.js';
import { $, esc, switchTab, toast } from '../shared/ui.js';

const STORAGE_KEY = 'jobs-v1';
const FOLLOW_UP_DAYS = 14;

// ---- Persistent state -----------------------------------------------------------------

// Interview prep: your answers and "practised" marks by question id, and your own questions.
function freshPrep() {
  return { answers: {}, practised: {}, custom: [], cat: 'all' };
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.jobs)) return { filter: 'active', ...saved, prep: { ...freshPrep(), ...saved.prep } };
  } catch { /* storage unavailable or corrupt: start fresh */ }
  return { jobs: [], filter: 'active', prep: freshPrep() };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    toast('Could not save — your browser is blocking storage.');
  }
}

const state = load();
const today = () => localIso();
let query = '';
let editingId = null; // the job open in the sheet, or null for a new one
let pickedStage = 'applied';

// ---- Rendering --------------------------------------------------------------------------

function render() {
  renderHeader();
  renderFilters();
  renderList();
  renderUpcoming();
  renderPrep();
  renderStats();
}

function renderHeader() {
  const s = stats(state.jobs, today());
  const follow = state.jobs.filter((j) => needsFollowUp(j, today(), FOLLOW_UP_DAYS)).length;
  $('headline').textContent = `${s.active} active`;
  const bits = [
    s.counts.interview && `${s.counts.interview} interviewing`,
    s.counts.offer && `${s.counts.offer} offer${s.counts.offer === 1 ? '' : 's'}`,
    follow && `${follow} to follow up`,
  ].filter(Boolean);
  $('subline').textContent = state.jobs.length
    ? bits.join(' · ') || `${s.sent} applied so far`
    : "Every application, its next step and how it's going";
}

const FILTERS = [
  { id: 'active', name: 'Active', test: isActive },
  { id: 'wishlist', name: 'Wishlist', test: (j) => j.stage === 'wishlist' },
  { id: 'applied', name: 'Applied', test: (j) => j.stage === 'applied' },
  { id: 'interview', name: 'Interviewing', test: (j) => j.stage === 'interview' },
  { id: 'offer', name: 'Offers', test: (j) => j.stage === 'offer' },
  { id: 'followup', name: 'Follow up', test: (j) => needsFollowUp(j, today(), FOLLOW_UP_DAYS) },
  { id: 'closed', name: 'Closed', test: (j) => !isActive(j) },
  { id: 'all', name: 'All', test: () => true },
];
const filterOf = (id) => FILTERS.find((f) => f.id === id) || FILTERS[0];

function renderFilters() {
  $('filters').innerHTML = FILTERS.map((f) => {
    const n = state.jobs.filter(f.test).length;
    if (!n && !['active', 'all', state.filter].includes(f.id)) return '';
    return `<button class="jb-chip" data-filter="${f.id}" aria-pressed="${state.filter === f.id}">${f.name} <span>${n}</span></button>`;
  }).join('');
}

const CAL_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/></svg>';

// "14:30" as "2:30 pm".
function timeText(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`;
}

const badge = (company) => esc([...String(company).trim()][0]?.toUpperCase() || '?');
const pill = (id) => `<span class="jb-pill st-${id}">${stage(id).name}</span>`;

// What's next for a job, in one short line: a planned step, a nudge, or how long it's been.
function statusLine(j) {
  const t = today();
  if (j.nextStep || isIsoDate(j.nextDate)) {
    const when = isIsoDate(j.nextDate) ? `${relDay(j.nextDate, t)}${j.nextTime ? ` at ${timeText(j.nextTime)}` : ''}` : '';
    const late = isIsoDate(j.nextDate) && j.nextDate < t && isActive(j);
    return `<span class="${late ? 'jb-late' : 'jb-next-line'}">→ ${esc(j.nextStep || 'Next step')}${when ? ` · ${when}` : ''}</span>`;
  }
  if (needsFollowUp(j, t, FOLLOW_UP_DAYS)) return `<span class="jb-warn">Applied ${relDay(j.applied, t)} · follow up?</span>`;
  if (j.stage === 'wishlist') return 'Not applied yet';
  const last = (j.history || []).at(-1);
  if (!isActive(j) && last) return `${stage(j.stage).name} ${relDay(last.date, t)}`;
  return isIsoDate(j.applied) ? `Applied ${relDay(j.applied, t)}` : '';
}

function jobRow(j) {
  const sub = [j.company, j.location].filter(Boolean).map(esc).join(' · ');
  return `<li class="jb-row ${isActive(j) ? '' : 'closed'}" data-job="${esc(j.id)}" role="button" tabindex="0">
    <span class="jb-badge" aria-hidden="true">${badge(j.company)}</span>
    <div class="jb-main">
      <div class="jb-top"><strong>${esc(j.role || j.company)}</strong>${pill(j.stage)}</div>
      ${j.role ? `<div class="jb-sub">${sub}</div>` : j.location ? `<div class="jb-sub">${esc(j.location)}</div>` : ''}
      <div class="jb-meta">${statusLine(j)}</div>
    </div>
  </li>`;
}

function renderList() {
  const f = filterOf(state.filter);
  const list = sortJobs(state.jobs.filter((j) => f.test(j) && matches(j, query)));
  $('job-list').innerHTML = list.map(jobRow).join('');
  const follow = state.jobs.filter((j) => needsFollowUp(j, today(), FOLLOW_UP_DAYS)).length;
  $('nudge').hidden = !follow || state.filter === 'followup' || !!query;
  $('nudge').innerHTML = `<span aria-hidden="true">⏰</span><span>${follow} application${follow === 1 ? " hasn't" : "s haven't"} heard back in ${FOLLOW_UP_DAYS / 7} weeks. <b>Follow up?</b></span>`;
  // With nothing saved yet, the empty card's own button is the way in.
  $('search').closest('.card').hidden = !state.jobs.length;
  showAdd();
  $('empty').hidden = list.length > 0;
  $('job-list').hidden = !list.length;
  if (!state.jobs.length) {
    $('empty').innerHTML = `<p class="jb-empty-icon" aria-hidden="true">💼</p><p><b>No applications yet</b></p>
      <p class="hint">Add each job you apply for, or want to. You'll see what's next, who to chase, and how your search is going.</p>
      <div class="actions"><button class="primary" data-action="add">Add your first application</button></div>`;
  } else {
    $('empty').innerHTML = `<p class="hint">${query ? `Nothing matches “${esc(query)}”.` : `No applications here.`}</p>`;
  }
}

function renderUpcoming() {
  const t = today();
  const items = upcoming(state.jobs, t);
  const follow = sortJobs(state.jobs.filter((j) => needsFollowUp(j, t, FOLLOW_UP_DAYS)));
  const due = items.filter((x) => x.inDays <= 0).length;
  $('upcoming-count').hidden = !due;
  $('upcoming-count').textContent = due;
  const groups = [
    ['Overdue', items.filter((x) => x.when === 'overdue')],
    ['Today', items.filter((x) => x.when === 'today')],
    ['This week', items.filter((x) => x.when === 'soon')],
    ['Later', items.filter((x) => x.when === 'later')],
  ].filter(([, xs]) => xs.length);
  const stepRow = ({ job: j, inDays }) => `<li class="jb-row" data-job="${esc(j.id)}" role="button" tabindex="0">
      <span class="jb-date ${inDays < 0 ? 'late' : inDays === 0 ? 'now' : ''}" aria-hidden="true">
        <b>${new Date(`${j.nextDate}T12:00`).getDate()}</b>${new Date(`${j.nextDate}T12:00`).toLocaleDateString('en-SG', { month: 'short' })}
      </span>
      <div class="jb-main">
        <div class="jb-top"><strong>${esc(j.nextStep || 'Next step')}</strong></div>
        <div class="jb-sub">${esc([j.role, j.company].filter(Boolean).join(' · '))}</div>
        <div class="jb-meta">${relDay(j.nextDate, t)}${j.nextTime ? ` · ${timeText(j.nextTime)}` : ''}</div>
      </div>
      <button class="jb-cal-btn" data-cal="${esc(j.id)}" aria-label="Add ${esc(j.nextStep || 'next step')} to your calendar" title="Add to calendar">${CAL_ICON}</button>
    </li>`;
  let html = groups.map(([name, xs]) => `<div class="card"><h2>${name}</h2><ul class="jb-list">${xs.map(stepRow).join('')}</ul></div>`).join('');
  if (follow.length) {
    html += `<div class="card"><h2>Time to follow up</h2>
      <p class="hint">No reply after ${FOLLOW_UP_DAYS / 7} weeks. A short, polite email to the recruiter often gets things moving. Set a next step, or mark it as no reply.</p>
      <ul class="jb-list">${follow.map((j) => `<li class="jb-row" data-job="${esc(j.id)}" role="button" tabindex="0">
        <span class="jb-badge" aria-hidden="true">${badge(j.company)}</span>
        <div class="jb-main">
          <div class="jb-top"><strong>${esc(j.role || j.company)}</strong></div>
          <div class="jb-sub">${esc(j.role ? j.company : '')}${j.role ? ' · ' : ''}applied ${relDay(j.applied, t)}</div>
          <div class="jb-quick">
            <button class="secondary small" data-followed="${esc(j.id)}">I followed up</button>
            <button class="secondary small" data-ghost="${esc(j.id)}">No reply</button>
          </div>
        </div>
      </li>`).join('')}</ul></div>`;
  }
  $('upcoming').innerHTML = html || `<div class="card jb-empty"><p class="jb-empty-icon" aria-hidden="true">📅</p>
    <p><b>Nothing coming up</b></p><p class="hint">Give an application a next step and a date (an interview, a test, a follow-up) and it shows here.</p></div>`;
}

function renderStats() {
  const s = stats(state.jobs, today());
  if (!s.sent) {
    $('stats').innerHTML = `<div class="card jb-empty"><p class="jb-empty-icon" aria-hidden="true">📊</p>
      <p><b>No stats yet</b></p><p class="hint">Once you've applied for a few jobs, this shows how many reply, how many lead to interviews, and how long replies take.</p></div>`;
    return;
  }
  const tile = (value, label) => `<div class="jb-tile"><b>${value}</b><span>${label}</span></div>`;
  const max = Math.max(...s.funnel.map((f) => f.n), 1);
  const closed = STAGES.filter((st) => CLOSED.has(st.id) && s.counts[st.id]);
  $('stats').innerHTML = `
    <div class="jb-tiles">
      ${tile(s.sent, s.sent === 1 ? 'application sent' : 'applications sent')}
      ${tile(s.thisWeek, 'this week')}
      ${tile(`${s.replyRate}%`, 'got a reply')}
      ${tile(s.medianReplyDays == null ? '—' : `${s.medianReplyDays} d`, 'typical wait for a reply')}
    </div>
    <div class="card">
      <h2>How far applications get</h2>
      <ul class="jb-funnel">
        ${s.funnel.map((f) => `<li><span class="jb-f-label">${f.label}</span>
          <span class="jb-f-track"><span class="jb-f-bar" style="width:${Math.max(2, (f.n / max) * 100)}%"></span></span>
          <span class="jb-f-n">${f.n}${f.label === 'Applied' ? '' : ` <small>${Math.round((f.n / s.sent) * 100)}%</small>`}</span></li>`).join('')}
      </ul>
      <p class="hint">Out of applications sent. One that was rejected after an interview still counts as reaching the interview.</p>
    </div>
    <div class="card">
      <h2>Right now</h2>
      <dl class="summary">
        ${STAGES.filter((st) => !CLOSED.has(st.id)).map((st) => `<div><dt>${st.icon} ${st.name}</dt><dd>${s.counts[st.id]}</dd></div>`).join('')}
        ${closed.map((st) => `<div><dt>${st.icon} ${st.name}</dt><dd>${s.counts[st.id]}</dd></div>`).join('')}
      </dl>
    </div>`;
}

// ---- Interview prep -------------------------------------------------------------------------

let practiceId = null; // the question on the practice card
let showTip = false;
const openQs = new Set(); // questions expanded in the list, kept open across re-renders
const prep = () => state.prep;
const qCat = (id) => Q_CATS.find((c) => c.id === id) || { name: 'My questions', icon: '✏️' };
const allQuestions = () => questionList(prep().custom);

function renderPrep() {
  const p = prep();
  const pool = questionList(p.custom, { cat: p.cat });
  if (!pool.some((x) => x.id === practiceId)) { practiceId = pickPractice(pool, p.practised)?.id ?? null; showTip = false; }
  const cur = allQuestions().find((x) => x.id === practiceId);
  const total = allQuestions().length;
  const done = allQuestions().filter((x) => p.practised[x.id]).length;
  $('practice').innerHTML = cur ? `
    <div class="jb-practice-head"><span>${qCat(cur.cat).icon} ${esc(qCat(cur.cat).name)}</span><span>${done} of ${total} practised</span></div>
    <div class="jb-progress" aria-hidden="true"><span style="width:${total ? (done / total) * 100 : 0}%"></span></div>
    <p class="jb-practice-q">${esc(cur.q)}</p>
    <p class="hint">Answer it out loud, as if you're in the room. Two minutes at most.</p>
    ${cur.tip ? `<p class="jb-tip" ${showTip ? '' : 'hidden'}>💡 ${esc(cur.tip)}</p>` : ''}
    <div class="jb-practice-btns">
      ${cur.tip ? `<button class="secondary small" data-act="tip">${showTip ? 'Hide tip' : 'Show tip'}</button>` : ''}
      <button class="secondary small" data-act="done" aria-pressed="${!!p.practised[cur.id]}">${p.practised[cur.id] ? '✓ Practised' : 'Mark practised'}</button>
      <button class="primary small" data-act="next">Next question →</button>
    </div>` : '<p class="hint">No questions here yet.</p>';

  $('star').innerHTML = STAR.map(([l, name, text]) => `<li><b class="jb-star-l">${l}</b><div><b>${name}</b><span>${text}</span></div></li>`).join('');

  const count = (cat) => questionList(p.custom, { cat }).length;
  const chips = [['all', 'All'], ...(p.custom.length ? [['mine', '✏️ Mine']] : []), ...Q_CATS.map((c) => [c.id, `${c.icon} ${c.name}`])];
  $('q-filters').innerHTML = chips.map(([id, name]) => `<button class="jb-chip" data-qcat="${id}" aria-pressed="${p.cat === id}">${esc(name)} <span>${count(id)}</span></button>`).join('');

  const list = questionList(p.custom, { cat: p.cat, query: $('q-search').value });
  $('q-list').innerHTML = list.map((x) => `
    <details class="jb-q ${p.practised[x.id] ? 'done' : ''}" data-q="${esc(x.id)}" ${openQs.has(x.id) ? 'open' : ''}>
      <summary><span class="jb-q-tick" aria-hidden="true">${p.practised[x.id] ? '✓' : ''}</span><span class="jb-q-text">${esc(x.q)}</span>${p.answers[x.id] ? '<span class="jb-q-has" title="Has your answer">✎</span>' : ''}</summary>
      <div class="jb-q-body">
        ${x.tip ? `<p class="jb-tip">💡 ${esc(x.tip)}</p>` : ''}
        <label class="field"><span>Your answer</span><textarea rows="4" data-answer="${esc(x.id)}" placeholder="Key points, or your STAR story…">${esc(p.answers[x.id] || '')}</textarea></label>
        <div class="jb-q-actions">
          <label class="check-row"><input type="checkbox" data-practised="${esc(x.id)}" ${p.practised[x.id] ? 'checked' : ''}><span>Practised</span></label>
          ${x.mine ? `<button class="text-btn danger-text" data-del-q="${esc(x.id)}">Delete</button>` : ''}
        </div>
      </div>
    </details>`).join('');
  $('q-empty').hidden = list.length > 0;
  $('q-empty').textContent = $('q-search').value ? `No questions match “${$('q-search').value}”.` : 'No questions here yet.';
  if (!$('q-new-cat').options.length) $('q-new-cat').innerHTML = Q_CATS.map((c) => `<option value="${c.id}">${c.icon} ${esc(c.name)}</option>`).join('');
}

function setPractised(id, on) {
  if (on) prep().practised[id] = true; else delete prep().practised[id];
  save();
  renderPrep();
}

// ---- The add / edit sheet -----------------------------------------------------------------

function renderStagePick() {
  $('f-stage').innerHTML = STAGES.map((st) => `<button type="button" role="radio" class="jb-stage st-${st.id}" data-stage="${st.id}"
    aria-checked="${st.id === pickedStage}"><i aria-hidden="true">${st.icon}</i> ${st.name}</button>`).join('');
}

function updateLink() {
  const url = safeUrl($('f-link').value);
  $('open-link').hidden = !url;
  if (url) $('open-link').href = url;
}

function openSheet(id = null) {
  editingId = id;
  const j = state.jobs.find((x) => x.id === id);
  $('sheet-title').textContent = j ? 'Edit application' : 'New application';
  pickedStage = j?.stage || 'applied';
  $('f-company').value = j?.company || '';
  $('f-role').value = j?.role || '';
  $('f-applied').value = j?.applied || (j ? '' : today());
  $('f-salary').value = j?.salary || '';
  $('f-location').value = j?.location || '';
  $('f-next').value = j?.nextStep || '';
  $('f-next-date').value = j?.nextDate || '';
  $('f-next-time').value = j?.nextTime || '';
  $('f-link').value = j?.link || '';
  $('f-contact').value = j?.contact || '';
  $('f-notes').value = j?.notes || '';
  $('form-error').hidden = true;
  $('delete-row').hidden = !j;
  $('history').innerHTML = j && j.history?.length > 1 ? `<div class="jb-history"><p class="jb-next-title">History</p><ol>
    ${[...j.history].reverse().map((h) => `<li><span class="jb-dot st-${h.stage}"></span>${stage(h.stage).name}<small>${new Date(`${h.date}T12:00`).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}</small></li>`).join('')}
  </ol></div>` : '';
  renderStagePick();
  updateLink();
  updateCal();
  $('sheet').showModal();
  if (!j) $('f-company').focus();
}

function saveSheet() {
  const company = $('f-company').value.trim();
  if (!company) {
    $('form-error').textContent = 'Add the company name.';
    $('form-error').hidden = false;
    $('f-company').focus();
    return false;
  }
  const fields = {
    company,
    role: $('f-role').value.trim(),
    applied: isIsoDate($('f-applied').value) ? $('f-applied').value : '',
    salary: $('f-salary').value.trim(),
    location: $('f-location').value.trim(),
    nextStep: $('f-next').value.trim(),
    nextDate: isIsoDate($('f-next-date').value) ? $('f-next-date').value : '',
    nextTime: /^\d{2}:\d{2}$/.test($('f-next-time').value) && isIsoDate($('f-next-date').value) ? $('f-next-time').value : '',
    link: $('f-link').value.trim(),
    contact: $('f-contact').value.trim(),
    notes: $('f-notes').value.trim(),
  };
  const t = today();
  const j = state.jobs.find((x) => x.id === editingId);
  if (j) {
    Object.assign(j, fields);
    if (j.stage !== pickedStage) {
      moveStage(j, pickedStage, t);
      toast(`${company}: ${stage(pickedStage).name}${pickedStage === 'offer' ? ' 🎉' : ''}`);
    }
  } else {
    state.jobs.push(newJob({ ...fields, stage: pickedStage }, t, newId()));
    toast(`Added ${company}.`);
  }
  save();
  render();
  return true;
}

// ---- Calendar ---------------------------------------------------------------------------------

// The job as the form describes it right now, so the calendar buttons work before saving.
function formJob() {
  const j = state.jobs.find((x) => x.id === editingId);
  return {
    id: j?.id || 'new',
    company: $('f-company').value.trim() || 'Interview',
    role: $('f-role').value.trim(),
    location: $('f-location').value.trim(),
    link: $('f-link').value.trim(),
    contact: $('f-contact').value.trim(),
    nextStep: $('f-next').value.trim(),
    nextDate: $('f-next-date').value,
    nextTime: $('f-next-time').value,
  };
}

function updateCal() {
  const job = formJob();
  const url = googleCalendarUrl(job);
  $('cal-row').hidden = !url;
  if (url) $('cal-google').href = url;
}

// A calendar file: iPhone, Outlook and most Android calendars offer to add it straight away.
function downloadIcs(job) {
  const text = job && nextStepIcs(job);
  if (!text) return toast('Give the next step a date first.');
  const blob = new Blob([text], { type: 'text/calendar' });
  const name = `${job.company} ${job.nextStep || 'next step'}`.replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'interview';
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${name}.ics` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

function deleteJob() {
  const j = state.jobs.find((x) => x.id === editingId);
  if (!j || !confirm(`Delete ${j.company}${j.role ? ` (${j.role})` : ''}? This can't be undone.`)) return;
  state.jobs = state.jobs.filter((x) => x.id !== j.id);
  save();
  $('sheet').close();
  render();
  toast(`Deleted ${j.company}.`);
}

// ---- Wiring -----------------------------------------------------------------------------

// The Add button is for applications, so it shows only where they're listed.
let tab = 'list';
const showAdd = () => { $('add').hidden = !state.jobs.length || !['list', 'upcoming'].includes(tab); };
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; switchTab(tab); showAdd(); }));
$('search').addEventListener('input', () => { query = $('search').value; renderList(); });
$('filters').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-filter]');
  if (!b) return;
  state.filter = b.dataset.filter;
  save();
  renderFilters();
  renderList();
});
$('nudge').addEventListener('click', () => { state.filter = 'followup'; save(); renderFilters(); renderList(); });
$('add').addEventListener('click', () => openSheet());
$('empty').addEventListener('click', (ev) => { if (ev.target.closest('[data-action="add"]')) openSheet(); });

for (const el of [$('job-list'), $('upcoming')]) {
  el.addEventListener('click', (ev) => {
    const cal = ev.target.closest('[data-cal]');
    if (cal) { downloadIcs(state.jobs.find((x) => x.id === cal.dataset.cal)); return; }
    const followed = ev.target.closest('[data-followed]');
    const ghost = ev.target.closest('[data-ghost]');
    if (followed || ghost) {
      const id = followed ? followed.dataset.followed : ghost.dataset.ghost;
      const j = state.jobs.find((x) => x.id === id);
      if (!j) return;
      if (followed) {
        // Following up restarts the wait: check again in a week.
        j.nextStep = 'Hear back after following up';
        const d = new Date(); d.setDate(d.getDate() + 7);
        j.nextDate = localIso(d);
        toast(`Noted. ${j.company} is back in Upcoming in a week.`);
      } else {
        moveStage(j, 'ghosted', today());
        toast(`${j.company} marked as no reply.`);
      }
      save();
      render();
      return;
    }
    const row = ev.target.closest('[data-job]');
    if (row) openSheet(row.dataset.job);
  });
  el.addEventListener('keydown', (ev) => {
    const row = ev.target.closest('[data-job]');
    if (row && ev.target === row && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); openSheet(row.dataset.job); }
  });
}

$('f-stage').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-stage]');
  if (!b) return;
  pickedStage = b.dataset.stage;
  if (pickedStage !== 'wishlist' && !$('f-applied').value) $('f-applied').value = today();
  renderStagePick();
});
$('f-link').addEventListener('input', updateLink);
for (const id of ['f-next', 'f-next-date', 'f-next-time', 'f-company', 'f-role', 'f-location']) $(id).addEventListener('input', updateCal);
$('cal-ics').addEventListener('click', () => downloadIcs(formJob()));
$('form').addEventListener('submit', (ev) => { if (!saveSheet()) ev.preventDefault(); });
$('cancel').addEventListener('click', () => $('sheet').close());
$('delete').addEventListener('click', deleteJob);
$('export').addEventListener('click', () => {
  if (!state.jobs.length) return toast('Nothing to export yet.');
  const blob = new Blob(['﻿', toCsv(sortJobs(state.jobs))], { type: 'text/csv' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `job-applications-${today()}.csv` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('practice').addEventListener('click', (ev) => {
  const act = ev.target.closest('[data-act]')?.dataset.act;
  if (act === 'tip') { showTip = !showTip; renderPrep(); }
  if (act === 'done') setPractised(practiceId, !prep().practised[practiceId]);
  if (act === 'next') {
    practiceId = pickPractice(questionList(prep().custom, { cat: prep().cat }), prep().practised, practiceId)?.id ?? null;
    showTip = false;
    renderPrep();
  }
});
$('q-filters').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-qcat]');
  if (!b) return;
  prep().cat = b.dataset.qcat;
  save();
  renderPrep();
});
$('q-search').addEventListener('input', renderPrep);
$('q-list').addEventListener('toggle', (ev) => {
  const d = ev.target.closest('[data-q]');
  if (d) { if (d.open) openQs.add(d.dataset.q); else openQs.delete(d.dataset.q); }
}, true);
// Typing an answer saves as you go, without redrawing (so the box keeps focus).
$('q-list').addEventListener('input', (ev) => {
  const id = ev.target.dataset.answer;
  if (!id) return;
  const text = ev.target.value;
  if (text.trim()) prep().answers[id] = text; else delete prep().answers[id];
  save();
});
$('q-list').addEventListener('change', (ev) => {
  const id = ev.target.dataset.practised;
  if (id) setPractised(id, ev.target.checked);
  if (ev.target.dataset.answer) renderPrep(); // shows the ✎ once you leave the box
});
$('q-list').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-del-q]');
  if (!b || !confirm('Delete this question and your answer to it?')) return;
  const id = b.dataset.delQ;
  prep().custom = prep().custom.filter((c) => c.id !== id);
  delete prep().answers[id];
  delete prep().practised[id];
  save();
  renderPrep();
});
$('q-add').addEventListener('click', () => {
  const q = $('q-new').value.trim();
  if (!q) return toast('Type the question first.');
  const id = `my-${newId()}`;
  prep().custom.unshift({ id, cat: $('q-new-cat').value, q });
  openQs.add(id);
  prep().cat = 'mine';
  $('q-new').value = '';
  save();
  renderPrep();
  toast('Added to My questions.');
});

render();
