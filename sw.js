/* ═══════════════════════════════════════════
   Stars & Sorcery Companion — Service Worker
   Version: 1.0.0
   Strategies:
     Shell/CSS/JS/Fonts → Cache-First
     Images             → Stale-While-Revalidate
     Navigation         → Network-first with shell fallback
═══════════════════════════════════════════ */

/* ─── Cache version ─────────────────────────────────────────────────────────
   Bump BUILD_TS when deploying a new version; all three cache names change
   automatically so stale caches are evicted on the next activation.
   ─────────────────────────────────────────────────────────────────────────── */
const BUILD_TS       = '20250415';          // update on each deploy
const SHELL_VERSION  = `shell-v1-${BUILD_TS}`;
const STATIC_VERSION = `static-v1-${BUILD_TS}`;
const IMG_VERSION    = `img-v1-${BUILD_TS}`;
const ALL_CACHES     = [SHELL_VERSION, STATIC_VERSION, IMG_VERSION];

/* App shell: these files must open the app offline */
const SHELL_URLS = [
  './',
  './index.html',
  './manifest.json'
];

/* ── INSTALL: precache app shell ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_VERSION)
      .then(cache => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()) // activate immediately when user accepts update
  );
});

/* ── ACTIVATE: delete old caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => !ALL_CACHES.includes(k))
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH: routing ── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-GET and cross-origin requests
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Decide strategy by resource type
  const dest = request.destination;

  if (dest === 'image') {
    // Stale-While-Revalidate for images
    event.respondWith(staleWhileRevalidate(IMG_VERSION, request));
  } else if (dest === 'style' || dest === 'script' || dest === 'font') {
    // Cache-First for static assets
    event.respondWith(cacheFirst(STATIC_VERSION, request));
  } else if (dest === 'document' || dest === '') {
    // Navigation: network-first with shell fallback
    event.respondWith(networkFirstWithShellFallback(request));
  }
});

/* ── STRATEGY: Cache-First ── */
async function cacheFirst(cacheName, request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

/* ── STRATEGY: Stale-While-Revalidate ── */
async function staleWhileRevalidate(cacheName, request) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached || await fetchPromise || new Response('Offline', { status: 503 });
}

/* ── STRATEGY: Network-First with shell fallback ── */
async function networkFirstWithShellFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Return shell as fallback
    const shell = await caches.match('./index.html');
    if (shell) return shell;
    return new Response(
      '<html><body style="background:#07060a;color:#d8cce8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center"><div><h2 style="color:#c8a96e">Sin conexión</h2><p>La aplicación no está disponible offline en este momento.</p></div></body></html>',
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
}

/* ── MESSAGE: skipWaiting on demand ── */
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
