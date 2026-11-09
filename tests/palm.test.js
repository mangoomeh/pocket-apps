import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STEPS, ELEMENTS, SECTIONS, elementOf, buildReading, answeredCount, lookFor, handSvg, newSaved, readingText, DEFAULT_LOOK,
} from '../src/palm.js';

test('every step is complete: unique ids, options with labels, and meanings where the reading needs them', () => {
  assert.equal(new Set(STEPS.map((s) => s.id)).size, STEPS.length);
  for (const s of STEPS) {
    assert.ok(s.title && s.spot && s.options.length >= 2, s.id);
    assert.ok(['intro', ...SECTIONS.map((x) => x.id)].includes(s.section), s.id);
    assert.equal(new Set(s.options.map((o) => o.id)).size, s.options.length, s.id);
    for (const o of s.options) {
      assert.ok(o.label && o.short, `${s.id}.${o.id}`);
      if (s.line || s.id === 'hand') assert.ok(o.meaning, `${s.id}.${o.id} needs a meaning`);
      for (const [k, v] of Object.entries(o.draw || {})) assert.ok(k in DEFAULT_LOOK && typeof v === 'string', `${s.id}.${o.id} draws ${k}`);
    }
  }
});

test('the four hand elements from palm shape and finger length', () => {
  assert.equal(elementOf({ palm: 'square', fingers: 'short' }), 'earth');
  assert.equal(elementOf({ palm: 'square', fingers: 'long' }), 'air');
  assert.equal(elementOf({ palm: 'long', fingers: 'long' }), 'water');
  assert.equal(elementOf({ palm: 'long', fingers: 'short' }), 'fire');
  assert.equal(elementOf({ palm: 'long' }), null);
  for (const e of Object.values(ELEMENTS)) assert.ok(e.name && e.text && e.keywords.length);
});

test('a reading gathers sections in order, skips what was skipped, and keeps keywords unique', () => {
  const r = buildReading({ hand: 'dominant', palm: 'long', fingers: 'short', heartEnd: 'index', headStart: 'separate', fate: 'none', bogus: 'x', sun: 'nope' });
  assert.equal(r.title, 'Fire hand');
  assert.match(r.intro, /dominant/);
  assert.deepEqual(r.sections.map((s) => s.id), ['character', 'love', 'mind', 'path']);
  assert.equal(r.sections[0].text.length, 1, 'the element, palm and fingers add one paragraph');
  assert.equal(new Set(r.keywords).size, r.keywords.length);
  assert.ok(r.keywords.includes('Independent') && r.keywords.includes('Loyal'));
  assert.equal(r.answered, 6, 'unknown answers are ignored');
  const none = buildReading({});
  assert.deepEqual([none.title, none.sections.length, none.answered], ['Your palm', 0, 0]);
  assert.equal(answeredCount({ hand: 'other', palm: 'square' }), 2);
});

test('the hand drawing follows the answers and highlights one line', () => {
  const look = lookFor({ palm: 'long', fingers: 'short', fate: 'faint', sun: 'clear', headStart: 'separate' });
  assert.equal(look.palm, 'long');
  assert.equal(look.heartEnd, DEFAULT_LOOK.heartEnd, 'unanswered parts keep the default');
  const svg = handSvg({ look, highlight: 'sun', label: 'Sun & "line"' });
  const [, top, h] = svg.match(/viewBox="0 (\d+) 200 (\d+)"/).map(Number);
  assert.ok(top > 0 && h < 270, 'cropped to the hand');
  const tall = handSvg({ look: { ...DEFAULT_LOOK, fingers: 'long' } }).match(/viewBox="0 (\d+)/)[1];
  assert.ok(Number(tall) < top, 'long fingers need more room above');
  assert.match(svg, /class="pl-line on" data-line="sun"/);
  assert.match(svg, /data-line="fate"[^>]+stroke-dasharray/, 'a faint fate line is dashed');
  assert.ok(svg.lastIndexOf('data-line="sun"') > svg.lastIndexOf('data-line="heart"'), 'the highlighted line is drawn on top');
  assert.doesNotMatch(handSvg({ look: { ...DEFAULT_LOOK, fate: 'none' } }), /data-line="fate"/);
  assert.doesNotMatch(svg, /NaN|undefined/);
  // Every option of every step draws without gaps.
  for (const s of STEPS) for (const o of s.options) assert.doesNotMatch(handSvg({ look: lookFor({ [s.id]: o.id }), highlight: s.line }), /NaN|undefined/, `${s.id}.${o.id}`);
});

test('saving and sharing a reading', () => {
  const answers = { palm: 'square', fingers: 'long', heartShape: 'curved' };
  const saved = newSaved(answers, 'r1', 5);
  assert.deepEqual([saved.id, saved.at, saved.title, saved.icon], ['r1', 5, 'Air hand', '🌬️']);
  answers.palm = 'long';
  assert.equal(saved.answers.palm, 'square', 'a saved reading is a copy');
  const text = readingText(saved.answers);
  assert.match(text, /^🌬️ Air hand\n\n/);
  assert.match(text, /❤️ Love and feelings\n.*curves upwards/);
  assert.match(text, /For fun and reflection/);
});
