# CRM Builder — working notes

Context for anyone (human or agent) picking this up mid-stream. Read this
before changing code; it records decisions and traps that are not obvious from
the source, and it is the safe restart point after a context compaction.

**Branch:** `claude/pwa-modular-crm-builder-xcwgzv` — all work goes here.
**Live:** https://crmbuilder-v1.onrender.com
**Other docs:** [`docs/README.md`](docs/README.md) is the map. This file is the
engineering half and is kept current; `docs/archive/` is frozen on purpose.

---

## Find it by topic

Sections are numbered in the order they were written, and several are named for
the build stage that produced them — "stage C", "beta stage 2" — which means
nothing if you were not there. **Read down this column instead.** The numbers
never change, because everything cross-references them.

| Looking for | Go to |
|---|---|
| **Start here** — what must not break | §3 invariants · §4 traps · §9 conventions |
| Where the files are, what loads when | §1 · §3 |
| What is shipped, and what is deliberately not | §2 |
| **Sync**: the delta protocol, the two clocks | §10 |
| Sync: field-level merge (`fieldsAt`) | §26 |
| Sync: whose data is on this device | §11 storage scopes |
| **Permissions**: the role ladder, refusals | §14 · §26 (contributor/viewer) |
| Teams: invites and joining | §13 |
| Teams: roles, removal, leaving | §15 |
| Orgs, tenancy, and the 404-not-403 rule | §5 |
| **Signup**: the gate and its bypass order | §16 · §20 (access requests) |
| Operator panel: usage, quotas, levers | §24 |
| Alerts and thresholds | §25 |
| **Before removing a meter** — what it costs | [`docs/archive/TELEMETRY.md`](docs/archive/TELEMETRY.md) |
| Backups, export auth, measured usage | §17 |
| Problem reports and webhook shapes | §18 |
| Legal pages, service-worker page trap | §19 |
| **What the server publishes** (allow-list) | §28 |
| Migrations | §12 |
| Guided tour | §7 |
| Deleting a field; currency relabels | §22 · §23 |
| Security audit and what it changed | §21 · §30 (findings, incl. the false ones) |
| Why docs go stale, and which ones | §27 |
| **"Synced" that is not synced** — backdated rows | §31 |
| **Which tests to run** — and who runs the rest | §9 |
| E2E suite slow or "flaky" | §32 |
| **What tombstones cost**, and reading storage figures | §33 · §26 |
| **How the docs are organised**, and what is frozen | §29 |

---

## 1. What this is

A modular CRM for small businesses. Offline-first installable PWA, plus a small
Express backend for Google OAuth sign-in, workspace sync to MongoDB, and admin.
No build step, no frontend framework — plain ES5-ish scripts loaded in order by
`index.html`.

```
server.js             Express: static PWA, OAuth, /api/sync + /api/data, /api/admin/*, /api/org, /health
index.html            app shell (script order matters — see §3)
privacy.html          privacy policy | terms.html  terms of use  (see §19)
legal.css             styling for those two — they load no app JS at all
css/style.css         Inter + blue/slate palette, light/dark, desktop-first
js/icons.js           inline Lucide SVGs (generated — see §6)
js/boot-icons.js      fills static icon placeholders — a file, not inline (§30 CSP)
js/scope.js           whose data is this — storage scopes (see §11)
js/db.js              IndexedDB wrapper, one database per scope
js/csv.js             RFC 4180 CSV reader/writer
js/templates.js       prebuilt module templates
js/demo-data.js       fictional business (generated — see §6)
js/tour.js            guided walkthrough engine (no dependencies)
js/cloud.js           account + sync layer, server ⇄ local fallback
js/app.js             router, all views, module builder, kanban, admin, tour steps
sw.js                 service worker (BUMP CACHE_VERSION on any asset change)
tests/                smoke, API contract, CSV unit, signup gate, migrations, E2E
docs/                 user guide, onboarding, demo script, architecture, BETA runbook
```

---

## 2. Current status

**All green:** 191 Node tests + 80 Playwright tests, 41 smoke checks. On
Windows one Node test skips itself — see §4's SIGTERM note; it is a platform
limit, not a failure.

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
- **Shared team workspaces**, complete: org-owned workspaces (stage A), invite
  links (stage B), owner-only schema (stage C), member management and leaving
  (stage D) — see §5, §13, §14, §15
- Admin dashboard with analytics; **organisations with per-tenant scoping**
- **Pooled and dedicated deployment blueprints** (`render.yaml`,
  `render.dedicated.yaml`) and a `/health` endpoint
- One-click demo business (144 records across 8 modules, including two the
  templates do not provide, with resolved relations) and a 6-step guided tour
- **Self-serve beta signup**, complete: the code gate (stage 1), backups and
  measured usage (stage 2), problem reports (stage 3), and the legal pages,
  beta notice and runbook (stage 4) — see §16, §17, §18, §19
- **Access requests**: a stranger who arrives on their own can ask, and an
  approval lets them straight in with nothing to email — see §20
- Docs: see `docs/README.md` — the map, and which are frozen

### Not built yet
- Email sending, third-party integrations.
- **Per-module permissions** — everyone on a team sees every module. Roles
  govern what you may *do* (§14), not which modules you can see. Considered and
  set aside: it needs per-module filtering in sync, or a member receives rows
  they cannot see.
- **Undoing a delete** — a tombstone discards the body (§26). Costed, not built.

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
Adding a file means updating `index.html`, `sw.js` APP_SHELL, **the server's
allow-list (§28)** and the smoke test's `ASSETS`, and bumping `CACHE_VERSION`
(currently `crmbuilder-v28`). Miss the allow-list and it 404s in production
while working locally from cache.

**The server serves an allow-list, never the repository.** Anything not named
in `ASSET_DIRS`, `PUBLIC_ROOT_FILES` or `PUBLIC_DOCS` is not reachable. See
§28 — the previous `express.static(__dirname)` published the whole repo.

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

**Windows cannot deliver SIGTERM to a child process.** libuv maps
`child.kill()` to `TerminateProcess()`, so the child dies without running its
JS signal listeners. Anything guarded by a graceful-shutdown handler therefore
fails on Windows **while the server is behaving correctly** — the egress
persistence test is skipped there for exactly this reason, and it says so.
Before treating a shutdown-path failure as a bug, check the platform: the
symptom is a persisted value that is short by whatever was still buffered.
Full write-up in [`docs/archive/TELEMETRY.md`](docs/archive/TELEMETRY.md) §1.

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

All four stages are shipped: org-owned workspaces, invites, permissions, and
member management.

---

## 6. Generated files — do not hand-edit

- **`js/icons.js`** — from the `lucide-static` npm package. Extract the **inner**
  content of each `<svg>`; the files open with a license comment, and a naive
  first-`>` regex nests svgs and swallows trailing button text.
- **`js/demo-data.js`** — from **`scripts/gen-demo-data.mjs`**, which is now in
  the repo. It used to say "from a Python generator", and that generator was
  never committed — so the one file nobody was allowed to hand-edit was also
  the one nobody could regenerate. Run `node scripts/gen-demo-data.mjs`.

  **Seeded PRNG, so a re-run is byte-identical.** An unseeded `Math.random()`
  would make every regeneration a few hundred lines of noise and the diff
  useless for review.

  Two placeholders, resolved by `loadDemoData` at load time:
  `{ __rel: days }` → a date that many days from today, so the business never
  looks stale; `{ __ref: "<moduleKey>:<name>" }` → a relation, to the seeded
  record's real id. **A `__ref` may only point at a module seeded earlier** —
  resolution is a single forward pass, so a forward reference silently becomes
  a blank cell. `tests/demo.test.mjs` asserts every one resolves.

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

### Who runs which tests

Three tiers, and the split is deliberate: **the full suite already runs on CI
for every push to every branch** (`push: branches: ['**']`), on ubuntu, for
free. Re-running it in the development loop buys nothing and costs minutes per
iteration — three full runs in one session where one would have done is what
prompted writing this down.

| | Runs | When |
|---|---|---|
| **Development loop** | targeted tests + `npm run test:smoke` | every change |
| **CI** | everything | automatically, on push — the default gate |
| **The user, locally** | whatever the failure needs | triaging a CI failure, or a Windows-only symptom |

**Targeted means targeted:**

```sh
node --test tests/signup.test.mjs                       # one file
node --test --test-name-pattern "egress is counted" …   # one test
npx playwright test -g "the demo can be kept on purpose"
npm run test:smoke                                      # 41 checks, seconds
```

**Smoke stays in the loop even though it is not targeted**, because it is the
only thing that catches a file missing from the server's allow-list (§28) —
which works locally from cache and 404s in production. Unit and E2E tests
cannot see that failure. Run it whenever a served file is added or renamed.

**State what was actually run.** Commit messages record real coverage —
*"signup.test.mjs 63/63; full suite not run"* — never a total that was not
observed. A commit log that overstates its verification is worse than one that
admits the gap, and CI is about to produce the real number anyway.

**Say when a change wants a full run before it is trusted.** Some edits have
blast radius well past the file being changed, and all four of these happened
in one session:

| Edit | What broke, elsewhere |
|---|---|
| `deleteAccount` → `tidyVacatedOrg` | a team-workspace test that was not being targeted |
| the rate limiter | the entire Node suite |
| `playwright.config.js` cleanup | 47 E2E tests, `ERR_CONNECTION_REFUSED` |
| adding a JS file | production 404s unless four places agree (§3) |

The pattern to watch: **shared server helpers, `js/db.js` / `js/cloud.js` /
`js/scope.js`, `playwright.config.js`, and anything touching the asset
allow-list or `CACHE_VERSION`.** Flag those explicitly rather than skipping the
full run silently.

### When a test fails on the user's machine

**Send the artifacts; do not re-run.** Playwright wipes `test-results/` at the
start of every run, so re-running to see whether a failure reproduces destroys
the evidence needed to diagnose it. That mistake is recorded in §30 as one made
twice. What is wanted is `test-results/<test-name>/error-context.md` and the
assertion text.

**Triage platform against product before changing code.** The development
machine is Windows; CI and production are Linux, and the difference is real —
§4's SIGTERM note is the standing example. The egress case is the precedent
worth remembering: the failure was a Windows artifact, the correct fix was a
skip with the reason recorded, and reading it as "this telemetry is not worth
keeping" would have cost a working alert
([`docs/archive/TELEMETRY.md`](docs/archive/TELEMETRY.md)).

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

---

## 14. Permissions (stage C)

A ladder — each rung does everything below it plus one more thing, so there is
one ordering to reason about rather than a matrix.

| | owner / platformAdmin | member | contributor | viewer |
|---|---|---|---|---|
| read | ✅ | ✅ | ✅ | ✅ |
| records: create, edit | ✅ | ✅ | ✅ | ❌ |
| records: delete | ✅ | ✅ | ❌ | ❌ |
| module fields, add/delete modules | ✅ | ❌ | ❌ | ❌ |
| invite, roles, remove members | ✅ | ❌ | ❌ | ❌ |

`canEditSchema()` exists twice on purpose: on the server (`server.js`) it
decides, and on the client (`js/app.js`) it only avoids offering a button whose
effect would be undone a second later.

**Refused, not errored.** `applyPush` skips a member's module write and returns
the server's own copy in `rejected`. The client overwrites its local row with
that and the edit un-happens. A failed sync would instead leave the two sides
disagreeing forever.

**Traps:**

- **A rejection cannot be merged by last-write-wins.** The local row is a
  tombstone or an edit stamped *later* than the server's copy, so the ordinary
  rule keeps it and re-pushes it every sync, forever. `applyRejections()`
  overwrites unconditionally and takes the server's clock too, which drops the
  row back below the push watermark.
