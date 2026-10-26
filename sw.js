// Keeps every app working offline. Pages and files come from the network when it answers
// within a few seconds (so updates show up straight away) and from the saved copy otherwise.
// The file list and VERSION are written by tools/build-sw.js (`npm run sw`); don't edit them by hand.

// <files>
const VERSION = "7807c8517ba2";
const FILES = [
  "./",
  "petty-cash/",
  "sushiro/",
  "split/",
  "trip/",
  "calc84/",
  "wallets/",
  "security/",
  "bazi/",
  "ziwei/",
  "fengshui/",
  "learnai/",
  "godigital/",
  "mergetactics/",
  "chat/",
  "manifest.webmanifest",
  "shared/backup.js",
  "shared/pwa.js",
  "shared/styles.css",
  "shared/ui.js",
  "src/backup.js",
  "src/bazi.js",
  "src/bazimatch.js",
  "src/baziread.js",
  "src/cash.js",
  "src/chat.js",
  "src/compass.js",
  "src/fengshui.js",
  "src/godigital.js",
  "src/learnai.js",
  "src/lunar.js",
  "src/mergetactics.js",
  "src/onchain.js",
  "src/places.js",
  "src/plangrid.js",
  "src/prices.js",
  "src/receipt.js",
  "src/security.js",
  "src/solana.js",
  "src/split.js",
  "src/sushiro.js",
  "src/sync.js",
  "src/ti84.js",
  "src/tokensearch.js",
  "src/trip.js",
  "src/ziwei.js",
  "icons/bazi-192.png",
  "icons/bazi-apple.png",
  "icons/calc84-192.png",
  "icons/calc84-apple.png",
  "icons/chat-192.png",
  "icons/chat-apple.png",
  "icons/fengshui-192.png",
  "icons/fengshui-apple.png",
  "icons/godigital-192.png",
  "icons/godigital-apple.png",
  "icons/home-192.png",
  "icons/home-apple.png",
  "icons/learnai-192.png",
  "icons/learnai-apple.png",
  "icons/mergetactics-192.png",
  "icons/mergetactics-apple.png",
  "icons/petty-cash-192.png",
  "icons/petty-cash-apple.png",
  "icons/security-192.png",
  "icons/security-apple.png",
  "icons/split-192.png",
  "icons/split-apple.png",
  "icons/sushiro-192.png",
  "icons/sushiro-apple.png",
  "icons/trip-192.png",
  "icons/trip-apple.png",
  "icons/wallets-192.png",
  "icons/wallets-apple.png",
  "icons/ziwei-192.png",
  "icons/ziwei-apple.png",
  "petty-cash/app.js",
  "petty-cash/manifest.webmanifest",
  "sushiro/ai.js",
  "sushiro/app.js",
  "sushiro/fonts/fonts.css",
  "sushiro/fonts/mplus-rounded-400.woff2",
  "sushiro/fonts/mplus-rounded-700.woff2",
  "sushiro/fonts/mplus-rounded-800.woff2",
  "sushiro/manifest.webmanifest",
  "sushiro/ocr.js",
  "sushiro/photos.js",
  "split/app.js",
  "split/manifest.webmanifest",
  "trip/app.js",
  "trip/manifest.webmanifest",
  "calc84/app.js",
  "calc84/calc84.css",
  "calc84/manifest.webmanifest",
  "wallets/app.js",
  "wallets/manifest.webmanifest",
  "security/app.js",
  "security/manifest.webmanifest",
  "bazi/app.js",
  "bazi/manifest.webmanifest",
  "ziwei/app.js",
  "ziwei/manifest.webmanifest",
  "fengshui/app.js",
  "fengshui/manifest.webmanifest",
  "fengshui/plan.js",
  "learnai/app.js",
  "learnai/lessons-zh.js",
  "learnai/lessons.js",
  "learnai/manifest.webmanifest",
  "godigital/app.js",
  "godigital/manifest.webmanifest",
  "godigital/shots/dbs-addbill.jpg",
  "godigital/shots/dbs-addbillreview.jpg",
  "godigital/shots/dbs-amount.jpg",
  "godigital/shots/dbs-balance.jpg",
  "godigital/shots/dbs-billreview.jpg",
  "godigital/shots/dbs-bills.jpg",
  "godigital/shots/dbs-billsaved.jpg",
  "godigital/shots/dbs-billsent.jpg",
  "godigital/shots/dbs-home.jpg",
  "godigital/shots/dbs-login.jpg",
  "godigital/shots/dbs-paybill.jpg",
  "godigital/shots/dbs-paynow.jpg",
  "godigital/shots/dbs-paynowto.jpg",
  "godigital/shots/dbs-paytransfer.jpg",
  "godigital/shots/dbs-review.jpg",
  "godigital/shots/dbs-scan.jpg",
  "godigital/shots/dbs-scanpay.jpg",
  "godigital/shots/dbs-scanreview.jpg",
  "godigital/shots/dbs-scansent.jpg",
  "godigital/shots/dbs-sent.jpg",
  "godigital/shots/dbs-start.jpg",
  "mergetactics/app.js",
  "mergetactics/manifest.webmanifest",
  "chat/app.js",
  "chat/manifest.webmanifest",
  "chat/store.js"
];
// </files>

const CACHE = `pocket-apps-${VERSION}`;
const TIMEOUT_MS = 4000;
// Libraries fetched from a CDN that are small enough to keep for offline use.
const KEEP_REMOTE = [/^https:\/\/cdn\.jsdelivr\.net\/npm\/qrcode-generator@/];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pocket-apps-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  const fromNetwork = fetch(request).then((res) => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  });
  fromNetwork.catch(() => {}); // a late failure after the timeout is fine
  const timeout = new Promise((resolve) => setTimeout(resolve, TIMEOUT_MS));
  try {
    const res = await Promise.race([fromNetwork, timeout]);
    if (res) return res;
  } catch { /* offline: use the saved copy */ }
  const saved = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
  return saved || fromNetwork;
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const saved = await cache.match(request);
  if (saved) return saved;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin === scope.origin && url.pathname.startsWith(scope.pathname)) event.respondWith(networkFirst(request));
  else if (KEEP_REMOTE.some((re) => re.test(request.url))) event.respondWith(cacheFirst(request));
});
