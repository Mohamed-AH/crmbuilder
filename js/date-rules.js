/*
 * date-rules.js — "is this date field due soon?", without a date library.
 *
 * A `date` field stores a plain calendar day as `YYYY-MM-DD` (js/app.js coerces
 * to that shape, and `<input type="date">` produces it). There is no time and no
 * zone in the stored value, so every comparison here is CALENDAR arithmetic.
 *
 * THE TRAP, and the entire reason this file exists rather than three lines
 * inline: `new Date('2026-09-12')` is parsed as UTC midnight. Anywhere west of
 * Greenwich its `.getDate()` is the 11th, so a naive implementation reports
 * "due tomorrow" for something due today, for every user in the Americas, and
 * is perfectly correct for whoever wrote it in London. That is a defect that
 * renders as plausible (§36) — nothing throws, the number is just wrong by one
 * for half the world.
 *
 * So a stored day is parsed by REGEX into its parts, today is read from local
 * calendar getters, and both are projected through `Date.UTC` before
 * subtracting. UTC has no daylight saving, so the difference of two midnights
 * is always an exact multiple of a day — subtracting local timestamps instead
 * yields 23- and 25-hour days twice a year, and a rounded division that is
 * off by one across the change.
 *
 * Exposed as a global to match js/csv.js: no build step, no modules, loaded by
 * a plain script tag (§3). tests/dateRules.test.mjs evaluates this source with
 * `new Function` the way tests/csv.test.mjs does, so the browser and the tests
 * read the same file.
 */
const DateRules = (() => {
  const DAY_MS = 86400000;
  const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

  /*
   * A calendar day as a UTC-midnight timestamp, used only as a number to
   * subtract. Never render this or hand it to a formatter — it is a coordinate,
   * not an instant, and treating it as one is the bug described above.
   */
  function dayNumber(y, m, d) {
    return Date.UTC(y, m - 1, d);
  }

  // The stored value, or null for anything that is not a plain calendar day.
  // Deliberately strict: a blank cell, a half-typed value and a datetime are
  // all "no answer" rather than a guess, because guessing here silently moves
  // a record in or out of the list somebody is working from.
  function parseDay(value) {
    const m = ISO_DAY.exec(String(value ?? '').trim());
    if (!m) return null;
    const [, y, mo, d] = m.map(Number);
    const t = dayNumber(y, mo, d);
    // Rejects 2026-02-30 and friends: Date.UTC rolls them over, so the
    // round trip only matches for a day that really exists.
    const back = new Date(t);
    if (back.getUTCFullYear() !== y || back.getUTCMonth() + 1 !== mo || back.getUTCDate() !== d) return null;
    return t;
  }

  // Today as the viewer's LOCAL calendar day — the one on their wall — not the
  // UTC day. `now` is injectable so tests can pin it without touching the clock.
  function today(now) {
    const n = now instanceof Date ? now : new Date();
    return dayNumber(n.getFullYear(), n.getMonth() + 1, n.getDate());
  }

  /*
   * Whole days from today to `value`. Negative is the past, 0 is today.
   * null when the value is not a date at all — callers must distinguish that
   * from 0, which is why this does not fall back to a number.
   */
  function daysUntil(value, now) {
    const day = parseDay(value);
    if (day === null) return null;
    return Math.round((day - today(now)) / DAY_MS);
  }

  /*
   * NOT called isExpiringSoon, and the difference is the point.
   *
   * "Expiring soon" reads as a future window, and a filter that only shows the
   * future hides the overdue invoice and the licence that lapsed last month —
   * which are the rows most worth looking at. So anything already past is
   * always included, and the window bounds only the future side.
   *
   * A name that promised "soon" while returning true for a six-month-old
   * invoice would be a small lie told at every call site.
   */
  function isDueWithin(value, days, now) {
    const n = daysUntil(value, now);
    return n !== null && n <= days;
  }

  /*
   * Which field a module's date filter should watch.
   *
   * A module may have none, one, or several. Preferring a list column is a
   * guess, but a defensible one — a date the owner put in the table is a date
   * they care about — and the UI names whichever field is chosen rather than
   * filtering on something invisible. Returns null when there is nothing to
   * filter on, which is what hides the control entirely.
   */
  function watchedDateField(mod) {
    const dates = ((mod && mod.fields) || []).filter((f) => f && f.type === 'date');
    if (!dates.length) return null;
    return dates.find((f) => f.showInList) || dates[0];
  }

  return { parseDay, daysUntil, isDueWithin, watchedDateField, today };
})();