- **A refused module deletion must take its record tombstones with it.**
  Deleting a module tombstones the module *and* every record in it; refusing
  only the module restores it and leaves the records destroyed — worse than
  either outcome. `refusedModuleIds` cascades. Same for a refused module
  *creation* and the records pointing at it (`absentModuleIds`).
- **A rejection with nothing to restore is purged, not tombstoned.** A
  tombstone would be pushed, refused, and reverted on every subsequent sync.
- **The toast fires after the revert is on screen**, from inside
  `mergeChanges` — every sync path goes through there, and reporting from
  `syncInBackground` alone left the debounced push silent.
- **`.toast` matches several elements**; assert `.last()` (see §4).

The case this really exists for is not a poked-at hidden button: it is someone
who edited a module offline **as an owner** and was demoted before reconnecting.
Their work legitimately vanishes, and the named toast is the difference between
a rule and a bug report. Guarded by *"a demoted member has their module edit
reverted, and is told why"*, which fails both when the revert is silent and when
the client ignores the refusal.

---

## 15. Team membership (stage D)

```
GET    /api/org/members        anyone on the team; canManage says who may act
PATCH  /api/org/members/:id    owner only — owner | member, never platformAdmin
DELETE /api/org/members/:id    owner only — removes from the TEAM
POST   /api/org/leave          self-service exit
```

**Removing is not deleting.** `DELETE /api/org/members/:id` moves the person to
a fresh org of their own: account intact, team workspace untouched. Account
deletion is a different act on a different endpoint (`/api/admin/users/:id`) and
`deleteAccount()` is still the only thing that can take a workspace with it.
The two are one word apart and a decade of data apart, so the confirmations say
which is happening and the test *"removing a member keeps their account and the
team workspace"* fails if the two are ever wired together.

**`wouldStrandTeam()` is the one rule**, used by leave, self-demotion and join.
Leaving, demoting yourself, and joining another team are the same problem
wearing three hats: the last owner of a populated team walking away leaves
people with a workspace nobody can administer. Removing that guard fails five
tests.

**A removed member's device clears itself** on its next contact with the
server: their `orgId` changed, so `reconcileWorkspace()` (§13) fires and drops
the replica. The honest limit is therefore narrower than "we cannot erase it" —
it is **a device that never comes online again**. Say that, not the vaguer
version, and not an implied remote wipe.

**Traps:**

- **`page.goto('/#/settings')` when already there is a same-document hash
  change** and does not re-render. The Team screen showed the team as it was
  before the colleague joined until the test reloaded instead.
- **A removed member's page is still on the old module's route**, which no
  longer exists for them — that renders "Module not found", not onboarding.
  Assert emptiness from the dashboard.
- **`fmtWhen` was scoped inside `renderAdmin`** and had to be hoisted before
  Settings could use it.

---

## 16. Signup and the beta gate (`SIGNUP_MODE`)

There was never a signup step: `upsertUser` creates the account on the first
successful callback. `SIGNUP_MODE` (`code` default · `open` · `closed`) decides
who is allowed to reach that point.

**One path, two labels.** That design is right for the plumbing and was wrong on
the screen: every string said *Sign in* and *Already have an account?*, so the
one audience the gate exists for — someone arriving on an invite link, with no
account — was told by the only affordance on the page that it was meant for
other people. `accountAffordanceHTML()` and `openSignIn()` now say *Create your
account* instead. The flow underneath is untouched; only the framing moves.

**`canCreateAccount()` is the one rule**, and it is two conditions, not one: an
invite in hand, **or** `signupMode === 'open'`. Keying on the invite alone was
right for the beta and wrong the moment signups open — which is where this
deployment ends up — because then every new visitor can create an account and
was being asked whether they already had one. `code` without an invite, and
`closed`, keep the sign-in wording: a deployment must not offer what it will
refuse. Three E2E tests pin the three outcomes and each fails on a different
mutation of that expression, so no one of them passes on a version that always
says "create".

**Open signups do not retitle the modal on their own.** `openSignIn({ signUp })`
takes the intent from the caller, because the sidebar's *Sign in to sync* is
what returning users press all day. An invite in hand is the one signal strong
enough to stand alone.

`captureBetaCode()` toasts *Beta invite applied* as it strips the code. Three
things about that: it is safe before the first paint (`#toast-root` is static in
`index.html`, and `route()` only replaces `#main`); it reports **receipt, not
validity**, because a client-side check would have to ask the server whether a
code is real, which is an oracle for enumerating codes — a bad code is refused
at the callback instead, by the screen that explains itself; and it fades, so on
a cold start it can be gone before sign-in is even possible. The onboarding call
to action is the durable half, and the toast is the reassurance.

**The gate is on signup, never on sign-in.** `checkSignup(email, code)` returns
`{ ok: true }` immediately for an account that already exists — a returning
tester must never be asked for a code they used weeks ago. Consumption is
deferred to a `consume()` the caller runs only after the account exists.

**Order of the bypasses matters:**

1. account exists → in
2. `ADMIN_EMAILS` → in
3. **no users at all → in** — without this a fresh deployment in `code` mode is
   bricked: minting a code needs a platform admin, and becoming one needs a
   signup. Same bootstrap `upsertUser` already uses for the first
   `platformAdmin`. Found by the tests, not by reading the code.

**Traps:**

- **`SIGNUP_MODE` is the default, not the answer.** The live mode is stored
  (`platform` settings) and changed from Admin → Beta access, because opening or
  pausing signups used to need an environment change and a redeploy — minutes of
  free-tier downtime at the two moments you least want it. **Precedence is
  load-bearing:** a stored mode wins, so a redeploy cannot silently undo the
  operator; the env var only decides for a deployment that never set one.
  Guarded by *"a panel decision survives a restart, and the env var does not
  undo it"*, which fails the moment the env var wins.
  Cached in-process, invalidated on write, with a 30s TTL so a multi-instance
  deployment converges rather than staying wrong.
  `tests/signup.test.mjs` still boots one server per mode to cover the env-var
  path; `api.test.mjs` and `playwright.config.js` both pin `SIGNUP_MODE=open`,
  because those suites are about everything else. The E2E test that flips the
  mode **restores it in a `finally`** — the value is stored now, so leaving it
  changed would leak into every test after it.
- **The code crosses the Google round trip in an httpOnly cookie**
  (`crmb_beta`), beside `crmb_oauth_state` and for the same reasons. It is
  validated in the *callback*, against the email Google actually returned —
  only there is it known whether this is a signup at all.
- **Every refusal answers identically** (`SIGNUP_REJECTION`) — unknown, spent,
  revoked, expired. A test asserts the wordings are one set, not four.
- **"A use is spent only on account creation" is deliberate but untested.** No
  reachable path fails between the check and the write: a returning user
  short-circuits earlier, a malformed address is rejected earlier. The first
  version of that test passed with the ordering broken, so it now claims only
  what it proves and the code says the ordering is unguarded.

---

## 17. Backups and usage (beta stage 2)

M0 has **no automated backups and no point-in-time recovery**, so
`GET /api/admin/export` plus `.github/workflows/backup.yml` is the entire
safety net. `scripts/restore.mjs` puts one back, into Mongo or the file store.

**The export is the highest-value route in the app** — one request returns
every customer's data — so it is deliberately awkward:

- **404, not 401, when `BACKUP_TOKEN` is unset.** Nothing should be able to
  discover whether a deployment has backups.
- **`Authorization: Bearer` only.** A *correct* token in a query string is
  refused with an explanation, because Render logs request URLs; `?token=`
  writes a credential into plaintext logs, browser history and `Referer`.
  Guarded by a test that sends the right token the wrong way.
- **An admin session is not a token.** A stolen cookie must not also be a
  database dump. Also guarded.
- Compared by hashing both sides — `timingSafeEqual` throws on a length
  mismatch, and the throw would itself leak the length.

**Traps:**

- **HTTP strips trailing whitespace from header values**, so `Bearer <token> `
  arrives as the correct token. A test asserting that variant is refused fails
  for a reason that has nothing to do with the code. Use a genuinely different
  token instead.
- **Tombstones older than `TOMBSTONE_RETENTION_DAYS` are pruned at boot**, so a
  restore of old test data comes back without them and looks like the restore
  lost them. It did not; the retention policy did its job.
- **Usage is measured, not estimated.** `storageStats()` asks MongoDB for
  `dataSize + indexSize` rather than multiplying records by a bytes-per-record
  figure, because indexes and tombstones are real storage and an estimate that
  ignores them reads fine right up until the tier fills.
- **Nothing is enforced.** A cap firing mid-beta looks like the bug the tester
  was chasing.

**Keep-warm is configuration, not code.** UptimeRobot pings `/health` every 14
minutes. Two consequences worth remembering: that is continuous, so it consumes
~744 of Render's 750 monthly instance-hours and only works while this is the
only free service on the account; and 14 minutes against a 15-minute idle
timeout is one missed check from asleep.

---

## 18. Problem reports (beta stage 3)

`POST /api/feedback` stores the message plus a **whitelisted** context —
version, route, browser, sync status, counts, and up to ten recent console
errors from a ring buffer that wraps `console.error` at boot. Bounded because
it writes to the same 512 MB the customers use: 4 KB message, ten an hour per
user, and a 90-day TTL keyed on `reportedOn` (a real `Date`, single-field —
the same rule as the events and tombstone TTLs).

**Stored *and* pushed.** `FEEDBACK_WEBHOOK_URL` gets a POST after the row is
written, carrying who, when and what they wrote — and
**none of the diagnostic context**. Console errors can contain record names,
module names and customer email addresses, so sending them to a chat service
would make it a processor of beta users' CRM contents. There is a test that
stands up a local HTTP server and asserts the payload contains the message but
not the browser string, not a record count, and not an email lifted from an
error message.

**Traps:**

- **The webhook is a notification, not the record.** A test boots against
  `http://127.0.0.1:9` — nothing listening — and requires the report to be
  stored anyway. A rotated URL must not silently swallow every bug report.
- **It fires after the response.** A slow or dead webhook must not make
  reporting a bug feel like another bug.
- **`sanitiseContext` is a whitelist, not a cleanup.** Anything the client
  invents is dropped rather than stored; the error list is capped at ten on the
  way in, not on the way out.
- **`console.error` is wrapped, never replaced** — devtools keeps working, and
  the wrapper's own failure can never stop a log line.

### Webhook shapes (Discord · Slack · Telegram)

Discord reads `content`, Slack reads `text`; sending both means one payload
serves either with no provider setting to get wrong. **Telegram is not a
webhook at all** — `sendMessage` takes `chat_id` and `text` as parameters, so a
`{content}` body is accepted by the transport and simply never delivered.

- **Detected by the path** (`/bot<token>/sendMessage`), not the hostname. That
  is what actually describes the API shape, it also covers a self-hosted Bot API
  server, and — the reason it is worth doing — a local capture server can match
  it, so the payload is testable without talking to Telegram.
- **No `parse_mode`.** With one set, a report containing an unbalanced `_` or
  `[` gets the whole message refused with a 400 and the notification vanishes
  for a formatting reason. The text carries no markup for Telegram to parse.
- **`chat_id` is moved out of the query string into the body** rather than left
  for Telegram to merge with a JSON body — that merge is not something the Bot
  API docs promise.
- **The URL is a credential**: it contains the bot token. Same class as
  `BACKUP_TOKEN`, and nothing interpolates it into a log line. A test asserts
  the token does not appear in the server's output.
