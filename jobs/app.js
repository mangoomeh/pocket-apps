import { newId } from '../src/sync.js';
import {
  STAGES, CLOSED, stage, isActive, newJob, moveStage, needsFollowUp, upcoming, relDay, stats, matches, sortJobs, toCsv,
  safeUrl, localIso, isIsoDate, nextStepIcs, googleCalendarUrl,
} from '../src/jobs.js';
import {
  CATEGORIES as Q_CATS, QUESTIONS, STAR, questionList, pickPractice, MOST_ASKED, progressOf, STORY_IDEAS, STORY_CATS,
  storyQuestions, newStory, storyReady, storiesFor, CORE, LOGISTICS, freshJobPrep, prepSteps, interviewsToPrep,
} from '../src/interview.js';
import { $, esc, switchTab, toast } from '../shared/ui.js';

const STORAGE_KEY = 'jobs-v1';
const FOLLOW_UP_DAYS = 14;

// ---- Persistent state -----------------------------------------------------------------

// Interview prep: your answers and "practised" marks by question id, and your own questions.
function freshPrep() {
  return { answers: {}, practised: {}, custom: [], stories: [] };
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
  const prepIds = new Set(interviewsToPrep(state.jobs, t).map((j) => j.id));
  const stepRow = ({ job: j, inDays }) => `<li class="jb-row" data-job="${esc(j.id)}" role="button" tabindex="0">
      <span class="jb-date ${inDays < 0 ? 'late' : inDays === 0 ? 'now' : ''}" aria-hidden="true">
        <b>${new Date(`${j.nextDate}T12:00`).getDate()}</b>${new Date(`${j.nextDate}T12:00`).toLocaleDateString('en-SG', { month: 'short' })}
      </span>
      <div class="jb-main">
        <div class="jb-top"><strong>${esc(j.nextStep || 'Next step')}</strong></div>
        <div class="jb-sub">${esc([j.role, j.company].filter(Boolean).join(' · '))}</div>
        <div class="jb-meta">${relDay(j.nextDate, t)}${j.nextTime ? ` · ${timeText(j.nextTime)}` : ''}</div>
      </div>
      ${prepIds.has(j.id) ? `<button class="jb-prep-chip" data-prep="${esc(j.id)}">🎤 Prep ${prepSteps(j.prep, state.prep).done}/${prepSteps(j.prep, state.prep).total}</button>` : ''}
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
const openQs = new Set(); // questions expanded in the list, kept open across redraws
const openSecs = new Set(['most']); // question groups expanded
const prep = () => state.prep;
const qCat = (id) => Q_CATS.find((c) => c.id === id) || { name: 'My questions', icon: '✏️' };
const allQuestions = () => questionList(prep().custom);
const has = (s) => !!String(s || '').trim();

function progressText({ total, drafted, practised }) {
  return `${drafted} of ${total} drafted${practised ? ` · ${practised} practised` : ''}`;
}

function storyChips(qid) {
  return storiesFor(prep().stories, qid).map((st) => `<button type="button" class="jb-story-chip" data-story="${esc(st.id)}">📖 ${esc(st.title || 'Untitled story')}</button>`).join('');
}

function questionItem(x) {
  const p = prep();
  const linkable = STORY_CATS.has(x.cat) || x.id === 'intro-4' || x.mine;
  const linked = storiesFor(p.stories, x.id);
  const unlinked = p.stories.filter((st) => !linked.includes(st));
  return `<details class="jb-q ${p.practised[x.id] ? 'done' : ''}" data-q="${esc(x.id)}" ${openQs.has(x.id) ? 'open' : ''}>
    <summary>
      <span class="jb-q-tick" aria-hidden="true">${p.practised[x.id] ? '✓' : ''}</span>
      <span class="jb-q-text">${esc(x.q)}</span>
      ${has(p.answers[x.id]) ? '<span class="jb-q-has" title="Answer drafted">✎</span>' : ''}
    </summary>
    <div class="jb-q-body">
      ${x.tip ? `<p class="jb-tip">💡 ${esc(x.tip)}</p>` : ''}
      ${linkable && (linked.length || unlinked.length) ? `<div class="jb-q-stories">${storyChips(x.id)}
        ${unlinked.length ? `<select class="jb-link-story" data-link-story="${esc(x.id)}" aria-label="Use one of your stories"><option value="">＋ Use a story…</option>${unlinked.map((st) => `<option value="${esc(st.id)}">${esc(st.title || 'Untitled story')}</option>`).join('')}</select>` : ''}</div>` : ''}
      <label class="field"><span>Your answer</span><textarea rows="4" data-answer="${esc(x.id)}" placeholder="Key points, or which story you'd tell…">${esc(p.answers[x.id] || '')}</textarea></label>
      <div class="jb-q-actions">
        <label class="check-row"><input type="checkbox" data-practised="${esc(x.id)}" ${p.practised[x.id] ? 'checked' : ''}><span>Practised out loud</span></label>
        ${x.mine ? `<button type="button" class="text-btn danger-text" data-del-q="${esc(x.id)}">Delete</button>` : ''}
      </div>
    </div>
  </details>`;
}

function section(id, title, list, note = '') {
  const pr = progressOf(list, prep().answers, prep().practised);
  return `<details class="card jb-sec" data-sec="${id}" ${openSecs.has(id) ? 'open' : ''}>
    <summary><span class="jb-sec-title">${title}</span><span class="jb-sec-prog">${progressText(pr)}</span></summary>
    ${note ? `<p class="hint">${note}</p>` : ''}
    <div class="jb-qlist">${list.map(questionItem).join('')}</div>
  </details>`;
}

function renderPrep() {
  const p = prep();
  const t = today();

  // Interviews coming up, with how ready you are for each.
  const ivs = interviewsToPrep(state.jobs, t);
  $('prep-interviews').innerHTML = ivs.length ? `<div class="card jb-ivs"><h2>Your interviews</h2><ul class="jb-list">${ivs.map((j) => {
    const pr = prepSteps(j.prep, p);
    const when = isIsoDate(j.nextDate) ? `${relDay(j.nextDate, t)}${j.nextTime ? ` at ${timeText(j.nextTime)}` : ''}` : 'date not set';
    return `<li class="jb-row" data-prep="${esc(j.id)}" role="button" tabindex="0">
      <span class="jb-badge" aria-hidden="true">${badge(j.company)}</span>
      <div class="jb-main">
        <div class="jb-top"><strong>${esc(j.company)}</strong><span class="jb-ready ${pr.done === pr.total ? 'ok' : ''}">${pr.done}/${pr.total} ready</span></div>
        <div class="jb-sub">${esc(j.nextStep || j.role || 'Interview')} · ${when}</div>
        <div class="jb-progress" aria-hidden="true"><span style="width:${(pr.done / pr.total) * 100}%"></span></div>
      </div>
    </li>`;
  }).join('')}</ul></div>` : '';

  // The practice card: one question at a time, unpractised ones first.
  const pool = allQuestions();
  if (!pool.some((x) => x.id === practiceId)) {
    const most = pool.filter((x) => MOST_ASKED.includes(x.id));
    practiceId = (pickPractice(most.filter((x) => !p.practised[x.id]), p.practised) || pickPractice(pool, p.practised))?.id ?? null;
    showTip = false;
  }
  const cur = pool.find((x) => x.id === practiceId);
  const all = progressOf(pool, p.answers, p.practised);
  const curStories = cur ? storiesFor(p.stories, cur.id) : [];
  $('practice').innerHTML = cur ? `
    <div class="jb-practice-head"><span>🎤 Practise</span><span>${all.practised}/${all.total} practised</span></div>
    <div class="jb-progress" aria-hidden="true"><span style="width:${all.total ? (all.practised / all.total) * 100 : 0}%"></span></div>
    <p class="jb-practice-cat">${qCat(cur.cat).icon} ${esc(qCat(cur.cat).name)}</p>
    <p class="jb-practice-q">${esc(cur.q)}</p>
    <p class="hint">Answer it out loud, as if you're in the room. Two minutes at most.</p>
    ${curStories.length ? `<div class="jb-q-stories">${storyChips(cur.id)}</div>` : ''}
    ${cur.tip ? `<p class="jb-tip" ${showTip ? '' : 'hidden'}>💡 ${esc(cur.tip)}</p>` : ''}
    <div class="jb-practice-btns">
      ${cur.tip ? `<button class="secondary small" data-act="tip">${showTip ? 'Hide tip' : 'Show tip'}</button>` : ''}
      <button class="secondary small" data-act="done" aria-pressed="${!!p.practised[cur.id]}">${p.practised[cur.id] ? '✓ Practised' : 'Mark practised'}</button>
      <button class="primary small" data-act="next">Next →</button>
    </div>` : '<p class="hint">No questions yet.</p>';

  // Stories.
  $('stories').innerHTML = p.stories.length ? p.stories.map((st) => `<li class="jb-story" data-story="${esc(st.id)}" role="button" tabindex="0">
      <span class="jb-story-icon" aria-hidden="true">📖</span>
      <div class="jb-main"><strong>${esc(st.title || 'Untitled story')}</strong>
        <div class="jb-sub">${storyReady(st) ? '' : '<span class="jb-warn">Needs an action and result · </span>'}${(st.qids || []).length ? `answers ${(st.qids || []).length} question${st.qids.length === 1 ? '' : 's'}` : 'not linked to questions yet'}</div></div>
    </li>`).join('') : `<li class="jb-story-empty">No stories yet. Good ones to start with: ${STORY_IDEAS.slice(0, 3).map((x) => x.toLowerCase()).join('; ')}.</li>`;
  $('star').innerHTML = STAR.map(([l, name, text]) => `<li><b class="jb-star-l">${l}</b><div><b>${name}</b><span>${text}</span></div></li>`).join('');

  // Questions: "Most asked" first, then each group folded with its progress; a flat list while searching.
  const query = $('q-search').value.trim();
  if (query) {
    const found = questionList(p.custom, { query });
    $('q-sections').innerHTML = `<div class="card jb-list-card"><div class="jb-qlist">${found.map(questionItem).join('')}</div>
      ${found.length ? '' : `<p class="hint">No questions match “${esc(query)}”.</p>`}</div>`;
  } else {
    const byId = Object.fromEntries(pool.map((x) => [x.id, x]));
    const mine = pool.filter((x) => x.mine);
    $('q-sections').innerHTML = [
      section('most', '🔥 Most asked', MOST_ASKED.map((id) => byId[id]).filter(Boolean), 'Asked in almost every interview. Start here.'),
      ...(mine.length ? [section('mine', '✏️ My questions', mine)] : []),
      ...Q_CATS.map((c) => section(c.id, `${c.icon} ${esc(c.name)}`, QUESTIONS.filter((x) => x.cat === c.id))),
    ].join('');
  }
  if (!$('q-new-cat').options.length) $('q-new-cat').innerHTML = Q_CATS.map((c) => `<option value="${c.id}">${c.icon} ${esc(c.name)}</option>`).join('');
}

function setPractised(id, on) {
  if (on) prep().practised[id] = true; else delete prep().practised[id];
  save();
  renderPrep();
  if ($('prep-sheet').open) renderPrepSheet();
}

// ---- Story sheet ------------------------------------------------------------------------------

let storyId = null; // the story open in its sheet, or null for a new one

const STAR_HINTS = {
  s: 'Where and when. One or two sentences.',
  t: 'What you had to achieve, or the problem.',
  a: 'What YOU did, step by step. The longest part.',
  r: 'What changed because of you. A number if you can, and what you learnt.',
};

function openStory(id = null, linkTo = null) {
  storyId = id;
  const st = prep().stories.find((x) => x.id === id) || newStory(null);
  if (linkTo && !st.qids.includes(linkTo)) st.qids = [...st.qids, linkTo];
  $('story-title').textContent = id ? 'Edit story' : 'New story';
  $('s-title').value = st.title;
  $('s-ideas').innerHTML = id ? '' : `<span>Ideas:</span>${STORY_IDEAS.map((x) => `<button type="button" class="jb-chip" data-idea="${esc(x)}">${esc(x)}</button>`).join('')}`;
  $('s-fields').innerHTML = STAR.map(([l, name]) => {
    const k = l.toLowerCase();
    return `<label class="jb-star-field"><b class="jb-star-l">${l}</b><span class="jb-star-in"><span class="jb-star-name">${name}</span>
      <textarea rows="${k === 'a' ? 4 : 2}" id="s-${k}" placeholder="${STAR_HINTS[k]}">${esc(st[k] || '')}</textarea></span></label>`;
  }).join('');
  $('s-qs').innerHTML = storyQuestions(prep().custom).map((q) => `<label class="check-row"><input type="checkbox" value="${esc(q.id)}" ${st.qids.includes(q.id) ? 'checked' : ''}><span>${esc(q.q)}</span></label>`).join('');
  $('story-delete-row').hidden = !id;
  $('story-sheet').showModal();
}

function saveStory() {
  const fields = {
    title: $('s-title').value.trim(),
    s: $('s-s').value.trim(), t: $('s-t').value.trim(), a: $('s-a').value.trim(), r: $('s-r').value.trim(),
    qids: [...$('s-qs').querySelectorAll('input:checked')].map((i) => i.value),
  };
  if (!fields.title && !fields.a) { toast('Give the story a name, or write what you did.'); return false; }
  if (!fields.title) fields.title = fields.a.split(/[.\n]/)[0].slice(0, 50);
  const st = prep().stories.find((x) => x.id === storyId);
  if (st) Object.assign(st, fields);
  else prep().stories.push({ ...newStory(`st-${newId()}`), ...fields });
  save();
  renderPrep();
  if ($('prep-sheet').open) renderPrepSheet();
  toast(storyReady(fields) ? 'Story saved.' : 'Saved. Add what you did and the result when you can.');
  return true;
}

// ---- Prep for one interview -----------------------------------------------------------------

let prepJobId = null;
const openSteps = new Set();
const prepJob = () => state.jobs.find((j) => j.id === prepJobId);

function openPrep(id) {
  const j = state.jobs.find((x) => x.id === id);
  if (!j) return;
  j.prep = { ...freshJobPrep(), ...j.prep };
  prepJobId = id;
  openSteps.clear();
  const first = prepSteps(j.prep, prep()).steps.find((s) => !s.done);
  if (first) openSteps.add(first.id);
  renderPrepSheet();
  if (!$('prep-sheet').open) $('prep-sheet').showModal();
}

function prepHead(j) {
  const pr = prepSteps(j.prep, prep());
  return `<div class="jb-prep-head" id="prep-head">
    <span class="jb-badge" aria-hidden="true">${badge(j.company)}</span>
    <div class="jb-main"><strong>${esc(j.company)}</strong>
      <div class="jb-sub">${esc([j.role, j.nextStep].filter(Boolean).join(' · ') || 'Interview')}${isIsoDate(j.nextDate) ? ` · ${relDay(j.nextDate, today())}${j.nextTime ? ` at ${timeText(j.nextTime)}` : ''}` : ''}</div></div>
    <span class="jb-ready ${pr.done === pr.total ? 'ok' : ''}">${pr.done}/${pr.total} ready</span>
  </div>
  <div class="jb-progress big" aria-hidden="true"><span style="width:${(pr.done / pr.total) * 100}%"></span></div>`;
}

function renderPrepSheet() {
  const j = prepJob();
  if (!j) return;
  const jp = j.prep;
  const p = prep();
  const { steps } = prepSteps(jp, p);
  const area = (key, label, placeholder, rows = 3) => `<label class="field"><span>${label}</span><textarea rows="${rows}" data-jp="${key}" placeholder="${placeholder}">${esc(jp[key] || '')}</textarea></label>`;
  const qById = Object.fromEntries(allQuestions().map((x) => [x.id, x]));
  const body = {
    research: `${area('research', 'Your notes', 'What they do and for whom, how they make money, recent news or launches, their values, who you\'ll meet…', 4)}
      ${safeUrl(j.link) ? `<p class="hint">Start with <a href="${esc(safeUrl(j.link))}" target="_blank" rel="noopener noreferrer">the job ad</a>, their website and news, and the interviewers' LinkedIn.</p>` : `<p class="hint">Try their website, recent news and the interviewers' LinkedIn.</p>`}`,
    why: `${area('whyCompany', `Why ${esc(j.company)}?`, 'Something specific about them (product, mission, a recent move) and why it matters to you.')}
      ${area('whyRole', 'Why this role?', 'Two or three things in the job ad you\'ve done before and enjoy.')}
      <p class="hint">These are kept for ${esc(j.company)} only.</p>`,
    core: `<p class="hint">Your answers here are shared with the question bank, so they're ready for every interview.</p>
      <div class="jb-qlist">${CORE.map((id) => qById[id]).filter(Boolean).map(questionItem).join('')}</div>`,
    stories: p.stories.length ? `<p class="hint">Pick the stories you'll have ready. Choose ones that show what the job ad asks for.</p>
      ${p.stories.map((st) => `<label class="check-row"><input type="checkbox" data-jp-story="${esc(st.id)}" ${jp.stories.includes(st.id) ? 'checked' : ''}><span>${esc(st.title || 'Untitled story')}${storyReady(st) ? '' : ' <small>(unfinished)</small>'}</span></label>`).join('')}
      <div class="actions"><button type="button" class="secondary small" data-new-story>＋ New story</button></div>`
      : `<p class="hint">You haven't written any stories yet. Two or three good ones cover most "tell me about a time…" questions.</p>
      <div class="actions"><button type="button" class="primary small" data-new-story>Write your first story</button></div>`,
    ask: `<p class="hint">Pick two or three, and save one for the very end.</p>
      ${QUESTIONS.filter((x) => x.cat === 'ask').map((x) => `<label class="check-row"><input type="checkbox" data-jp-ask="${esc(x.id)}" ${jp.ask.includes(x.id) ? 'checked' : ''}><span>${esc(x.q)}</span></label>`).join('')}
      ${area('askOwn', 'Your own, one per line', `e.g. How does this team work with the product side at ${esc(j.company)}?`)}`,
    logistics: `${LOGISTICS.map(([k, label]) => `<label class="check-row"><input type="checkbox" data-jp-logi="${k}" ${jp.logistics[k] ? 'checked' : ''}><span>${label}</span></label>`).join('')}
      ${isIsoDate(j.nextDate) ? `<div class="jb-cal"><button type="button" class="secondary small" data-cal="${esc(j.id)}">📅 Add to calendar</button><a class="jb-cal-g" href="${esc(googleCalendarUrl(j))}" target="_blank" rel="noopener noreferrer">Google Calendar</a></div>` : ''}`,
  };
  $('prep-title').textContent = 'Interview prep';
  $('prep-body').innerHTML = `${prepHead(j)}
    ${steps.map((s) => `<details class="jb-step ${s.done ? 'done' : ''}" data-step="${s.id}" ${openSteps.has(s.id) ? 'open' : ''}>
      <summary><span class="jb-q-tick" aria-hidden="true">${s.done ? '✓' : ''}</span><span class="jb-main"><b>${s.name}</b><span class="jb-sub" data-step-detail="${s.id}">${s.detail}</span></span></summary>
      <div class="jb-step-body">${body[s.id]}</div>
    </details>`).join('')}
    <p class="hint jb-foot">Good luck! Afterwards, note how it went in the application's notes.</p>`;
}

