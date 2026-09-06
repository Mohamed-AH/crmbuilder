/*
 * dateRules.test.mjs — the calendar arithmetic behind the "due soon" filter.
 *
 * js/date-rules.js is plain ES5-ish source with no imports, so it is evaluated
 * directly rather than bundled — the same trick tests/csv.test.mjs uses, which
 * is what lets the browser and these tests read one file.
 *
 * The timezone tests are the reason this file exists. They run the SAME
 * assertions under TZ=UTC, TZ=Pacific/Kiritimati (+14) and TZ=Pacific/Midway
 * (-11) in a child process, because `new Date('2026-09-12')` is UTC midnight
 * and a naive implementation is off by one for everyone west of Greenwich
 * while being perfectly correct for whoever wrote it in London.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const SRC_URL = new URL('../js/date-rules.js', import.meta.url);
const src = readFileSync(fileURLToPath(SRC_URL), 'utf8');
// eslint-disable-next-line no-new-func
const DateRules = new Function(`${src}; return DateRules;`)();

// The same file, through the seam server.js uses. Asserted rather than assumed,
// because the whole point of the one-line export is that there is no second
// copy of this arithmetic — and a require() that quietly returned something
// else would leave the server running untested code that LOOKS shared.
const required = createRequire(import.meta.url)('../js/date-rules.js');

// A fixed "now" so nothing here depends on the day the suite happens to run.
// Local noon, deliberately: midnight would sit exactly on the boundary this is
// meant to be testing, and a passing test there would prove the least.
const NOW = new Date(2026, 8, 12, 12, 0, 0); // 12 Sep 2026, local

describe('DateRules.daysUntil', () => {
  test('today is 0, not 1 and not null', () => {
    assert.equal(DateRules.daysUntil('2026-09-12', NOW), 0);
  });

  test('counts forward and backward in whole days', () => {
    assert.equal(DateRules.daysUntil('2026-09-13', NOW), 1);
    assert.equal(DateRules.daysUntil('2026-09-19', NOW), 7);
    assert.equal(DateRules.daysUntil('2026-09-11', NOW), -1);
    assert.equal(DateRules.daysUntil('2026-06-14', NOW), -90);
  });

  test('crosses a month and a year boundary', () => {
    assert.equal(DateRules.daysUntil('2026-10-01', NOW), 19);
    assert.equal(DateRules.daysUntil('2027-01-01', NOW), 111);
  });

  /*
   * The one a millisecond-subtracting implementation gets wrong. Northern-
   * hemisphere DST ends between these dates in most of Europe and the US, so
   * the interval contains a 25-hour day; dividing elapsed milliseconds by
   * 86400000 and rounding is right only because the projection through
   * Date.UTC removes the hour in the first place.
   */
  test('a daylight-saving change does not shift the count', () => {
    const beforeDst = new Date(2026, 9, 20, 12, 0, 0); // 20 Oct 2026
    assert.equal(DateRules.daysUntil('2026-11-20', beforeDst), 31);
  });

  test('anything that is not a plain calendar day is null, never 0', () => {
    for (const bad of ['', null, undefined, 'soon', '12/09/2026', '2026-9-1', '2026-02-30', '2026-13-01', {}]) {
      assert.equal(DateRules.daysUntil(bad, NOW), null, `expected null for ${JSON.stringify(bad)}`);
    }
  });

  test('a datetime is refused rather than truncated', () => {
    // Truncating would be a guess about which day an instant belongs to, and
    // that guess is exactly the timezone bug this file exists to avoid.
    assert.equal(DateRules.daysUntil('2026-09-12T23:30:00Z', NOW), null);
  });
});

describe('DateRules.isDueWithin', () => {
  test('includes today and the whole window', () => {
    assert.equal(DateRules.isDueWithin('2026-09-12', 7, NOW), true);
    assert.equal(DateRules.isDueWithin('2026-09-19', 7, NOW), true, 'the boundary day is inside the window');
  });

  test('excludes the day after the window', () => {
    assert.equal(DateRules.isDueWithin('2026-09-20', 7, NOW), false);
  });

  /*
   * The assertion that stops somebody "fixing" this into a future-only window.
   * An overdue invoice and a lapsed certificate are the rows most worth
   * surfacing; a filter that hides them is worse than no filter, because it
   * looks like there is nothing to do.
   */
  test('overdue is always included, however old', () => {
    assert.equal(DateRules.isDueWithin('2026-09-11', 7, NOW), true);
    assert.equal(DateRules.isDueWithin('2020-01-01', 7, NOW), true);
  });

  test('a zero-day window is today and everything overdue', () => {
    assert.equal(DateRules.isDueWithin('2026-09-12', 0, NOW), true);
    assert.equal(DateRules.isDueWithin('2026-09-11', 0, NOW), true);
    assert.equal(DateRules.isDueWithin('2026-09-13', 0, NOW), false);
  });

  test('a blank date is never due', () => {
    assert.equal(DateRules.isDueWithin('', 30, NOW), false);
    assert.equal(DateRules.isDueWithin(null, 30, NOW), false);
  });
});

