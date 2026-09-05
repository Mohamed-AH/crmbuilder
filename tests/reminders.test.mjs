/*
 * reminders.test.mjs — the daily pass, its gates, and what it would say.
 *
 * THE SUITE IS SPLIT, and for a reason this codebase has now hit twice.
 *
 * A workspace webhook goes through lib/safe-fetch.js, which refuses loopback —
 * so a local capture server CANNOT receive one, and adding a bypass so it
 * could is exactly the weakening §30 refused for the feedback webhook. So:
 *
 *   - the PASS MECHANICS (gates, the once-per-local-day rule, mark-before-send,
 *     the skip reasons that bound the scan) are driven through the real
 *     endpoints and read back out of the store. No delivery needed.
 *   - the MESSAGE WORDING is read off the preview, which returns the exact
 *     string that would be sent. That is the honest product answer as well as
 *     the seam that makes it testable.
 *   - the PAYLOAD SHAPE (allowed_mentions, and mentions surviving a real
 *     round trip) is checked against a capture server through the ENV webhook,
 *     which is unrestricted by design and shares one payload builder.
 *
 * Ports 9700-9750 — blocks are disjoint per file, see the table in §9.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import http from 'node:http';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DR = createRequire(import.meta.url)('../js/date-rules.js');

// A fresh port per boot (§4): rebinding one that was listening a moment ago
// races, and on Windows the new listener loses.
const PORT = 9700 + Math.floor(Math.random() * 30);
const CAPTURE_PORT = 9735 + Math.floor(Math.random() * 15);
const BASE = `http://127.0.0.1:${PORT}`;

let child = null;
let dataDir = null;
let serverLog = '';
let capture = null;
let captured = [];

function jar() {
  const cookies = new Map();
  return {
    header() { return [...cookies].map(([k, v]) => `${k}=${v}`).join('; '); },
    absorb(res) {
      for (const raw of res.headers.getSetCookie?.() || []) {
        const [pair] = raw.split(';');
        const i = pair.indexOf('=');
        cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
      }
    },
  };
}

async function req(path, { cookies, method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    redirect: 'manual',
    headers: { 'Content-Type': 'application/json', ...(cookies ? { Cookie: cookies.header() } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  if (cookies) cookies.absorb(res);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text };
}

// Safe to read while the server runs: every save is a temp file plus an atomic
// rename (§30), so a reader gets the whole old file or the whole new one.
async function meta(wsId) {
  const raw = JSON.parse(await readFile(join(dataDir, 'store.json'), 'utf8'));
  return (raw.data || {})[wsId] || {};
}

// A calendar day `offset` days from today in a named zone. Exact: day numbers
// are UTC midnights, so adding whole days cannot drift across a DST change.
function dayIn(zone, offset) {
  const [y, m, d] = DR.dayKey(zone, new Date()).split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d) + offset * 86400000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`;
}

before(async () => {
  captured = [];
  capture = http.createServer((rq, rs) => {
    const chunks = [];
    rq.on('data', (c) => chunks.push(c));
    rq.on('end', () => {
      captured.push(Buffer.concat(chunks).toString('utf8'));
      rs.writeHead(200, { 'Content-Type': 'application/json' });
      rs.end('{"ok":true}');
    });
  });
  await new Promise((r) => capture.listen(CAPTURE_PORT, '127.0.0.1', r));

  dataDir = await mkdtemp(join(tmpdir(), 'crmb-remind-'));
  child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATA_DIR: dataDir,
      ALLOW_DEV_LOGIN: '1',
      MONGODB_URI: '',
      SESSION_SECRET: 'reminder-test-secret',
      SIGNUP_MODE: 'open',
      NODE_ENV: 'test',
      // The pass is normally rate-limited so a burst of keep-warm pings costs
      // one scan. These tests drive it deliberately, so the gap is off and the
      // once-per-LOCAL-DAY rule is the thing under test.
      REMIND_MIN_GAP_MS: '0',
      // The env-supplied webhook is unrestricted by design (§30) — a capture
      // server on loopback is the whole reason that decision was made.
      FEEDBACK_WEBHOOK_URL: `http://127.0.0.1:${CAPTURE_PORT}/capture`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => { serverLog += d; });
  child.stderr.on('data', (d) => { serverLog += d; });

  const deadline = Date.now() + 20000;
  for (;;) {
    if (Date.now() > deadline) throw new Error(`server did not start:\n${serverLog}`);
    try { if ((await fetch(`${BASE}/healthz`, { signal: AbortSignal.timeout(1500) })).ok) break; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 120));
  }
});

after(async () => {
  if (child) { const dead = new Promise((r) => child.once('exit', r)); child.kill(); await dead; }
  if (capture) await new Promise((r) => capture.close(r));
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

/*
 * A workspace with something due, a webhook, and reminders switched on.
 * `hour: 0` so the morning gate is open whatever time the suite runs; the gate
 * itself gets its own test with hour 23.
 */
