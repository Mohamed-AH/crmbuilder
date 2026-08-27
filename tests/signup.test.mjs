/*
 * signup.test.mjs — who is allowed to create an account.
 *
 *   node --test tests/signup.test.mjs
 *
 * SIGNUP_MODE is only the default now — the live mode is stored and can be
 * changed from the admin panel — but a server per mode is still how the
 * env-var path gets covered, and boot({ signupMode }) is what sets it. The
 * Google callback cannot be driven from a test — there is no Google to answer
 * — so the gate is exercised through /auth/dev, which runs the identical check
 * for the identical reason.
 */
import { test, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const servers = [];

after(async () => {
  for (const s of servers) await s.stop();
});

// 8700-9199: 61 servers boot here, so the block is wide and nextPort++ walks
// it without wrapping into anybody else's. Disjoint per file — CLAUDE.md §9.
let nextPort = 8700 + Math.floor(Math.random() * 200);

async function boot({ signupMode = 'code', adminEmails = '', backupToken = '', webhook = '', env: extraEnv = {} } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'crmb-signup-'));
  // Sequential, not random: this file boots a server per mode per test, and a
  // narrow random range collides often enough to hang the whole run.
  const port = nextPort++;
  const base = `http://127.0.0.1:${port}`;
  let log = '';
  let child = null;
  let mode = signupMode;

  const env = () => ({
    ...process.env,
    PORT: String(port),
    DATA_DIR: dir,
    ALLOW_DEV_LOGIN: '1',
    MONGODB_URI: '',
    SESSION_SECRET: 'signup-test-secret',
    SIGNUP_MODE: mode,
    ADMIN_EMAILS: adminEmails,
    BACKUP_TOKEN: backupToken,
    FEEDBACK_WEBHOOK_URL: webhook,
    NODE_ENV: 'test',
    // Thresholds and intervals a test needs to drive directly, so a rule can
    // be made to fire without actually filling a quota.
    ...extraEnv,
  });

  const start = async () => {
    child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: env(), stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (d) => { log += d; });
    child.stderr.on('data', (d) => { log += d; });
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`server exited (${child.exitCode}):\n${log}`);
      try {
        const r = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(1500) });
        if (r.ok) return;
      } catch { /* not up */ }
      await new Promise((r) => setTimeout(r, 120));
    }
    throw new Error(`server did not start:\n${log}`);
  };

  const stop = async ({ keepData = false } = {}) => {
    if (child) {
      const dead = new Promise((r) => child.once('exit', r));
      child.kill();
      await dead;
      child = null;
    }
    if (!keepData) await rm(dir, { recursive: true, force: true }).catch(() => {});
  };

  const api = {
    base,
    stop,
    // Everything the server has written to stdout/stderr. Some guarantees are
    // only observable there — a webhook that could never be delivered has to
    // say so somewhere, and the saying is the behaviour under test.
    log: () => log,
    // Restart against the same data on a different setting: the only way to
    // ask what happens to an account that was created before the door closed.
    async setMode(next) {
      await stop({ keepData: true });
      mode = next;
      await start();
    },
    async req(path, { method = 'GET', body, cookies, headers } = {}) {
      const res = await fetch(`${base}${path}`, {
        method,
        redirect: 'manual',
        headers: { 'Content-Type': 'application/json', ...(cookies ? { Cookie: cookies } : {}), ...headers },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(20000),
      });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* not json */ }
      const setCookie = (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
      return { status: res.status, json, text, setCookie };
    },
    signUp(email, beta) {
      return api.req('/auth/dev', { method: 'POST', body: { email, ...(beta ? { beta } : {}) } });
    },
    // Age a code past its expiry, or edit it any other way. The file store
    // keeps everything in memory and rewrites the whole file on save, so this
    // has to happen with the server stopped.
    async editStore(fn) {
      await stop({ keepData: true });
      const file = join(dir, 'store.json');
      const raw = JSON.parse(await readFile(file, 'utf8'));
      fn(raw);
      await writeFile(file, JSON.stringify(raw));
      await start();
    },
  };
  // Registered before start, so a server that fails to come up is still
  // cleaned up rather than left running for the rest of the suite.
  servers.push(api);
  await start();
  return api;
}

// The operator, who is always allowed in and can mint codes.
async function adminOf(srv, email = 'first@operator.test') {
  const out = await srv.signUp(email);
  assert.equal(out.status, 200, `operator sign-up failed: ${out.text}`);
  return out.setCookie;
}

async function mintCode(srv, cookies, body = {}) {
  const out = await srv.req('/api/admin/beta-codes', { method: 'POST', body, cookies });
  assert.equal(out.status, 200, out.text);
  return out.json;
}

describe('signup gate: code mode', () => {
  test('a code is required to sign up, and never to sign back in', async () => {
    const srv = await boot({ signupMode: 'code' });
    const admin = await adminOf(srv); // first account ever — platform admin
    const minted = await mintCode(srv, admin, { label: 'batch one', maxUses: 5 });
    const code = minted.code.code;
    assert.ok(code, 'expected a code');
    assert.match(minted.url, /\?beta=/, 'a link the operator can paste into an invite');

    // Without one: refused.
    const bare = await srv.signUp('nobody@tester.test');
    assert.equal(bare.status, 403);
    assert.equal(bare.json.reason, 'beta');

    // With one: in.
    const joined = await srv.signUp('tester@tester.test', code);
    assert.equal(joined.status, 200);
    assert.equal(joined.json.user.email, 'tester@tester.test');

    // And back in later with no code at all — the whole point of gating
    // signup rather than sign-in.
    const again = await srv.signUp('tester@tester.test');
    assert.equal(again.status, 200, 'a returning tester must never be asked again');
  });

  test('every kind of bad code is refused identically', async () => {
    const srv = await boot({ signupMode: 'code' });
    const admin = await adminOf(srv);

    const spent = (await mintCode(srv, admin, { maxUses: 1 })).code.code;
    await srv.signUp('spender@tester.test', spent); // uses the only one

    const revoked = (await mintCode(srv, admin, { maxUses: 5 })).code.code;
    await srv.req(`/api/admin/beta-codes/${revoked}`, { method: 'DELETE', cookies: admin });

    const expired = (await mintCode(srv, admin, { maxUses: 5 })).code.code;
    await srv.editStore((raw) => {
      raw.betaCodes.find((c) => c.code === expired).expiresAt = Date.now() - 1000;
    });

    const answers = [];
    for (const [label, code] of [
      ['made up', 'this-was-never-a-code'],
      ['spent', spent],
      ['revoked', revoked],
      ['expired', expired],
      ['empty', ''],
    ]) {
      const out = await srv.signUp(`probe-${label.replace(/\s/g, '')}@tester.test`, code);
      assert.equal(out.status, 403, `${label} should be refused`);
      answers.push(`${out.status}:${out.json.error}`);
    }
    // Identical wording as well as identical status: a different answer for
    // "wrong" and "spent" is a way to find out which codes exist.
    assert.equal(new Set(answers).size, 1, `refusals differ: ${JSON.stringify(answers)}`);
  });

  /*
   * A use is spent once, by the person it let in.
   *
   * Note what this does NOT prove. The server defers consumption until after
   * the account exists, so that a failure between the check and the write —
   * a database hiccup in the OAuth callback — cannot burn a tester's only
   * chance to get in. No test here reaches that path: a returning user is
   * short-circuited before the check, and a malformed address is rejected
   * before it. The ordering is deliberate and untested, and saying so is more
   * use than a test that would pass either way.
   */
  test('a use is spent once, and repeat sign-ins do not spend more', async () => {
    const srv = await boot({ signupMode: 'code' });
    const admin = await adminOf(srv);
    const code = (await mintCode(srv, admin, { maxUses: 3 })).code.code;

    assert.equal((await srv.signUp('one@tester.test', code)).status, 200);
    // Back again with the same code in hand: still one use.
    assert.equal((await srv.signUp('one@tester.test', code)).status, 200);
    assert.equal((await srv.signUp('one@tester.test', code)).status, 200);
    // And a request that never gets as far as an account.
    await srv.req('/auth/dev', { method: 'POST', body: { email: 'not-an-email', beta: code } });

    const { codes } = (await srv.req('/api/admin/beta-codes', { cookies: admin })).json;
    const seen = codes.find((c) => c.code === code);
    assert.equal(seen.useCount, 1, 'one account was created, so one use was spent');
    assert.equal(seen.remaining, 2);

    // A second person still fits, which is what "remaining" has to mean.
    assert.equal((await srv.signUp('two@tester.test', code)).status, 200);
    const after = (await srv.req('/api/admin/beta-codes', { cookies: admin })).json;
    assert.equal(after.codes.find((c) => c.code === code).useCount, 2);
  });

  test('the cap is a cap', async () => {
    const srv = await boot({ signupMode: 'code' });
    const admin = await adminOf(srv);
    const code = (await mintCode(srv, admin, { maxUses: 2 })).code.code;

    assert.equal((await srv.signUp('a@tester.test', code)).status, 200);
    assert.equal((await srv.signUp('b@tester.test', code)).status, 200);
    const third = await srv.signUp('c@tester.test', code);
    assert.equal(third.status, 403, 'the third signup is past the cap');

    const { codes } = (await srv.req('/api/admin/beta-codes', { cookies: admin })).json;
    assert.equal(codes.find((c) => c.code === code).state, 'spent');
  });

  /*
   * The bootstrap, and the reason it exists.
   *
   * Minting a code needs a platform admin, and the only way to become one is
   * to sign up — so without this a fresh deployment in code mode has no way in
   * at all, and ADMIN_EMAILS being unset would brick it. Same rule upsertUser
   * already applies when it makes that first account a platformAdmin.
   */
  test('the first account on an empty deployment gets in without a code', async () => {
    const srv = await boot({ signupMode: 'code' });
    const first = await srv.signUp('founder@operator.test');
    assert.equal(first.status, 200);
    assert.equal(first.json.user.role, 'platformAdmin');
    // And the door shuts behind them.
    assert.equal((await srv.signUp('second@tester.test')).status, 403);
  });

  test('the operator is never locked out of their own deployment', async () => {
    const srv = await boot({ signupMode: 'code', adminEmails: 'ops@operator.test' });
    // No code, no existing account, and the gate is closed to everyone else.
    const out = await srv.signUp('ops@operator.test');
    assert.equal(out.status, 200);
    assert.equal(out.json.user.role, 'platformAdmin');
    assert.equal((await srv.signUp('stranger@tester.test')).status, 403);
  });

  test('only a platform admin can mint or revoke codes', async () => {
    const srv = await boot({ signupMode: 'code' });
    const admin = await adminOf(srv);
    const code = (await mintCode(srv, admin, { maxUses: 5 })).code.code;
    const member = (await srv.signUp('ordinary@tester.test', code)).setCookie;

    assert.equal((await srv.req('/api/admin/beta-codes', { cookies: member })).status, 403);
    assert.equal((await srv.req('/api/admin/beta-codes', { method: 'POST', body: {}, cookies: member })).status, 403);
    assert.equal((await srv.req(`/api/admin/beta-codes/${code}`, { method: 'DELETE', cookies: member })).status, 403);
    // And signed out entirely.
    assert.equal((await srv.req('/api/admin/beta-codes')).status, 401);
  });

  test('the mode is reported so the sign-in screen can explain itself', async () => {
    const srv = await boot({ signupMode: 'code' });
    const { json } = await srv.req('/api/me');
    assert.equal(json.signupMode, 'code');
  });
});

