import { keepUnreadable } from '../shared/store.js';
import { newId, encodeData, decodeData } from '../src/sync.js';
import {
  TEMPLATES, EMOJIS, template, isReusable, newList, addItems, toggleItem, editItem, removeItem, restoreItem, todo, done,
  counts, clearDone, uncheckAll, reorder, duplicate, summaryLine, listText, packList, unpackList,
} from '../src/lists.js';
import { $, esc, toast } from '../shared/ui.js';
import { holdReady } from '../shared/pwa.js';

const STORAGE_KEY = 'lists-v1';

const CHECK = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const GRIP = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><g fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></g></svg>';
const BIN = '<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// ---- Saved state ----------------------------------------------------------------------------

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.lists)) return saved;
  } catch { /* storage unavailable or corrupt: start fresh */ }
  return { lists: [] };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    toast('Could not save — your browser is blocking storage.');
  }
}

keepUnreadable(STORAGE_KEY, (s) => Array.isArray(s.lists));
const state = load();
const byId = (id) => state.lists.find((l) => l.id === id);
let current = null; // the open list
let imported = null; // a list from a "Send a copy" link, waiting to be saved
let openedFromHome = false;
let editingItem = null;

// ---- Views ------------------------------------------------------------------------------------

function route() {
  const hash = location.hash.slice(1);
  closeEditor(false);
  if (hash.startsWith('l=')) return showImport(hash.slice(2));
  const list = hash.startsWith('list=') && byId(decodeURIComponent(hash.slice(5)));
  if (list) showList(list); else showHome();
}

function setView(name) {
  for (const v of ['home', 'list', 'import']) $(`view-${v}`).hidden = v !== name;
  $('new-list').hidden = name !== 'home';
  $('more').hidden = name !== 'list';
  $('progress').hidden = name !== 'list';
  $('eyebrow').hidden = name === 'list';
  const back = $('back');
  back.textContent = name === 'home' ? '‹ Apps' : '‹ Lists';
  back.href = name === 'home' ? '../' : '#';
}

function openList(id) {
  openedFromHome = true;
  location.hash = `list=${encodeURIComponent(id)}`;
}

function goHome() {
  if (openedFromHome) { openedFromHome = false; history.back(); } else history.replaceState(null, '', location.pathname);
  route();
}

// ---- All lists -----------------------------------------------------------------------------

function showHome() {
  current = null;
  setView('home');
  document.title = 'Lists';
  const left = state.lists.reduce((n, l) => n + counts(l).left, 0);
  $('headline').textContent = state.lists.length ? `${state.lists.length} list${state.lists.length === 1 ? '' : 's'}` : 'Lists';
  $('subline').textContent = state.lists.length ? (left ? `${left} thing${left === 1 ? '' : 's'} left to tick off` : 'Everything ticked off') : 'To-dos, groceries, packing, anything';
  $('lists').innerHTML = state.lists.map((l) => {
    const c = counts(l);
    const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
    return `<li><a class="ls-list-row" href="#list=${encodeURIComponent(l.id)}" data-open="${esc(l.id)}">
      <span class="ls-emoji-badge" aria-hidden="true">${esc(l.emoji)}</span>
      <span class="ls-list-main"><strong>${esc(l.name)}</strong>
        <span class="ls-list-sub${c.total && !c.left ? ' complete' : ''}">${c.total ? `<span class="ls-mini-bar" aria-hidden="true"><i style="width:${pct}%"></i></span>` : ''}${esc(summaryLine(l))}</span></span>
      <span class="ls-chev" aria-hidden="true">›</span></a></li>`;
  }).join('');
  $('home-empty').hidden = state.lists.length > 0;
  $('quick-templates').innerHTML = TEMPLATES.map((t) => `<button type="button" class="ls-template" data-kind="${t.kind}"><b>${t.emoji}</b>${esc(t.name || 'Blank')}</button>`).join('');
}

$('lists').addEventListener('click', (e) => {
  const a = e.target.closest('[data-open]');
  if (!a) return;
  e.preventDefault();
  openList(a.dataset.open);
});

$('quick-templates').addEventListener('click', (e) => {
  const b = e.target.closest('[data-kind]');
  if (b) openSheet('new', b.dataset.kind);
});

// ---- One list ------------------------------------------------------------------------------

function showList(list) {
  current = list;
  setView('list');
  renderList();
}

function renderHeader() {
  const c = counts(current);
  document.title = current.name;
  $('headline').textContent = `${current.emoji} ${current.name}`;
  $('subline').textContent = summaryLine(current) === 'Empty' ? 'Nothing on it yet' : summaryLine(current);
  $('progress-bar').style.width = `${c.total ? (c.done / c.total) * 100 : 0}%`;
}