async function seed(email, { zone = 'UTC', enabled = true, hook = true, hour = 0, due = true, name = 'Seed Co' } = {}) {
  const cookies = jar();
  const me = await req('/auth/dev', { method: 'POST', body: { email }, cookies });
  const wsId = me.json.user.orgId;

  await req('/api/sync', {
    method: 'POST',
    cookies,
    body: {
      since: 0,
      settings: { currency: 'USD', businessName: name, timezone: zone, remind: { enabled, days: 7, hour } },
      settingsUpdatedAt: Date.now(),
      modules: [{
        id: `${wsId}-m`,
        updatedAt: 1000,
        doc: {
          id: `${wsId}-m`,
          name: 'Invoices',
          fields: [
            { key: 'name', label: 'Reference', type: 'text', showInList: true },
            { key: 'due', label: 'Due', type: 'date', showInList: true },
          ],
        },
      }],
      records: due ? [
        { id: `${wsId}-r1`, updatedAt: 1000, doc: { id: `${wsId}-r1`, moduleId: `${wsId}-m`, data: { name: 'A', due: dayIn(zone, -1) } } },
        { id: `${wsId}-r2`, updatedAt: 1000, doc: { id: `${wsId}-r2`, moduleId: `${wsId}-m`, data: { name: 'B', due: dayIn(zone, 2) } } },
      ] : [
        { id: `${wsId}-r1`, updatedAt: 1000, doc: { id: `${wsId}-r1`, moduleId: `${wsId}-m`, data: { name: 'A', due: dayIn(zone, 90) } } },
      ],
    },
  });

  if (hook) {
    // Refused at delivery (the guard will not dial a name that resolves
    // nowhere) but STORED, because an unresolvable host is a property of the
    // moment rather than of the URL (§38). That is what these tests need: a
    // configured destination whose sends deterministically fail.
    await req('/api/org/hook', { method: 'PUT', body: { url: 'https://hooks.example.invalid/services/T/B/XYZ' }, cookies });
  }
  return { cookies, wsId };
}

const runPass = (cookies) => req('/api/admin/reminders/run', { method: 'POST', body: {}, cookies });