describe('signup gate: open and closed', () => {
  test('open lets anyone in without a code', async () => {
    const srv = await boot({ signupMode: 'open' });
    await adminOf(srv);
    const out = await srv.signUp('anyone@tester.test');
    assert.equal(out.status, 200);
    assert.equal((await srv.req('/api/me')).json.signupMode, 'open');
  });

  test('closed refuses new accounts but not existing ones', async () => {
    // Sign someone up while the door is open, then close it behind them and
    // check they can still get back in — the same deployment, same data.
    const srv = await boot({ signupMode: 'open', adminEmails: 'ops3@operator.test' });
    await adminOf(srv, 'ops3@operator.test');
    assert.equal((await srv.signUp('early@tester.test')).status, 200);

    await srv.setMode('closed');

    const fresh = await srv.signUp('late@tester.test');
    assert.equal(fresh.status, 403);
    assert.equal(fresh.json.reason, 'closed');
    assert.equal((await srv.signUp('early@tester.test')).status, 200,
      'closing signups must not lock out the people already using it');
    // And the operator, so a closed deployment is not a bricked one.
    assert.equal((await srv.signUp('ops3@operator.test')).status, 200);
  });
});

/*
 * The backup export.
 *
 * One request returns every customer's data, which makes it the highest-value
 * route in the application. Nearly everything asserted here is a way it must
 * refuse.
 */
describe('backup export', () => {
  const TOKEN = 'a-long-backup-token-for-tests';

  test('does not exist unless a token is configured', async () => {
    const srv = await boot({ signupMode: 'open' });
    const out = await srv.req('/api/admin/export');
    // 404, not 401: nothing should be able to find out whether a deployment
    // has backups switched on.
    assert.equal(out.status, 404);
  });

  test('a correct token in the header works', async () => {
    const srv = await boot({ signupMode: 'open', backupToken: TOKEN });
    const admin = await adminOf(srv, 'backup-owner@operator.test');
    await srv.req('/api/sync', {
      method: 'POST',
      cookies: admin,
      body: {
        since: 0,
        modules: [{ id: 'bk-m1', updatedAt: 10, doc: { id: 'bk-m1', name: 'Deals', fields: [] } }],
        records: [{ id: 'bk-r1', updatedAt: 11, doc: { id: 'bk-r1', moduleId: 'bk-m1', data: { title: 'Keep me' } } }],
      },
    });

    const out = await srv.req('/api/admin/export', { headers: { Authorization: `Bearer ${TOKEN}` } });
    assert.equal(out.status, 200);
    assert.equal(out.json.kind, 'backup');
    assert.ok(out.json.users.length >= 1);
    assert.equal(out.json.workspaces.length, 1);
    const ws = out.json.workspaces[0];
    assert.ok(ws.records.some((r) => r.id === 'bk-r1'), 'the point of a backup is the records');
    // Raw envelopes, so a restore keeps the sync clocks rather than making
    // every row look brand new to every device.
    assert.ok(ws.records[0].serverAt, 'envelopes, not bare documents');
  });

  test('tombstones are in the backup', async () => {
    const srv = await boot({ signupMode: 'open', backupToken: TOKEN });
    const admin = await adminOf(srv, 'tomb-owner@operator.test');
    await srv.req('/api/sync', {
      method: 'POST',
      cookies: admin,
      body: { since: 0, records: [{ id: 'gone-r1', updatedAt: 10, doc: { id: 'gone-r1', moduleId: 'm', data: {} } }] },
    });
    await srv.req('/api/sync', {
      method: 'POST',
      cookies: admin,
      body: { since: 0, records: [{ id: 'gone-r1', updatedAt: 20, deleted: true }] },
    });

    const out = await srv.req('/api/admin/export', { headers: { Authorization: `Bearer ${TOKEN}` } });
    const rows = out.json.workspaces[0].records;
    const tomb = rows.find((r) => r.id === 'gone-r1');
    assert.ok(tomb, 'a restore that dropped tombstones would resurrect every deleted record');
    assert.ok(tomb.deletedAt);
  });

  test('a wrong token is refused', async () => {
    const srv = await boot({ signupMode: 'open', backupToken: TOKEN });
    assert.equal((await srv.req('/api/admin/export', { headers: { Authorization: 'Bearer nope' } })).status, 401);
    // Shorter and longer than the real one: the comparison hashes both sides
    // first, so a length mismatch is a mismatch rather than a thrown error
    // that would itself leak the length.
    assert.equal((await srv.req('/api/admin/export', { headers: { Authorization: `Bearer ${TOKEN.slice(0, -1)}` } })).status, 401);
    assert.equal((await srv.req('/api/admin/export', { headers: { Authorization: `Bearer ${TOKEN}x` } })).status, 401);
    assert.equal((await srv.req('/api/admin/export', { headers: { Authorization: TOKEN } })).status, 401,
      'the Bearer scheme is required, not optional');
    assert.equal((await srv.req('/api/admin/export')).status, 401);
  });

  /*
   * The one that motivated putting this on a header at all.
   *
   * Render's edge logs request URLs, so a token in a query string is written
   * to plaintext logs — and to browser history, and to the Referer of anything
   * the page loads next. Accepting it "just this once" is how it ends up there.
   */
  test('a CORRECT token in the query string is still refused', async () => {
    const srv = await boot({ signupMode: 'open', backupToken: TOKEN });
    const out = await srv.req(`/api/admin/export?token=${encodeURIComponent(TOKEN)}`);
    assert.equal(out.status, 400);
    assert.match(out.json.error, /header/i, 'and it says what to do instead');
    assert.equal(out.json.workspaces, undefined, 'no data comes back either way');
  });

  test('an admin session is not a backup token', async () => {
    const srv = await boot({ signupMode: 'open', backupToken: TOKEN });
    const admin = await adminOf(srv, 'session-owner@operator.test');
    const out = await srv.req('/api/admin/export', { cookies: admin });
    // A stolen admin cookie must not also be a whole-database dump.
    assert.equal(out.status, 401);
  });
});

describe('usage reporting', () => {
  test('a platform admin sees how full the deployment is; nobody else does', async () => {
    const srv = await boot({ signupMode: 'open', adminEmails: 'usage-admin@operator.test' });
    const admin = await adminOf(srv, 'usage-admin@operator.test');
    const ordinary = (await srv.signUp('usage-member@tester.test')).setCookie;

    const stats = await srv.req('/api/admin/stats', { cookies: admin });
    assert.equal(stats.status, 200);
    assert.ok(stats.json.usage, 'the operator needs to see this before it becomes a decision');
    assert.equal(typeof stats.json.usage.workspaces, 'number');
    assert.ok(['ok', 'warn', 'critical', 'unknown'].includes(stats.json.usage.level));

    // An org owner would otherwise be able to infer how many other customers
    // share the database with them.
    const theirs = await srv.req('/api/admin/stats', { cookies: ordinary });
    if (theirs.status === 200) assert.equal(theirs.json.usage, undefined);

    // And it is not on the public health check.
    const health = await srv.req('/health');
    assert.equal(health.json.usage, undefined);
  });
});

/*
 * Problem reports.
 *
 * These write into the same 512 MB the customers use, so most of what is
 * asserted here is a bound: who may write, how big, how often, and what the
 * webhook is and is not told.
 */
