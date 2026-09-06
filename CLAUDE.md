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
| **Restoring a backup** — what it verifies, what it loses | §17 |
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
| **Demo data vs the seed fixture** — which is which | §34 |
| Guided tour: card covering its own highlight | §35 |
| **View-only**: what it must look like, and the hole | §36 · §14 |
| **Dates**: the due filter, and the UTC parsing trap | §37 |
| **Outbound webhooks**: the guard, and where the URL lives | §38 |
| Telegram setup, and why `sendGuarded` hung | §38 |
| **Daily digest**: the pass, its gates, mentions | §39 |
| Why a "reminders are stale" alert cannot work | §39 |
| Workspace time zone — and why the filter ignores it | §39 · §38 · §37 |
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
lib/safe-fetch.js     SSRF guard for customer-chosen webhook destinations (§38)
                      server-side, CommonJS, and deliberately NOT under js/
index.html            app shell (script order matters — see §3)
privacy.html          privacy policy | terms.html  terms of use  (see §19)
legal.css             styling for those two — they load no app JS at all
css/style.css         Inter + blue/slate palette, light/dark, desktop-first
js/icons.js           inline Lucide SVGs (generated — see §6)
js/boot-icons.js      fills static icon placeholders — a file, not inline (§30 CSP)
js/scope.js           whose data is this — storage scopes (see §11)
js/db.js              IndexedDB wrapper, one database per scope
js/csv.js             RFC 4180 CSV reader/writer
js/date-rules.js      calendar-day arithmetic for the due filter (see §37)
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

**All green:** 366 Node tests + 89 Playwright tests, 43 smoke checks. On
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
- **Per-workspace webhooks** behind an SSRF guard, and a **daily digest** of
  what is due or overdue — off by default, counts only — see §38, §39
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
(currently `crmbuilder-v36`). Miss the allow-list and it 404s in production
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

**Restarting a test server on the same port is not reliable.** `expireInvite()`
in `api.test.mjs` stops the server, edits `store.json` and starts it again;
rebinding a port that was listening a millisecond ago races, and on Windows the
closed listener lingers long enough that the new one loses — the next request
gets `ECONNRESET` and everything after it `ECONNREFUSED`, several tests away
from the restart that caused it. Every boot takes a **fresh** port now.
Port blocks are disjoint per file (§9) so parallel files cannot collide either.

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
          moduleCount, recordCount, perRecord, orgOwned, updatedAt,
          hook }  ← meta.  `hook` is a SIBLING of settings, never inside it (§38)
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

**Port blocks are disjoint per file**, because `node --test` runs files in
parallel and they each spawn real servers:

| File | Block | Servers |
|---|---|---|
| `api.test.mjs` | 8300–8449 | 3 app + 1 capture (8440–8449, reserved) |
| `fixture.test.mjs` | 8450–8499 | 1 |
| `migration.test.mjs` | 8500–8699 | 6 |
| `signup.test.mjs` | 8700–8960 | 61 |
| `oauth.test.mjs` | 9300–9405 | 6 |
| `backup.test.mjs` | 9500–9550 | 2 |
| `ssrf.test.mjs` | 9600–9650 | 2 (capture servers, not the app) |
| `reminders.test.mjs` | 9700–9750 | 1 app + 1 capture |

They used to overlap badly — `api.test.mjs` alone spanned 8300–8899, across
three other files' ranges. Widen a block and check the neighbours.

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
| read, export | ✅ | ✅ | ✅ | ✅ |
| records: create, edit | ✅ | ✅ | ✅ | ❌ |
| records: delete | ✅ | ✅ | ❌ | ❌ |
| module fields, add/delete modules | ✅ | ❌ | ❌ | ❌ |
| invite, roles, remove members | ✅ | ❌ | ❌ | ❌ |
| workspace name and currency | ✅ | ❌ | ❌ | ❌ |

`canEditSchema()` exists twice on purpose: on the server (`server.js`) it
decides, and on the client (`js/app.js`) it only avoids offering a button whose
effect would be undone a second later.

**The workspace name and currency are owner-only, and were not.** `applyPush`
gated records and modules by role and wrote settings from anybody, so a
view-only account could rename the team's workspace and switch its currency —
and the owner saw both. Found by driving the seeded fixture as a real viewer
(§34), not by reading the code, which is why it survived §26's role work and
the security audit.

Currency is the half that matters: §23 records that changing it **relabels**
every stored amount rather than converting, for the whole team. That makes it a
structural setting, and it sits beside the schema rather than beside a display
preference. `canEditSettings()` is a separate function from `canEditSchema()`
deliberately — the rule is the same today, and separate names are what let one
move later without silently dragging the other.

Two traps in the fix, both of which shipped broken first:

- **The refusal must carry the server's copy AND its clock.** The pull only
  sends settings when `settingsServerAt` moves, and refusing does not move it —
  so a device whose local `settingsUpdatedAt` is newer keeps winning locally and
  re-pushes on every sync, for ever. Same rule as a rejected row, in a path
  nobody had applied it to.
- **`refused` counted only the two arrays.** A settings-only refusal was
  correctly blocked and then dropped from the response, so the client was told
  nothing — which is the same forever-repush, arrived at from the other end.

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
`GET /api/admin/export` plus a nightly workflow is the entire safety net.
`scripts/restore.mjs` puts one back, into Mongo or the file store.

**The workflow is not in this repository — it runs from the private repo
`Mohamed-AH/crmback`**, and that is the copy to edit. Two reasons, and the
second is the one that would have hurt:

- **This repo is public, and so are its build artifacts.** A backup is every
  customer's records, accounts and organisations, plus `accessRequests` —
  which carries the addresses of people who asked for access and were
  *declined*. Running the job here would publish all of it.
- **It was removed, not left unconfigured.** A workflow with no secrets
  **skips and reports success**: it showed a green tick every night while
  producing no backups at all, and that state ran unnoticed for weeks. A
  no-op that reports success is worse than a failure, because nothing will
  ever contradict it. Its history is still here —
  `git log -- .github/workflows/backup.yml`.

**The dead-man's switch is the other half.** The job's last step pings
healthchecks.io, and only when a *validated backup was fetched and stored* —
gated on the same `ready == 'true'` that the skip fails, so an unconfigured run
cannot report health. Without it the 60-day inactivity rule silently disables
the schedule on a repo that holds one file and therefore goes quiet fast.
`docs/BETA.md` § *"Knowing the backup ran"* has the setup.

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

### The restore verified one branch and not the other

`restore.mjs` counted its rows back on the **Mongo** path and, on the **file
store** path, wrote `store.json`, printed *"go and look"*, and checked nothing.
The asymmetry ran the wrong way round: the file store is the only kind of drill
that is safe to run regularly — Mongo means either a scratch cluster or
`RESTORE_OVERWRITE=1` against something real — so the cheap, repeatable half of
the exercise was the half that could not fail.

Both branches now call one `verifyCounts()` over accounts, organisations,
workspaces, modules and records, and `exit(1)` on any mismatch. Each asks the
store what it holds *now* — Mongo counts documents, the file store re-reads the
file it just wrote. **Counting the object we were about to write would restate
the intent rather than check the outcome**, which is the whole point.

**Measured against the broken state, and it was worse than predicted.** The
failure used is a real one: the file store keys workspaces by `wsId`, so a
backup carrying two workspaces with the same id has the second
`Object.fromEntries` **replace** the first's bag rather than merge with it. On
that input the pre-fix script printed *"Restored into …"* and exited **0** while
holding 6 of 180 records and 1 of 11 modules. It reports the shortfall per line
and exits 1 now.

