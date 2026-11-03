// Checks that the install and offline files match what's on disk. If the first test fails
// after adding or changing a file, run `npm run sw`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, APPS, SHARED, withBlock, version, versionModule, VERSION_FILE } from '../tools/build-sw.js';

const read = (p) => readFileSync(join(ROOT, p), 'utf8');

test('sw.js lists every file with an up-to-date version (run `npm run sw` if not)', () => {
  const sw = read('sw.js');
  assert.equal(sw, withBlock(sw));
  assert.equal(read(VERSION_FILE), versionModule(version()), 'shared/version.js matches');
});

test('every page has its own manifest, icons, and turns on offline use', () => {
  for (const app of ['', ...APPS]) {
    const up = app ? '../' : '';
    const slug = app || 'home';
    const html = read(`${app ? `${app}/` : ''}index.html`);
    assert.ok(html.includes('<link rel="manifest" href="manifest.webmanifest">'), `${slug}: manifest`);
    assert.ok(html.includes(`<link rel="apple-touch-icon" href="${up}icons/${slug}-apple.png">`), `${slug}: apple icon`);
    assert.ok(html.includes(`<script type="module" src="${up}shared/pwa.js"></script>`), `${slug}: pwa.js`);
    const manifest = JSON.parse(read(`${app ? `${app}/` : ''}manifest.webmanifest`));
    assert.equal(manifest.start_url, './');
    for (const icon of manifest.icons) assert.ok(existsSync(join(ROOT, app, icon.src)), `${slug}: ${icon.src}`);
  }
});

test('the deploy copies everything the site needs', () => {
  const cp = read('.github/workflows/pages.yml').match(/cp -r (.*) _site\//)[1].split(/\s+/);
  for (const need of [...SHARED, ...APPS, 'sw.js']) assert.ok(cp.includes(need), `pages.yml should copy ${need}`);
});
