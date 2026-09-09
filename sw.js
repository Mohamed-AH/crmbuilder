/*
 * sw.js — offline-first service worker for CRM Builder.
 * App shell is precached; same-origin static requests are cache-first.
 * API/auth requests are network-only (never cached).
 * Bump CACHE_VERSION whenever any precached asset changes.
 */
const CACHE_VERSION = 'crmbuilder-v52';
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
  './js/dsar.js',
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
   *
   * THE DOC PAGES WERE MISSING FROM THIS LIST FOR TWENTY-ONE CACHE VERSIONS
   * (§47). §19 added /privacy and /terms because they were the pages in front
   * of it at the time; /docs/manual.html and /docs/product-tour.html are
   * equally not-the-app, equally public, and their URLs are equally frozen —
   * and opening the manual really did render the CRM. Anything served that is
   * not the app belongs here, which is why the entries are listed beside the
   * server's own PUBLIC_ROOT_FILES / PUBLIC_DOCS rather than added ad hoc.
   */
  const STANDALONE_PAGES = ['/privacy', '/terms', '/guide', '/docs/manual', '/docs/product-tour'];
  /*
   * …and the files those pages load. The early return below matches a
   * NAVIGATION, so a subresource never reached it: /legal.css fell through to
   * the cache-first branch at the foot of this file and was kept with no
   * revalidation. Measured, not reasoned — installing the worker and opening
   * /guide put /legal.css in the v45 cache. §47 says a legal.css edit needs no
   * CACHE_VERSION bump because the file is in neither index.html nor
   * APP_SHELL; that checked the PRECACHE and missed the runtime cache, so the
   * table styling shipped in 611d37f was invisible to anyone already carrying
   * a copy — the roles table at browser defaults, which is the state that
   * change existed to remove.
   *
   * Listing them here is what makes the claim true rather than merely
   * restating it: a page the worker refuses to handle should not have its
   * stylesheet handled either.
   */
  const STANDALONE_ASSETS = ['/legal.css', '/js/manual-toc.js'];

  /*
   * …and the two JSON endpoints that predate /api/ and are therefore not
   * caught by the prefix check above. Navigating to /healthz in a browser that
   * has the app installed served the CRM and then wrote the JSON body over the
   * cached shell, so the next load of / rendered {"ok":true,…} as the whole
   * application — permanently, because the navigation handler answers from
   * that cache first. Measured, and an operator checking their own health
   * endpoint is exactly who would hit it.
   *
   * This list fixes what such a navigation DISPLAYS. The cache poisoning is
   * closed structurally below, because a list only ever covers the paths
   * somebody thought of — which is how /docs/manual.html (§47) and these two
   * were both missed.
   */
  const STANDALONE_ENDPOINTS = ['/health', '/healthz'];
  if (
    STANDALONE_PAGES.includes(url.pathname)
    || STANDALONE_PAGES.some((p) => url.pathname === `${p}.html`)
    || STANDALONE_ASSETS.includes(url.pathname)
    || STANDALONE_ENDPOINTS.includes(url.pathname)
  ) {
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
          /*
           * `response.ok` alone is not "this is the app". Any same-origin
           * navigation that answers 200 with something else — a JSON endpoint,
           * the manifest, a stylesheet opened directly — was written back here
           * AS the shell, and from then on every load of / served that body
           * instead of the application. The lists above cannot close this:
           * they only ever name the paths somebody remembered.
           *
           * So the type is checked instead of the path. A response that is not
           * HTML is still returned to the caller; it simply never becomes the
           * cached shell.
           */
          const isShell = (response.headers.get('content-type') || '').includes('text/html');
          if (response.ok && isShell) {
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
