// Writes the list of files the service worker stores for offline use, and a VERSION that
// changes whenever any of them does, into sw.js. Run `npm run sw` after adding or changing
// files; tests/pwa.test.js fails if sw.js is out of date.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const APPS = ['petty-cash', 'sushiro', 'split', 'trip', 'calc84', 'wallets', 'bazi', 'ziwei', 'fengshui', 'learnai', 'godigital', 'tarot'];
export const SHARED = ['index.html', 'manifest.webmanifest', 'shared', 'src', 'icons'];
// Big icons are only fetched when an app is installed, so they aren't stored for offline use.
const SKIP = /(^|\/)\.DS_Store$|-(512|maskable)\.png$/;

function walk(dir) {
  return readdirSync(dir).sort().flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [relative(ROOT, p).split('\\').join('/')];
  });
}

export function offlinePaths() {
  return [...SHARED, ...APPS].flatMap((e) => (statSync(join(ROOT, e)).isFile() ? [e] : walk(join(ROOT, e)))).filter((p) => !SKIP.test(p));
}

export function swBlock() {
  const paths = offlinePaths();
  const hash = createHash('sha256');
  for (const p of paths) hash.update(p).update(readFileSync(join(ROOT, p)));
  // Pages are opened by their folder URL, so they're stored under that.
  const files = ['./', ...APPS.map((a) => `${a}/`), ...paths.filter((p) => p !== 'index.html' && !p.endsWith('/index.html'))];
  return `// <files>\nconst VERSION = ${JSON.stringify(hash.digest('hex').slice(0, 12))};\nconst FILES = ${JSON.stringify(files, null, 2)};\n// </files>`;
}

export const withBlock = (sw) => sw.replace(/\/\/ <files>[\s\S]*\/\/ <\/files>/, swBlock());

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = join(ROOT, 'sw.js');
  writeFileSync(file, withBlock(readFileSync(file, 'utf8')));
  console.log(`sw.js stores ${offlinePaths().length} files.`);
}
