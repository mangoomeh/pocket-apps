import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TROOPS, TRAITS, RULERS, MODIFIERS, troop, traitSummary, placement,
  PRACTICE, GOALS, newPractice, buy, mergeable, merge, place, sell, nextRound,
} from '../src/mergetactics.js';

// A shop that always offers the same troop, so tests don't depend on chance.
const always = (id) => () => PRACTICE.pool.indexOf(id) / PRACTICE.pool.length;

test('the troop list is complete and consistent', () => {
  assert.equal(new Set(TROOPS.map((t) => t.id)).size, TROOPS.length, 'ids are unique');
  for (const t of TROOPS) {
    assert.ok(TRAITS[t.trait], `${t.name}: unknown trait ${t.trait}`);
    assert.ok([2, 3, 4, 5].includes(t.cost), `${t.name}: cost ${t.cost}`);
    assert.ok(['tank', 'melee', 'ranged'].includes(t.role), `${t.name}: role`);
  }
  // October's Supers are the four Bosses, at 5 Elixir.
  assert.deepEqual(TROOPS.filter((t) => t.super).map((t) => t.name).sort(), ['Mega Knight', 'Mini P.E.K.K.A', 'Monk', 'P.E.K.K.A']);
  assert.ok(TROOPS.filter((t) => t.super).every((t) => t.cost === 5 && t.trait === 'boss'));
  // Every trait has troops, and its tiers go up.
  for (const [key, tr] of Object.entries(TRAITS)) {
    assert.ok(TROOPS.some((t) => t.trait === key), `${key} has no troops`);
    const ns = tr.tiers.map(([n]) => n);
    assert.deepEqual(ns, [...ns].sort((a, b) => a - b), `${key} tiers`);
  }
  assert.ok(RULERS.some((r) => r.name === 'Royale King'));
  assert.equal(MODIFIERS.length, 13);
  for (const pid of PRACTICE.pool) assert.ok(troop(pid), pid);
});

test('traits count different troops, and say how many more are needed', () => {
  const sum = (ids) => Object.fromEntries(traitSummary(ids).map((t) => [t.key, t]));
  let s = sum(['knight']);
  assert.equal(s.noble.tier, 0);
  assert.equal(s.noble.toNext, 1);
  s = sum(['knight', 'knight']);
  assert.equal(s.noble.count, 1, 'a duplicate counts once');
  s = sum(['knight', 'princess', 'musketeer', 'royalgiant', 'pekka']);
  assert.equal(s.noble.tier, 2);
  assert.equal(s.noble.bonus, '+30% / −30%');
  assert.equal(s.noble.toNext, 2);
  assert.equal(s.boss.tier, 1, 'Boss switches on with one troop');
  // Active traits come first.
  assert.equal(traitSummary(['bomber', 'knight', 'princess'])[0].key, 'noble');
});

test('placement puts tanks in front and ranged at the back', () => {
  const rows = placement(['musketeer', 'knight', 'valkyrie']);
  assert.deepEqual(rows.front.map((t) => t.id), ['knight']);
  assert.deepEqual(rows.middle.map((t) => t.id), ['valkyrie']);
  assert.deepEqual(rows.back.map((t) => t.id), ['musketeer']);
});

test('practice: buying spends Elixir, refreshes the slot and fills the bench', () => {
  const s = newPractice(always('knight'));
  assert.equal(s.elixir, 4);
  assert.ok(buy(s, 0, always('knight')).ok);
  assert.equal(s.elixir, 2);
  assert.equal(s.bench.length, 1);
  assert.ok(buy(s, 1, always('knight')).ok);
  assert.ok(buy(s, 2, always('knight')).error, 'out of Elixir');
});

test('practice: two of the same troop and star merge into one, up to 4 stars', () => {
  const s = newPractice(always('knight'));
  buy(s, 0, always('knight'));
  buy(s, 1, always('knight'));
  const pair = mergeable(s);
  assert.ok(pair);
  assert.ok(merge(s, pair[0].uid).ok);
  assert.equal(s.bench.length, 1);
  assert.equal(s.bench[0].star, 2);
  assert.equal(mergeable(s), null);
  // A merge keeps the board troop on the board.
  s.elixir = 99;
  place(s, s.bench[0].uid);
  buy(s, 0, always('knight')); buy(s, 0, always('knight'));
  merge(s, mergeable(s)[0].uid);
  merge(s, mergeable(s)[0].uid);
  assert.equal(s.board.length, 1);
  assert.equal(s.board[0].star, 3);
  assert.equal(s.bench.length, 0);
  // 4 stars is the top.
  s.board[0].star = 4;
  s.bench.push({ uid: 999, id: 'knight', star: 4 });
  assert.equal(mergeable(s), null);
  assert.ok(merge(s, 999).error);
});

test('practice: team size limits the board and grows each round to 6', () => {
  const s = newPractice(always('archer'));
  s.elixir = 99;
  for (let i = 0; i < 3; i++) buy(s, 0, always(PRACTICE.pool[i]));
  place(s, s.bench[0].uid);
  place(s, s.bench[0].uid);
  assert.ok(place(s, s.bench[0].uid).error, 'only 2 fit in round 1');
  assert.ok(nextRound(s).ok);
  assert.equal(s.team, 3);
  assert.equal(s.elixir, 99 - 6 + 4);
  for (let i = 0; i < 10; i++) nextRound(s);
  assert.equal(s.team, 6);
  // Tapping a board troop sends it back to the bench.
  const u = s.board[0];
  place(s, u.uid);
  assert.ok(s.bench.includes(u));
});

test('practice: selling gives Elixir back; the bench holds 5', () => {
  const s = newPractice(always('bomber'));
  s.elixir = 99;
  for (let i = 0; i < 5; i++) assert.ok(buy(s, 0, always('bomber')).ok);
  assert.ok(buy(s, 0, always('bomber')).error, 'bench full');
  const before = s.elixir;
  assert.ok(sell(s, s.bench[0].uid).ok);
  assert.equal(s.elixir, before + 2);
  assert.equal(s.bench.length, 4);
});

test('practice goals can all be reached', () => {
  const s = newPractice(always('knight'));
  assert.equal(GOALS.filter((g) => g.done(s)).length, 0);
  s.elixir = 99;
  for (let i = 0; i < 4; i++) buy(s, 0, always('knight'));
  place(s, s.bench[0].uid);
  merge(s, mergeable(s)[0].uid);
  merge(s, mergeable(s)[0].uid);
  merge(s, mergeable(s)[0].uid);
  nextRound(s);
  s.shop[0] = 'princess';
  buy(s, 0);
  place(s, s.bench.find((u) => u.id === 'princess').uid);
  assert.deepEqual(GOALS.map((g) => g.done(s)), GOALS.map(() => true));
});