describe('DateRules.watchedDateField', () => {
  const dateField = (key, showInList) => ({ key, label: key, type: 'date', showInList });

  test('is null when the module has no date field, which hides the control', () => {
    assert.equal(DateRules.watchedDateField({ fields: [{ key: 'name', type: 'text' }] }), null);
    assert.equal(DateRules.watchedDateField({ fields: [] }), null);
    assert.equal(DateRules.watchedDateField(null), null);
  });

  test('prefers a date the owner put in the table', () => {
    const mod = { fields: [dateField('issued', false), dateField('due', true)] };
    assert.equal(DateRules.watchedDateField(mod).key, 'due');
  });

  test('falls back to the first date field when none is a list column', () => {
    const mod = { fields: [dateField('issued', false), dateField('due', false)] };
    assert.equal(DateRules.watchedDateField(mod).key, 'issued');
  });
});

/*
 * Same assertions, three timezones, real child processes.
 *
 * Setting process.env.TZ inside a running Node process does not reliably
 * re-initialise the date code, so each zone gets its own process. +14 and -11
 * are the extremes: on any instant those two are on different calendar days,
 * so an implementation that leaks UTC cannot satisfy both.
 */
describe('the same day means the same thing everywhere', () => {
  const probe = `
    const src = require('fs').readFileSync(${JSON.stringify(fileURLToPath(SRC_URL))}, 'utf8');
    const DateRules = new Function(src + '; return DateRules;')();
    const now = new Date(2026, 8, 12, 12, 0, 0);
    console.log(JSON.stringify({
      today: DateRules.daysUntil('2026-09-12', now),
      tomorrow: DateRules.daysUntil('2026-09-13', now),
      yesterday: DateRules.daysUntil('2026-09-11', now),
      week: DateRules.daysUntil('2026-09-19', now),
    }));
  `;

  for (const tz of ['UTC', 'Pacific/Kiritimati', 'Pacific/Midway', 'America/New_York', 'Asia/Kolkata']) {
    test(`TZ=${tz}`, () => {
      const out = execFileSync(process.execPath, ['-e', probe], {
        env: { ...process.env, TZ: tz },
        encoding: 'utf8',
      });
      assert.deepEqual(JSON.parse(out), { today: 0, tomorrow: 1, yesterday: -1, week: 7 },
        `local calendar arithmetic drifted in ${tz}`);
    });
  }
});

/*
 * One file, three consumers — and the export that makes it so.
 *
 * The alternatives were duplicating this arithmetic into lib/ (a second source
 * that goes stale — §29) or eval-ing the served file at boot. Instead the file
 * ends with a `typeof module` guard, so the browser gets a global, server.js
 * gets a require, and the `new Function` harness above is untouched.
 */
describe('the same arithmetic reaches the browser, the server and these tests', () => {
  test('require() returns the same surface as the global', () => {
    assert.deepEqual(Object.keys(required).sort(), Object.keys(DateRules).sort());
    for (const key of Object.keys(required)) {
      assert.equal(typeof required[key], 'function', `${key} is not callable through require`);
    }
  });

  test('and it agrees with the evaluated copy, rather than merely existing', () => {
    // A require() that returned a stale or partial object would pass the shape
    // check above. This is the assertion that fails if the two ever diverge.
    for (const [value, days] of [['2026-09-12', 7], ['2026-09-20', 7], ['2020-01-01', 7], ['nonsense', 7]]) {
      assert.equal(required.isDueWithin(value, days, NOW), DateRules.isDueWithin(value, days, NOW), value);
      assert.equal(required.daysUntil(value, NOW), DateRules.daysUntil(value, NOW), value);
    }
  });
});

describe('DateRules.resolveZone never throws, because nothing validates the stored value', () => {
  /*
   * The workspace timezone is stored WITHOUT server-side validation (§38:
   * validating in applyPush means touching the sync seam to guard a string
   * only a hand-written push can produce). So the guarantee lives here, at the
   * point of use — and it has to hold, because a throw would take down a
   * scheduled pass for every workspace on account of one typo.
   */
  test('a real IANA name survives', () => {
    for (const zone of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles', 'Pacific/Auckland', 'Europe/London']) {
      assert.equal(DateRules.resolveZone(zone), zone);
    }
  });

  test('anything Intl will not accept becomes UTC instead of throwing', () => {
    for (const junk of ['Not/AZone', 'Mars/Olympus', '../../etc/passwd', 'UTC+3', '{}', 42, {}, [], true]) {
      assert.equal(DateRules.resolveZone(junk), 'UTC', `resolveZone(${JSON.stringify(junk)})`);
    }
  });

  test('unset is UTC too — the difference between "unset" and "UTC" is a thing the SCREEN says', () => {
    assert.equal(DateRules.resolveZone(''), 'UTC');
    assert.equal(DateRules.resolveZone(null), 'UTC');
    assert.equal(DateRules.resolveZone(undefined), 'UTC');
  });
});