- **A resolved `fetch` is not delivery.** Telegram answers 200 with
  `{ok:false}` for a bad `chat_id`, or for a bot the recipient never started.

---

## 19. Legal pages and the beta notice (beta stage 4)

The last thing between here and strangers signing themselves up. Google will
not publish an OAuth consent screen without a privacy policy URL, and until it
is published every tester has to be added to the Testing list by hand — which is
the manual step the whole signup plan exists to remove.

`privacy.html` and `terms.html` are **standalone pages**: their own `legal.css`,
no app JS, no service-worker shell. They have to render for someone who has
never opened the app and may have JavaScript off — Google's reviewer included.
`express.static(__dirname, { extensions: ['html'] })` already serves them at
`/privacy` and `/terms` with no route.

**The service worker bug this uncovered, which was real and pre-existing.** The
navigation handler answered *every* navigation with `index.html` **and** wrote
the fetched response back into the cache under `index.html`. So `/privacy` would
have shown the CRM, and worse, the *next* load of the app would have served the
privacy page as the app shell — a poisoned cache that survives a reload. Fixed
with a `STANDALONE_PAGES` list that returns early, straight to the network.
That shipped in `crmbuilder-v14`; **anything added to those pages must be added
to that list too**, or it silently becomes the app. (The current
`CACHE_VERSION` is in §3, which is the one to bump.)

**The notice is recorded, not just displayed.** `POST /api/me/beta-accepted`
stamps `betaAcceptedAt` on the user, so "they were told the data might go" is
answerable from the database rather than asserted. Shown after the first
successful sign-in, never before: someone who has not decided to have an account
does not need a warning about one.

**Traps:**

- **Absence is not an answer.** The first version skipped the notice when
  `signupMode === 'open'` — so offline, where `/api/me` never resolves and the
  field is simply absent, every user got a modal over their app asking them to
  acknowledge something the client could not record. It tests for `code` or
  `closed` now: a mode the server positively stated. Exactly §13's rule, and the
  offline sync E2E test is what caught it, by timing out on a click the backdrop
  was intercepting. That test now asserts `.modal-backdrop` count is 0 straight
  after the offline reload, so the next occurrence names itself.
- **`Cloud.me.serverAvailable` is not "the server answered."**
  `offlineIdentity()` sets it from the cached auth flag, so it is true offline
  for anyone who was signed in. Do not reach for it as the online check.
- **The acknowledgement is not assumed to have landed.** `Cloud.acceptBeta()`
  failing leaves `betaAcceptedAt` unset, so the notice returns next time. Shown
  twice is a minor annoyance; recorded-but-never-sent is a false record.

---

## 20. Access requests — people who arrive on their own

Until this, a stranger who signed in without an invite got a screen saying the
beta was invite-only and one button, *Keep looking around*. A dead end with no
way to knock.

**The whole design turns on one fact:** at the moment we refuse someone, we
already hold their **Google-verified email**. The callback had it and threw it
away. So the request hangs off the refusal, never off a form.

A typed form would take an unverified string on an unauthenticated endpoint —
anyone could queue as `ceo@bigcorp.com` and, once approved, be handed that
account. Refusing first costs an attacker a full OAuth round trip per row. That
is why there is no "request access" form and should not be one.

```
accessRequests { email, name, note, status, requestedAt, decidedAt,
                 decidedBy, usedAt, expiresOn }
```

**The address comes from `ASK_COOKIE` and nothing else — never `req.body`.**
`offerToAsk()` sets it at the point of refusal (both the Google callback and
`/auth/dev`), ten minutes, httpOnly, beside `crmb_oauth_state` and `crmb_beta`
for the same reasons. Same rule as `req.scopeOrgId` and `workspaceIdFor()`:
identity is what the server established, never what the caller claims. Guarded
by *"a request cannot claim an address its sender does not control"*, which
fails the moment the handler reads `req.body.email`.

**Approval allowlists the address. It does not mint a code.** There is no mail
plumbing in this product (§13), so a code-based approval ends with the operator
pasting a link into their own mail client and the tester waiting on it — the
manual step this whole flow exists to remove. An allowlisted address means they
come back, press the button that refused them, and are in. The clipboard reply
is a courtesy, not the mechanism.

**Traps:**

- **Bypass order is load-bearing.** `approved` sits after the three existing
  bypasses and **before** `open`; `pending` sits **after** `open` and before
  `closed`. Putting `pending` ahead of `open` means a request left over from
  when the door was shut keeps someone out once it is open — guarded by *"open
  signups let a still-pending request through"*. Putting it after `closed`
  means someone on the list is told signups are paused, which denies that
  anyone can still act on them.
- **`pending` is a deliberate exception to identical rejections.** Everything
  else answers the same way so codes cannot be enumerated (§13, §16). This one
  does not, because the only way to see it is to have just proved control of
  the address to Google — it tells the caller nothing they did not know. Without
  it, someone who asked last week is told "invite-only" again, reads it as being
  ignored, and asks again.
- **Declined is silent, and cannot re-queue.** The handler short-circuits on any
  non-pending row and answers *received* without writing. Telling someone they
  were turned down starts an argument; letting them re-ask makes the decision
  meaningless. The screen says the same thing whatever came back, so the client
  cannot leak the distinction either.
- **`expiresOn` is a real `Date` carried only by decided rows.** Single-field
  TTL, same trick as tombstones (§10) and the feedback TTL (§17). A TTL on
  `requestedAt` would quietly delete the approvals that *are* the allowlist.
- **The E2E half is injected, not real.** `playwright.config.js` pins
  `SIGNUP_MODE=open`, so no refusal is reachable there; the server loop is
  covered in `tests/signup.test.mjs`, which boots a gated server. The E2E tests
  prove the screen, and declare the deliberate 403 via
  `test.info().expectedConsoleErrors`.

---

## 21. The Tier 1 hardening (an outside audit, checked)

Eight edge cases were put to this codebase from outside. **Six held, two did
not**, and the two that did not are worth recording so they are not "fixed"
later by someone reading the report rather than the source:

- **"A stale offline delete wipes newer edits" — no.** `server.js` applyPush
  skips any incoming row whose `updatedAt` is not newer than the stored one, so
  a fortnight-old tombstone loses to a colleague's later edit. Rows nobody
  touched *do* go, which is correct and merely surprising.
- **"Deleting a field wipes its values" — backwards.** The builder wrote only
  `module.fields`; every record kept its `data` keys. Nothing was destroyed —
  but a user who "deleted" a field still had that data in the workspace, in
  every JSON export, and saw it return if a field with the same key was
  recreated. A disclosure problem, not a loss one. **Now fixed — see §22.**

### What changed

**The first account is only special on an unnamed deployment.** `isFirst` used
to mean `platformAdmin` unconditionally, and `checkSignup`'s bypass 3 let that
account past a shut gate — so whoever found a freshly deployed URL first owned
the instance. Both now require `ADMIN_EMAILS` to be empty, which is the only
case the bootstrap exists for (§16); with operators named, bypass 2 already
lets them in. Guarded by three tests, including *"a deployment that named
nobody still lets its first visitor in"* — the bricking case the bypass is for.

**An org owner cannot reach a platform admin.** `resolveTarget` scoped by org
but never compared roles, and a platform admin has an org like anyone else — so
its owner could demote, disable or delete them. 404, not 403, like every other
cross-boundary answer here.

`wouldStrandDeployment()` lives inside `deleteAccount()` rather than at the call
site, for the reason that function already documents. **No current path reaches
it**: this route refuses any action on your own account, and an owner now 404s
on a platform admin, so the actor is always a *second* platform admin and there
are at least two. That is stated in the code and deliberately **not** covered by
a test, because any test written for it would pass whatever the guard did. It
is the backstop for the next route added — a self-serve "delete my account" is
the obvious one.

**Restoring a backup merges by default.** It used to tombstone every local row
absent from the file, and tombstones sync, so recovering one deleted module
deleted from *every colleague's device* everything added since. The
confirmation said "REPLACES everything currently on this device", understating
it on both counts.

- **`importState` takes a `mode`, and there are three.** `merge` puts the
  incoming rows and touches nothing else; `replace` tombstones what is missing,
  so the removal travels; `adopt` hard-clears first, for a store being seeded
  from scratch. The old pair was a `tombstone` boolean whose *off* branch was a
  hard `DB.clear` — so "do not broadcast deletions" and "do not delete
  anything" looked like one option and were not. Naming three is what stops
  that being rediscovered; I hit it while writing the test.
- **Replace names its cost first** — the number of rows about to go, and on a
  team, that they go for everybody.
- **`closeModal()` now fires `crmb:modal-closed` on `#modal-root`.** A modal
  that answers a question can be dismissed by Escape or a backdrop click,
  neither of which goes through its buttons; without a signal, a
  promise-returning prompt never settles and its caller waits for ever. The
  older prompts (`askAboutAnonWorkspace`, the beta notice) have the same latent
  gap and simply offer no close affordance.

**Test traps hit while writing this:**

- **Two armed `page.once('dialog')` handlers both fire on one dialog**, and the
  second throws *"Cannot accept dialog which is already handled"* — which
  surfaces several steps later as an unrelated timeout. One handler, on the one
  click that raises a confirm.
- **The merge test asserts both halves.** That the restore restored (otherwise
  a no-op import is indistinguishable from a good merge) *and* that nothing
  else moved — checked at the server via `/api/sync?since=0`, since that is
  what propagates. It asserts **no tombstone was created**, not merely that the
  row survived: an import-time tombstone carries `stamp: true`'s clock, so it
  would be newer than the colleague's row and would win.

### Still open, deliberately

Only 2b from the audit remains: a delete cannot be undone, because a tombstone
discards the body. Costed and deliberately not built — keeping bodies would
mean a workspace deleting to free space frees none until the retention window
passes, against the lever §24 added, and a mass delete would temporarily double
that tenant's footprint. See §26 and `docs/archive/TIER-2.md`.

---

## 22. Removing a field, and what happens to what was in it

The builder writes `module.fields` and nothing else, so removing a field left
every value in place under its key. Nothing was destroyed — but the person who
removed the column believed it was, and those values still travelled in every
JSON export, sat in the admin export, and came back the moment a field with the
same label was recreated (`slug()` produces the same key). That is the wrong way
round for anyone who removed a column *because* of what it held.

**Purge is the default, and it is not silent.** "Deleted" should mean deleted —
but a schema change that destroys months of data without saying so is the shape
§21 has just finished removing from the restore path. So `askAboutRemovedFields`
names the fields, counts the records holding a value, and offers *Delete the
values* (primary) · *Keep the data* · *Cancel*.

**Traps:**

- **A rename is not a removal.** `existingKey` is carried through the save, so a
  relabelled field keeps its key and never reaches this prompt (§4). Guarded by
  *"renaming a field is not a removal"*.
- **The question is a NESTED layer, not `openModal`.** `openModal` replaces the
  whole of `#modal-root`, so asking from inside the builder would destroy the
  builder — and *Cancel* would then cost the user every unsaved edit rather
  than returning them to it. `openNestedModal`/`closeNested` append and remove
  one layer; a global `closeModal` still clears both, which is what Escape
  should do.
- **The decision happens before the module is written.** Cancelling has to leave
  the schema untouched, not half-applied.
- **Purged rows are re-stamped.** A row whose `updatedAt` did not move is a row
  the sync engine never sends — the values would be gone here and still present
  for everyone else. Every write goes out in one tick via `Promise.all`, because
  an IndexedDB transaction commits when the microtask queue drains (§10).
