import { keepUnreadable } from '../shared/store.js';
import { newId } from '../src/sync.js';
import {
  STEPS, buildReading, answeredCount, lookFor, handSvg, newSaved, readingText, optionOf, content,
} from '../src/palm.js';
import { $, esc, switchTab, toast } from '../shared/ui.js';

const STORAGE_KEY = 'palm-v1';
const defaultLang = () => (/^zh\b/i.test(navigator.language || '') ? 'zh' : 'en');

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s && Array.isArray(s.saved)) return { answers: {}, step: 0, done: false, lang: defaultLang(), ...s };
  } catch { /* storage unavailable or corrupt: start fresh */ }
  return { answers: {}, step: 0, done: false, saved: [], lang: defaultLang() };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    toast(t('Could not save — your browser is blocking storage.', '无法保存：浏览器阻止了存储。'));
  }
}

keepUnreadable(STORAGE_KEY, (s) => Array.isArray(s.saved));
const state = load();
state.step = Math.min(Math.max(0, state.step | 0), STEPS.length - 1);

// The language: t(english, chinese) picks one; C() is the palm content in it.
const zh = () => state.lang === 'zh';
const t = (en, cn) => (zh() ? cn : en);
const C = () => content(state.lang);

const LINE_NAMES = { heart: ['Heart line', '感情线'], head: ['Head line', '智慧线'], life: ['Life line', '生命线'], fate: ['Fate line', '事业线'], sun: ['Sun line', '太阳线'] };
const lineName = (line) => t(...LINE_NAMES[line]);
const fmtDate = (ms) => (zh()
  ? new Date(ms).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
  : new Date(ms).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }));

// ---- Read: one step at a time, then the reading ------------------------------------------

