/*
 * manual-toc.js — the contents menu and scroll-spy for docs/manual.html.
 *
 * A FILE rather than an inline <script>, and not by preference: §30's CSP sets
 * `script-src 'self'`, so the inline version this replaces was refused on the
 * live deployment and the mobile Contents toggle simply did nothing. The app
 * had already learnt this — `js/boot-icons.js` exists for exactly the same
 * reason — but the two customer-facing doc pages were never checked against
 * the header that broke them (§47).
 *
 * Lives in js/ because that directory is allow-listed and served (§28). It is
 * NOT part of the app shell: index.html does not load it, sw.js does not
 * precache it, and it must not be added to either.
 */
  // Mobile contents toggle
  const toc = document.getElementById('toc');
  const toggle = document.getElementById('tocToggle');
  toggle.addEventListener('click', () => {
    const open = toc.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.innerHTML = open ? 'Contents &nbsp;▴' : 'Contents &nbsp;▾';
  });
  toc.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
    if (window.matchMedia('(max-width: 900px)').matches) {
      toc.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.innerHTML = 'Contents &nbsp;▾';
    }
  }));

  // Highlight the section currently in view
  const links = new Map();
  toc.querySelectorAll('a').forEach((a) => links.set(a.getAttribute('href').slice(1), a));
  const seen = new Set();

  const spy = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) seen.add(e.target.id);
      else seen.delete(e.target.id);
    });
    // The topmost visible section wins.
    const order = [...links.keys()];
    const active = order.find((id) => seen.has(id));
    links.forEach((a, id) => a.classList.toggle('is-active', id === active));
  }, { rootMargin: '-8% 0px -70% 0px', threshold: 0 });

  document.querySelectorAll('main section').forEach((s) => spy.observe(s));
