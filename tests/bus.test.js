import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStops, searchStops, nearestStops, distance, distanceText, parseArrivals, compareServices, arrivalText, arrivalsUrl,
} from '../src/bus.js';

const STOPS = parseStops({
  83139: [103.9133, 1.3249, 'Bef Bedok Stn', 'New Upp Changi Rd'],
  84009: [103.9298, 1.3243, 'Bedok Int', 'Bedok Nth Dr'],
  '01012': [103.8526, 1.2969, 'Hotel Grand Pacific', 'Victoria St'],
  bad: [1, 2, 'x', 'y'],
  12345: ['no', 'coords'],
});

test('stops from the open data, searchable by code, name and road', () => {
  assert.equal(STOPS.length, 3);
  assert.deepEqual(STOPS[2], { code: '01012', lng: 103.8526, lat: 1.2969, name: 'Hotel Grand Pacific', road: 'Victoria St' });
  assert.deepEqual(searchStops(STOPS, '831').map((s) => s.code), ['83139']);
  assert.deepEqual(searchStops(STOPS, 'bedok').map((s) => s.code), ['84009', '83139'], 'names starting with the word come first');
  assert.deepEqual(searchStops(STOPS, 'victoria').map((s) => s.code), ['01012'], 'roads match too');
  assert.deepEqual(searchStops(STOPS, 'bef  bedok'), [STOPS[0]]);
  assert.deepEqual(searchStops(STOPS, '  '), []);
});

test('nearby stops by distance', () => {
  const here = { lat: 1.3247, lng: 103.9140 };
  assert.ok(Math.abs(distance(here, STOPS[0]) - 81) < 5);
  assert.deepEqual(nearestStops(STOPS, here).map((s) => s.code), ['83139'], 'only within 1.5 km');
  assert.deepEqual(nearestStops(STOPS, here, 8, 5000).map((s) => s.code), ['83139', '84009']);
  assert.equal(distanceText(84), '80 m');
  assert.equal(distanceText(1530), '1.5 km');
});

const NOW = Date.parse('2026-11-12T08:00:00+08:00');
const at = (min) => new Date(NOW + min * 60000).toISOString();

test('arrivals from LTA DataMall', () => {
  const lta = {
    BusStopCode: '83139',
    Services: [
      { ServiceNo: '10', Operator: 'SBST', NextBus: { EstimatedArrival: at(0.5), Load: 'SEA', Feature: 'WAB', Type: 'DD', Monitored: 1, DestinationCode: '75009' },
        NextBus2: { EstimatedArrival: at(7.9), Load: 'LSD', Feature: '', Type: 'BD', Monitored: 0 }, NextBus3: { EstimatedArrival: '' } },
      { ServiceNo: '2', Operator: 'GAS', NextBus: { EstimatedArrival: at(-3) }, NextBus2: { EstimatedArrival: at(4) } },
    ],
  };
  const s = parseArrivals(lta, NOW);
  assert.deepEqual(s.map((x) => x.no), ['2', '10']);
  assert.equal(s[0].buses.length, 1, 'a bus that left minutes ago is dropped');
  const [a, b] = s[1].buses;
  assert.deepEqual([a.mins, a.load, a.wheelchair, a.type, a.live, a.dest], [0, 'SEA', true, 'DD', true, '75009']);
  assert.deepEqual([b.mins, b.load, b.live], [7, 'LSD', false], 'Monitored 0 is a scheduled time');
  assert.equal(s[1].buses.length, 2, 'an empty third bus is skipped');
});

test('arrivals from arrivelah, and errors', () => {
  const ah = { services: [{ no: '851e', operator: 'SMRT', next: { time: at(12), load: 'SDA', feature: 'WAB', type: 'SD', destination_code: '46009' }, subsequent: { time: at(25) }, next3: null }] };
  const [s] = parseArrivals(ah, NOW);
  assert.equal(s.no, '851e');
  assert.deepEqual(s.buses.map((b) => b.mins), [12, 25]);
  assert.equal(s.buses[0].dest, '46009');
  assert.throws(() => parseArrivals({ error: 'Failed to retrieve bus data.', statusCode: 500 }), /Failed to retrieve/);
  assert.throws(() => parseArrivals({ hello: 1 }), /Unrecognised/);
  assert.throws(() => parseArrivals(null));
});

test('service order, labels and URLs', () => {
  assert.deepEqual(['851e', '10', '2A', '2', 'NR1', '100'].sort(compareServices), ['2', '2A', '10', '100', '851e', 'NR1']);
  assert.equal(arrivalText(0), 'Arr');
  assert.equal(arrivalText(5), '5');
  assert.equal(arrivalsUrl('83139'), 'https://arrivelah2.busrouter.sg/?id=83139');
  assert.equal(arrivalsUrl('83139', 'https://bus.example.workers.dev'), 'https://bus.example.workers.dev/?id=83139');
  assert.equal(arrivalsUrl('83139', 'http://insecure.example'), 'https://arrivelah2.busrouter.sg/?id=83139', 'only https servers');
});