**What a passing count still does not prove.** Rows landing in the wrong
workspace satisfy every total. The drill therefore ends by booting the restored
store and re-exporting it, comparing shapes rather than sizes — and by signing
in as a named account to see its own records. `docs/BETA.md` § *"Drilling the
backup"* has the runnable version.

### The export lost two collections, and `platform` is not one thing

**Found by running the drill, not by reading it.** The body carried `orgs`,
`users` and `workspaces` only, so a restore lost the approval allowlist (§20 —
approval *is* the allowlist) and the stored signup mode and `orgCreation` gate
(§16, §24). Nothing crashed, because `FileStore` coalesces missing collections
— **a restore silently reopened signups the operator had shut**, which is the
one failure mode you least want during a recovery. §16's guarantee that *"a
redeploy cannot silently undo the operator"* did not extend to a restore.

The export carries both now (`version: 2`, informational — `restore.mjs`
tolerates a version 1 body rather than branching on the number).

**`platform` is exported whole and restored in PART, and the split is the
point.** It mixes two kinds of thing:

| Kind | Keys | Restored? |
|---|---|---|
| operator decisions | `signupMode`, `orgCreation`, and each one's `…SetAt` / `…SetBy` | **yes** |
| runtime state | `egressBytes`, `egressMonth`, `alerts` | **no** |

**A decision is three keys, not one, and the first version of this missed
that.** `setSignupMode()` and `setOrgCreation()` each write the value plus
`<name>SetAt` and `<name>SetBy`, so the original two-name allow-list restored
the lever and dropped its provenance: signups came back open, correctly, with
no record of who opened them or when. Not data loss you would notice — an audit
trail missing at the moment somebody asks why signups were open.

**CI could not have found it.** The fixture seeded exactly the two keys the
allow-list named, so the bug and its test were built from one wrong assumption
and nine other assertions passed. What found it was **restoring a real artifact
from the live deployment** — the drill in `docs/BETA.md`, one day after it was
written, doing the one job the automated version cannot. The fixture now seeds
all six plus the runtime keys, and the list is derived from
`OPERATOR_DECISIONS` so a third lever is one string rather than three.

Restoring the runtime half seeds a fresh deployment with a dead one's traffic
against this month's allowance, and carries the escalate-only alert state
across (§25) — so a threshold that already fired stays quiet on the deployment
that now needs it. **An allow-list, not a delete-list:** a key added to
`platform` later is runtime state until somebody decides otherwise, and
defaulting the other way would carry it silently.

**`accessRequests` carries declined addresses too**, so the nightly artifact now
holds personal data about people who never became users. That is a deliberate
trade for recoverability, and it is why the artifact's retention window and its
download audience are worth revisiting.

**And the rule this creates: NEVER PUT A CREDENTIAL IN `platform`.** It is in
every nightly artifact from version 2 onward, and a GitHub build artifact is
downloadable by anyone with repo read access.

### The drill runs on every push now (`tests/backup.test.mjs`)

Export from a real server, restore with the real script, boot a second server
over the result, ask it what it has. Ports 9500–9550 (§9).

**Two canaries, one per tenant, and that is the design.** Aggregate counts pass
happily when rows land in the *wrong* workspace — the wsId collision above lost
174 of 180 records with every total still looking plausible. So each owner must
see their own canary and must **not** see the other's. The isolation test was
checked by inverting it: with the assertion flipped it fails, which is what
proves it is not passing on an empty pull.

**Three tests cover the `platform` split as one set** — two things that must
cross the restore and one that must not. Two of them were written asserting
*absence*, before the export carried anything, and inverted when it did. That
ordering is why they are assertions about behaviour rather than about a shape
somebody hoped for (§9: a test that has only ever seen the fixed code proves
nothing). The one that never flipped — *"runtime counters and spent alert steps
are left behind"* — was checked by removing the allow-list from `restore.mjs`,
which makes it fail by name.

The source deployment is seeded with a real approved request and real operator
settings before it boots, and `before` asserts they were still there at export
time. Without that check the whole set is hollow: it would pass against a
deployment that never had anything to lose.

**Do not pin the seeded `egressBytes` value.** The counter is keyed by month and
rolls over, so a value seeded without a matching `egressMonth` is zeroed and
re-accumulated by the running server — the first version of that assertion
failed with `28 !== 4242` against a counter doing its job. Assert the shape and
that the restore refuses it, never the number.

**A version 1 backup is covered too**, and is the ordinary case rather than an
edge one: the file on disk is older than the code reading it far more often than
the other way round.

**Snapshot the restored store before anything boots over it.** A running server
writes to `store.json` within its first request — the egress counter lands in
`platform` immediately — so reading it afterwards cannot tell "the restore
brought this back" from "the new deployment accumulated it". The first version
of the runtime-state assertion failed against perfectly correct code for
exactly that reason.

**And one for the workspace-webhook work before it starts.** `workspaces[].meta`
is the `data` collection, which includes `settings` — so workspace settings are
already in every nightly artifact. §18 records that a Telegram webhook URL
contains a bot token. Storing a per-workspace webhook URL in `settings` would
put live credentials into a GitHub artifact downloadable by anyone with repo
read access. Keep it out of `settings`, or redact it on export.

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

The biggest single blocker to anyone extending the backend, since the contract
existed only in `server.js`.

**The route count lives in API.md and nowhere else**, and this section learned
that the hard way: it was written as "43 routes", repeated in `docs/README.md`,
and both were stale two phases later at 47. That is this section's own thesis
(a number written in a second place is a number that goes stale) failing
against the section that states it.

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
the thing it is describing — and it is **unrelated to security and predates all
of this work**. The earlier guesses about it (shared-server state, CPU load)
were wrong and are retracted. Not fixed here, because Phase 4 is network
hardening and mixing the two would muddle the commit.

**Superseded by §35, which found this description wrong in two ways.** It was
not intermittent — step 3 overlapped on 20 runs out of 20 when measured at the
moment the card is declared ready. And "cosmetic" undersold it: the card
covered the row the step was describing, every time, for every user.

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
| 12 | SSRF via the feedback webhook | **FALSE** — env-only, no runtime setter. **Superseded by §38:** the workspace webhook IS a runtime setter, and is a deliberate outbound sink behind `lib/safe-fetch.js` |
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
  growing across runs, and it is fixed. The guided tour's *card covers its own
  highlight* was a separate, real bug and is **also fixed now** — §35.

  The guided tour's *card covers its own highlight* is **fixed** — see §35,
  which also corrects the "intermittent" and "cosmetic" framing above.

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


---

## 34. The demo dataset, and the fixture that is not it

Two artifacts, and confusing them is the whole trap. The requirement arrived as
"expand the demo data to cover teams, roles, tombstones and meta counters", and
**three of those four cannot live in `js/demo-data.js`** — it is a client file
that seeds IndexedDB, and users, orgs, `doc: null` tombstones and the meta doc
are all server collections.

Worse, seeding tombstones client-side would make them **real**: demo rows go
through `DB.put` in the current scope, and a `u:<id>` scope syncs. §33 measured
what that costs — 428 tombstones from four demo cycles, 54% of a live
workspace's bytes.

| Artifact | Ships? | Carries |
|---|---|---|
| `js/demo-data.js` | yes, to every user | modules, records, relations |
| `scripts/seed-fixture.mjs` | no, developer/operator only | users, orgs, roles, tombstones, meta counters |

### The dataset (`js/demo-data.js`)

