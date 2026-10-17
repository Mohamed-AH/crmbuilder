/*
 * The seat cap — docs/SUBSCRIPTION-UX.md Phase 2 item 5, CLAUDE.md §81.
 *
 * Its own file, with its own server and `SEAT_CAP: 3`, for one reason: the cap
 * has to be FILLED to be tested, and filling the production 5 costs five
 * accounts and five joins per case. Three makes every count in here readable
 * at a glance — "two members and one pending is full" is checkable by eye,
 * where "four and one" is arithmetic nobody does while reading a diff.
 *
 * `tests/api.test.mjs` runs with the cap raised to 200 and says why: what that
 * file covers is the invite LIFECYCLE, and it mints seventeen links into one
 * org. The two files are deliberately not merged.
 *
 * Ports 9991-9999 (§9's table), one app server.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('the seat cap', () => {
  let child;
  let dataDir;
  let serverLog = '';
  /*
   * Every boot takes a FRESH port. §4: rebinding a port that was listening a
   * millisecond ago races, and the symptom surfaces several tests away from
   * the restart that caused it.
   */
  let portCursor = 9991;
  let BASE = '';
  const CAP = 3;

  const owner = jar();

  function jar() {
    let cookies = '';
    return {
      header: () => cookies,
      absorb(res) {
        const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
        for (const c of set) {
          const [pair] = c.split(';');
          const [name] = pair.split('=');
          const kept = cookies.split('; ').filter((x) => x && !x.startsWith(`${name}=`));
          kept.push(pair);
          cookies = kept.join('; ');
        }
      },
    };
  }

  async function req(path, { method = 'GET', body, cookies } = {}) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookies ? { Cookie: cookies.header() } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    if (cookies) cookies.absorb(res);
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  }

  const mint = (cookies = owner) => req('/api/org/invites', { method: 'POST', body: {}, cookies });
  const seatsNow = async (cookies = owner) => (await req('/api/org/members', { cookies })).json.seats;

  /* A fresh account, its invite redeemed, so the team grows by exactly one. */
  async function addMember(email) {
    const code = (await mint()).json.invite.code;
    const who = jar();
    await req('/auth/dev', { method: 'POST', body: { email }, cookies: who });
    const joined = await req('/api/org/join', { method: 'POST', body: { code }, cookies: who });
    assert.equal(joined.status, 200, `could not add ${email}: ${JSON.stringify(joined.json)}`);
    return who;
  }

  async function start() {
    const port = portCursor++;
    BASE = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(port),
        DATA_DIR: dataDir,
        ALLOW_DEV_LOGIN: '1',
        MONGODB_URI: '',
        SESSION_SECRET: 'seat-cap-secret',
        SIGNUP_MODE: 'open',
        NODE_ENV: 'test',
        SEAT_CAP: String(CAP),
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
  }

  /*
   * Write into the store directly, with the server stopped.
   *
   * FileStore keeps everything in memory and rewrites the whole file on save,
   * so an edit under a running server is clobbered by its next write (§12).
   * Used for exactly one thing here: planting a valid invite in a full org,
   * which the mint makes unreachable through the API by design — see the
   * invariant test below.
   */
  async function editStore(fn) {
    child.kill();
    await new Promise((r) => { child.once('exit', r); setTimeout(r, 2000); });
    const file = join(dataDir, 'store.json');
    const raw = JSON.parse(await readFile(file, 'utf8'));
    fn(raw);
    await writeFile(file, JSON.stringify(raw));
    await start();
  }

  before(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'crmb-seats-'));
    await start();
    await req('/auth/dev', { method: 'POST', body: { email: 'seat-owner@team.test' }, cookies: owner });
  });

  after(async () => {
    if (child) child.kill();
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
  });

  test('the owner occupies a seat, and the count is members plus unused invites', async () => {
    /*
     * The baseline, and it is an assertion rather than a setup step: the owner
     * counting as one of the five is what makes "up to 5 users" mean a team of
     * five rather than a team of six. Getting that wrong is off-by-one in the
     * direction that gives a seat away for free.
     */
    const fresh = await seatsNow();
    assert.deepEqual(fresh, { cap: CAP, members: 1, pending: 0, taken: 1, full: false });

    /*
     * And a minted invite takes a place immediately, BEFORE anybody redeems
     * it. That is the whole mechanism: see the hole test below for what
     * counting members alone would allow.
     */
    assert.equal((await mint()).status, 200);
    assert.deepEqual(await seatsNow(), { cap: CAP, members: 1, pending: 1, taken: 2, full: false });
  });

  test('outstanding invites cannot be minted past the cap, which is the hole in counting members alone', async () => {
    /*
     * THE test in this file. With one member and one invite already out from
     * the test above, one more mint reaches the cap and the next is refused —
     * so a workspace can never have more holders of a live link than it has
     * room for.
     *
     * Counting members alone passes every mint here (there is one member
     * against a cap of three) and ends with the team over the cap once the
     * links are redeemed. A guard that reports success, which is the shape
     * this codebase keeps finding.
     */
    assert.equal((await mint()).status, 200);
    const atCap = await seatsNow();
    assert.deepEqual(atCap, { cap: CAP, members: 1, pending: 2, taken: 3, full: true });

    const refused = await mint();
    assert.equal(refused.status, 409);
    // 409 and not 403: an owner MAY invite, so this is a state they can change
    // rather than a permission they lack — and the message has to say how.
    assert.match(refused.json.error, /full/i);
    assert.match(refused.json.error, /2 more are held by invites nobody has used yet/i);
    assert.match(refused.json.error, /Revoke one of those below, or remove someone/i);
    // The usage rides on the refusal, so a screen can redraw from it without a
    // second round trip.
    assert.deepEqual(refused.json.seats, atCap);

    // And nothing was created by the attempt.
    assert.deepEqual(await seatsNow(), atCap);
  });

  test('revoking an unused invite gives the seat back', async () => {
    /*
     * The release half, and without it the cap is a ratchet: every link ever
     * minted would hold a place for ever and a workspace that sent two and
     * changed its mind could never fill the team. Both directions matter, and
     * only one of them is the headline.
     */
    const outstanding = (await req('/api/org/invites', { cookies: owner })).json.invites
      .filter((i) => i.state === 'valid');
    assert.equal(outstanding.length, 2, 'the fixture is not where this test thinks it is');

    assert.equal((await req(`/api/org/invites/${outstanding[0].code}`, { method: 'DELETE', cookies: owner })).status, 200);
    assert.deepEqual(await seatsNow(), { cap: CAP, members: 1, pending: 1, taken: 2, full: false });

    // And the seat is usable, not merely counted.
    assert.equal((await mint()).status, 200);
    assert.equal((await seatsNow()).full, true);
  });

  test('the mint makes a full team with a live invite UNREACHABLE, which is why the join check needs a planted one', async () => {
    /*
     * The invariant, stated as an assertion because it is the thing that makes
     * the mint sufficient — and because the first version of the join test
     * below was built without it and passed for the wrong reason.
     *
     * `members + pending <= cap` holds at every mint, and a join moves one
     * seat from `pending` to `members` without changing the total. So if
     * `members == cap` then `pending == 0`: a full team cannot have a live
     * invite outstanding. Which means the join refusal is **not reachable
     * through the API at all** for links minted under this cap.
     *
     * That is a good property and a testing problem. The join check exists for
     * invites minted BEFORE the cap shipped, and the only honest way to build
     * one is to put it in the store — which the next test does.
     */
    const boss = jar();
    await req('/auth/dev', { method: 'POST', body: { email: 'seat-inv@team.test' }, cookies: boss });

    // Fill it to the cap by whatever mix of members and invites, and assert
    // the pair can never both be non-zero at the top.
    const c1 = (await mint(boss)).json.invite.code;
    const c2 = (await mint(boss)).json.invite.code;
    assert.equal((await mint(boss)).status, 409, 'one member and two invites is the cap');

    const a = jar();
    await req('/auth/dev', { method: 'POST', body: { email: 'seat-inv-a@team.test' }, cookies: a });
    assert.equal((await req('/api/org/join', { method: 'POST', body: { code: c1 }, cookies: a })).status, 200);
    const mid = await seatsNow(boss);
    assert.deepEqual(mid, { cap: CAP, members: 2, pending: 1, taken: 3, full: true });

    const b = jar();
    await req('/auth/dev', { method: 'POST', body: { email: 'seat-inv-b@team.test' }, cookies: b });
    assert.equal((await req('/api/org/join', { method: 'POST', body: { code: c2 }, cookies: b })).status, 200);

    const top = await seatsNow(boss);
    assert.deepEqual(top, { cap: CAP, members: 3, pending: 0, taken: 3, full: true });
    assert.equal(top.pending, 0, 'a full team is holding a live invite, so the mint invariant is broken');
  });

  test('a PLANTED invite — one minted before the cap existed — is refused at the join', async () => {
    /*
     * The authoritative check, and the only way to reach it (see the invariant
     * above). Every invite in flight on the day this shipped was minted
     * without a cap check, so a workspace at the cap could be carrying links
     * that would take it over — and the mint can say nothing about those.
     *
     * Planted directly in the store, which is what a pre-cap invite IS: a row
     * with no mint-time check behind it.
     */
    const boss = jar();
    await req('/auth/dev', { method: 'POST', body: { email: 'seat-pre@team.test' }, cookies: boss });
    const orgId = (await req('/api/org', { cookies: boss })).json.org.id;

    // Fill the team to the cap the ordinary way.
    const codes = [(await mint(boss)).json.invite.code, (await mint(boss)).json.invite.code];
    for (const [i, code] of codes.entries()) {
      const who = jar();
      await req('/auth/dev', { method: 'POST', body: { email: `seat-pre-${i}@team.test` }, cookies: who });
      assert.equal((await req('/api/org/join', { method: 'POST', body: { code }, cookies: who })).status, 200);
    }
    assert.deepEqual(await seatsNow(boss), { cap: CAP, members: 3, pending: 0, taken: 3, full: true });

    // Now plant the link the mint would refuse to issue today.
    const PLANTED = 'planted-pre-cap-invite-code';
    await editStore((raw) => {
      /*
       * An ARRAY, not a keyed object — `getInvite` is a `.find()` over it. The
       * first version of this wrote `raw.invites[PLANTED] = …`, which on an
       * array sets a named property that `.find()` never visits: the plant
       * succeeded, the file looked right, and the invite did not exist. Caught
       * by the validity assertion below rather than by reading, which is why
       * that assertion is there.
       */
      raw.invites = raw.invites || [];
      raw.invites.push({
        code: PLANTED,
        orgId,
        role: 'member',
        createdBy: 'seat-pre@team.test',
        createdAt: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        usedBy: null,
        usedAt: null,
        revokedAt: null,
      });
    });

    // It is a real, valid invite — asserted, or the refusal below could be
    // the ordinary "not valid" one and the test would prove nothing.
    const joiner = jar();
    await req('/auth/dev', { method: 'POST', body: { email: 'seat-pre-late@team.test' }, cookies: joiner });
    const preview = await req(`/api/org/invites/${PLANTED}/preview`, { cookies: joiner });
    assert.equal(preview.status, 200, 'the planted invite is not valid, so this tests the wrong refusal');

    const out = await req('/api/org/join', { method: 'POST', body: { code: PLANTED }, cookies: joiner });
    assert.equal(out.status, 409);
    assert.match(out.json.error, /That team is full/i);

    /*
     * THE WORDING IS THE FINDING. One rule, two audiences: the owner can
     * revoke an invite or remove a member, and the joiner can do neither — so
     * the mint's message shown here would be instructions addressed to the
     * wrong person. §53 records the same shape where a provider's refusal
     * reaches a customer.
     */
    assert.match(out.json.error, /Ask whoever invited you/i);
    assert.match(out.json.error, /your link still works once they have/i);
    assert.doesNotMatch(out.json.error, /Revoke/i);
    assert.doesNotMatch(out.json.error, /remove someone/i);
    // And no count of a team they are not on — somebody else's size is not
    // the joiner's business.
    assert.doesNotMatch(out.json.error, /\b3\b/);

    /*
     * The refusal did not SPEND the link, which is the ordering that makes
     * that promise true: the check sits above the `updateInvite`. Refusing
     * after it would burn a credential on a failure and strand them for good.
     */
    assert.equal((await req(`/api/org/invites/${PLANTED}/preview`, { cookies: joiner })).status, 200,
      'the refused invite was spent, so the message promises something false');

    // Make room, and the SAME link works — the whole of what was promised.
    const members = (await req('/api/org/members', { cookies: boss })).json.members;
    const go = members.find((m) => m.email === 'seat-pre-1@team.test');
    assert.equal((await req(`/api/org/members/${go.id}`, { method: 'DELETE', cookies: boss })).status, 200);
    assert.equal((await req('/api/org/join', { method: 'POST', body: { code: PLANTED }, cookies: joiner })).status, 200);
    assert.equal((await seatsNow(boss)).members, 3);
  });

  test('every role is told where the team stands, not only an owner', async () => {
    /*
     * `seats` rides on the member list, which every role may read. A member
     * cannot invite and gets no button, but "how many of us can there be" is a
     * fact about the team they are on rather than an administrative secret —
     * and the member list beside it already discloses more.
     *
     * The seat count must be the same figure for both, or the two are reading
     * different tables (§33).
     */
    const boss = jar();
    await req('/auth/dev', { method: 'POST', body: { email: 'seat4-owner@team.test' }, cookies: boss });
    const code = (await mint(boss)).json.invite.code;
    const colleague = jar();
    await req('/auth/dev', { method: 'POST', body: { email: 'seat4-member@team.test' }, cookies: colleague });
    assert.equal((await req('/api/org/join', { method: 'POST', body: { code }, cookies: colleague })).status, 200);

    const asOwner = await seatsNow(boss);
    const asMember = await seatsNow(colleague);
    assert.deepEqual(asOwner, { cap: CAP, members: 2, pending: 0, taken: 2, full: false });
    assert.deepEqual(asMember, asOwner);

    // And a member still cannot mint, which is the existing rule rather than
    // this one — asserted so the disclosure above is not read as permission.
    assert.equal((await mint(colleague)).status, 403);
  });

  test('a disabled member still holds their seat', async () => {
    /*
     * `listUsers` includes disabled accounts and the count uses it on purpose.
     * A paused member still occupies a place on the team, is still on the Team
     * screen, and is re-enabled with one click — so excluding them would make
     * the cap something an owner walks around by disabling somebody, which is
     * a bypass dressed as an administrative action.
     *
     * The platform admin is the FIRST account on a deployment (§21, §39), and
     * that is seat-owner@team.test from `before` — so this drives the admin
     * route as that account against a member of a later org.
     */
    const boss = jar();
    await req('/auth/dev', { method: 'POST', body: { email: 'seat5-owner@team.test' }, cookies: boss });
    const code = (await mint(boss)).json.invite.code;
    const sleeper = jar();
    const who = await req('/auth/dev', { method: 'POST', body: { email: 'seat5-paused@team.test' }, cookies: sleeper });
    assert.equal((await req('/api/org/join', { method: 'POST', body: { code }, cookies: sleeper })).status, 200);
    assert.equal((await seatsNow(boss)).members, 2);

    const patched = await req(`/api/admin/users/${who.json.user.id}`, {
      method: 'PATCH', body: { disabled: true }, cookies: owner,
    });
    assert.equal(patched.status, 200, `could not disable: ${JSON.stringify(patched.json)}`);

    assert.equal((await seatsNow(boss)).members, 2, 'disabling a member gave their seat away');
  });
});
