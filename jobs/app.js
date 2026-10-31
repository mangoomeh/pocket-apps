import { newId } from '../src/sync.js';
import {
  STAGES, CLOSED, stage, isActive, newJob, moveStage, needsFollowUp, upcoming, relDay, stats, matches, sortJobs, toCsv,
  safeUrl, localIso, isIsoDate,
} from '../src/jobs.js';
import { $, esc, switchTab, toast } from '../shared/ui.js';

const STORAGE_KEY = 'jobs-v1';
const FOLLOW_UP_DAYS = 14;

// ---- Persistent state -----------------------------------------------------------------

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.jobs)) return { filter: 'active', ...saved };
  } catch { /* storage unavailable or corrupt: start fresh */ }
  return { jobs: [], filter: 'active' };
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

const badge = (company) => esc([...String(company).trim()][0]?.toUpperCase() || '?');
const pill = (id) => `<span class="jb-pill st-${id}">${stage(id).name}</span>`;

// What's next for a job, in one short line: a planned step, a nudge, or how long it's been.
function statusLine(j) {
  const t = today();
  if (j.nextStep || isIsoDate(j.nextDate)) {
    const when = isIsoDate(j.nextDate) ? relDay(j.nextDate, t) : '';
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
  $('add').hidden = !state.jobs.length;
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
        <div class="jb-meta">${relDay(j.nextDate, t)}</div>
      </div>
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

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
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

render();
