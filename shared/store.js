// Every app saves its data as one JSON value under its storage key, and reads it back on
// opening. If what's there can't be read (corrupt, or a shape an update didn't expect), the
// app starts fresh, and its next save would replace the old data for good. Each app calls
// keepUnreadable() first, so the old data is copied aside instead of lost.

// Copies the value under `key` to `<key>-unreadable-<time>` if it isn't valid JSON or
// `isValid(value)` says no. Returns true when a copy was made.
export function keepUnreadable(key, isValid, storage = globalThis.localStorage, now = Date.now()) {
  let raw;
  try {
    raw = storage.getItem(key);
  } catch {
    return false; // storage blocked: nothing to protect (shared/pwa.js explains)
  }
  if (raw == null) return false;
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === 'object' && isValid(value)) return false;
  } catch { /* not JSON: keep a copy */ }
  try {
    storage.setItem(`${key}-unreadable-${now}`, raw);
    return true;
  } catch {
    return false;
  }
}
