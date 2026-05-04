// CACHE NAME — bump on every release that touches memo.html, sw.js, the
// wordmark, or the orders-app shell. Older caches are wiped in `activate`.
const CACHE = 'lgb-v5-wordmark-png';
const ASSETS = ['./index.html', './manifest.json'];

// Files that must always be fresh (network-first). If you ship a code change
// to one of these and the user doesn't see it, check that the path matched.
const ALWAYS_FRESH = [
  '/orders-app/index.html',
  '/orders-app/memo.html',
  '/orders-app/sw.js',
  '/orders-app/assets/wordmark.png',
  '/orders-app/assets/diamond-icon.png',
  '/lgb/nav-logo.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const reqUrl = new URL(e.request.url);

  // Network-first for the always-fresh list (HTML files, SW, brand assets).
  if (ALWAYS_FRESH.some(p => reqUrl.pathname.endsWith(p)) || reqUrl.pathname.endsWith('/index.html')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }

  // Network for Google APIs (no offline fallback).
  if (e.request.url.includes('googleapis') || e.request.url.includes('script.google')) {
    e.respondWith(fetch(e.request).catch(() => new Response('offline')));
    return;
  }

  // Cache-first for everything else (fonts, images, static).
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return res;
    }))
  );
});
