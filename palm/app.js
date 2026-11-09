import { keepUnreadable } from '../shared/store.js';
import { newId } from '../src/sync.js';
import {
  STEPS, ELEMENTS, buildReading, answeredCount, lookFor, handSvg, newSaved, readingText, optionOf,
} from '../src/palm.js';
import { $, esc, switchTab, toast } from '../shared/ui.js';

const STORAGE_KEY = 'palm-v1';

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s && Array.isArray(s.saved)) return { answers: {}, step: 0, done: false, ...s };
  } catch { /* storage unavailable or corrupt: start fresh */ }
  return { answers: {}, step: 0, done: false, saved: [] };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    toast('Could not save — your browser is blocking storage.');
  }
}

keepUnreadable(STORAGE_KEY, (s) => Array.isArray(s.saved));
const state = load();
state.step = Math.min(Math.max(0, state.step | 0), STEPS.length - 1);

const fmtDate = (t) => new Date(t).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });

// ---- Read: one step at a time, then the reading ------------------------------------------

function renderReader() {
  $('photo-card').hidden = state.done; // the photo is for comparing while answering
  if (state.done) return renderReading();
  const step = STEPS[state.step];
  const chosen = state.answers[step.id];
  const pct = Math.round((state.step / STEPS.length) * 100);
  const big = step.id === 'hand'
    ? ''
    : `<div class="pl-figure">${handSvg({ look: lookFor(state.answers), highlight: step.line || null, label: step.line ? `A palm with the ${step.line} line highlighted` : 'A palm' })}</div>`;
  const options = step.options.map((o) => {
    const art = step.id === 'hand'
      ? `<span class="pl-opt-emoji" aria-hidden="true">${o.id === 'dominant' ? '✍️' : '🤚'}</span>`
      : handSvg({ look: lookFor({ ...state.answers, [step.id]: o.id }), highlight: step.line || null, size: 'small', label: o.label });
    return `<button type="button" class="pl-opt" data-pick="${o.id}" aria-pressed="${o.id === chosen}">
      ${art}<span class="pl-opt-label">${esc(o.label)}</span>${o.hint ? `<small>${esc(o.hint)}</small>` : ''}</button>`;
  }).join('');
  $('reader').innerHTML = `
    <div class="pl-progress" aria-hidden="true"><i style="width:${pct}%"></i></div>
    <div class="card pl-step">
      <p class="pl-step-count">Step ${state.step + 1} of ${STEPS.length}</p>
      <h2>${esc(step.title)}</h2>
      ${big}
      <p class="pl-spot">${esc(step.spot)}</p>
      <div class="pl-opts pl-opts-${step.options.length}" role="group" aria-label="${esc(step.title)}">${options}</div>
      <div class="pl-nav">
        <button type="button" class="secondary" id="prev" ${state.step === 0 ? 'disabled' : ''}>Back</button>
        <button type="button" class="text-btn" id="skip">${chosen ? 'Next' : 'Not sure, skip'}</button>
      </div>
      ${answeredCount(state.answers) >= 3 && state.step < STEPS.length - 1 ? '<button type="button" class="text-btn pl-finish" id="finish">See my reading now</button>' : ''}
    </div>`;
}

function renderReading() {
  const r = buildReading(state.answers);
  if (!r.answered) {
    $('reader').innerHTML = `<div class="card"><p>You skipped every step, so there’s nothing to read yet.</p><div class="actions"><button type="button" class="primary" id="restart">Start again</button></div></div>`;
    return;
  }
  $('reader').innerHTML = `
    <div class="card pl-reading">
      <div class="pl-reading-head">
        <div class="pl-figure small">${handSvg({ look: lookFor(state.answers), label: 'Your palm as you described it' })}</div>
        <div><p class="pl-reading-icon" aria-hidden="true">${r.icon}</p><h2>${esc(r.title)}</h2>
          ${r.keywords.length ? `<p class="pl-keywords">${r.keywords.slice(0, 8).map((k) => `<span>${esc(k)}</span>`).join('')}</p>` : ''}</div>
      </div>
      ${r.intro ? `<p class="pl-intro">${esc(r.intro)}</p>` : ''}
      ${r.sections.map((s) => `<h3>${s.icon} ${esc(s.title)}</h3>${s.text.map((t) => `<p>${esc(t)}</p>`).join('')}`).join('')}
      <p class="hint pl-note">From traditional palmistry, for fun and reflection. ${r.answered < STEPS.length ? `Based on ${r.answered} of ${STEPS.length} steps; the ones you skipped are left out.` : ''}</p>
      <div class="actions"><button type="button" class="primary" id="save-reading">Save reading</button><button type="button" class="secondary" id="share-reading">Share</button></div>
      <div class="actions"><button type="button" class="secondary" id="change">Change answers</button><button type="button" class="secondary" id="restart">Read again</button></div>
    </div>`;
}

