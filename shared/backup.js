// Saves everything the apps keep on this phone to a file, and restores it (for a new phone,
// after the browser cleared its data, or to move data between Safari and a Home Screen app).
// Used by the Backup card on the home screen and by the storage notices (shared/pwa.js).
import { STORAGE_KEYS, DATABASES, BACKUP_KEYS, makeBackup, readBackup, describeBackup, ago } from '../src/backup.js';

const $ = (id) => document.getElementById(id);

function openDb({ name, store, keyPath }) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(store, keyPath ? { keyPath } : undefined);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readDb(spec) {
  const db = await openDb(spec);
  try {
    return await new Promise((resolve, reject) => {
      const rows = [];
      const req = db.transaction(spec.store).objectStore(spec.store).openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return resolve(rows);
        rows.push({ key: c.primaryKey, value: c.value });
        c.continue();
      };
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function writeDb(spec, rows) {
  const db = await openDb(spec);
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(spec.store, 'readwrite');
      const s = tx.objectStore(spec.store);
      for (const r of rows) {
        if (spec.keyPath) s.put(r.value);
        else s.put(r.value, r.key);
      }
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// Remembers when the last backup was made, for the reminders (shared/pwa.js) and the home page.
function recordBackup() {
  try { localStorage.setItem(BACKUP_KEYS.last, String(Date.now())); } catch { /* reminders just keep showing */ }
  showLastBackup();
}

export function lastBackup() {
  try { return Number(localStorage.getItem(BACKUP_KEYS.last)) || 0; } catch { return 0; }
}

// The home page's "Last backup" line, highlighted once it's a month old or there's none.
function showLastBackup() {
  const el = $('backup-when');
  if (!el) return;
  const last = lastBackup();
  el.textContent = last ? `Last backup: ${ago(last)}` : 'No backup yet';
  el.classList.toggle('due', !last || Date.now() - last > 30 * 864e5);
}

// `status(text, kind)` reports progress and the result.
export async function saveBackup(status) {
  status('Collecting…');
  try {
    const storage = {};
    for (const k of STORAGE_KEYS) {
      const v = localStorage.getItem(k);
      if (v != null) storage[k] = v;
    }
    const databases = {};
    for (const spec of DATABASES) databases[spec.name] = await readDb(spec).catch(() => []);
    const backup = await makeBackup(storage, databases);
    const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
    const name = `pocket-apps-backup-${backup.savedAt.slice(0, 10)}.json`;
    const file = new File([blob], name, { type: 'application/json' });
    // On phones the share sheet can save straight to Files or iCloud Drive.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Pocket Apps backup' });
        recordBackup();
        status(`Backup shared. ${describeBackup(backup)}`, 'ok');
        return;
      } catch (e) {
        if (e.name === 'AbortError') return status('');
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    recordBackup();
    status(`Backup saved as ${name}. ${describeBackup(backup)}`, 'ok');
  } catch {
    status("Couldn't make the backup. Your browser may be blocking storage.", 'bad');
  }
}

export async function restoreBackup(file, status) {
  try {
    const data = JSON.parse(await file.text());
    const { storage, databases } = readBackup(data);
    if (!confirm(`Restore this backup? ${describeBackup(data)}\n\nIt replaces what those apps have saved on this phone.`)) return false;
    for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v);
    for (const spec of DATABASES) if (databases[spec.name]) await writeDb(spec, databases[spec.name]);
    status('Restored. Open any app to see your data.', 'ok');
    return true;
  } catch (e) {
    status(e instanceof SyntaxError ? "That file couldn't be read as a backup." : e.message || "Couldn't restore that file.", 'bad');
    return false;
  }
}

// Asks for a backup file and restores it. Resolves to true once restored.
export function pickAndRestore(status) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', async () => resolve(input.files[0] ? await restoreBackup(input.files[0], status) : false));
    input.click();
  });
}

// The Backup card on the home screen.
if ($('backup-save')) {
  showLastBackup();
  const status = (text, kind = 'neutral') => {
    $('backup-status').hidden = !text;
    $('backup-status').className = `status ${kind}`;
    $('backup-status').textContent = text;
  };
  $('backup-save').addEventListener('click', () => saveBackup(status));
  $('backup-restore').addEventListener('click', () => $('backup-file').click());
  $('backup-file').addEventListener('change', () => {
    const f = $('backup-file').files[0];
    if (f) restoreBackup(f, status);
    $('backup-file').value = '';
  });
}
