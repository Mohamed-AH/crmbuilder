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

const SRC_URL = new URL('../js/date-rules.js', import.meta.url);
const src = readFileSync(fileURLToPath(SRC_URL), 'utf8');
// eslint-disable-next-line no-new-func
const DateRules = new Function(`${src}; return DateRules;`)();

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
