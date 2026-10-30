// Pure group-expense logic. Money is in integer cents. A group is shared between
// friends' phones by link, so every record carries an id and an updatedAt and two
// copies of a group can be merged in any order and end up the same (src/sync.js).
//
// A group has a home currency (SGD unless chosen otherwise) that balances are kept in.
// An expense can be in another currency: its amount is in that currency's cents, and it
// stores the rate used (home currency per 1 unit), so balances don't move later.

import { formatCents } from './cash.js';
import { newId, newer, mergeList, countChanged, encodeData, decodeData } from './sync.js';

export { newId };

export const CURRENCIES = ['SGD', 'MYR', 'THB', 'IDR', 'VND', 'PHP', 'JPY', 'KRW', 'TWD', 'HKD', 'CNY', 'AUD', 'NZD', 'USD', 'EUR', 'GBP', 'CHF'];
export const homeOf = (group) => group.currency || 'SGD';

// An amount in cents of `currency`, e.g. $12.50 for SGD, or "THB 1,200.00" / "JPY 1,500".
export function formatAmount(cents, currency = 'SGD') {
  if (currency === 'SGD') return formatCents(cents);
  try {
    return new Intl.NumberFormat('en-SG', { style: 'currency', currency, currencyDisplay: 'code' }).format(cents / 100).replace(/\u00a0/g, ' ');
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

// Splits `total` in proportion to `parts` ({ id: n }), handing leftover cents to the
// largest remainders (ties in key order), so the pieces always add up to `total`.
function proportional(total, parts, order) {
  const ids = order.filter((id) => parts[id] > 0);
  const sum = ids.reduce((s, id) => s + parts[id], 0);
  if (!sum) return {};
  const out = {};
  const rems = ids.map((id) => {
    const exact = (total * parts[id]) / sum;
    out[id] = Math.floor(exact);
    return { id, frac: exact - out[id] };
  });
  let left = total - ids.reduce((s, id) => s + out[id], 0);
  for (const r of [...rems].sort((a, b) => b.frac - a.frac)) {
    if (left-- <= 0) break;
    out[r.id] += 1;
  }
  return out;
}

// The expense with its amounts converted to the group's home currency.
export function inHome(expense, home) {
  if (!expense.currency || expense.currency === home) return expense;
  const cents = Math.round(expense.cents * expense.rate);
  const split = expense.split.type === 'exact'
    ? { type: 'exact', shares: proportional(cents, expense.split.shares, Object.keys(expense.split.shares)) }
    : expense.split;
  return { ...expense, cents, split, currency: home };
}

// Amount each member owes for one expense, as { memberId: cents }, summing exactly
// to the expense total. Leftover cents from rounding go to the first people in
// member order, so every phone works out the same split.
export function sharesOf(expense, memberIds) {
  const { cents, split } = expense;
  const order = (ids) => memberIds.filter((id) => ids.includes(id));
  if (split.type === 'exact') return { ...split.shares };
  if (split.type === 'weights') return proportional(cents, split.weights, order(Object.keys(split.weights)));
  const ids = order(split.among);
  if (!ids.length) return {};
  const base = Math.floor(cents / ids.length);
  const extra = cents - base * ids.length;
  return Object.fromEntries(ids.map((id, i) => [id, base + (i < extra ? 1 : 0)]));
}

// What's wrong with an expense before it can be saved, or null if it's fine.
export function expenseProblem(expense) {
  if (!(expense.cents > 0)) return 'Enter an amount.';
  if (!expense.paidBy) return 'Choose who paid.';
  if (expense.currency && !(expense.rate > 0)) return `Enter the exchange rate for ${expense.currency}.`;
  const { split } = expense;
  if (split.type === 'equal' && !split.among.length) return 'Pick at least one person to split with.';
  if (split.type === 'weights' && !Object.values(split.weights).some((w) => w > 0)) return 'Give at least one person a share.';
  if (split.type === 'exact') {
    const sum = Object.values(split.shares).reduce((s, c) => s + c, 0);
    if (sum !== expense.cents) {
      const diff = expense.cents - sum;
      const fmt = (c) => formatAmount(c, expense.currency || 'SGD');
      return `The amounts add up to ${fmt(sum)}: ${fmt(Math.abs(diff))} ${diff > 0 ? 'left to assign' : 'too much'}.`;
    }
  }
  return null;
}

const live = (list) => list.filter((x) => !x.deleted);

// Net balance per member: positive means they are owed money, negative means they owe.
// A payment between friends is stored as an expense the payer "paid" for the receiver.
export function balances(group) {
  const ids = live(group.members).map((m) => m.id);
  const allIds = group.members.map((m) => m.id);
  const net = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const raw of live(group.expenses)) {
    const e = inHome(raw, homeOf(group));
    net[e.paidBy] = (net[e.paidBy] || 0) + e.cents;
    for (const [id, c] of Object.entries(sharesOf(e, allIds))) net[id] = (net[id] || 0) - c;
  }
  return net;
}

// How one person's balance adds up: the expenses they paid for or have a share of
// (newest first, in the home currency), the payments they sent or got, and the totals.
// paid − share + sent − received is their balance.
export function personBreakdown(group, id) {
  const allIds = group.members.map((m) => m.id);
  const out = { items: [], paid: 0, share: 0, sent: 0, received: 0 };
  for (const raw of live(group.expenses)) {
    const e = inHome(raw, homeOf(group));
    if (e.kind === 'payment') {
      const to = Object.keys(e.split.shares)[0];
      if (e.paidBy === id) { out.sent += e.cents; out.items.push({ id: e.id, kind: 'payment', to, cents: e.cents, at: e.at }); }
      if (to === id) { out.received += e.cents; out.items.push({ id: e.id, kind: 'payment', from: e.paidBy, cents: e.cents, at: e.at }); }
      continue;
    }
    const paid = e.paidBy === id ? e.cents : 0;
    const share = sharesOf(e, allIds)[id] || 0;
    if (!paid && !share) continue;
    out.paid += paid;
    out.share += share;
    out.items.push({ id: e.id, kind: 'expense', desc: e.desc, paidBy: e.paidBy, cents: e.cents, paid, share, at: e.at });
  }
  out.items.sort((a, b) => b.at - a.at);
  out.net = out.paid - out.share + out.sent - out.received;
  return out;
}

// Fewest-ish payments to settle everyone up: the biggest debtor pays the biggest
// creditor until one of them is square, repeated. Gives at most n − 1 payments.
export function settleUp(net, memberIds = Object.keys(net)) {
  const rank = (id) => memberIds.indexOf(id);
  const side = (pick) => memberIds.filter((id) => pick(net[id] || 0)).map((id) => ({ id, cents: Math.abs(net[id]) }));
  const creditors = side((c) => c > 0);
  const debtors = side((c) => c < 0);
  const byAmount = (a, b) => b.cents - a.cents || rank(a.id) - rank(b.id);
  const out = [];
  while (creditors.length && debtors.length) {
    creditors.sort(byAmount);
    debtors.sort(byAmount);
    const c = creditors[0];
    const d = debtors[0];
    const cents = Math.min(c.cents, d.cents);
    out.push({ from: d.id, to: c.id, cents });
    c.cents -= cents;
    d.cents -= cents;
    if (!c.cents) creditors.shift();
    if (!d.cents) debtors.shift();
  }
  return out;
}

export function totalSpent(group) {
  return live(group.expenses).filter((e) => e.kind !== 'payment').reduce((s, e) => s + inHome(e, homeOf(group)).cents, 0);
}

// ---- Merging copies of a group -------------------------------------------------------

const SHARED = ['id', 'name', 'currency', 'tripId', 'updatedAt'];
const head = (g) => Object.fromEntries(SHARED.map((k) => [k, g[k]]));

// Merges a received copy of a group into ours. Returns the merged group and how
// many expenses were new or changed, for the "updated" message.
export function mergeGroups(mine, theirs) {
  const expenses = mergeList(mine.expenses, theirs.expenses);
  return {
    group: { ...mine, ...newer(head(mine), head(theirs)), members: mergeList(mine.members, theirs.members), expenses },
    changed: countChanged(mine.expenses, expenses),
  };
}

// ---- Share links ---------------------------------------------------------------------

// The group as a compact string for the link's #hash. Only the shared fields are
// included (not who "me" is on this phone).
//
// Links use a short form (v2): records become arrays without key names, people in
// expenses are referred to by their place in the member list, and times are counted
// from the earliest one. Each record is rebuilt and compared before it goes in, so the
// link always gives back exactly the same group; a record that doesn't fit the short
// form travels as it is. Old v1 links (a plain object) still open.
export function encodeGroup(group) {
  const ids = group.members.map((m) => m.id);
  const times = [...group.members, ...group.expenses].flatMap((r) => [r.at, r.updatedAt]).filter(Number.isFinite);
  const base = times.length ? Math.min(...times) : 0;
  const pack = (record, short, unpack) => {
    try {
      const packed = short(record);
      if (JSON.stringify(unpack(packed, ids, base)) === JSON.stringify(record)) return packed;
    } catch { /* doesn't fit the short form */ }
    return record;
  };
  return encodeData([2, group.id, group.name, group.currency || 0, group.tripId || 0, group.updatedAt || 0, base,
    group.members.map((m) => pack(m, (x) => packMember(x, base), unpackMember)),
    group.expenses.map((e) => pack(e, (x) => packExpense(x, ids, base), unpackExpense))]);
}

const SPLITS = ['equal', 'weights', 'exact'];
const SPLIT_KEY = { equal: 'among', weights: 'weights', exact: 'shares' };

function packMember(m, base) {
  const out = [m.id, m.name, m.updatedAt - base];
  if (m.deleted) out.push(1);
  return out;
}
function unpackMember([id, name, t, deleted], ids, base) {
  const m = { id, name, updatedAt: base + t };
  if (deleted) m.deleted = true;
  return m;
}

function packExpense(e, ids, base) {
  const who = (id) => { const i = ids.indexOf(id); if (i < 0) throw new Error('unknown member'); return i; };
  const t = SPLITS.indexOf(e.split.type);
  const split = t === 0
    ? [0, ...e.split.among.map(who)]
    : [t, ...Object.entries(e.split[SPLIT_KEY[e.split.type]]).flatMap(([id, n]) => [who(id), n])];
  const out = [e.id, e.kind === 'payment' ? 1 : 0, e.desc, e.cents, who(e.paidBy), split, e.at - base, e.updatedAt - e.at];
  if (e.currency || e.deleted) out.push(e.currency || 0, e.rate || 0);
  if (e.deleted) out.push(1);
  return out;
}
function unpackExpense([id, kind, desc, cents, payer, [t, ...rest], at, upd, currency, rate, deleted], ids, base) {
  const type = SPLITS[t];
  let detail = rest.map((i) => ids[i]);
  if (t > 0) {
    detail = {};
    for (let i = 0; i < rest.length; i += 2) detail[ids[rest[i]]] = rest[i + 1];
  }
  const e = { id, kind: kind ? 'payment' : 'expense', desc, cents, paidBy: ids[payer], split: { type, [SPLIT_KEY[type]]: detail }, at: base + at, updatedAt: base + at + upd };
  if (currency) Object.assign(e, { currency, rate });
  if (deleted) e.deleted = true;
  return e;
}

// Short-form v2 back to a v1-shaped object.
function unpackGroup([, id, name, currency, tripId, updatedAt, base, members, expenses]) {
  const g = { v: 1, id, name, updatedAt, members: [], expenses: [] };
  if (currency) g.currency = currency;
  if (tripId) g.tripId = tripId;
  g.members = members.map((m) => (Array.isArray(m) ? unpackMember(m, null, base) : m));
  const ids = g.members.map((m) => m.id);
  g.expenses = expenses.map((e) => (Array.isArray(e) ? unpackExpense(e, ids, base) : e));
  return g;
}

export async function decodeGroup(text) {
  let g = await decodeData(text);
  try {
    if (Array.isArray(g) && g[0] === 2) g = unpackGroup(g);
  } catch {
    return null;
  }
  if (!g || g.v !== 1 || !g.id || !Array.isArray(g.members) || !Array.isArray(g.expenses)) return null;
  const group = { ...head(g), name: String(g.name || 'Group'), updatedAt: g.updatedAt || 0, members: g.members, expenses: g.expenses };
  if (!CURRENCIES.includes(group.currency)) delete group.currency;
  return group;
}

// ---- Read-only summary links ----------------------------------------------------------

// What a friend needs to see what they owe, and nothing else: names, and each expense's
// description, amount (in the home currency), who paid and who shares it. No ids, times
// or deleted records, so the link is short and can't be merged or edited. PayNow numbers
// go in only for people who are owed money, so the QR works for paying them.
//
// [3, name, currency, names, paynows, items, day shared], newest item first. An expense is
// [desc, cents, payer, split]: split is a bitmask of who shares it equally, or a list of
// cents per person. A payment is [0, cents, from, to].
export function encodeSummary(group, now = Date.now()) {
  const home = homeOf(group);
  const items = live(group.expenses).sort((a, b) => b.at - a.at);
  const used = new Set(items.flatMap((e) => [e.paidBy, ...Object.keys(e.split.shares || e.split.weights || {}), ...(e.split.among || [])]));
  const people = group.members.filter((m) => !m.deleted || used.has(m.id));
  const ids = people.map((m) => m.id);
  const ix = (id) => ids.indexOf(id);
  const net = balances(group);
  const paynows = people.map((m) => (net[m.id] > 0 && parsePayNow(m.paynow) ? m.paynow : 0));
  while (paynows.length && !paynows[paynows.length - 1]) paynows.pop();
  const packed = items.map((raw) => {
    const e = inHome(raw, home);
    if (e.kind === 'payment') return [0, e.cents, ix(e.paidBy), ix(Object.keys(e.split.shares)[0])];
    let split;
    if (e.split.type === 'equal' && ids.length <= 30) split = e.split.among.reduce((mask, id) => (ix(id) >= 0 ? mask | (1 << ix(id)) : mask), 0);
    else {
      const shares = sharesOf(e, group.members.map((m) => m.id));
      split = ids.map((id) => shares[id] || 0);
    }
    return [e.desc, e.cents, ix(e.paidBy), split];
  });
  return encodeData([3, group.name, home, people.map((m) => m.name), paynows, packed, Math.floor(now / 86400000)]);
}

// The summary back as a group the usual functions work on (balances, settleUp,
// personBreakdown), or null if the text isn't one.
export async function decodeSummary(text) {
  const d = await decodeData(text);
  if (!Array.isArray(d) || d[0] !== 3 || !Array.isArray(d[3]) || !Array.isArray(d[5])) return null;
  const [, name, currency, names, paynows, items, day] = d;
  const members = names.map((n, i) => ({ id: String(i), name: String(n), ...(paynows?.[i] ? { paynow: String(paynows[i]) } : {}) }));
  const id = (i) => String(i);
  try {
    const expenses = items.map(([desc, cents, payer, split], i) => {
      const e = { id: `x${i}`, kind: 'expense', desc: String(desc), cents, paidBy: id(payer), at: items.length - i };
      if (desc === 0) return { ...e, kind: 'payment', desc: 'Payment', split: { type: 'exact', shares: { [id(split)]: cents } } };
      if (Array.isArray(split)) return { ...e, split: { type: 'exact', shares: Object.fromEntries(split.map((c, j) => [id(j), c]).filter(([, c]) => c > 0)) } };
      return { ...e, split: { type: 'equal', among: names.map((_, j) => id(j)).filter((_, j) => split & (1 << j)) } };
    });
    const g = { id: 'shared', name: String(name || 'Group'), members, expenses, sharedAt: day * 86400000 || null };
    if (CURRENCIES.includes(currency)) g.currency = currency;
    return g;
  } catch {
    return null;
  }
}

// ---- Text and money ------------------------------------------------------------------

// The rate (home currency per 1 unit of `currency`) from an exchange-rate table based on
// the home currency, as open.er-api.com returns: { rates: { THB: 25.1, ... } }.
export function rateFromTable(table, currency) {
  const perHome = table?.rates?.[currency];
  return perHome > 0 ? Number((1 / perHome).toPrecision(6)) : null;
}

// Singapore service charge then GST on top (rates in basis points, 1000 = 10%), each
// optional: GST is charged on the service charge too. Returns each part and the total.
export function chargesOf(cents, { serviceBp = 1000, gstBp = 900 } = {}) {
  const service = Math.round((cents * serviceBp) / 10000);
  const gst = Math.round(((cents + service) * gstBp) / 10000);
  return { service, gst, total: cents + service + gst };
}

export const withCharges = (cents, rates) => chargesOf(cents, rates).total;

// A plain-text summary to paste into a chat.
export function summaryText(group, url) {
  const name = (id) => group.members.find((m) => m.id === id)?.name ?? '?';
  const transfers = settleUp(balances(group), group.members.map((m) => m.id));
  const money = (c) => formatAmount(c, homeOf(group));
  const lines = [`💸 ${group.name}: ${money(totalSpent(group))} spent`];
  if (!transfers.length) lines.push('Everyone is settled up 🎉');
  for (const t of transfers) lines.push(`• ${name(t.from)} pays ${name(t.to)} ${money(t.cents)}`);
  if (url) lines.push('', `Open the group: ${url}`);
  return lines.join('\n');
}

// ---- PayNow QR -----------------------------------------------------------------------

// CRC-16/CCITT-FALSE, as the SGQR / EMVCo QR spec requires for tag 63.
export function crc16(text) {
  let crc = 0xffff;
  for (const ch of new TextEncoder().encode(text)) {
    crc ^= ch << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

const tlv = (tag, value) => `${tag}${String(value.length).padStart(2, '0')}${value}`;

// Normalises a PayNow number: a Singapore mobile (8 digits starting 8 or 9, with or
// without +65) or a UEN. Returns { type: 'mobile' | 'uen', value } or null.
export function parsePayNow(text) {
  const s = String(text || '').replace(/[\s-]/g, '').toUpperCase();
  const mobile = s.match(/^(?:\+?65)?([89]\d{7})$/);
  if (mobile) return { type: 'mobile', value: `+65${mobile[1]}` };
  if (/^(\d{8,9}[A-Z]|[TSR]\d{2}[A-Z]{2}\d{4}[A-Z])$/.test(s)) return { type: 'uen', value: s };
  return null;
}

// The text inside a PayNow QR code that banking apps scan, for a fixed amount.
export function payNowPayload({ proxy, cents, name = 'NA', ref = '' }) {
  const account = tlv('00', 'SG.PAYNOW') + tlv('01', proxy.type === 'uen' ? '2' : '0') + tlv('02', proxy.value) + tlv('03', '0');
  const cleanName = (name.replace(/[^\x20-\x7e]/g, '').trim() || 'NA').slice(0, 25);
  const cleanRef = ref.replace(/[^A-Za-z0-9 -]/g, '').trim().slice(0, 25);
  const body = [
    tlv('00', '01'),
    tlv('01', '12'),
    tlv('26', account),
    tlv('52', '0000'),
    tlv('53', '702'),
    tlv('54', (cents / 100).toFixed(2)),
    tlv('58', 'SG'),
    tlv('59', cleanName),
    tlv('60', 'Singapore'),
    cleanRef ? tlv('62', tlv('01', cleanRef)) : '',
  ].join('') + '6304';
  return body + crc16(body);
}
