import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pack, unpack, makeBackup, readBackup, describeBackup, STORAGE_KEYS, CACHE_KEYS } from '../src/backup.js';

test('blobs inside values survive a JSON round trip', async () => {
  const photo = new Blob([new Uint8Array([0, 1, 2, 255])], { type: 'image/jpeg' });
  const packed = await pack({ messages: [{ text: 'hi', images: ['abc'] }], photo });
  const back = unpack(JSON.parse(JSON.stringify(packed)));
  assert.equal(back.messages[0].text, 'hi');
  assert.ok(back.photo instanceof Blob);
  assert.equal(back.photo.type, 'image/jpeg');
  assert.deepEqual([...new Uint8Array(await back.photo.arrayBuffer())], [0, 1, 2, 255]);
});

test('a backup restores only Pocket Apps data', async () => {
  const backup = await makeBackup(
    { 'split-v1': '{"groups":[]}', 'trip-v1': '{}' },
    { 'sushiro-photos': [{ key: 'v1', value: new Blob(['x']) }], 'fengshui-plan': [{ key: 'p1', value: { rooms: [] } }] },
    new Date('2026-10-21T08:00:00Z'),
  );
  const file = JSON.parse(JSON.stringify(backup));
  file.storage['someone-else'] = 'nope';
  file.databases.other = [{ key: 1, value: 1 }];
  const { storage, databases } = readBackup(file);
  assert.deepEqual(Object.keys(storage), ['split-v1', 'trip-v1']);
  assert.deepEqual(Object.keys(databases), ['sushiro-photos', 'fengshui-plan']);
  assert.ok(databases['sushiro-photos'][0].value instanceof Blob);
  assert.match(describeBackup(file), /2 apps, 1 receipt photo, a floor plan\.$/);
});

test('other files are refused with a clear message', () => {
  assert.throws(() => readBackup({ hello: 1 }), /isn't a Pocket Apps backup/);
  assert.throws(() => readBackup({ format: 'pocket-apps-backup', version: 2 }), /newer version/);
});

test('every app\'s storage key is backed up', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const used = new Set();
  for (const dir of ['petty-cash', 'sushiro', 'split', 'trip', 'calc84', 'wallets', 'bazi', 'ziwei', 'fengshui', 'learnai', 'godigital', 'tarot', 'jobs', 'lists', 'spend']) {
    for (const f of readdirSync(new URL(`../${dir}/`, import.meta.url))) {
      if (!/\.(js|html)$/.test(f)) continue;
      const text = readFileSync(new URL(`../${dir}/${f}`, import.meta.url), 'utf8');
      for (const m of text.matchAll(/KEY = '([^']+)'/g)) used.add(m[1]);
    }
  }
  for (const k of used) assert.ok(STORAGE_KEYS.includes(k) || CACHE_KEYS.includes(k), `${k} is missing from STORAGE_KEYS`);
});

test('saved data an app cannot read is copied aside, not lost', async () => {
  const { keepUnreadable } = await import('../shared/store.js');
  const mem = (init) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), m }; };
  const ok = mem({ 'x-v1': '{"items":[]}' });
  assert.equal(keepUnreadable('x-v1', (s) => Array.isArray(s.items), ok, 5), false);
  assert.equal(ok.m.size, 1);
  const broken = mem({ 'x-v1': '{oops' });
  assert.equal(keepUnreadable('x-v1', () => true, broken, 5), true);
  assert.equal(broken.m.get('x-v1-unreadable-5'), '{oops');
  const wrongShape = mem({ 'x-v1': '{"old":1}' });
  assert.equal(keepUnreadable('x-v1', (s) => Array.isArray(s.items), wrongShape, 7), true);
  assert.equal(keepUnreadable('x-v1', () => true, mem({}), 7), false, 'nothing saved yet');
  assert.equal(keepUnreadable('x-v1', () => true, { getItem() { throw new Error('blocked'); } }), false);
});

test('every app protects its saved data before reading it', async () => {
  const { readFileSync } = await import('node:fs');
  for (const dir of ['petty-cash', 'sushiro', 'split', 'trip', 'calc84', 'wallets', 'bazi', 'ziwei', 'fengshui', 'learnai', 'godigital', 'tarot', 'jobs', 'lists']) {
    const src = readFileSync(new URL(`../${dir}/app.js`, import.meta.url), 'utf8');
    assert.match(src, /keepUnreadable\(STORAGE_KEY, [^\n]+\);\nconst state = load\(\);/, dir);
  }
});
