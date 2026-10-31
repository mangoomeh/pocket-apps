import { parseAmount, formatCents } from '../src/cash.js';
import {
  DEFAULT_PLATES, DEFAULT_RATES, billLines, computeBill, parsePercent, monthSummary,
} from '../src/sushiro.js';
import { analyseReceipt, compareWithReceipt } from '../src/receipt.js';
import { readText } from './ocr.js';
import {
  getPhoto, putPhoto, deletePhoto, movePhoto, loadImage, compressForStorage, prepareForOcr,
} from './photos.js';
import { $, switchTab, toast } from '../shared/ui.js';

const STORAGE_KEY = 'sushiro-v1';

// ---- Persistent state -------------------------------------------------------

function freshMeal(outlet = '') {
  return { counts: {}, specials: [], outlet };
}

function load() {
  const defaults = {
    plates: DEFAULT_PLATES.map((p) => ({ ...p })),
    rates: { ...DEFAULT_RATES },
    meal: freshMeal(),
    visits: [],
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.plates)) return { ...defaults, ...saved };
  } catch { /* storage unavailable or corrupt: start fresh */ }
  return defaults;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    toast('Could not save — your browser is blocking storage.');
  }
}

const state = load();

const pct = (bp) => `${bp / 100}%`;
const currentBill = () => {
  const lines = billLines(state.plates, state.meal.counts, state.meal.specials);
  return { lines, bill: computeBill(lines, state.rates) };
};

// ---- Rendering --------------------------------------------------------------

function renderMeal() {
  const { lines, bill } = currentBill();

  $('header-total').textContent = formatCents(bill.totalCents);
  const extras = state.meal.specials.length ? ` + ${state.meal.specials.length} special${state.meal.specials.length > 1 ? 's' : ''}` : '';
  $('header-sub').textContent = `${bill.plateCount} plate${bill.plateCount === 1 ? '' : 's'}${extras}`;

  $('plate-list').replaceChildren(...state.plates.map((p) => {
    const n = state.meal.counts[p.id] || 0;
    const li = document.createElement('li');
    li.className = n === 0 ? 'zero' : '';
    li.innerHTML = `
      <span class="plate-dot" style="--plate:${p.color}"></span>
      <div class="label"><strong></strong><small>${formatCents(p.cents)} each${n ? ` · ${formatCents(n * p.cents)}` : ''}</small></div>
      <div class="stepper">
        <button type="button" ${n === 0 ? 'disabled' : ''}>−</button>
        <span class="count" aria-live="polite">${n}</span>
        <button type="button">+</button>
      </div>`;
    li.querySelector('strong').textContent = p.name;
    const [minus, plus] = li.querySelectorAll('button');
    minus.setAttribute('aria-label', `Remove one ${p.name} plate`);
    plus.setAttribute('aria-label', `Add one ${p.name} plate`);
    minus.addEventListener('click', () => changeCount(p.id, -1));
    plus.addEventListener('click', () => changeCount(p.id, 1));
    return li;
  }));

  $('special-list').replaceChildren(...state.meal.specials.map((s) => {
    const li = document.createElement('li');
    li.innerHTML = `<div class="label"></div><span class="price">${formatCents(s.cents)}</span>
      <button type="button" class="icon-btn" aria-label="Remove">✕</button>`;
    li.querySelector('.label').textContent = s.name || 'Special';
    li.querySelector('button').addEventListener('click', () => removeSpecial(s.id));
    return li;
  }));

  $('outlet').value = state.meal.outlet;
  $('label-service').textContent = `Service charge (${pct(state.rates.serviceBp)})`;
  $('label-gst').textContent = `GST (${pct(state.rates.gstBp)})`;
  $('row-service').hidden = state.rates.serviceBp === 0;
  $('row-gst').hidden = state.rates.gstBp === 0;
  $('bill-subtotal').textContent = formatCents(bill.subtotalCents);
  $('bill-service').textContent = formatCents(bill.serviceCents);
  $('bill-gst').textContent = formatCents(bill.gstCents);
  $('bill-total').textContent = formatCents(bill.totalCents);
  $('save-visit').disabled = lines.length === 0;
  $('split-bill').disabled = lines.length === 0;
  renderReceipt();
}

// ---- Receipt check ----------------------------------------------------------

let receiptBusy = false;
let receiptAbort = null;
let mealPhotoUrl = null;