function renderReader() {
  $('photo-card').hidden = state.done; // the photo is for comparing while answering
  if (state.done) return renderReading();
  const step = C().STEPS[state.step];
  const chosen = state.answers[step.id];
  const pct = Math.round((state.step / STEPS.length) * 100);
  const lineLabel = step.line ? t(`A palm with the ${lineName(step.line).toLowerCase()} highlighted`, `标出${lineName(step.line)}的手掌`) : t('A palm', '手掌');
  const big = step.id === 'hand' ? '' : `<div class="pl-figure">${handSvg({ look: lookFor(state.answers), highlight: step.line || null, label: lineLabel })}</div>`;
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
      <p class="pl-step-count">${t(`Step ${state.step + 1} of ${STEPS.length}`, `第 ${state.step + 1} 步，共 ${STEPS.length} 步`)}</p>
      <h2>${esc(step.title)}</h2>
      ${big}
      <p class="pl-spot">${esc(step.spot)}</p>
      <div class="pl-opts pl-opts-${step.options.length}" role="group" aria-label="${esc(step.title)}">${options}</div>
      <div class="pl-nav">
        <button type="button" class="secondary" id="prev" ${state.step === 0 ? 'disabled' : ''}>${t('Back', '上一步')}</button>
        <button type="button" class="text-btn" id="skip">${chosen ? t('Next', '下一步') : t('Not sure, skip', '不确定，跳过')}</button>
      </div>
      ${answeredCount(state.answers) >= 3 && state.step < STEPS.length - 1 ? `<button type="button" class="text-btn pl-finish" id="finish">${t('See my reading now', '现在看我的解读')}</button>` : ''}
    </div>`;
}

const keywordChips = (r, max = 8) => (r.keywords.length ? `<p class="pl-keywords">${r.keywords.slice(0, max).map((k) => `<span>${esc(k)}</span>`).join('')}</p>` : '');
const sectionsHtml = (r) => r.sections.map((s) => `<h3>${s.icon} ${esc(s.title)}</h3>${s.text.map((x) => `<p>${esc(x)}</p>`).join('')}`).join('');

function renderReading() {
  const r = buildReading(state.answers, state.lang);
  if (!r.answered) {
    $('reader').innerHTML = `<div class="card"><p>${t('You skipped every step, so there’s nothing to read yet.', '你跳过了所有步骤，所以还没有可以解读的内容。')}</p>
      <div class="actions"><button type="button" class="primary" id="restart">${t('Start again', '重新开始')}</button></div></div>`;
    return;
  }
  const based = r.answered < STEPS.length
    ? t(`Based on ${r.answered} of ${STEPS.length} steps; the ones you skipped are left out.`, `根据 ${STEPS.length} 步中的 ${r.answered} 步；跳过的部分不包括在内。`)
    : '';
  $('reader').innerHTML = `
    <div class="card pl-reading">
      <div class="pl-reading-head">
        <div class="pl-figure small">${handSvg({ look: lookFor(state.answers), label: t('Your palm as you described it', '你描述的手掌') })}</div>
        <div><p class="pl-reading-icon" aria-hidden="true">${r.icon}</p><h2>${esc(r.title)}</h2>${keywordChips(r)}</div>
      </div>
      ${r.intro ? `<p class="pl-intro">${esc(r.intro)}</p>` : ''}
      ${sectionsHtml(r)}
      <p class="hint pl-note">${t('From traditional palmistry, for fun and reflection.', '依据传统手相学，仅供娱乐与自我反思。')} ${based}</p>
      <div class="actions"><button type="button" class="primary" id="save-reading">${t('Save reading', '保存解读')}</button><button type="button" class="secondary" id="share-reading">${t('Share', '分享')}</button></div>
      <div class="actions"><button type="button" class="secondary" id="change">${t('Change answers', '修改答案')}</button><button type="button" class="secondary" id="restart">${t('Read again', '重新看')}</button></div>
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
    toast(t('Saved. Find it under Saved.', '已保存，可以在“已保存”里找到。'));
  }
  if (id === 'share-reading') {
    const text = readingText(state.answers, state.lang);
    if (navigator.share) {
      try { await navigator.share({ title: t('My palm reading', '我的手相解读'), text }); return; } catch (err) { if (err?.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(text); toast(t('Reading copied', '解读已复制')); } catch { toast(t('Couldn’t share or copy on this browser', '这个浏览器无法分享或复制')); }
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
  const { STEPS: steps, ELEMENTS: elements } = C();
  const types = `<div class="card"><h2>${t('The four hand types', '四种手型')}</h2>
    <p class="hint">${t('From palm shape and finger length.', '由手掌形状和手指长度决定。')}</p>
    ${Object.values(elements).map((el) => `<p class="pl-learn-el"><b>${el.icon} ${esc(el.name)}</b><br>${esc(el.text)}</p>`).join('')}</div>`;
  const lines = Object.keys(LINE_NAMES).map((line) => {
    const forLine = steps.filter((s) => s.line === line);
    // The step's own topic after "Heart line: " (or "感情线：").
    const topic = (s) => s.title.replace(/^[^:：]+[:：]\s*/, '');
    const intro = forLine[0].spot.split(/(?<=[.。])/)[0];
    return `<details class="card pl-learn">
      <summary><span class="pl-learn-mini">${handSvg({ look: lookFor({ fate: 'strong', sun: 'clear' }), highlight: line, size: 'tiny', label: lineName(line) })}</span><span><b>${esc(lineName(line))}</b><small>${esc(intro)}</small></span></summary>
      ${forLine.map((s) => `${forLine.length > 1 ? `<h3>${esc(topic(s))}</h3>` : ''}
        <ul class="pl-learn-list">${s.options.map((o) => `<li><b>${esc(o.label)}${t('.', '。')}</b> ${esc(o.meaning || '')}</li>`).join('')}</ul>`).join('')}
    </details>`;
  }).join('');
  $('learn').innerHTML = types + lines;
}

// ---- Saved readings --------------------------------------------------------------------------

function renderSaved() {
  if (!state.saved.length) {
    $('saved').innerHTML = `<div class="card"><p class="hint">${t('Readings you save show up here, so you can look back or compare your two hands.', '你保存的解读会出现在这里，方便回顾，或比较你的两只手。')}</p></div>`;
    return;
  }
  const handStep = C().STEPS[0];
  $('saved').innerHTML = state.saved.map((s) => {
    const r = buildReading(s.answers, state.lang);
    const hand = optionOf(handStep, s.answers.hand);
    return `<details class="card pl-saved">
      <summary><span class="pl-saved-icon" aria-hidden="true">${r.icon}</span><span class="pl-saved-main"><b>${esc(r.title)}</b>
        <small>${esc(fmtDate(s.at))}${hand ? ` · ${esc(hand.short)}` : ''}</small></span></summary>
      ${keywordChips(r, 12)}
      ${r.intro ? `<p>${esc(r.intro)}</p>` : ''}
      ${sectionsHtml(r)}
      <div class="actions"><button type="button" class="secondary danger" data-delete="${esc(s.id)}">${t('Delete', '删除')}</button></div>
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
  showUndo(t('Reading deleted', '已删除解读'), () => { state.saved.splice(i, 0, gone); save(); renderSaved(); });
});

let undoFn = null;
let undoTimer;
function showUndo(text, fn) {
  undoFn = fn;
  $('undo-text').textContent = text;
  $('undo-btn').textContent = t('Undo', '撤销');
  $('undo').hidden = false;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => { $('undo').hidden = true; undoFn = null; }, 6000);
}
$('undo-btn').addEventListener('click', () => { const fn = undoFn; undoFn = null; $('undo').hidden = true; fn?.(); });

// ---- Language -----------------------------------------------------------------------------------

// Static text carries its Chinese in data-zh; the English is the original markup.
function applyLanguage() {
  document.documentElement.lang = zh() ? 'zh-Hans' : 'en';
  document.title = t('Palm Reading', '看手相');
  document.querySelectorAll('[data-zh]').forEach((el) => {
    if (el.dataset.en == null) el.dataset.en = el.innerHTML;
    el.innerHTML = zh() ? el.dataset.zh : el.dataset.en;
  });
  $('photo-img').alt = t('Your palm', '你的手掌');
  document.querySelector(`input[name="lang"][value="${state.lang}"]`).checked = true;
}

function renderAll() {
  applyLanguage();
  renderReader();
  renderLearn();
  renderSaved();
}

document.querySelectorAll('input[name="lang"]').forEach((el) => el.addEventListener('input', () => {
  state.lang = el.value;
  save();
  renderAll();
}));

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

renderAll();
