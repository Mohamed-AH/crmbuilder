# CRM Builder — working notes

Context for anyone (human or agent) picking this up mid-stream. Read this
before changing code; it records decisions and traps that are not obvious from
the source, and it is the safe restart point after a context compaction.

**Branch:** `claude/pwa-modular-crm-builder-xcwgzv` — all work goes here.
**Live:** https://crmbuilder-v1.onrender.com

---

## 1. What this is

A modular CRM for small businesses. Offline-first installable PWA, plus a small
Express backend for Google OAuth sign-in, workspace sync to MongoDB, and admin.
No build step, no frontend framework — plain ES5-ish scripts loaded in order by
`index.html`.

```
server.js             Express: static PWA, OAuth, /api/sync + /api/data, /api/admin/*, /api/org, /health
index.html            app shell (script order matters — see §3)
css/style.css         Inter + blue/slate palette, light/dark, desktop-first
js/icons.js           inline Lucide SVGs (generated — see §6)
js/scope.js           whose data is this — storage scopes (see §11)
js/db.js              IndexedDB wrapper, one database per scope
js/csv.js             RFC 4180 CSV reader/writer
js/templates.js       prebuilt module templates
js/demo-data.js       fictional business (generated — see §6)
js/tour.js            guided walkthrough engine (no dependencies)
js/cloud.js           account + sync layer, server ⇄ local fallback
js/app.js             router, all views, module builder, kanban, admin, tour steps
sw.js                 service worker (BUMP CACHE_VERSION on any asset change)
tests/                smoke, API contract, CSV unit, Playwright E2E
docs/                 user guide, onboarding playbook, demo script, architecture
```

---

## 2. Current status

**All green:** 87 Node tests + 47 Playwright tests.

```sh
npm install
npm test                # everything
npm run test:api        # spawns its own server on a random port
npm run test:e2e        # Playwright boots its own server
npm run test:smoke      # deployment audit, localhost
BASE_URL=https://crmbuilder-v1.onrender.com npm run test:smoke   # audit live
```

CI (`.github/workflows/test.yml`) runs everything on push and smoke-tests the
live URL (defaults to crmbuilder-v1; override with the `LIVE_URL` repo variable).

### Shipped
- Modules/fields/records, table + kanban views, type-aware column sorting
- CSV import (column mapping, inline field creation, type coercion) and export
- Google OAuth, full offline operation
- **Per-record delta sync** with tombstoned deletes — see §10
- **Storage scopes**: one local store per identity, so a shared device cannot
  cross-contaminate and demo data cannot sync — see §11
- **Shared team workspaces**: org-owned workspaces (stage A) and invite links
  (stage B) — see §5 and §13
- Admin dashboard with analytics; **organisations with per-tenant scoping**
- **Pooled and dedicated deployment blueprints** (`render.yaml`,
  `render.dedicated.yaml`) and a `/health` endpoint
- One-click demo business (107 records) and a 6-step guided tour
- Docs: USER-GUIDE, ONBOARDING, DEMO-SCRIPT, ARCHITECTURE, product-tour.html

### Not built yet
- **Owner-vs-member enforcement** (stage C) — a member can currently change
  module schema. **Member management and leaving a team** (stage D).
- Email sending, third-party integrations.

---

## 3. Invariants — do not break these

**The UI must paint before any network call resolves.** `init()` in `js/app.js`
calls `route()` and only then `syncInBackground()`. Free-tier hosts sleep and can
take a minute to answer; a returning user once saw a bare shell because a stalled
await ran before `route()`. Guarded by the test *"paints immediately even when the
server is asleep"* (hangs `/api/me` for 8s, requires paint under 5s).

**No single failure may leave the app unrendered.** `init()` binds chrome first,
wraps data loading in try/catch, runs a 2.5s watchdog, and has a final `.catch`.
`route()` guards sidebar and view separately. `DB.open()` always settles
(timeout + `onblocked`). Two tests break IndexedDB outright and require the app
to render *and still navigate*.

**Every `Cloud` API call carries an `AbortSignal.timeout`.** Nothing may hang.