- **A new field is not a list column by default.** An E2E test asserting "the
  column is gone" passes on a column that was never there; the fixture checks
  `.bf-list` so the assertion means something.
- **The field id is the slug, and `slug()` uses underscores** — `#f-private_note`,
  not `#f-private-note`.

**Not retroactive.** This stops new ghost data; workspaces that already removed
a field still hold the old values. A cleanup pass over existing data was not
written, because rewriting every record in every workspace on the strength of a
guess about which keys are orphaned is a bigger and more dangerous act than the
problem. If it is ever wanted, it belongs in Settings as something a user runs
against their own workspace, having been shown what it found.

---

## 23. Currency relabels, and now says so

`fmtCurrency` formats the stored number with the workspace's currency code.
That is right — there are no exchange rates in this app and inventing one would
be worse than not having it — but it is not what the word leads people to
expect: switching USD to EUR turns a $10,000 deal into a €10,000 deal and moves
every pipeline total with it. It used to do that in silence.

`confirmCurrencyChange` names the count of records holding an amount, says
plainly that nothing is converted, and points at the export/convert/import path
for anyone who meant the other thing.

**Asked only when there is money on the line.** With nothing stored in a
currency field there is no misreading to prevent, and a dialog over an empty
workspace is noise. Same rule as `askAboutRemovedFields` (§22), and both
directions are tested — one test fails if the prompt never appears, another
fails if it appears when there is nothing to mislabel.

**A refusal must move nothing**, including the business name typed alongside it
in the same form, so the check runs before any of the save is applied.

### The reload flake, actually fixed

*"data survives a reload"* failed intermittently under full-suite load and never
in isolation. The first fix was wrong: it waited for the sidebar **after** the
reload, which addressed the symptom. The cause was that the test reloaded
immediately after clicking save, racing the write — so the record was lost
while the modules, written during onboarding and long since committed,
survived. That asymmetry was the clue. Waiting for the row to render before
reloading is waiting for `DB.put` to have resolved, since the re-render follows
it. Confirmed over four consecutive full runs.

---

## 24. Operator controls — COMPLETE (A, B and C)

**This section is the resume point for this work.** All three stages shipped;
what follows is what was built and why, not a to-do list. The reasoning behind the
shape — why Render cannot be read, why orgs need their own gate, the full
verification list — is in `docs/archive/OPERATOR-CONTROLS.md`. Six asks, and the first
thing to know is that they are not six pieces of work — two were already done
and one cannot be built as worded.

| Ask | Where it stands |
|---|---|
| Total users and orgs | ✅ Stage A — `GET /api/admin/platform` + the Deployment and Organisations cards. Was: `/health` reports both to a platform admin, but `/api/admin/stats` has no org count and there is **no org list at all** — `listOrgs()` is used only by the backup export |
| Per-org and combined usage | ✅ Stage A — `usageByOrg()`, measured with `$bsonSize` (Mongo) and serialised length (file store), cached 30s |
| Resource quotas | ✅ Stage A — three meters: Mongo, RSS, monthly egress. Uptime hours dropped — see below |
| Halt user signups | ✅ Done — the mode switch, §16 |
| Halt org creation | ✅ Stage B — `orgCreation`, with the invited-colleague exemption |
| Pause/resume a user | ✅ Done — `disabled` + `PATCH /api/admin/users/:id` |
| Pause/resume an org | ✅ Stage B — read-only sync, reversible, destroys nothing |
| Telegram alerts | ✅ Stage C — five rules, escalate-only, evaluated off the keep-warm ping |

### Three decisions taken before any code

> **Before removing or trimming any of this, read
> [`docs/archive/TELEMETRY.md`](docs/archive/TELEMETRY.md).** It records why the
> egress counter exists given that Render's own dashboard reports bandwidth
> (the counter's job is the *alert* — Render's dashboard is pull, not push),
> why RSS is the weaker meter of the two if one has to go, and the inventory of
> all eight files a removal touches. Written when that removal was proposed
> and declined, so the argument does not have to be reconstructed.

**Three meters, and uptime hours are deliberately not one of them.** Render
does not publish free-tier consumption and a number we cannot check is worse
than none, so that idea was dropped. What is measured instead, all from inside
the process: **Mongo `dataSize + indexSize` / 512 MB** (already built),
**`process.memoryUsage().rss` / 512 MB**, and **outbound bytes this month /
5 GB**. Two things about those last two that are easy to get wrong later:

- **RSS is a point sample taken when `/health` is hit**, so it catches a *leak*,
  not a burst — the sudden allocation that OOM-kills the container happens
  between pings and will not be seen. A high-water mark is stored alongside so
  the panel shows the worst observed rather than the last glance. Do not
  present it as protection against an OOM kill.
- **The egress counter must never write per request.** It accumulates in memory
  and flushes on an interval; a crash costs one interval's bytes, which is far
  cheaper than write amplification that would itself consume the storage quota.
  It counts application bytes, not what Render bills, and
  `EGRESS_LIMIT_BYTES` should be checked against Render's current plan — a
  wrongly encoded limit is worse than none.

**Org creation needs its own gate, and this is not tidiness.** Every signup
mints an org, so pausing signups today also locks out every *invited teammate*
of every existing customer: a colleague must create an account (→ an org)
before `/api/org/join` can move them. So `orgCreation: 'open' | 'closed'`
refuses a signup that would mint a **new** org while still admitting one
carrying a pending team invite. A version that simply refuses every signup has
missed the entire point, and there is a test for that case specifically.

**The alert loop runs on `/health`.** UptimeRobot already hits it every 14
minutes (§17), so no scheduler is needed. Evaluation happens after the
response, never blocking it, and behind the same platform-admin/`HEALTH_DETAIL`
check the counts already sit behind — `/health` is public and must not grow for
anonymous callers.

### Stages

- ✅ **A — see it.** Shipped. `GET /api/admin/platform`: combined counts, per-org rows
  (members, records, modules, **bytes**, last active), and the three meters with
  the `ok`/`warn`/`critical` levels `usageReport()` already computes. Per-org bytes
  is the real work: `$bsonSize` in a `$group` by `orgId` on Mongo, summed
  `JSON.stringify` lengths in the file store. **Measured, never
  records × a constant** — §17 records why that estimate reads fine right up
  until the tier fills. Cache with a short TTL from the start; it scans.
- ✅ **B — the levers.** Shipped. `orgCreation` beside the signup mode, same `platform`
  document and the same precedence rule (§16: a panel decision beats the env
  var and survives a redeploy). Org suspend/resume via `suspendedAt` +
  `suspendedReason`: sync refuses writes with a named reason, sign-in still
  works, **nothing is deleted**. `deleteAccount` stays the only thing that can
  remove a workspace (§5) and nothing here may touch it. The wording is one
  word from deletion and a decade of data apart — §15's lesson.
- ✅ **C — alerts.** Shipped. Mongo storage at 60/85/95%, RSS at 70/85%, egress at
  60/85%, signup spikes, and a single tenant over 25% of the database. **Escalate-only and never
  repeated at the same level**: state per rule in the `platform` document, so
  60% notifies once and stays quiet until 85%, re-arming only after a drop. An
  alert that fires hourly trains you to ignore it, which is worse than none.
  Reuses `webhookRequest()` so Telegram gets the shape it reads (§18), plus a
  test button that proves the wiring without waiting for a threshold.

### Traps expected here

- **`/health` is public.** Anything added must sit behind the existing detail
  check and must not lengthen the anonymous response.
- **A dead webhook must never break `/health`** — same rule as the feedback
  notifier: evaluate and store first, notify after the response.
- **Suspension is reversible and customer-visible.** It is not deletion, and
  the screen has to say which.

### Stage A as built

`GET /api/admin/platform` (platform admin only, 30s cache because
`usageByOrg()` scans) returns combined counts, a per-org table sorted heaviest
first with each tenant's share of stored bytes, and the three meters.

**Two things found while building it:**

- **The egress counter has to flush on SIGTERM.** Render's free tier spins down
  after ~15 minutes idle and signals to do it, so with only an interval flush
  every sleep lost whatever had been counted since the last write — on a quiet
  service, most of it. The month's figure would have read far too low to be
  worth having. Bounded by a 2s race so a slow database cannot stop the process
  exiting. Guarded by *"egress is counted, persisted, and still there after a
  restart"*, which fails without the handler.
- **A pre-existing bug in the access-requests panel**: it read
  `access.usage.percent`, but `usageReport()` returns `percentOfLimit`, so the
  storage warning rendered "Storage is at undefined%".

The per-org test asserts that **one large record outweighs six small ones**.
That is the assertion that fails the moment anybody swaps the measurement back
for records × a constant, which is the trap §17 already records.

### Stage B as built

`orgCreation: 'open' | 'closed'` in the `platform` document, same precedence as
the signup mode. Closed refuses a signup that would mint a new org **unless it
carries a valid team invite** — checked, never consumed, because
`redeemPendingInvite` spends it a moment later and burning it twice strands the
joiner in an org of their own. The invite rides the Google round trip in
`crmb_invite`, beside `crmb_beta` and for the same reason.

Suspension is `suspendedAt` + `suspendedReason` on the org. `/api/sync` still
**pulls** for a suspended org and refuses only the push, returning
`readOnly` + `readOnlyReason` — a sync that silently stopped working is
indistinguishable from the bug the tester was about to report.

**The trap that would have cost real data.** `Cloud.sync()` set the push
watermark unconditionally. On a refused push that marks the rows as sent, so
they are never offered again — resuming the organisation would restore writing
while having quietly lost everything typed during the pause. The watermark now
moves only when the push was accepted; the cursor still moves either way,
because the pull did run.

**And the test for it passed on the bug first time.** One record sits exactly
on the watermark and client selection uses `>=` (§10), so it is re-sent even
when the watermark wrongly advanced. It takes **two records with distinct
timestamps** — the earlier one is what falls below the line and disappears.

Other notes: the read-only toast is latched, or the debounced push would fire
it on every keystroke; `platformCache` is invalidated on suspend, since the
table it feeds shows exactly that column; and `.mode-switch` now matches two
rows, so the older E2E test addresses its own by `:has([data-mode])`.

**Vacated orgs are tidied now** — see §25.

---

## 25. Stage C: alerts, and the placeholder orgs

### Where the loop runs, and who for

UptimeRobot hits `/health` every 14 minutes to keep the free tier awake (§17),
so the rules are evaluated off the back of that — after the response, never
blocking it, and the body is unchanged.

**It runs for every caller, not only a platform admin.** The detail check on
`/health` governs what the body *discloses*; evaluating is not disclosing. An
earlier draft of this plan said to gate it behind the same check, which would
have meant the keep-warm ping — the only regular caller there is — never
triggered anything. `ALERT_MIN_GAP_MS` (5 min) keeps a burst of pings to one
pass.

### Escalate-only

Each rule stores the step it last announced in `platform.alerts`. Crossing 60%
speaks once and then stays quiet until 85%; dropping back under the lowest step
re-arms it. A rule that fired every fourteen minutes would train the operator
to ignore the channel, and an ignored alert is worse than none. Guarded by *"a
crossed threshold is announced once"*, which makes four pings and requires
exactly one message — it fails the moment the `step > was` comparison becomes a
bare truthiness check.

Rules: storage 60/85/95, RSS 70/85, egress 60/85, more than
`SIGNUP_SPIKE_PER_HOUR` signups in an hour, and one tenant over
`TENANT_SHARE_LIMIT`% of the database. `POST /api/admin/alerts/test` fires a
message and reports what every rule currently sees, so "nothing is wrong" can
be told apart from "the webhook has been broken since I rotated the URL".

### Tidying the org a joiner leaves behind

