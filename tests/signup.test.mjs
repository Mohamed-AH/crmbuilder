/*
 * signup.test.mjs — who is allowed to create an account.
 *
 *   node --test tests/signup.test.mjs
 *
 * SIGNUP_MODE is process-wide, so each mode gets its own server rather than
 * being toggled underneath one. The Google callback cannot be driven from a
 * test — there is no Google to answer — so the gate is exercised through
 * /auth/dev, which runs the identical check for the identical reason.
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

let nextPort = 8800 + Math.floor(Math.random() * 400);

async function boot({ signupMode = 'code', adminEmails = '', backupToken = '', webhook = '' } = {}) {
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
