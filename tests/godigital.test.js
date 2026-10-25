import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { APPS, SCREENS, SHOTS, LANGS, findLesson, renderScreen, say } from '../src/godigital.js';

const lessons = APPS.flatMap((a) => a.lessons);

test('every step\'s screen exists and its button to press is on it', () => {
  for (const l of lessons) {
    for (const [i, s] of l.steps.entries()) {
      assert.ok(s.shot ? SHOTS[s.shot] : SCREENS[s.screen], `${l.id} step ${i + 1}: no screen ${s.shot || s.screen}`);
      const html = renderScreen(s);
      if (s.tap) assert.ok(html.includes(`data-id="${s.tap}"`), `${l.id} step ${i + 1}: "${s.tap}" isn't on ${s.shot || s.screen}`);
    }
  }
});

test('every screenshot is there, matches its size, and its buttons sit inside it', () => {
  for (const [key, { h, spots }] of Object.entries(SHOTS)) {
    const file = new URL(`../godigital/shots/${key.replace('.', '-')}.jpg`, import.meta.url);
    assert.ok(existsSync(file), `missing ${file.pathname}`);
    // JPEG size from the start-of-frame marker
    const b = readFileSync(file);
    let i = 2;
    while (b[i + 1] < 0xc0 || b[i + 1] > 0xc3) i += 2 + b.readUInt16BE(i + 2);
    assert.deepEqual([b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)], [600, h], key);
    for (const [id, [x, y, w, hh]] of Object.entries(spots)) assert.ok(x >= 0 && y >= 0 && w > 0 && hh > 0 && x + w <= 100 && y + hh <= 100, `${key} ${id}`);
  }
  // Every screenshot is used.
  const used = new Set(lessons.flatMap((l) => l.steps.map((s) => s.shot)));
  for (const key of Object.keys(SHOTS)) assert.ok(used.has(key), `${key} isn't used`);
});

test('everything is written in every language', () => {
  const codes = LANGS.map(([c]) => c);
  const check = (obj, where) => { for (const c of codes) assert.ok(typeof obj[c] === 'string' && obj[c].trim(), `${where}: missing ${c}`); };
  for (const app of APPS) {
    check(app, app.id);
    for (const l of app.lessons) {
      check(l, l.id);
      for (const [i, s] of l.steps.entries()) {
        check(s, `${l.id} step ${i + 1}`);
        for (const c of s.chips || []) if (typeof c !== 'string') check(c, `${l.id} step ${i + 1} chip`);
      }
    }
  }
  // Burmese text really is in Burmese script.
  for (const l of lessons) for (const s of l.steps) assert.match(s.my, /[က-႟]/, `${l.id}: ${s.en}`);
});

test('lessons have unique ids and can be found', () => {
  assert.equal(new Set(lessons.map((l) => l.id)).size, lessons.length);
  for (const l of lessons) assert.equal(findLesson(l.id).lesson, l);
  assert.equal(findLesson('nope'), null);
});

test('the guides asked for are all there', () => {
  const ids = lessons.map((l) => l.id);
  for (const id of ['grab-account', 'grab-ride', 'grab-food', 'grab-places', 'grab-pay', 'grab-cars', 'fp-order', 'dbs-paynow', 'dbs-scan', 'dbs-bills', 'dbs-safe']) assert.ok(ids.includes(id), id);
  // The car types guide covers wheelchairs.
  assert.ok(findLesson('grab-cars').lesson.steps.some((s) => /wheelchair/i.test(s.en)));
});

test('say() picks the language and falls back to English', () => {
  assert.equal(say({ en: 'Hi', zh: '你好' }, 'zh'), '你好');
  assert.equal(say({ en: 'Hi' }, 'my'), 'Hi');
  assert.equal(say('👥 4', 'my'), '👥 4');
});
