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

async function boot({ signupMode = 'code', adminEmails = '' } = {}) {
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