function itemHtml(i) {
  return `<li class="ls-item${i.done ? ' done' : ''}" data-id="${esc(i.id)}">
    <button type="button" class="ls-check" aria-pressed="${i.done}" aria-label="${i.done ? 'Untick' : 'Tick'} ${esc(i.text)}"><i>${CHECK}</i></button>
    <span class="ls-text">${esc(i.text)}</span>
    ${i.done ? '' : `<span class="ls-handle" aria-hidden="true" title="Drag to move">${GRIP}</span>`}
  </li>`;
}

function renderList(popId) {
  if (!current) return;
  renderHeader();
  const t = todo(current);
  const d = done(current);
  $('todo').innerHTML = t.map(itemHtml).join('');
  $('done').innerHTML = d.map(itemHtml).join('');
  const msg = $('all-done');
  msg.hidden = t.length > 0;
  msg.textContent = !current.items.length
    ? 'Nothing here yet. Type above to add something, or paste a list with one item per line.'
    : `All done 🎉${isReusable(current) ? ' Tap “Untick all” to use the list again.' : ''}`;
  $('done-card').hidden = !d.length;
  $('done-title').textContent = `Done · ${d.length}`;
  $('uncheck-all').hidden = !isReusable(current);
  if (popId) document.querySelector(`.ls-item[data-id="${CSS.escape(popId)}"]`)?.classList.add('pop');
}

function changed() {
  save();
  renderList();
}

// Adding: Enter keeps the keyboard up for the next item; pasting several lines adds them all.
function add(text) {
  if (!current) return;
  const r = addItems(current, text, newId);
  if (!r.added && !r.revived && !r.already) return;
  save();
  renderList(r.added === 1 ? current.items[0].id : null);
  if (r.revived && !r.added) toast(r.revived === 1 ? 'That was ticked, so it’s back on the list' : `${r.revived} ticked items are back on the list`);
  else if (r.already && !r.added && !r.revived) toast('Already on the list');
  else if (r.added > 1) toast(`Added ${r.added} items`);
}

$('add-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('add-input');
  add(input.value);
  input.value = '';
  input.focus();
});

$('add-input').addEventListener('paste', (e) => {
  const text = e.clipboardData?.getData('text') || '';
  if (!/\n/.test(text.trim())) return;
  e.preventDefault();
  add(text);
});

// Ticking: the item fades into Done after a moment, so a mistaken tap is easy to see and undo.
let settleTimer;
function onItemsClick(e) {
  const li = e.target.closest('.ls-item');
  if (!li || !current) return;
  if (e.target.closest('.ls-check')) {
    const item = toggleItem(current, li.dataset.id);
    if (!item) return;
    save();
    li.classList.toggle('done', item.done);
    li.querySelector('.ls-check').setAttribute('aria-pressed', String(item.done));
    renderHeader();
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => { if (!editingItem) renderList(); }, 450);
    return;
  }
  if (e.target.closest('.ls-del')) {
    const gone = removeItem(current, li.dataset.id);
    editingItem = null;
    changed();
    if (gone) showUndo(`Deleted “${gone.item.text}”`, () => { restoreItem(current, gone); changed(); });
    return;
  }
  if (e.target.closest('.ls-text')) openEditor(li);
}
$('todo').addEventListener('click', onItemsClick);
$('done').addEventListener('click', onItemsClick);

function openEditor(li) {
  closeEditor(true);
  const item = current.items.find((i) => i.id === li.dataset.id);
  if (!item) return;
  editingItem = item.id;
  const span = li.querySelector('.ls-text');
  const input = document.createElement('input');
  input.className = 'ls-edit';
  input.value = item.text;
  input.maxLength = 200;
  input.enterKeyHint = 'done';
  input.setAttribute('aria-label', 'Edit item');
  span.replaceWith(input);
  li.querySelector('.ls-handle')?.remove();
  li.insertAdjacentHTML('beforeend', `<button type="button" class="ls-del" aria-label="Delete ${esc(item.text)}">${BIN}</button>`);
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); closeEditor(true); }
    if (e.key === 'Escape') { e.preventDefault(); closeEditor(false); }
  });
  // Leaving the box saves, unless the tap was on the bin (that click deletes instead).
  input.addEventListener('blur', (e) => {
    if (e.relatedTarget?.closest?.('.ls-del')) return;
    setTimeout(() => { if (editingItem === item.id) closeEditor(true); }, 0);
  });
}