144 records across 8 modules — the six templates plus **Projects** and
**Invoices**, which exist because the old dataset could not show a custom
module at all (`loadDemoData` walked `TEMPLATES` and nothing else) and had no
relations.

**`scripts/gen-demo-data.mjs` is committed now.** §6 claimed a Python generator
that was never in the repo, so the one file nobody could hand-edit was also the
one nobody could regenerate. Seeded, so a re-run is byte-identical.

**Relations resolve in one forward pass**, keyed on `{ __ref: "key:name" }`,
because `relatedModule` and a relation's value are both runtime ids. A ref may
only point at a module seeded **earlier**; a forward reference resolves to
nothing, renders a blank cell, and throws nothing at all.

**Traps:**

- **`defaultView: 'board'` is silently wrong.** The token `app.js` checks is
  `kanban`. `board` reads correctly to a human, is accepted, and falls back to
  a table. It shipped that way in the first draft.
- **Weighted-random leaves board columns empty**, which reads as a broken board
  rather than a quiet week. Distributions are exact counts, shuffled.
- **Every count in `e2e.spec.js` that was really "what the demo seeded" broke
  when the dataset grew.** Three `6`s, an `18` (kanban cards) and a `40`
  (contacts) — and CI only ever reports the first, so they surface one at a
  time. They all read from the dataset now via a `DEMO` helper. The literal `6`
  for `.template-card` is correct and stays: that one really is about
  `TEMPLATES`.
- **Write the template's field keys, not invented ones.** The generator wrote
  `close` where Deals says `closeDate`, `status`/`assignee` on Tasks (which has
  a `done` checkbox and neither), and `company` on two modules that have no such
  field — plus select values outside their own options (`Urgent`, `Event`,
  `Cold outreach`, `Social`, `Unqualified`). Nothing throws: a key no field uses
  is ghost data (§22) that travels in every export and renders nowhere, an
  unfilled field is an empty column, and an out-of-range select value is a pill
  the dropdown cannot produce. The dataset before the rewrite was clean on every
  module, so this was a regression, and it was invisible until a record was
  rendered as VALUES rather than inputs (§36). `tests/demo.test.mjs` now asserts
  data keys against field keys in both directions, and every select value
  against its options.
- **Do not pre-seed a record without `_demo` to stage a promotion demo.** It
  would claim the user typed something they never did, and "`_demo` is on rows
  we seeded and never on rows the user typed" is what the whole discard
  algorithm rests on (§11).

### The fixture (`scripts/seed-fixture.mjs`)

Four orgs, six accounts covering every rung of the ladder, tombstones aged
2–176 days across the retention window, a second tenant so no org reads as
100%, and a deliberately empty placeholder org.

**File store only, and not behind a flag.** There is no MongoDB code path at
all. A script that creates users and orgs is one mistyped argument from writing
into a real tenant's database, and the cheapest way to make that impossible is
not to implement it. `inspect.mjs` may read Atlas because reading destroys
nothing; this may not write to it.

**Nothing asserts against the file.** `tests/fixture.test.mjs` boots a real
server against the fixture and asks the API. Hand-built shapes drift, and a
drifted one does not throw — it loads and is quietly wrong.

**Traps, and two of these were my own tests passing on bugs:**

- **A push heals a wrong meta counter.** `/api/sync` calls `refreshCounts()`,
  so a single accepted write rewrites the meta doc with the true figure. The
  counter test placed *after* the contributor test passed against a fixture
  seeded with a deliberately wrong count. It runs first now, and the ordering
  is the assertion. Same shape as §26's stamp trap.
- **Checking a pulled tombstone has no `doc` tests `wireItem()`, not the
  fixture.** The server strips the body from every deleted row on the way out,
  so that assertion passed against a fixture writing full bodies into its
  tombstones. Measured per-tombstone bytes instead.
- **`--clean` matched orgs by NAME, and deleted a real customer's workspace.**
  "Lumen Studio" is a plausible thing for a customer to call their own
  workspace; driven with a real owner in an org of that name, `--clean` removed
  the org and its 174 rows and reported success — leaving the account intact,
  which made it read as if nothing had happened. **A surviving member now
  vetoes removal**, whatever the org is called. Guarded by a test that fails on
  the name-only version.

### Running it, and the trap that has to be printed twice

Reported after a real attempt: the fixture was unrunnable from the docs. There
was no instruction that this is a **local** thing, no environment setup, and the
accounts existed only in the script's own output — so the only way to learn who
to sign in as was to run the thing you could not work out how to run.

`docs/BETA.md` § *"Standing up a demo workspace, locally"* now carries three
runnable commands, the env table and the six accounts with their roles.

**`MONGODB_URI` is the trap, and it fails silently.** With one set — including
from a `.env` the server picks up — the server reads Mongo and sees nothing the
fixture wrote: a working app over an empty workspace, no error, no clue. So
`MONGODB_URI=` is on the command line in the doc **and** in the line the script
prints when it finishes. The script cannot know what the server will later be
started with, so it prints the whole command rather than a hint.

**The account list belongs in both places for the same reason.** A doc gets read
before the run and the script's output gets read after it, and the person who
needs it may only see one. It prints roles now, and no longer omits the second
tenant's owner — the account you need to see that no org reads as 100%.

---

## 35. The tour card was not intermittently wrong. It was always wrong.

`step N card covers its own highlight` had been open since §30, filed as an
intermittent cosmetic flake. Both halves of that were wrong, and the measurement
is what showed it: driving the tour at the test's own viewport and reading the
geometry the instant the card is declared ready, the old code overlapped at
**step 3 on 20 runs out of 20.** The new code: 0 out of 20.

**What was intermittent was the observation, not the bug.** The card was always
placed over the ring; whether the E2E assertion caught it depended on whether
some later reflow nudged it clear before the test looked. That is also why it
appeared to "move between steps" — a report of step 5 and a local reproduction
of step 3 are the same defect seen through different timing.

Three separate faults, all in `position()`:

**It measured against the target, not the ring.** The ring is drawn at
`r ± PAD`, so a card computed clear of the target could still sit on the
highlight by up to `PAD` a side — which is what the user sees and what the test
measures.

**The fallback accepted an overlap.** When no candidate both fitted on screen
and cleared the target, the code took `find(fits)` — any placement that fits,
overlapping or not. A tall target has no room above or below it, so that branch
fired and laid the card over the thing it was pointing at. Growing the demo
dataset from 18 deals to 22 made the table taller and the branch more likely,
which is why it surfaced now.

**The final clamp could undo the choice.** Both axes were clamped into the
viewport after a placement was picked, which can slide a card back across the
ring it had just been placed clear of. Now one axis is *fixed* per side —
"below" pins the top to the ring's bottom edge and only slides horizontally —
so a clamp cannot reintroduce an overlap.

### And the placement was recomputed too early

`position()` ran once, at the end of `render()`. Steps 2 and 3 force their own
screen in a `before` hook (§7), and those re-renders are async: when one lands
after the card is placed, the target grows underneath it. A `ResizeObserver` on
the target and on the card now repositions on any geometry change. No feedback
loop — `position()` writes `left`/`top`, which a ResizeObserver does not fire on.

**A short viewport still overlaps at step 2, and that is correct.** Step 2's
target is the whole kanban board; in a 520px-tall window there is nowhere to put
a 223px card. The fallback picks the roomiest side and sits at its far edge,
which is the least-bad answer rather than a bug. Do not "fix" that by shrinking
the card — measure at a real viewport first, which is what the 1440×900 probe
exists for.