// Updates the header and step ticks while typing, without redrawing (so the box keeps focus).
function refreshPrepStatus() {
  const j = prepJob();
  if (!j) return;
  const { steps } = prepSteps(j.prep, prep());
  const head = document.createElement('div');
  head.innerHTML = prepHead(j);
  $('prep-head').replaceWith(head.firstElementChild);
  $('prep-body').querySelector('.jb-progress.big').replaceWith(head.querySelector('.jb-progress'));
  for (const s of steps) {
    const d = $('prep-body').querySelector(`[data-step="${s.id}"]`);
    d.classList.toggle('done', s.done);
    d.querySelector('.jb-q-tick').textContent = s.done ? '✓' : '';
    d.querySelector('[data-step-detail]').textContent = s.detail;
  }
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
  $('open-prep').hidden = !(j && isActive(j) && j.stage !== 'wishlist');
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
    const prepBtn = ev.target.closest('button[data-prep]');
    if (prepBtn) { openPrep(prepBtn.dataset.prep); return; }
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
    practiceId = pickPractice(allQuestions(), prep().practised, practiceId)?.id ?? null;
    showTip = false;
    renderPrep();
  }
});
$('q-search').addEventListener('input', renderPrep);
$('story-add').addEventListener('click', () => openStory());
$('prep-interviews').addEventListener('click', (ev) => { const r = ev.target.closest('[data-prep]'); if (r) openPrep(r.dataset.prep); });
$('stories').addEventListener('click', (ev) => { const r = ev.target.closest('[data-story]'); if (r) openStory(r.dataset.story); });
for (const el of [$('prep-interviews'), $('stories')]) {
  el.addEventListener('keydown', (ev) => {
    const r = ev.target.closest('[data-prep], [data-story]');
    if (!r || r !== ev.target || !['Enter', ' '].includes(ev.key)) return;
    ev.preventDefault();
    if (r.dataset.prep) openPrep(r.dataset.prep); else openStory(r.dataset.story);
  });
}

