import { keepUnreadable } from '../shared/store.js';
import { newId } from '../src/sync.js';
import {
  tripDays, tripStatus, itemsOn, unscheduled, mapsUrl, formatDay, itineraryText, itineraryIcs, localIso, isIsoDate, nights,
  summariseWeather, KINDS, ACTIVITIES, CATEGORIES, fullPackingList, packingProgress, encodeTrip, decodeTrip, mergeTrips,
} from '../src/trip.js';
import { $, esc, switchTab, toast } from '../shared/ui.js';
import { holdReady } from '../shared/pwa.js';

const STORAGE_KEY = 'trip-v1';

const MANUAL_WEATHER = {
  hot: { maxC: 32, minC: 25 },
  mild: { maxC: 25, minC: 18 },
  cool: { maxC: 15, minC: 8 },
  cold: { maxC: 4, minC: -3 },
};

// ---- Persistent state -----------------------------------------------------------------

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.trips)) return saved;
  } catch { /* storage unavailable or corrupt: start fresh */ }
  return { trips: [], current: null };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    toast('Could not save — your browser is blocking storage.');
  }
}

keepUnreadable(STORAGE_KEY, (s) => Array.isArray(s.trips));
const state = load();
const trip = () => state.trips.find((t) => t.id === state.current) || null;
const touch = (record) => { record.updatedAt = Date.now(); return record; };
const packingOf = (t) => (t.packing ??= { checked: {}, hidden: {}, custom: [], weather: null, hidePacked: false });
const dateRange = (t) => (t.end && t.end !== t.start ? `${formatDay(t.start)} – ${formatDay(t.end)}` : formatDay(t.start));

// ---- Rendering --------------------------------------------------------------------------

function render() {
  const t = trip();
  $('view-trips').hidden = !!t;
  $('view-trip').hidden = !t;
  $('back').textContent = t ? '‹ Trips' : '‹ Apps';
  if (!t) return renderTrips();
  renderHeader();
  renderPlan();
  renderPacking();
  renderDetails();
}

function statusLine(t) {
  const s = tripStatus(t, localIso());
  if (s.phase === 'before') return s.daysToGo === 1 ? 'Tomorrow!' : `${s.daysToGo} days to go`;
  if (s.phase === 'during') return `Day ${s.day} of ${s.of}`;
  if (s.phase === 'after') return 'Done';
  return 'Set the dates';
}

function renderTrips() {
  $('eyebrow').textContent = 'Trip Planner';
  $('headline').textContent = 'Trips';
  $('subline').textContent = 'Plan each day, pack the right things';
  $('trips-empty').hidden = state.trips.length > 0;
  const sorted = [...state.trips].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  $('trip-list').innerHTML = sorted.map((t) => {
    const p = packingProgress(fullPackingList(t, packingOf(t), packingOf(t).weather), packingOf(t).checked);
    return `<li class="tap" data-trip="${esc(t.id)}">
      <div class="top"><strong>${esc(t.name)}</strong><span class="amt">${esc(statusLine(t))}</span></div>
      <div class="meta">${isIsoDate(t.start) ? esc(dateRange(t)) : 'No dates yet'} · packed ${p.done}/${p.total}</div>
    </li>`;
  }).join('');
}

function renderHeader() {
  const t = trip();
  $('eyebrow').textContent = t.name;
  $('headline').textContent = statusLine(t);
  $('subline').textContent = isIsoDate(t.start) ? `${dateRange(t)} · ${nights(t.start, t.end)} night${nights(t.start, t.end) === 1 ? '' : 's'}` : '';
}

function itemRow(t, i) {
  const kind = KINDS[i.kind] ?? KINDS.activity;
  return `<li class="tap" data-item="${esc(i.id)}">
    <span class="time">${esc(i.time || '')}</span>
    <span class="kind" aria-label="${kind.label}">${kind.icon}</span>
    <span class="body">
      <strong>${esc(i.title)}</strong>
      ${i.place ? `<a class="place" href="${esc(mapsUrl(i.place, t.destination))}" target="_blank" rel="noopener">📌 ${esc(i.place)}</a>` : ''}
      ${i.notes ? `<small>${esc(i.notes)}</small>` : ''}
    </span>
  </li>`;
}