describe('problem reports', () => {
  const send = (srv, cookies, message, context) =>
    srv.req('/api/feedback', { method: 'POST', body: { message, context }, cookies });

  test('a report is stored with its context, and shows up for the operator', async () => {
    const srv = await boot({ signupMode: 'open', adminEmails: 'fb-admin@operator.test' });
    const admin = await adminOf(srv, 'fb-admin@operator.test');
    const user = (await srv.signUp('reporter@tester.test')).setCookie;

    const out = await send(srv, user, 'The board lost my deal', {
      version: 'crmbuilder-v10',
      route: '#/m/deals',
      userAgent: 'TestBrowser/1.0',
      syncStatus: 'offline',
      online: false,
      modules: 3,
      records: 42,
      errors: ['12:00:01 TypeError: cannot read x'],
    });
    assert.equal(out.status, 200);
    assert.ok(out.json.id);

    const seen = await srv.req('/api/admin/feedback', { cookies: admin });
    assert.equal(seen.status, 200);
    const report = seen.json.reports.find((r) => r.id === out.json.id);
    assert.ok(report, 'the operator has to be able to see it');
    assert.equal(report.from, 'reporter@tester.test');
    assert.equal(report.message, 'The board lost my deal');
    assert.equal(report.status, 'open');
    // The context is the point: this is what saves four rounds of "what
    // browser were you using?".
    assert.equal(report.context.records, 42);
    assert.equal(report.context.syncStatus, 'offline');
    assert.equal(report.context.errors.length, 1);
  });

  test('only whitelisted context fields are kept', async () => {
    const srv = await boot({ signupMode: 'open', adminEmails: 'fb-admin2@operator.test' });
    const admin = await adminOf(srv, 'fb-admin2@operator.test');
    const user = (await srv.signUp('kitchen-sink@tester.test')).setCookie;

    await send(srv, user, 'here is everything', {
      route: '#/',
      // Not part of the contract, and this document is not a place to
      // accumulate whatever a client feels like sending.
      entireWorkspace: [{ secret: 'should not be stored' }],
      password: 'hunter2',
      errors: Array.from({ length: 50 }, (_, i) => `error ${i}`),
    });

    const { reports } = (await srv.req('/api/admin/feedback', { cookies: admin })).json;
    const ctx = reports[0].context;
    assert.equal(ctx.entireWorkspace, undefined);
    assert.equal(ctx.password, undefined);
    assert.equal(ctx.errors.length, 10, 'the error list is capped, not merely trimmed on display');
  });

  test('an oversized report is refused', async () => {
    const srv = await boot({ signupMode: 'open' });
    await adminOf(srv, 'fb-admin3@operator.test');
    const user = (await srv.signUp('verbose@tester.test')).setCookie;
    assert.equal((await send(srv, user, 'x'.repeat(5000))).status, 413);
    assert.equal((await send(srv, user, '   ')).status, 400, 'and an empty one says so');
  });

  test('a flood is rate limited', async () => {
    const srv = await boot({ signupMode: 'open' });
    await adminOf(srv, 'fb-admin4@operator.test');
    const user = (await srv.signUp('floods@tester.test')).setCookie;
    const codes = [];
    for (let i = 0; i < 12; i += 1) codes.push((await send(srv, user, `report ${i}`)).status);
    assert.ok(codes.includes(429), `expected a 429 in ${codes.join(',')}`);
    assert.equal(codes.filter((c) => c === 200).length, 10, 'ten an hour, then stop');
  });

  test('reporting requires an account, and reading them requires being the operator', async () => {
    const srv = await boot({ signupMode: 'open', adminEmails: 'fb-admin5@operator.test' });
    await adminOf(srv, 'fb-admin5@operator.test');
    const ordinary = (await srv.signUp('nosy@tester.test')).setCookie;

    assert.equal((await srv.req('/api/feedback', { method: 'POST', body: { message: 'hi' } })).status, 401);
    assert.equal((await srv.req('/api/admin/feedback')).status, 401);
    // Reports are other people's words about their own data.
    assert.equal((await srv.req('/api/admin/feedback', { cookies: ordinary })).status, 403);
  });

  test('an operator can resolve and reopen', async () => {
    const srv = await boot({ signupMode: 'open', adminEmails: 'fb-admin6@operator.test' });
    const admin = await adminOf(srv, 'fb-admin6@operator.test');
    const user = (await srv.signUp('resolver@tester.test')).setCookie;
    const id = (await send(srv, user, 'something broke')).json.id;

    assert.equal((await srv.req(`/api/admin/feedback/${id}`, { method: 'PATCH', body: { status: 'resolved' }, cookies: admin })).status, 200);
    let { reports } = (await srv.req('/api/admin/feedback', { cookies: admin })).json;
    assert.equal(reports.find((r) => r.id === id).status, 'resolved');

    await srv.req(`/api/admin/feedback/${id}`, { method: 'PATCH', body: { status: 'open' }, cookies: admin });
    ({ reports } = (await srv.req('/api/admin/feedback', { cookies: admin })).json);
    assert.equal(reports.find((r) => r.id === id).status, 'open');

    assert.equal((await srv.req(`/api/admin/feedback/${id}`, { method: 'PATCH', body: { status: 'banana' }, cookies: admin })).status, 400);
  });

  /*
   * The webhook is a notification, not the record.
   *
   * If it is unset, or set to something that refuses the request, the report
   * still has to be stored — otherwise a rotated URL silently swallows every
   * bug report and nobody finds out until they wonder why the beta went quiet.
   */
  test('a report is stored whether or not a webhook is configured', async () => {
    const without = await boot({ signupMode: 'open', adminEmails: 'fb-a@operator.test' });
    const adminA = await adminOf(without, 'fb-a@operator.test');
    const userA = (await without.signUp('no-hook@tester.test')).setCookie;
    assert.equal((await send(without, userA, 'no webhook here')).status, 200);
    assert.equal((await without.req('/api/admin/feedback', { cookies: adminA })).json.reports.length, 1);

    // A webhook that cannot possibly work: nothing is listening on that port.
    const broken = await boot({
      signupMode: 'open',
      adminEmails: 'fb-b@operator.test',
      webhook: 'http://127.0.0.1:9/hook',
    });
    const adminB = await adminOf(broken, 'fb-b@operator.test');
    const userB = (await broken.signUp('broken-hook@tester.test')).setCookie;
    const out = await send(broken, userB, 'webhook is dead');
    assert.equal(out.status, 200, 'a dead webhook must not make reporting a bug feel like another bug');
    assert.equal((await broken.req('/api/admin/feedback', { cookies: adminB })).json.reports.length, 1,
      'and the report is kept regardless');
  });
});

/*
 * What the webhook is told.
 *
 * This is the claim the store-and-push design rests on: the notification
 * carries who and what they wrote, and the diagnostic context stays in the
 * database. Console errors and route state can contain record names, module
 * names and email addresses, and posting those to a chat service would make it
 * a processor of beta users' CRM contents — a thing the privacy policy would
 * then have to disclose. Worth proving rather than commenting.
 */