**Script order in `index.html` matters.** `js/app.js` last; it references
`DEMO_DATA`, `Tour`, `CSV`, `LUCIDE`, `TEMPLATES`, `DB`, `Cloud` as globals.
Adding a file means updating both `index.html` *and* `sw.js` APP_SHELL, and
bumping `CACHE_VERSION` (currently `crmbuilder-v7`).

**Tenancy scoping comes from the session, never a request.** That covers both
`req.scopeOrgId` (which org an admin may see) and `workspaceIdFor(user)` (which
workspace a caller reads and writes). See §5.

**Sync clocks are two different things and must not be conflated.** `updatedAt`
is the client's edit time and decides last-write-wins per record; `serverAt` is
the server's monotonic stamp and is the only thing the delta cursor walks. A
device with a skewed clock must never be able to move the cursor. See §10.

**Owned data is never claimable.** Only the `anon` scope can be adopted into an
account, only after an explicit prompt, and only once. A `u:<id>` scope is never
merged into a different account, whatever is still pending in it. See §11.

**Sync only ever runs in a `u:<id>` scope.** That single check in `Cloud.sync()`
is what makes demo data unable to reach a server — stronger than keeping it out
of localStorage, because it holds even if a `_demo` flag is forgotten.

**Deletes are tombstones everywhere** — `DB.delete` on the client, `deletedAt`
on the server. A row that simply disappears is indistinguishable from one a
device has never seen, so the next sync hands it straight back.

**Only `http/https/mailto/tel` may reach an `href`** (`safeHref` in app.js) —
record values arrive from CSV imports and shared backups.

**`openRecord` and `openCSVImport` re-resolve their module** via `getModule(id)`.
Rendered rows can outlive the module definition they were drawn from.

---

## 4. Traps that have already cost time

**CSS cascade.** `.input` declares the `padding` shorthand and sits *later* in
the file than `.search-input`; a bare `.search-input { padding-left }` loses and
the placeholder lands on the search icon. Use a more specific selector.

**Grid auto-placement in the module builder.** `.builder-field` is **flex, not
grid**, deliberately. With grid, revealing the dropdown-options input
(`grid-column: 2/-1`) pushed the trailing controls into columns sized for row 1,
squashing "Req" to 16px so its label painted over "List". Don't reintroduce grid.

**MongoDB TTL indexes are single-field only.** `expireAfterSeconds` on a compound
key like `{ orgId, at }` is accepted *without error* and then ignored — nothing
ever expires. `{ at: 1 }` does expiry; `{ orgId: 1, at: 1 }` serves queries.

**MongoDB refuses to change an index's options in place** (error 85/86).
`ensureEventTTL()` catches that, drops and recreates. Needed because live
deployments already have a plain `{ at: 1 }`.

**Email is globally unique, not per-org.** Sign-in resolves an account from an
email alone with no org in hand, so `{ orgId, email }` unique would make login
non-deterministic.

**Renaming a field keeps its key.** Labels are display-only, so record data
survives a rename — the default builder field stays `#f-name` after relabelling.

**Async re-render races in tests.** `renderModuleBodyOnly` is async and click
handlers don't await it. Wait on rendered state (`aria-sort`, a row appearing)
before reading the DOM, or you sample the *previous* render and the assertion
passes for the wrong reason.

**Row clicks land on links.** Email/phone/URL cells are anchors that stop
propagation. Click `tr td:first-child` to open a record.

**Template cards** wrap a visually hidden checkbox — `.check()` fails; click the
card. **Hidden-but-present elements** (`#topbar` on desktop, `#import-csv-file`)
must not be `waitForSelector`ed.

**Killing the dev server:** `pkill -f "[s]erver\.js"` in a **separate** Bash
call. A compound command mentioning `server.js` matches itself.

---

## 5. Organisations and tenancy (shipped)

```
orgs    { id, name, createdAt, createdBy }
users   { id, email, name, orgId, role, disabled, createdAt, lastActiveAt }
modules { wsId, orgId, id, createdBy, updatedBy, updatedAt, serverAt,
          deletedAt, deletedOn, doc }
records { wsId, orgId, id, createdBy, updatedBy, updatedAt, serverAt,
          deletedAt, deletedOn, doc }
data    { wsId, orgId, settings, settingsUpdatedAt, settingsServerAt,
          moduleCount, recordCount, perRecord, orgOwned, updatedAt }  ← meta
events  { type, userId, orgId, day, at }
```