function receiptMessage(trackedCents, receiptCents) {
  const r = compareWithReceipt(trackedCents, receiptCents, state.plates, state.rates);
  const guess = (verb) => (r.suggestions?.length
    ? ` Maybe ${r.suggestions.slice(0, 2).map((x) => `${x.count} ${x.plate.name} plate${x.count > 1 ? 's' : ''}`).join(' or ')} ${verb}?`
    : '');
  switch (r.status) {
    case 'match': return ['ok', '✔ Matches the receipt.'];
    case 'rounding': return ['ok', '✔ Matches the receipt (1¢ rounding difference).'];
    case 'receipt-higher': return ['warn', `The receipt is ${formatCents(r.diffCents)} more than you tracked.${guess('wasn’t counted')}`];
    case 'receipt-lower': return ['warn', `The receipt is ${formatCents(-r.diffCents)} less than you tracked.${guess('counted too many')}`];
    default: return ['neutral', 'Couldn’t find the total on the receipt. Type it in above.'];
  }
}

function renderReceipt() {
  const receipt = state.meal.receipt;
  $('receipt-start').hidden = receiptBusy || !!receipt;
  $('receipt-progress').hidden = !receiptBusy;
  $('receipt-result').hidden = receiptBusy || !receipt;
  if (!receipt || receiptBusy) return;

  if (document.activeElement !== $('receipt-total')) {
    $('receipt-total').value = receipt.totalCents == null ? '' : (receipt.totalCents / 100).toFixed(2);
  }
  const [tone, text] = receiptMessage(currentBill().bill.totalCents, receipt.totalCents);
  $('receipt-status').className = `status ${tone}`;
  $('receipt-status').textContent = text;

  renderReceiptItems(receipt);

  $('receipt-thumb').hidden = !receipt.hasPhoto;
  if (receipt.hasPhoto && !mealPhotoUrl) {
    getPhoto('meal').then((blob) => {
      if (!blob) return;
      mealPhotoUrl = URL.createObjectURL(blob);
      $('receipt-thumb').querySelector('img').src = mealPhotoUrl;
    }).catch(() => {});
  }
}

// What the receipt says was ordered, compared plate colour by plate colour with the meal.
function renderReceiptItems(receipt) {
  const box = $('receipt-items');
  const counts = receipt.counts || {};
  const others = receipt.others || [];
  const hasItems = Object.keys(counts).length > 0 || others.length > 0;
  box.hidden = !hasItems;
  if (!hasItems) return;

  const rows = [];
  let differs = false;
  for (const p of state.plates) {
    const onReceipt = counts[p.id] || 0;
    const tracked = state.meal.counts[p.id] || 0;
    if (!onReceipt && !tracked) continue;
    const same = onReceipt === tracked;
    differs ||= !same;
    rows.push(`<li class="${same ? 'same' : 'diff'}"><span class="plate-dot" style="--plate:${p.color}"></span>
      <span class="label"></span><span class="nums">${same ? `✔ ${onReceipt}` : `receipt ${onReceipt} · you ${tracked}`}</span></li>`);
  }
  const otherText = others.map((o) => `${o.name}${o.qty > 1 ? ` ×${o.qty}` : ''} ${formatCents(o.cents)}`).join(' · ');
  const missing = receipt.subtotalCents != null && receipt.itemsCents != null ? receipt.subtotalCents - receipt.itemsCents : 0;
  const specialsCents = state.meal.specials.reduce((n, sp) => n + sp.cents, 0);
  differs ||= others.reduce((n, o) => n + o.cents, 0) !== specialsCents;

  box.innerHTML = `
    <h4>On the receipt</h4>
    <ul class="receipt-plates">${rows.join('')}</ul>
    ${others.length ? '<p class="receipt-others"><b>Other items:</b> <span></span></p>' : ''}
    ${!receipt.complete && missing > 0 ? `<p class="hint">Some lines couldn’t be read clearly (${formatCents(missing)} of items missing). Check them against the receipt.</p>` : ''}
    ${differs ? '<button class="secondary small" type="button" id="use-receipt">Fill in this meal from the receipt</button>' : ''}`;
  const names = state.plates.filter((p) => counts[p.id] || state.meal.counts[p.id]);
  box.querySelectorAll('.receipt-plates .label').forEach((el, i) => { el.textContent = names[i].name; });
  if (others.length) box.querySelector('.receipt-others span').textContent = otherText;
  box.querySelector('#use-receipt')?.addEventListener('click', useReceiptItems);
}

