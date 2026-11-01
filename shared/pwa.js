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