Roles: `platformAdmin` (operates the deployment, crosses orgs) · `owner`
(administers their own org only) · `member`.

- Every signup creates an org and owns it. `ADMIN_EMAILS` and the first-ever
  account become `platformAdmin`.
- `requireOrgAdmin` sets `req.scopeOrgId` **from the session**. `requirePlatformAdmin`
  is a *separate* middleware — never a branch inside the org check, because the
  conditional form gets copied into a handler with the precedence wrong.
- Cross-org access returns **404, not 403**, so responses don't confirm existence.
- An `owner` cannot grant `platformAdmin`.
- `migrateToOrgs()` runs on boot, is idempotent, and puts each pre-orgs account
  in its own org (`admin`→`platformAdmin`, `user`→`owner`).
- **Eight isolation tests in `tests/api.test.mjs` assert the attack**, not the
  happy path. Keep them passing; they are the gate on this area.

**The one that can destroy a team's data:** `store.deleteUser` deliberately no
longer touches the workspace. `deleteAccount()` deletes it only when the org has
no members left. Kept as one named function because the two calls in the wrong
order — or one of them forgotten — *is* the bug. Guarded by *"removing a member
leaves the workspace standing"*, which fails on the un-fixed code.

**Admin rows carry no per-user record counts.** Every member of an org would
report the same totals, reading as N copies of the data rather than N people
sharing it. The figure lives on `/api/admin/stats`, once per workspace.

**The workspace belongs to the org, not the account** (stage A, shipped).
`wsId` is the ownership key and `workspaceIdFor(user)` resolves it **from the
session only** — never a parameter, query or body, the same rule as
`req.scopeOrgId`. `wsId` is a separate field from `orgId` on purpose: they are
equal today, and a key named for what it keys is what stops the next reader
assuming they always will be.

Still unbuilt: owner-vs-member enforcement (stage C), member management and
leaving (stage D).

---

## 6. Generated files — do not hand-edit

- **`js/icons.js`** — from the `lucide-static` npm package. Extract the **inner**
  content of each `<svg>`; the files open with a license comment, and a naive
  first-`>` regex nests svgs and swallows trailing button text.
- **`js/demo-data.js`** — from a Python generator. Dates are stored as
  `{ __rel: days }` and resolved at load time so the data never looks stale.

---

## 7. The guided tour (`js/tour.js`)

Pre-flights before showing anything: `ensureReady()` must return `{ ok: true }`,
and every step's route must resolve. Steps whose screen can't exist are dropped
so "Step N of M" stays true. If data can't be prepared the tour **doesn't start**
and says why.

This was flaky and the cause is worth remembering: when `demo-data.js` failed to
load, `dealsId()` returned `undefined`, routes became `#/m/undefined`, navigation
was silently skipped, and `waitFor` burned a 6s timeout per step — steps 2–4
narrated over the onboarding screen while the app appeared frozen. Fixed by
pre-flight + `goto` returning `false` + a 2s target budget.

Steps 2 and 3 set up their own screen (`before` hooks force board / sorted table)
rather than assuming inherited view state.

---

## 8. Known gaps and honest limits

- **Sync is per record**, so an edit costs ~270 bytes regardless of workspace
  size. The remaining storage ceiling is Atlas M0's 512 MB shared across
  tenants, not a per-document limit.
- **Free-tier cold starts.** The app paints instantly regardless, but sign-in and
  sync wait for the server. Warm the URL before a demo.
- **This session cannot reach `*.onrender.com`** — the egress proxy returns 403.
  Live verification must be run by the user or by CI. A uniform all-checks-failed
  result in the smoke test is reported as a probable network block, not a broken
  deployment.

---

## 9. Conventions

- Commit messages: what changed and *why*, including traps discovered.
- Every bug fix gets a regression test, and the test is checked against the
  broken state — a test that passes on the bug is worthless.
- Prefer measuring over asserting: sizes, timings and layout are checked by
  driving the real app, not by reasoning about the code.

---

## 10. Per-record sync

Replaced whole-snapshot last-write-wins. The failure it fixes: two devices
editing *different* records lost one of the edits, because whoever saved second
uploaded their entire workspace over the other's.

