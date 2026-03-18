/* ════════════════════════════════════════════════════════════════
   sw.js — Crestle Service Worker
   ════════════════════════════════════════════════════════════════
   A service worker runs in the background, separate from the page.
   It intercepts network requests and can serve cached responses,
   enabling offline support and faster load times.

   Strategy used here: Cache First for static assets, Network First
   for API calls (so game data is always fresh when online).
   ════════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'crestle-v1';

// Static assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/game.js',
  '/manifest.json',
];

// ── Install: cache static assets ─────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  // Activate immediately without waiting for old tabs to close
  self.skipWaiting();
});

// ── Activate: clean up old caches ────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: serve from cache or network ───────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API calls (backend on Render) — always go to network
  // Fall back to a simple error response if offline
  if (url.hostname.includes('onrender.com')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'Offline' }), {
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // Static assets — cache first, then network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache successful responses for static assets
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});