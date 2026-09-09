/*
 * resilience.test.mjs — the server survives a write it cannot make.
 *
 * Reported from a Windows machine as a full E2E run dying at test 33:
 *
 *   Error: EPERM: operation not permitted, rename
 *     'data\e2e\store.json.20680.tmp' -> 'data\e2e\store.json'
 *       at FileStore.save (server.js)
 *       at applyPush (server.js)
 *   Node.js v24.18.1        <- the process, gone
 *
 * TWO FAULTS, and only the second is about Windows.
 *
 *   1. Express 4 does not catch a rejected promise from an `async` handler, so
 *      it became an unhandled rejection and Node exited. There are 48 async
 *      routes here plus an async `requireAuth`, so this was never specific to
 *      renaming — a Mongo hiccup or a full disk kills the deployment the same
 *      way, and the file store is what a deployment falls back to when
 *      MONGODB_URI is unset (§28).
 *   2. rename(2) on Windows fails EPERM/EACCES/EBUSY while anything holds the
 *      destination, which clears on its own in milliseconds.
 *
 * Fault 1 is reproduced on Linux below, which is what says it is not a
 * platform artifact (§9's triage rule, coming out the other way for once).
 *
 * Ports 9900-9950 — blocks are disjoint per file, see the table in §9.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm, chmod, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 9900 + Math.floor(Math.random() * 40);
const BASE = `http://127.0.0.1:${PORT}`;

let child = null;
let dataDir = null;
let serverLog = '';
const cookies = new Map();

async function req(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/json',
      ...(cookies.size ? { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  for (const raw of res.headers.getSetCookie?.() || []) {
    const [pair] = raw.split(';');
    const i = pair.indexOf('=');
    cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text };
}

/*
 * Make the store impossible to replace, and PROVE it rather than assume it.
 *
 * THREE mechanisms, because which one works depends on the platform and on who
 * the suite runs as, and no one of them covers the others:
 *
 *   chmod(dir, 0o500)    stops an ordinary user — which is CI; root walks through
 *   chattr +i            stops root, and needs root to set; Linux only
 *   chmod(file, 0o444)   stops WINDOWS, and is inert on POSIX
 *
 * Each is tried, then VERIFIED by attempting a real replace — a setup that
 * silently did nothing gives a test that passes and proves nothing. If none of
 * them blocks anything the tests SKIP with the reason said out loud (§4's
 * SIGTERM precedent — a platform limit named rather than quietly asserted
 * around).
 *
 * All three produce EPERM or EACCES, which is the same errno class Windows
 * raises, so the retry under test is the retry that runs in production.
 */
async function blockStoreWrites() {
  const file = join(dataDir, 'store.json');

  await chmod(dataDir, 0o500);
  if (!(await canReplace(file))) {
    return async () => { await chmod(dataDir, 0o700); };
  }
  await chmod(dataDir, 0o700);

  const done = spawnSync('chattr', ['+i', file]);
  if (done.status === 0 && !(await canReplace(file))) {
    return async () => { spawnSync('chattr', ['-i', file]); };
  }
  if (done.status === 0) spawnSync('chattr', ['-i', file]);

  /*
   * The WINDOWS one, and the reason it is here at all.
   *
   * Neither branch above works there — chmod on a directory does not stop a
   * file being created inside it, and chattr does not exist — so on the one
   * platform fault 2 was written for, all four tests skipped and the retry
   * went unverified. A skip that reads as fine while proving nothing.
   *
   * `fs.chmod(file, 0o444)` sets FILE_ATTRIBUTE_READONLY, and MoveFileEx with
   * REPLACE_EXISTING onto a read-only destination fails ACCESS_DENIED — the
   * same errno class Windows raises for the real fault. On POSIX it is inert:
   * rename keys on the DIRECTORY's permissions, not the destination file's,
   * so this branch is measured not to block here and is skipped over. That
   * costs nothing, because every mechanism is verified by attempting a real
   * replace rather than trusted.
   */
  await chmod(file, 0o444);
  if (!(await canReplace(file))) {
    return async () => { await chmod(file, 0o666); };
  }
  await chmod(file, 0o666);
  return null;
}

// Does a rename onto the store still succeed? Measured, because a test whose
// setup silently did nothing passes and proves nothing.
async function canReplace(file) {
  const probe = `${file}.probe`;
  try {
    await writeFile(probe, '{}');
  } catch {
    return false; // could not even stage it, so the directory is closed
  }
  try {
    const { renameSync } = await import('node:fs');
    renameSync(probe, `${file}.probe2`);
    await rm(`${file}.probe2`, { force: true });
    // Staging worked; the question is whether the STORE can be replaced.
    const second = `${file}.probe3`;
    await writeFile(second, '{}');
    renameSync(second, file);
    return true;
  } catch {
    await rm(probe, { force: true }).catch(() => {});
    await rm(`${file}.probe3`, { force: true }).catch(() => {});
    return false;
  }
}

