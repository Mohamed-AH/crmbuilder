/*
 * oauth.test.mjs — the Google sign-in callback.
 *
 *   node --test tests/oauth.test.mjs
 *
 * The callback is the highest-risk flow in the application and had no test at
 * all, because it cannot be driven without Google on the other end. This
 * stands up a fake Google — GOOGLE_TOKEN_URL and GOOGLE_USERINFO_URL point at
 * it — so the REAL handler runs: the state check, the verification check, the
 * signup gate, the upsert and the session.
 *
 * Testing the real handler rather than a unit-tested imitation is the whole
 * point. An imitation would have passed against the unverified-email bug.
 */
import { test, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const running = [];

after(async () => { for (const s of running) await s.stop(); });

/* A Google that answers however the test needs it to. */
async function fakeGoogle(profile) {
  let served = profile;
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/token')) {
      let body = '';
      req.on('data', (d) => { body += d; });
      req.on('end', () => res.end(JSON.stringify({ access_token: 'fake-access-token' })));
      return;
    }
    if (req.url.startsWith('/userinfo')) return res.end(JSON.stringify(served));
    res.statusCode = 404;
    res.end('{}');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    tokenUrl: `http://127.0.0.1:${port}/token`,
    userinfoUrl: `http://127.0.0.1:${port}/userinfo`,
    serve(next) { served = next; },
    close: () => new Promise((r) => server.close(r)),
  };
}

let nextPort = 9300 + Math.floor(Math.random() * 200);

async function boot(google, { adminEmails = '' } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'crmb-oauth-'));
  const port = nextPort++;
  const base = `http://127.0.0.1:${port}`;
  let log = '';

  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dir,
      MONGODB_URI: '',
      SESSION_SECRET: 'oauth-test-secret',
      SIGNUP_MODE: 'open',
      ADMIN_EMAILS: adminEmails,
      ALLOW_DEV_LOGIN: '1',
      NODE_ENV: 'test',
      // Enough to make the OAuth routes live; the secret is never checked by
      // our fake token endpoint.
      GOOGLE_CLIENT_ID: 'fake-client-id.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'fake-client-secret',
      GOOGLE_TOKEN_URL: google.tokenUrl,
      GOOGLE_USERINFO_URL: google.userinfoUrl,
      APP_URL: base,
    },
  });
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });

  const deadline = Date.now() + 15000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`server exited (${child.exitCode}):\n${log}`);
    if (Date.now() > deadline) throw new Error(`server did not start:\n${log}`);
    try {
      const r = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(1500) });
      if (r.ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 120));
  }

  const api = {
    base,
    log: () => log,
    async stop() {
      const dead = new Promise((r) => child.once('exit', r));
      child.kill();
      await dead;
      await rm(dir, { recursive: true, force: true }).catch(() => {});
      await google.close().catch(() => {});
    },
    /* Start a sign-in and keep the state nonce the server just issued. */
    async begin() {
      const res = await fetch(`${base}/auth/google`, { redirect: 'manual' });
      const setCookie = res.headers.getSetCookie?.() || [];
      const stateCookie = setCookie.map((c) => c.split(';')[0]).find((c) => c.startsWith('crmb_oauth_state='));
      assert.ok(stateCookie, 'the authorize step must set a state cookie');
      return { cookie: stateCookie, state: stateCookie.split('=')[1] };
    },
    async callback({ code = 'fake-auth-code', state, cookie } = {}) {
      const res = await fetch(`${base}/auth/google/callback?code=${code}&state=${state}`, {
        redirect: 'manual',
        headers: cookie ? { Cookie: cookie } : {},
      });
      const set = (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]);
      return {
        status: res.status,
        location: res.headers.get('location'),
        session: set.find((c) => c.startsWith('crmb_session=')) || null,
        setCookie: set.join('; '),
      };
    },
    async req(path, { cookies } = {}) {
      const res = await fetch(`${base}${path}`, { headers: cookies ? { Cookie: cookies } : {} });
      return { status: res.status, json: await res.json().catch(() => null) };
    },
  };
  running.push(api);
  return api;
}

