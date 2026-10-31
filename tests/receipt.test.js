import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  amountOnLine, parseReceiptText, compareWithReceipt, parseReceiptItems, matchPlates, reconcileTotals, analyseReceipt,
} from '../src/receipt.js';
import { DEFAULT_PLATES, DEFAULT_RATES, billLines, computeBill } from '../src/sushiro.js';

test('amountOnLine picks the last money amount and ignores percentages', () => {
  assert.equal(amountOnLine('Svc Chg 10%      2.76'), 276);
  assert.equal(amountOnLine('GST 9%  $2.73'), 273);
  assert.equal(amountOnLine('TOTAL  S$33.09'), 3309);
  assert.equal(amountOnLine('Total 33,09'), 3309);
  assert.equal(amountOnLine('Total 33 . 09'), 3309);
  assert.equal(amountOnLine('Total 3O.10'), 3010);
  assert.equal(amountOnLine('Table 12  Pax 2'), null);
  assert.equal(amountOnLine('Discount -2.30'), -230);
});

test('parses a typical receipt', () => {
  const r = parseReceiptText(`
    SUSHI RESTAURANT
    Table 12   Pax 2
    12 x Red Plate        27.60
    Sub Total             27.60
    Svc Chg 10%            2.76
    GST 9%                 2.73
    TOTAL                 33.09
    VISA                  33.09
  `);
  assert.deepEqual(r, { subtotalCents: 2760, serviceCents: 276, gstCents: 273, totalCents: 3309 });
});

test('handles OCR noise and amounts on the following line', () => {
  const r = parseReceiptText('SubTota1 27.60\nService Charge\n2.76\nG S T 2,73\nGrand Tota1 33.O9\nCash 50.00\nChange 16.91');
  assert.equal(r.subtotalCents, 2760);
  assert.equal(r.serviceCents, 276);
  assert.equal(r.gstCents, 273);
  assert.equal(r.totalCents, 3309);
});

test('adds up the parts when no total line was read', () => {
  const r = parseReceiptText('Subtotal 10.00\nService 1.00\nGST 0.99');
  assert.equal(r.totalCents, 1199);
});

test('compareWithReceipt', () => {
  assert.equal(compareWithReceipt(3309, 3309, DEFAULT_PLATES, DEFAULT_RATES).status, 'match');
  assert.equal(compareWithReceipt(3309, 3310, DEFAULT_PLATES, DEFAULT_RATES).status, 'rounding');
  const missedRed = compareWithReceipt(3309, 3309 + 276, DEFAULT_PLATES, DEFAULT_RATES);
  assert.equal(missedRed.status, 'receipt-higher');
  assert.deepEqual(missedRed.suggestions.map((s) => [s.plate.id, s.count]), [['red', 1]]);
  const extraGold = compareWithReceipt(3309, 3309 - 2 * 468, DEFAULT_PLATES, DEFAULT_RATES);
  assert.equal(extraGold.status, 'receipt-lower');
  assert.ok(extraGold.suggestions.some((s) => s.plate.id === 'gold' && s.count === 2));
  assert.equal(compareWithReceipt(100, null, DEFAULT_PLATES, DEFAULT_RATES).status, 'unknown');
});

// Text as read from a real Sushiro Singapore receipt (Bedok Mall), including the kind of
// noise OCR adds: a lost decimal point, S for $, O for 0 and uneven spacing.
const SUSHIRO = `SUSHIRO
311 New Upper Changi Road
Bedok Mall #01-10
RCT# 308137        PAX: 4
STAFF
$2.3 Sushi        20    $ 46.00
$2.9 Sushi         6    $ 17.40
$3.9 Sushi         2    $ 7.80
S4.9 Sushi         3    $ 14 70
$3.5 Chawanmushi   2    $ 7.00
$2.8 Soup          3    $ 8.4O
$3.5 Dish          2    $ 7.00
$4.3 Dish          1    $ 4.30
$5.0 Dish          1    $ 5.00
$9.9 Dish          1    $ 9.90
SUB TOTAL               $ 127.50
Service Charge (10.00%) $ 12.75
GST Exclusive (9.00%)   $ 12.62
TOTAL(10Qt)            $ 152.87
MASTERCARD              $ 152.87
TOTAL TENDERED         $ 152.87
CHANGE                  $ 0.00`;

test('reads the totals on a real Sushiro receipt', () => {
  assert.deepEqual(parseReceiptText(SUSHIRO), { subtotalCents: 12750, serviceCents: 1275, gstCents: 1262, totalCents: 15287 });
});