function useReceiptItems() {
  const r = state.meal.receipt;
  if (!confirm('Replace this meal’s plates and specials with the items read from the receipt?')) return;
  state.meal.counts = { ...r.counts };
  state.meal.specials = (r.others || []).map((o) => ({ id: newId(), name: o.qty > 1 ? `${o.name} ×${o.qty}` : o.name, cents: o.cents }));
  save();
  renderMeal();
  toast('Meal filled in from the receipt.');
}

// Totals, plate counts and other items read from receipt text.
function readReceipt(text) {
  const a = analyseReceipt(text, state.plates, state.rates);
  return {
    text, totalCents: a.totalCents, subtotalCents: a.subtotalCents,
    counts: a.counts, others: a.others, itemsCents: a.itemsCents, complete: a.complete,
  };
}

function forgetMealPhoto() {
  if (mealPhotoUrl) URL.revokeObjectURL(mealPhotoUrl);
  mealPhotoUrl = null;
  $('receipt-thumb').querySelector('img').removeAttribute('src');
}

// A null fraction shows a moving bar, for steps with no measurable progress.
function setProgress(label, fraction) {
  $('receipt-progress-label').textContent = label;
  if (fraction == null) $('receipt-progress-bar').removeAttribute('value');
  else $('receipt-progress-bar').value = fraction;
}

async function scanReceipt(file) {
  if (!file) return;
  receiptBusy = true;
  setProgress('Preparing photo…', 0);
  renderReceipt();
  forgetMealPhoto();
  try {
    const bitmap = await loadImage(file);
    let hasPhoto = false;
    try {
      await putPhoto('meal', await compressForStorage(bitmap));
      hasPhoto = true;
    } catch {
      toast('Couldn’t keep the photo on this device, but will still read it.');
    }
    state.meal.receipt = { totalCents: null, hasPhoto, source: 'photo' };
    save();
    receiptAbort = new AbortController();
    try {
      const text = await readText(prepareForOcr(bitmap), setProgress, receiptAbort.signal);
      Object.assign(state.meal.receipt, readReceipt(text));
    } catch (err) {
      toast(`${err.message || 'Couldn’t read the receipt.'} You can type the total in instead.`);
    }
    save();
  } catch {
    toast('Couldn’t open that photo.');
  } finally {
    receiptBusy = false;
    receiptAbort = null;
    $('receipt-file').value = '';
    renderReceipt();
  }
}

function readPastedReceipt() {
  const text = $('paste-text').value;
  if (!text.trim()) return;
  state.meal.receipt = { hasPhoto: false, source: 'text', ...readReceipt(text) };
  $('paste-text').value = '';
  $('paste-box').hidden = true;
  save();
  renderReceipt();
}

function updateReceiptTotal() {
  if (!state.meal.receipt) return;
  const raw = $('receipt-total').value.trim();
  const cents = parseAmount(raw);
  if (raw && cents == null) return; // wait until it's a valid amount
  state.meal.receipt.totalCents = raw ? cents : null;
  save();
  renderReceipt();
}

async function removeReceipt() {
  state.meal.receipt = null;
  forgetMealPhoto();
  save();
  renderReceipt();
  await deletePhoto('meal').catch(() => {});
}

async function showPhoto(key) {
  const blob = await getPhoto(key).catch(() => null);
  if (!blob) {
    toast('Photo not found on this device.');
    return;
  }
  const viewer = $('photo-viewer');
  const img = viewer.querySelector('img');
  if (img.src) URL.revokeObjectURL(img.src);
  img.src = URL.createObjectURL(blob);
  viewer.showModal();
}

function receiptChip(v) {
  if (v.receipt?.totalCents == null) return '';
  const r = compareWithReceipt(v.bill.totalCents, v.receipt.totalCents, [], v.rates);
  return ['match', 'rounding'].includes(r.status)
    ? '<span class="chip ok">✔ receipt</span>'
    : `<span class="chip warn">receipt ${formatCents(v.receipt.totalCents)}</span>`;
}

