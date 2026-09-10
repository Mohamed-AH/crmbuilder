/*
 * boot-theme.js — the theme choice: stored, applied before first paint, and
 * owned in one place.
 *
 * WHY THIS IS A FILE AND NOT AN INLINE SCRIPT. The CSP is `script-src 'self'`
 * (§30 Phase 4), so an inline block in index.html is refused outright, and §30
 * rejected the CSP-hash alternative in as many words: a hash breaks silently on
 * a whitespace change, and the symptom is the feature quietly not working.
 * js/boot-icons.js exists for exactly this reason and is the precedent.
 *
 * WHY IT IS IN <head> AND NOT WITH THE OTHER SCRIPTS. Every other app script
 * sits at the end of <body> (§3's load order). By the time those run the page
 * has been parsed and can already have painted, which is a flash of the wrong
 * theme on the one read that has to happen first. A classic script in <head>
 * blocks parsing, so the attribute is on <html> before any of <body> exists.
 *
 * WHY IT OWNS THE KEY. `crmb:tourSeen` is the precedent for a device-level
 * preference: a plain localStorage key with a `crmb:` prefix, held by the one
 * module that uses it rather than routed through Scope, which exists for the
 * per-workspace keys (§11). Two files both knowing the string is how they drift,
 * so app.js goes through THEME rather than reading localStorage itself.
 *
 * THE COLD-START COST IS REAL AND THE DEFAULT ABSORBS IT. A render-blocking
 * script costs one round trip on a first visit before anything paints. But
 * `system` is the default, and with NO attribute set the stylesheet follows the
 * OS exactly as it did before any of this existed — so a visitor on the default
 * sees the right theme even if this file never arrives. Only somebody who has
 * explicitly chosen against their OS can see a flash, once, on a cold load.
 * That asymmetry is why the CSS keeps its media query rather than having this
 * script resolve `system` itself.
 *
 * `THEME` is a bare global, not `window.THEME` — a top-level `const` in a
 * classic script is lexical, which §39 records for `DB` and §41 for `Cloud`.
 */
const THEME = (function () {
  const KEY = 'crmb:theme';
  // `system` is the default AND the absence of a choice. Both must leave the
  // attribute off: writing data-theme="system" would be a selector nothing
  // matches, and the CSS would silently fall back to light on a dark OS.
  const CHOICES = ['system', 'light', 'dark'];

  function read() {
    try {
      const v = localStorage.getItem(KEY);
      return CHOICES.indexOf(v) > 0 ? v : 'system';
    } catch (err) {
      // No storage — a private window with site data blocked throws on access
      // itself. The media query still applies, which is the old behaviour, and
      // §3 says no single failure may leave the app unrendered.
      return 'system';
    }
  }

  function apply(choice) {
    const root = document.documentElement;
    if (choice === 'light' || choice === 'dark') root.setAttribute('data-theme', choice);
    else root.removeAttribute('data-theme');
  }

  function set(choice) {
    const next = CHOICES.indexOf(choice) >= 0 ? choice : 'system';
    try {
      if (next === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch (err) { /* the choice still applies for this page */ }
    apply(next);
    return next;
  }

  apply(read());
  return { choices: CHOICES, get: read, set, apply };
})();
