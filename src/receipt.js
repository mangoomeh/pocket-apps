// Pulls the totals out of receipt text (from OCR or pasted from Live Text / Google Lens)
// and compares them with the bill tracked in the app. Money is in integer cents.

import { billLines, computeBill } from './sushiro.js';

// OCR often misreads digits and decimal points; tidy the common cases.
function normaliseLine(line) {
  return line
    .replace(/(?<=\d)[oO](?=\d|\b)/g, '0')
    .replace(/(?<=\d)\s*[.,:]\s*(?=\d{2}\b)/g, '.')
    // A faint decimal point can vanish on thermal paper: "$ 46 00" at the end of a line.
    .replace(/(\$\s?\d{1,4}) (\d{2})\s*$/, '$1.$2')
    .replace(/S\$/g, '$');
}

// The last money amount on a line, e.g. "Svc Chg 10%   3.45" -> 345. Percentages are ignored.
export function amountOnLine(line) {
  const matches = [...normaliseLine(line).matchAll(/(-?)\$?\s?(\d{1,5})\.(\d{2})(?!\d|\s*%)/g)];
  if (!matches.length) return null;
  const [, minus, whole, frac] = matches[matches.length - 1];
  return (minus ? -1 : 1) * (Number(whole) * 100 + Number(frac));
}

const LABELS = {
  subtotal: /sub\s*-?\s*tota[l1i]/i,
  service: /serv[il1]ce|svc|s\s*\/\s*c\b|svr\s*chg|serv\s*chg|charge/i,
  gst: /\bg\s*s\s*t\b|exclusive/i,
  total: /(grand\s*)?t[o0]ta[l1i]|amount\s*due|nett\s*amount|balance\s*due/i,
};
const NOT_TOTAL = /sub\s*-?\s*t[o0]ta|qty|item|[t1i]ender|cash|change|paid|visa|master|nets|card/i;

export function parseReceiptText(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const found = { subtotalCents: null, serviceCents: null, gstCents: null, totalCents: null };
  let grandTotal = null;

  lines.forEach((line, i) => {
    // An amount can sit on the label's line or, in some OCR output, on the next line.
    const amount = amountOnLine(line) ?? (lines[i + 1] && !/[a-z]{3}/i.test(lines[i + 1]) ? amountOnLine(lines[i + 1]) : null);
    if (amount == null) return;
    if (LABELS.subtotal.test(line)) found.subtotalCents ??= amount;
    else if (LABELS.service.test(line)) found.serviceCents ??= amount;
    else if (LABELS.gst.test(line)) {
      // Skip "GST included in total" style lines that just repeat the total.
      if (!/incl/i.test(line) || found.gstCents == null) found.gstCents ??= amount;
    } else if (LABELS.total.test(line) && !NOT_TOTAL.test(line)) {
      if (/grand/i.test(line)) grandTotal = amount;
      found.totalCents = amount; // the last "Total" line wins
    }
  });
  if (grandTotal != null) found.totalCents = grandTotal;

  // No labelled total: if the parts are there, add them up.
  if (found.totalCents == null && found.subtotalCents != null) {
    found.totalCents = found.subtotalCents + (found.serviceCents ?? 0) + (found.gstCents ?? 0);
  }
  return found;
}

// ---- Item lines ---------------------------------------------------------------------------
// Sushiro receipts list items by price, e.g. "$2.3 Sushi   20   $ 46.00" (unit price,
// name, quantity, line total). Photos of thermal paper read imperfectly, so this is
// forgiving: "$" often comes out as 8, 5, S or §, a 1 as | or l, and decimal points
// vanish. Each line is cross-checked with unit price × quantity = line total.

const DIGITISH = { '|': '1', l: '1', I: '1', i: '1', ')': '1', ']': '1', '!': '1', Z: '2', z: '2', O: '0', o: '0', D: '0', S: '5', s: '5', B: '8', '&': '8', g: '9' };
const toDigits = (t) => [...t].map((c) => DIGITISH[c] ?? c).join('').replace(/\D/g, '');