function renderVisits() {
  const s = monthSummary(state.visits);
  $('stat-visits').textContent = s.visits;
  $('stat-plates').textContent = s.plates;
  $('stat-spent').textContent = formatCents(s.totalCents);

  $('visits-empty').hidden = state.visits.length > 0;
  $('visit-list').replaceChildren(...state.visits.map((v) => {
    const li = document.createElement('li');
    const when = new Date(v.at).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' });
    li.innerHTML = `
      <details class="visit">
        <summary>
          <div class="top"><strong></strong><span class="amt">${formatCents(v.bill.totalCents)}${receiptChip(v)}</span></div>
          <div class="meta">${when} · ${v.bill.plateCount} plate${v.bill.plateCount === 1 ? '' : 's'}</div>
        </summary>
        <ul class="lines"></ul>
        ${v.receipt?.hasPhoto ? '<button type="button" class="receipt-thumb" aria-label="View receipt photo"><img alt=""></button>' : ''}
        <div><button class="secondary small undo delete" type="button">Delete visit</button></div>
      </details>`;
    li.querySelector('strong').textContent = v.outlet || 'Sushiro';
    const rows = [
      ...v.lines.map((l) => [l.qty > 1 ? `${l.qty} × ${l.name}` : l.name, l.cents]),
      ['Subtotal', v.bill.subtotalCents],
      ...(v.rates.serviceBp ? [[`Service charge (${pct(v.rates.serviceBp)})`, v.bill.serviceCents]] : []),
      ...(v.rates.gstBp ? [[`GST (${pct(v.rates.gstBp)})`, v.bill.gstCents]] : []),
      ...(v.receipt?.totalCents != null ? [['Receipt total', v.receipt.totalCents]] : []),
    ];
    li.querySelector('.lines').replaceChildren(...rows.map(([label, cents]) => {
      const row = document.createElement('li');
      row.innerHTML = '<span></span><span></span>';
      row.children[0].textContent = label;
      row.children[1].textContent = formatCents(cents);
      return row;
    }));
    li.querySelector('.delete').addEventListener('click', () => deleteVisit(v.id));
    const thumb = li.querySelector('.receipt-thumb');
    if (thumb) {
      thumb.addEventListener('click', () => showPhoto(v.id));
      // Load the thumbnail only when the visit is opened.
      li.querySelector('details').addEventListener('toggle', async (e) => {
        if (!e.target.open || thumb.querySelector('img').src) return;
        const blob = await getPhoto(v.id).catch(() => null);
        if (blob) thumb.querySelector('img').src = URL.createObjectURL(blob);
      });
    }
    return li;
  }));
}

function renderSettings() {
  $('tier-list').replaceChildren(...state.plates.map((p) => {
    const row = document.createElement('div');
    row.className = 'settings-row';
    row.innerHTML = `
      <input type="color" aria-label="Colour">
      <input class="tier-name" aria-label="Name" autocomplete="off">
      <input class="tier-price" aria-label="Price" inputmode="decimal" autocomplete="off">
      <button type="button" class="icon-btn" aria-label="Remove colour">✕</button>`;
    const [color, name, price] = row.querySelectorAll('input');
    color.value = p.color;
    name.value = p.name;
    price.value = (p.cents / 100).toFixed(2);
    color.addEventListener('change', () => updateTier(p.id, { color: color.value }));
    name.addEventListener('change', () => updateTier(p.id, { name: name.value.trim() || p.name }));
    price.addEventListener('change', () => {
      const cents = parseAmount(price.value);
      if (cents == null) {
        toast('Enter a price like 2.30');
        price.value = (p.cents / 100).toFixed(2);
        return;
      }
      updateTier(p.id, { cents });
    });
    row.querySelector('button').addEventListener('click', () => removeTier(p.id));
    return row;
  }));
  $('rate-service').value = state.rates.serviceBp / 100;
  $('rate-gst').value = state.rates.gstBp / 100;
}

function render() {
  renderMeal();
  renderVisits();
  renderSettings();
}

// ---- Actions ----------------------------------------------------------------

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function changeCount(plateId, delta) {
  state.meal.counts[plateId] = Math.max(0, (state.meal.counts[plateId] || 0) + delta);
  save();
  renderMeal();
  if (delta > 0) {
    const i = state.plates.findIndex((p) => p.id === plateId);
    $('plate-list').children[i].querySelector('.count').classList.add('pop');
  }
}

function addSpecial(e) {
  e.preventDefault();
  const cents = parseAmount($('special-price').value);
  if (cents == null || cents <= 0) {
    toast('Enter a price like 4.80');
    return;
  }
  state.meal.specials.push({ id: newId(), name: $('special-name').value.trim(), cents });
  $('special-name').value = '';
  $('special-price').value = '';
  save();
  renderMeal();
}

function removeSpecial(id) {
  state.meal.specials = state.meal.specials.filter((s) => s.id !== id);
  save();
  renderMeal();
}