describe('the daily pass and its gates', () => {
  let admin = null;

  before(async () => {
    // The first account on a deployment that names nobody is the platform
    // admin (§21), so this has to be created before any other sign-in.
    admin = jar();
    await req('/auth/dev', { method: 'POST', body: { email: 'ops@remind.test' }, cookies: admin });
  });

  test('a workspace with reminders off is never scanned', async () => {
    const { wsId } = await seed('off@remind.test', { enabled: false });
    await runPass(admin);
    assert.equal((await meta(wsId)).reminded, undefined,
      'a disabled workspace must not even have its day marked — the switch is the cheapest gate and it comes first');
  });

  test('a workspace with no webhook is never scanned', async () => {
    const { wsId } = await seed('nohook@remind.test', { hook: false });
    await runPass(admin);
    assert.equal((await meta(wsId)).reminded, undefined,
      'with nowhere to send, the records collection must not be read at all');
  });

  test('a pass marks the workspace own local day and records what it found', async () => {
    const { wsId } = await seed('go@remind.test');
    await runPass(admin);
    const m = await meta(wsId);
    assert.ok(m.reminded, 'the pass did not run');
    assert.equal(m.reminded.lastRunOn, DR.dayKey('UTC', new Date()));
    assert.equal(m.reminded.lastCount, 2, 'one overdue and one upcoming');
    assert.equal(m.reminded.lastZone, 'UTC');
  });

  /*
   * THE MARK GOES IN BEFORE THE SEND, and this is the test that pins it.
   *
   * The destination here always fails. Marking afterwards would retry on every
   * ping, and a destination that fails slowly turns one digest into a channel
   * full of them — spamming a team channel is worse than missing a day.
   */
  test('a failed delivery still consumes the day rather than retrying all afternoon', async () => {
    const { wsId } = await seed('fails@remind.test');
    await runPass(admin);
    const first = await meta(wsId);
    assert.ok(first.reminded.lastRunOn, 'the day was not marked');
    assert.ok(first.hook.lastError, 'the failure has to be visible to the owner somewhere');

    await runPass(admin);
    const second = await meta(wsId);
    assert.equal(second.reminded.lastRunAt, first.reminded.lastRunAt,
      'the same local day must not be scanned or sent twice');
  });

  test('nothing due marks the day and says nothing', async () => {
    const { wsId } = await seed('quiet@remind.test', { due: false });
    await runPass(admin);
    const m = await meta(wsId);
    assert.equal(m.reminded.lastCount, 0);
    // A daily "all clear" is the fastest way to teach a channel to ignore
    // this — §25's escalate-only lesson, in a new place.
    assert.equal(m.hook.lastOkAt || 0, 0, 'a quiet day must not produce a message');
  });

  /*
   * The morning gate, made deterministic without mocking a clock: hour 23 in
   * a zone that is currently earlier than 23:00 cannot have arrived yet, and
   * the pass has to leave the day unmarked so it can run later.
   */
  test('before the workspace own morning, nothing runs and the day stays open', async () => {
    // Pick a zone where it is demonstrably not yet 23:00 right now.
    const zone = ['UTC', 'Asia/Tokyo', 'America/Los_Angeles', 'Pacific/Auckland']
      .find((z) => DR.zoneParts(z, new Date()).hour < 23);
    assert.ok(zone, 'no candidate zone was before 23:00 — widen the list');

    const { wsId } = await seed('early@remind.test', { zone, hour: 23 });
    await runPass(admin);
    assert.equal((await meta(wsId)).reminded, undefined,
      'the day must stay unmarked, or the digest is lost for good rather than merely delayed');
  });

  test('the pass records what it did, for an operator to look at', async () => {
    const { json } = await runPass(admin);
    assert.equal(json.ok, true);
    assert.equal(typeof json.pass.workspaces, 'number');
    assert.equal(typeof json.pass.ms, 'number');
    assert.ok(json.pass.workspaces > 0);
  });

  test('only a platform admin can force a pass', async () => {
    const { cookies } = await seed('nosy@remind.test', { enabled: false, hook: false });
    assert.equal((await runPass(cookies)).status, 403);
  });

  /*
   * The real mechanism, not the test hatch. §25 records why the alert loop
   * runs for EVERY caller of /health rather than only an authenticated one:
   * the keep-warm ping is the only regular caller there is, so gating it means
   * nothing ever fires. The same argument applies here, so it is worth one
   * test that the ping itself does the work.
   */
  test('the keep-warm ping drives it, with no scheduler and no authentication', async () => {
    const { wsId } = await seed('ping@remind.test');
    assert.equal((await meta(wsId)).reminded, undefined);

    const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(5000) });
    assert.equal(res.ok, true);
    // Fire-and-forget after the response, so it is not done when /health
    // answers — which is the property that keeps the probe fast.
    const deadline = Date.now() + 8000;
    let marked = null;
    while (Date.now() < deadline && !marked) {
      marked = (await meta(wsId)).reminded;
      if (!marked) await new Promise((r) => setTimeout(r, 120));
    }
    assert.ok(marked, 'the /health ping did not drive a pass');
  });
});