describe('a named zone has its own calendar day, and its own idea of "already done today"', () => {
  // 15:00 UTC on 12 September 2026. Tokyo is already on the 13th; Los Angeles
  // is still on the morning of the 12th. One instant, two calendar days —
  // which is the entire reason the day key cannot be computed in UTC.
  const INSTANT = new Date(Date.UTC(2026, 8, 12, 15, 0, 0));

  test('the day key is the workspace own day, not the server one', () => {
    assert.equal(DateRules.dayKey('Asia/Tokyo', INSTANT), '2026-09-13');
    assert.equal(DateRules.dayKey('America/Los_Angeles', INSTANT), '2026-09-12');
    assert.equal(DateRules.dayKey('UTC', INSTANT), '2026-09-12');
  });

  /*
   * The assertion that a UTC day key cannot satisfy. Computed in UTC these two
   * are the same string, so a "once per day" gate would let Tokyo's Monday
   * digest go out on Sunday evening — or suppress it entirely.
   */
  test('two workspaces roll over on different absolute instants', () => {
    assert.notEqual(
      DateRules.dayKey('Asia/Tokyo', INSTANT),
      DateRules.dayKey('America/Los_Angeles', INSTANT),
      'a day key computed in UTC would make these equal',
    );
  });

  test('the minute comes back too, so a screen can say 07:32 rather than 07:00', () => {
    // Rounding to the hour reads as wrong to somebody looking at their own
    // clock, and this is shown beside a gate expressed in whole hours.
    assert.equal(DateRules.zoneParts('Asia/Kolkata', INSTANT).minute, 30);
    assert.equal(DateRules.zoneParts('UTC', INSTANT).minute, 0);
    for (let m = 0; m < 60; m += 7) {
      const at = new Date(Date.UTC(2026, 8, 12, 9, m, 0));
      assert.equal(DateRules.zoneParts('UTC', at).minute, m);
    }
  });

  test('the local hour comes back on a 0-23 cycle, never 24', () => {
    // Midnight in Tokyo is 15:00 UTC the day before. `hour12: false` selects
    // h24 on some ICU builds and renders this as "24", which would put an
    // hour-of-day gate on the wrong side of the boundary.
    assert.equal(DateRules.zoneParts('Asia/Tokyo', INSTANT).hour, 0);
    assert.equal(DateRules.zoneParts('America/Los_Angeles', INSTANT).hour, 8);
    for (let h = 0; h < 24; h += 1) {
      const at = new Date(Date.UTC(2026, 8, 12, h, 30, 0));
      const got = DateRules.zoneParts('Asia/Tokyo', at).hour;
      assert.ok(got >= 0 && got <= 23, `hour ${got} is outside 0-23`);
    }
  });

  test('a nonsense zone falls back to UTC rather than taking the pass down', () => {
    assert.equal(DateRules.dayKey('Not/AZone', INSTANT), DateRules.dayKey('UTC', INSTANT));
    assert.equal(DateRules.zoneParts('Not/AZone', INSTANT).zone, 'UTC');
  });

  test('daysUntil answers in the zone it is given, not the process one', () => {
    // In Tokyo it is already the 13th, so the 13th is "today" (0) and the 12th
    // is yesterday. In Los Angeles the 12th is today and the 13th is tomorrow.
    assert.equal(DateRules.daysUntil('2026-09-13', INSTANT, 'Asia/Tokyo'), 0);
    assert.equal(DateRules.daysUntil('2026-09-12', INSTANT, 'Asia/Tokyo'), -1);
    assert.equal(DateRules.daysUntil('2026-09-13', INSTANT, 'America/Los_Angeles'), 1);
    assert.equal(DateRules.daysUntil('2026-09-12', INSTANT, 'America/Los_Angeles'), 0);
  });

  test('and isDueWithin carries the zone through', () => {
    assert.equal(DateRules.isDueWithin('2026-09-12', 0, INSTANT, 'Asia/Tokyo'), true, 'yesterday in Tokyo is overdue');
    assert.equal(DateRules.isDueWithin('2026-09-13', 0, INSTANT, 'America/Los_Angeles'), false, 'tomorrow in LA is outside a zero-day window');
  });

  /*
   * Omitting the zone must keep the §37 behaviour exactly. The browser filter
   * deliberately does NOT use the workspace zone — someone in Tokyo looking at
   * a list should see THEIR today — so the two-argument form has to stay the
   * viewer's local calendar day.
   */
  test('omitting the zone is still the viewer local day', () => {
    assert.equal(DateRules.daysUntil('2026-09-12', NOW), 0);
    assert.equal(DateRules.daysUntil('2026-09-12', NOW, ''), 0, 'empty string means unset, not a zone');
    assert.equal(DateRules.isDueWithin('2026-09-19', 7, NOW), true);
  });
});
