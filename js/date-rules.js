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
 *
 * AND server.js requires it — see the one-line export at the foot of the file.
 * The alternatives were both worse: duplicating this arithmetic into lib/ makes
 * a second source that goes stale (§29's whole thesis), and eval-ing this file
 * at boot needs a paragraph in §30 explaining why it is not an injection risk.
 * One file, three consumers, no build step.
 *
 * TWO CLOCKS, AND THEY ARE NOT THE SAME QUESTION.
 *   today(now)         — the VIEWER's calendar day, from local getters. What a
 *                        person looking at a list means by "today" (§37).
 *   today(now, zone)   — a NAMED zone's calendar day. What the server means,
 *                        because it has no viewer and must not borrow the one
 *                        the container happens to be set to.
 * Conflating them is how a Tokyo workspace gets Monday's digest on Sunday
 * evening, and how a browser in Los Angeles reports the owner's tomorrow.
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

  /*
   * An IANA zone name, or 'UTC' for anything Intl will not accept.
   *
   * NEVER throws, and that is the requirement rather than a convenience. The
   * workspace timezone is stored without server-side validation (§38: doing it
   * in applyPush means touching the sync seam to guard a string only a
   * hand-written push can produce), so the guarantee has to live at every
   * point of USE. A throw here would take down a scheduled pass for every
   * workspace because one of them holds a typo.
   *
   * '' — nobody chose — resolves to UTC too. The distinction between "unset"
   * and "UTC" is a thing the SCREEN says (§38); by the time arithmetic is
   * being done, they mean the same instant.
   */
  function resolveZone(value) {
    const name = String(value ?? '').trim();
    if (!name) return 'UTC';
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: name });
      return name;
    } catch {
      return 'UTC';
    }
  }

  /*
   * The wall-clock parts of `now` in a named zone.
   *
   * `hourCycle: 'h23'` rather than `hour12: false`, deliberately: the latter
   * selects h24 on some ICU builds, which renders midnight as "24" and would
   * make an hour-of-day gate fire on the wrong side of a day boundary. The
   * `% 24` is a second belt for the same trap, because which cycle you get is
   * a property of the runtime rather than of this code.
   */
  function zoneParts(zone, now) {
    const at = now instanceof Date ? now : new Date();
    const safe = resolveZone(zone);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: safe,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', hourCycle: 'h23',
    }).formatToParts(at);
    const get = (type) => Number((parts.find((p) => p.type === type) || {}).value);
    return {
      zone: safe,
      year: get('year'),
      month: get('month'),
      day: get('day'),
      hour: get('hour') % 24,
    };
  }

  /*
   * 'YYYY-MM-DD' in a named zone — the key that answers "have we already done
   * this today". It has to be the workspace's own day: computed in UTC, a
   * Pacific/Auckland workspace rolls over thirteen hours early and an
   * America/Los_Angeles one seven hours late.
   */
  function dayKey(zone, now) {
    const p = zoneParts(zone, now);
    const pad = (n) => String(n).padStart(2, '0');
    return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  }

  // Today's calendar day. With no zone: the VIEWER's, from local getters —
  // what a person reading a list means. With one: that zone's, which is what
  // the server means, because it has no viewer to borrow a wall clock from.
  // `now` is injectable so tests can pin it without touching the clock.
  function today(now, zone) {
    if (zone !== undefined && zone !== null && zone !== '') {
      const p = zoneParts(zone, now);
      return dayNumber(p.year, p.month, p.day);
    }
    const n = now instanceof Date ? now : new Date();
    return dayNumber(n.getFullYear(), n.getMonth() + 1, n.getDate());
  }

  /*
   * Whole days from today to `value`. Negative is the past, 0 is today.
   * null when the value is not a date at all — callers must distinguish that
   * from 0, which is why this does not fall back to a number.
   */
  function daysUntil(value, now, zone) {
    const day = parseDay(value);
    if (day === null) return null;
    return Math.round((day - today(now, zone)) / DAY_MS);
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
  function isDueWithin(value, days, now, zone) {
    const n = daysUntil(value, now, zone);
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

  return { parseDay, daysUntil, isDueWithin, watchedDateField, today, resolveZone, zoneParts, dayKey };
})();

/*
 * One line, three consumers.
 *
 * The browser loads this as a plain script and picks up `DateRules` as a
 * global (§3's script order). server.js requires it. tests/dateRules.test.mjs
 * evaluates the source with `new Function`, where `module` is undefined and
 * the guard simply skips — so all three read the same arithmetic and the
 * five-timezone suite covers the server for free.
 */
if (typeof module !== 'undefined' && module.exports) module.exports = DateRules;