Signing up only to accept an invite mints an org that is abandoned seconds
later, inflating the tenant count the panel exists to make trustworthy.
`tidyVacatedOrg` removes it — but the guard is deliberately stricter than the
"no records" rule it was asked for: **no members left, no records AND no
modules.** Somebody who built their own CRM and then joined a team without
bringing it has a workspace, not a placeholder; deleting it would be the silent
destruction §12 warns against. That org stays and shows in the table with
nobody in it, which is the honest outcome and has its own test.

**The trap, and it is a nasty one.** `FileStore.updateUser` does
`Object.assign` on the stored object and `getUserById` hands back that same
reference, so `req.user.orgId` silently becomes the *new* org the moment the
join's update runs — and the tidy-up then inspected the org they had just
joined, found a member, and did nothing. `MongoStore` returns copies and does
not behave that way, so the two backends would have disagreed, with the file
store — the one the tests run on — being the broken half. **Read anything you
need about the previous state before the write**, which is what `vacatedOrgId`
is for.

---

## 26. Tier 2

**Resume point for this work.** Reasoning is in `docs/archive/TIER-2.md`; status here.

- ✅ **2c — field-level merge.** Two people editing different fields of one
  record both keep their edit. Shipped — see below.
- ✅ **2a — roles that cannot delete.** `contributor` and `viewer` on the
  ladder, enforced in the `applyPush` seam. Shipped — see below.
- ☐ **2b — undoable deletes.** Costed and deliberately not built.

### The fact that reframes 2a, found while planning

**A tombstone discards the record body.** `js/db.js` writes
`{ id, moduleId, deletedAt, updatedAt }`; `server.js` writes `doc: null`. So a
deleted record is *not* recoverable for 180 days — that window governs how long
the **gravestone** survives so offline devices learn about the delete, not the
row. Contents are gone everywhere the moment a delete syncs.

Anyone reading "tombstones are kept for 180 days" and concluding undo is nearly
free will be wrong. Undo requires **keeping the body**, which on a 512 MB
shared tier means a workspace deleting to free space would free none until the
window passed — directly against the lever Stage B just added — and a mass
delete would temporarily double that tenant's footprint, which is the exact
shape the Stage C alerting exists to catch.

### The trap 2c will hit

The merge must happen **on the server**, not only the client. `applyPush` skips
an incoming row that is not newer (`prior.updatedAt >= updatedAt → continue`),
so a client-side field merge would still be overwritten by whoever pushed last.
That is a change to the heart of the sync engine, which already carries six
recorded traps (§10) — and `updatedAt` must keep its existing job of driving
selection and the cursor, or the delta protocol breaks (§3). Only the contents
merge per field.

Also: §22's field purge **deletes keys**, and an absent key has no clock — so a
purge could be silently undone by a stale copy unless it becomes a clocked
change. The two features fight if that is missed.

### 2c as built

`fieldsAt: { key: ts }` inside `doc`, so the stored shape is unchanged.
`stampChangedFields` advances a key's clock only when its value actually moved,
so a record nobody has edited since creation carries no map and costs nothing.

**A missing key means clock 0, never the row's `updatedAt`.** That is the whole
design and it is easy to get backwards: falling back to the row clock means a
copy that never touched a field still claims to have set it when it was last
saved, so an untouched stale value beats somebody's real edit. Zero says "as
far as this copy knows, nobody ever edited this" — which is what absence means,
and it makes a partial map correct too. Guarded; swapping in the row-clock
fallback fails three tests.

**The merge runs on the server**, in `applyPush`, and **runs even when the
incoming row is newer** — a newer row can still carry a stale value for a field
somebody else changed, and skipping the merge on that branch is exactly how the
edit is lost.

**A merged row is NOT added to `won`.** `won` is what a push must not have
echoed back, because the device already has it — but a merged row is not what
they sent, so the pusher has to receive it or their screen keeps showing the
value they just lost.

**`updatedAt` becomes `max(prior, incoming)`,** and the reason is client-side:
`mergeChanges` skips any incoming row whose clock is not newer than the local
one, so the device that fed the merge would ignore the result and keep its
stale copy. The test asserting it has to run **immediately after the merge** —
the next push heals a wrong stamp and hides the defect, which the first version
of that test did, passing on the bug.

**§22's purge now clocks its removals.** A key with no clock counts as never
edited, so a colleague still holding the value would win the merge and put it
back. Its own test fails if the purge forgets.

Tombstones stay whole-row: deleting a record is not a field edit.

### 2a as built

`canEditRecords` and `canDeleteRecords` beside `canEditSchema`, enforced in the
same `applyPush` seam and refused the same way: the response carries the
server's own copy, the client overwrites its local row, the edit un-happens.

**The refusal carries WHY, and it has to.** The first version had the client
choose the wording from `Cloud.user.role` — and it named the wrong rule,
because this fires precisely when the client's idea of its own role is stale.
That is the entire scenario. The server knows and the server decides, so the
server says: `reason: 'readonly' | 'nodelete'` rides along with the rejected
row. Asking the client to guess produces a confident, wrong explanation.

