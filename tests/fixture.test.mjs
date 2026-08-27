/*
 * fixture.test.mjs — scripts/seed-fixture.mjs, checked by a real server.
 *
 * The fixture writes store.json directly, which means it hand-builds shapes
 * that server.js owns: the user record, the org, docShell()'s envelope, and
 * the meta doc refreshCounts() writes. Hand-built shapes drift, and a drifted
 * one does not throw — it produces a store that loads and is quietly wrong.
 *
 * So nothing here asserts against the file. Everything is asked of a server
 * booted against it, through the same API the app uses. If the fixture's idea
 * of an envelope stops matching the server's, these fail.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// 8450-8499. Blocks are disjoint per file — see the table in CLAUDE.md §9.
const PORT = 8450 + Math.floor(Math.random() * 50);
const BASE = `http://127.0.0.1:${PORT}`;

let dir;
let child;

async function req(pathname, { method = 'GET', body, cookies } = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    redirect: 'manual',
    headers: { 'Content-Type': 'application/json', ...(cookies ? { Cookie: cookies } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text, setCookie: (res.headers.getSetCookie() || []).map((c) => c.split(';')[0]).join('; ') };
}

// Dev sign-in as an account the fixture already created. upsertUser matches on
// email, so this returns the seeded user with its seeded role — which is the
// only reason a fixture can hand you a viewer to test with.
const signIn = async (email) => (await req('/auth/dev', { method: 'POST', body: { email, name: email } })).setCookie;

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'crmb-fixture-'));
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'seed-fixture.mjs'), '--yes'], {
    cwd: ROOT,
    env: { ...process.env, DATA_DIR: dir, MONGODB_URI: '' },
    stdio: 'pipe',
  });
  child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATA_DIR: dir,
      ALLOW_DEV_LOGIN: '1',
      MONGODB_URI: '',
      SESSION_SECRET: 'fixture-test-secret',
      SIGNUP_MODE: 'open',
      NODE_ENV: 'test',
      // Deliberately NOT set: the fixture's platform admin must come from the
      // seeded role, not from being named in the environment. That is what
      // proves the seeded role survived a real boot.
      ADMIN_EMAILS: '',
    },
    stdio: 'pipe',
  });
  const deadline = Date.now() + 15000;
  for (;;) {
    if (Date.now() > deadline) throw new Error('server did not start');
    try { if ((await fetch(`${BASE}/healthz`, { signal: AbortSignal.timeout(1200) })).ok) break; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 120));
  }
});

after(async () => {
  if (child) { const dead = new Promise((r) => child.once('exit', r)); child.kill(); await dead; }
  if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
});

describe('the seeded fixture, read by a real server', () => {
  /*
   * FIRST, and that ordering is the assertion.
   *
   * The meta doc and the rows are read by two INDEPENDENT paths:
   * `counts.records` comes from dataStats(), which sums recordCount off each
   * workspace's meta document, while `orgs[].records` comes from usageByOrg(),
   * which counts live rows. A fixture that writes a plausible-looking meta doc
   * with the wrong number passes every other test here and reproduces exactly
   * the failure reported from the live deployment — a dashboard and a device
   * disagreeing, both apparently telling the truth.
   *
   * It has to run before anything pushes, because `/api/sync` calls
   * refreshCounts() and a single accepted write REWRITES the meta doc with the
   * true figure. Placed after the contributor test below, this passed against
   * a fixture seeded with a deliberately wrong counter — the push had healed
   * it. That is §26's trap, in a new place.
   *
   * `/api/data` does not carry the counters, so this is the only way to
   * compare the two through the API.
   */
  test('the meta counters agree with the rows they claim to count', async () => {
    const maya = await signIn('maya@fixture.invalid');
    const pull = (await req('/api/sync?since=0', { cookies: maya })).json;
    const dead = pull.records.filter((r) => r.deleted).length;
    assert.ok(dead > 0, 'this assertion is meaningless without tombstones present');

    const ops = await signIn('ops@fixture.invalid');
    const view = (await req('/api/admin/platform?fresh=1', { cookies: ops })).json;

    const fromMeta = view.counts.records;                            // dataStats()
    const fromRows = view.orgs.reduce((n, o) => n + o.records, 0);   // usageByOrg()
    assert.equal(fromMeta, fromRows,
      `meta docs say ${fromMeta} records, the rows say ${fromRows} — a fixture with a wrong counter`);
    assert.equal(view.counts.modules, view.orgs.reduce((n, o) => n + o.modules, 0));

    // And the row count is LIVE rows: the tombstones above must not be in it.
    const lumen = view.orgs.find((o) => o.name === 'Lumen Studio');
    assert.equal(lumen.records, pull.records.filter((r) => !r.deleted).length);

    /*
     * A tombstone must actually be small.
     *
     * The obvious check — that a pulled tombstone has no `doc` — tests
     * wireItem(), not the fixture: the server never sends a body for a deleted
     * row whatever is stored. So it passed against a fixture writing full
     * bodies into its tombstones, which is the thing worth catching, because
     * a gravestone that keeps its body is storage that never comes back.
     * Measured instead, against the bytes the panel actually reports.
     */
    const deadRows = dead + pull.modules.filter((m) => m.deleted).length;
    const perTombstone = lumen.deadBytes / deadRows;
    assert.ok(perTombstone > 0, 'the seeded tombstones are not being measured at all');
    assert.ok(perTombstone < 500,
      `${Math.round(perTombstone)} bytes per tombstone — these are carrying bodies, not gravestones`);
  });

  test('the team is one workspace with every role on the ladder', async () => {
    const cookies = await signIn('maya@fixture.invalid');
    const me = (await req('/api/me', { cookies })).json;
    assert.equal(me.user.role, 'owner', 'the seeded role must survive a real sign-in');

    const members = (await req('/api/org/members', { cookies })).json;
    const roles = members.members.map((m) => m.role).sort();
    assert.deepEqual(roles, ['contributor', 'member', 'owner', 'viewer'],
      'the whole ladder in one workspace is the point of the fixture');
    assert.equal(members.canManage, true, 'the owner can administer their team');
  });

  /*
   * The requirement this fixture exists for: role boundaries that can be
   * DRIVEN, not just described. A viewer is refused in the applyPush seam and
   * the refusal carries why (§26) — and none of that is reachable without four
   * real accounts sharing one workspace.
   */
  test('a seeded viewer is refused a write, and told the reason', async () => {
    const cookies = await signIn('sam@fixture.invalid');
    assert.equal((await req('/api/me', { cookies })).json.user.role, 'viewer');

    const out = (await req('/api/sync', {
      method: 'POST',
      cookies,
      body: { since: 0, records: [{ id: 'viewer-attempt', updatedAt: Date.now(), doc: { moduleId: 'x', data: { name: 'nope' } } }] },
    })).json;

    const refused = (out.rejected?.records || []).find((r) => r.id === 'viewer-attempt');
    assert.ok(refused, 'a viewer\'s write must come back refused, not silently accepted');
    assert.equal(refused.reason, 'readonly', 'the server names the rule; the client must not have to guess');
  });

  test('a seeded contributor may add but not delete', async () => {
    const cookies = await signIn('priya@fixture.invalid');
    assert.equal((await req('/api/me', { cookies })).json.user.role, 'contributor');

    const pull = (await req('/api/sync?since=0', { cookies })).json;
    const victim = pull.records.find((r) => !r.deleted);
    assert.ok(victim, 'the workspace should have live records to try to delete');

    const added = (await req('/api/sync', {
      method: 'POST',
      cookies,
      body: { since: 0, records: [{ id: 'contrib-add', updatedAt: Date.now(), doc: { moduleId: victim.doc.moduleId, data: { name: 'allowed' } } }] },
    })).json;
    assert.equal((added.rejected?.records || []).length, 0, 'a contributor may create');

    const deleted = (await req('/api/sync', {
      method: 'POST',
      cookies,
      body: { since: 0, records: [{ id: victim.id, updatedAt: Date.now() + 1000, deleted: true, deletedAt: Date.now() + 1000 }] },
    })).json;
    const refused = (deleted.rejected?.records || []).find((r) => r.id === victim.id);
    assert.ok(refused, 'a contributor must not be able to delete');
    assert.equal(refused.reason, 'nodelete');
  });

  /*
   * Tombstones written by hand have to look like tombstones the server wrote,
   * or the delta protocol will not carry them — and a device that never learns
   * about a delete resurrects the row (§3).
   */
  test('seeded tombstones travel over the delta protocol', async () => {
    const cookies = await signIn('daniel@fixture.invalid');
    const pull = (await req('/api/sync?since=0', { cookies })).json;

    const dead = pull.records.filter((r) => r.deleted);
    assert.ok(dead.length >= 20, `only ${dead.length} tombstones came back over sync`);
    for (const t of dead.slice(0, 5)) {
      assert.ok(t.deletedAt > 0, 'a tombstone with no clock cannot be ordered against an edit');
    }
    // Whether a tombstone is actually SMALL is asserted by bytes in the first
    // test — the server strips `doc` from every deleted row on the way out, so
    // checking for its absence here would only be testing wireItem().

    // Aged across the window, which is what makes retention observable.
    const ages = dead.map((t) => Math.round((Date.now() - t.deletedAt) / 86400000));
    assert.ok(Math.max(...ages) > 150, `oldest tombstone is only ${Math.max(...ages)} days old`);
    assert.ok(Math.min(...ages) < 30, `newest tombstone is already ${Math.min(...ages)} days old`);
  });

  test('relations in the seeded workspace point at records that exist', async () => {
    const cookies = await signIn('maya@fixture.invalid');
    const pull = (await req('/api/sync?since=0', { cookies })).json;
    const byId = new Map(pull.records.filter((r) => !r.deleted).map((r) => [r.id, r]));

    let checked = 0;
    for (const mod of pull.modules.filter((m) => !m.deleted)) {
      for (const f of (mod.doc.fields || []).filter((x) => x.type === 'relation')) {
        assert.ok(f.relatedModule, `${mod.doc.name}.${f.key} has no relatedModule id`);
        for (const rec of pull.records.filter((r) => !r.deleted && r.doc.moduleId === mod.doc.id)) {
          const target = rec.doc.data[f.key];
          if (!target) continue;
          checked += 1;
          assert.ok(byId.has(target), `${mod.doc.name}.${f.key} points at ${target}, which is not a record here`);
          assert.equal(byId.get(target).doc.moduleId, f.relatedModule, 'a relation points into the wrong module');
        }
      }
    }
    assert.ok(checked > 0, 'no relation values were checked — the fixture lost its links');
  });

  test('the operator panel sees every tenant, and what is reclaimable', async () => {
    const cookies = await signIn('ops@fixture.invalid');
    const me = (await req('/api/me', { cookies })).json;
    assert.equal(me.user.role, 'platformAdmin', 'seeded without ADMIN_EMAILS, so this is the stored role');

    const view = (await req('/api/admin/platform?fresh=1', { cookies })).json;
    assert.equal(view.counts.orgs, 4, 'four tenants, including one deliberately empty');

    const lumen = view.orgs.find((o) => o.name === 'Lumen Studio');
    assert.equal(lumen.members, 4);
    assert.ok(lumen.deadBytes > 0, 'the seeded tombstones must show as reclaimable');
    assert.ok(lumen.deadBytes < lumen.bytes);
    assert.ok(lumen.oldestDeletedAt > 0, 'without a date the panel cannot say when space returns');

    // A second tenant exists precisely so no org reads as 100% of the database.
    assert.ok(view.orgs.some((o) => o.name === 'Northwind Consulting' && o.records > 0));
    assert.ok(lumen.shareOfData < 100, `one tenant holding ${lumen.shareOfData}% hides the point of the column`);

    // And the placeholder, which an operator should recognise rather than fear.
    assert.ok(view.orgs.some((o) => o.members === 0 && o.records === 0), 'the vacated org is missing');
  });

  test('tenants cannot see each other', async () => {
    const maya = await signIn('maya@fixture.invalid');
    const nadia = await signIn('nadia@fixture.invalid');

    const mine = (await req('/api/sync?since=0', { cookies: maya })).json;
    const theirs = (await req('/api/sync?since=0', { cookies: nadia })).json;
    const ids = new Set(mine.records.map((r) => r.id));
    assert.ok(theirs.records.length > 0, 'the second tenant should have data of its own');
    assert.equal(theirs.records.some((r) => ids.has(r.id)), false, 'a record leaked across the org boundary');

    // And an owner is not a platform admin, whatever their own org says.
    assert.equal((await req('/api/admin/platform', { cookies: nadia })).status, 403);
  });
});