const push = (id) => req('/api/sync', {
  method: 'POST',
  body: {
    since: 0,
    records: [{ id, updatedAt: Date.now(), doc: { id, moduleId: 'm1', data: { title: id } } }],
  },
});

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'crmb-resilience-'));
  child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATA_DIR: dataDir,
      ALLOW_DEV_LOGIN: '1',
      MONGODB_URI: '',
      SESSION_SECRET: 'resilience-secret',
      SIGNUP_MODE: 'open',
      NODE_ENV: 'test',
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

  await req('/auth/dev', { method: 'POST', body: { email: 'resilient@team.test' } });
  // A write that works, so a later failure is the block rather than the setup.
  assert.equal((await push('baseline')).status, 200);
});

after(async () => {
  if (child) { const dead = new Promise((r) => child.once('exit', r)); child.kill(); await dead; }
  if (dataDir) {
    // Undo all three blocks before removing the directory: a read-only file
    // left behind is one Windows will refuse to delete, so the temp directory
    // would survive the run and accumulate.
    await chmod(dataDir, 0o700).catch(() => {});
    spawnSync('chattr', ['-i', join(dataDir, 'store.json')]);
    await chmod(join(dataDir, 'store.json'), 0o666).catch(() => {});
    await rm(dataDir, { recursive: true, force: true });
  }
});

describe('a write the server cannot make', () => {
  test('answers 500 and leaves the server running', async (t) => {
    const unblock = await blockStoreWrites();
    if (!unblock) {
      t.skip('nothing here could make a write fail: chmod, chattr and the read-only attribute all left it replaceable');
      return;
    }
    try {
      const out = await push('while-blocked');
      /*
       * THE ASSERTION THIS FILE EXISTS FOR. Before the fix this request was
       * never answered at all: the rejection escaped the async handler, Node
       * exited, and the connection died mid-flight.
       */
      assert.equal(out.status, 500, 'a failed write must be an answer, not an exit');

      // Still serving. `/healthz` does nothing but answer, so this is the
      // process being alive rather than any particular route working.
      const alive = await fetch(`${BASE}/healthz`, { signal: AbortSignal.timeout(5000) });
      assert.equal(alive.status, 200, 'the server died on a write it could not make');
      assert.equal(child.exitCode, null, `the process exited (${child.exitCode})`);
    } finally {
      await unblock();
    }
  });

  test('and says nothing about where the store lives', async (t) => {
    const unblock = await blockStoreWrites();
    if (!unblock) {
      t.skip('nothing here could make a write fail: chmod, chattr and the read-only attribute all left it replaceable');
      return;
    }
    try {
      const out = await push('quiet-failure');
      /*
       * §30's non-leaking handler, and this is the first error that would
       * genuinely have had something to leak: an ENOSPC or EPERM message
       * carries the absolute path of the data directory.
       */
      assert.deepEqual(out.json, { error: 'Something went wrong.' });
      assert.ok(!out.text.includes(dataDir), 'the response named the server filesystem');
      assert.ok(!out.text.includes('EPERM') && !out.text.includes('EACCES'));
      // On the log, though — expected is not the same as uninteresting (§40).
      assert.ok(/EPERM|EACCES/.test(serverLog), 'the failure left no trace anywhere');
    } finally {
      await unblock();
    }
  });

  test('recovers once the write is possible again', async (t) => {
    const unblock = await blockStoreWrites();
    if (!unblock) {
      t.skip('nothing here could make a write fail: chmod, chattr and the read-only attribute all left it replaceable');
      return;
    }
    await push('during-outage').catch(() => {});
    await unblock();
    assert.equal((await push('after-outage')).status, 200,
      'a workspace stayed broken after the thing blocking it went away');
  });

  /*
   * The Windows half. A held destination clears on its own, so save() waits it
   * out rather than turning a millisecond of Defender into a 500.
   *
   * The proof is the TIMING, not the status: the block is lifted 120ms after
   * the request goes out, so a save that succeeded on its first attempt would
   * have answered before then. Arriving afterwards is what says it waited.
   */
  test('a transient block is waited out rather than failed', async (t) => {
    const unblock = await blockStoreWrites();
    if (!unblock) {
      t.skip('nothing here could make a write fail: chmod, chattr and the read-only attribute all left it replaceable');
      return;
    }
    const started = Date.now();
    const inFlight = push('transient');
    const lifted = setTimeout(() => { unblock().catch(() => {}); }, 120);
    let out;
    try {
      out = await inFlight;
    } finally {
      clearTimeout(lifted);
      await unblock().catch(() => {});
    }
    assert.equal(out.status, 200, 'a block that cleared on its own was still reported as a failure');
    assert.ok(Date.now() - started >= 120,
      'it answered before the block was lifted, so nothing was actually retried');
  });

  test('a failed save leaves no temp file behind', async () => {
    const left = (await readdir(dataDir)).filter((n) => n.endsWith('.tmp'));
    // One stale temp per failure would accumulate in the directory holding
    // every customer's records.
    assert.deepEqual(left, []);
  });
});