describe('webhook payload', () => {
  test('carries the message, and none of the diagnostic context', async () => {
    const received = [];
    const hook = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        received.push(body);
        res.writeHead(204).end();
      });
    });
    await new Promise((r) => hook.listen(0, '127.0.0.1', r));
    const hookUrl = `http://127.0.0.1:${hook.address().port}/hook`;

    try {
      const srv = await boot({ signupMode: 'open', adminEmails: 'hook-admin@operator.test', webhook: hookUrl });
      const admin = await adminOf(srv, 'hook-admin@operator.test');
      const user = (await srv.signUp('hook-user@tester.test')).setCookie;

      await srv.req('/api/feedback', {
        method: 'POST',
        cookies: user,
        body: {
          message: 'the pipeline column vanished',
          context: {
            route: '#/m/deals',
            userAgent: 'SecretBrowser/9 on SecretOS',
            syncStatus: 'offline',
            records: 4242,
            errors: ['TypeError while rendering Acme Corp / jane@customer.example'],
          },
        },
      });

      // Fired after the response, so give it a moment to land.
      const deadline = Date.now() + 5000;
      while (!received.length && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
      assert.equal(received.length, 1, 'the operator should be told at all');

      const payload = received[0];
      assert.match(payload, /the pipeline column vanished/, 'the message is the useful part');
      assert.match(payload, /hook-user@tester\.test/, 'and who said it');

      // None of this may leave the database.
      assert.doesNotMatch(payload, /SecretBrowser/, 'no browser fingerprint');
      assert.doesNotMatch(payload, /jane@customer\.example/, 'no customer email from a console error');
      assert.doesNotMatch(payload, /Acme Corp/, 'no record names from a console error');
      assert.doesNotMatch(payload, /4242/, 'no record counts');

      // And the full context IS kept, where it is useful and disclosed.
      const { reports } = (await srv.req('/api/admin/feedback', { cookies: admin })).json;
      assert.match(reports[0].context.errors[0], /Acme Corp/);
      assert.equal(reports[0].context.records, 4242);
    } finally {
      await new Promise((r) => hook.close(r));
    }
  });

  /*
   * Telegram takes a different shape, and getting it wrong fails silently.
   *
   * sendMessage wants chat_id and text as parameters — a Discord-shaped
   * {content} body is accepted by the transport and simply never delivered.
   * Detection is on the path, which is why this can be driven by a local
   * server at all.
   */
  test('a Telegram bot URL is sent what Telegram actually reads', async () => {
    const seen = [];
    const hook = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        seen.push({ url: req.url, body });
        res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
      });
    });
    await new Promise((r) => hook.listen(0, '127.0.0.1', r));
    const port = hook.address().port;

    try {
      const srv = await boot({
        signupMode: 'open',
        adminEmails: 'tg-admin@operator.test',
        webhook: `http://127.0.0.1:${port}/bot12345:FAKE-TOKEN/sendMessage?chat_id=-1001234567890`,
      });
      await adminOf(srv, 'tg-admin@operator.test');
      const user = (await srv.signUp('tg-user@tester.test')).setCookie;

      await srv.req('/api/feedback', {
        method: 'POST',
        cookies: user,
        body: {
          // Characters Telegram's markdown parsers choke on. With a parse_mode
          // set, this report would be refused with a 400 and the operator
          // would never hear about it.
          message: 'the _totals_ row shows [object Object] * broken',
          context: { userAgent: 'SecretBrowser/9', records: 4242 },
        },
      });

      const deadline = Date.now() + 5000;
      while (!seen.length && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
      assert.equal(seen.length, 1, 'the operator should be told at all');

      const sent = JSON.parse(seen[0].body);
      assert.equal(sent.chat_id, '-1001234567890', 'chat_id has to be in the body, not left in the URL');
      assert.equal(seen[0].url, '/bot12345:FAKE-TOKEN/sendMessage', 'and taken off the query string');
      assert.equal(sent.parse_mode, undefined, 'no parse_mode: a stray _ or [ would get the message refused');
      assert.match(sent.text, /the _totals_ row shows \[object Object\] \* broken/, 'sent verbatim');
      assert.match(sent.text, /tg-user@tester\.test/, 'and who said it');
      assert.doesNotMatch(sent.text, /\*\*/, 'the Discord bolding does not belong here');

      // The privacy rule is the same whichever service is on the other end.
      assert.doesNotMatch(seen[0].body, /SecretBrowser/, 'no browser fingerprint');
      assert.doesNotMatch(seen[0].body, /4242/, 'no record counts');
    } finally {
      await new Promise((r) => hook.close(r));
    }
  });

  /*
   * A Telegram URL with no chat_id cannot be delivered, and that must be said
   * at the point it happens rather than swallowed — the operator would
   * otherwise be waiting on notifications that were never sendable.
   */
  test('a Telegram URL missing chat_id is reported, and the report is still stored', async () => {
    const srv = await boot({
      signupMode: 'open',
      adminEmails: 'tg-admin2@operator.test',
      webhook: 'https://api.telegram.org/bot12345:FAKE-TOKEN/sendMessage',
    });
    const admin = await adminOf(srv, 'tg-admin2@operator.test');
    const user = (await srv.signUp('tg-user2@tester.test')).setCookie;

    const out = await srv.req('/api/feedback', {
      method: 'POST', cookies: user, body: { message: 'nowhere to send this' },
    });
    assert.equal(out.status, 200, 'a misconfigured webhook is not the reporter’s problem');
    const { reports } = (await srv.req('/api/admin/feedback', { cookies: admin })).json;
    assert.equal(reports.length, 1, 'the record is what survives a bad notification path');

    await new Promise((r) => setTimeout(r, 300));
    assert.match(srv.log(), /no \?chat_id=/, 'and the operator is told why nothing arrives');
    assert.doesNotMatch(srv.log(), /FAKE-TOKEN/, 'without writing the bot token into the logs');
  });
});

/*
 * Access requests — the door for someone who arrived on their own.
 *
 * The whole design rests on one claim: a request can only ever carry an
 * address its sender has proved to Google they control. Most of what is
 * asserted here is that claim, and the shapes around it that make the queue
 * bounded and the decisions honest.
 */
describe('access requests', () => {
  // A refused signup is what hands over the right to ask, so this is how a
  // test gets hold of the cookie the endpoint reads.
  const refuse = async (srv, email) => {
    const out = await srv.signUp(email);
    assert.equal(out.status, 403, `expected ${email} to be refused: ${out.text}`);
    return out.setCookie;
  };

  test('a refused stranger can ask, and the operator sees it', async () => {
    const srv = await boot({ adminEmails: 'req-admin@operator.test' });
    const admin = await adminOf(srv, 'req-admin@operator.test');

    const asking = await refuse(srv, 'stranger@example.test');
    const asked = await srv.req('/api/access-request', {
      method: 'POST', cookies: asking, body: { note: 'I run a small bakery' },
    });
    assert.equal(asked.status, 200);
    assert.equal(asked.json.status, 'received');

    const seen = await srv.req('/api/admin/access-requests', { cookies: admin });
    assert.equal(seen.status, 200);
    assert.equal(seen.json.pending, 1);
    const row = seen.json.requests.find((r) => r.email === 'stranger@example.test');
    assert.ok(row, 'the operator has to be able to see it');
    assert.equal(row.note, 'I run a small bakery');
    assert.equal(row.status, 'pending');
  });

  /*
   * The one that matters.
   *
   * The address comes from the cookie the server set at the refusal, never
   * from the body. A version reading req.body.email lets anyone queue up as
   * anyone — and, once approved, hand that account to whoever asked for it.
   */
  test('a request cannot claim an address its sender does not control', async () => {
    const srv = await boot({ adminEmails: 'spoof-admin@operator.test' });
    const admin = await adminOf(srv, 'spoof-admin@operator.test');

    // No refusal, no cookie: nothing to grant, whatever the body says.
    const naked = await srv.req('/api/access-request', {
      method: 'POST', body: { email: 'ceo@bigcorp.test', note: 'let me in' },
    });
    assert.equal(naked.status, 403, 'an unauthenticated caller cannot queue anybody');

    // A real refusal for one address, a body naming a different one.
    const asking = await refuse(srv, 'honest@example.test');
    const out = await srv.req('/api/access-request', {
      method: 'POST',
      cookies: asking,
      body: { email: 'ceo@bigcorp.test', name: 'The Boss', note: 'hello' },
    });
    assert.equal(out.status, 200);

    const { requests } = (await srv.req('/api/admin/access-requests', { cookies: admin })).json;
    const emails = requests.map((r) => r.email);
    assert.deepEqual(emails, ['honest@example.test'], 'only the proved address is ever recorded');
    assert.equal(requests[0].name, '', 'and the body cannot dress it up either');
  });

  test('an approved address signs in with no code at all', async () => {
    const srv = await boot({ adminEmails: 'approve-admin@operator.test' });
    const admin = await adminOf(srv, 'approve-admin@operator.test');

    const asking = await refuse(srv, 'wants-in@example.test');
    await srv.req('/api/access-request', { method: 'POST', cookies: asking, body: { note: 'please' } });

    const decided = await srv.req('/api/admin/access-requests/wants-in@example.test/decide', {
      method: 'POST', cookies: admin, body: { decision: 'approved' },
    });
    assert.equal(decided.status, 200);
    assert.match(decided.json.message, /sign in with Google/, 'a paste-ready line for replying by hand');

    // The whole point: they come back and the same button simply works.
    const back = await srv.signUp('wants-in@example.test');
    assert.equal(back.status, 200, `an approved address must get in: ${back.text}`);

    const { requests } = (await srv.req('/api/admin/access-requests', { cookies: admin })).json;
    assert.ok(requests[0].usedAt, 'and the approval is marked used');
  });

  test('someone still waiting is told so, rather than told the beta is invite-only', async () => {
    const srv = await boot({ adminEmails: 'wait-admin@operator.test' });
    await adminOf(srv, 'wait-admin@operator.test');

    const asking = await refuse(srv, 'waiting@example.test');
    await srv.req('/api/access-request', { method: 'POST', cookies: asking, body: {} });

    const again = await srv.signUp('waiting@example.test');
    assert.equal(again.status, 403);
    assert.equal(again.json.reason, 'pending', 'being ignored and being queued are different things');

    // Someone who never asked is unchanged, so this is not a blanket rewording.
    const never = await srv.signUp('never-asked@example.test');
    assert.equal(never.json.reason, 'beta');
  });

  test('a declined person gets the ordinary refusal, and cannot re-queue', async () => {
    const srv = await boot({ adminEmails: 'no-admin@operator.test' });
    const admin = await adminOf(srv, 'no-admin@operator.test');

    const asking = await refuse(srv, 'declined@example.test');
    await srv.req('/api/access-request', { method: 'POST', cookies: asking, body: { note: 'first ask' } });
    await srv.req('/api/admin/access-requests/declined@example.test/decide', {
      method: 'POST', cookies: admin, body: { decision: 'declined' },
    });

    // Not told they were turned down: that starts an argument nobody wins.
    const retry = await srv.signUp('declined@example.test');
    assert.equal(retry.json.reason, 'beta', 'the generic screen, not a rejection notice');

    const asking2 = retry.setCookie;
    await srv.req('/api/access-request', { method: 'POST', cookies: asking2, body: { note: 'second ask' } });
    const { requests } = (await srv.req('/api/admin/access-requests', { cookies: admin })).json;
    assert.equal(requests.length, 1, 'and asking again does not put them back in the queue');
    assert.equal(requests[0].status, 'declined');
    assert.equal(requests[0].note, 'first ask', 'the decided row is not rewritten by a later ask');
  });

  test('asking twice is one row, and an overlong note is cut down', async () => {
    const srv = await boot({ adminEmails: 'twice-admin@operator.test' });
    const admin = await adminOf(srv, 'twice-admin@operator.test');

    for (const note of ['first go', 'x'.repeat(5000)]) {
      const asking = await refuse(srv, 'repeats@example.test');
      assert.equal((await srv.req('/api/access-request', { method: 'POST', cookies: asking, body: { note } })).status, 200);
    }
    const { requests, pending } = (await srv.req('/api/admin/access-requests', { cookies: admin })).json;
    assert.equal(requests.length, 1, 'one row per address however many times they ask');
    assert.equal(pending, 1);
    assert.ok(requests[0].note.length <= 500, `note should be bounded, got ${requests[0].note.length}`);
  });

  test('open signups let a still-pending request through', async () => {
    const srv = await boot({ adminEmails: 'mode-admin@operator.test' });
    await adminOf(srv, 'mode-admin@operator.test');
    const asking = await refuse(srv, 'pending-then-open@example.test');
    await srv.req('/api/access-request', { method: 'POST', cookies: asking, body: {} });

    // A request left over from when the door was shut must not keep them out
    // once it is open.
    await srv.setMode('open');
    const out = await srv.signUp('pending-then-open@example.test');
    assert.equal(out.status, 200, `open means open: ${out.text}`);
  });

  test('the queue is for the operator only', async () => {
    const srv = await boot({ adminEmails: 'own-admin@operator.test' });
    const admin = await adminOf(srv, 'own-admin@operator.test');
    // An ordinary account needs a code to exist at all in this mode, which is
    // the point — the caller under test is a real signed-in tester, not a
    // stranger holding the ask cookie.
    const code = (await mintCode(srv, admin, { maxUses: 5 })).code.code;
    const joined = await srv.signUp('ordinary@tester.test', code);
    assert.equal(joined.status, 200, joined.text);
    const ordinary = joined.setCookie;

    assert.equal((await srv.req('/api/admin/access-requests')).status, 401);
    // Other people's addresses and what they wrote about themselves.
    assert.equal((await srv.req('/api/admin/access-requests', { cookies: ordinary })).status, 403);
    assert.equal((await srv.req('/api/admin/access-requests/x@y.test/decide', {
      method: 'POST', cookies: ordinary, body: { decision: 'approved' },
    })).status, 403);
  });

  test('a decision has to be one of the two, on a request that exists', async () => {
    const srv = await boot({ adminEmails: 'valid-admin@operator.test' });
    const admin = await adminOf(srv, 'valid-admin@operator.test');
    const asking = await refuse(srv, 'real@example.test');
    await srv.req('/api/access-request', { method: 'POST', cookies: asking, body: {} });

    assert.equal((await srv.req('/api/admin/access-requests/real@example.test/decide', {
      method: 'POST', cookies: admin, body: { decision: 'maybe' },
    })).status, 400);
    assert.equal((await srv.req('/api/admin/access-requests/ghost@example.test/decide', {
      method: 'POST', cookies: admin, body: { decision: 'approved' },
    })).status, 404);
  });
});

