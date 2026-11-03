// Loaded by every page: turns on offline use and asks the browser to keep saved data.
// Without persistent storage, Safari can clear a site's data after a week of not opening it.

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), { scope: new URL('../', import.meta.url).pathname }).catch(() => {});
}

navigator.storage?.persist?.().catch(() => {});

// Pages show a loading skeleton until their app has drawn itself (see "Loading" in
// styles.css). That's when every script has run, unless an app is still busy: it calls
// holdReady() while it runs, then the function that returns when it's done.
let holds = 0;
let loaded = false;
export function appReady() {
  document.body?.classList.add('ready');
}
export function holdReady() {
  holds++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds--;
    if (loaded && holds <= 0) appReady();
  };
}
function onLoaded() {
  loaded = true;
  if (holds <= 0) appReady();
}
// Module scripts run before DOMContentLoaded, in page order, so this waits for the app's own.
if (document.readyState === 'complete') onLoaded();
else document.addEventListener('DOMContentLoaded', onLoaded, { once: true });

// ---- Keeping data safe ----------------------------------------------------------------------
// Everything is saved in the browser, which on iPhones is fragile in ways people don't expect:
// - Safari deletes a site's saved data if it isn't opened for 7 days of Safari use.
// - A Home Screen app keeps its data separately from Safari, so after "Add to Home Screen"
//   the app opens empty, which looks like the data vanished.
// - Some browsers block storage outright (Block All Cookies, some in-app browsers).
// These notices explain each case where it happens and offer a backup or restore on the spot.

const NOTE_KEY = 'pocket-note-ios';
const appName = document.title;
const isIos = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const inAppBrowser = /FBAN|FBAV|Instagram|Line\/|MicroMessenger|Telegram|TikTok|Snapchat/i.test(navigator.userAgent);

function store(fn) {
  try { return fn(localStorage); } catch { return undefined; }
}

function storageWorks() {
  return store((s) => { s.setItem('pocket-probe', '1'); s.removeItem('pocket-probe'); return true; }) === true;
}

function hasData(key) {
  if (key === '*') return store((s) => Object.keys(s).some((k) => /-v1$/.test(k))) === true;
  return store((s) => s.getItem(key) != null) === true;
}

function showNote({ tone = '', title, body, actions = [], onDismiss }) {
  const host = document.querySelector('main.hub > p') || document.querySelector('.boot') || document.querySelector('main');
  if (!host) return;
  const note = document.createElement('div');
  note.className = `store-note ${tone}`;
  note.setAttribute('role', 'note');
  note.innerHTML = `<p class="store-note-title"></p><div class="store-note-body"></div><div class="store-note-actions"></div><p class="store-note-status" hidden></p>`;
  note.querySelector('.store-note-title').textContent = title;
  note.querySelector('.store-note-body').innerHTML = body;
  const status = (text, kind) => {
    const el = note.querySelector('.store-note-status');
    el.hidden = !text;
    el.className = `store-note-status ${kind || ''}`;
    el.textContent = text;
  };
  const row = note.querySelector('.store-note-actions');
  for (const a of actions) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = a.primary ? 'primary small' : 'secondary small';
    b.textContent = a.label;
    b.addEventListener('click', () => a.run(status, note));
    row.append(b);
  }
  if (onDismiss) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'text-btn store-note-close';
    b.textContent = 'Got it';
    b.addEventListener('click', () => { onDismiss(); note.remove(); });
    row.append(b);
  }
  if (host.matches('main.hub > p')) host.after(note);
  else {
    // Above the app, outside its views, so it stays put while the app switches screens.
    const wrap = document.createElement('div');
    wrap.className = 'store-note-wrap';
    wrap.append(note);
    host.before(wrap);
  }
}

const backupAction = { label: 'Save a backup', primary: true, run: async (status) => (await import('./backup.js')).saveBackup(status) };
const restoreAction = {
  label: 'Restore a backup',
  primary: true,
  run: async (status) => { if (await (await import('./backup.js')).pickAndRestore(status)) setTimeout(() => location.reload(), 600); },
};

function storageNotes() {
  const key = document.body?.dataset.saves;
  if (!key) return;
  if (!storageWorks()) {
    showNote({
      tone: 'bad',
      title: 'This browser isn’t letting the app save',
      body: `<p>Anything you enter will be lost when you close the page.${isIos ? ' On iPhone, check Settings → Apps → Safari and turn off <b>Block All Cookies</b>, and don’t use Private Browsing.' : ' Allow this site to store data, and don’t use a private window.'}${inAppBrowser ? ' You seem to be in an app’s built-in browser: open the page in Safari or Chrome instead.' : ''}</p>`,
    });
    return;
  }
  if (inAppBrowser) {
    showNote({
      tone: 'warn',
      title: 'Open this in your browser',
      body: '<p>You’re in an app’s built-in browser, which often clears what pages save. Open this page in Safari or Chrome (use the ⋯ or share menu) so your data stays.</p>',
    });
    return;
  }
  if (!isIos) return;
  if (isStandalone) {
    // A fresh Home Screen app: the data may still be in Safari.
    const movedKey = `pocket-note-moved-${key}`;
    if (hasData(key) || store((s) => s.getItem(movedKey))) return;
    showNote({
      title: key === '*' ? 'Used these apps in Safari before?' : `Used ${appName} in Safari before?`,
      body: '<p>Home Screen apps keep their own data, separate from Safari, so this starts empty. To bring your data over: in Safari, open Pocket Apps and tap <b>Save a backup</b>, then restore that file here.</p>',
      actions: [restoreAction],
      onDismiss: () => store((s) => s.setItem(movedKey, '1')),
    });
    return;
  }
  const dismissed = Number(store((s) => s.getItem(NOTE_KEY)) || 0);
  if (Date.now() - dismissed < 30 * 864e5) return;
  showNote({
    tone: 'warn',
    title: 'Keep your data on this iPhone',
    body: `<p>Safari deletes what websites save if you don’t open them for 7 days, so what you enter here can disappear. To keep it:</p>
      <ol><li><b>Save a backup</b> (below) to Files or iCloud Drive.</li>
      <li>Tap Share <span aria-hidden="true">⎙</span>, then <b>Add to Home Screen</b>.</li>
      <li>Open the app from your Home Screen and restore the backup there. Home Screen apps keep their data, but start empty because they don’t share it with Safari.</li></ol>`,
    actions: [backupAction],
    onDismiss: () => store((s) => s.setItem(NOTE_KEY, String(Date.now()))),
  });
}

if (document.readyState === 'complete') storageNotes();
else document.addEventListener('DOMContentLoaded', storageNotes, { once: true });
