// Backup file format for everything the apps save on a phone: the browser storage keys
// below, and the photo, floor plan and chat databases. Blobs (photos) are stored as base64
// so the backup is one plain JSON file.

export const STORAGE_KEYS = [
  'petty-cash-v1', 'petty-cash-theme', 'sushiro-v1', 'split-v1', 'trip-v1', 'calc84-v1',
  'wallets-v1', 'security-v1', 'bazi-v1', 'ziwei-v1', 'fengshui-v1', 'learnai-v1', 'godigital-v1', 'mergetactics-v1', 'tarot-v1', 'local-chat-v1',
];

// Saved by apps but not worth backing up: they're refetched when missing.
export const CACHE_KEYS = ['split-rates', 'security-cache'];

// Each database exactly as its app opens it, so restoring never creates a mismatched one.
export const DATABASES = [
  { name: 'sushiro-photos', store: 'receipts' },
  { name: 'fengshui-plan', store: 'plans' },
  { name: 'local-chat', store: 'chats', keyPath: 'id' },
];

const FORMAT = 'pocket-apps-backup';

function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Turns Blobs anywhere inside a value into { $blob, type } so it can go in JSON.
export async function pack(value) {
  if (value instanceof Blob) return { $blob: toBase64(new Uint8Array(await value.arrayBuffer())), type: value.type };
  if (Array.isArray(value)) return Promise.all(value.map(pack));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = await pack(v);
    return out;
  }
  return value;
}

export function unpack(value) {
  if (value && typeof value === 'object' && typeof value.$blob === 'string') {
    return new Blob([Uint8Array.from(atob(value.$blob), (c) => c.charCodeAt(0))], { type: value.type || '' });
  }
  if (Array.isArray(value)) return value.map(unpack);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, unpack(v)]));
  return value;
}

// storage: { key: string }, databases: { name: [{ key, value }] }
export async function makeBackup(storage, databases, now = new Date()) {
  const dbs = {};
  for (const [name, rows] of Object.entries(databases)) dbs[name] = await Promise.all(rows.map(async (r) => ({ key: r.key, value: await pack(r.value) })));
  return { format: FORMAT, version: 1, savedAt: now.toISOString(), storage, databases: dbs };
}

// Checks a parsed backup file. Returns { storage, databases } ready to restore, or throws
// an Error with a message for the user. Unknown keys and databases are ignored.
export function readBackup(data) {
  if (!data || data.format !== FORMAT) throw new Error("That isn't a Pocket Apps backup file.");
  if (data.version !== 1) throw new Error('This backup was made by a newer version. Reload the app and try again.');
  const storage = {};
  for (const k of STORAGE_KEYS) if (typeof data.storage?.[k] === 'string') storage[k] = data.storage[k];
  const databases = {};
  for (const { name } of DATABASES) {
    const rows = data.databases?.[name];
    if (Array.isArray(rows)) databases[name] = rows.filter((r) => r && 'key' in r).map((r) => ({ key: r.key, value: unpack(r.value) }));
  }
  return { storage, databases };
}

// A one-line description of what's in a backup, for the confirm message.
export function describeBackup(data) {
  const apps = new Set(Object.keys(data.storage || {}).filter((k) => STORAGE_KEYS.includes(k)).map((k) => k.replace(/-(v1|theme)$/, '')));
  const photos = (data.databases?.['sushiro-photos'] || []).length;
  const chats = (data.databases?.['local-chat'] || []).length;
  const parts = [`${apps.size} app${apps.size === 1 ? '' : 's'}`];
  if (photos) parts.push(`${photos} receipt photo${photos === 1 ? '' : 's'}`);
  if (chats) parts.push(`${chats} chat${chats === 1 ? '' : 's'}`);
  if ((data.databases?.['fengshui-plan'] || []).length) parts.push('a floor plan');
  const when = data.savedAt ? new Date(data.savedAt).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' }) : 'an unknown date';
  return `Saved ${when}: ${parts.join(', ')}.`;
}
