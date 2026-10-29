import { DECK, SUITS, SPREADS, cardById, spreadById, draw, dailyCard, overview } from '../src/tarot.js';

const STORAGE_KEY = 'tarot-v1';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function load() {
  const defaults = { spread: 'three', reversals: true, question: '', current: null, daily: null, journal: [], seed: Math.floor(Math.random() * 2 ** 31), filter: 'all' };
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s && Array.isArray(s.journal)) return { ...defaults, ...s };
  } catch { /* ignore */ }
  return defaults;
}
const state = load();
const persist = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ } };

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmtDate = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// ---- Cards -------------------------------------------------------------------------------------------

// A card: its back, or its face (upside down when reversed). Tapping a face opens its details.
function cardHtml(c, { faceUp = true, label = '', idx = null, small = false } = {}) {
  const k = cardById(c.id);
  return `<button type="button" class="tc ${faceUp ? 'up' : ''} ${small ? 'small' : ''}" ${idx != null ? `data-flip="${idx}"` : ''} data-card="${k.id}" data-rev="${c.reversed ? 1 : 0}"
      aria-label="${faceUp ? esc(`${k.name}${c.reversed ? ', reversed' : ''}`) : 'Face-down card: tap to turn over'}">
    <span class="tc-in">
      <span class="tc-back" aria-hidden="true"><span>🌙</span></span>
      <span class="tc-face"><img src="${k.img}" alt="" loading="lazy" class="${c.reversed ? 'rev' : ''}"></span>
    </span>
    ${label ? `<span class="tc-label">${esc(label)}</span>` : ''}
  </button>`;
}

const meaning = (c) => {
  const k = cardById(c.id);
  return { k, keywords: c.reversed ? k.rev : k.up, text: c.reversed ? k.revText : k.upText };
};
const suitLine = (k) => (k.arcana === 'major' ? `Major Arcana · ${k.rank}` : `${SUITS[k.suit].emoji} ${SUITS[k.suit].name} · ${SUITS[k.suit].element}`);

function openDetail(id, reversed = false) {
  const k = cardById(id);
  $('detail').innerHTML = `<form method="dialog" class="tr-detail">
      <img src="${k.img}" alt="${esc(k.name)}" class="${reversed ? 'rev' : ''}">
      <h2>${esc(k.name)}</h2>
      <p class="hint">${suitLine(k)}</p>
      <div class="tr-mean ${reversed ? '' : 'on'}"><h3>⬆️ Upright <small>${esc(k.up)}</small></h3><p>${esc(k.upText)}</p></div>
      <div class="tr-mean ${reversed ? 'on' : ''}"><h3>⬇️ Reversed <small>${esc(k.rev)}</small></h3><p>${esc(k.revText)}</p></div>
      ${k.arcana === 'minor' ? `<p class="hint">${SUITS[k.suit].name} are about ${SUITS[k.suit].about}.</p>` : ''}
      <button class="primary" value="close">Close</button>
    </form>`;
  $('detail').showModal();
}
$('detail').addEventListener('click', (e) => { if (e.target === $('detail')) $('detail').close(); });

// ---- Card of the day ---------------------------------------------------------------------------------

function renderDaily() {
  const key = today();
  const c = dailyCard(key, state.seed);
  const shown = state.daily === key;
  const m = meaning(c);
  $('daily').innerHTML = `<div class="tr-daily">
      ${cardHtml(c, { faceUp: shown, idx: 'daily' })}
      <div>
        <h2>Card of the day</h2>
        ${shown ? `<p><b>${esc(m.k.name)}</b>${c.reversed ? ' <small>(reversed)</small>' : ''}</p><p class="hint">${esc(m.keywords)}</p><p>${esc(m.text)}</p>`
    : '<p class="hint">One card for today, the same all day. Tap it to turn it over.</p>'}
      </div>
    </div>`;
}
$('daily').addEventListener('click', (e) => {
  const b = e.target.closest('.tc');
  if (!b) return;
  if (state.daily !== today()) { state.daily = today(); persist(); renderDaily(); return; }
  openDetail(b.dataset.card, b.dataset.rev === '1');
});

// ---- A reading ---------------------------------------------------------------------------------------

let shuffling = false;