**The lesson is the one §32 already taught, in a new place.** "Fails sometimes,
passes in isolation" reads as flakiness and invites a retry. Measuring the thing
directly — 20 rounds, geometry printed — turned a three-phase mystery into a
one-line answer in minutes. A test that fails 1 run in 15 is still describing a
defect that is present 15 times out of 15.


---

## 36. View-only had to look deliberate, and the audit found a hole

Reported as polish: a view-only account could still type into a record's fields,
the Save button was simply absent, and it "feels like unfinished software rather
than an intentional feature". Auditing it by **driving the app as a real viewer
against the seeded fixture** (§34) turned up something else first.

### The hole

`applyPush` gated records and modules by role and wrote settings from anybody, so
a viewer could rename the team's workspace and change its currency — and the
owner saw both. §23: a currency change **relabels** every stored amount rather
than converting, for everybody. An external auditor holding read-only access
could turn every dollar figure into yen. Fixed in §14; `canEditSettings()` is
owner-only and deliberately separate from `canEditSchema()`.

**It survived §26's role work and the whole security audit** because both read
the code. Driving the product as each role is a different instrument, and it is
the one that found this.

### The principle, so the rest is not a dozen judgement calls

**A restricted account should feel like it is using a finished product for
reading, not a broken product for writing.**

1. **Creating something → hide it.** A missing Add button explains itself.
2. **Editing something visible → render it as a value, not a disabled input.**
   A greyed-out form still looks like a form that failed.
3. **Say the state once, calmly, where identity lives** — not a banner on every
   screen, which nags and reads as an error state.

Tone: never *denied*, *forbidden*, *not permitted*. Those are words for an
attacker, and a viewer may be an intern, an investor or an auditor. Frame it as
what they *can* do.

### The record read view

`fieldReadHTML` renders values through the same `fmtValue` the table uses, so a
field looks identical to the row it was opened from. Two departures: a textarea
shows in full (`fmtValue` truncates at 70 for a cell, and a detail view is where
you go to read the whole note), and a checkbox reads Yes/No because there is no
label beside it here to give a bare tick meaning.

A `<div>`, not a `<form>`: there is nothing to submit, and required markers go
too — a `*` is an instruction, and there is nothing here to instruct.

### What the read view exposed

Rendering values instead of inputs made an empty "Expected close" obvious on
every demo deal. The generator (§34) had invented field keys, and a sweep found
three modules wrong and five invalid select values. **Nothing about it threw**,
and an empty date cell in a table reads as "no date set" — which is why it
survived a full suite, a screenshot review and a live deployment.

The lesson is the one this file keeps relearning: a defect that renders as
*plausible* is invisible until something forces it to render differently.

### Gating the rest, and the one thing that must NOT be hidden

Creates and destructive actions are hidden per rule 1: dashboard quick-add and
Add module, the sidebar's `+`, CSV import, Import backup, Load demo data, Add
module from template, Delete all data. The workspace name and currency render
as values for anyone but an owner.

**Export stays for every role, deliberately.** Reading the workspace and taking
a copy of it *is* the job for an auditor or an investor, and nothing about it
writes. That is a policy choice, not an oversight.

**Hiding `#edit-module-btn` was wrong, and a test caught it.** The builder
already renders read-only for non-owners — no save, no delete, and a line
naming the rule — so hiding the button removed the entry point to a read view
that was already correct. It is retitled instead: *View module fields*, with a
table icon rather than a pencil. Seeing which fields a module has is reading.

The general form: **before hiding a control, check whether it already opens a
read view.** Rule 1 is about creating, not about looking.

**Every bind is guarded now.** Nine handlers used to call
`addEventListener` on an element the template always produced. Once the
template is conditional, an unguarded bind throws and takes the whole screen
down rather than just the missing button — which is a far worse failure than
the one being fixed.

### Left deliberately

`.builder-readonly` still greys its inputs with `pointer-events: none`, which
is the pattern rule 2 argues against. Not converted, because a module's *shape*
is a list of controls — the type, the required flag and the list flag are what
make it legible — and rendering that as prose would lose the thing being read.
Say that rather than treating it as an inconsistency to tidy.

### A module the user built themselves is not a different case

Asked directly, and worth an answer that is measured rather than argued: every
role test until now drove a **template** module, so "does this hold for a module
someone built in the builder" was an assumption, not a result.

It holds, and structurally it has to — nothing on either side of the seam looks
at where a module came from. `canEditRecords` / `canDeleteRecords` /
`canEditSchema` take a *user*; `applyPush` gates by role on the row's `wsId`;
`TEMPLATES` is a seed for the builder and is never consulted again. There is no
provenance field on a module for a permission check to read even if one wanted
to.

Guarded anyway, because "structurally impossible" is the claim that stops being
true after a refactor nobody connected to it. *"roles apply the same way to a
module the user built themselves"* builds an **Equipment** module through the
real builder with a custom `Serial` field, adds a record, then demotes a
colleague to viewer and asserts they read the custom module and its custom
field, get `.record-read` with zero inputs, see no add or import control — and,
pushing straight through `Cloud.sync()` rather than the UI, cannot change
`serial`. Checked against the broken state per §9: with `canEditRecords`
returning `true` it fails on the value, `LC-0042` against `TAMPERED`.

**The push is the half that matters.** Asserting only that the buttons are gone
tests the client's manners; the viewer who matters is the one who does not use
the buttons.


---

## 37. The due-date filter, and two traps it walked into

Phase 1 of the reminders work (§17's neighbour — the operator features that
grew out of "what would make this sellable"). Deliberately client-only: an
in-memory filter over rows already loaded, no new endpoint, no sync, nothing
the server can refuse.

**The plan arrived written for a React app** — `src/lib/`, `src/components/
ModuleView.jsx`, a `userTimezone` argument. There is no `src/`, no `.jsx` and
no framework here (§1). Translated rather than followed: `js/date-rules.js` as
a global beside `js/csv.js`, the control inside `renderModule` in `js/app.js`,
and the filter inside `visibleRecords()` — which already calls itself "the
single source of truth for what rows this module view shows".

### Why the file exists at all

`new Date('2026-09-12')` is parsed as **UTC midnight**. Anywhere west of
Greenwich its `.getDate()` is the 11th, so the obvious three-line inline
version reports "due tomorrow" for something due today, for every user in the
Americas, while being perfectly correct for whoever wrote it in London.

So a stored day is parsed by **regex** into its parts, today is read from local
calendar getters, and both are projected through `Date.UTC` before subtracting.
UTC has no daylight saving, so the difference of two midnights is always an
exact multiple of a day — subtracting local timestamps gives 23- and 25-hour
days twice a year and a rounded division that is off by one across the change.

`tests/dateRules.test.mjs` runs the same assertions under **five timezones in
real child processes**, because `process.env.TZ` set inside a running Node
process does not reliably re-initialise the date code. Checked against the
naive implementation: it fails `Pacific/Midway` and `America/New_York` and
passes UTC, `Pacific/Kiritimati` (+14) and `Asia/Kolkata` — exactly the
signature above, correct for the author and wrong for half the world.

### Overdue is included, and that is the whole design

The helper is **`isDueWithin`, not `isExpiringSoon`**. "Expiring soon" reads as
a future window, and a filter showing only the future hides the overdue invoice
and the lapsed certificate — the rows most worth looking at. A name promising
"soon" while returning true for a six-month-old invoice is a small lie told at
every call site.

Two tests pin it, and both were checked against `n >= 0 && n <= days`:
*"overdue is always included, however old"* fails, and so does the E2E once it
was strengthened — see below.

### The E2E claimed to catch something it did not

