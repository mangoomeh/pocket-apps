import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newList, parseItems, addItems, toggleItem, editItem, removeItem, restoreItem, counts, clearDone, uncheckAll, reorder,
  duplicate, summaryLine, listText, packList, unpackList, isReusable,
} from '../src/lists.js';

const ids = () => { let n = 0; return () => `i${++n}`; };

test('a new list takes its name and emoji from the template unless given', () => {
  const g = newList({ kind: 'grocery' }, 'a', 1);
  assert.deepEqual([g.name, g.emoji, g.kind, g.items.length], ['Groceries', '🛒', 'grocery', 0]);
  assert.ok(isReusable(g));
  const b = newList({ kind: 'blank', name: '  Gift   ideas ' }, 'b');
  assert.deepEqual([b.name, b.emoji], ['Gift ideas', '📝']);
  assert.equal(newList({ kind: 'nope' }, 'c').name, 'New list');
});

test('pasted text loses its bullets, numbers and boxes', () => {
  assert.deepEqual(parseItems('- Milk\n* Eggs\n• Bread\n\n1. Rice\n2) Tofu\n[x] Soap\n[ ] Salt\n☐ Kopi\n✓ Teh\n  '), [
    { text: 'Milk', done: false }, { text: 'Eggs', done: false }, { text: 'Bread', done: false },
    { text: 'Rice', done: false }, { text: 'Tofu', done: false }, { text: 'Soap', done: true },
    { text: 'Salt', done: false }, { text: 'Kopi', done: false }, { text: 'Teh', done: true },
  ]);
  assert.deepEqual(parseItems('-5°C jacket'), [{ text: '-5°C jacket', done: false }], 'a dash with no space is kept');
});

test('adding goes to the top in typed order, without doubles, and brings ticked things back', () => {
  const l = newList({ kind: 'grocery' }, 'a');
  const id = ids();
  assert.deepEqual(addItems(l, 'Milk', id), { added: 1, revived: 0, already: 0 });
  addItems(l, 'Eggs\nBread\neggs', id);
  assert.deepEqual(l.items.map((i) => i.text), ['Eggs', 'Bread', 'Milk']);
  toggleItem(l, l.items[2].id);
  assert.deepEqual(counts(l), { total: 3, done: 1, left: 2 });
  assert.deepEqual(addItems(l, 'MILK\nbread', id), { added: 0, revived: 1, already: 1 });
  assert.equal(counts(l).done, 0);
});

test('editing, removing with undo, clearing done and starting again', () => {
  const l = newList({}, 'a');
  addItems(l, 'A\nB\nC', ids());
  const [a, b, c] = l.items;
  editItem(l, a.id, '  Apples ');
  assert.equal(a.text, 'Apples');
  assert.equal(editItem(l, b.id, '   ').id, b.id, 'an emptied item is removed');
  addItems(l, 'B', () => 'b2');
  const gone = removeItem(l, c.id);
  assert.deepEqual(l.items.map((i) => i.text), ['B', 'Apples']);
  restoreItem(l, gone);
  assert.deepEqual(l.items.map((i) => i.text), ['B', 'Apples', 'C']);
  toggleItem(l, a.id); toggleItem(l, c.id);
  assert.equal(summaryLine(l), '1 left · 2 done');
  const before = clearDone(l);
  assert.deepEqual(l.items.map((i) => i.text), ['B']);
  l.items = before;
  uncheckAll(l);
  assert.equal(summaryLine(l), '3 left');
  l.items.forEach((i) => { i.done = true; });
  assert.equal(summaryLine(l), 'All done');
  assert.equal(summaryLine(newList({}, 'x')), 'Empty');
});

test('dragging reorders what is left to do and keeps done items after', () => {
  const l = newList({}, 'a');
  addItems(l, 'A\nB\nC\nD', ids());
  const [a, b, c, d] = l.items;
  toggleItem(l, b.id);
  reorder(l, [d.id, a.id, c.id]);
  assert.deepEqual(l.items.map((i) => i.text), ['D', 'A', 'C', 'B']);
  reorder(l, [c.id, 'gone']);
  assert.deepEqual(l.items.map((i) => i.text), ['C', 'D', 'A', 'B'], 'unlisted items keep their place after');
});

test('sharing as text and as a link round-trips', () => {
  const l = newList({ kind: 'packing', name: 'Bali' }, 'a');
  addItems(l, 'Passport\nSunscreen\nHat', ids());
  toggleItem(l, l.items[0].id);
  const text = listText(l);
  assert.equal(text, '🧳 Bali\n☐ Sunscreen\n☐ Hat\n✓ Passport');
  const back = newList({}, 'b');
  addItems(back, text.split('\n').slice(1).join('\n'), ids());
  assert.deepEqual(back.items.map((i) => [i.text, i.done]), [['Sunscreen', false], ['Hat', false], ['Passport', true]]);

  const copy = unpackList(JSON.parse(JSON.stringify(packList(l))), 'z', ids(), 5);
  assert.deepEqual([copy.id, copy.name, copy.emoji, copy.kind, copy.updated], ['z', 'Bali', '🧳', 'packing', 5]);
  assert.deepEqual(copy.items.map((i) => [i.text, i.done]), l.items.map((i) => [i.text, i.done]));
  assert.equal(unpackList({ evil: 1 }, 'z', ids()), null);
  assert.equal(unpackList([1, 'x', 'y', 'todo', [[''], 'x', ['ok'], ['OK']]], 'z', ids()).items.length, 1);

  const dup = duplicate(l, 'd', () => 'new');
  assert.equal(dup.name, 'Bali (copy)');
  assert.notEqual(dup.items[0].id, l.items[0].id);
  dup.items[0].text = 'changed';
  assert.equal(l.items[0].text, 'Passport', 'a copy is separate');
});