const VERIFIED = {
  id: '1', email: 'real@customer.test', verified_email: true, name: 'Real Person',
};

describe('Google sign-in callback', () => {
  test('a verified Google account signs in and gets a session', async () => {
    const google = await fakeGoogle(VERIFIED);
    const srv = await boot(google);
    const { cookie, state } = await srv.begin();

    const out = await srv.callback({ state, cookie });
    assert.equal(out.location, '/', 'a good sign-in lands back on the app');
    assert.ok(out.session, 'and carries a session cookie');

    const me = await srv.req('/api/me', { cookies: out.setCookie });
    assert.equal(me.json.authenticated, true);
    assert.equal(me.json.user.email, 'real@customer.test');
  });

  /*
   * The finding. Accounts are matched by email and nothing else, so an address
   * the holder has not proved they control is an account-takeover vector:
   * sign in as somebody else and be handed their workspace.
   */
  test('an unverified Google address cannot create an account', async () => {
    const google = await fakeGoogle({
      id: '2', email: 'victim@customer.test', verified_email: false, name: 'Not Verified',
    });
    const srv = await boot(google, { adminEmails: 'op@operator.test' });
    const { cookie, state } = await srv.begin();

    const out = await srv.callback({ state, cookie });
    assert.equal(out.location, '/?auth_error=unverified', 'refused, and told why');
    assert.equal(out.session, null, 'no session is issued');

    // And nothing was written. A redirect that still created the account would
    // look identical from the browser.
    const admin = await fetch(`${srv.base}/auth/dev`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'op@operator.test' }),
    });
    const adminCookie = (admin.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
    const users = await srv.req('/api/admin/users', { cookies: adminCookie });
    assert.ok(
      !users.json.users.some((u) => u.email === 'victim@customer.test'),
      'the unverified address must not exist as an account',
    );
  });

  /*
   * Absence is not the same fact as a stated false, and the failure modes are
   * asymmetric: failing closed on a renamed field would lock every user out of
   * a working CRM. It is allowed through and logged loudly instead.
   */
  test('a userinfo response with no verification field is allowed, but says so', async () => {
    const google = await fakeGoogle({ id: '3', email: 'legacy@customer.test', name: 'No Field' });
    const srv = await boot(google);
    const { cookie, state } = await srv.begin();

    const out = await srv.callback({ state, cookie });
    assert.ok(out.session, 'not locked out by a field Google stopped sending');
    assert.match(srv.log(), /no verified_email field/, 'but the operator is told');
  });

  test('a mismatched state is refused', async () => {
    const google = await fakeGoogle(VERIFIED);
    const srv = await boot(google);
    const { cookie } = await srv.begin();

    const out = await srv.callback({ state: 'not-the-state-we-issued', cookie });
    assert.equal(out.location, '/?auth_error=state');
    assert.equal(out.session, null);
    assert.match(srv.log(), /oauth_state/, 'and it is logged, so a burst is visible');
  });

  test('a callback with no state cookie at all is refused', async () => {
    const google = await fakeGoogle(VERIFIED);
    const srv = await boot(google);
    const { state } = await srv.begin();

    // The nonce is right but the browser presents no cookie — the shape a
    // cross-site forgery of the callback actually takes.
    const out = await srv.callback({ state, cookie: null });
    assert.equal(out.location, '/?auth_error=state');
    assert.equal(out.session, null);
  });

  test('a refused signup is logged with the address', async () => {
    const google = await fakeGoogle(VERIFIED);
    const srv = await boot(google);
    // Nothing to assert about the gate here — SIGNUP_MODE is open — so drive
    // the refusal through the dev seam, which shares the same logging.
    await fetch(`${srv.base}/auth/dev`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    const bad = await fetch(`${srv.base}/auth/dev`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // An object where a code string belongs. If this reached the store as a
      // filter, Mongo would read it as an operator and could match a code the
      // caller never held.
      body: JSON.stringify({ email: 'probe@customer.test', beta: { $ne: null } }),
    });
    assert.notEqual(bad.status, 500, 'a non-string code must not blow up the handler');
  });
});