The first version asserted every visible row was under the horizon, and a
comment said that would fail on a future-only window. It would not: excluding
overdue leaves every remaining row under the horizon too. **The demo seeds four
tasks with a negative `{ __rel: days }` offset (§6)**, so the test now requires
at least one *overdue* row to survive, which is deterministic rather than a
hope about the dataset. Checked: it fails on the mutation.

### §4's cascade trap, hit again, in the same file

`.due-filter { width: auto }` lost to `.input { width: 100% }` — equal
specificity, and `.input` sits later in `css/style.css`. Measured rather than
guessed, by driving the app and reading geometry: the select rendered **777px
wide**, wrapped `.module-actions` into six rows, and took the page head from
39px to **130px**.

**That broke a test three files away.** The taller head pushed the kanban board
down, leaving the guided tour no room at step 2 — whose target is the whole
board — so `step 2 card covers its own highlight` failed, which §35 records as
the correct behaviour when the target genuinely does not fit. `git stash` and a
re-run proved the tour passed without this change, so it was a real regression
and not the old flake. Fixed with `.module-actions .due-filter`, per §4's own
prescription: **use a more specific selector.**

The lesson is §9's: the failure surfaced in the tour, two files and one feature
away from the CSS rule that caused it, and reading the geometry is what named
it in minutes.

### Smaller decisions, recorded so they are not re-litigated

- **One `<select>`, not a chip plus a window picker.** The options *are* the
  states, so the filter cannot be on with no window or a window with the filter
  off.
- **It names the field it watches** ("Due date: next 7 days"). Filtering on a
  date the reader cannot see is indistinguishable from rows going missing.
- **Absent entirely when a module has no date field**, rather than present and
  inert — §36's rule 1.
- **`watchedDateField` prefers a list column**, then the first date field. A
  guess, but the UI names the result, so it is a visible one.
- **A full `renderModule` on change, not `renderModuleBodyOnly`.** The count
  badge lives in the page head; leaving it on the unfiltered total is §33's
  adjacent-and-wrong number in a new place.
- **Sorted soonest-first while the filter is on**, so the overdue rows it
  deliberately keeps sit at the top.
- **No `server.js` change.** `ASSET_DIRS` allow-lists the whole `js/` directory
  (§28), so a new file there is served automatically — but the smoke test's
  `ASSETS` is what *proves* it, and it went 41 → 42.


---

## 38. The workspace webhook, and the credential that could not live in `settings`

Phase 2 of the reminders work — the transport, built before the engine that
will use it (§37 was Phase 1). Its only user-facing surface is a Settings card
and a test button; nothing sends on its own yet. That is the cost of building
the transport first, and it is still the right order: the alternative is
writing an SSRF guard under pressure with the feature already half-built.

### It cannot go in `settings`, and the second reason is worse than the first

The obvious home is beside the currency and the business name. Two facts, both
read out of the code rather than assumed:

- **`pullChanges` sends `meta.settings` WHOLE** to anyone whose cursor is
  behind `settingsServerAt` — member, contributor, **viewer**. The URL is a
  credential (§18: a Telegram webhook URL contains the bot token), so that puts
  it in every teammate's IndexedDB, offline, permanently. Masking it out of a
  `GET` does nothing, because the `GET` is not the delivery path.
- **Masking would then DESTROY it.** `js/app.js` merges the pulled document
  into local settings and `js/cloud.js` pushes the whole thing back on the next
  save, where last-write-wins accepts it — so `https://…/bot•••••/sendMessage`
  overwrites the real URL the first time an owner changes the currency.
  **Redaction and last-write-wins cannot both apply to one document.**

So `hook` is a **sibling** key on the meta doc. `putData` merges on both stores
(spread on FileStore, `$set` on MongoStore), so a settings write leaves it
standing; `pullChanges` names `meta.settings` specifically, so sync cannot
reach it. Structural rather than filtered — it holds for somebody who never
reads the comment.

§17 had already written half of this down before there was code to hit it:
*"Keep it out of `settings`, or redact it on export."* The sync path is the
half that note did not reach.

Guarded by *"an owner changing the currency does not erase the webhook"*, which
fails **destructively** on the original design, and by a leak assertion that
searches the whole response body rather than a named field — a field-by-field
check only covers the fields somebody thought of.

### `node:https`, not `fetch`, and that is the substance

**DNS rebinding is a time-of-check/time-of-use bug.** Validate with
`dns.lookup` and then call `fetch(url)` and fetch resolves the hostname *a
second time*: a one-second TTL answering public and then `169.254.169.254`
walks straight through a correct check. Enumerating hostname encodings — the
usual advice — does not touch it; the second query *is* the vulnerability.

`node:https` takes a `lookup` option that flows to `tls.connect`, so the socket
dials the address we already validated, with SNI and `Host` intact. The undici
equivalent needs undici's `Agent`, which is not reachable on any `node:`
specifier and would mean a fifth production dependency.

Two things come free that are flags on `fetch`:

- **It never follows redirects at all** — a property of the API rather than an
  option a later edit can drop, so a 30x to the metadata endpoint cannot be
  followed. The code only has to *report* it.
- **The encoding zoo needs no enumeration.** `0177.0.0.1`, `2130706433`,
  `0x7f.1` are all blocked by the same path as the dotted form, because **we
  never parse the hostname — we validate what the resolver returned.**

**The pin is proven, not asserted.** The transport test posts to
`webhook.invalid:<port>`, which no resolver answers for, and succeeds *only*
because the pinned address is the one dialled. A companion test shows the same
request failing `ENOTFOUND` without it.

### Traps, and two of them shipped broken first

- **`::ffff:0:0/96` in the block list breaks every webhook in the product.**
  It looks like a free backstop under the v4-mapped unwrapping. `net.BlockList`
  matches a v4-mapped v6 **subnet** against plain `ipv4` checks, so that one
  line makes `check('1.1.1.1','ipv4')` true and nothing is ever deliverable.
  All twenty-one blocked-range assertions passed while the guard refused the
  entire internet; *"lets an ordinary public address through"* is what caught
  it, which is why a block list needs that test.
- **`new URL('https://[::1]/').hostname` is `'[::1]'`** — brackets included —
  so `dns.lookup` failed on it and every IPv6 literal was classified
  *unresolvable* rather than *blocked*. Not exploitable (a failed resolve means
  no socket either way), but the save path treats the two differently, so
  `https://[fd00::1]/x` was being **stored**. Node's own `urlToHttpOptions`
  strips them the same way. Asserting only `ok === false` passes on the broken
  code; the test asserts the `code`.
- **The suite is split in two, and it has to be.** Classification is tested
  with no sockets; the transport is tested against a local capture server with
  the block list stood down. Together you must either weaken the guard so the
  capture server is reachable or never exercise redirects, timeouts and
  pinning. Same lesson as §30's `127.0.0.1` feedback test.
- **`lib/` is a new top-level directory and is deliberately not `js/`**, which
  is served (§28). `tests/smoke.mjs` asserts `/lib/safe-fetch.js` is a **404** —
  the allow-list check run backwards, and the only thing that would catch
  somebody adding `lib` to `ASSET_DIRS` to make an import work. Smoke 42 → 43.
- **CommonJS, and `.js` not `.mjs`.** `server.js` is CommonJS and
  `package.json` allows Node ≥ 18; `require()` of ESM only works from 22.12, so
  an `.mjs` here runs locally and throws `ERR_REQUIRE_ESM` on a deployment
  pinned to 18 or 20 — at require time, so the whole server fails to boot.

### The save refuses only what can never work

