import { keepUnreadable } from '../shared/store.js';
import { holdReady } from '../shared/pwa.js';
import {
  STOPS_URL, parseStops, searchStops, nearestStops, distanceText, parseArrivals, arrivalText, arrivalsUrl, LOADS, TYPES,
} from '../src/bus.js';
import { $, esc, toast } from '../shared/ui.js';

const STORAGE_KEY = 'bus-v1';
const STOPS_KEY = 'bus-stops'; // the stop list, kept for a week (and for offline)
const REFRESH_MS = 30000;
const WEEK = 7 * 864e5;

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s && Array.isArray(s.saved)) return { server: '', ...s };
  } catch { /* storage unavailable or corrupt: start fresh */ }
  return { saved: [], server: '' };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    toast('Could not save — your browser is blocking storage.');
  }
}

keepUnreadable(STORAGE_KEY, (s) => Array.isArray(s.saved));
const state = load();

let stops = [];
let byCode = new Map();
let openCode = null; // a stop opened from search or nearby (not saved)
let nearby = null; // { list } after 📍
const arrivals = new Map(); // code → { services, at, error, loading }

// ---- Stops -----------------------------------------------------------------------------------

function useStops(data) {
  stops = parseStops(data);
  byCode = new Map(stops.map((s) => [s.code, s]));
}

async function loadStops() {
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(STOPS_KEY)); } catch { /* fetch it */ }
  if (cached?.data) useStops(cached.data);
  if (cached?.data && Date.now() - cached.fetchedAt < WEEK) return;
  try {
    const res = await fetch(STOPS_URL);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    useStops(data);
    try { localStorage.setItem(STOPS_KEY, JSON.stringify({ fetchedAt: Date.now(), data })); } catch { /* fetched again next time */ }
  } catch {
    if (!stops.length) findStatus('Couldn’t load the list of bus stops. Check your connection.');
  }
}

const stopName = (code) => byCode.get(code)?.name || `Stop ${code}`;
const isSaved = (code) => state.saved.some((s) => s.code === code);

// ---- Arrivals --------------------------------------------------------------------------------

async function fetchArrivals(code) {
  const entry = arrivals.get(code) || {};
  if (entry.loading) return;
  arrivals.set(code, { ...entry, loading: true });
  try {
    const res = await fetch(arrivalsUrl(code, state.server), { cache: 'no-store' });
    const data = await res.json().catch(() => null);
    arrivals.set(code, { services: parseArrivals(data), at: Date.now(), error: null });
  } catch (e) {
    arrivals.set(code, { ...entry, loading: false, error: e.message || 'failed' });
  }
  renderStopCard(code);
}

function busCell(b) {
  if (!b) return '<span class="bs-time none">–</span>';
  const mins = Math.max(0, Math.floor((b.at - Date.now()) / 60000));
  const load = b.load ? LOADS[b.load] : null;
  const title = [load?.label, TYPES[b.type], b.live ? '' : 'Scheduled time, not tracked live'].filter(Boolean).join(' · ');
  return `<span class="bs-time${b.live ? '' : ' sched'}" title="${esc(title)}">
    <b>${arrivalText(mins)}</b>${mins > 0 ? '<small>min</small>' : ''}
    <i class="bs-load ${load ? load.level : ''}" aria-label="${esc(load ? load.short : 'Load unknown')}"></i>${b.type === 'DD' ? '<em>2-deck</em>' : b.type === 'BD' ? '<em>bendy</em>' : ''}
  </span>`;
}

function stopCardHtml(code, { distance } = {}) {
  const s = byCode.get(code);
  const a = arrivals.get(code);
  let body;
  if (!a || (a.loading && !a.services)) body = '<p class="bs-msg">Getting times…</p>';
  else if (a.error && !a.services) {
    body = `<p class="bs-msg bad">Couldn’t get arrival times.${state.server ? ' Check your server in Settings below.' : ' The free public service may be down; for dependable times, set up your own server (Settings, below).'}</p>`;
  } else if (!a.services.length) body = '<p class="bs-msg">No buses due right now. Services may have ended for the night.</p>';
  else {
    body = `<ul class="bs-services">${a.services.map((sv) => {
      const dest = sv.buses.find((b) => b.dest)?.dest;
      return `<li class="bs-service">
        <span class="bs-no">${esc(sv.no)}</span>
        <span class="bs-dest">${dest ? `to ${esc(stopName(dest))}` : ''}</span>
        <span class="bs-times">${[0, 1, 2].map((i) => busCell(sv.buses[i])).join('')}</span>
      </li>`;
    }).join('')}</ul>`;
  }
  const ago = a?.at ? Math.round((Date.now() - a.at) / 1000) : null;
  return `<div class="card bs-stop" data-stop="${esc(code)}">
    <div class="bs-stop-head">
      <div class="bs-stop-name"><b>${esc(s?.name || `Stop ${code}`)}</b><small>${esc([s?.road, code, distance != null ? distanceText(distance) : ''].filter(Boolean).join(' · '))}</small></div>
      <button type="button" class="bs-star" data-star="${esc(code)}" aria-pressed="${isSaved(code)}" aria-label="${isSaved(code) ? 'Remove from my stops' : 'Save to my stops'}">${isSaved(code) ? '★' : '☆'}</button>
    </div>
    ${body}
    <div class="bs-stop-foot">${a?.error && a.services ? '<span class="bad">Couldn’t refresh · </span>' : ''}${ago != null ? `Updated ${ago < 10 ? 'just now' : `${ago}s ago`}` : ''}<button type="button" class="text-btn" data-refresh="${esc(code)}">↻ Refresh</button></div>
  </div>`;
}

