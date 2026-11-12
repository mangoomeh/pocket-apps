// Bus arrivals in Singapore. Stops come from busrouter.sg's open data; arrival times come
// from LTA DataMall, either through arrivelah (a public pass-through run by busrouter.sg) or
// through your own small server holding your LTA key (tools/bus-worker.js). Both formats are
// read here into one shape.

export const STOPS_URL = 'https://data.busrouter.sg/v1/stops.min.json';
export const PUBLIC_ARRIVALS = 'https://arrivelah2.busrouter.sg/';

// { "83139": [lng, lat, name, road], ... } → [{ code, name, road, lat, lng }]
export function parseStops(data) {
  if (!data || typeof data !== 'object') return [];
  return Object.entries(data).flatMap(([code, v]) => (/^\d{5}$/.test(code) && Array.isArray(v) && Number.isFinite(v[0]) && Number.isFinite(v[1])
    ? [{ code, lng: v[0], lat: v[1], name: String(v[2] || ''), road: String(v[3] || '') }]
    : []));
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Stops by code ("83139", or its start), or by words in the name or road ("bef bedok stn").
export function searchStops(stops, query, max = 20) {
  const q = query.trim();
  if (!q) return [];
  if (/^\d+$/.test(q)) return stops.filter((s) => s.code.startsWith(q)).slice(0, max);
  const words = norm(q).split(' ').filter(Boolean);
  const scored = [];
  for (const s of stops) {
    const name = norm(s.name);
    const hay = `${name} ${norm(s.road)}`;
    if (!words.every((w) => hay.includes(w))) continue;
    scored.push([name.startsWith(words[0]) ? 0 : name.includes(words[0]) ? 1 : 2, s]);
  }
  return scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).slice(0, max).map(([, s]) => s);
}

// Distance in metres (haversine).
export function distance(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function nearestStops(stops, here, max = 8, within = 1500) {
  return stops.map((s) => ({ ...s, metres: distance(here, s) }))
    .filter((s) => s.metres <= within)
    .sort((a, b) => a.metres - b.metres)
    .slice(0, max);
}

export const distanceText = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

// ---- Arrivals --------------------------------------------------------------------------------

export const LOADS = {
  SEA: { label: 'Seats available', short: 'Seats', level: 'ok' },
  SDA: { label: 'Standing available', short: 'Standing', level: 'warn' },
  LSD: { label: 'Limited standing', short: 'Full', level: 'bad' },
};
export const TYPES = { SD: 'Single deck', DD: 'Double deck', BD: 'Bendy' };

function bus(time, { load, feature, type, live = true, dest = '' }, now) {
  const at = Date.parse(time);
  if (!Number.isFinite(at)) return null;
  return {
    mins: Math.max(0, Math.floor((at - now) / 60000)),
    at,
    load: LOADS[load] ? load : '',
    wheelchair: feature === 'WAB',
    type: TYPES[type] ? type : '',
    live: live !== false,
    dest: /^\d{5}$/.test(String(dest)) ? String(dest) : '',
  };
}

// Either format → [{ no, operator, buses: [{ mins, at, load, wheelchair, type, live, dest }] }],
// by service number (2, 2A, 10, 851e…). Buses that have already left are dropped.
export function parseArrivals(data, now = Date.now()) {
  if (!data || typeof data !== 'object') throw new Error('No arrival data');
  if (data.error) throw new Error(String(data.error));
  let services;
  if (Array.isArray(data.Services)) {
    // LTA DataMall v3: NextBus, NextBus2, NextBus3 with EstimatedArrival; Monitored 0 means scheduled.
    services = data.Services.map((s) => ({
      no: String(s.ServiceNo || ''),
      operator: String(s.Operator || ''),
      buses: [s.NextBus, s.NextBus2, s.NextBus3].map((b) => b && b.EstimatedArrival && bus(b.EstimatedArrival, {
        load: b.Load, feature: b.Feature, type: b.Type, live: b.Monitored !== 0, dest: b.DestinationCode,
      }, now)),
    }));
  } else if (Array.isArray(data.services)) {
    // arrivelah: next, subsequent (or next2), next3 with time.
    services = data.services.map((s) => ({
      no: String(s.no || ''),
      operator: String(s.operator || ''),
      buses: [s.next, s.subsequent || s.next2, s.next3].map((b) => b && b.time && bus(b.time, {
        load: b.load, feature: b.feature, type: b.type, live: b.monitored !== 0, dest: b.destination_code,
      }, now)),
    }));
  } else {
    throw new Error('Unrecognised arrival data');
  }
  return services
    .map((s) => ({ ...s, buses: s.buses.filter((b) => b && b.at > now - 60000) }))
    .filter((s) => s.no)
    .sort((a, b) => compareServices(a.no, b.no));
}

export function compareServices(a, b) {
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  return (Number.isNaN(na) ? 1e9 : na) - (Number.isNaN(nb) ? 1e9 : nb) || a.localeCompare(b);
}

export const arrivalText = (mins) => (mins <= 0 ? 'Arr' : `${mins}`);

// The arrivals URL for a stop: the public pass-through, or your own server (?id=code on either).
export function arrivalsUrl(code, ownServer = '') {
  const base = ownServer && /^https:\/\//.test(ownServer) ? ownServer : PUBLIC_ARRIVALS;
  const u = new URL(base);
  u.searchParams.set('id', code);
  return u.toString();
}
