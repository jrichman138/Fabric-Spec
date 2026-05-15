// Cache-first service worker. Bump CACHE_VERSION when shipping changes.

const CACHE_VERSION = 'fabric-spec-v3';
const PRECACHE = [
  './',
  'index.html',
  'style.css?v=6',
  'app.js?v=6',
  'fonts/playfair-display.woff2',
  'images/bg-dark.jpg',
  'images/bg-light.jpg',
  'images/favicon-16.png',
  'images/favicon-32.png',
  'images/apple-touch-icon.png',
  'manifest.json',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(req, copy));
        return res;
      }).catch(() => cached);
    })
  );
});