function closeEditor(keep) {
  if (!editingItem || !current) { editingItem = null; return; }
  const id = editingItem;
  editingItem = null;
  const input = document.querySelector('.ls-edit');
  if (keep && input) {
    const index = current.items.findIndex((i) => i.id === id);
    const gone = editItem(current, id, input.value);
    save();
    if (gone) showUndo(`Deleted “${gone.text}”`, () => { restoreItem(current, { item: gone, index }); changed(); });
  }
  renderList();
}

// Dragging by the grip reorders what's left to do.
$('todo').addEventListener('pointerdown', (e) => {
  const handle = e.target.closest('.ls-handle');
  if (!handle || !current) return;
  e.preventDefault();
  const li = handle.closest('.ls-item');
  const ul = $('todo');
  let startY = e.clientY;
  li.classList.add('dragging');
  handle.setPointerCapture(e.pointerId);
  const move = (ev) => {
    li.style.transform = `translateY(${ev.clientY - startY}px)`;
    const r = li.getBoundingClientRect();
    const mid = r.top + r.height / 2;
    const next = li.nextElementSibling;
    const prev = li.previousElementSibling;
    if (next) {
      const n = next.getBoundingClientRect();
      if (mid > n.top + n.height / 2) { ul.insertBefore(next, li); startY += n.height; }
    }
    if (prev) {
      const p = prev.getBoundingClientRect();
      if (mid < p.top + p.height / 2) { ul.insertBefore(li, prev); startY -= p.height; }
    }
    li.style.transform = `translateY(${ev.clientY - startY}px)`;
    if (ev.clientY > innerHeight - 50) scrollBy(0, 8);
    else if (ev.clientY < 80) scrollBy(0, -8);
  };
  const end = () => {
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', end);
    handle.removeEventListener('pointercancel', end);
    li.classList.remove('dragging');
    li.style.transform = '';
    reorder(current, [...ul.children].map((x) => x.dataset.id));
    changed();
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
});

$('clear-done').addEventListener('click', (e) => {
  e.preventDefault();
  const n = counts(current).done;
  const before = clearDone(current);
  const list = current;
  changed();
  showUndo(`Cleared ${n} done`, () => { list.items = before; save(); renderList(); });
});

function untickAll() {
  const list = current;
  const before = list.items.map((i) => ({ ...i }));
  uncheckAll(list);
  changed();
  showUndo('Everything unticked', () => { list.items = before; save(); renderList(); });
}
$('uncheck-all').addEventListener('click', (e) => { e.preventDefault(); untickAll(); });

$('back').addEventListener('click', (e) => {
  if ($('view-home').hidden) { e.preventDefault(); goHome(); }
});

// ---- New list and list options --------------------------------------------------------------

let sheetMode = 'new';
let pickedKind = 'todo';
let pickedEmoji = '✅';
let nameTouched = false;

function renderPickers() {
  $('kinds').innerHTML = TEMPLATES.map((t) => `<button type="button" role="radio" class="ls-template" data-kind="${t.kind}" aria-checked="${t.kind === pickedKind}"><b>${t.emoji}</b>${esc(t.name || 'Blank')}</button>`).join('');
  const emojis = EMOJIS.includes(pickedEmoji) ? EMOJIS : [pickedEmoji, ...EMOJIS];
  $('emojis').innerHTML = emojis.map((em) => `<button type="button" role="radio" data-emoji="${esc(em)}" aria-checked="${em === pickedEmoji}" aria-label="${esc(em)}">${esc(em)}</button>`).join('');
}

function openSheet(mode, kind = 'todo') {
  sheetMode = mode;
  const editing = mode === 'edit' && current;
  pickedKind = editing ? current.kind : kind;
  pickedEmoji = editing ? current.emoji : template(kind).emoji;
  nameTouched = !!editing;
  $('f-name').value = editing ? current.name : template(kind).name;
  $('sheet-title').textContent = editing ? 'List' : 'New list';
  $('sheet-save').textContent = editing ? 'Done' : 'Create';
  $('kind-field').hidden = !!editing;
  $('options').hidden = !editing;
  renderPickers();
  $('sheet').showModal();
  if (!editing) $('f-name').focus();
}

$('new-list').addEventListener('click', () => openSheet('new'));
$('more').addEventListener('click', () => openSheet('edit'));
$('sheet-cancel').addEventListener('click', () => $('sheet').close());
$('f-name').addEventListener('input', () => { nameTouched = true; });

$('kinds').addEventListener('click', (e) => {
  const b = e.target.closest('[data-kind]');
  if (!b) return;
  const t = template(b.dataset.kind);
  pickedKind = t.kind;
  pickedEmoji = t.emoji;
  if (!nameTouched || !$('f-name').value.trim()) { $('f-name').value = t.name; nameTouched = false; }
  renderPickers();
});

$('emojis').addEventListener('click', (e) => {
  const b = e.target.closest('[data-emoji]');
  if (!b) return;
  pickedEmoji = b.dataset.emoji;
  renderPickers();
});

$('sheet-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('f-name').value;
  if (sheetMode === 'edit' && current) {
    current.name = name.replace(/\s+/g, ' ').trim().slice(0, 60) || current.name;
    current.emoji = pickedEmoji;
    current.updated = Date.now();
    save();
    $('sheet').close();
    renderList();
    return;
  }
  const list = newList({ name: name.slice(0, 60), emoji: pickedEmoji, kind: pickedKind }, newId());
  state.lists.unshift(list);
  save();
  $('sheet').close();
  openList(list.id);
  setTimeout(() => $('add-input').focus(), 50);
});