A malformed URL, `http:`, or an address the guard will not dial are properties
of the **URL**, so storing one means a webhook refused identically at every
send for ever. An unresolvable host, a refused connection, a timeout or a 500
are properties of the **moment**: refusing those means an owner cannot
configure a webhook while the far end is down, or before they have finished
setting it up at the other end. Those save, carrying the reason on
`lastError` — which the settings screen shows. `sendGuarded` returns a `code`
so the two can be told apart.

**No read-back, anywhere.** An owner who has lost the token re-enters it; the
masked form exists only so the screen can say *which* destination is
configured. `lastError` is the message with the URL scrubbed out, because
§18's "nothing interpolates a webhook URL into a log line" now has a second
place it could break: that field is persisted and rendered.

Owner-only via `canEditSettings()` — the function that exists separately from
`canEditSchema()` (§14) precisely so a workspace-level setting can hang off it.
**403, not 404**, matching the sibling team routes: §5's 404-not-403 rule is
about *cross-org* access, and a member already knows their own workspace
exists, so hiding a permission behind a lie buys nothing.

### It does not travel in a backup

`workspaces[].meta` **is** the `data` collection, so anything on the meta doc
is in every nightly artifact — downloadable by anyone with read access to the
private repo (§17). The export replaces `hook` with `{ redacted: true }`.

**Replaced, not deleted, and that is the point.** The marker is the only thing
that can tell an operator their notifications are not coming back on their own;
a silently absent hook after a recovery is a channel that has been dead since
the incident, which is exactly when somebody is relying on it. `restore.mjs`
counts them, says so, and strips the marker before writing so `publicHook()`
cannot report a hook with no URL behind it.

The drill seeds a live webhook on one tenant before boot, and `before` asserts
it survived to export time — otherwise "the export does not carry it" is true
for the wrong reason. That check doubles as proof that `refreshCounts`' meta
write merges rather than replaces.

### The time zone, and why the browser filter must not use it

`settings.timezone`, `''` when nobody has chosen — **not `'UTC'`**. The
distinction earns its place on screen: *"Not set — dates are treated as UTC"*
is a prompt, *"UTC"* is a claim somebody made. The picker is built from
`Intl.supportedValuesOf('timeZone')`, so the list cannot drift from what `Intl`
will accept, with a two-entry fallback for browsers without it — a
hand-maintained list of 400 names is a second source that goes stale (§29).

**No server-side validation, deliberately.** Validating in `applyPush` means
touching the sync seam — six recorded traps (§10) plus §14's rejection rules —
to guard against a string only a hand-written push can produce, and a refusal
there has nowhere good to go: rejecting a whole push over a timezone makes a
hard error out of what every other violation treats as a refusal. Phase 3 will
resolve at *read* time with a `UTC` fallback instead. Store whatever arrives;
never trust it at use.

**§37's filter deliberately does not read it.** That runs in the browser, and
somebody in Tokyo looking at the list should see *their* today. The workspace
zone exists for the server, which has no viewer. Unifying the two reintroduces
exactly the off-by-one `js/date-rules.js` exists to prevent.

### Telegram setup, and the hang found under it (stage 1 of 3)

Telegram is the one provider that hands you **no webhook URL**. It gives a bot
token, and the chat id has to be excavated from a raw `getUpdates` response —
four steps, of which the last three are where non-technical owners stop. The
card also *said* Telegram "gives you" a URL, which is false for the one
audience that needed the sentence.

So: paste the token, press **Find my chat**, pick from a list. Stage 1 is the
server half — the guard change and the lookup. The route and the UI follow.

**Not a new SSRF sink, which is what makes it affordable.** The host is fixed
and ours to choose; only the token varies, inside the path. It still goes
through `sendGuarded`, so the block list, the DNS pin and refuse-redirects all
still apply.

#### `sendGuarded` hung for ever on an oversized reply, and had done since §38

Found while raising the response cap, not by looking for it.

`MAX_BODY_BYTES` is 2048 — right for a *notification*, where nothing on the far
end has anything to say. `getUpdates` carries a full `from` + `chat` + `message`
object per update, so two or three messages clear it. Hence `maxBytes`: the
default is unchanged for every existing caller, and a caller that means to
**read** the answer says how much it expects.

Raising it exposed two defects in the branch underneath, and the second is the
serious one:

- **The silence.** Over the cap, the bytes that had arrived were handed back,
  `JSON.parse` failed, and the caller saw `ok: true, json: null` —
  indistinguishable from a provider that does not answer JSON. `deliverToHook`
  decides *"a 2xx is not delivery"* by reading `json.ok === false`, so a
  truncated Telegram refusal was recorded as a **successful delivery**.
- **The hang.** `res.destroy()` mid-stream emits `close` and nothing else — no
  `end`, no `error` — and the code settled only in `end`. So the promise was
  **never resolved** for any oversized reply arriving in more than one chunk,
  and nothing rescues it: a socket that has just been destroyed cannot fire its
  own timeout. Downstream that is `/api/org/hook/test` never answering, and a
  reminder pass stalling on one workspace whose destination is chatty.

**Measured, not reasoned, and the measurement is the whole reason it was
found.** A 9 KB body written with one `res.end()` gets `destroy,end,close`; the
same volume written in twenty chunks gets `destroy,close`. So the obvious test
— one big write — **passes against the hanging code**. The fixture writes in
pieces on purpose, and the test races a deadline rather than awaiting, because
on the unfixed code it does not fail, it hangs.

Settled in the `data` handler now, before the destroy, rather than in a handler
that will never run.

#### The lookup

`telegramChats(token)` returns `{ ok, chats: [{ id, title, kind }] }` and never
throws. Four things in it that each stop a working setup reading as broken:

- **No `offset`, deliberately.** Acknowledging one *consumes* the update
  stream, so a second press would legitimately come back empty and read as a
  broken button. This is a read; it must leave nothing changed.
- **`allowed_updates: ['message', 'my_chat_member']`**, and the second is not in
  the default set so it has to be asked for. It is the one that makes **groups**
  work: group privacy mode is on by default, so a bot in a group never sees
  ordinary messages — but being *added* to the group is a `my_chat_member`
  update, which it does see. To be confirmed in the trial rather than assumed;
  it decides how the on-screen instruction is worded, not whether this works.
- **Every failure gets its own words.** 401 (wrong token), 409 (this bot already
  has a webhook set elsewhere, so its messages cannot be read), `too_large`, and
  an empty result — which is **not** an error and must not read as one, because
  Telegram keeps updates for 24 hours and a bot messaged yesterday genuinely has
  nothing to show. Collapsing any of these into "no chats found" is the same
  dead end this feature exists to remove, reached from a different direction
  (§36).
- **The token is never logged, echoed back, or stored on its own.** It exists in
  a request body and in memory until the `sendMessage` URL is assembled, and
  what is persisted is the ordinary `hook.url` — no schema change, no sync
  change, no export change.

**`TELEGRAM_API_BASE` is the test seam, and the guard relaxation hangs off that
same variable rather than a flag of its own.** A fixed host cannot be pointed at
a capture server, and `sendGuarded` refuses loopback besides — so without a seam
this is only testable against Telegram itself, which is how §30 found the OAuth
callback had no test at all. Precedent and fix are exactly that one:
`GOOGLE_TOKEN_URL` / `GOOGLE_USERINFO_URL`. One condition, because two
independent switches is how the wrong one ends up set in production; a
deployment that does not redirect the host cannot reach the relaxed path.

#### The route (stage 2)

