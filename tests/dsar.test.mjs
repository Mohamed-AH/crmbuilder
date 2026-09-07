/*
 * dsar.test.mjs — the matching rules behind the subject-access search.
 *
 * Unit tests rather than an E2E journey, because what is under test is a set
 * of decisions about WHAT COUNTS AS A MATCH — accents, relations, values under
 * keys no field uses any more — and each of those is one assertion here and a
 * whole fixture through the UI. The journey that proves the screen lives in
 * tests/e2e.spec.js.
 *
 * Required through the same seam js/date-rules.js uses (CLAUDE.md §39), so the
 * rules checked here are the rules the browser ships.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const DSAR = createRequire(import.meta.url)('../js/dsar.js');

const MODULES = [
  {
    id: 'm-contacts',
    name: 'Contacts',
    fields: [
      { key: 'name', label: 'Full name', type: 'text' },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    id: 'm-deals',
    name: 'Deals',
    fields: [
      { key: 'title', label: 'Deal name', type: 'text' },
      { key: 'value', label: 'Value', type: 'currency' },
      { key: 'contact', label: 'Contact', type: 'relation', relatedModule: 'm-contacts' },
      { key: 'won', label: 'Won', type: 'checkbox' },
    ],
  },
];

// id -> display name, exactly what js/app.js's relationNameCache holds.
const NAMES = new Map([['c-1', 'Amira Hassan'], ['c-2', 'José Müller']]);

const run = (query, records, opts = {}) => DSAR.search({
  modules: MODULES, records, query, relationNames: NAMES, ...opts,
});

describe('the subject-access search', () => {
  test('a one-character query is refused rather than answered', () => {
    const out = run('a', [{ id: 'r1', moduleId: 'm-contacts', data: { name: 'Amira Hassan' } }]);
    assert.equal(out.tooShort, true);
    assert.equal(out.minLength, 2);
    assert.deepEqual(out.matches, []);
    // Two characters is the floor on purpose: "Li" and "Ng" are real surnames,
    // and refusing to search for somebody's actual name is the worse failure.
    assert.equal(run('Li', [{ id: 'r1', moduleId: 'm-contacts', data: { name: 'Wei Li' } }]).total, 1);
  });

  test('matching ignores case and accents, in both directions', () => {
    const rows = [{ id: 'r1', moduleId: 'm-contacts', data: { name: 'José Müller' } }];
    for (const q of ['jose', 'JOSÉ', 'muller', 'Müller']) {
      assert.equal(run(q, rows).total, 1, `"${q}" should find José Müller`);
    }
    // And a plain query still finds a plain name — the folding must not be
    // doing something exotic that only works on the accented case.
    assert.equal(run('hassan', [{ id: 'r2', moduleId: 'm-contacts', data: { name: 'Amira Hassan' } }]).total, 1);
  });

  /*
   * The case the whole feature exists for.
   *
   * A person can appear on a Deal without their name being anywhere in that
   * Deal's own values — the field holds a uuid, and the name lives on the
   * record it points at. Searching raw values finds nothing here.
   */
  test('a person is found through a relation, by name and not by id', () => {
    const rows = [{ id: 'd1', moduleId: 'm-deals', data: { title: 'Bakery revamp', contact: 'c-1' } }];
    const out = run('Amira', rows);
    assert.equal(out.total, 1);
    assert.equal(out.matches[0].moduleName, 'Deals');
    assert.deepEqual(out.matches[0].fields.map((f) => f.key), ['contact']);
    assert.equal(out.matches[0].fields[0].value, 'Amira Hassan', 'the reported value is the name, not the id');

    // The stored id is never itself searchable: nobody types a uuid, and
    // matching one would report a hit whose "value" means nothing to a reader.
    assert.equal(run('c-1', rows).total, 0);
  });

  /*
   * §22's ghost data, and the reason this walks `record.data` rather than
   * `mod.fields`. A field that was removed without purging leaves its values
   * behind, and they travel in every export — so "that is everything we hold"
   * would be false while a column nobody can see still holds it.
   */
  test('a value under a key no field uses is found, and flagged as such', () => {
    const rows = [{ id: 'r1', moduleId: 'm-contacts', data: { name: 'Tom Okafor', old_note: 'Complained about Amira' } }];
    const out = run('complained', rows);
    assert.equal(out.total, 1);
    const hit = out.matches[0].fields[0];
    assert.equal(hit.key, 'old_note');
    assert.equal(hit.orphan, true, 'a key with no field must say so — it is the most useful thing here');
    assert.equal(hit.label, 'old_note', 'with no field there is no label but the key');

    // A key that IS a field is not flagged, or the signal means nothing.
    assert.equal(run('Okafor', rows).matches[0].fields[0].orphan, false);
  });

  test('numbers, amounts and checkboxes are not searched', () => {
    const rows = [{ id: 'd1', moduleId: 'm-deals', data: { title: 'Bakery revamp', value: 2400, won: true } }];
    // Stored as a JS number and a boolean, so there is no text to match. The
    // consequence is stated in the user guide: a reference number typed into a
    // Number field is not found.
    assert.equal(run('2400', rows).total, 0);
    assert.equal(run('true', rows).total, 0);
    // …and the text beside them still matches, so this is not a dead module.
    assert.equal(run('bakery', rows).total, 1);
  });

  test('sample rows are included and flagged, never filtered out', () => {
    const rows = [{ id: 'r1', moduleId: 'm-contacts', data: { name: 'Amira Hassan' }, _demo: true }];
    const out = run('Amira', rows);
    assert.equal(out.total, 1, 'hiding a sample row would make the bundle quietly incomplete');
    assert.equal(out.matches[0].demo, true);
    // Editing a seeded row keeps the flag (§11), so `demo` is a hint for the
    // reviewer rather than a claim that nothing real is in there.
    assert.equal(run('Amira', [{ id: 'r2', moduleId: 'm-contacts', data: { name: 'Amira Hassan' } }]).matches[0].demo, false);
  });

  test('a row whose module is gone is skipped rather than reported', () => {
    const rows = [{ id: 'r1', moduleId: 'm-deleted', data: { name: 'Amira Hassan' } }];
    // §12 leaves orphaned rows alone rather than deleting them, so they exist.
    // A match reported against a module that cannot be named is not something
    // a controller can go and look at.
    assert.equal(run('Amira', rows).total, 0);
  });

  test('every matching field of one record is reported, not just the first', () => {
    const rows = [{
      id: 'r1',
      moduleId: 'm-contacts',
      data: { name: 'Amira Hassan', email: 'amira@example.com', notes: 'Met Amira at the fair' },
    }];
    const out = run('amira', rows);
    assert.equal(out.total, 1, 'one record, however many fields matched');
    assert.deepEqual(out.matches[0].fields.map((f) => f.key).sort(), ['email', 'name', 'notes']);
    // The whole record travels, because a DSAR answer is the record rather
    // than the cell — and reviewing it for somebody ELSE's data in the same
    // row is the reviewer's job, which is why the screen says so.
    assert.equal(out.matches[0].data.email, 'amira@example.com');
  });

  test('the per-module summary counts records and is ordered heaviest first', () => {
    const rows = [
      { id: 'c1', moduleId: 'm-contacts', data: { name: 'Amira Hassan' } },
      { id: 'd1', moduleId: 'm-deals', data: { title: 'Amira revamp' } },
      { id: 'd2', moduleId: 'm-deals', data: { title: 'Amira retainer' } },
    ];
    const out = run('amira', rows);
    assert.equal(out.total, 3);
    assert.deepEqual(out.byModule.map((b) => [b.moduleName, b.count]), [['Deals', 2], ['Contacts', 1]]);
  });

  test('no match is an empty result rather than an error', () => {
    const out = run('Nobody', [{ id: 'r1', moduleId: 'm-contacts', data: { name: 'Amira Hassan' } }]);
    assert.equal(out.total, 0);
    assert.deepEqual(out.byModule, []);
    assert.equal(out.tooShort, false, '"we hold nothing" and "ask a longer question" are different answers');
  });

  test('an empty workspace and a missing argument both answer rather than throw', () => {
    assert.equal(DSAR.search({ query: 'Amira' }).total, 0);
    assert.equal(DSAR.search().tooShort, true);
  });
});
