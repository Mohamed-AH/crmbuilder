/*
 * sw.js — offline-first service worker for CRM Builder.
 * App shell is precached; same-origin static requests are cache-first.
 * API/auth requests are network-only (never cached).
 * Bump CACHE_VERSION whenever any precached asset changes.
 */
const CACHE_VERSION = 'crmbuilder-v39';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './fonts/inter-var-latin.woff2',
  './js/icons.js',
  './js/boot-icons.js',
  './js/scope.js',
  './js/db.js',
  './js/csv.js',
  './js/date-rules.js',
  './js/templates.js',
  './js/demo-data.js',
  './js/tour.js',
  './js/cloud.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Dynamic data is never cached — the client handles offline itself.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  /*
   * Real pages that are NOT the app, and must not be served the app's shell.
   *
   * The navigation handler below answers every navigation with index.html and
   * writes whatever it fetched back over the cached copy — so without this,
   * opening /privacy would show the CRM, and would then poison the cached
   * shell with the privacy page. Both failures are silent.
   */
  const STANDALONE_PAGES = ['/privacy', '/terms'];
  if (STANDALONE_PAGES.includes(url.pathname) || STANDALONE_PAGES.some((p) => url.pathname === `${p}.html`)) {
    // Handled by the browser, not by us: no cache entry, so these are the one
    // part of the site that needs a connection. That is the right trade — they
    // are read once, and serving a stale policy is worse than serving none.
    return;
  }

  // Navigations serve the cached shell immediately and refresh it in the
  // background. Free-tier hosts sleep when idle, and network-first here meant
  // a returning visitor stared at nothing while the server woke up; the shell
  // is self-contained, so there is nothing to wait for.
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cached) => {
        const fresh = fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put('./index.html', copy));
          }
          return response;
        });
        return cached || fresh.catch(() => caches.match('./index.html'));
      })
    );
    return;
  }

  // Static assets: cache-first, falling back to network (and caching the result).
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