/*
 * Changing the mode without a redeploy.
 *
 * The env var used to be read once at boot, so opening or pausing signups
 * meant an environment change and minutes of downtime on a free tier — at
 * exactly the moments you least want it. The live value now lives in the
 * database. What is asserted here is the precedence, because getting that
 * backwards is the failure that hurts: a redeploy silently undoing a decision
 * the operator made in the panel.
 */
describe('signup mode from the admin panel', () => {
  const setMode = (srv, cookies, mode) =>
    srv.req('/api/admin/signup-mode', { method: 'PUT', cookies, body: { mode } });

  test('a mode set in the panel takes effect at once, with no restart', async () => {
    const srv = await boot({ signupMode: 'code', adminEmails: 'mode-op@operator.test' });
    const admin = await adminOf(srv, 'mode-op@operator.test');

    // Gated to begin with.
    assert.equal((await srv.signUp('early@tester.test')).status, 403);

    assert.equal((await setMode(srv, admin, 'open')).status, 200);
    const walkIn = await srv.signUp('walk-in@tester.test');
    assert.equal(walkIn.status, 200, `open should mean open immediately: ${walkIn.text}`);

    // And back again, still without touching the environment.
    assert.equal((await setMode(srv, admin, 'closed')).status, 200);
    const late = await srv.signUp('too-late@tester.test');
    assert.equal(late.status, 403);
    assert.equal(late.json.reason, 'closed');

    // The operator is never locked out of their own deployment.
    assert.equal((await srv.signUp('mode-op@operator.test')).status, 200);
    // Nor is anyone who already has an account.
    assert.equal((await srv.signUp('walk-in@tester.test')).status, 200);
  });

  /*
   * The one that matters. SIGNUP_MODE is the default for a deployment that has
   * never set one; once the panel has spoken, it decides. A version where the
   * env var wins would quietly revert the operator on the next deploy.
   */
  test('a panel decision survives a restart, and the env var does not undo it', async () => {
    const srv = await boot({ signupMode: 'code', adminEmails: 'persist-op@operator.test' });
    const admin = await adminOf(srv, 'persist-op@operator.test');
    await setMode(srv, admin, 'open');

    // Restart with SIGNUP_MODE=code still in the environment, as a redeploy
    // would. The stored decision has to win.
    await srv.setMode('code');
    const after = await srv.signUp('after-restart@tester.test');
    assert.equal(after.status, 200, `the panel decision must outlive a redeploy: ${after.text}`);

    const me = await srv.req('/api/me');
    assert.equal(me.json.signupMode, 'open', 'and the live value is what clients are told');
  });

  test('a deployment that never set one follows its environment', async () => {
    const open = await boot({ signupMode: 'open' });
    assert.equal((await open.req('/api/me')).json.signupMode, 'open');
    const shut = await boot({ signupMode: 'closed' });
    assert.equal((await shut.req('/api/me')).json.signupMode, 'closed');
  });

  test('only the platform operator can change it, and only to a real mode', async () => {
    const srv = await boot({ signupMode: 'code', adminEmails: 'guard-op@operator.test' });
    const admin = await adminOf(srv, 'guard-op@operator.test');
    const code = (await mintCode(srv, admin, { maxUses: 5 })).code.code;
    const ordinary = (await srv.signUp('ordinary-mode@tester.test', code)).setCookie;

    assert.equal((await srv.req('/api/admin/signup-mode', { method: 'PUT', body: { mode: 'open' } })).status, 401);
    assert.equal((await setMode(srv, ordinary, 'open')).status, 403);
    assert.equal((await setMode(srv, admin, 'banana')).status, 400);
    assert.equal((await setMode(srv, admin, '')).status, 400);

    // None of that moved it.
    assert.equal((await srv.req('/api/me')).json.signupMode, 'code');
  });
});

/*
 * Who ends up administering a new deployment.
 *
 * "The first account ever becomes a platform admin" is a bootstrap: minting a
 * beta code needs a platform admin and becoming one needs a signup, so without
 * it a fresh gated install has no way in. Unconditionally, though, it also
 * means whoever reaches a newly deployed URL first owns the instance — and the
 * URL is live from the moment the service is, which is not necessarily after
 * its owner has signed in.
 */
describe('who gets to administer a new deployment', () => {
  test('a stranger arriving first does not inherit a named deployment', async () => {
    const srv = await boot({ signupMode: 'open', adminEmails: 'owner@operator.test' });

    // Nobody has signed in yet — the window the hijack lives in.
    const early = await srv.signUp('passer-by@stranger.test');
    assert.equal(early.status, 200, 'open signups still work');
    assert.equal(early.json.user.role, 'owner', 'the instance is not theirs to run');

    // And the named operator is still a platform admin when they arrive.
    const op = await srv.signUp('owner@operator.test');
    assert.equal(op.json.user.role, 'platformAdmin');

    // The stranger cannot reach the platform surface.
    assert.equal((await srv.req('/api/admin/beta-codes', { cookies: early.setCookie })).status, 403);
  });

  test('a gated deployment refuses the first stranger rather than seating them', async () => {
    const srv = await boot({ signupMode: 'code', adminEmails: 'gated-op@operator.test' });
    // Bypass 3 used to let this through on an empty deployment, so a stranger
    // who found the URL first got an account past a gate that was shut.
    const early = await srv.signUp('first-through-the-door@stranger.test');
    assert.equal(early.status, 403, `a shut door is shut: ${early.text}`);

    // The operator is never locked out — that is what makes narrowing it safe.
    assert.equal((await srv.signUp('gated-op@operator.test')).status, 200);
  });

  /*
   * The case the bootstrap exists for, which must keep working: nobody named,
   * nothing in the database, and a gate that would otherwise refuse everyone.
   */
  test('a deployment that named nobody still lets its first visitor in', async () => {
    const srv = await boot({ signupMode: 'code', adminEmails: '' });
    const first = await srv.signUp('founder@nowhere.test');
    assert.equal(first.status, 200, `an unnamed deployment must not be bricked: ${first.text}`);
    assert.equal(first.json.user.role, 'platformAdmin', 'and they can actually administer it');
    // Only the first: the door shuts behind them.
    assert.equal((await srv.signUp('second@nowhere.test')).status, 403);
  });
});

/*
 * An org-level role must not reach a deployment-level one.
 *
 * Scoping by org is not enough on its own: a platform admin has an org like
 * anybody else, so its owner was able to demote, disable or delete them.
 */