function renderPlan() {
  const t = trip();
  const today = localIso();
  const days = tripDays(t.start, t.end);
  $('days').innerHTML = days.map((d, n) => {
    const items = itemsOn(t, d);
    return `<div class="card day-card ${d === today ? 'today' : ''}" id="day-${d}">
      <div class="row-head">
        <h2>Day ${n + 1} <small>· ${esc(formatDay(d))}${d === today ? ' · today' : ''}</small></h2>
        <button class="secondary small" data-add="${d}">+ Add</button>
      </div>
      ${items.length ? `<ul class="plan-items">${items.map((i) => itemRow(t, i)).join('')}</ul>` : '<p class="hint">Nothing planned yet.</p>'}
    </div>`;
  }).join('') || '<div class="card"><p class="hint">Set the dates under Details to plan each day.</p></div>';
  const loose = unscheduled(t);
  $('unscheduled-card').hidden = !loose.length;
  $('unscheduled').innerHTML = loose.map((i) => itemRow(t, i)).join('');
}

function weatherText(w) {
  if (!w) return 'Check the weather and the list adds jackets, umbrellas or sunscreen to match.';
  if (w.source === 'manual') return `Set by you: ${w.label}${w.rainyDays ? ', with rain' : ''}.`;
  const rain = w.rainyDays ? `rain likely on ${w.rainyDays} of ${w.days} days` : 'little rain';
  const where = w.place ? `${w.place}: ` : '';
  return w.source === 'forecast'
    ? `${where}forecast ${w.minC} to ${w.maxC} °C, ${rain}.`
    : `${where}these dates last year were ${w.minC} to ${w.maxC} °C, with ${rain}. The forecast is available about 2 weeks before.`;
}

function renderPacking() {
  const t = trip();
  const p = packingOf(t);
  const list = fullPackingList(t, p, p.weather);
  const prog = packingProgress(list, p.checked);
  $('pack-count').textContent = `${prog.done} of ${prog.total}`;
  $('pack-bar').style.width = `${prog.pct}%`;
  $('hide-packed').checked = !!p.hidePacked;
  $('weather-text').textContent = weatherText(p.weather);
  $('manual-weather').value = p.weather?.source === 'manual' ? p.weather.key : '';
  $('manual-rain').checked = p.weather?.source === 'manual' && p.weather.rainyDays > 0;
  $('own-cat').innerHTML = CATEGORIES.map((c) => `<option>${c}</option>`).join('');
  const hiddenCount = Object.keys(p.hidden).length;
  $('restore-removed').hidden = !hiddenCount;
  $('restore-removed').textContent = `Bring back ${hiddenCount} removed suggestion${hiddenCount === 1 ? '' : 's'}`;

  $('pack-cats').innerHTML = CATEGORIES.map((cat) => {
    const items = list.filter((i) => i.cat === cat);
    if (!items.length) return '';
    const shown = p.hidePacked ? items.filter((i) => !p.checked[i.key]) : items;
    const done = items.filter((i) => p.checked[i.key]).length;
    return `<div class="card">
      <div class="row-head"><h2>${cat}</h2><small class="muted-text">${done}/${items.length}</small></div>
      <ul class="pack-list">${shown.map((i) => `
        <li class="${p.checked[i.key] ? 'packed' : ''}">
          <label>
            <input type="checkbox" data-pack="${esc(i.key)}" ${p.checked[i.key] ? 'checked' : ''}>
            <span><strong>${esc(i.name)}${i.qty > 1 ? ` × ${i.qty}` : ''}</strong>${i.note ? `<small>${esc(i.note)}</small>` : ''}</span>
          </label>
          <button class="icon-btn" data-remove-pack="${esc(i.key)}" aria-label="Remove ${esc(i.name)}">✕</button>
        </li>`).join('')}
      </ul>
      ${shown.length ? '' : '<p class="hint">All packed ✓</p>'}
    </div>`;
  }).join('');
}

function renderDetails() {
  const t = trip();
  const keep = (id, v) => { if (document.activeElement !== $(id)) $(id).value = v ?? ''; };
  keep('d-name', t.name);
  keep('d-dest', t.destination);
  keep('d-start', t.start);
  keep('d-end', t.end);
  $('d-abroad').checked = !!t.abroad;
  $('d-laundry').checked = !!t.laundry;
  document.querySelectorAll('input[name="luggage"]').forEach((r) => { r.checked = r.value === t.luggage; });
  $('d-tags').innerHTML = ACTIVITIES.map((a) => `<label class="chip-toggle"><input type="checkbox" data-tag="${a.id}" ${t.tags.includes(a.id) ? 'checked' : ''}> ${a.label}</label>`).join('');
}