// Question lists live in the Prep tab and in the interview prep sheet; both work the same.
for (const el of [$('q-sections'), $('practice'), $('prep-body')]) {
  el.addEventListener('toggle', (ev) => {
    const d = ev.target;
    const set = d.dataset.q ? openQs : d.dataset.sec ? openSecs : d.dataset.step ? openSteps : null;
    const key = d.dataset.q || d.dataset.sec || d.dataset.step;
    if (set) { if (d.open) set.add(key); else set.delete(key); }
  }, true);
  // Typing saves as you go, without redrawing (so the box keeps focus).
  el.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.dataset.answer) {
      if (t.value.trim()) prep().answers[t.dataset.answer] = t.value; else delete prep().answers[t.dataset.answer];
      save();
      if (el === $('prep-body')) refreshPrepStatus();
    }
    if (t.dataset.jp && prepJob()) { prepJob().prep[t.dataset.jp] = t.value; save(); refreshPrepStatus(); }
  });
  el.addEventListener('change', (ev) => {
    const t = ev.target;
    const j = prepJob();
    // Leaving a text box only updates its ✎ mark: redrawing here would swallow the tap that
    // moved focus away (e.g. on the next question or step).
    if (t.tagName === 'TEXTAREA') {
      const q = t.dataset.answer && t.closest('[data-q]');
      const mark = q?.querySelector(':scope > summary .jb-q-has');
      if (q && has(t.value) && !mark) q.querySelector(':scope > summary').insertAdjacentHTML('beforeend', '<span class="jb-q-has" title="Answer drafted">✎</span>');
      if (q && !has(t.value) && mark) mark.remove();
      return;
    }
    if (t.dataset.practised) return setPractised(t.dataset.practised, t.checked);
    if (t.dataset.linkStory) {
      const st = prep().stories.find((x) => x.id === t.value);
      if (st) { st.qids = [...new Set([...(st.qids || []), t.dataset.linkStory])]; openQs.add(t.dataset.linkStory); save(); renderPrep(); if ($('prep-sheet').open) renderPrepSheet(); }
      return;
    }
    const toggle = (list, id) => (t.checked ? [...new Set([...list, id])] : list.filter((x) => x !== id));
    if (j && t.dataset.jpStory) j.prep.stories = toggle(j.prep.stories, t.dataset.jpStory);
    else if (j && t.dataset.jpAsk) j.prep.ask = toggle(j.prep.ask, t.dataset.jpAsk);
    else if (j && t.dataset.jpLogi) { if (t.checked) j.prep.logistics[t.dataset.jpLogi] = true; else delete j.prep.logistics[t.dataset.jpLogi]; }
    else return;
    save();
    renderPrep();
    if (el === $('prep-body')) renderPrepSheet();
  });
  el.addEventListener('click', (ev) => {
    const story = ev.target.closest('.jb-story-chip');
    if (story) { ev.preventDefault(); return openStory(story.dataset.story); }
    if (ev.target.closest('[data-new-story]')) return openStory();
    const cal = ev.target.closest('[data-cal]');
    if (cal) return downloadIcs(state.jobs.find((x) => x.id === cal.dataset.cal));
    const del = ev.target.closest('[data-del-q]');
    if (!del || !confirm('Delete this question and your answer to it?')) return;
    const id = del.dataset.delQ;
    prep().custom = prep().custom.filter((c) => c.id !== id);
    delete prep().answers[id];
    delete prep().practised[id];
    for (const st of prep().stories) st.qids = (st.qids || []).filter((q) => q !== id);
    save();
    renderPrep();
  });
}