describe('platform admins are not the org owner\'s to manage', () => {
  // A platform admin and an ordinary owner inside the SAME org — the shape
  // where org scoping alone stops helping.
  const sameOrgTeam = async () => {
    const srv = await boot({ signupMode: 'open', adminEmails: 'plat@operator.test' });
    const plat = await srv.signUp('plat@operator.test');
    assert.equal(plat.json.user.role, 'platformAdmin');

    const mate = await srv.signUp('colleague@team.test');
    const code = (await srv.req('/api/org/invites', { method: 'POST', body: {}, cookies: plat.setCookie })).json.invite.code;
    assert.equal((await srv.req('/api/org/join', { method: 'POST', body: { code }, cookies: mate.setCookie })).status, 200);
    // Promote them so they are a full owner of the platform admin's org.
    assert.equal((await srv.req(`/api/admin/users/${mate.json.user.id}`, {
      method: 'PATCH', body: { role: 'owner' }, cookies: plat.setCookie,
    })).status, 200);

    return { srv, platId: plat.json.user.id, plat: plat.setCookie, owner: mate.setCookie };
  };

  test('an owner cannot demote, disable or delete a platform admin in their org', async () => {
    const { srv, platId, owner } = await sameOrgTeam();

    for (const [what, opts] of [
      ['demote', { method: 'PATCH', body: { role: 'member' } }],
      ['disable', { method: 'PATCH', body: { disabled: true } }],
      ['delete', { method: 'DELETE' }],
    ]) {
      const out = await srv.req(`/api/admin/users/${platId}`, { ...opts, cookies: owner });
      // 404, not 403: the answer must not confirm the account is there.
      assert.equal(out.status, 404, `${what} should not be available: ${out.text}`);
    }

    // None of it landed.
    const still = (await srv.req('/api/admin/users', { cookies: owner })).json.users.find((u) => u.id === platId);
    assert.equal(still.role, 'platformAdmin');
    assert.equal(still.disabled, false);
  });

  /*
   * The paths that ARE reachable, asserted for what they actually are.
   *
   * The "last platform admin" backstop in deleteAccount cannot fire through
   * this route — the self-guard and the owner 404 together mean the actor is
   * always a second platform admin — so it is documented in the code rather
   * than covered by a test that would pass whatever the guard did. What is
   * tested here is what a platform admin genuinely can and cannot do.
   */
  test('a platform admin can remove another, but never their own account here', async () => {
    const srv = await boot({ signupMode: 'open', adminEmails: 'first-op@operator.test,second-op@operator.test' });
    const first = await srv.signUp('first-op@operator.test');
    const second = await srv.signUp('second-op@operator.test');
    assert.equal(second.json.user.role, 'platformAdmin');

    // Your own account is not editable from the admin surface, whatever your
    // role — which is also what stops the deployment being stranded.
    assert.equal((await srv.req(`/api/admin/users/${first.json.user.id}`, {
      method: 'DELETE', cookies: first.setCookie,
    })).status, 400);
    assert.equal((await srv.req(`/api/admin/users/${first.json.user.id}`, {
      method: 'PATCH', body: { role: 'member' }, cookies: first.setCookie,
    })).status, 400);

    // A second platform admin, though, is a peer and can be removed.
    assert.equal((await srv.req(`/api/admin/users/${second.json.user.id}`, {
      method: 'DELETE', cookies: first.setCookie,
    })).status, 200);
    const left = (await srv.req('/api/admin/users', { cookies: first.setCookie })).json.users;
    assert.ok(!left.some((u) => u.email === 'second-op@operator.test'));
  });
});

/*
 * What the deployment is carrying.
 *
 * The three limits this can actually hit are Atlas storage, container RAM and
 * monthly egress. Uptime hours are deliberately not among them — Render does
 * not publish free-tier consumption, and a number nobody can check is worse
 * than no number.
 */
describe('platform usage and quotas', () => {
  test('reports every organisation, with bytes that are measured rather than counted', async () => {
    const srv = await boot({ signupMode: 'open', adminEmails: 'plat-admin@operator.test' });
    const admin = await adminOf(srv, 'plat-admin@operator.test');

    // Two tenants: one with a handful of large records, one with more small
    // ones. If bytes were records × a constant, the second would look bigger.
    const heavy = (await srv.signUp('heavy@tenant.test')).setCookie;
    const light = (await srv.signUp('light@tenant.test')).setCookie;
    const push = (cookies, records) => srv.req('/api/sync', {
      method: 'POST', cookies, body: { modules: [], records, settings: null },
    });
    await push(heavy, [{ id: 'h1', updatedAt: Date.now(), doc: { moduleId: 'm', data: { note: 'x'.repeat(4000) } } }]);
    await push(light, Array.from({ length: 6 }, (_, i) => ({
      id: `l${i}`, updatedAt: Date.now(), doc: { moduleId: 'm', data: { note: 'y' } },
    })));

    const out = await srv.req('/api/admin/platform', { cookies: admin });
    assert.equal(out.status, 200, out.text);

    // Three tenants exist (the operator has an org too).
    assert.equal(out.json.counts.orgs, 3);
    assert.equal(out.json.counts.users, 3);

    const rows = out.json.orgs;
    const big = rows.find((r) => r.name && r.records === 1);
    const many = rows.find((r) => r.records === 6);
    assert.ok(big && many, `expected both tenants: ${JSON.stringify(rows)}`);
    assert.ok(
      big.bytes > many.bytes,
      `one large record must outweigh six small ones — ${big.bytes} vs ${many.bytes}. `
      + 'Equal-ish numbers mean this went back to counting rows.',
    );
    // Heaviest first, so the tenant worth looking at is the one you see.
    assert.equal(rows[0].bytes, Math.max(...rows.map((r) => r.bytes)));
    assert.ok(rows[0].shareOfData > 0);
  });

  test('the three meters are present, and each knows its own limit', async () => {
    const srv = await boot({ signupMode: 'open', adminEmails: 'meter-admin@operator.test' });
    const admin = await adminOf(srv, 'meter-admin@operator.test');
    const { meters } = (await srv.req('/api/admin/platform', { cookies: admin })).json;

    for (const name of ['storage', 'ram', 'egress']) {
      assert.ok(meters[name], `missing the ${name} meter`);
      assert.ok('level' in meters[name], `${name} has no level`);
    }
    // RAM is a real reading against the container limit, with the worst seen
    // kept alongside the last glance.
    assert.ok(meters.ram.bytes > 0, 'RSS should be a real measurement');
    assert.ok(meters.ram.peakBytes >= meters.ram.bytes);
    assert.equal(meters.ram.limitBytes, 512 * 1024 * 1024);
    assert.equal(meters.egress.limitBytes, 5 * 1024 * 1024 * 1024);
    assert.equal(meters.egress.month, new Date().toISOString().slice(0, 7));
  });

  /*
   * The egress counter has to survive a restart, because a monthly allowance
   * that resets whenever the free tier spins down measures nothing.
   *
   * SKIPPED ON WINDOWS, and the reason is the platform, not the product.
   *
   * The tail is written by the server's SIGTERM handler (§24). Windows has no
   * POSIX signals: libuv maps `child.kill()` to TerminateProcess(), which ends
   * the child unconditionally without running its JS signal listeners. So the
   * pending bytes are lost and the assertion fails — on a server that is
   * behaving correctly. Observed as `297 < 2829`: 297 had already reached
   * disk, 2,532 were still in memory when the process was killed.
   *
   * Not deleted, because this is the only guard on that handler and the
   * handler exists for a measured reason — without it a free-tier spin-down
   * loses most of a quiet month's count. It stays checked on Linux, which is
   * what CI runs and what Render runs. Do not "fix" it by flushing through an
   * endpoint before the kill: that would pass on a server with no SIGTERM
   * handler at all, which is a test worth nothing (§9).
   */
  test('egress is counted, persisted, and still there after a restart', {
    skip: process.platform === 'win32'
      ? 'Windows cannot deliver SIGTERM to a child, so the shutdown flush never runs'
      : false,
  }, async () => {
    const srv = await boot({ signupMode: 'open', adminEmails: 'egress-admin@operator.test' });
    const admin = await adminOf(srv, 'egress-admin@operator.test');

    // Enough responses to be unmistakably more than zero.
    for (let i = 0; i < 20; i += 1) await srv.req('/api/me');
    const before = (await srv.req('/api/admin/platform', { cookies: admin })).json.meters.egress.bytes;
    assert.ok(before > 0, 'responses should have been counted');

    await srv.setMode('open'); // restarts against the same data directory
    const admin2 = await adminOf(srv, 'egress-admin@operator.test');
    const after = (await srv.req('/api/admin/platform', { cookies: admin2 })).json.meters.egress.bytes;
    assert.ok(after >= before, `the month's total must not reset on a restart: ${after} < ${before}`);
  });

  test('the platform view is for the operator alone', async () => {
    const srv = await boot({ signupMode: 'open', adminEmails: 'only-admin@operator.test' });
    await adminOf(srv, 'only-admin@operator.test');
    const ordinary = (await srv.signUp('nosy@tenant.test')).setCookie;
    // Another tenant's name, size and share of the database is not an org
    // owner's business, and would tell them who else is on the deployment.
    assert.equal((await srv.req('/api/admin/platform')).status, 401);
    assert.equal((await srv.req('/api/admin/platform', { cookies: ordinary })).status, 403);
  });
});

/*
 * Capping tenants without freezing your customers.
 *
 * Every signup mints an org, so "stop new accounts" and "stop new
 * organisations" were the same switch — and that meant pausing signups also
 * locked out every invited colleague of every existing customer, because they
 * must have an account before /api/org/join can move them.
 */
