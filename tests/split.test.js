import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sharesOf, expenseProblem, balances, settleUp, totalSpent, mergeGroups, encodeGroup, decodeGroup,
  encodeSummary, decodeSummary, exactShares, shareTotals, withCharges, chargesOf, personBreakdown, summaryText, crc16, parsePayNow, payNowPayload, formatAmount, inHome, rateFromTable,
} from '../src/split.js';

const IDS = ['a', 'b', 'c'];
const members = [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Ben' }, { id: 'c', name: 'Cat' }];
const exp = (id, paidBy, cents, split, extra = {}) => ({ id, paidBy, cents, split, desc: id, at: 1, updatedAt: 1, ...extra });
const equal = (among = IDS) => ({ type: 'equal', among });
const group = (expenses) => ({ id: 'g', name: 'Trip', updatedAt: 1, members, expenses });

test('equal split hands leftover cents to the first people in member order', () => {
  assert.deepEqual(sharesOf(exp('x', 'a', 1000, equal(['c', 'a', 'b'])), IDS), { a: 334, b: 333, c: 333 });
  assert.deepEqual(sharesOf(exp('x', 'a', 1001, equal(['b', 'c'])), IDS), { b: 501, c: 500 });
});

test('weighted split sums exactly to the total', () => {
  const s = sharesOf(exp('x', 'a', 1000, { type: 'weights', weights: { a: 1, b: 2, c: 0 } }), IDS);
  assert.deepEqual(s, { a: 333, b: 667 });
});

test('exact split is used as given, and must add up', () => {
  const e = exp('x', 'a', 1000, { type: 'exact', shares: { a: 300, b: 700 } });
  assert.deepEqual(sharesOf(e, IDS), { a: 300, b: 700 });
  assert.equal(expenseProblem(e), null);
  assert.match(expenseProblem({ ...e, split: { type: 'exact', shares: { a: 300, b: 600 } } }), /\$1\.00 left to assign/);
  assert.match(expenseProblem({ ...e, cents: 0 }), /amount/);
  assert.match(expenseProblem({ ...e, split: equal([]) }), /at least one/);
});

test('balances, payments and deletions', () => {
  const g = group([
    exp('dinner', 'a', 9000, equal()),
    exp('taxi', 'b', 3000, equal(['b', 'c'])),
    exp('gone', 'c', 99900, equal(), { deleted: true }),
  ]);
  assert.deepEqual(balances(g), { a: 6000, b: -1500, c: -4500 });
  assert.equal(totalSpent(g), 12000);
  g.expenses.push(exp('pay', 'c', 4500, { type: 'exact', shares: { a: 4500 } }, { kind: 'payment' }));
  assert.deepEqual(balances(g), { a: 1500, b: -1500, c: 0 });
  assert.equal(totalSpent(g), 12000, 'payments are not spending');
});

test('settleUp needs at most n − 1 payments and clears every balance', () => {
  const net = { a: 6000, b: -1500, c: -4500, d: 2000, e: -2000 };
  const ids = Object.keys(net);
  const t = settleUp(net, ids);
  assert.ok(t.length <= ids.length - 1);
  const after = { ...net };
  for (const p of t) { after[p.from] += p.cents; after[p.to] -= p.cents; }
  assert.ok(Object.values(after).every((c) => c === 0));
  assert.deepEqual(t[0], { from: 'c', to: 'a', cents: 4500 });
  assert.deepEqual(settleUp({ a: 0, b: 0 }), []);
});

test('merging copies keeps everyone\'s additions, edits and deletions, in either order', () => {
  const base = group([exp('dinner', 'a', 9000, equal())]);
  const mine = { ...base, expenses: [...base.expenses, exp('mine', 'a', 100, equal(), { updatedAt: 5 })] };
  const theirs = {
    ...base,
    name: 'Bangkok trip',
    updatedAt: 3,
    members: [...members, { id: 'd', name: 'Dan', updatedAt: 3 }],
    expenses: [exp('dinner', 'a', 9500, equal(), { updatedAt: 4 }), exp('theirs', 'b', 200, equal(), { updatedAt: 6 })],
  };
  const ab = mergeGroups(mine, theirs);
  const ba = mergeGroups(theirs, mine);
  assert.equal(ab.changed, 2);
  assert.equal(ab.group.name, 'Bangkok trip');
  assert.equal(ab.group.members.length, 4);
  assert.deepEqual(balances(ab.group), balances(ba.group));
  assert.equal(ab.group.expenses.find((e) => e.id === 'dinner').cents, 9500);

  const deleted = { ...mine, expenses: mine.expenses.map((e) => (e.id === 'mine' ? { ...e, deleted: true, updatedAt: 9 } : e)) };
  const m = mergeGroups(mine, deleted).group;
  assert.equal(m.expenses.find((e) => e.id === 'mine').deleted, true);
  assert.equal(mergeGroups(mine, mine).changed, 0);
});

test('a group survives the share link round trip', async () => {
  const g = { ...group([exp('dinner', 'a', 9000, equal(), { desc: 'Jumbo 珍宝海鲜 🦀' })]), me: 'a' };
  const text = await encodeGroup(g);
  assert.match(text, /^[A-Za-z0-9_-]+$/);
  const back = await decodeGroup(text);
  assert.equal(back.expenses[0].desc, 'Jumbo 珍宝海鲜 🦀');
  assert.equal(back.me, undefined, '"me" stays on this phone');
  assert.equal(await decodeGroup('not-a-group'), null);
});

test('service charge then GST', () => {
  assert.equal(withCharges(10000), 11990);
  assert.equal(withCharges(10000, { serviceBp: 0, gstBp: 900 }), 10900);
  assert.deepEqual(chargesOf(10000, { serviceBp: 1000, gstBp: 0 }), { service: 1000, gst: 0, total: 11000 });
  assert.deepEqual(chargesOf(10000), { service: 1000, gst: 990, total: 11990 });
  assert.equal(withCharges(10000, { serviceBp: 0, gstBp: 0 }), 10000);
});

test('summary text for a chat', () => {
  const text = summaryText(group([exp('dinner', 'a', 9000, equal())]), 'https://x/#g=1');
  assert.ok(!summaryText(group([exp('dinner', 'a', 9000, equal())])).includes('http'), 'summary only has no link');
  assert.equal(text, '💸 Trip: $90.00 spent\n• Ben pays Ann $30.00\n• Cat pays Ann $30.00\n\nSee your breakdown and pay: https://x/#g=1');
});

test('crc16 matches the CCITT-FALSE check value', () => {
  assert.equal(crc16('123456789'), '29B1');
});

test('parsePayNow', () => {
  assert.deepEqual(parsePayNow('9123 4567'), { type: 'mobile', value: '+6591234567' });
  assert.deepEqual(parsePayNow('+65 8123-4567'), { type: 'mobile', value: '+6581234567' });
  assert.deepEqual(parsePayNow('201403121w'), { type: 'uen', value: '201403121W' });
  assert.equal(parsePayNow('6123 4567'), null);
  assert.equal(parsePayNow(''), null);
});

test('PayNow payload is well-formed SGQR with a valid checksum', () => {
  const p = payNowPayload({ proxy: { type: 'mobile', value: '+6591234567' }, cents: 1250, name: 'Ann', ref: 'Trip' });
  assert.ok(p.startsWith('000201010212'));
  assert.ok(p.includes('0009SG.PAYNOW010100211+65912345670301'));
  assert.ok(p.includes('540512.50'));
  assert.ok(p.includes('5802SG5903Ann6009Singapore62080104Trip'));
  assert.equal(p.slice(-4), crc16(p.slice(0, -4)));
  // Every top-level field's length matches its value.
  let i = 0;
  while (i < p.length) {
    const len = Number(p.slice(i + 2, i + 4));
    i += 4 + len;
  }
  assert.equal(i, p.length);
});

test('expenses in another currency count in the home currency at their saved rate', () => {
  const g = group([
    exp('hotel', 'a', 300000, equal(), { currency: 'THB', rate: 0.0385 }), // THB 3,000.00 = $115.50
    exp('massage', 'b', 120000, { type: 'exact', shares: { a: 60000, c: 60000 } }, { currency: 'THB', rate: 0.0385 }),
  ]);
  assert.equal(totalSpent(g), 11550 + 4620);
  assert.deepEqual(balances(g), { a: 11550 - 3850 - 2310, b: -3850 + 4620, c: -3850 - 2310 });
  const conv = inHome(g.expenses[1], 'SGD');
  assert.equal(Object.values(conv.split.shares).reduce((s, c) => s + c, 0), conv.cents, 'converted shares still add up');
  assert.match(expenseProblem({ ...g.expenses[0], rate: 0 }), /exchange rate for THB/);
  assert.match(expenseProblem({ ...g.expenses[1], split: { type: 'exact', shares: { a: 1000 } } }), /THB 10\.00 left|THB 1,190\.00 left/);
});

test('amounts are shown in their own currency', () => {
  assert.equal(formatAmount(123456, 'SGD'), '$1,234.56');
  assert.equal(formatAmount(123456, 'THB'), 'THB 1,234.56');
  assert.equal(formatAmount(150000, 'JPY'), 'JPY 1,500');
  assert.equal(formatAmount(-500, 'SGD'), '-$5.00');
});

test('rates come from a table based on the home currency', () => {
  assert.equal(rateFromTable({ rates: { SGD: 1, THB: 25.97 } }, 'THB'), 0.038506);
  assert.equal(rateFromTable({ rates: {} }, 'THB'), null);
});

test('the home currency travels in the link', async () => {
  const back = await decodeGroup(await encodeGroup({ ...group([]), currency: 'MYR' }));
  assert.equal(back.currency, 'MYR');
});

test('one person\'s breakdown adds up to their balance', () => {
  const pay = { id: 'p', kind: 'payment', desc: 'Payment', cents: 1000, paidBy: 'b', split: { type: 'exact', shares: { a: 1000 } }, at: 5, updatedAt: 5 };
  const g = group([
    exp('dinner', 'a', 9000, equal(), { at: 2 }),
    exp('taxi', 'b', 2000, equal(['b', 'c']), { at: 3 }),
    exp('gone', 'b', 5000, equal(), { deleted: true }),
    pay,
  ]);
  const net = balances(g);
  for (const id of IDS) assert.equal(personBreakdown(g, id).net, net[id], id);
  const a = personBreakdown(g, 'a');
  assert.deepEqual(a.items.map((i) => i.id), ['p', 'dinner'], 'newest first, only what involves Ann');
  assert.equal(a.paid, 9000);
  assert.equal(a.share, 3000);
  assert.equal(a.received, 1000);
  const b = personBreakdown(g, 'b');
  assert.equal(b.sent, 1000);
  assert.equal(b.items.find((i) => i.id === 'taxi').share, 1000);
});

test('share links are short and give back exactly the same group', async () => {
  const t = 1761800000000;
  const ms = ['Ann', 'Ben', 'Cat'].map((name, i) => ({ id: `m${i}xxxxxx`, name, updatedAt: t + i }));
  ms[2].deleted = true;
  const [a, b, c] = ms.map((m) => m.id);
  const expenses = [
    { id: 'e1', kind: 'expense', desc: 'Dinner', cents: 9000, paidBy: a, split: { type: 'equal', among: [a, b, c] }, at: t + 10, updatedAt: t + 99 },
    { id: 'e2', kind: 'expense', desc: 'Massage', cents: 120000, paidBy: b, split: { type: 'weights', weights: { a: 0, [a]: 2, [b]: 1 } }, at: t + 20, updatedAt: t + 20, currency: 'THB', rate: 0.0385 },
    { id: 'e3', kind: 'expense', desc: 'Gone', cents: 100, paidBy: a, split: { type: 'exact', shares: { [b]: 100 } }, at: t + 30, updatedAt: t + 40, deleted: true },
    { id: 'e4', kind: 'payment', desc: 'Payment', cents: 500, paidBy: b, split: { type: 'exact', shares: { [a]: 500 } }, at: t + 50, updatedAt: t + 50 },
    { id: 'old', paidBy: a, cents: 1, split: equal([a]), desc: 'no kind', at: 1, updatedAt: 1 },
  ];
  const g = { id: 'g', name: 'Bangkok', currency: 'SGD', tripId: 't1', updatedAt: t, members: ms, expenses, me: a };
  const text = await encodeGroup(g);
  const back = await decodeGroup(text);
  assert.equal(JSON.stringify(back.members), JSON.stringify(ms));
  assert.equal(JSON.stringify(back.expenses), JSON.stringify(expenses), 'same records, same key order');
  assert.equal(back.tripId, 't1');
  assert.equal(back.me, undefined);
  assert.equal(mergeGroups({ ...back, me: a }, back).changed, 0);
  // Shorter than the old long form, which still opens.
  const { encodeData } = await import('../src/sync.js');
  const v1 = await encodeData({ v: 1, id: 'g', name: 'Bangkok', currency: 'SGD', updatedAt: t, members: ms, expenses });
  assert.ok(text.length < v1.length, `${text.length} < ${v1.length}`);
  assert.equal(JSON.stringify((await decodeGroup(v1)).expenses), JSON.stringify(expenses));
});

test('a read-only summary link gives everyone the same balances, and is much shorter', async () => {
  const t = 1761800000000;
  const ms = ['Ann', 'Ben', 'Cat', 'Dan'].map((name, i) => ({ id: `id${i}abcd`, name, updatedAt: t }));
  ms[1].paynow = '91234567';
  ms[2].paynow = '98765432';
  ms.push({ id: 'gone1234', name: 'Eve', updatedAt: t, deleted: true });
  const [a, b, c, d] = ms.map((m) => m.id);
  const ex = (id, desc, cents, paidBy, split, extra = {}) => ({ id, kind: 'expense', desc, cents, paidBy, split, at: t + id.length * 1000 + desc.length, updatedAt: t, ...extra });
  const expenses = [
    ex('e1', 'Dinner', 10001, a, { type: 'equal', among: [a, b, c, d] }),
    ex('e2', 'Hotel', 50000, b, { type: 'weights', weights: { [a]: 2, [b]: 1, [c]: 1 } }),
    ex('e3x', 'Massage', 120000, c, { type: 'exact', shares: { [a]: 60000, [d]: 60000 } }, { currency: 'THB', rate: 0.0385 }),
    ex('e4xx', 'Gone', 999, a, { type: 'equal', among: [a, b] }, { deleted: true }),
    { id: 'p1', kind: 'payment', desc: 'Payment', cents: 2000, paidBy: d, split: { type: 'exact', shares: { [b]: 2000 } }, at: t + 9e6, updatedAt: t },
  ];
  const g = { id: 'g', name: 'Bangkok', currency: 'SGD', updatedAt: t, members: ms, expenses };
  const text = await encodeSummary(g, Date.UTC(2026, 9, 30, 12));
  const s = await decodeSummary(text);
  assert.equal(s.name, 'Bangkok');
  assert.deepEqual(s.members.map((m) => m.name), ['Ann', 'Ben', 'Cat', 'Dan'], 'removed people are left out');
  const byName = (grp) => Object.fromEntries(Object.entries(balances(grp)).map(([id, cents]) => [grp.members.find((m) => m.id === id).name, cents]));
  assert.deepEqual(byName(s), byName(g));
  assert.deepEqual(s.expenses.map((e) => e.desc), ['Payment', 'Massage', 'Dinner', 'Hotel'], 'newest first, no deleted ones');
  assert.equal(s.expenses[1].cents, 4620, 'converted to the home currency');
  // Only Ben is owed money here, so only his PayNow number travels.
  const owed = Object.entries(byName(g)).filter(([, cents]) => cents > 0).map(([n]) => n);
  assert.deepEqual(s.members.filter((m) => m.paynow).map((m) => m.name), owed.filter((n) => ['Ben', 'Cat'].includes(n)));
  assert.equal(new Date(s.sharedAt).toISOString().slice(0, 10), '2026-10-30');
  assert.ok(text.length < (await encodeGroup(g)).length / 2, `${text.length}`);
  assert.equal(await decodeSummary('not-a-link'), null);
  assert.equal(await decodeSummary(await encodeGroup(g)), null, 'an editable link is not a summary');
});

test('spare cents are spread around, so nobody always pays a cent more or less', () => {
  const four = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }, { id: 'd', name: 'D' }];
  const all = ['a', 'b', 'c', 'd'];
  const e = (id, cents, paidBy, at) => ({ id, kind: 'expense', desc: id, cents, paidBy, split: { type: 'equal', among: all }, at, updatedAt: at });
  // $16.35 + $32.70 + $125.35 = $174.40, exactly $43.60 each.
  const g = { id: 'g', name: 'Food', members: four, expenses: [e('wings', 1635, 'c', 3), e('pizza', 3270, 'd', 2), e('food', 12535, 'a', 1)] };
  assert.deepEqual(balances(g), { a: 12535 - 4360, b: -4360, c: 1635 - 4360, d: 3270 - 4360 });
  for (const id of all) assert.equal(personBreakdown(g, id).share, 4360, id);
  // Many uneven bills: each person's total stays within a cent of their exact share.
  const many = { ...g, expenses: Array.from({ length: 50 }, (_, i) => e(`x${i}`, 1001 + i * 37, 'a', i)) };
  const exact = many.expenses.reduce((s, x) => s + x.cents, 0) / 4;
  for (const id of all) assert.ok(Math.abs(personBreakdown(many, id).share - exact) <= 1, id);
});

