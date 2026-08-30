/*
 * demo.test.mjs — the shipped demo dataset, checked as data.
 *
 * These are cheap structural assertions on js/demo-data.js. They exist because
 * the file is generated (scripts/gen-demo-data.mjs) and a generator bug
 * produces a file that still parses, still loads, and is quietly wrong — an
 * unresolvable relation, a board column with nothing in it, a module the app
 * will silently render as a table. None of that throws.
 *
 * What the app DOES with this data is covered by the Playwright journeys in
 * tests/e2e.spec.js; this file only checks the data itself.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/*
 * demo-data.js is a browser script with no exports — it declares a `const` and
 * a function. Evaluating it in a Function scope is how a test reads it without
 * a build step, which is the same reason the app can load it with a plain
 * <script> tag.
 */
function loadDemo() {
  const src = readFileSync(path.join(ROOT, 'js', 'demo-data.js'), 'utf8');
  // eslint-disable-next-line no-new-func
  return new Function(`${src}; return { DEMO_DATA, resolveDemoDates };`)();
}

const { DEMO_DATA: DEMO, resolveDemoDates } = loadDemo();
const TEMPLATE_KEYS = ['contacts', 'companies', 'deals', 'tasks', 'leads', 'notes'];
// The loader's real order: TEMPLATES first, then the demo's own modules.
const SEED_ORDER = [...TEMPLATE_KEYS, ...DEMO.modules.map((m) => m.key)];

// Module definitions by key: the six templates plus the demo's own. The demo
// seeds into whichever it finds, so both have to be checked against the data.
const { TEMPLATES } = (() => {
  const src = readFileSync(path.join(ROOT, 'js', 'templates.js'), 'utf8');
  // eslint-disable-next-line no-new-func
  return new Function(`${src}; return { TEMPLATES };`)();
})();
const MODULE_BY_KEY = new Map([...TEMPLATES, ...DEMO.modules].map((m) => [m.key, m]));