function renderStopCard(code) {
  document.querySelectorAll(`.bs-stop[data-stop="${CSS.escape(code)}"]`).forEach((el) => {
    const dist = el.dataset.distance ? Number(el.dataset.distance) : undefined;
    el.outerHTML = stopCardHtml(code, { distance: dist });
  });
}

// ---- Rendering -------------------------------------------------------------------------------

function renderMine() {
  $('mine').innerHTML = state.saved.map((s) => stopCardHtml(s.code)).join('');
  $('mine-empty').hidden = state.saved.length > 0;
  $('subline').textContent = state.saved.length ? `${state.saved.length} saved stop${state.saved.length === 1 ? '' : 's'} · refreshes every 30 s` : 'Live times for the stops you use';
}

function renderOpen() {
  $('open-stop').innerHTML = openCode && !isSaved(openCode) ? stopCardHtml(openCode) : '';
}

function findStatus(text) {
  $('find-status').hidden = !text;
  $('find-status').textContent = text || '';
}

function resultRow(s) {
  return `<li><button type="button" class="bs-result" data-open="${esc(s.code)}">
    <span><b>${esc(s.name)}</b><small>${esc([s.road, s.code].join(' · '))}</small></span>
    ${s.metres != null ? `<span class="bs-dist">${distanceText(s.metres)}</span>` : ''}</button></li>`;
}

function renderResults() {
  const q = $('q').value;
  if (q.trim()) {
    nearby = null;
    const list = searchStops(stops, q);
    findStatus(stops.length ? (list.length ? '' : 'No stops match.') : 'Loading bus stops…');
    $('results').innerHTML = list.map(resultRow).join('');
  } else if (nearby) {
    findStatus(nearby.list.length ? 'Nearest stops' : 'No bus stops within 1.5 km.');
    $('results').innerHTML = nearby.list.map(resultRow).join('');
  } else {
    findStatus('');
    $('results').innerHTML = '';
  }
}

function render() {
  renderOpen();
  renderMine();
  renderResults();
}

function refreshAll() {
  const codes = new Set(state.saved.map((s) => s.code));
  if (openCode) codes.add(openCode);
  codes.forEach(fetchArrivals);
}

// ---- Actions ---------------------------------------------------------------------------------

$('q').addEventListener('input', renderResults);

$('near').addEventListener('click', () => {
  if (!navigator.geolocation) { toast('This browser can’t find your location'); return; }
  $('q').value = '';
  findStatus('Finding where you are…');
  $('results').innerHTML = '';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      nearby = { list: nearestStops(stops, { lat: pos.coords.latitude, lng: pos.coords.longitude }) };
      renderResults();
    },
    (err) => findStatus(err.code === 1 ? 'Location is turned off for this site. Allow it, or search by name instead.' : 'Couldn’t find your location. Try again, or search by name.'),
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
  );
});

document.addEventListener('click', (e) => {
  const open = e.target.closest('[data-open]');
  if (open) {
    openCode = open.dataset.open;
    $('q').value = '';
    nearby = null;
    render();
    fetchArrivals(openCode);
    $('open-stop').scrollIntoView({ block: 'start', behavior: 'smooth' });
    return;
  }
  const star = e.target.closest('[data-star]');
  if (star) {
    const code = star.dataset.star;
    if (isSaved(code)) {
      state.saved = state.saved.filter((s) => s.code !== code);
      toast(`Removed ${stopName(code)}`);
    } else {
      state.saved.push({ code });
      if (openCode === code) openCode = null;
      toast(`Saved ${stopName(code)}`);
    }
    save();
    render();
    return;
  }
  const refresh = e.target.closest('[data-refresh]');
  if (refresh) fetchArrivals(refresh.dataset.refresh);
});

$('server').value = state.server;
$('server-test').addEventListener('click', async () => {
  const v = $('server').value.trim();
  const st = $('server-status');
  if (v && !/^https:\/\/[^\s/]+/.test(v)) { st.hidden = false; st.className = 'status bad'; st.textContent = 'Use the https:// address of your server.'; return; }
  state.server = v;
  save();
  st.hidden = false;
  st.className = 'status neutral';
  st.textContent = 'Testing…';
  try {
    const res = await fetch(arrivalsUrl('83139', state.server), { cache: 'no-store' });
    const services = parseArrivals(await res.json());
    st.className = 'status ok';
    st.textContent = `Working: ${services.length} services at a test stop.${v ? '' : ' (Using the public service.)'}`;
    arrivals.clear();
    refreshAll();
  } catch (e) {
    st.className = 'status bad';
    st.textContent = `Not working: ${e.message || 'no answer'}.`;
  }
});

// Times count down every 15 seconds; arrivals refresh every 30 seconds while the app is open.
setInterval(() => {
  if (document.hidden) return;
  arrivals.forEach((_, code) => renderStopCard(code));
}, 15000);
setInterval(() => { if (!document.hidden) refreshAll(); }, REFRESH_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshAll(); });

const ready = holdReady();
loadStops().finally(() => {
  render();
  refreshAll();
  ready();
});