test('shares are kept exact and each total is rounded once, whatever the order', () => {
  const three = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
  const e = (id, cents, paidBy, at) => ({ id, kind: 'expense', desc: id, cents, paidBy, split: { type: 'equal', among: ['a', 'b', 'c'] }, at, updatedAt: at });
  // $10 three ways is 333.33… cents each: the totals still add up to $10.
  const one = { id: 'g', name: 'G', members: three, expenses: [e('x', 1000, 'a', 1)] };
  assert.deepEqual(exactShares(one).x, { a: 1000 / 3, b: 1000 / 3, c: 1000 / 3 });
  assert.equal(Object.values(shareTotals(one)).reduce((s, c) => s + c, 0), 1000);
  // Two such bills are $6.666… each: rounded once, not 2 × $3.33 + a stray cent.
  const two = { ...one, expenses: [e('x', 1000, 'a', 1), e('y', 1000, 'b', 2)] };
  assert.deepEqual(shareTotals(two), { a: 667, b: 667, c: 666 });
  // The order bills are in, or were added in, makes no difference.
  const bills = Array.from({ length: 12 }, (_, i) => e(`b${i}`, 997 + i * 113, ['a', 'b', 'c'][i % 3], i));
  const fwd = balances({ ...one, expenses: bills });
  const rev = balances({ ...one, expenses: [...bills].reverse().map((x, i) => ({ ...x, at: i })) });
  assert.deepEqual(fwd, rev);
  assert.equal(Object.values(fwd).reduce((s, c) => s + c, 0), 0);
});