describe('the shipped demo dataset', () => {
  test('carries a business, a currency and records for every module', () => {
    assert.ok(DEMO.businessName, 'a demo with no business name has nothing to put in the sidebar');
    assert.ok(DEMO.currency, 'currency drives every money column');
    for (const key of SEED_ORDER) {
      assert.ok((DEMO.records[key] || []).length > 0, `${key} has no records, so the module would seed empty`);
    }
  });

  /*
   * The one that would have shipped broken.
   *
   * A relation is resolved in a single forward pass as the loader seeds, so a
   * ref pointing at a module seeded LATER resolves to nothing and the cell
   * renders blank. Nothing throws; the demo just quietly loses its links.
   */
  test('every relation points backwards in seed order, and at a record that exists', () => {
    const seenByKey = new Map(SEED_ORDER.map((k) => [k, new Set()]));
    let refs = 0;

    for (const key of SEED_ORDER) {
      const mod = [...DEMO.modules, ...[]].find((m) => m.key === key);
      const rows = DEMO.records[key] || [];
      // The handle is the first field's value — the same thing recordName()
      // displays and the same thing the loader keys `handles` on.
      const nameKey = mod ? mod.fields[0].key : Object.keys(rows[0] || {})[0];

      for (const row of rows) {
        for (const [field, value] of Object.entries(row)) {
          if (!value || typeof value !== 'object' || typeof value.__ref !== 'string') continue;
          refs += 1;
          const [targetKey, targetName] = [value.__ref.slice(0, value.__ref.indexOf(':')), value.__ref.slice(value.__ref.indexOf(':') + 1)];
          assert.ok(
            SEED_ORDER.indexOf(targetKey) < SEED_ORDER.indexOf(key),
            `${key}.${field} refers to "${targetKey}", which is seeded later or not at all — it would resolve to nothing`,
          );
          assert.ok(
            seenByKey.get(targetKey).has(targetName),
            `${key}.${field} refers to "${value.__ref}", and no such record exists`,
          );
        }
      }
      // Only now are this module's own rows available to later modules.
      rows.forEach((row) => seenByKey.get(key).add(row[nameKey]));
    }

    assert.ok(refs > 0, 'a dataset with no relations does not exercise relations at all');
  });

  /*
   * Every key a record carries must be a field of its module, and every select
   * value must be one of that field's own options.
   *
   * This is the assertion that was missing, and three modules shipped wrong
   * without it: the generator invented `close` where the template says
   * `closeDate`, invented `status`/`assignee` on Tasks (which has a `done`
   * checkbox and neither of those), and emitted `Urgent`, `Event`,
   * `Cold outreach`, `Social` and `Unqualified` — none of which appear in the
   * options they were written into.
   *
   * None of it throws. A key no field uses is ghost data (§22) that travels in
   * every export and renders nowhere; an unfilled field is an empty column; a
   * select value outside its options is a pill the dropdown cannot produce and
   * a kanban column that cannot be reached. It took rendering a record as
   * VALUES rather than inputs for any of it to become visible.
   */
  test('record data matches the module schema it is seeded into', () => {
    const problems = [];
    for (const key of SEED_ORDER) {
      const mod = MODULE_BY_KEY.get(key);
      const rows = DEMO.records[key] || [];
      if (!mod || !rows.length) continue;

      const fields = new Map(mod.fields.map((f) => [f.key, f]));
      const used = new Set(rows.flatMap((r) => Object.keys(r)));

      for (const k of used) {
        if (!fields.has(k)) problems.push(`${key}: data key "${k}" is not a field — ghost data, and it renders nowhere`);
      }
      for (const k of fields.keys()) {
        if (!used.has(k)) problems.push(`${key}: field "${k}" is never filled — an empty column in the demo`);
      }
      for (const f of mod.fields) {
        if (f.type !== 'select' || !f.options) continue;
        for (const v of new Set(rows.map((r) => r[f.key]).filter(Boolean))) {
          if (!f.options.includes(v)) problems.push(`${key}.${f.key}: "${v}" is not one of its options`);
        }
      }
    }
    assert.deepEqual(problems, [], `\n  ${problems.join('\n  ')}\n`);
  });

  test('the custom modules are shaped like templates, so createFromTemplate takes them', () => {
    assert.ok(DEMO.modules.length > 0, 'the demo must carry modules TEMPLATES does not have');
    for (const mod of DEMO.modules) {
      for (const prop of ['key', 'name', 'icon', 'color', 'fields']) {
        assert.ok(mod[prop], `custom module ${mod.key} is missing ${prop}`);
      }
      assert.ok(mod.fields.length > 0);
      assert.ok(mod.fields[0].required, `${mod.key}'s first field is its display name and should be required`);
      const keys = mod.fields.map((f) => f.key);
      assert.equal(new Set(keys).size, keys.length, `${mod.key} has duplicate field keys`);
      // A relation names its target; the runtime id cannot be known statically.
      for (const f of mod.fields.filter((x) => x.type === 'relation')) {
        assert.ok(f.relatedModuleName, `${mod.key}.${f.key} is a relation with no relatedModuleName`);
      }
      /*
       * 'kanban' is the token js/app.js checks. 'board' reads correctly to a
       * human, is accepted without complaint, and silently falls back to a
       * table — which is exactly what happened the first time this shipped.
       */
      if (mod.defaultView) assert.ok(['table', 'kanban'].includes(mod.defaultView), `${mod.key}: unknown defaultView "${mod.defaultView}"`);
    }
  });

  test('a kanban module has a select field to group by, and no empty column', () => {
    for (const mod of DEMO.modules.filter((m) => m.defaultView === 'kanban')) {
      const group = mod.fields.find((f) => f.type === 'select' && f.options && f.options.length);
      assert.ok(group, `${mod.key} defaults to kanban but has no select field to group by`);
      const used = new Set((DEMO.records[mod.key] || []).map((r) => r[group.key]));
      for (const option of group.options) {
        // An empty column on a demo screen reads as a broken board rather than
        // a quiet week, which is why the generator spreads an exact count.
        assert.ok(used.has(option), `${mod.key}: no record is in "${option}", so that board column renders empty`);
      }
    }
  });

  test('dates are relative, so the business never looks stale', () => {
    const json = JSON.stringify(DEMO);
    assert.ok(json.includes('__rel'), 'no relative dates — the demo would age');
    // A hard-coded ISO date would look wrong within a month of shipping.
    assert.equal(/"\d{4}-\d{2}-\d{2}"/.test(json), false, 'a literal date is baked in somewhere');
  });

  test('resolveDemoDates turns offsets into dates and leaves relations alone', () => {
    const out = resolveDemoDates({ when: { __rel: 0 }, link: { __ref: 'companies:Bright Bakery' }, plain: 'x' });
    assert.match(out.when, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(out.link.__ref, 'companies:Bright Bakery', 'a ref must survive date resolution untouched');
    assert.equal(out.plain, 'x');
  });

  /*
   * Every load-then-remove cycle leaves one permanent tombstone per row for
   * the retention window (CLAUDE.md §33 measured 428 of them, 54% of a live
   * workspace's bytes). Growth here is not free, so it is bounded on purpose.
   */
  test('the dataset stays small enough that a demo cycle is cheap', () => {
    const total = Object.values(DEMO.records).reduce((n, rows) => n + rows.length, 0);
    assert.ok(total > 100, `${total} records is too thin to look like a real business`);
    assert.ok(total <= 200, `${total} records: each load/remove cycle leaves that many tombstones for 180 days`);
  });

  test('no real-looking contact details are shipped', () => {
    const json = JSON.stringify(DEMO);
    // RFC 2606 reserves .example, so nothing here can reach a real inbox.
    for (const addr of json.match(/[\w.]+@[\w.]+/g) || []) {
      assert.match(addr, /\.example$/, `${addr} is not a reserved example domain`);
    }
    for (const url of json.match(/https?:\/\/[^"]+/g) || []) {
      assert.match(url, /\.example(\/|$)/, `${url} is not a reserved example domain`);
    }
  });
});