test('reads item lines and matches sushi to plate colours', () => {
  const items = parseReceiptItems(SUSHIRO).map(({ sure, ...rest }) => rest);
  assert.equal(items.length, 10);
  assert.deepEqual(items[0], { name: 'Sushi', unitCents: 230, qty: 20, cents: 4600 });
  assert.deepEqual(items[4], { name: 'Chawanmushi', unitCents: 350, qty: 2, cents: 700 });
  const { counts, others, itemsCents } = matchPlates(items, DEFAULT_PLATES);
  assert.deepEqual(counts, { red: 20, silver: 6, gold: 2, black: 3 });
  assert.deepEqual(others.map((o) => `${o.name} ${o.qty}×${o.unitCents}`), ['Chawanmushi 2×350', 'Soup 3×280', 'Dish 2×350', 'Dish 1×430', 'Dish 1×500', 'Dish 1×990']);
  assert.equal(itemsCents, 12750); // items add up to the subtotal
});

test('a garbled quantity is recovered from the line total', () => {
  const [item] = parseReceiptItems('$2.3 Sushi   2O   $ 46.00'.replace('2O', '7'));
  assert.equal(item.qty, 20);
});

test('the app computes the same bill as the receipt', () => {
  const lines = billLines(DEFAULT_PLATES, { red: 20, silver: 6, gold: 2, black: 3 },
    [{ name: 'Chawanmushi', cents: 700 }, { name: 'Soup', cents: 840 }, { name: 'Dish', cents: 700 }, { name: 'Dish', cents: 430 }, { name: 'Dish', cents: 500 }, { name: 'Dish', cents: 990 }]);
  assert.deepEqual(computeBill(lines, DEFAULT_RATES), { subtotalCents: 12750, serviceCents: 1275, gstCents: 1262, totalCents: 15287, plateCount: 31 });
});

// Lines exactly as free OCR read them from a photo of that receipt.
test('recovers items from real OCR misreads', () => {
  const read = (line) => { const [it] = parseReceiptItems(line); return it && `${it.name} ${it.qty}×${it.unitCents}`; };
  assert.equal(read('82.3 Sush 2 § 46 00'), 'Sushi 20×230'); // $→8, 20 read as 2, lost decimal point
  assert.equal(read('§¢. 3 Hush Zl § 46 10'), 'Sushi 20×230'); // garbled quantity and total
  assert.equal(read('82.9 Sushi 6 $1740'), 'Sushi 6×290');
  assert.equal(read('$4.9 Sush| 3 S147'), 'Sushi 3×490'); // total cut short: trust 3 × $4.90
  assert.equal(read('83. 9 Sushi 2 $ 7&0'), 'Sushi 2×390'); // & for 8
  assert.equal(read('$3 5 Chauanrushl 2 S700'), 'Chawanmushi 2×350');
  assert.equal(read('54.3 Digh 1 S450'), 'Dish 1×430');
  assert.equal(read('85.0 [gh 1 550'), 'Dish 1×500');
  assert.equal(read('SUB TOTAL § 127 50'), undefined);
});

test('reconciles totals that were misread or missing', () => {
  const r = (found) => reconcileTotals({ subtotalCents: null, serviceCents: null, gstCents: null, totalCents: null, ...found }, DEFAULT_RATES);
  assert.deepEqual(r({ totalCents: 15287 }), { subtotalCents: 12750, serviceCents: 1275, gstCents: 1262, totalCents: 15287 });
  assert.equal(r({ subtotalCents: 12750 }).totalCents, 15287);
  assert.equal(r({ subtotalCents: 1750, totalCents: 15287 }).subtotalCents, 12750); // "$17 50" misread
  assert.equal(r({ subtotalCents: 12750, totalCents: 15237, serviceCents: 1275 }).totalCents, 15287);
  assert.equal(r({ serviceCents: 1275 }).totalCents, 15287);
});

test('analyseReceipt says whether every item was read', () => {
  const a = analyseReceipt(SUSHIRO, DEFAULT_PLATES, DEFAULT_RATES);
  assert.equal(a.complete, true);
  assert.equal(a.totalCents, 15287);
  const partial = analyseReceipt(SUSHIRO.replace('$9.9 Dish          1    $ 9.90\n', ''), DEFAULT_PLATES, DEFAULT_RATES);
  assert.equal(partial.complete, false);
  assert.equal(partial.subtotalCents - partial.itemsCents, 990);
});
