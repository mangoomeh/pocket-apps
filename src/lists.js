// Lists: to-do lists, grocery lists, packing lists, anything with things to tick off.
// A list is { id, name, emoji, kind, items: [{ id, text, done }], updated }; items keep
// the order you put them in, and ticked ones are shown apart under "Done".

export const TEMPLATES = [
  { kind: 'todo', name: 'To-do', emoji: '✅', hint: 'Things to get done' },
  { kind: 'grocery', name: 'Groceries', emoji: '🛒', hint: 'Tick as you shop, untick to reuse' },
  { kind: 'packing', name: 'Packing', emoji: '🧳', hint: 'Everything for the bag' },
  { kind: 'shopping', name: 'Shopping', emoji: '🛍️', hint: 'Things to buy' },
  { kind: 'blank', name: '', emoji: '📝', hint: 'Start from nothing' },
];

export const EMOJIS = ['📝', '✅', '🛒', '🧳', '🛍️', '🎁', '🏠', '🧹', '💼', '📚', '🎬', '🍳', '💊', '🐾', '🌱', '✈️', '🎉', '💡', '🏋️', '👶'];

export const template = (kind) => TEMPLATES.find((t) => t.kind === kind) || TEMPLATES[TEMPLATES.length - 1];

// Lists you keep ticking and unticking (a weekly shop, a packing list) rather than finishing.
export const isReusable = (list) => list.kind === 'grocery' || list.kind === 'packing';

export const MAX_TEXT = 200;
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
const same = (a, b) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

export function newList({ name, emoji, kind } = {}, id, now = Date.now()) {
  const t = template(kind);
  return { id, name: clean(name) || t.name || 'New list', emoji: emoji || t.emoji, kind: t.kind, items: [], updated: now };
}

// Items from typed or pasted text, one per line. Bullets, numbers and checkboxes from
// other apps (or from "Share as text") are taken off; a ticked box keeps the item ticked.
export function parseItems(text) {
  return String(text ?? '').split(/\r?\n/).flatMap((line) => {
    let s = line.trim();
    let done = false;
    const box = s.match(/^(?:\[( |x|X)\]|([☐☑✓✔✅]))\s*/u);
    if (box) {
      done = box[1] ? box[1] !== ' ' : box[2] !== '☐';
      s = s.slice(box[0].length);
    } else {
      s = s.replace(/^(?:[-*•·–]|\d{1,3}[.)])\s+/, '');
    }
    s = clean(s);
    return s ? [{ text: s, done }] : [];
  });
}

// Adds each line of `text` to the top of the list, in the order typed. Something already on
// the list isn't added twice: if it was ticked it comes back unticked (buying milk again).
export function addItems(list, text, makeId, now = Date.now()) {
  const result = { added: 0, revived: 0, already: 0 };
  const fresh = [];
  for (const { text: t, done } of parseItems(text)) {
    const existing = list.items.find((i) => same(i.text, t)) || fresh.find((i) => same(i.text, t));
    if (existing) {
      if (existing.done && !done) { existing.done = false; result.revived++; } else result.already++;
      continue;
    }
    fresh.push({ id: makeId(), text: t, done });
    result.added++;
  }
  list.items.unshift(...fresh);
  if (result.added || result.revived) list.updated = now;
  return result;
}

export function toggleItem(list, id, now = Date.now()) {
  const item = list.items.find((i) => i.id === id);
  if (!item) return null;
  item.done = !item.done;
  list.updated = now;
  return item;
}

// Renames an item; an empty name removes it. Returns the removed item, if any.
export function editItem(list, id, text, now = Date.now()) {
  const i = list.items.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const t = clean(text);
  list.updated = now;
  if (!t) return list.items.splice(i, 1)[0];
  list.items[i].text = t;
  return null;
}

export function removeItem(list, id, now = Date.now()) {
  const i = list.items.findIndex((x) => x.id === id);
  if (i < 0) return null;
  list.updated = now;
  return { item: list.items.splice(i, 1)[0], index: i };
}

export function restoreItem(list, { item, index }, now = Date.now()) {
  list.items.splice(Math.min(index, list.items.length), 0, item);
  list.updated = now;
}

export const todo = (list) => list.items.filter((i) => !i.done);
export const done = (list) => list.items.filter((i) => i.done);

export function counts(list) {
  const d = done(list).length;
  return { total: list.items.length, done: d, left: list.items.length - d };
}

// Removes ticked items; returns the list as it was, for Undo.
export function clearDone(list, now = Date.now()) {
  const before = list.items.slice();
  list.items = todo(list);
  list.updated = now;
  return before;
}

export function uncheckAll(list, now = Date.now()) {
  list.items.forEach((i) => { i.done = false; });
  list.updated = now;
}

// Puts the not-yet-done items in the order of `ids` (as dragged), keeping done items after them.
export function reorder(list, ids, now = Date.now()) {
  const byId = new Map(list.items.map((i) => [i.id, i]));
  const moved = ids.map((id) => byId.get(id)).filter((i) => i && !i.done);
  const rest = list.items.filter((i) => !moved.includes(i));
  list.items = [...moved, ...rest.filter((i) => !i.done), ...rest.filter((i) => i.done)];
  list.updated = now;
}

export function duplicate(list, id, makeId, now = Date.now()) {
  return { ...list, id, name: clean(`${list.name} (copy)`), items: list.items.map((i) => ({ ...i, id: makeId() })), updated: now };
}

export function summaryLine(list) {
  const c = counts(list);
  if (!c.total) return 'Empty';
  if (!c.left) return 'All done';
  return `${c.left} left${c.done ? ` · ${c.done} done` : ''}`;
}

// The list as plain text for a chat; pasting it into a list's add box adds it back.
export function listText(list) {
  const lines = [`${list.emoji} ${list.name}`.trim(), ...todo(list).map((i) => `☐ ${i.text}`)];
  const d = done(list);
  if (d.length) lines.push(...d.map((i) => `✓ ${i.text}`));
  return lines.join('\n');
}

// A compact copy of a list for a share link: [1, name, emoji, kind, [[text, done]...]].
export function packList(list) {
  return [1, list.name, list.emoji, list.kind, list.items.map((i) => (i.done ? [i.text, 1] : [i.text]))];
}

export function unpackList(packed, id, makeId, now = Date.now()) {
  if (!Array.isArray(packed) || packed[0] !== 1 || !Array.isArray(packed[4])) return null;
  const list = newList({ name: packed[1], emoji: typeof packed[2] === 'string' ? packed[2].slice(0, 8) : '', kind: packed[3] }, id, now);
  const seen = [];
  for (const row of packed[4].slice(0, 500)) {
    const text = clean(Array.isArray(row) ? row[0] : '');
    if (!text || seen.some((s) => same(s, text))) continue;
    seen.push(text);
    list.items.push({ id: makeId(), text, done: row[1] === 1 });
  }
  return list;
}