function go(step) {
  state.step = Math.min(Math.max(0, step), STEPS.length - 1);
  save();
  renderReader();
  $('reader').scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function finish() {
  state.done = true;
  save();
  renderReader();
  $('reader').scrollIntoView({ block: 'start', behavior: 'smooth' });
}

let advanceTimer;
$('reader').addEventListener('click', async (e) => {
  const pick = e.target.closest('[data-pick]');
  if (pick) {
    const step = STEPS[state.step];
    state.answers[step.id] = pick.dataset.pick;
    save();
    renderReader();
    // A moment to see the choice, then on to the next step.
    clearTimeout(advanceTimer);
    advanceTimer = setTimeout(() => (state.step < STEPS.length - 1 ? go(state.step + 1) : finish()), 350);
    return;
  }
  const id = e.target.closest('button')?.id;
  if (id === 'prev') { clearTimeout(advanceTimer); go(state.step - 1); }
  if (id === 'skip') { clearTimeout(advanceTimer); if (state.step < STEPS.length - 1) go(state.step + 1); else finish(); }
  if (id === 'finish') finish();
  if (id === 'change') { state.done = false; go(0); }
  if (id === 'restart') { state.answers = {}; state.done = false; go(0); }
  if (id === 'save-reading') {
    state.saved.unshift(newSaved(state.answers, newId()));
    save();
    renderSaved();
    toast('Saved. Find it under Saved.');
  }
  if (id === 'share-reading') {
    const text = readingText(state.answers);
    if (navigator.share) {
      try { await navigator.share({ title: 'My palm reading', text }); return; } catch (err) { if (err?.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(text); toast('Reading copied'); } catch { toast('Couldn’t share or copy on this browser'); }
  }
});

// ---- Photo to compare with (kept in memory only) -----------------------------------------

let photoUrl = null;
$('photo-input').addEventListener('change', () => {
  const f = $('photo-input').files[0];
  if (!f) return;
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = URL.createObjectURL(f);
  $('photo-img').src = photoUrl;
  $('photo-empty').hidden = true;
  $('photo-view').hidden = false;
  $('photo-input').value = '';
});
$('photo-remove').addEventListener('click', () => {
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = null;
  $('photo-img').removeAttribute('src');
  $('photo-empty').hidden = false;
  $('photo-view').hidden = true;
});

// ---- Learn ------------------------------------------------------------------------------------

function renderLearn() {
  const elements = `<div class="card"><h2>The four hand types</h2>
    <p class="hint">From palm shape and finger length.</p>
    ${Object.values(ELEMENTS).map((el) => `<p class="pl-learn-el"><b>${el.icon} ${esc(el.name)}</b><br>${esc(el.text)}</p>`).join('')}</div>`;
  const lines = ['heart', 'head', 'life', 'fate', 'sun'].map((line) => {
    const steps = STEPS.filter((s) => s.line === line);
    const names = { heart: 'Heart line', head: 'Head line', life: 'Life line', fate: 'Fate line', sun: 'Sun line' };
    return `<details class="card pl-learn">
      <summary><span class="pl-learn-mini">${handSvg({ look: lookFor({ fate: 'strong', sun: 'clear' }), highlight: line, size: 'tiny', label: names[line] })}</span><span><b>${names[line]}</b><small>${esc(steps[0].spot.split('.')[0])}.</small></span></summary>
      ${steps.map((s) => `<h3>${esc(s.title.replace(`${names[line]}: `, ''))}</h3>
        <ul class="pl-learn-list">${s.options.map((o) => `<li><b>${esc(o.label)}.</b> ${esc(o.meaning || '')}</li>`).join('')}</ul>`).join('')}
    </details>`;
  }).join('');
  $('learn').innerHTML = elements + lines;
}

// ---- Saved readings --------------------------------------------------------------------------

function renderSaved() {
  if (!state.saved.length) {
    $('saved').innerHTML = '<div class="card"><p class="hint">Readings you save show up here, so you can look back or compare your two hands.</p></div>';
    return;
  }
  $('saved').innerHTML = state.saved.map((s) => {
    const r = buildReading(s.answers);
    return `<details class="card pl-saved">
      <summary><span class="pl-saved-icon" aria-hidden="true">${r.icon}</span><span class="pl-saved-main"><b>${esc(r.title)}</b>
        <small>${esc(fmtDate(s.at))}${optionOf(STEPS[0], s.answers.hand) ? ` · ${esc(optionOf(STEPS[0], s.answers.hand).short)}` : ''}</small></span></summary>
      ${r.keywords.length ? `<p class="pl-keywords">${r.keywords.map((k) => `<span>${esc(k)}</span>`).join('')}</p>` : ''}
      ${r.intro ? `<p>${esc(r.intro)}</p>` : ''}
      ${r.sections.map((sec) => `<h3>${sec.icon} ${esc(sec.title)}</h3>${sec.text.map((t) => `<p>${esc(t)}</p>`).join('')}`).join('')}
      <div class="actions"><button type="button" class="secondary danger" data-delete="${esc(s.id)}">Delete</button></div>
    </details>`;
  }).join('');
}

$('saved').addEventListener('click', (e) => {
  const b = e.target.closest('[data-delete]');
  if (!b) return;
  const i = state.saved.findIndex((s) => s.id === b.dataset.delete);
  if (i < 0) return;
  const [gone] = state.saved.splice(i, 1);
  save();
  renderSaved();
  showUndo('Reading deleted', () => { state.saved.splice(i, 0, gone); save(); renderSaved(); });
});

let undoFn = null;
let undoTimer;
function showUndo(text, fn) {
  undoFn = fn;
  $('undo-text').textContent = text;
  $('undo').hidden = false;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => { $('undo').hidden = true; undoFn = null; }, 6000);
}
$('undo-btn').addEventListener('click', () => { const fn = undoFn; undoFn = null; $('undo').hidden = true; fn?.(); });

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

renderReader();
renderLearn();
renderSaved();