function renderReading() {
  const r = state.current;
  if (!r) return renderSetup();
  const spread = spreadById(r.spread);
  const all = r.revealed.every(Boolean);
  const slots = spread.positions.map(([name, , [col, row]], i) => {
    const crossing = r.spread === 'celtic' && i === 1;
    return `<div class="tr-slot ${crossing ? 'cross' : ''}" style="grid-column:${col};grid-row:${row}">${cardHtml(r.cards[i], { faceUp: r.revealed[i], label: `${i + 1}. ${name}`, idx: i })}</div>`;
  }).join('');
  const lines = spread.positions.map(([name, about], i) => {
    if (!r.revealed[i]) return `<li class="tr-line hidden"><span class="tr-n">${i + 1}</span><div><b>${esc(name)}</b> <small>${esc(about)}</small><p class="hint">Not turned over yet.</p></div></li>`;
    const m = meaning(r.cards[i]);
    return `<li class="tr-line"><span class="tr-n">${i + 1}</span><div><b>${esc(name)}</b> <small>${esc(about)}</small>
      <p><button type="button" class="linkish" data-card="${m.k.id}" data-rev="${r.cards[i].reversed ? 1 : 0}">${esc(m.k.name)}</button>${r.cards[i].reversed ? ' <span class="tr-rev">reversed</span>' : ''} · <span class="hint">${esc(m.keywords)}</span></p>
      <p>${esc(m.text)}</p></div></li>`;
  }).join('');
  const notes = all ? overview(r.cards) : [];
  $('reading').innerHTML = `<div class="card">
      <h2>${spread.emoji} ${esc(spread.name)}</h2>
      ${r.question ? `<p class="tr-q">“${esc(r.question)}”</p>` : ''}
      <div class="tr-spread s-${r.spread}" style="--cols:${spread.cols};--rows:${spread.rows}">${slots}</div>
      ${all ? '' : `<p class="hint tr-center">Tap each card to turn it over.</p><div class="actions"><button type="button" class="secondary" id="reveal-all">Turn them all over</button></div>`}
    </div>
    <div class="card"><h2>What the cards say</h2><ol class="tr-lines">${lines}</ol></div>
    ${all ? `<div class="card"><h2>The whole picture</h2>
        ${notes.length ? `<ul class="notes">${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '<p class="hint">A mixed spread: read each card in its place.</p>'}
        <p class="hint">What stands out to you? Your first reaction to a picture is often the most useful part.</p>
        <label class="field"><span>Your notes <small>(optional)</small></span><textarea id="note" rows="3" placeholder="What does this bring up for you?">${esc(r.note || '')}</textarea></label>
        <div class="actions"><button type="button" class="primary" id="save" ${r.saved ? 'disabled' : ''}>${r.saved ? 'Saved to Journal ✓' : 'Save to Journal'}</button></div>
      </div>` : ''}
    <div class="actions"><button type="button" class="secondary" id="new">New reading</button></div>`;
}

function renderSetup() {
  $('reading').innerHTML = `<div class="card">
      <h2>New reading</h2>
      <label class="field"><span>Your question <small>(optional)</small></span>
        <input id="question" value="${esc(state.question)}" placeholder="e.g. What do I need to know about my new job?" autocomplete="off"></label>
      <p class="hint">Open questions work best. Not sure? Just think about what's on your mind.</p>
      <p class="tr-label">Choose a spread</p>
      <div class="tr-spreads">${SPREADS.map((s) => `<label class="tr-spreadpick"><input type="radio" name="spread" value="${s.id}" ${s.id === state.spread ? 'checked' : ''}>
        <span>${s.emoji}</span><b>${esc(s.name)}</b><small>${s.positions.length} card${s.positions.length > 1 ? 's' : ''} · ${esc(s.about)}</small></label>`).join('')}</div>
      <label class="check"><input type="checkbox" id="reversals" ${state.reversals ? 'checked' : ''}> Cards can come out reversed (upside down)</label>
      <div class="tr-deck ${shuffling ? 'shuffling' : ''}" aria-hidden="true"><span></span><span></span><span></span></div>
      <button type="button" class="primary tr-go" id="draw" ${shuffling ? 'disabled' : ''}>${shuffling ? 'Shuffling…' : '🔀 Shuffle and draw'}</button>
    </div>`;
}

$('reading').addEventListener('input', (e) => {
  if (e.target.id === 'question') { state.question = e.target.value; persist(); }
  if (e.target.name === 'spread') { state.spread = e.target.value; persist(); }
  if (e.target.id === 'reversals') { state.reversals = e.target.checked; persist(); }
  if (e.target.id === 'note' && state.current) { state.current.note = e.target.value; state.current.saved = false; persist(); const s = $('save'); if (s) { s.disabled = false; s.textContent = 'Save to Journal'; } }
});

$('reading').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const r = state.current;
  if (b.id === 'draw' && !shuffling) {
    shuffling = true;
    renderSetup();
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => {
      const cards = draw(state.spread, { reversals: state.reversals });
      state.current = { spread: state.spread, question: state.question.trim(), cards, revealed: cards.map(() => false), at: Date.now(), note: '', saved: false };
      shuffling = false;
      persist();
      renderReading();
      $('reading').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }, reduce ? 0 : 1100);
    return;
  }
  if (b.id === 'reveal-all' && r) { r.revealed = r.revealed.map(() => true); persist(); renderReading(); return; }
  if (b.id === 'new') { state.current = null; state.question = ''; persist(); renderSetup(); window.scrollTo(0, 0); return; }
  if (b.id === 'save' && r) {
    const entry = { ...r, note: ($('note')?.value || '').trim() };
    delete entry.revealed; delete entry.saved;
    const i = state.journal.findIndex((j) => j.at === r.at);
    if (i >= 0) state.journal[i] = entry; else state.journal.unshift(entry);
    r.saved = true;
    persist();
    renderReading();
    renderJournal();
    return;
  }
  if (b.dataset.flip != null && r) {
    const i = Number(b.dataset.flip);
    if (!r.revealed[i]) { r.revealed[i] = true; persist(); renderReading(); return; }
  }
  if (b.dataset.card) openDetail(b.dataset.card, b.dataset.rev === '1');
});

// ---- All the cards -----------------------------------------------------------------------------------

function renderGrid() {
  const filters = [['all', 'All 78'], ['major', '🌟 Major'], ...Object.entries(SUITS).map(([k, s]) => [k, `${s.emoji} ${s.name}`])];
  $('filter').innerHTML = filters.map(([k, label]) => `<label class="chip-toggle"><input type="radio" name="tf" value="${k}" ${state.filter === k ? 'checked' : ''}>${label}</label>`).join('');
  const q = $('search').value.trim().toLowerCase();
  const list = DECK.filter((k) => (state.filter === 'all' || (state.filter === 'major' ? k.arcana === 'major' : k.suit === state.filter))
    && (!q || `${k.name} ${k.up} ${k.rev} ${k.upText} ${k.suit ? SUITS[k.suit].about : ''}`.toLowerCase().includes(q)));
  $('grid').innerHTML = list.length ? list.map((k) => `<button type="button" class="tr-thumb" data-card="${k.id}">
      <img src="${k.img}" alt="" loading="lazy"><b>${esc(k.name)}</b><small>${esc(k.up)}</small></button>`).join('')
    : '<p class="hint">No cards match.</p>';
}
$('filter').addEventListener('change', (e) => { state.filter = e.target.value; persist(); renderGrid(); });
$('search').addEventListener('input', renderGrid);
$('grid').addEventListener('click', (e) => { const b = e.target.closest('[data-card]'); if (b) openDetail(b.dataset.card); });

$('suits').innerHTML = Object.values(SUITS).map((s) => `<li><span>${s.emoji}</span><div><b>${s.name}</b> · ${s.element}<br><small>${s.about}</small></div></li>`).join('');

// ---- Journal -----------------------------------------------------------------------------------------

function renderJournal() {
  if (!state.journal.length) {
    $('journal').innerHTML = '<div class="card"><h2>Journal</h2><p class="hint">Readings you save appear here, so you can look back at them later.</p></div>';
    return;
  }
  $('journal').innerHTML = state.journal.map((j, n) => {
    const spread = spreadById(j.spread);
    return `<details class="card tr-entry">
      <summary><b>${spread.emoji} ${esc(spread.name)}</b> <small>${fmtDate(j.at)}</small>${j.question ? `<p class="tr-q">“${esc(j.question)}”</p>` : ''}
        <span class="tr-mini">${j.cards.map((c) => cardHtml(c, { small: true })).join('')}</span></summary>
      <ol class="tr-lines">${spread.positions.map(([name], i) => { const m = meaning(j.cards[i]); return `<li class="tr-line"><span class="tr-n">${i + 1}</span><div><b>${esc(name)}:</b> ${esc(m.k.name)}${j.cards[i].reversed ? ' <span class="tr-rev">reversed</span>' : ''}<br><small class="hint">${esc(m.keywords)}</small></div></li>`; }).join('')}</ol>
      ${j.note ? `<p class="tr-note">📝 ${esc(j.note)}</p>` : ''}
      <button type="button" class="secondary small danger" data-del="${n}">Delete</button>
    </details>`;
  }).join('');
}
$('journal').addEventListener('click', (e) => {
  const del = e.target.closest('[data-del]');
  if (del) {
    if (!confirm('Delete this reading?')) return;
    state.journal.splice(Number(del.dataset.del), 1);
    persist();
    renderJournal();
    return;
  }
  const c = e.target.closest('.tc');
  if (c && e.target.closest('.tr-entry[open]')) openDetail(c.dataset.card, c.dataset.rev === '1');
});

// ---- Tabs --------------------------------------------------------------------------------------------

function switchTab(name) {
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

renderDaily();
renderReading();
renderGrid();
renderJournal();