describe('the organisation gate', () => {
  const setOrgCreation = (srv, cookies, mode) =>
    srv.req('/api/admin/org-creation', { method: 'PUT', cookies, body: { mode } });

  test('a stranger is refused but an invited colleague still gets in', async () => {
    const srv = await boot({ signupMode: 'open', adminEmails: 'gate-op@operator.test' });
    const admin = await adminOf(srv, 'gate-op@operator.test');

    // An existing customer with a team and an invite out.
    const owner = (await srv.signUp('owner@customer.test')).setCookie;
    const invite = (await srv.req('/api/org/invites', { method: 'POST', body: {}, cookies: owner })).json.invite.code;

    assert.equal((await setOrgCreation(srv, admin, 'closed')).status, 200);

    // No more tenants.
    const stranger = await srv.signUp('stranger@nowhere.test');
    assert.equal(stranger.status, 403, `a new tenant should be refused: ${stranger.text}`);
    assert.equal(stranger.json.reason, 'orgclosed');

    // But the customer's colleague is not their problem. THIS is the case the
    // separate lever exists for — a version that just refuses every signup
    // passes the assertion above and fails here.
    const mate = await srv.req('/auth/dev', {
      method: 'POST', body: { email: 'colleague@customer.test', invite },
    });
    assert.equal(mate.status, 200, `an invited colleague must still register: ${mate.text}`);

    // And the invite was checked, not spent — the join still needs it.
    const joined = await srv.req('/api/org/join', {
      method: 'POST', body: { code: invite }, cookies: mate.setCookie,
    });
    assert.equal(joined.status, 200, `the invite must survive the signup check: ${joined.text}`);
  });

  test('a made-up invite does not get past the gate', async () => {
    const srv = await boot({ signupMode: 'open', adminEmails: 'gate-op2@operator.test' });
    const admin = await adminOf(srv, 'gate-op2@operator.test');
    await setOrgCreation(srv, admin, 'closed');

    const out = await srv.req('/auth/dev', {
      method: 'POST', body: { email: 'chancer@nowhere.test', invite: 'not-a-real-invite' },
    });
    assert.equal(out.status, 403);
    assert.equal(out.json.reason, 'orgclosed');
  });

  test('the gate is stored, survives a restart, and only the operator sets it', async () => {
    const srv = await boot({ signupMode: 'open', adminEmails: 'gate-op3@operator.test' });
    const admin = await adminOf(srv, 'gate-op3@operator.test');
    const ordinary = (await srv.signUp('ordinary@tenant.test')).setCookie;

    assert.equal((await setOrgCreation(srv, ordinary, 'closed')).status, 403);
    assert.equal((await setOrgCreation(srv, admin, 'banana')).status, 400);
    assert.equal((await setOrgCreation(srv, admin, 'closed')).status, 200);

    await srv.setMode('open'); // restart, same data
    const after = await srv.signUp('late@nowhere.test');
    assert.equal(after.status, 403, 'the decision must outlive a redeploy');

    // Reopening lets tenants in again.
    const admin2 = await adminOf(srv, 'gate-op3@operator.test');
    await setOrgCreation(srv, admin2, 'open');
    assert.equal((await srv.signUp('welcome@nowhere.test')).status, 200);
  });
});

/*
 * Pausing an organisation.
 *
 * Read-only, reversible, and it destroys nothing. deleteAccount stays the only
 * thing that can take a workspace with it (§5).
 */
describe('suspending an organisation', () => {
  const setup = async () => {
    const srv = await boot({ signupMode: 'open', adminEmails: 'susp-op@operator.test' });
    const admin = await adminOf(srv, 'susp-op@operator.test');
    const user = await srv.signUp('heavy@tenant.test');
    const cookies = user.setCookie;
    await srv.req('/api/sync', {
      method: 'POST',
      cookies,
      body: { records: [{ id: 'r1', updatedAt: Date.now(), doc: { moduleId: 'm', data: { name: 'Before' } } }] },
    });
    return { srv, admin, cookies, orgId: user.json.user.orgId };
  };

  test('a paused workspace stops accepting writes, keeps its data, and says why', async () => {
    const { srv, admin, cookies, orgId } = await setup();

    const paused = await srv.req(`/api/admin/orgs/${orgId}/suspend`, {
      method: 'POST', cookies: admin, body: { suspend: true, reason: 'Storage review' },
    });
    assert.equal(paused.status, 200, paused.text);

    const push = await srv.req('/api/sync', {
      method: 'POST',
      cookies,
      body: { since: 0, records: [{ id: 'r2', updatedAt: Date.now(), doc: { moduleId: 'm', data: { name: 'During' } } }] },
    });
    assert.equal(push.status, 200, 'not an error — a state the client has to render');
    assert.equal(push.json.readOnly, true);
    assert.match(push.json.readOnlyReason, /Storage review/);

    // The write did not land...
    assert.ok(!push.json.records.some((r) => r.id === 'r2'), 'the push must be refused');
    // ...and nothing they already had was touched. That is the whole promise.
    const kept = await srv.req('/api/sync?since=0', { cookies });
    assert.ok(kept.json.records.some((r) => r.id === 'r1'), 'existing records must survive a pause');
    assert.ok(!kept.json.records.some((r) => r.id === 'r2'));

    // Signing in still works: this is not a lockout.
    assert.equal((await srv.signUp('heavy@tenant.test')).status, 200);
  });

  test('resuming restores writes, and the pause was never destructive', async () => {
    const { srv, admin, cookies, orgId } = await setup();
    await srv.req(`/api/admin/orgs/${orgId}/suspend`, { method: 'POST', cookies: admin, body: { suspend: true } });
    await srv.req(`/api/admin/orgs/${orgId}/suspend`, { method: 'POST', cookies: admin, body: { suspend: false } });

    const push = await srv.req('/api/sync', {
      method: 'POST',
      cookies,
      body: { since: 0, records: [{ id: 'r3', updatedAt: Date.now(), doc: { moduleId: 'm', data: { name: 'After' } } }] },
    });
    assert.ok(!push.json.readOnly, 'writes must come back');
    const all = await srv.req('/api/sync?since=0', { cookies });
    assert.ok(all.json.records.some((r) => r.id === 'r1'), 'the old record is still there');
    assert.ok(all.json.records.some((r) => r.id === 'r3'), 'and the new one landed');
  });

  test('pausing an organisation is the operator\'s call alone', async () => {
    const { srv, cookies, orgId } = await setup();
    assert.equal((await srv.req(`/api/admin/orgs/${orgId}/suspend`, { method: 'POST', body: { suspend: true } })).status, 401);
    assert.equal((await srv.req(`/api/admin/orgs/${orgId}/suspend`, {
      method: 'POST', cookies, body: { suspend: true },
    })).status, 403, 'a tenant cannot pause anyone, least of all somebody else');
  });
});

/*
 * Alerts: told once when it starts, not every fourteen minutes.
 *
 * The transport is already proven elsewhere; what is asserted here is the
 * state machine, because that is what decides whether the channel stays worth
 * reading. A rule that repeats at the same level trains the operator to ignore
 * it, and an ignored alert is worse than none.
 */
describe('threshold alerts', () => {
  // Thresholds are driven from the environment so a rule can be made to fire
  // on a workspace of a few records rather than by filling a real quota.
  const bootAlerting = (extra = {}) =>
    boot({ signupMode: 'open', adminEmails: 'alert-op@operator.test', ...extra });

  test('a test alert reports what each rule currently sees', async () => {
    const srv = await bootAlerting();
    const admin = await adminOf(srv, 'alert-op@operator.test');
    const out = await srv.req('/api/admin/alerts/test', { method: 'POST', cookies: admin });
    assert.equal(out.status, 200, out.text);
    // Whether a webhook is configured is the difference between "nothing is
    // wrong" and "this has been broken since the URL was rotated".
    assert.equal(out.json.webhookConfigured, false);
    const named = out.json.rules.map((r) => r.rule);
    for (const rule of ['storage', 'ram', 'egress', 'signups', 'tenant']) {
      assert.ok(named.includes(rule), `no ${rule} rule: ${named.join(', ')}`);
    }
  });

  test('only the operator can send one', async () => {
    const srv = await bootAlerting();
    await adminOf(srv, 'alert-op@operator.test');
    const ordinary = (await srv.signUp('ordinary@tenant.test')).setCookie;
    assert.equal((await srv.req('/api/admin/alerts/test', { method: 'POST' })).status, 401);
    assert.equal((await srv.req('/api/admin/alerts/test', { method: 'POST', cookies: ordinary })).status, 403);
  });

  /*
   * The state machine, driven through a real threshold.
   *
   * RAM is the one that can be forced without filling anything: setting the
   * limit low enough makes the process's own RSS cross it.
   */
  test('a crossed threshold is announced once, and re-arms only after dropping back', async () => {
    const received = [];
    const hook = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => { received.push(body); res.writeHead(204).end(); });
    });
    await new Promise((r) => hook.listen(0, '127.0.0.1', r));
    const hookUrl = `http://127.0.0.1:${hook.address().port}/hook`;

    try {
      // A limit this process is certainly over, so the RAM rule is critical.
      const srv = await boot({
        signupMode: 'open',
        adminEmails: 'alert-op@operator.test',
        webhook: hookUrl,
        env: { RAM_LIMIT_BYTES: '1048576', ALERT_MIN_GAP_MS: '0' },
      });
      await adminOf(srv, 'alert-op@operator.test');

      // Several pings, as UptimeRobot would make.
      for (let i = 0; i < 4; i += 1) await srv.req('/health');
      const deadline = Date.now() + 5000;
      while (!received.length && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));

      assert.ok(received.length >= 1, 'crossing a threshold should say so');
      assert.match(received[0], /Memory at/);
      // Four pings, one message. This is the whole point.
      await new Promise((r) => setTimeout(r, 500));
      assert.equal(received.length, 1, `announced ${received.length} times for one crossing — escalate-only is not holding`);
    } finally {
      await new Promise((r) => hook.close(r));
    }
  });
});