// ---- Trips --------------------------------------------------------------------------------

function openTrip(id) {
  state.current = id;
  save();
  switchTab('plan');
  render();
}

function createTrip() {
  const dest = $('new-dest').value.trim();
  const start = $('new-start').value;
  let end = $('new-end').value;
  if (!dest) return toast('Where are you going?');
  if (!isIsoDate(start)) return toast('Pick the first day.');
  if (!isIsoDate(end) || end < start) end = start;
  const t = {
    id: newId(), name: dest, destination: dest, start, end, abroad: true, luggage: 'checked', laundry: false,
    tags: ['city'], items: [], updatedAt: Date.now(),
  };
  state.trips.push(t);
  $('new-dest').value = '';
  openTrip(t.id);
}

function deleteTrip() {
  const t = trip();
  if (!confirm(`Remove "${t.name}" from this phone? Friends keep their copies.`)) return;
  state.trips = state.trips.filter((x) => x.id !== t.id);
  state.current = null;
  save();
  render();
}

// ---- Itinerary items --------------------------------------------------------------------

let editingItem = null;
let itemKind = 'activity';

function openItem({ id = null, date = null } = {}) {
  const t = trip();
  const it = id ? t.items.find((i) => i.id === id) : null;
  editingItem = it?.id ?? null;
  itemKind = it?.kind ?? 'activity';
  const days = tripDays(t.start, t.end);
  const day = it?.date ?? date ?? days[0];
  const options = days.map((d, n) => `<option value="${d}" ${d === day ? 'selected' : ''}>Day ${n + 1} · ${esc(formatDay(d))}</option>`);
  if (day && !days.includes(day)) options.unshift(`<option value="${day}" selected>${esc(formatDay(day))} (outside the trip)</option>`);
  $('i-date').innerHTML = options.join('');
  $('i-title').value = it?.title ?? '';
  $('i-time').value = it?.time ?? '';
  $('i-place').value = it?.place ?? '';
  $('i-notes').value = it?.notes ?? '';
  $('item-title').textContent = it ? 'Edit' : 'Add to the plan';
  $('i-delete').hidden = !it;
  renderKinds();
  $('item-dialog').showModal();
  if (!it) $('i-title').focus();
}

function renderKinds() {
  $('item-kinds').innerHTML = Object.entries(KINDS).map(([k, v]) => `<label><input type="radio" name="kind" value="${k}" ${k === itemKind ? 'checked' : ''}> ${v.icon}<span class="kind-label"> ${v.label}</span></label>`).join('');
}

function saveItem() {
  const t = trip();
  const title = $('i-title').value.trim();
  if (!title) return toast('What is it?');
  const old = t.items.find((i) => i.id === editingItem);
  const item = {
    id: old?.id ?? newId(),
    date: $('i-date').value,
    time: $('i-time').value,
    kind: itemKind,
    title,
    place: $('i-place').value.trim(),
    notes: $('i-notes').value.trim(),
    createdAt: old?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };
  if (old) Object.assign(old, item); else t.items.push(item);
  save();
  $('item-dialog').close();
  render();
}

function deleteItem() {
  const t = trip();
  const it = t.items.find((i) => i.id === editingItem);
  if (!it || !confirm(`Delete "${it.title}"?`)) return;
  it.deleted = true;
  touch(it);
  save();
  $('item-dialog').close();
  render();
}

// ---- Weather ------------------------------------------------------------------------------

async function getJson(url) {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.reason || `HTTP ${res.status}`);
  return data;
}

const shiftYears = (iso, years) => `${+iso.slice(0, 4) - years}${iso.slice(4)}`.replace(/-02-29$/, '-02-28');