// Chawanmushi is checked before sushi, since it ends in "...ushi".
const CATEGORIES = [
  ['Chawanmushi', /ch?a[uvw]|haw|m[uv]sh|rush|wan/i],
  ['Sushi', /[sz5][uv][sz5]?h|[uv]sh[il1|]|[uv]sh\b|sus/i],
  ['Soup', /s[o0]u?p|[o0]up/i],
  ['Dish', /d[il1|!]?[sg]?[ghc]h|d[il1|!]sh|[il1|\[]sh\b|[il1|\[]gh|ish|igh/i],
];

function parseItemLine(raw) {
  const line = raw.trim().replace(/[§€£]/g, '$').replace(/¢/g, '2');
  // Unit price first: "$2.3", "S2.9", "$3 5", or "82.3"/"52.8" with the $ misread as 8 or 5.
  const m = /^(?:\$+\s*|S\s*(?=\d)|[85](?=\d\s*[.,]\s*\d))(\d{1,2})\s*[.,]?\s*(\d)\d?\b\s*(.*)$/.exec(line);
  if (!m) return null;
  const unitCents = Number(m[1]) * 100 + Number(m[2]) * 10;
  const rest = m[3];
  // Split the rest into name words, then a quantity, then the line total.
  const tokens = rest.split(/\s+/).filter(Boolean);
  let k = 0;
  const nameWords = [];
  while (k < tokens.length && /[a-z]{2,}/i.test(tokens[k]) && !/^\$/.test(tokens[k])) nameWords.push(tokens[k++]);
  if (!nameWords.length) return null;
  const nameRaw = nameWords.join(' ');
  const category = CATEGORIES.find(([, re]) => re.test(nameRaw));
  if (!category) return null;
  const qtyTok = tokens[k] && !/^\$/.test(tokens[k]) ? tokens[k++] : null;
  const qtyRead = qtyTok ? Number(toDigits(qtyTok)) || null : null;
  // A leading S on the total is a misread $, not a 5.
  const amountDigits = toDigits(tokens.slice(k).join('').replace(/^S(?=\s*\d)/, ''));
  const amountRead = amountDigits.length >= 3 ? Number(amountDigits) : null;

  let qty = null;
  let sure = false;
  if (qtyRead && amountRead && qtyRead * unitCents === amountRead) { qty = qtyRead; sure = true; }
  else if (amountRead) {
    // Trust the line total if it's (nearly) a whole number of items.
    const q = Math.round(amountRead / unitCents);
    if (q >= 1 && q <= 99 && Math.abs(amountRead - q * unitCents) <= Math.max(10, unitCents * 0.1)) { qty = q; sure = amountRead === q * unitCents || q === qtyRead; }
  }
  if (qty == null && qtyRead && qtyRead <= 99) qty = qtyRead;
  if (qty == null) return null;
  return { name: category[0], unitCents, qty, cents: unitCents * qty, sure };
}

export function parseReceiptItems(text) {
  return String(text).split(/\r?\n/).map(parseItemLine).filter(Boolean);
}

// Splits receipt items into plate counts (sushi lines whose price matches a plate colour)
// and everything else.
export function matchPlates(items, plates) {
  const counts = {};
  const others = [];
  for (const item of items) {
    const plate = item.name === 'Sushi' && plates.find((p) => p.cents === item.unitCents);
    if (plate) counts[plate.id] = (counts[plate.id] || 0) + item.qty;
    else others.push(item);
  }
  return { counts, others, itemsCents: items.reduce((n, i) => n + i.cents, 0) };
}

// Fills in or corrects the totals using how the bill is built (service charge, then GST):
// a misread total can be recovered from the subtotal and the other way round.
export function reconcileTotals(found, rates) {
  const billOf = (sub) => computeBill([{ cents: sub }], rates).totalCents;
  const subOf = (total) => {
    const guess = Math.round(total / billOf(10000) * 10000);
    for (let d = 0; d <= 5; d++) for (const s of [guess - d, guess + d]) if (s > 0 && billOf(s) === total) return s;
    return null;
  };
  let { subtotalCents: sub, totalCents: total } = found;
  const fromService = found.serviceCents && rates.serviceBp ? Math.round(found.serviceCents * 10000 / rates.serviceBp) : null;
  if (sub != null && total != null && billOf(sub) !== total) {
    // They disagree: keep the subtotal if the service charge line backs it up, else trust the total.
    if (fromService != null && Math.abs(fromService - sub) <= 5) total = billOf(sub);
    else sub = subOf(total);
  }
  if (total == null && sub == null && fromService != null) sub = fromService;
  if (total == null && sub != null) total = billOf(sub);
  if (sub == null && total != null) sub = subOf(total);
  const bill = sub != null ? computeBill([{ cents: sub }], rates) : null;
  return {
    subtotalCents: sub,
    serviceCents: bill ? bill.serviceCents : found.serviceCents,
    gstCents: bill ? bill.gstCents : found.gstCents,
    totalCents: total,
  };
}

// Everything the app needs from a receipt's text.
export function analyseReceipt(text, plates, rates) {
  const totals = reconcileTotals(parseReceiptText(text), rates);
  const items = parseReceiptItems(text);
  const { counts, others, itemsCents } = matchPlates(items, plates);
  return {
    ...totals,
    counts,
    others,
    itemsCents,
    // All items were read if they add up to the subtotal.
    complete: items.length > 0 && totals.subtotalCents != null && itemsCents === totals.subtotalCents,
  };
}

// Compares the tracked bill with the receipt total and, when they differ, suggests
// which plate(s) might explain it (using each plate's price after charges).
export function compareWithReceipt(trackedTotalCents, receiptTotalCents, plates, rates) {
  if (receiptTotalCents == null) return { status: 'unknown' };
  const diffCents = receiptTotalCents - trackedTotalCents;
  if (diffCents === 0) return { status: 'match', diffCents };

  // Allow a cent either way for rounding differences.
  if (Math.abs(diffCents) <= 1) return { status: 'rounding', diffCents };

  const suggestions = [];
  for (const p of plates) {
    const nett = computeBill(billLines([p], { [p.id]: 1 }, []), rates).totalCents;
    for (let n = 1; n <= 5; n++) {
      if (Math.abs(Math.abs(diffCents) - nett * n) <= 1) suggestions.push({ plate: p, count: n });
    }
  }
  return { status: diffCents > 0 ? 'receipt-higher' : 'receipt-lower', diffCents, suggestions };
}