**Shape.** Each module and record is its own row: `{ userId, orgId, id,
updatedAt, serverAt, deletedAt, deletedOn, doc }`. `POST /api/sync` is one
round trip — push what changed here since the last accepted push, receive what
changed there since the cursor. `GET /api/sync?since=N` pulls only.

**Traps, all of which bit during implementation:**

- **`Number(x) || now` restamps a legitimate zero.** A device signing in for
  the first time sends `settingsUpdatedAt: 0`; the server read that as "now",
  so its blank defaults won and wiped the workspace's real settings. Use
  `Number.isFinite`. The E2E two-device test is what caught it.
- **A push must not echo back what it just sent**, but those rows' `serverAt`
  still has to count toward the returned cursor — otherwise they arrive on the
  very next pull.
- **Server stamps tick forward on collision.** Two rows written in the same
  millisecond with a cursor landing between them strand the second one forever.
- **Client selection uses `>=` on its watermark, not `>`,** for the same reason
  in the other direction. Re-sending the boundary row is free: the server's tie
  goes to the stored copy, so it is skipped.
- **MongoDB TTL is single-field only** (same trap as the events TTL). Tombstones
  expire on `deletedOn`, a real `Date` that only tombstones carry — the TTL
  monitor skips non-Date values, so live rows are untouched by it.
- **IndexedDB transactions commit when the microtask queue drains.** Bulk
  tombstoning issues every `put` in one tick via `Promise.all`; awaiting between
  writes finds the transaction already closed.

**Ownership.** Rows are keyed by `wsId` (the org), so the same machinery that
made two *devices* safe is what makes two *people* safe — that was the point of
doing per-record sync first. `createdBy` is set once and carried forward, so
editing someone else's record does not rewrite its authorship.

**Backwards compatibility.** `GET`/`PUT /api/data` still work, reading and
writing the same rows, so a client on cached older JS keeps syncing through a
deploy; the client falls back to them on a 404. `migrateToPerRecord()` splits
existing snapshots on boot, **preserves ids exactly** (minting new ones would
duplicate every row instead of matching what devices already hold), and is
idempotent via `perRecord` on the meta doc.

**Deployment shapes.** `render.yaml` is pooled (Option B); `render.dedicated.yaml`
is one deployment per client (Option D). Same code, different env vars.
`HEALTH_DETAIL=1` exposes org/user counts on the public `/health` — correct on a
dedicated deployment, a customer count on a pooled one. `DEPLOYMENT.md`
§"Choosing a deployment shape" has the matrix and the migration runbook.

---

## 11. Storage scopes (`js/scope.js`)

One browser profile is not one person. Before this there was a single
`crmbuilder` database and one set of unprefixed localStorage keys for every
visitor, and the sync engine pushed whatever it found to whichever account was
signed in. The bug that forced it: A signs in, edits, sync fails, leaves; B
signs in; **A's pending rows were uploaded into B's account.** A clean sign-out
did not help — the cursor keys were cleared, IndexedDB was not.

```
anon        IndexedDB `crmbuilder`          never syncs
u:<userId>  IndexedDB `crmbuilder-u-<id>`   syncs
```

Scoped localStorage keys are `crmb:<scope>:<name>` — `settings`, `settingsAt`,
`snapshot`, `lastEdit`, `lastSync`, `dirty`, `syncCursor`, `pushedThrough`.
Device-level keys stay global: `crmb:auth`, `crmb:user`, `crmb:tourSeen`.

**Traps:**

- **The scope must resolve synchronously at boot**, or the paint-first invariant
  (§3) breaks. It reads the last known identity from `crmb:user`;
  `reconcileScope()` corrects a wrong guess once `/api/me` answers.
- **The last known identity is the wrong answer while a sign-in is in flight.**
  On a shared PC it is the *previous* person, and OAuth returns as a fresh page
  load. `Scope.markSignInPending()` makes boot paint `anon` instead — still
  immediate, just neutral.
- **A returning user needs no recovery path.** Their scope still holds the rows
  and the watermark, so the ordinary `updatedAt >= pushedThrough` rule pushes
  them. If you find yourself writing recovery code here, the scope is wrong.
- **The anonymous copy must be cleared after a claim**, or the next visitor
  sees the last one's workspace — but only once a sync confirms it landed
  (`claimCleanup`). Verify before delete, as in the deployment runbook.