// The forecast when the trip is within about two weeks, otherwise the same dates last year.
async function checkWeather() {
  const t = trip();
  if (!t.destination || !isIsoDate(t.start)) return toast('Set the destination and dates first.');
  const btn = $('check-weather');
  btn.disabled = true;
  btn.textContent = 'Checking…';
  try {
    const geo = await getJson(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(t.destination)}`);
    const g = geo.results?.[0];
    if (!g) throw new Error(`Couldn't find "${t.destination}". Try just the city name.`);
    const at = `latitude=${g.latitude}&longitude=${g.longitude}&timezone=auto`;
    const end = t.end || t.start;
    const today = localIso();
    const horizon = localIso(new Date(Date.now() + 15 * 86400000));
    let w;
    if (end >= today && t.start <= horizon) {
      const from = t.start < today ? today : t.start;
      const to = end > horizon ? horizon : end;
      const f = await getJson(`https://api.open-meteo.com/v1/forecast?${at}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&start_date=${from}&end_date=${to}`);
      w = { ...summariseWeather({ max: f.daily.temperature_2m_max, min: f.daily.temperature_2m_min, rain: f.daily.precipitation_probability_max }), source: 'forecast' };
    } else {
      let years = 1;
      while (shiftYears(end, years) >= today) years++;
      const a = await getJson(`https://archive-api.open-meteo.com/v1/archive?${at}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&start_date=${shiftYears(t.start, years)}&end_date=${shiftYears(end, years)}`);
      w = { ...summariseWeather({ max: a.daily.temperature_2m_max, min: a.daily.temperature_2m_min, rain: a.daily.precipitation_sum, rainIsMm: true }), source: 'history' };
    }
    if (w.maxC == null) throw new Error('No weather data for those dates.');
    packingOf(t).weather = { ...w, place: [g.name, g.country].filter(Boolean).join(', ') };
    save();
    render();
    toast('Packing list updated for the weather.');
  } catch (e) {
    toast(e.message.startsWith("Couldn't") || e.message.startsWith('No weather') ? e.message : "Couldn't get the weather. Set it yourself below.");
  } finally {
    btn.disabled = false;
    btn.textContent = 'Check the weather';
  }
}

function setManualWeather() {
  const p = packingOf(trip());
  const key = $('manual-weather').value;
  const rain = $('manual-rain').checked;
  if (!key && !rain) p.weather = null;
  else {
    const base = MANUAL_WEATHER[key] ?? MANUAL_WEATHER.mild;
    const label = key ? $('manual-weather').selectedOptions[0].textContent.split(' (')[0] : 'Mild';
    p.weather = { ...base, rainyDays: rain ? 1 : 0, days: 1, source: 'manual', key: key || 'mild', label };
  }
  save();
  render();
}

// ---- Sharing --------------------------------------------------------------------------------

async function shareUrl() {
  return `${location.origin}${location.pathname}#t=${await encodeTrip(trip())}`;
}

async function shareLink() {
  const t = trip();
  const url = await shareUrl();
  if (navigator.share) {
    try { await navigator.share({ title: `${t.name} · Trip`, text: `Our plan for ${t.name}`, url }); return; } catch { /* cancelled: fall back to copying */ }
  }
  try {
    await navigator.clipboard.writeText(url);
    $('share-note').textContent = 'Link copied. Paste it into your group chat.';
  } catch {
    $('share-note').textContent = url;
  }
}

async function copyPlan() {
  const text = itineraryText(trip(), await shareUrl());
  try {
    await navigator.clipboard.writeText(text);
    toast('Itinerary copied.');
  } catch {
    if (navigator.share) navigator.share({ text }).catch(() => {});
  }
}

