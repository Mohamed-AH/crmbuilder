/*
 * Fill the static data-lucide placeholders in index.html before the app boots.
 *
 * This lived as an inline <script> in index.html. It is a file now because
 * Content-Security-Policy's `script-src 'self'` forbids inline script, and a
 * file is steadier than a CSP hash: a hash breaks silently on a whitespace
 * change, and the failure looks like the icons simply not appearing.
 */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-lucide]').forEach((el) => {
    el.innerHTML = icon(el.dataset.lucide, el.classList.contains('icon-btn') ? 17 : 16);
  });
});