$('q-add').addEventListener('click', () => {
  const q = $('q-new').value.trim();
  if (!q) return toast('Type the question first.');
  const id = `my-${newId()}`;
  prep().custom.unshift({ id, cat: $('q-new-cat').value, q });
  openQs.add(id);
  openSecs.add('mine');
  $('q-new').value = '';
  save();
  renderPrep();
  toast('Added to My questions.');
});

$('s-ideas').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-idea]');
  if (b) { $('s-title').value = b.dataset.idea; $('s-s').focus(); }
});
$('story-form').addEventListener('submit', (ev) => { if (!saveStory()) ev.preventDefault(); });
$('story-cancel').addEventListener('click', () => $('story-sheet').close());
$('story-delete').addEventListener('click', () => {
  if (!confirm('Delete this story?')) return;
  prep().stories = prep().stories.filter((x) => x.id !== storyId);
  for (const j of state.jobs) if (j.prep?.stories) j.prep.stories = j.prep.stories.filter((x) => x !== storyId);
  save();
  $('story-sheet').close();
  renderPrep();
  if ($('prep-sheet').open) renderPrepSheet();
});
$('prep-close').addEventListener('click', () => $('prep-sheet').close());
$('prep-sheet').addEventListener('close', () => { prepJobId = null; render(); });
$('open-prep').addEventListener('click', () => { if (editingId) openPrep(editingId); });

render();