`POST /api/org/hook/telegram/chats`, owner-only via `requireSettingsOwner`
(403, not 404 — §5's rule is about *cross-org* access, and a member knows their
own workspace exists), token coerced with `String(...)` before it can reach a
URL, and rate-limited.

**It reads and writes nothing.** An owner who never picks a chat leaves no
trace on the workspace — in particular no half-configured hook for the settings
card to report on. Asserted, because "nothing was written" is the kind of
guarantee that quietly stops being true.

**Its own rate-limit bucket, and a higher bound than the test send.** They are
limited for the same reason — an authenticated caller making the server dial
out — but the rhythm differs: a lookup is legitimately pressed several times in
a row (paste, press, realise you have not messaged the bot yet, message it,
press again), and spending `/api/org/hook/test`'s allowance on that would refuse
the send that proves the setup worked. `RATE_TELEGRAM_MAX`, default 12.

**The first run of these tests failed with 429s**, which was the limiter working
and the test design wrong. Raised for the suite rather than thinning the tests:
what they cover is the failure *mapping*, and dropping cases to fit a rate limit
trades real coverage for a bound `rateLimit()` already enforces identically on
four other routes. Written down because "the tests made the limit looser" is
exactly the kind of change that should be visible rather than inferred.

**The fake Telegram gets ten reserved ports, not a share of the rotor.**
`api.test.mjs` hands out a fresh port per boot from its block (§4), so a capture
server on a port that rotor can also produce is a collision that surfaces as one
unrelated test failing occasionally — the shape §32 spent a week reading as
flakiness. The block is unchanged at 8300–8449; the app's span narrows to 140
and 8440–8449 is the capture server. 8450 is `fixture.test.mjs`, so the
reservation comes out of this block rather than off the end of it.

**The fixture's group has no `message` update at all**, deliberately — that is
what makes the `my_chat_member` assertion mean something rather than pass on a
group that would have been found anyway. Four mutations were checked and each
fails by name: dropping `my_chat_member` loses the group, adding an `offset`
trips the request assertion, removing the 409 branch reports *"the destination
answered HTTP 409"* instead of naming the webhook, and keying the de-duplication
map by update id returns three chats where there are two.

### §30's audit table changes

Row 12 read **FALSE — env-only, no runtime setter**. These routes *are* that
setter, so it now reads: *false for the env webhook; the workspace webhook is a
deliberate outbound sink with a guard.* An audit table that quietly keeps a
stale FALSE is worse than one that never had the row.

`CACHE_VERSION` bumped to `crmbuilder-v33`.


---

## 39. The reminder engine, and the staleness alert that cannot exist

Phase 3 of the reminders work — the engine §38's transport was built for. A
daily digest of what is due or overdue, per workspace, to that workspace's own
webhook. **Off by default**, because nobody's team channel should get a
message because somebody deployed a new version.

### One file, three consumers

§37's calendar arithmetic lives in a browser global inside `js/`, which
`server.js` cannot `require`. Both usual answers are worse than the problem:
copying it into `lib/` makes a second source that goes stale (§29's whole
thesis), and eval-ing the served file at boot needs a paragraph in §30
explaining why it is not an injection risk. Instead, one line at the foot of
`js/date-rules.js`:

```js
if (typeof module !== 'undefined' && module.exports) module.exports = DateRules;
```

The browser still gets its global, `server.js` gets a `require`, and
`tests/dateRules.test.mjs`'s `new Function` harness is untouched because
`module` is undefined inside it. **Requiring `js/` from the server is
deliberate** — that directory being *served* (§28) and being *required* are
unrelated concerns.

Asserted rather than assumed: the tests `require()` through the same seam the
server uses, compare the surface **and** compare answers. A require that
quietly returned something stale would pass a shape check while leaving the
server running untested code that looks shared.

### Two clocks, and they are not the same question

| | Whose day | Used by |
|---|---|---|
| `today(now)` | the **viewer's**, from local getters | §37's filter, in the browser |
| `today(now, zone)` | a **named zone's** | the engine, which has no viewer |

The browser filter deliberately does **not** read the workspace zone: somebody
in Tokyo looking at a list should see *their* today. Unifying them
reintroduces exactly the off-by-one `js/date-rules.js` exists to prevent, so
it is written down in both files.

`resolveZone()` **never throws**, and that is a requirement rather than a
convenience — §38 records why the timezone is stored without server-side
validation, so the guarantee has to live at every point of use. A throw would
take down a scheduled pass for every workspace because one of them holds a
typo. Same rule for `remindSettings()`, which clamps rather than trusts: a NaN
window makes `isDueWithin` false for everything and the digest goes quiet
**without ever erroring** — a defect that renders as plausible (§36).

**`hourCycle: 'h23'`, not `hour12: false`.** The latter selects h24 on some
ICU builds and renders midnight as `"24"`, which puts the morning gate on the
wrong side of a day boundary. The `% 24` is a second belt, because which cycle
you get is a property of the runtime rather than of this code.

### `Intl.supportedValuesOf('timeZone')` does not contain `UTC`

418 canonical IANA names, and **not one of them is `UTC`** — not `UTC`, not
`Etc/UTC`. A container with no `TZ` set resolves to exactly `UTC`, so §38's
picker could not offer such an owner their own zone, and pre-selecting the
detected one silently selected nothing. It would have arrived as *"my time
zone isn't in the list"*.

Found by an E2E test that could not select the browser's own zone — a test
failing for a reason that turned out to be the product. The device zone and
`UTC` are unioned back in; still the runtime's list, plus the two values it
omits.

### The pass

Off the `/health` ping, like the alert rules (§25) — UptimeRobot already hits
it every 14 minutes and a second scheduler is a second thing to keep alive.
After the response, never awaited.

**One pass per workspace per LOCAL day, whether or not it sends.** That is
what bounds the cost: at most one scan of a workspace's rows per day however
often the ping arrives. The consequence is stated rather than discovered —
something that becomes due at 11am is reported tomorrow. A live version means
rescanning every tenant every fourteen minutes, which is a different feature
with a different price.

**The day is marked BEFORE the send.** Marking afterwards retries on every
ping, and a destination that fails slowly turns one digest into a channel full
of them. Spamming a team channel is worse than missing a day, so the failure
is recorded on the hook where the settings card shows it. Guarded by a test
whose destination always fails.

**The gates are ordered by cost**, and that ordering is the whole scale story:
`enabled` and `hook.url` are read off the meta doc already in hand, so a
workspace not using this never touches the records collection. Two tests
assert the day is left **unmarked** in those cases rather than merely that
nothing was sent — a marked day would prove the rows had been read.

**Nothing due sends nothing.** A daily "all clear" is the fastest way to teach
a channel to ignore this — §25's escalate-only lesson in a new place.

### Counts, never record names