**A refused creation is answered `absent`**, so `applyRejections` purges it
rather than tombstoning — a gravestone would be pushed, refused and reverted on
every subsequent sync, forever (§14's trap, now covered for records too).

`TEAM_ROLES` is what an owner may hand out, and `platformAdmin` is deliberately
not in it. The self-demotion strand check now fires for **any** step down from
owner, not just the one rung that used to exist.

The Team screen's role toggle became a picker: a four-rung ladder does not fit
a button that flips between two values, and the confirmation says what the rung
means rather than just naming it. On cancel or failure the control is put back,
or it sits there lying about the state.

---

## 27. The documentation pass, and where docs go stale

An audit of every document against the shipped code, after Tier 1, the operator
controls and Tier 2 landed in quick succession. Recorded because **the pattern
of what was stale is more useful than the list of fixes**, and it will happen
again.

**The worst drift was not in the working notes — it was in the user-facing
docs nobody re-reads.** `CLAUDE.md` gets a section per change because that is
what this file is for. The others are written once and quietly rot:

- `docs/manual.html` still said *"sync is last-write-wins on the whole
  workspace… if several people need to edit at once, give each of them their
  own account"*. Untrue since per-record sync, and it had survived teams,
  invites, roles **and** field-level merge. It had no team section at all.
- `docs/product-tour.html` told prospects *"shared team workspaces are the next
  major piece of work"* — a shipped feature described as unbuilt, on the page
  written to sell it.
- `docs/ONBOARDING.md` told the person rolling this out to set the expectation
  that a workspace is **per account**, and to give each colleague their own.
  That is now the opposite of the advice they need.

**The rule that follows:** a change that alters *what a user can do* has to be
walked through `USER-GUIDE.md`, `manual.html`, `product-tour.html`,
`ONBOARDING.md`, `DEMO-SCRIPT.md` and `BETA.md`'s tester note — not just this
file and the README. `manual.html` and `product-tour.html` are the easiest to
forget because they are HTML and nothing greps them by habit.

**And the same rule for the wire contract: `docs/API.md`.** This was proved the
hard way almost immediately. API.md was written in §29's reorganisation and was
stale **one commit later** — §30's Phase 4 added per-route body limits, rate
limits and a non-leaking error handler, every one of which changes a status code
a caller sees, and none of which reached the document until it was audited
again. A doc describing a contract goes stale the moment the contract moves,
which is more often than a doc describing a feature.

**Two specific traps:**

- **`docs/manual.html` mirrors `USER-GUIDE.md` section for section, and drifts
  silently.** Both have 14 numbered sections with the same titles, so a
  matching table of contents reads as "in sync" while a section's *contents*
  are years apart. Diff the prose, not the headings.
- **Its CSS defines `.note.tip` and `.note.caution` and nothing else.** A
  `.note.warn` renders as an unstyled box that still looks plausible in a
  screenshot. Same for `.muted`, which does not exist there at all.

**Plan documents keep their original numbers.** `docs/archive/TIER-2.md` and
`docs/archive/OPERATOR-CONTROLS.md` are the reasoning as it stood, not live status —
their verification sections now say the test counts are the baseline at the
time of writing and point at §2 for the current figure. Editing a plan's
premises after the fact loses the reason the plan was shaped that way.

**Two facts that had never reached the user-facing docs at all**, because they
were consequences of decisions rather than features:

- **A delete cannot be undone**, and on a team it deletes for everybody.
  Tombstones discard the body (§26), so this is a property of the design, not a
  gap waiting on a bin. It is now stated where deletes are described, next to
  the role that prevents them.
- **Roles govern what you can do, not what you can see.** Every member still
  sees every module. Stated as an honest limit in the tour, the demo FAQ, the
  onboarding checklist and the tester note, rather than left to be discovered.

`DEPLOYMENT.md`'s environment matrix had none of the limit and alert variables;
it now carries them with defaults, and the signup gate's bypass order is
written out in full, because the *order* is the security property (§16, §20)
and a list of modes does not convey it.

---

## 28. The server served the whole repository

`express.static(__dirname)` published every file in the repo. On the live
deployment that meant `/CLAUDE.md` (74 KB of these notes), `/DEPLOYMENT.md`,
`/docs/BETA.md` (the operator runbook), `/package.json` and `/.git/config`.
No credentials were in any of them — that was checked, not assumed — so this
was disclosure, not a breach. The one that could have been a breach:
**`/data/store.json`**. It is gitignored so it never shipped, but a deployment
that lost `MONGODB_URI` falls back to the file store, and would then have
served every customer's records on a guessable path.

**Why it survived this long is the part worth keeping.** Two behaviours hid it
from exactly the probe you would run:

- **Linux is case-sensitive.** The obvious guess, `/claude.md`, does not match
  `CLAUDE.md`. It missed the file entirely.
- **The SPA catch-all answers everything.** A path that matched no file fell
  through to `app.get('*')`, which returned **200 and the app shell**. So
  `/claude.md`, `/cla` and `/totally-made-up-path` all looked identical to
  `/some/real/route`. "No such file" and "found the app" were indistinguishable
  from outside, and nothing on the site 404s to contradict you.

That is why this was found by reading `server.js` rather than by probing it,
and why the smoke test now asserts **content, not status**.

### What replaced it

Three explicit lists — `ASSET_DIRS` (`css`, `js`, `fonts`, `icons`),
`PUBLIC_ROOT_FILES` and `PUBLIC_DOCS` — and nothing else is reachable.

- **The extensionless aliases are load-bearing.** `express.static`'s
  `extensions: ['html']` went with the wildcard, and it is what served
  `/privacy` and `/terms` — the URLs on Google's OAuth consent screen. Losing
  them silently would un-publish the consent screen. Generated from the
  `.html` entries rather than hand-listed, so the two cannot drift.
- **`docs/manual.html` and `docs/product-tour.html` stay public and their
  paths are frozen.** They are customer-facing and the URLs may already be in
  somebody's inbox. Everything else under `docs/` is now unserved, which is
  what makes internal docs private **by construction rather than by
  obscurity** — the thing the doc reorganisation was going to have to work
  around.
- **Cache headers had to come along.** `sw.js` must stay `no-cache` and
  `.woff2` immutable; those lived in the wildcard's `setHeaders` and would
  have been dropped silently. A stale service worker is a bad way to find out.

### The catch-all now 404s anything that names a file

Routing here is entirely hash-based (`#/m/<id>`), so the server never needs to
answer an extensioned path with the shell. Serving 200 + 40 KB of HTML for a
missing icon was both wasteful and the thing that made the exposure invisible.

**`path.extname()` alone is not enough, and this is the trap.** It returns `''`
for `/.git/config` and `/.env`, because those basenames carry no extension — so
an extension-only test leaves precisely the dotfile paths this exists to close.
The dot-segment check is the other half. Removing it looks like tidying and
re-opens `/.git/`.

### Verification

Eight paths asserted unreachable in `tests/smoke.mjs`, checked against the
broken state per §9: on the pre-fix server the new block fails **seven times
with byte counts** (`HTTP 200 exposed internal working notes (73790b)`).
`/.env` warns rather than fails there, honestly — the file does not exist
locally, so it fell to the shell.

The assertion is **content-based on purpose**. A status-only check would pass
against the old server for every path the catch-all answered, which was all of
them. `scope.js`, `tour.js`, `legal.css` and `sw.js` were also missing from
`ASSETS`; an allow-list makes that gap load-bearing, so they are covered now.

**No `CACHE_VERSION` bump.** Nothing precached changed — `server.js` is not in
the app shell.

**Trap hit while testing this:** §4's `pkill -f "[s]erver\.js"` rule. The
bracket protects the pattern from matching itself, but the compound command
*also* contained `git stash push -q server.js`, so pkill matched the shell
running it and killed the job mid-way, leaving the stash unpopped. Kill by
recorded PID when the command has to mention the file.

---

## 29. How the documentation is organised

§27 fixed what the documents *said*. This fixes what a newcomer can *tell about
them* — which is a different failure, and the one that bites at handover.

**Status is declared, never inferred.** Git dates cannot carry it: §27's pass
touched every file on one day, so last-modified says nothing. Three places, and
the difference is the whole scheme:

| Where | Kept true? |
|---|---|
| `CLAUDE.md` | yes — a section per change |
| `docs/` | yes |
| `docs/archive/` | **no, deliberately** |

Lifecycle lives in the **directory**, so it is visible in a file listing before
anything is opened; every file also carries a one-line banner, so opening one
directly says the same thing. `docs/README.md` routes by task and audience.

**The rename is the substance, not tidiness.** `docs/ARCHITECTURE.md` →
`docs/archive/SCALING-OPTIONS.md`. It was an Options A–E deliberation under a
name that promises current reference, and it was **actively misinforming**: §1,
*"Where we are today"* — the first thing a new engineer reads — had rows keyed
`userId` (they are `wsId`), three roles (there are five), *"workspaces are still
per-account, deliberately"* (shared workspaces shipped four stages later), and a
16 MB document ceiling that per-record sync removed.

**The detail worth keeping:** §27's own pass had patched that file's *proposal*
sections — Option B lists all five roles correctly — while leaving "where we are
today" untouched. The document ended up describing the future more accurately
than the present. That is what patching a historical document in place does, and
it is the argument for freezing rather than maintaining. The known-false list is
in `docs/archive/README.md` so nobody has to rediscover it.

**Frozen does not mean deletable.** A plan records the options rejected and the
cost that made something not worth building. None of that survives in the code,
and it is exactly what is needed before reversing a decision.

### `docs/API.md`

43 routes across six boundaries — the biggest single blocker to anyone extending
the backend, since the contract existed only in `server.js`.

It **routes rather than restates**. Each section points at the `CLAUDE.md`
section holding the reasoning instead of re-explaining it, because a second
copy is what drifted in the `manual.html` case (§27). What it does state
directly is the wire contract: the two clocks, the wire-item shapes, the
rejection envelope (`reason` / `absent`), and the bypass order — which is a
security property and reads as a list of modes if written casually.

### `CLAUDE.md` has a topic index now

Sections are numbered in build order and several are named for the stage that
produced them — "stage C", "beta stage 2" — which is meaningless to anyone who
was not there. You could not find "how do permissions work" without knowing it
was Stage C.

**The numbers do not change.** Renumbering would break every cross-reference in
this file and in the others. The index maps topic → section and leaves the
numbering alone.

### Deliberately not written

Recorded so they are not mistaken for oversights:

- **No `SECURITY.md`.** The model is real but lives across §5, §13, §16, §17,
  §20, §21, §28 and §3's invariants. A consolidated copy becomes a second source
  that disagrees within a quarter. If it is ever wanted it should be a **map**
  into those, not a re-explanation.
- **No changelog** — git history plus these sections carry it.
- **No architecture document** — §1, §3, §10 and §11 are it. The file that was
  named `ARCHITECTURE.md` never was one.

### Two things this reorganisation depends on

- **Internal docs are private by construction** (§28), not by obscurity. Only
  `docs/manual.html` and `docs/product-tour.html` are served, and **their paths
  are frozen** — they are customer-facing and the URLs may already be in
  somebody's inbox. Verified: every other file under `docs/`, including the two
  new ones, returns 404.
- **`.claude/skills/verify/SKILL.md` said "Playwright, 24 journeys"** while the
  suite had grown past 70. It was unindexed, so nothing walked it. It now points
  at §2 for counts rather than carrying its own — a number written in a second
  place is a number that goes stale, which is this section's thesis in one line.

---

## 30. Security audit — COMPLETE (phases 1–5)

**This section is the record of what the audit found and changed.** The plan
and the reconnaissance are in `docs/archive/SECURITY-AUDIT.md`, which is frozen.
All five phases shipped; the per-phase findings are below.

**Read the *false* findings as carefully as the real ones.** Four things the
checklist asked for were already correct or did not apply here, and a later
reader working from a generic checklist rather than this source would "fix"
them and make the code worse. They are marked throughout.

A full-application audit against a checklist supplied from outside, **checked
against the code rather than accepted** — §21's treatment, where six of eight
claims held and two did not.

### Phases

- ✅ **1 — Auth and session.** Shipped — see below.
- ✅ **2 — Injection and data integrity.** Shipped — see below. Three of the
  four suspicions were **false**; the fourth is a guard, not a fix.
- ✅ **3 — XSS.** Shipped — a real stored-XSS vector, closed. CSP moved to
  Phase 4, where the other headers land.
- ✅ **4 — Network hardening.** Shipped — see below. The SSRF finding was
  **false**; the rate-limit design changed once the tests disproved it.
- ✅ **5 — Supply chain and operational.** Shipped — see below.

### The checklist assumed a different stack, and that is load-bearing

Ticking a mitigation that was never applicable is worse than no tick. There is
no Mongoose, no `axios`, no template engine, no build step and no frontend env
vars. Four production dependencies: `express`, `cookie-parser`, `jsonwebtoken`,
`mongodb`.

**"Verify ID tokens with `google-auth-library`" does not apply.** This is the
authorization-code flow: the server exchanges the code with Google's token
endpoint and calls `/oauth2/v2/userinfo` **server-to-server over TLS**. No
client-supplied ID token is ever accepted, so there is no signature to verify.
Adding the library would add a dependency and change nothing.

### Already correct — do not "fix" these

- **OAuth state**: 128 bits of CSPRNG, httpOnly, 10 minutes, compared and cleared.
- **Cookie attributes**: all five cookies carry httpOnly + sameSite=lax + secure
  in production.
- **`SESSION_SECRET` falls back to `crypto.randomBytes(32)`** — random, not a
  static default. Restarting without it signs everyone out, which is the right
  trade and not a vulnerability.
- **CORS: no middleware is installed**, so no `Access-Control-Allow-Origin` is
  ever emitted. **Absence is the mitigation** — installing a permissive `cors()`
  would be the regression.
- **CSRF**: `sameSite=lax` plus a JSON-only API (no form-encoded parser) covers
  the state-changing routes; OAuth has its own nonce.
- **BOLA/tenancy**: already the core invariant (§5) — session-derived scoping,
  404 not 403, eight isolation tests that assert the attack.
- **NoSQL on live paths**: `/api/org/join` coerces with `String(...)`, invite
  preview uses `req.params` (always a string), the access-request listing passes
  no query parameter into a filter.
- **Secrets**: `.env` gitignored; a history scan for Google/Mongo/Telegram/OpenAI
  credential shapes returns only documentation placeholders.
- **`npm audit`**: zero vulnerabilities, lockfile committed.

### Findings marked *unknown* are unknown on purpose

Prototype pollution, mass assignment and the XSS sweep are not yet assessed.
Guessing a severity before looking is how an audit ends up reporting its own
assumptions back to itself.

### Phase 1 as built

**The finding: an unverified Google address could create an account.** Accounts
are matched by email and nothing else, so an address the holder has not proved
they control is an account-takeover vector — sign in with somebody else's
address and be handed their workspace. `/oauth2/v2/userinfo` returns
`verified_email` and it was read straight past.

**Rejects a stated `false`; does NOT reject absence.** Those are different
facts and the failure modes are asymmetric. A stated false is the attack.
Absence means Google renamed a field, and failing closed on that would lock
every user out of a working CRM for a reason nobody could diagnose from
outside. Absence is logged loudly instead. This is *not* a contradiction of
§19's "absence is not an answer" — there, absence was being read as a positive
signal; here it is read as "Google did not say", with the mitigating fact that
the whole response arrived server-to-server over TLS.

**The callback had no test at all**, which is why the bug survived: it cannot
be driven without Google on the other end. `GOOGLE_TOKEN_URL` and
`GOOGLE_USERINFO_URL` are now overridable, so `tests/oauth.test.mjs` stands up
a fake Google and exercises the **real handler** — state check, verification,
gate, upsert, session. Overriding them needs environment access, which is
already the bar for `GOOGLE_CLIENT_SECRET`.

That seam also bought the first tests for **CSRF on the callback**: a
mismatched state and a callback presenting no state cookie at all are both
asserted refused. Neither had coverage before.

Checked against the broken state per §9: removing the verification check makes
**two tests fail**, and on that server the unverified address really does get
an account — asserted by listing users as an admin, not merely by the redirect.

**`/auth/dev` passed `req.body.beta` / `req.body.invite` uncoerced** into
`getBetaCode` / `getInvite`, which build `{ code }` shorthand filters. An object
like `{"$ne": null}` would reach MongoDB as an operator. Dev-only, so defence in
depth rather than a live hole — but it is the seam every signup test drives.
Route params and cookies are strings already; **a JSON body is the one place a
non-string gets in**, which is the rule Phase 2 sweeps for exhaustively.

**`authFailure()` logs one line per failure.** A refused signup, a state
mismatch and a disabled account all redirected silently before, so a burst was
invisible. Deliberately never logged: the beta code, the invite code, the OAuth
state and the session token — all bearer credentials (§13, §16). The email is
included because it is what makes a burst diagnosable and it is already stored
on the account.

### Phase 2 as built — mostly a list of things that were already fine

The valuable output here is the **negative** result, recorded so nobody
"hardens" any of it later by reading a generic checklist rather than the source.

**No server-side JavaScript execution.** `$where`, `mapReduce`, `$function`,
`$accumulator` and `eval` do not appear anywhere in `server.js`.

**NoSQL injection is not reachable — swept exhaustively, not spot-checked.**
Filters are built as `{ email }` / `{ code }` / `{ id }` shorthand, so the
control is coercion at the call site. Every one was walked:

- **`req.params` is always a string** in Express, and seven store calls take one
  directly. Nothing to do.
- **`req.query`** is coerced at every use (`String(...)`, `Number(...)`) or
  compared in a way that fails closed — an array `state` is `!==` the cookie and
  is refused.
- **`req.body`** was the one real gap, and it was `/auth/dev`'s `beta`/`invite`,
  closed in Phase 1. Everything still uncoerced is validated against a fixed
  allow-list *before* use (`TEAM_ROLES.includes(role)`, `mode`, `status`,
  `decision`) — an object fails `includes` and fails `!== 'open'`.

**Mass assignment is not present.** Both role-changing routes build an explicit
patch object; neither spreads `req.body`. `PATCH /api/admin/users/:id` allows
exactly `role` (from `TEAM_ROLES`, with `platformAdmin` gated on the caller
already being one) and `disabled` (`typeof === 'boolean'`). There is no
Mongoose, so the `findByIdAndUpdate(req.body)` shape the checklist warns about
has no equivalent here.

**Prototype pollution: probed, and nothing was exploitable.** A record pushed
with `__proto__`, `constructor` and `prototype` as field keys — through both the
create path and the merge path — polluted nothing, and `/api/me` did not grow a
property. Three unrelated facts happen to make that true:

1. **There is no `for...in` anywhere in the codebase**, so an inherited property
   is never enumerated.
2. **Every merge except one uses spread**, which *defines* rather than
   *assigns* and so never fires the `__proto__` setter. That covers
   `docShell`, `importState` and the `DB.put` paths.
3. JSON serialisation drops the payload before it reaches storage.

**A guard went in anyway, and the reason is worth keeping.** Safety that emerges
from three unrelated properties is safety a future refactor removes by accident,
and `mergeFields` is the *one* place that does `obj[key] = value` with a
client-chosen key. Making it recursive to merge nested values is the obvious
next extension, and it is exactly what would make this live. `UNSAFE_KEYS`
makes the guarantee local and testable rather than emergent. The test is
written against the refactor, not against today's code.

**The UI cannot produce such a key regardless**: `slug()` turns `__proto__` into
`proto`. Only a hand-written API call or a hand-edited backup carries one.

**One tidy-up:** `req.body.name` reached `upsertUser` uncoerced. Not a filter and
not injection — but an object stored as an account's name renders as
`[object Object]` on the admin screen, for a person nobody can then identify.

### Phase 3 as built — the audit's real finding

**Values were escaped from the start. Identifiers were not.** Every record
value, module name, field label and business name already went through `esc()`
or `fmtValue`. But ids did not, because they are normally `uid()` output and so
read as obviously safe:

```
<tr data-record="${r.id}">            table row
<div class="kanban-card" data-record="${r.id}">
<a href="#/m/${m.id}">                sidebar nav, and the dashboard's recents
<input id="${id}">                    the record form, id = `f-${field.key}`
<option value="${r.id}">              relation pickers
<button data-id="${u.id}">            the admin account rows
```

**An id is not server-generated in every path, and that is the whole finding.**
`importState` writes whatever ids a backup file carries, and `/api/sync` does
`String(item.id)` without restricting characters, so a colleague pushing by
hand chooses their own. That is **exactly the threat model `safeHref` already
names** — "record values arrive from CSV imports and shared backups" — applied
to a field nobody had thought of as a value.

Proven, not argued: a record whose id is
`" onfocus="window.__pwnedById = true" autofocus x="` rendered a row whose
attribute list came back as
`["data-record", "onfocus", "autofocus", "x", "tabindex", …]`. Two attributes
that were never in the template. All three tests fail on the pre-fix code.

**`slug()` is why this stayed theoretical in the UI** — it turns `__proto__`
into `proto` and would strip a quote too, so no amount of typing in the app
produces one. Only a restored backup or a hand-written push does. The same
sentence, almost word for word, as §30's prototype-pollution note: the UI is
not the boundary, the API is.

**What was checked and was already right:** `toast()` uses `textContent`, not
`innerHTML`; `confirm()` is native and always plain text; every remaining
unescaped attribute interpolation is an internal constant (`CURRENCIES`,
`FIELD_TYPES`, `MODULE_COLORS`, `Cloud.status`) that no user can reach. The
sweep flagged 267 interpolations and all but these six were either escaped
already or structurally incapable of carrying markup.

**`CACHE_VERSION` bumped to `crmbuilder-v23`** — `js/app.js` is precached, so
§3's rule applies.

### CSP is Phase 4, deliberately

It is a header, and it should land with the other headers rather than half in
each commit. It is also not free here: `script-src 'self'` needs the **two**
inline `onclick` handlers in `js/app.js` removed and `index.html`'s inline
`<script>` block either extracted or hashed, and `style-src` would need
`'unsafe-inline'` for the 14 inline `style=` attributes unless those move too.
Bounded work, but work — and it is defence in depth, which is worth having
*after* the escaping is right rather than as a substitute for it.

### Phase 4 as built

**Headers are hand-rolled, not `helmet`.** Four production dependencies is an
asset on a shared free tier, and this is a dozen lines that need no supply
chain behind them. CSP, `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy`, `Permissions-Policy`, and HSTS in production only.

**`script-src 'self'` cost three changes before it could ship**, and with any
of them missed every page would have broken on deploy:

- the inline `onclick="event.stopPropagation()"` on link cells — replaced by
  the row handler ignoring clicks that land on an `<a>` (§4's rule, same
  behaviour, no inline script);
- `onclick="location.reload()"` on the startup-failure button;
- `index.html`'s inline `<script>` → **`js/boot-icons.js`**. A file rather than
  a CSP hash on purpose: a hash breaks silently on a whitespace change, and the
  symptom is icons quietly not appearing.

**`style-src` keeps `'unsafe-inline'`, deliberately.** 14 inline `style=`
attributes carry genuinely dynamic values — a module's colour, a meter's width.
Inline *style* cannot execute script, so this buys most of the protection for
none of the churn. Moving them to CSS custom properties would close it and is
not worth doing today. Say that rather than implying the CSP is airtight.

**Body limits are per route now.** 64 KB by default; `/api/sync` and
`/api/data` opt into 8 MB because a push legitimately carries a workspace.
The old single global 8 MB handed an anonymous caller a cheap way to make the
process allocate on *any* endpoint.

**The rate limiter got narrower after the tests disproved the first design.**
It started on `/auth/dev` and the callback at 20/min, and **the Node suite
failed** — which was the limiter working, and the design being wrong:

- **`/auth/dev` is not limited.** It 404s in production, so a limit there
  protects nothing real while throttling the seam every test drives. A limit
  loose enough for the suite would be too loose to matter anyway.
- **Sign-in generally is not limited, because there is no password to guess.**
  Google owns authentication. The beta and invite codes are the only guessable
  secrets and trying one costs a full OAuth round trip (§20) — the flow is
  already its own rate limiter.
- **The callback keeps a generous 60/min** for a different reason: each call
  makes the server perform a token exchange with Google, which is outbound work
  an anonymous caller can trigger.
- **`/api/access-request` at 5/min is the one that earns it** — the queue an
  operator works by hand is otherwise trivially floodable, and the 500-row
  ceiling is a backstop, not a rate.
- **`/api/sync` is never limited.** A client with a large workspace or a week
  offline legitimately pushes hard, and throttling that turns a slow sync into
  lost work.

**`trust proxy` was already 1, and that is load-bearing.** Without it `req.ip`
is Render's edge address, every client shares one bucket, and the limiter
becomes a self-inflicted outage rather than a defence. Checked before writing
the limiter, not after.

**In memory means per instance.** On a single free-tier service that is the
whole deployment. On a multi-instance one the effective limit multiplies by the
instance count — a shared counter needs a Mongo round trip per request, which
costs more than the attack it prevents at this size.

**An error handler that cannot leak.** Express's default puts the stack trace
in the response body whenever `NODE_ENV` is not exactly `production` — one
environment variable away from publishing absolute paths to anyone who can
provoke a 500, and the deployment that most needs the guard is the one that got
its env wrong. The client now gets a status and nothing else; the detail goes
to the log.

### The SSRF finding was false

`FEEDBACK_WEBHOOK_URL` is read from `process.env` and has **no runtime setter** —
there is no admin route that writes it. So no user input reaches an outbound
request, and changing it requires environment access, which is already the bar
for `GOOGLE_CLIENT_SECRET`. Recorded as false rather than "mitigated", and
deliberately *not* bounded to non-private addresses: the webhook capture test
points at `127.0.0.1`, so a block would need a bypass that weakens it to
nothing.

### A tour flake, finally diagnosed

Recorded because it was mysterious for three phases and is now not. The
intermittent failure in *"runs all six steps"* is
**`step 3 card covers its own highlight`** — `coversTarget` true when it must be
false. The tour positions its popover relative to the step target, and step 3's
`before` hook forces a sorted table (§7); when that async re-render lands after
the card is placed, the card can end up over the ring it points at.

It is a real product bug, not a test artifact — a user can see the card cover
the thing it is describing — and it is **cosmetic, unrelated to security, and
predates all of this work**. The earlier guesses about it (shared-server state,
CPU load) were wrong and are retracted. Not fixed here, because Phase 4 is
network hardening and mixing the two would muddle the commit.

### A data-loss window found while verifying this phase

Not network hardening, and recorded separately for that reason — but it was
destroying test runs, and it would have destroyed a workspace.

`FileStore.save()` did `fs.writeFileSync(file, JSON.stringify(store))`, which
**truncates the target and then fills it**. Two windows follow. A reader during
the write sees a torn file: that is what made `tests/migration.test.mjs` fail
**four runs in six** on a `JSON.parse` of a truncated store, and it was
pre-existing — verified by stashing this phase and reproducing on the old code.
The second window is the one that matters: a crash *during* the write leaves the
file truncated **permanently**, and this is the store a deployment falls back to
when `MONGODB_URI` is unset. That is every customer's data on that deployment,
and Render's free tier sends SIGTERM to spin the service down regularly.

Now a temp file plus `renameSync`. rename(2) is atomic within a filesystem, so a
reader gets the whole old file or the whole new one, and an interrupted save
leaves the previous copy intact. **The temp file must sit beside the target** —
a rename across filesystems is a copy, and a copy is not atomic. Eight
consecutive migration runs clean afterwards, against four failures in six
before.

### Phase 5 as built — CI gates

Two jobs, both in `.github/workflows/test.yml` under `security`.

**`npm audit --omit=dev --audit-level=high` is the blocking gate.** Production
dependencies only, and high or critical only. A Playwright advisory should not
block a deploy of the server, and there are exactly four production
dependencies to keep clean. A second, never-failing `npm audit` prints
everything for the record.

**gitleaks runs from a pinned, checksummed binary — not the action.**
`gitleaks/gitleaks-action@v2` wants a `GITLEAKS_LICENSE` for organisation-owned
repositories, which is a future outage on somebody else's terms. Pinning the
version *and* verifying the SHA-256 means CI runs exactly what was reviewed
here; both directions were tested, including that a wrong digest stops the job.

**Three details that would each have made the scan worthless:**

- **`--redact` is not optional.** Without it a finding prints the secret into
  the build log, and on a public repository that log is public. A scanner that
  publishes what it found is worse than no scanner.
- **`fetch-depth: 0`.** gitleaks scans git *history*; the default shallow clone
  would scan one commit, find nothing, and report clean. That is a false pass,
  which is worse than no scan because it looks like coverage.
- **Non-blocking (`continue-on-error`).** A scanner outage should not stop a
  deploy — but the result is still on the run, so it cannot be missed.

**Result on this repository:** 47 commits scanned, no leaks. That is an
independent confirmation of the hand-rolled credential-shape grep used during
reconnaissance, which is the point of running a real tool rather than trusting
my own regex.

**Confirmed on GitHub Actions**, not only locally: run #53 on `f51656d` is green
across all three jobs, with *Dependency and secret scan* finishing in 7s. The
pinned-binary approach costs nothing in wall time, which was the other reason to
prefer it over an action that needs a licence check.

### What the audit found, in one place

| # | Claim | Verdict |
|---|---|---|
| 1 | Unverified Google address could create an account | **REAL** — fixed, Phase 1 |
| 2 | Identifiers unescaped into HTML attributes | **REAL** — stored XSS, fixed, Phase 3 |
| 3 | No security headers | **REAL** — fixed, Phase 4 |
| 4 | Global 8 MB body limit on every route | **REAL** — fixed, Phase 4 |
| 5 | No rate limiting | **PARTLY** — added where it earns its place, Phase 4 |
| 6 | `/auth/dev` passed a body value into a Mongo filter | **REAL** (dev-only) — fixed, Phase 1 |
| 7 | Auth failures left no trace | **REAL** — fixed, Phase 1 |
| 8 | `FileStore.save()` could truncate the store | **REAL, and not on the checklist** — found while verifying Phase 4 |
| 9 | NoSQL injection | **FALSE** — swept every call site, Phase 2 |
| 10 | Mass assignment | **FALSE** — both PATCH routes build explicit patches |
| 11 | Prototype pollution | **FALSE** — probed, not exploitable; guard added anyway |
| 12 | SSRF via the feedback webhook | **FALSE** — env-only, no runtime setter |
| 13 | Verify Google ID tokens | **DOES NOT APPLY** — authorization-code flow, no client-supplied token |
| 14 | Permissive CORS | **FALSE** — no CORS middleware exists; absence is the mitigation |
| 15 | Static fallback session secret | **FALSE** — falls back to `crypto.randomBytes(32)` |

Eight real, five false, one inapplicable, one partial — and the one that would
have cost the most (#8) was not on the checklist at all. That is the argument
for reading the source rather than working the list.

### Left deliberately undone

- **`style-src 'unsafe-inline'`** stays, for 14 dynamic `style=` attributes.
  Inline style cannot execute script. Closing it means CSS custom properties
  throughout, and it is not worth doing today (Phase 4).
- **No `SECURITY.md`.** The model spans §5, §13, §16, §17, §20, §21, §28 and
  §3's invariants; a consolidated copy becomes a second source that disagrees
  within a quarter. `docs/README.md` records this decision.
- **The rate limiter is per instance.** A shared counter needs a Mongo round
  trip per request, which costs more than the attack it prevents at this size.
- **The E2E "flakiness" was not flakiness — see §32.** It was the E2E store
  growing across runs, and it is fixed. The guided tour's *step 3 card covers
  its own highlight* is a separate, real, cosmetic bug and is still open.

  **The recurring mistake was mine, twice:** Playwright wipes `test-results/`
  at the start of every run, so re-running to "check if it reproduces" destroys
  the trace of the failure you wanted to read. Read the trace **first**.


---

## 31. A row stamped in the past never syncs, and the app says "Synced"

Found from a live deployment, not from the tests: the admin dashboard said
**12 records** while the device showed **214**, and both were telling the truth.

**The two counts were never the disagreement.** `scripts/inspect.mjs` (added for
this) showed `orgId` and `wsId` agreeing on every row, and the server holding
**12 live records and 214 tombstones**. The client had 214 live rows the server
had never received. My first hypothesis — a `wsId`/`orgId` divergence from a
refused `migrateToOrgWorkspaces()` — was wrong, and the data disproved it.

### The mechanism

`localChanges(since)` selects rows with `rowClock(r) >= since`, where `since` is
the push watermark. And the watermark **only ever moves forward**:

```js
const highWater = local.highWater || Date.now();   // seeded from `since`, only grows
if (!out.readOnly) Scope.set(PUSHED, String(highWater));
```

So a row written with an `updatedAt` **older than the last successful push** is
invisible to every push that follows, permanently. The sync request still
succeeds, so the status chip reads *Synced*. Silent, and indistinguishable from
working — which is why it survived: nothing errors, nothing retries, and the
count that would have exposed it lives on a screen nobody cross-checks.

**Demo data walks straight into it** (`js/app.js`): records are stamped
`now - i * 60000` so "recent activity" has a believable order. Load it after any
earlier sync and every row is already below the watermark.

### The other path, which matters more

`js/app.js`'s eviction recovery calls `importState(snap, { mode: 'adopt' })`,
and `stamp` defaults to **false** — so rows recovered from the localStorage
snapshot keep their original clocks. Same bug, on the one path whose whole job
is recovering from data loss.

**Swept every other write.** The record form, kanban drag, CSV import, field
purge and currency relabel all stamp `now`. The user-facing backup restore
passes `stamp: true` and re-dates deliberately — somebody had already understood
this hazard there and fixed it locally rather than generally.

### The fix, and why it lives in `DB.put`

Lower the watermark to the row's own clock when a backdated row is written. The
next push then includes it, and re-sending the rows above that point costs
nothing: the server's tie-break skips what it already has, which is the same
reason client selection uses `>=` rather than `>` (§10).

`DB.put` is the one place every write passes through. Putting the guard at the
call sites instead means the next path that backdates a row re-opens the
bug — and there had already been two.

**Trap hit while fixing it:** the first attempt spliced the helper into the
middle of `adoptLegacy`'s object literal. `node --check` passed — it was still
valid JavaScript — and the app broke at runtime instead, with onboarding
failing to create modules. A syntax check is not a placement check.

Guarded by *"records stamped before the last push still reach the server"*,
which fails on the unfixed code. `CACHE_VERSION` bumped to `crmbuilder-v25`.

### What this does not fix

Rows already stranded on a device stay stranded until something rewrites them —
the watermark is only lowered when a write happens. For the deployment that
surfaced this, the stranded rows were demo data and the real records were safe
on the server, but that was luck rather than design.


---

## 32. The E2E suite was not flaky. Its store was growing.

Across §30's phases, **five different tests** failed once each and then passed
in isolation: the guided tour, both team-workspace journeys, the JSON backup
round-trip, and the sign-in upload. I called it load-sensitive timing and
moved on. That was wrong, and the pattern — a *different* test each run, all
passing alone — was the clue I misread.

`playwright.config.js` pointed `DATA_DIR` at a fixed `./data/e2e` and never
cleared it. The API and signup suites each `mkdtemp` a throwaway directory;
only this one persisted, so it accumulated every account and record from every
run that had ever happened. By the time I looked: **9.7 MB, 1,972 users, 1,965
orgs, 11,720 rows.**

And `FileStore.save()` rewrites the **whole file on every write** (§30). So
every `DB.put` in every test was serialising and rewriting all 9.7 MB. The
suite had drifted from 4.0 minutes to 6.5, and whichever test happened to sit
closest to its timeout lost.

**Clearing the directory took a full run from 6.5 minutes back to 4.0, and
77/77 green.** `playwright.config.js` now removes it before each run — except
when `BASE_URL` is set, because then the data belongs to a deployment and is
not ours to delete.

**The lesson is about the diagnosis, not the fix.** "Different test each time,
passes in isolation" reads as flakiness and sounds like something to tolerate.
It was a resource leak with a monotonic cost, and the giveaway was in the
timings I kept printing and not reading: 4.4, 4.3, 4.5, 5.3, 4.8, 6.8, 6.5.
A suite that is getting *slower* is not flaky, it is accumulating something.


---

## 33. Two numbers that were both right, and what tombstones actually cost

Reported from the live deployment: Settings said **214 records** and the button
below it said **Remove sample data (220)**. Nothing was wrong with the data.

`demoCount` totals demo records **and** demo modules — 214 + 6 — because that is
what pressing the button removes. The subtitle two lines above counts records
only. Both correct, adjacent, and unlabelled, so they read as a discrepancy;
after §31 had produced a real one, that is exactly how it was reported.

**Not fixed by counting records only.** That understates what a destructive
control does, which is the worse error. The button now names its parts:
*Remove sample data (214 records, 6 modules)*. Both halves are conditional,
because a demo module the user has added their own record to is **promoted**
rather than deleted (§11) — so a workspace can hold demo records whose modules
are no longer samples, and the label has to survive that.

Guarded by an assertion inside *"the demo can be kept on purpose, and removed
later"* that reads the two numbers out of the subtitle and requires the button
to name both. It fails on the old label, whose bare total is neither of them.

**A trap while writing it, and it is §4's.** `.page-head .subtitle` exists on
every screen, so reading it straight after `page.goto('/#/settings')` sampled
the *previous* page and the regex matched nothing. The test failed on the
broken code for a reason that had nothing to do with the label — which would
have passed as verification and proved nothing. Wait on the rendered text
first.

### What a tombstone costs, measured

The same report asked whether tombstones are recoverable and whether they take
space. **No, and yes** — and the second answer was bigger than expected.

A tombstone is 346 bytes: ids, both clocks, `deletedOn`, and `doc: null`. On
that deployment, 428 record tombstones and 18 module tombstones came to
**151 KB of the workspace's 278 KB — 54%.** The counts say why: 428 = 4 × 107
and 18 = 3 × 6, so four demo-data cycles and three module wipes. Each
load-then-delete round leaves 107 permanent rows for 180 days, and the next
load mints fresh ids rather than reviving them, so the cost compounds.

Nothing is broken. The rows are doing the job tombstones exist to do (§26), and
the space returns when the window passes. But **the storage meter cannot tell a
heavy tenant from a scarred one**, and the §25 alerts fire on the number that
conflates them — the two want opposite responses from an operator.

So `scripts/inspect.mjs` now reports storage composition: live bytes against
tombstone bytes per organisation, the oldest tombstone, and the date the first
of it expires. Measured with `$bsonSize` on the same grouping key the
Organisations table uses, so the two are comparable rather than merely similar.
It also prints each org's `createdAt`, which is what dates an empty org against
the fix that should have tidied it — an orphan predating `tidyVacatedOrg` (§25)
is history, not a live bug, and there was no way to tell them apart.

**The trap in the file-store half:** the loader strips `doc` from every row,
which is what keeps this script from ever holding record contents. Measure
after that and every live record reports as tombstone-sized and the whole split
becomes meaningless. Sizes are taken before the strip; the fixture proves it,
with live rows at ~454 B against tombstones at ~338 B.

Shortening the 180-day window was considered and **rejected**: it is the time an
offline device has to learn about a delete, and cutting it resurrects rows on
anyone who syncs rarely.

### The Organisations table now says which kind of large a tenant is

`usageByOrg()` returns `deadBytes` and `oldestDeletedAt` beside `bytes`, and
the panel renders a `78% reclaimable` qualifier under the size. `tombstoneDays`
rides on the body once rather than on every row — it is a deployment constant.

**Measured, never `deadRows / totalRows`.** That ratio is the same trap as
records × a constant (§17) in a new hat, and here it is wrong in the direction
that hurts: a tombstone is ~346 bytes and a live record several times that, so
a workspace that deleted half its rows is *not* half gravestones by size. The
test seeds four fat records against four stubs and asserts the byte share lands
**under 25%** — a count-derived figure reports 50% and fails.

**A qualifier on the number, not a column.** The table is already seven columns
wide, and the figure is meaningless without the total it qualifies.

**Silent below 10%.** Every workspace that has ever deleted anything carries
some; a `2% reclaimable` on every row is noise that teaches the eye to skip the
cell, which costs the reading the 50% case exists for.

**The tooltip says what it is, not only how much.** "Reclaimable" alone reads
as waste somebody should go and clear up, and there is no such button — the
rows are not recoverable and the space returns on its own (§26).

**Trap in the E2E test:** `/api/admin/platform` is cached 30s and **nothing
invalidates it on sync**, so a panel rendered straight after seeding can
legitimately show a table from before the tenant existed. The test requests
`?fresh=1` first — which rewrites the cache, not merely bypasses it — and only
then loads the screen.
