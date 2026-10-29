import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { DECK, SUITS, SPREADS, cardById, shuffle, draw, dailyCard, overview, isCourt } from '../src/tarot.js';

// A repeatable "random" source for tests.
const seeded = (seed = 1) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

test('the deck has all 78 cards, each with meanings and a picture', () => {
  assert.equal(DECK.length, 78);
  assert.equal(new Set(DECK.map((c) => c.id)).size, 78);
  assert.equal(DECK.filter((c) => c.arcana === 'major').length, 22);
  for (const s of Object.keys(SUITS)) assert.equal(DECK.filter((c) => c.suit === s).length, 14, s);
  for (const c of DECK) {
    for (const k of ['up', 'upText', 'rev', 'revText']) assert.ok(c[k] && c[k].length > 3, `${c.name}: ${k}`);
    assert.ok(existsSync(new URL(`../tarot/${c.img}`, import.meta.url)), `${c.name}: missing ${c.img}`);
  }
  assert.equal(cardById('major-00').name, 'The Fool');
  assert.equal(cardById('major-21').name, 'The World');
  assert.equal(cardById('cups-01').name, 'Ace of Cups');
  assert.equal(cardById('pentacles-14').name, 'King of Pentacles');
  assert.ok(isCourt(cardById('swords-11')));
  assert.ok(!isCourt(cardById('swords-10')));
});

test('spreads have a meaning and a place for every position', () => {
  assert.equal(new Set(SPREADS.map((s) => s.id)).size, SPREADS.length);
  for (const s of SPREADS) {
    for (const [name, about, [col, row]] of s.positions) {
      assert.ok(name && about, s.id);
      assert.ok(col >= 1 && col <= s.cols && row >= 1 && row <= s.rows, `${s.id} ${name}`);
    }
  }
  assert.equal(SPREADS.find((s) => s.id === 'celtic').positions.length, 10);
});

test('shuffling keeps every card once and is fair', () => {
  const ids = DECK.map((c) => c.id);
  const out = shuffle(ids, seeded(7));
  assert.equal(out.length, 78);
  assert.deepEqual([...out].sort(), [...ids].sort());
  assert.notDeepEqual(out, ids);
  // Each card lands on top about equally often.
  const rand = seeded(42);
  const top = {};
  for (let i = 0; i < 78 * 400; i++) { const id = shuffle(ids, rand)[0]; top[id] = (top[id] || 0) + 1; }
  const counts = Object.values(top);
  assert.equal(counts.length, 78);
  assert.ok(Math.min(...counts) > 300 && Math.max(...counts) < 520, `${Math.min(...counts)}–${Math.max(...counts)}`);
});

test('drawing gives different cards, reversed only when allowed', () => {
  const cards = draw('celtic', { rand: seeded(3) });
  assert.equal(cards.length, 10);
  assert.equal(new Set(cards.map((c) => c.id)).size, 10);
  assert.ok(draw('three', { reversals: false, rand: seeded(5) }).every((c) => !c.reversed));
  const many = Array.from({ length: 200 }, (_, i) => draw('one', { rand: seeded(i + 1) })[0]);
  assert.ok(many.some((c) => c.reversed) && many.some((c) => !c.reversed));
});

test('the card of the day stays the same all day and changes between days', () => {
  assert.deepEqual(dailyCard('2026-10-29', 9), dailyCard('2026-10-29', 9));
  const week = ['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'].map((d) => dailyCard(d, 9).id);
  assert.ok(new Set(week).size >= 4);
  assert.ok(cardById(dailyCard('2026-01-01').id));
});

test('the overview notices majors, a strong suit, court cards and reversals', () => {
  const majors = overview([{ id: 'major-01' }, { id: 'major-10' }, { id: 'cups-03' }].map((c) => ({ ...c, reversed: false })));
  assert.ok(majors.some((n) => /Major Arcana/.test(n)));
  assert.ok(majors.some((n) => /All upright/.test(n)));
  const cups = overview([{ id: 'cups-02' }, { id: 'cups-09' }, { id: 'wands-04' }].map((c) => ({ ...c, reversed: true })));
  assert.ok(cups.some((n) => /No Major Arcana/.test(n)));
  assert.ok(cups.some((n) => /Mostly Cups/.test(n)));
  assert.ok(cups.some((n) => /Mostly reversed/.test(n)));
  assert.ok(overview([{ id: 'cups-12' }, { id: 'swords-13' }, { id: 'major-17' }].map((c) => ({ ...c, reversed: false }))).some((n) => /court cards/.test(n)));
  assert.ok(overview([{ id: 'cups-01' }, { id: 'swords-01' }, { id: 'major-00' }].map((c) => ({ ...c, reversed: false }))).some((n) => /Ace/.test(n)));
  assert.deepEqual(overview([{ id: 'major-00', reversed: false }]), []);
});