describe('what the digest would say', () => {
  /*
   * Read off the preview, which returns the exact string. The workspace
   * webhook cannot reach a capture server (the guard refuses loopback and a
   * bypass is the weakening §30 declined), so this is the seam — and showing
   * an owner the real message before it goes out is the better product answer
   * regardless.
   */
  test('counts by module, never record names, and a way back to the app', async () => {
    const { cookies } = await seed('text@remind.test', { name: 'Lumen Studio' });
    const { json } = await req('/api/org/reminders', { cookies });
    const msg = json.reminders.message;

    assert.match(msg, /Lumen Studio/);
    assert.match(msg, /2 items need attention/);
    assert.match(msg, /Invoices: 1 overdue, 1 due within 7 days/);
    assert.match(msg, /http/, 'the message has to say where to go');
    for (const name of ['A', 'B']) {
      assert.ok(!new RegExp(`\\b${name}\\b`).test(msg.replace(/Lumen Studio/g, '')),
        'record names must not reach a chat channel');
    }
  });

  test('one item reads as one item', async () => {
    const { cookies, wsId } = await seed('single@remind.test');
    await req('/api/sync', {
      method: 'POST',
      cookies,
      body: { since: 0, records: [{ id: `${wsId}-r2`, updatedAt: Date.now(), deleted: true, deletedAt: Date.now() }] },
    });
    const { json } = await req('/api/org/reminders', { cookies });
    assert.match(json.reminders.message, /1 item needs attention/);
  });

  test('nothing due produces no message at all, rather than an empty one', async () => {
    const { cookies } = await seed('none@remind.test', { due: false });
    const { json } = await req('/api/org/reminders', { cookies });
    assert.equal(json.reminders.total, 0);
    assert.equal(json.reminders.message, '');
  });

  /*
   * A module name is text a customer chose, and it lands in somebody's chat
   * channel. Slack turns `<!channel>` into a notification for everyone in the
   * room; Discord does the same with a bare `@everyone`.
   */
  test('a module named to wake a whole channel cannot', async () => {
    const { cookies, wsId } = await seed('shouty@remind.test', { name: '@everyone Ltd' });
    await req('/api/sync', {
      method: 'POST',
      cookies,
      body: {
        since: 0,
        modules: [{
          id: `${wsId}-m`,
          updatedAt: Date.now(),
          doc: {
            id: `${wsId}-m`,
            name: '<!channel> @here urgent',
            fields: [
              { key: 'name', label: 'Reference', type: 'text', showInList: true },
              { key: 'due', label: 'Due', type: 'date', showInList: true },
            ],
          },
        }],
      },
    });

    const { json } = await req('/api/org/reminders', { cookies });
    const msg = json.reminders.message;
    assert.ok(!/<!channel>/.test(msg), 'Slack would notify the whole channel');
    assert.ok(!/(^|[^​])@here\b/.test(msg), '@here survived intact');
    assert.ok(!/(^|[^​])@everyone\b/.test(msg), '@everyone survived intact');
    // Still readable — the point is inert, not censored.
    assert.match(msg, /channel/);
    assert.match(msg, /urgent/);
  });
});

describe('the payload a provider actually receives', () => {
  /*
   * Through the ENV webhook, which is unrestricted by design (§30) and shares
   * one payload builder with the workspace path. That is what makes the shape
   * checkable end to end without weakening the guard on the customer-chosen
   * destination.
   */
  test('it tells Discord to notify nobody', async () => {
    captured = [];
    const cookies = jar();
    await req('/auth/dev', { method: 'POST', body: { email: 'payload@remind.test' }, cookies });
    await req('/api/feedback', { method: 'POST', body: { message: 'hello @everyone <!channel>' }, cookies });

    const deadline = Date.now() + 8000;
    while (Date.now() < deadline && !captured.length) await new Promise((r) => setTimeout(r, 100));
    assert.ok(captured.length, 'the capture server received nothing');

    const body = JSON.parse(captured[0]);
    // Discord's own switch for "this message notifies nobody". The text
    // mangling is the belt for providers that do not offer one; this is the
    // real control, and Slack ignores the unknown field.
    assert.deepEqual(body.allowed_mentions, { parse: [] });
    assert.ok(body.content, 'Discord reads content');
    assert.ok(body.text, 'Slack reads text');
  });
});