/*
 * The placeholder organisation a joiner leaves behind.
 *
 * Signing up only to accept an invite mints an org that is abandoned a moment
 * later, and it inflates the tenant count the operator panel exists to make
 * trustworthy. Removed when it is provably a shell — and kept when it is not.
 */
describe('tidying up after a join', () => {
  const teamWithInvite = async (srv) => {
    const owner = (await srv.signUp('team-owner@customer.test')).setCookie;
    const invite = (await srv.req('/api/org/invites', { method: 'POST', body: {}, cookies: owner })).json.invite.code;
    return { owner, invite };
  };

  test('an empty placeholder org is removed when its only member joins a team', async () => {
    const srv = await boot({ signupMode: 'open', adminEmails: 'tidy-op@operator.test' });
    const admin = await adminOf(srv, 'tidy-op@operator.test');
    const { invite } = await teamWithInvite(srv);

    const before = (await srv.req('/api/admin/platform', { cookies: admin })).json.counts.orgs;
    const joiner = await srv.signUp('joiner@customer.test');
    assert.equal((await srv.req('/api/org/join', {
      method: 'POST', body: { code: invite }, cookies: joiner.setCookie,
    })).status, 200);

    const after = (await srv.req('/api/admin/platform?fresh=1', { cookies: admin })).json.counts.orgs;
    assert.equal(after, before, `the shell should be gone, not counted: ${before} → ${after}`);
  });

  /*
   * And the case the guard exists for. Somebody who built their own CRM and
   * then joined a team without bringing it has a workspace, not a placeholder.
   */
  test('an org holding work is kept, even with nobody left in it', async () => {
    const srv = await boot({ signupMode: 'open', adminEmails: 'tidy-op2@operator.test' });
    const admin = await adminOf(srv, 'tidy-op2@operator.test');
    const { invite } = await teamWithInvite(srv);

    const joiner = await srv.signUp('builder@customer.test');
    await srv.req('/api/sync', {
      method: 'POST',
      cookies: joiner.setCookie,
      body: { records: [{ id: 'mine', updatedAt: Date.now(), doc: { moduleId: 'm', data: { name: 'My own work' } } }] },
    });

    const before = (await srv.req('/api/admin/platform', { cookies: admin })).json.counts.orgs;
    assert.equal((await srv.req('/api/org/join', {
      method: 'POST', body: { code: invite }, cookies: joiner.setCookie,
    })).status, 200);

    const view = (await srv.req('/api/admin/platform?fresh=1', { cookies: admin })).json;
    assert.equal(view.counts.orgs, before, 'their workspace is not a shell and must survive');
    const orphan = view.orgs.find((o) => o.members === 0 && o.records > 0);
    assert.ok(orphan, 'and it is visible, with nobody in it, rather than silently deleted');
  });

  /*
   * Deleting the last member reaches the same state as a vacated join, by a
   * different door. It used to leave the org row behind: 0 people, 0 records,
   * 0 B, inflating the tenant count the panel exists to make trustworthy.
   */
  test('deleting the last account takes its organisation with it', async () => {
    const srv = await boot({ signupMode: 'open', adminEmails: 'tidy-op3@operator.test' });
    const admin = await adminOf(srv, 'tidy-op3@operator.test');

    const before = (await srv.req('/api/admin/platform?fresh=1', { cookies: admin })).json.counts.orgs;
    const leaver = await srv.signUp('leaver@customer.test');
    const mid = (await srv.req('/api/admin/platform?fresh=1', { cookies: admin })).json.counts.orgs;
    assert.equal(mid, before + 1, 'the signup minted an org');

    const gone = await srv.req(`/api/admin/users/${leaver.json.user.id}`, { method: 'DELETE', cookies: admin });
    assert.equal(gone.status, 200);

    const after = (await srv.req('/api/admin/platform?fresh=1', { cookies: admin })).json;
    assert.equal(after.counts.orgs, before, 'and deleting the account took the org with it');
    assert.equal(
      after.orgs.filter((o) => o.members === 0 && o.records === 0 && o.bytes === 0).length, 0,
      'no orphan row is left in the Organisations table',
    );
  });

  /*
   * The Organisations table counts rows, and a tombstone is not a record.
   *
   * Bytes are the other way round on purpose: a tombstone occupies real
   * storage, so the size column must keep counting it (§17). Only the count
   * excludes them.
   */
  test('the Organisations table counts live records, not tombstones', async () => {
    const srv = await boot({ signupMode: 'open', adminEmails: 'tidy-op4@operator.test' });
    const admin = await adminOf(srv, 'tidy-op4@operator.test');
    const user = await srv.signUp('counts@customer.test');
    const cookies = user.setCookie;

    const now = Date.now();
    const records = [...Array(10)].map((_, i) => ({
      id: `r${i}`, updatedAt: now, doc: { moduleId: 'm1', data: { name: `row ${i}` } },
    }));
    await srv.req('/api/sync', { method: 'POST', cookies, body: { since: 0, records } });

    const full = (await srv.req('/api/admin/platform?fresh=1', { cookies: admin })).json
      .orgs.find((o) => o.records === 10);
    assert.ok(full, 'ten live records are reported as ten');
    const bytesWithAllLive = full.bytes;

    // Delete four. They become tombstones: still stored, no longer records.
    await srv.req('/api/sync', {
      method: 'POST',
      cookies,
      body: {
        since: 0,
        records: [0, 1, 2, 3].map((i) => ({ id: `r${i}`, updatedAt: now + 1000, deleted: true, deletedAt: now + 1000 })),
      },
    });

    const after = (await srv.req('/api/admin/platform?fresh=1', { cookies: admin })).json
      .orgs.find((o) => o.id === full.id);
    assert.equal(after.records, 6, 'four deleted rows must not still be counted as records');
    assert.ok(after.bytes > 0, 'but the tombstones are still real storage and still measured');
    assert.ok(
      after.bytes >= bytesWithAllLive * 0.5,
      'deleting rows must not make the size column pretend the storage was freed',
    );
  });

  /*
   * The split behind the "N% reclaimable" line in the Organisations table.
   *
   * The size column cannot tell a heavy tenant from one that is mostly
   * gravestones, and the storage alerts (§25) fire on the figure that
   * conflates them — so the panel has to be handed both halves rather than
   * left to infer one.
   */
  test('an organisation reports how much of its storage is tombstones', async () => {
    const srv = await boot({ signupMode: 'open', adminEmails: 'tidy-op5@operator.test' });
    const admin = await adminOf(srv, 'tidy-op5@operator.test');
    const user = await srv.signUp('reclaim@customer.test');
    const cookies = user.setCookie;

    const now = Date.now();
    const body = { moduleId: 'm1', data: { name: 'x'.repeat(400), notes: 'y'.repeat(400) } };
    const rows = [...Array(8)].map((_, i) => ({ id: `r${i}`, updatedAt: now, doc: body }));
    await srv.req('/api/sync', { method: 'POST', cookies, body: { since: 0, records: rows } });

    const clean = (await srv.req('/api/admin/platform?fresh=1', { cookies: admin })).json
      .orgs.find((o) => o.records === 8);
    assert.ok(clean, 'eight live records');
    assert.equal(clean.deadBytes, 0, 'a workspace that has deleted nothing has nothing reclaimable');

    // Delete half. The bodies are discarded, so each row shrinks to a stub.
    await srv.req('/api/sync', {
      method: 'POST',
      cookies,
      body: {
        since: 0,
        records: [0, 1, 2, 3].map((i) => ({ id: `r${i}`, updatedAt: now + 1000, deleted: true, deletedAt: now + 1000 })),
      },
    });

    const view = (await srv.req('/api/admin/platform?fresh=1', { cookies: admin })).json;
    const org = view.orgs.find((o) => o.id === clean.id);
    assert.ok(org.deadBytes > 0, 'the tombstones are measured');
    assert.ok(org.deadBytes < org.bytes, 'and they are a PART of the total, not a second total');

    /*
     * The assertion that matters: measured, not derived from the counts.
     *
     * Half the ROWS are tombstones here, but they hold none of the bodies, so
     * they must be a small minority of the BYTES. Anything computing this as
     * deadRows/totalRows would report ~50% and fail — which is the trap §17
     * records, wearing a different hat.
     */
    const pct = (org.deadBytes / org.bytes) * 100;
    assert.ok(pct > 0 && pct < 25, `four stub rows against four full ones should be a small byte share, got ${pct.toFixed(1)}%`);

    assert.ok(org.oldestDeletedAt >= now, 'the oldest tombstone is dated, so the panel can say when it expires');
    assert.equal(typeof view.tombstoneDays, 'number', 'and the retention window is sent once, not per row');
    assert.equal(view.counts.reclaimableBytes >= org.deadBytes, true, 'the deployment total includes it');
  });
});