// Downloads the plan as an .ics file; phones offer to add the events to the calendar.
function addToCalendar() {
  const t = trip();
  const blob = new Blob([itineraryIcs(t)], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${t.name.replace(/[^\w\- ]+/g, '').trim() || 'trip'}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// Split opens this trip's group, or starts one named after the trip.
function openSplit() {
  const t = trip();
  location.href = `../split/#trip=${encodeURIComponent(JSON.stringify({ id: t.id, name: t.name }))}`;
}

// Opening a share link adds the trip, or merges it into the copy already here.
async function importFromHash() {
  const m = location.hash.match(/^#t=([A-Za-z0-9_-]+)/);
  if (!m) return;
  history.replaceState(null, '', location.pathname);
  const incoming = await decodeTrip(m[1]);
  if (!incoming) return toast("That link couldn't be read. Ask for it to be sent again.");
  const existing = state.trips.find((t) => t.id === incoming.id);
  if (existing) {
    const { trip: merged, changed } = mergeTrips(existing, incoming);
    Object.assign(existing, merged);
    toast(changed ? `Updated: ${changed} new or changed plan item${changed === 1 ? '' : 's'}.` : 'Already up to date.');
  } else {
    state.trips.push(incoming);
    toast(`Added "${incoming.name}".`);
  }
  save();
  openTrip(incoming.id);
}

// ---- Wiring -------------------------------------------------------------------------------------

$('back').addEventListener('click', (ev) => {
  if (!trip()) return;
  ev.preventDefault();
  state.current = null;
  save();
  render();
});
$('trip-list').addEventListener('click', (ev) => {
  const li = ev.target.closest('[data-trip]');
  if (li) openTrip(li.dataset.trip);
});
$('new-start').addEventListener('change', () => { if (!$('new-end').value || $('new-end').value < $('new-start').value) $('new-end').value = $('new-start').value; });
$('create-trip').addEventListener('click', createTrip);
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

// Plan
$('days').addEventListener('click', (ev) => {
  if (ev.target.closest('a')) return;
  const add = ev.target.closest('[data-add]');
  const row = ev.target.closest('[data-item]');
  if (add) openItem({ date: add.dataset.add });
  else if (row) openItem({ id: row.dataset.item });
});
$('unscheduled').addEventListener('click', (ev) => {
  const row = ev.target.closest('[data-item]');
  if (row && !ev.target.closest('a')) openItem({ id: row.dataset.item });
});
$('item-kinds').addEventListener('change', (ev) => { itemKind = ev.target.value; });
$('i-save').addEventListener('click', saveItem);
$('i-cancel').addEventListener('click', () => $('item-dialog').close());
$('i-delete').addEventListener('click', deleteItem);
$('copy-plan').addEventListener('click', copyPlan);
$('add-calendar').addEventListener('click', addToCalendar);
$('open-split').addEventListener('click', openSplit);

// Packing
$('pack-cats').addEventListener('change', (ev) => {
  const key = ev.target.dataset.pack;
  if (!key) return;
  const p = packingOf(trip());
  if (ev.target.checked) p.checked[key] = true; else delete p.checked[key];
  save();
  render();
});
$('pack-cats').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-remove-pack]');
  if (!b) return;
  const p = packingOf(trip());
  const key = b.dataset.removePack;
  if (key.startsWith('c:')) p.custom = p.custom.filter((c) => `c:${c.id}` !== key);
  else p.hidden[key] = true;
  delete p.checked[key];
  save();
  render();
});
$('hide-packed').addEventListener('change', () => { packingOf(trip()).hidePacked = $('hide-packed').checked; save(); render(); });
$('untick-all').addEventListener('click', () => {
  if (!confirm('Untick everything? Handy for packing to come home.')) return;
  packingOf(trip()).checked = {};
  save();
  render();
});
$('check-weather').addEventListener('click', checkWeather);
$('manual-weather').addEventListener('change', setManualWeather);
$('manual-rain').addEventListener('change', setManualWeather);
$('own-add').addEventListener('click', () => {
  const name = $('own-name').value.trim();
  if (!name) return;
  packingOf(trip()).custom.push({ id: newId(), name, cat: $('own-cat').value });
  $('own-name').value = '';
  save();
  render();
});
$('restore-removed').addEventListener('click', () => { packingOf(trip()).hidden = {}; save(); render(); });

// Details
function editTrip(fn) {
  const t = trip();
  fn(t);
  touch(t);
  save();
  render();
}
$('d-name').addEventListener('change', () => editTrip((t) => { t.name = $('d-name').value.trim() || t.name; }));
$('d-dest').addEventListener('change', () => editTrip((t) => { t.destination = $('d-dest').value.trim(); packingOf(t).weather = null; }));
$('d-start').addEventListener('change', () => editTrip((t) => {
  if (!isIsoDate($('d-start').value)) return;
  t.start = $('d-start').value;
  if (!isIsoDate(t.end) || t.end < t.start) t.end = t.start;
}));
$('d-end').addEventListener('change', () => editTrip((t) => {
  const v = $('d-end').value;
  t.end = isIsoDate(v) && v >= t.start ? v : t.start;
}));
$('d-abroad').addEventListener('change', () => editTrip((t) => { t.abroad = $('d-abroad').checked; }));
$('d-laundry').addEventListener('change', () => editTrip((t) => { t.laundry = $('d-laundry').checked; }));
document.querySelectorAll('input[name="luggage"]').forEach((r) => r.addEventListener('change', () => editTrip((t) => { t.luggage = r.value; })));
$('d-tags').addEventListener('change', (ev) => {
  const tag = ev.target.dataset.tag;
  if (!tag) return;
  editTrip((t) => { t.tags = ev.target.checked ? [...new Set([...t.tags, tag])] : t.tags.filter((x) => x !== tag); });
});
$('share-link').addEventListener('click', shareLink);
$('delete-trip').addEventListener('click', deleteTrip);
window.addEventListener('hashchange', importFromHash);

render();
importFromHash().finally(holdReady());