function clearMeal() {
  if (!currentBill().lines.length && !state.meal.receipt) return;
  if (!confirm('Clear all plates, specials and the receipt from this meal?')) return;
  const hadPhoto = state.meal.receipt?.hasPhoto;
  state.meal = freshMeal(state.meal.outlet);
  forgetMealPhoto();
  save();
  renderMeal();
  if (hadPhoto) deletePhoto('meal').catch(() => {});
}

async function saveVisit() {
  const { lines, bill } = currentBill();
  if (!lines.length || receiptBusy) return;
  const id = newId();
  const receipt = state.meal.receipt
    ? { totalCents: state.meal.receipt.totalCents, hasPhoto: state.meal.receipt.hasPhoto, source: state.meal.receipt.source }
    : null;
  if (receipt?.hasPhoto) receipt.hasPhoto = await movePhoto('meal', id).catch(() => false);
  // Store a snapshot so later price changes in Settings don't rewrite history.
  state.visits.unshift({
    id, at: new Date().toISOString(), outlet: state.meal.outlet.trim(),
    lines, bill, rates: { ...state.rates }, receipt,
  });
  state.meal = freshMeal(state.meal.outlet);
  forgetMealPhoto();
  save();
  render();
  toast(`Visit saved: ${formatCents(bill.totalCents)}`);
}

function deleteVisit(id) {
  if (!confirm('Delete this saved visit?')) return;
  const visit = state.visits.find((v) => v.id === id);
  state.visits = state.visits.filter((v) => v.id !== id);
  save();
  renderVisits();
  if (visit?.receipt?.hasPhoto) deletePhoto(id).catch(() => {});
}

function updateTier(id, changes) {
  Object.assign(state.plates.find((p) => p.id === id), changes);
  save();
  renderMeal();
}

function removeTier(id) {
  const tier = state.plates.find((p) => p.id === id);
  if (state.meal.counts[id] && !confirm(`Remove ${tier.name}? Its plates will be taken off this meal.`)) return;
  state.plates = state.plates.filter((p) => p.id !== id);
  delete state.meal.counts[id];
  save();
  render();
}

function addTier() {
  state.plates.push({ id: newId(), name: 'New colour', color: '#3b82f6', cents: 0 });
  save();
  render();
  const names = document.querySelectorAll('.tier-name');
  names[names.length - 1].select();
}

function resetTiers() {
  if (!confirm('Reset plate colours and prices to the defaults? Plates on this meal will be cleared.')) return;
  state.plates = DEFAULT_PLATES.map((p) => ({ ...p }));
  state.meal.counts = {};
  save();
  render();
}

function updateRate(input, key) {
  const bp = parsePercent(input.value);
  if (bp == null) {
    toast('Enter a percentage like 10');
  } else {
    state.rates[key] = bp;
    save();
  }
  render();
}

// ---- Wiring -----------------------------------------------------------------

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
$('special-form').addEventListener('submit', addSpecial);
$('outlet').addEventListener('input', (e) => { state.meal.outlet = e.target.value; save(); });
$('clear-meal').addEventListener('click', clearMeal);
$('save-visit').addEventListener('click', saveVisit);
$('split-bill').addEventListener('click', () => {
  // Hands the nett total to Split, which asks which group to add it to.
  const desc = `Sushiro${state.meal.outlet ? ` ${state.meal.outlet}` : ''}`;
  location.href = `../split/#add=${encodeURIComponent(JSON.stringify({ desc, cents: currentBill().bill.totalCents }))}`;
});
$('receipt-file').addEventListener('change', (e) => scanReceipt(e.target.files[0]));
$('paste-toggle').addEventListener('click', () => {
  $('paste-box').hidden = !$('paste-box').hidden;
  if (!$('paste-box').hidden) $('paste-text').focus();
});
$('paste-read').addEventListener('click', readPastedReceipt);
$('receipt-total').addEventListener('input', updateReceiptTotal);
$('receipt-total').addEventListener('blur', renderReceipt);
$('receipt-remove').addEventListener('click', removeReceipt);
$('receipt-cancel').addEventListener('click', () => receiptAbort?.abort());
$('receipt-thumb').addEventListener('click', () => showPhoto('meal'));
$('add-tier').addEventListener('click', addTier);
$('reset-tiers').addEventListener('click', resetTiers);
$('rate-service').addEventListener('change', (e) => updateRate(e.target, 'serviceBp'));
$('rate-gst').addEventListener('change', (e) => updateRate(e.target, 'gstBp'));

render();