async function shareOrCopy(data, copied) {
  if (navigator.share) {
    try { await navigator.share(data); return; } catch (err) { if (err?.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(data.url || data.text);
    toast(copied);
  } catch {
    toast('Couldn’t share or copy on this browser');
  }
}

$('o-share').addEventListener('click', () => {
  $('sheet').close();
  shareOrCopy({ title: current.name, text: listText(current) }, 'List copied — paste it in a chat');
});

$('o-link').addEventListener('click', async () => {
  $('sheet').close();
  const url = `${location.origin}${location.pathname}#l=${await encodeData(packList(current))}`;
  shareOrCopy({ title: current.name, text: `${current.emoji} ${current.name} — tap to save a copy:`, url }, 'Link copied');
});

$('o-uncheck').addEventListener('click', () => { $('sheet').close(); untickAll(); });

$('o-duplicate').addEventListener('click', () => {
  $('sheet').close();
  const copy = duplicate(current, newId(), newId);
  state.lists.splice(state.lists.indexOf(current) + 1, 0, copy);
  save();
  history.replaceState(null, '', `#list=${encodeURIComponent(copy.id)}`);
  route();
  toast('Copy made');
});

$('o-delete').addEventListener('click', () => {
  $('sheet').close();
  const list = current;
  const index = state.lists.indexOf(list);
  state.lists.splice(index, 1);
  save();
  goHome();
  showUndo(`Deleted “${list.name}”`, () => { state.lists.splice(index, 0, list); save(); route(); });
});

// ---- A list from a link ---------------------------------------------------------------------

async function showImport(data) {
  current = null;
  const list = unpackList(await decodeData(data), newId(), newId);
  if (!list) {
    history.replaceState(null, '', location.pathname);
    showHome();
    toast('That link doesn’t open a list');
    return;
  }
  imported = list;
  setView('import');
  document.title = list.name;
  $('headline').textContent = `${list.emoji} ${list.name}`;
  $('subline').textContent = 'Someone sent you a copy of this list';
  $('import-title').textContent = 'Save a copy?';
  const c = counts(list);
  $('import-sub').textContent = `${c.total} item${c.total === 1 ? '' : 's'}${c.done ? `, ${c.done} already ticked` : ''}. It becomes your own copy: changes you make won’t show on their phone.`;
  $('import-items').innerHTML = [...todo(list), ...done(list)].map((i) => `<li class="${i.done ? 'done' : ''}">${esc(i.text)}</li>`).join('');
}

$('import-save').addEventListener('click', () => {
  if (!imported) return;
  state.lists.unshift(imported);
  save();
  const id = imported.id;
  imported = null;
  history.replaceState(null, '', `#list=${encodeURIComponent(id)}`);
  route();
  toast('Saved to your lists');
});

$('import-cancel').addEventListener('click', () => {
  imported = null;
  history.replaceState(null, '', location.pathname);
  route();
});

// ---- Undo bar ---------------------------------------------------------------------------------

let undoFn = null;
let undoTimer;
function showUndo(text, fn) {
  undoFn = fn;
  $('undo-text').textContent = text;
  $('undo').hidden = false;
  $('toast').hidden = true;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => { $('undo').hidden = true; undoFn = null; }, 6000);
}
$('undo-btn').addEventListener('click', () => {
  const fn = undoFn;
  undoFn = null;
  $('undo').hidden = true;
  fn?.();
});

// Another tab (or a backup restore) changed the lists.
window.addEventListener('storage', (e) => {
  if (e.key !== STORAGE_KEY) return;
  const fresh = load();
  state.lists = fresh.lists;
  route();
});

window.addEventListener('hashchange', route);
Promise.resolve(route()).finally(holdReady());
