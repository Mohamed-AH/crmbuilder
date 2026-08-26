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
privacy.html          privacy policy | terms.html  terms of use  (see §19)
legal.css             styling for those two — they load no app JS at all
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
tests/                smoke, API contract, CSV unit, signup gate, migrations, E2E
docs/                 user guide, onboarding, demo script, architecture, BETA runbook
```

---

## 2. Current status

**All green:** 153 Node tests + 69 Playwright tests.

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
- One-click demo business (107 records) and a 6-step guided tour
- **Self-serve beta signup**, complete: the code gate (stage 1), backups and
  measured usage (stage 2), problem reports (stage 3), and the legal pages,
  beta notice and runbook (stage 4) — see §16, §17, §18, §19
- **Access requests**: a stranger who arrives on their own can ask, and an
  approval lets them straight in with nothing to email — see §20
- Docs: USER-GUIDE, ONBOARDING, DEMO-SCRIPT, ARCHITECTURE, BETA, product-tour.html

### Not built yet
- Email sending, third-party integrations.
- **Per-module permissions** — everyone on a team sees every module. Considered
  and set aside: it needs per-module filtering in sync, or a member receives
  rows they cannot see.

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
bumping `CACHE_VERSION` (currently `crmbuilder-v18`).

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

All four stages are shipped: org-owned workspaces, invites, permissions, and
member management.

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

---

## 14. Permissions (stage C)

| | owner / platformAdmin | member |
|---|---|---|
| records: create, edit, delete | ✅ | ✅ |
| module fields, add/delete modules | ✅ | ❌ |
| invite, roles, remove members | ✅ | ❌ |

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
`CACHE_VERSION` is now `crmbuilder-v14`; anything added to those pages must be
added to that list too, or it silently becomes the app.

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

Tier 2 from the audit: no read-only role (every member may delete every
record), and record-level last-write-wins loses a concurrent field edit. Held
deliberately — reopening the permission model before the beta launches is
complexity small trusted teams do not need.

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

## 24. Operator controls — IN PROGRESS

**This section is the resume point for this work.** Stage status is kept
current here; anything marked ☐ has not been built. The reasoning behind the
shape — why Render cannot be read, why orgs need their own gate, the full
verification list — is in `docs/OPERATOR-CONTROLS.md`. Six asks, and the first
thing to know is that they are not six pieces of work — two were already done
and one cannot be built as worded.

| Ask | Where it stands |
|---|---|
| Total users and orgs | ✅ Stage A — `GET /api/admin/platform` + the Deployment and Organisations cards. Was: `/health` reports both to a platform admin, but `/api/admin/stats` has no org count and there is **no org list at all** — `listOrgs()` is used only by the backup export |
| Per-org and combined usage | ✅ Stage A — `usageByOrg()`, measured with `$bsonSize` (Mongo) and serialised length (file store), cached 30s |
| Resource quotas | ✅ Stage A — three meters: Mongo, RSS, monthly egress. Uptime hours dropped — see below |
| Halt user signups | ✅ Done — the mode switch, §16 |
| Halt org creation | ☐ Stage B. A **separate** lever, and not a duplicate of the above — see below |
| Pause/resume a user | ✅ Done — `disabled` + `PATCH /api/admin/users/:id` |
| Pause/resume an org | ☐ Stage B |
| Telegram alerts | ☐ Stage C. The transport exists (§18); thresholds, state and trigger do not |

### Three decisions taken before any code

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
- ☐ **B — the levers.** `orgCreation` beside the signup mode, same `platform`
  document and the same precedence rule (§16: a panel decision beats the env
  var and survives a redeploy). Org suspend/resume via `suspendedAt` +
  `suspendedReason`: sync refuses writes with a named reason, sign-in still
  works, **nothing is deleted**. `deleteAccount` stays the only thing that can
  remove a workspace (§5) and nothing here may touch it. The wording is one
  word from deletion and a decade of data apart — §15's lesson.
- ☐ **C — alerts.** Mongo storage at 60/85/95%, RSS at 70/85%, egress at
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