/*
 * The safety rails, which matter more than the data.
 *
 * This script creates users, organisations and workspaces by rewriting a store
 * file wholesale. That is a destructive capability, and the only thing standing
 * between it and somebody's real data is the set of refusals below.
 */
describe('seed-fixture refuses to destroy anything it did not create', () => {
  const run = (dir, args) => {
    try {
      return { ok: true, out: execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'seed-fixture.mjs'), ...args], {
        cwd: ROOT, env: { ...process.env, DATA_DIR: dir, MONGODB_URI: '' }, encoding: 'utf8', stdio: 'pipe',
      }) };
    } catch (err) {
      return { ok: false, out: `${err.stdout || ''}${err.stderr || ''}` };
    }
  };
  const read = (dir) => JSON.parse(readFileSync(path.join(dir, 'store.json'), 'utf8'));

  test('will not write without --yes, and will not overwrite real accounts at all', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'crmb-rails-'));
    try {
      assert.match(run(dir, []).out, /--yes/, 'a bare invocation must refuse');
      assert.equal(existsSync(path.join(dir, 'store.json')), false, 'and must not have written anything');

      run(dir, ['--yes']);
      const seeded = read(dir);
      assert.equal(seeded.users.length, 6);

      // Somebody real turns up in the same store.
      seeded.users.push({ id: 'real', email: 'owner@realcustomer.com', orgId: seeded.orgs[1].id, role: 'owner' });
      writeFileSync(path.join(dir, 'store.json'), JSON.stringify(seeded));

      const refused = run(dir, ['--yes']);
      assert.equal(refused.ok, false, 're-seeding over a real account must exit non-zero');
      assert.match(refused.out, /real data/);
      assert.ok(read(dir).users.some((u) => u.email === 'owner@realcustomer.com'), 'and must not have touched them');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  /*
   * The one that was a real bug, found by driving it.
   *
   * --clean used to match organisations by NAME, and "Lumen Studio" is an
   * entirely plausible thing for a customer to call their workspace. With a
   * real owner sitting in an org of that name, --clean deleted the org and its
   * workspace and reported success — leaving the account intact, which made it
   * read like nothing had happened. A surviving member now vetoes removal.
   */
  test('--clean never removes an organisation somebody is still in', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'crmb-clean-'));
    try {
      run(dir, ['--yes']);
      const s = read(dir);
      const collision = s.orgs.find((o) => o.name === 'Lumen Studio');
      const rows = Object.keys(s.items.records[collision.id] || {}).length;
      assert.ok(rows > 0, 'the colliding org needs data for this to mean anything');

      s.users.push({ id: 'real', email: 'owner@realstudio.com', orgId: collision.id, role: 'owner' });
      writeFileSync(path.join(dir, 'store.json'), JSON.stringify(s));

      run(dir, ['--clean', '--yes', '--force']);

      const after = read(dir);
      assert.deepEqual(after.users.map((u) => u.email), ['owner@realstudio.com'], 'fixture accounts go');
      assert.ok(after.orgs.some((o) => o.id === collision.id), 'their organisation must survive');
      assert.ok(after.data[collision.id], 'and its workspace metadata');
      assert.equal(Object.keys(after.items.records[collision.id] || {}).length, rows, 'and every one of its rows');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