A digest reads *"Invoices: 2 overdue, 3 due within 7 days"* and never names a
row. **A decision, not an omission:** a webhook destination is not necessarily
as private as the workspace — a shared client channel is a plausible place for
an owner to point it, and they will not think about that while pasting a URL.
§18 already refuses to put record names on a chat service; the direction
differs here (a team's own data to their own channel, chosen by them) but the
exposure is the same shape. The nudge works without them: the message's job is
to get somebody to open the CRM. Easy to add later, impossible to un-send.

### Mentions: two mitigations, because the providers differ

| | What pings | Control |
|---|---|---|
| Discord | bare `@everyone`, `<@id>` in `content` | `allowed_mentions: { parse: [] }` — its own documented switch |
| Slack | only `<!channel>`, `<@U123>`; a bare `@everyone` does **not** | escaping `<` and `>`, which Slack's docs also prescribe for literal brackets |
| Telegram | nothing — no `parse_mode` is ever set (§18) | — |

Both are needed; neither alone covers the other. Applied where untrusted text
**enters** the message, never to the whole string, because the app's own URL
has to stay a working link.

**The cost, stated rather than hidden:** a literal `<` in a module name renders
as `&lt;` on Discord and Telegram, which do not decode entities. A cosmetic
price on a rare character, paid to keep Slack's mention syntax inert. Do not
"fix" it by dropping the escaping.

This lands in `webhookRequest`, shared with the feedback and alert paths — so
a bug report containing `@everyone` can no longer wake the operator's channel
either. §9's shared-helper rule applies.

### The staleness alert that cannot exist

The brief asked for one. **It cannot work**, and the reason is worth keeping:
the engine and the alert rules both run off the `/health` ping, so a rule for
"reminders have gone stale" could never fire for the reason that matters — a
dead ping stops the thing that would evaluate it. That is §17's shape, the
backup workflow that reported success every night while producing nothing,
reached from a different direction.

So staleness splits, and only one half is code:

- **Pull** — `platform.reminders` on `/api/admin/platform`, rendered on the
  Deployment card, and `null` until the first pass rather than a
  zero-hour-old success. An operator who looks, sees. The card says plainly
  that if the ping stops, nothing here can tell you.
- **Push** — `REMINDER_HEALTHCHECK_URL`. **This is code, and the first
  version of this section said it was "configuration rather than code",
  which was wrong.** The backup's switch is configuration because an external
  job runs it and can `curl`; this pass runs *inside* the server, so the
  server has to emit the ping. Nothing external can see whether it happened.

**What the outbound ping fixes that a rule could not.** A rule asks "is
something wrong" and needs to be running to answer. A ping asserts "I am
alive", and the thing that notices its ABSENCE is somebody else's machine —
which is exactly the property a dead ping loop destroys in the rule and cannot
touch here. So it covers **both** failure modes at once: the engine wedging,
and the keep-warm ping dying. Either stops the pass, and either therefore
stops the signal.

**Pinged for a pass that RAN, not one that SENT.** A quiet weekend, or a
deployment where nobody has switched the digest on, is the engine working;
gating on `sent > 0` pages you every Sunday, which is §25's "an alert that
fires when nothing is wrong trains you to ignore it". That is **not** a
contradiction of §17's rule that an unconfigured run must not report health —
there, "did nothing" meant missing secrets wearing success's clothes. Here it
is a legitimate state, and the claim being made is only "a pass executed". A
pass that was rate-limited, or that threw before finishing, never reaches the
ping.

**Silence and `/fail` are told apart on purpose.** Healthchecks treats
`<url>/fail` as an explicit failure signal, so a pass with a failed delivery
says "I am running and something in me is broken" while a dead deployment says
nothing at all. Opposite problems, opposite responses — reporting both as
silence would throw that away.

Env-supplied, so it is the unrestricted trust level (§38) and uses plain
`fetch` — no runtime setter, which keeps §30's SSRF finding false for it. The
URL is a bearer credential, so it must never reach `platform` (§17's rule) and
nothing interpolates it into a log line. The body carries counts only:
Healthchecks shows it in its own log, which is one more place a customer's data
must not appear.

**Test trap, hit twice.** The healthcheck tests need their own deployment.
The main suite deliberately leaves workspaces whose sends fail, so a pass there
correctly signals `/fail` — which makes "a healthy pass reports health"
unprovable on it, and the failure reads as the ping being broken when it is the
fixture. The second server also keeps the real `REMIND_MIN_GAP_MS`, which is
what makes the rate-limited path reachable at all. And **the platform admin is
the FIRST account on a deployment** (§21): signing in fresh gets an owner,
`/api/admin/reminders/run` answers 403, no pass runs, no ping is sent — a
third way to arrive at "the ping looks broken".

Setup steps, and what a red check means in each direction, are in
`docs/BETA.md` § *"Knowing the daily digest is still running"*.

### The suite is split in three, and it has to be

A workspace webhook goes through `lib/safe-fetch.js`, which refuses loopback,
so a local capture server **cannot** receive one — and a bypass so it could is
exactly the weakening §30 declined for the feedback webhook.

| Half | How |
|---|---|
| pass mechanics | driven through the real endpoints, read back out of the store |
| payload shape | a capture server, through the **env** webhook — unrestricted by design, and it shares one payload builder |
| message wording | read off the **preview**, which returns the exact string |

Returning the real string from the preview is the better product answer
regardless: an owner reads what their team will read before switching it on.

`tests/reminders.test.mjs`, ports 9700–9750 (§9). Six mutations each fail the
test that names them: dropping any of the three gates, marking the day after
the send, dropping `neutraliseMentions`, dropping `allowed_mentions`.

**And the parity test is the one that justifies sharing a file.** The count in
the digest must equal what the due-date filter shows. It **aligns the two
clocks first**, setting the workspace zone to the browser's own — without
that it would pass in a UTC container and fail on a European developer machine
for something that is not a defect. Checked against a future-only window: it
fails by name, *"the digest would say 3 but the filter shows 7"*.

### Traps in the UI half

- **§27's invented-class trap, nearly repeated.** `.hr`, `.settings-sub` and
  `.digest-preview` did not exist in `css/style.css`; an undefined class
  renders as an unstyled box that still looks plausible in a screenshot, which
  is how `.note.warn` shipped meaning nothing. They are defined now.
- **`DB` is a bare global, not `window.DB`.** A top-level `const` in a classic
  script is lexical, so `window.DB` is `undefined` — an E2E `page.evaluate`
  reaching for it fails with a `TypeError` that names the property rather than
  the mistake.
- **The preview is computed by the SERVER**, so saving digest settings has to
  `await Cloud.sync()` before re-rendering. `persist()` only schedules a
  debounced push, and redrawing straight away shows the old window beside the
  new controls — §33's adjacent-and-wrong number in a new place.

### The state that rendered as nothing

**Found by running the trial, not the tests**, and it is §36's lesson arriving
somewhere new. With the default `hour: 9` and a server clock at 02:00, the
pass correctly skips as `too-early` — and the settings card said **nothing at
all**, because its only line was *"Last checked …"*, which needs a pass to
have run. Working exactly as designed, and indistinguishable from broken.

Every branch is named now, and `digestStatusHTML` walks the same gates the
server walks **in the same order**, so the reason shown is the reason the pass
would actually stop at:

| Card | State |
|---|---|
| *nothing is sent until you switch it on* | off |
| *set a webhook above first* | on, nowhere to send |
| *Waiting until 09:00 in \<zone\>, where it is now 07:32* | on, before the morning gate |
| *Due to go out on the next check* | on, past the hour, not yet run today |
| *Checked \<when\> — N items. Next check tomorrow* | already ran today |

`zoneParts` carries a **minute** now, so the line can say *07:32* rather than
*07:00* — an hour-rounded time reads as wrong to somebody looking at their own
clock, and it sits beside a gate expressed in whole hours.

**The E2E's first version missed a state and then failed against it.** It
never configured a webhook, so the card correctly said *"set a webhook above
first"* where the test expected *"Waiting until…"* — the missing state proving
it needed naming. It walks all four now, choosing the "later today" hour off
the **workspace's own clock** rather than assuming one, and skipping that
branch at 23:00 rather than faking it. Checked against the broken state: the
old card fails on the very first assertion, because *off* said nothing either.

`CACHE_VERSION` bumped to `crmbuilder-v35`.