- **`DB.adoptLegacy()` writes its marker only after counting rows back.** The
  marker is what stops the migration re-running, so it must not cover a
  half-copy. Two databases open at once invites a blocked upgrade: read the
  legacy one out fully and close it before writing.

### Demo data

`_demo: true` on rows we seeded, never on rows the user typed; editing a demo
row keeps the flag (`{...record}` spread already does this). It rides inside
`doc`, so **the server needs no change**. The snapshot mirror skips `_demo`
rows.

`discardDemoData()` only ever deletes rows we created. A demo module the user
has since added their own record to is **promoted** (flag cleared) rather than
deleted — deleting it would take their work. Removing that branch makes the
test *"removing samples keeps work the user added to a sample module"* fail,
which is how it is checked.

Nothing is seeded without a prompt: `Tour.ensureReady()` no longer seeds, and
`startTourWithConsent()` asks. Sign-in asks once about anything already on the
device, with the options computed from what is actually there.

---

## 12. Migrations (`tests/migration.test.mjs`)

Three run on boot, in this order, each idempotent: `migrateToOrgs()` →
`migrateToPerRecord()` → `migrateToOrgWorkspaces()`.

They are tested by hand-building a store in the shape a real deployment would
be in, booting a server against it, and asking the API what came out — not by
calling the functions, because what is under test is what a live upgrade does.

**Traps:**

- **`/api/data` reads ids out of the stored document, not out of the envelope.**
  A migration that minted fresh envelope ids still looks correct there, and the
  first version of this test passed on exactly that bug. Assert sync ids via
  `/api/sync`, which is the id the delta protocol actually matches on.
- **The account→org rename is only lossless because org↔user is 1:1.** Nothing
  can change a user's `orgId` today. If two accounts ever shared one before this
  ran, their separate workspaces would silently merge, so it refuses and says so
  rather than guessing. Removing that guard makes *"refuses when two accounts
  already share an organisation"* fail.
- **Orphaned rows are left alone, never deleted.** Deleting data during a
  migration is not a decision to make automatically.
- **FileStore keeps the store in memory and rewrites the whole file on save**,
  so editing `store.json` under a running server is clobbered by the next write.
  Stop, edit, start — that is what `moveToOrg()` in `tests/api.test.mjs` does.

---

## 13. Invites and joining (stage B)

```
invites { code, orgId, role, createdBy, createdAt, expiresAt, usedBy, usedAt, revokedAt }
```

An invite is a link the owner copies and sends themselves — there is no mail
plumbing in this product. That makes the code a **bearer credential**: 24 random
bytes, single use, 7 days, revocable, never logged, and stripped from the
address bar by `captureInvite()` as soon as the page has it.

**Every failure answers identically** (`INVITE_REJECTION`, 404) — unknown,
expired, spent, revoked. A different response for "wrong" and "expired" would
let someone enumerate which codes exist.

**Joining means leaving**, so `/api/org/join` refuses when the caller is the
last owner of an org that still has other members — walking out would strand
them with a workspace nobody can administer.

### The client side, and the trap that bit

`Scope.workspaceChanged()` stamps which workspace a scope's rows are a replica
of. When `/api/me` reports a different org, `reconcileWorkspace()` throws the
replica away and pulls the new workspace clean.

- **Never push after the org has moved.** The server files every write under the
  caller's *current* workspace, so "flushing what is owed to the old workspace"
  posts those rows into the new team's CRM. I wrote exactly that bug; the fix is
  to push **before** joining (while the old workspace is still ours) and to drop
  and report anything still pending afterwards. Guarded by *"unsynced work from
  a previous workspace never lands in the new team"*, which needs `/api/sync`
  blocked to reproduce — plain offline does not work, because the page load
  before joining flushes the queue and closes the window.
- **A hard `DB.clear`, not tombstones.** A tombstone would travel to the *new*
  workspace and delete rows there.
- **Settings belong to the workspace**, so the scope's `settings`/`settingsAt`
  are cleared too, or the joiner's own business name outlives the join.
- **Only act on an answer the server actually gave.** Offline, `/api/me` never
  resolves and `Cloud.me.org` is absent; treating that as "the org changed"
  wiped the local workspace the moment the connection dropped. Caught by the
  offline sync test.
