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
| Restore granularity, and the webhook a recovery cannot bring back | §38 |
| Problem reports and webhook shapes | §18 |
| Legal pages, service-worker page trap | §19 · §47 |
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
| **UK launch, Frankfurt, and a smoke check that passed on its own bug** | §38 · [`docs/archive/UK-LAUNCH.md`](docs/archive/UK-LAUNCH.md) |
| **Daily digest**: the pass, its gates, mentions | §39 |
| Why a "reminders are stale" alert cannot work | §39 |
| **`/health` vs `/healthz`** — which one runs anything | §40 |
| Alerts and digests silently never running | §40 |
| **What a healthy reminder ping log looks like** | §40 |
| Expected refusals in the production log | §40 |
| **Restoring into a new or existing database** | §40 · [`docs/BETA.md`](docs/BETA.md) |
| **Rotating a Healthchecks ping URL** — and the swap that leaves both green | [`docs/BETA.md`](docs/BETA.md) · §39 |
| **Decrypting a backup artifact** — command, passphrase, failures | [`docs/BETA.md`](docs/BETA.md) · §40 |
| Invites and beta codes a restore cannot carry | §40 |
| **Terms acceptance**: the version, and asking again | §41 |
| **A modal button that settled as a dismissal** | §41 · §22 |
| **Consent & lawful basis template** | §42 |
| **CSV date import** — the day it lost, and DD/MM | §42 · §37 · §45 |
| **A question with no correct default** — how to ask one | §45 |
| **What to send a customer** — the short page, and the post | §47 |
| A doc page that rendered as the app | §47 · §19 |
| **CI red that clears on re-run** — the live smoke vs the deploy | §46 |
| Which commit is actually deployed | §46 · §40 |
| **Subject access requests**: the search, and what it cannot find | §43 |
| **Closing your own account** — and what it takes with it | §43 · §15 |
| **Retention**: what has gone quiet, and why nothing deletes it | §44 |
| Calendar months backwards, and the overflow that skips one | §44 |
| Workspace time zone — and why the filter ignores it | §39 · §38 · §37 |
| E2E suite slow or "flaky" | §32 |
| **What tombstones cost**, and reading storage figures | §33 · §26 |
| **How the docs are organised**, and what is frozen | §29 |
| **Own domain / pricing** — everything a launch has to change | [`docs/LAUNCH-CHECKLIST.md`](docs/LAUNCH-CHECKLIST.md) · §48 |
| **Sweeping for what is live and unnoticed** — how, and what it found | §48 |
| **Chaser, renewal tracker, dormancy report** — the spec, before any code | [`docs/CHASER-AND-TRACKERS.md`](docs/CHASER-AND-TRACKERS.md) |
| **Tracking what expires** — the template, and the one date field | §49 · §37 · §39 |
| **Dormancy vs retention** — two questions, two clocks | §50 · §44 |
| **Chasing an overdue record** — the draft, and the two escapes | §51 |
| **A provider key on the meta doc** — where it goes, and what redacts it | §52 · §38 · §17 |
| Resend vs Postmark, detected rather than asked | §52 |
| **Sending a chaser** — the recipient rule, and the relay it closes | §53 · §51 |
| **A doc sibling that survives a stale push** — the union, not more clocks | §54 · §26 · §10 |
| Who already chased this, and sent vs drafted | §54 |
| **A failed write killed the process** — async routes, and a Windows rename | §55 · §30 · §4 |
| **A test that passes in a UTC container** — and the save it was hiding | §55 · §45 · §39 |
| **Reaching a prebuilt module you skipped at onboarding** | §56 · §49 · §42 |
| **Where BYOK setup is written down** | §56 · §52 · §53 |

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
lib/mail-send.js      bring-your-own-key email — Resend and Postmark (§52)
index.html            app shell (script order matters — see §3)
privacy.html          privacy policy | terms.html  terms of use  (see §19)
legal.css             styling for those two — they load no app JS at all
css/style.css         Inter + blue/slate palette, light/dark, desktop-first
js/icons.js           inline Lucide SVGs (generated — see §6)
js/boot-icons.js      fills static icon placeholders — a file, not inline (§30 CSP)
js/scope.js           whose data is this — storage scopes (see §11)
js/db.js              IndexedDB wrapper, one database per scope
js/csv.js             RFC 4180 CSV reader/writer
js/date-rules.js      calendar-day arithmetic for the due filter (§37) and the
                      retention window (§44) — also required by server.js (§39)
js/dsar.js            finds every place one person appears (see §43)
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

**All green:** 498 Node tests + 126 Playwright tests, and the smoke audit at
**46 passing locally / 51 against production** — the same checks either way,
with five of them informational on a local file-store HTTP deployment and real
assertions against a live one (§46). **On Windows some Node tests skip
themselves** and say why — §4's SIGTERM note is one, and `resilience.test.mjs`
skips whichever of its cases cannot be made to fail on the platform in hand
(§55). A named platform limit, not a failure; the count is whatever the run
prints, so do not pin it here.

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
- **An overdue chaser that drafts rather than sends** — it writes the reminder
  and hands it to the reader's own mail client, so there is no key, no
  sub-processor and nothing sent from the deployment — see §51. A workspace
  that connects **its own Resend or Postmark account** can send it in one press
  instead; the draft stays the default and needs no setup — see §52, §53
- **A dormancy report** beside the retention one — same card, same scan, a
  different clock: who nobody has *contacted*, aged on a date field you pick
  rather than on the record's last edit. Reports and never deletes — see §50
- **A `Renewals` template** — a register of certificates, licences and
  inspections that expire. No new machinery: the due filter and the digest
  already count a date field, so this is the columns plus the wiring — see §49
- **A date-format control on the CSV import screen** — the order is an input,
  preselected from what the file proves and required when it proves nothing;
  never guessed — see §45
- **Controller-side data protection tools**: a Consent & lawful basis template
  (§42), a subject-access search and self-serve account deletion (§43), and a
  retention review of what nothing has touched (§44). All three report or act
  on the tenant's own workspace; none of them make anybody compliant.
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
(currently `crmbuilder-v54`). Miss the allow-list and it 404s in production
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
npm run test:smoke                                      # 45 local / 50 live (§46)
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
| `mail.test.mjs` | 9800–9850 | 2 capture (9800–9839) + 1 app (9840–9849) |
| `resilience.test.mjs` | 9900–9950 | 1 |

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
healthchecks.io, and only when a *validated backup was fetched, encrypted,
proved to decrypt, and stored* —
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
walked through `README.md`, `guide.html`, `USER-GUIDE.md`, `manual.html`,
`product-tour.html`, `ONBOARDING.md`, `DEMO-SCRIPT.md` and `BETA.md`'s tester
note.

**The criterion is *read directly by an outsider*, not *served*.** `README.md`
is on the list and 404s in production — it is the repository's front page and
somebody reads it as a document. That is what `MARKETING.md` is **not**: it is
source copy nobody reads as a document, which becomes public only when a person
copies a paragraph out of it into a post. It was briefly added here and has
been taken off again — see §48. `manual.html` and `product-tour.html` are the easiest to forget because
they are HTML and nothing greps them by habit.

**`README.md` and `guide.html` were added to that list later, and the README
was added because leaving it off had already cost something** (§46): it is the
front page, it is what somebody reads first, and it had fallen a year behind
while every document that *was* on the list stayed current. The original rule
said "not just this file and the README", which reads as though the README were
covered. It was not covered by anything. `guide.html` is the short
customer-facing page (§47) and goes stale the same way for the same reason.

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
  update, which it does see. **Confirmed by trial** (it was flagged here as an
  assumption first): pressing Start finds the private chat, adding the bot to a
  group finds the group, and neither needs a message posted afterwards.
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

#### The screen (stage 3)

A collapsed `<details>` under the webhook field: BotFather link, token field,
**Find my chat**, then a list to pick from. Picking assembles the URL and goes
through the ordinary `PUT /api/org/hook`, so the save probe, the refuse/warn
split and the masked read view are all unchanged — **no schema change, no sync
change, no export change.**

**The copy fix is part of the feature, not decoration.** The card said *"paste
the webhook URL that Slack, Discord or Telegram gives you"*, which is true for
two of the three. Telegram gives you no such thing, so the only affordance on
the card sent exactly the audience that needed help looking for a button that
does not exist. It now names what each provider actually hands over.

**Results are painted into `#tg-results`, never by re-rendering.** A full
`renderSettings()` wipes the token field, so an owner would have to paste the
token again in order to pick a chat they had just been shown — and the token is
the one thing on that screen they cannot recover from anywhere. For the same
reason the pick handler **re-reads** the field rather than closing over the
value: the credential belongs in the input the owner can see, not in a captured
variable that outlives the lookup.

Collapsed by default because it is one provider of three, and an open block of
setup instructions reads as work everybody has to do. `.tg-setup`, `.tg-steps`,
`.tg-chat-list` and friends are **defined in `css/style.css`** — §27's
invented-class trap, which is how `.note.warn` shipped looking fine and meaning
nothing.

**Buttons, not a `<select>`.** Each row carries the chat's kind — *group*,
*private* — and a picker's single line would have to drop it. That label is
what tells two similarly named chats apart.

**Step 2 names the consequence, not the action — found by the trial.** It first
read *"send your new bot a message; for a group, add the bot instead"*, which
presents two interchangeable ways of making the bot visible. They are not: **the
action taken IS the destination.** Press Start and the digest arrives as a
private message to that one person; add the bot to a group and it goes to the
whole group. An owner who reads only the action discovers which they picked when
the first digest lands — possibly in a channel with the client in it, which is
the exposure §39's counts-only rule already exists for. It is now written as a
choice with its two outcomes named, and guarded by an E2E assertion so it cannot
drift back to naming only the steps.

#### The fake Telegram is one file, shared by both suites

`tests/fake-telegram.mjs` exports `createFakeTelegram()` for
`tests/api.test.mjs`, and **`playwright.config.js` runs the same file directly
as a second `webServer`**. The lookup happens on the *server*, so no amount of
browser-side stubbing covers it, and the alternative — letting the E2E dial the
real Telegram with a bogus token — puts a network dependency in CI.

A second copy of the fixture would go stale in the direction that matters, with
one suite quietly testing a shape the server no longer produces (§29). Port
**8299**, below every `node --test` block so a Playwright run and a Node run
cannot collide over it.

Two E2E journeys, each checked against the state that breaks it: reverting the
copy fix fails *"an owner finds their Telegram chat…"* on its first assertion,
and collapsing the empty result into *"No chats found"* fails *"an empty
Telegram lookup says what to do…"*. That second test asserts a bad token gets
**different** words, so it cannot pass on a version that says one thing for
every outcome.

**A stale line in two user docs, found while editing them.** `USER-GUIDE.md`
and `manual.html` both still said the webhook test *"is all it does — nothing
sends on its own yet"*, two paragraphs above the section describing the daily
digest that §39 shipped. §27's drift, in the exact pair of files §27 names as
the easiest to forget.

### Moving the deployment to Frankfurt, and the smoke check that never worked

The UK launch's Phase 0 (`docs/archive/UK-LAUNCH.md`): Render to Frankfurt,
Atlas to `eu-central-1`, seeded by restoring a real nightly artifact rather
than starting empty. **Restoring before switching is what closes §21's
first-account-becomes-`platformAdmin` window** — the app never comes up against
an empty `users` collection, so the bypass has nothing to fire on regardless of
`ADMIN_EMAILS`.

`privacy.html` said *"currently in their US regions"*, which was true that
morning and false the moment the switch landed. It also claimed a **complete**
list of who else sees the data and omitted **GitHub**, which holds the nightly
backup. Both fixed. A first draft of the new backup paragraph said backups
*"are encrypted"* — they are not yet, that is Phase 1 — and it was caught
before the commit. **A privacy page is the last place an intention should be
written as a fact.**

#### The check accepted the exact answer that means it failed

The move made `an oversized body is refused, not absorbed` fail with a timeout.
That part was mundane: it is the **only check in the file that uploads**, the
body is 200 KB, and the shared 20s budget is sized for "how long does the server
take to answer" rather than "how long does the body take to arrive". Moving the
origin further away broke it while the limit worked perfectly — a manual `curl`
answered 413 immediately. It has its own budget now (`SMOKE_UPLOAD_TIMEOUT`),
and a timeout reports **WARN** rather than FAIL, because an unanswered question
is not a failed limit and *"Deployment is NOT healthy"* over a healthy
deployment is expensive out of proportion to the check.

**The real finding came out of proving the fix.** The check accepted `413` *or*
`401`, on the reasoning that "auth runs first". **It does not.**
`app.use(express.json({ limit: '64kb' }))` is global and runs before any
route's middleware, so on a correct server an oversized body is rejected by the
parser and never reaches `requireAuth` — 413 every time. A **401 means the body
was parsed** and then refused for the unrelated reason that nobody was signed
in, which is exactly what a missing limit looks like.

Measured rather than argued: restoring the old global `8mb` — §30's finding #4,
the regression this check exists for — made it report `HTTP 401` and **pass**.
It had never once been able to catch the thing it is named after. Only 413
passes now, and 401 fails by name.

Two smaller things confirmed while proving it: `bigJson` is mounted on
`/api/sync` and `/api/data` **before** the global parser, so those two win and
the global skips them (body-parser sets `req._body` and later parsers bail) —
the ordering is load-bearing and reversing it would cap a sync push at 64 KB.
And `curl --data-binary` with a 200 KB argument dies with *"Argument list too
long"*; write the body to a file first.

### A restore switched off every webhook, silently

Asked as a question — *"each time I restore, is the webhook lost? does everyone
need to re-add?"* — and the answer was yes, on the operator path, for everybody
at once, **with nothing anywhere saying so**.

**Two restore mechanisms, and only one has this problem.** `scripts/restore.mjs`
is whole-deployment: `deleteMany({})` across seven collections, no per-tenant
filter. The owner's *Settings → Import backup* is one workspace and does not
touch the hook at all — the client's export carries `settings`, `modules`,
`records`, and never held the URL to begin with (no read-back, §38). So "can it
be restored per account" is **yes, but by the owner, not the operator**.

**The defect was the silence, not the loss.** The URL cannot come back — it is a
credential and is never exported, which is correct. But `restore.mjs` **stripped**
the `{ redacted: true }` marker before writing, so the information died in the
operator's terminal: `publicHook()` then answered `{ configured: false }`, which
is byte-identical to a workspace that never set one up. A recovery therefore
turned off every customer's notifications and the only clue was a line the
operator saw once, during an incident, weeks before anyone noticed a digest had
stopped arriving.

This file's recurring shape, in a new place: **the state that renders as
nothing** (§36, §39).

`{ needsReentry: true }` is written now instead of stripping. It carries no
`url`, so `deliverToHook` and the digest gate both refuse it unchanged, and the
Settings card says the destination needs re-entering rather than offering a
blank field. **The digest gate needed its own branch**: both states land on
"nothing configured", and *"set a webhook above first"* is advice for somebody
who never did the work.

**Not the host, and that was scope creep caught mid-change.** The first version
exported `{ redacted: true, host }` so the notice could say *"you were sending
to api.telegram.org"* — a better prompt, and it broke an existing assertion
that the backup **must not name the webhook host**. That assertion is
deliberate. Carrying the host would put which chat provider each tenant uses
into an artifact §17 is already uneasy about, to save an owner from remembering
a choice they made themselves. Reverted; the notice reads fine without it.

**A test whose name was true and whose assertion was not.** *"the owner is told
their notifications are off, rather than left to find out"* asserted
`{ configured: false }` — precisely the state in which they are **not** told. The
name described the intention and the assertion pinned the opposite, and it
passed. It now asserts `needsReentry`, with a companion that a workspace which
never had one is **not** told to re-enter anything — without which, marking every
empty hook would satisfy the first test while telling people to restore
something they never had. Both mutations checked: stripping the marker fails two
tests, marking everyone fails the third.

**The E2E half is injected, not real** — §20's precedent. The state only exists
after `restore.mjs` has run over a deployment, and Playwright cannot restore its
own server mid-run, so the journey intercepts `/api/org/reminders` (which carries
the hook and the digest state together, which is why one interception moves
both). The real export → restore → boot cycle is covered in
`tests/backup.test.mjs`. Each UI branch was mutated separately and fails on its
own.

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


---

## 40. The keep-warm ping was on the wrong URL, and six documents said otherwise

Reported as two log lines and an outage, and they turned out to be three
unrelated things: one expected refusal logged as a fault, one real mechanism
that had never run, and one deployment that was never down.

### `/healthz` is not `/health`, and only one of them does anything

```js
app.get('/healthz', (req, res) => res.json({ ok: true, storage: store.kind() }));   // 2349
app.get('/health',  async (req, res) => { …                                        // 2351
  evaluateAlerts()…                                                                // 2390
  remindPass()…                                                                    // 2398
```

The live UptimeRobot monitor was on **`/healthz`** — the original liveness
probe, kept byte-compatible on purpose (`render.yaml` calls it "the older" one)
and doing nothing but answering. So the §25 alert rules and the §39 reminder
pass, both of which are documented as running "off the keep-warm ping", had
**never once run off it.** The monitor predates `/health` and was never moved.

**The service was warm the whole time**, because any request wakes a Render
instance. That is what makes this invisible: the thing the monitor was created
for kept working perfectly, and the two things later bolted onto the same ping
did not.

### Both monitors were telling the truth, about different things

| | Said | Correct? |
|---|---|---|
| UptimeRobot | 100% over 7 days, 0 incidents | yes — the app was never down |
| Healthchecks `reminders` | DOWN 14h39m, UP at 09:44 | yes — no pass had run |

The only live caller of `/health` is the **CI smoke test** (`tests/smoke.mjs`'s
*sync model* check). So a reminder pass happened when, and only when, somebody
pushed to the repository. The check went UP at 09:44 because a deploy landed
and CI ran the live smoke against production; it had gone down overnight
because nobody pushed for longer than its 1-hour period. Read as an outage,
which is the obvious reading and the wrong one.

### What actually caught it, and what could not

§39's **outbound Healthchecks ping** — the "push" half, built because a
"reminders are stale" alert *rule* cannot work when the rule and the engine
share a trigger. That reasoning turned out to describe this exact failure, one
step earlier in the chain than it was written for: a dead ping stops the pass
**and** the rule, and only a machine that is not ours can notice the silence.

Nothing else could have. The suite proves `/health` runs the pass; **nothing
proves that anything calls `/health`**, and nothing can — the caller is a row
in somebody's UptimeRobot account. That is the general shape worth keeping:

> **A mechanism that hangs off a URL configured somewhere else has a failure
> mode no test in this repository can see.** The further the trigger lives from
> the code, the more the documentation has to be checked against the
> configuration rather than against the source.

Six places asserted the ping was on `/health` — §17, §24, §25, §39,
`DEPLOYMENT.md` and `docs/BETA.md` — and all six were describing the intent.
Every one was written by reading `server.js`. None was written by opening the
monitor. `DEPLOYMENT.md` and the BETA runbook now say to check the monitor's
address, and say what a monitor on `/healthz` looks like: green, warm, and
silent.

### Why `/healthz` was NOT changed to run the pass too

It is the obvious fix and it is the wrong one. **Eight test files poll
`/healthz` in their boot-wait loop**, so alert evaluation and reminder passes
would start firing during startup in suites written to control exactly when a
pass runs (§39's whole design). That is §9's blast-radius rule: the edit is one
line and the damage is in files that do not mention it.

The alternative — firing it from `/healthz` only when `IS_PROD` — is worse
still: production would then be the one environment running a path no test
covers. The fix is one field in the monitor, and it is the operator's, not the
code's.

### Confirmed fixed, by the only evidence that could confirm it

This section says *"nothing proves that anything calls `/health`, and nothing
can — the caller is a row in somebody's UptimeRobot account."* It is now
proven, from the one place outside this repository that could do it: the
reminders check's own ping log, after the monitor was moved.

```
04:02  scanned 0, sent 0, failed 0, 6ms
03:54  …                              4ms
03:48  …                              6ms
03:34  …                              7ms
03:20  …                              7ms
03:06  …                              6ms
02:51  …                              6ms
02:44  status: new → up               196ms
```

**The cadence is the finding.** 02:51 → 03:48 is 15, 14, 14, 14 minutes — five
pings in a row on UptimeRobot's interval, with nothing being pushed. Only a
scheduled monitor produces that, so **the monitor is on `/health` and the pass
is riding it**, which is exactly what had never once happened before §40. The
outage is closed rather than assumed closed.

The three short gaps (7, 6, 8 minutes) are CI: a push runs the live smoke,
which hits `/health`, which runs a pass. That is the same overlap that makes a
single green ping meaningless straight after a deploy — hence the quiet-period
test in the runbook. Here it cuts the other way and is just noise on top of a
cadence that is already unambiguous.

Two smaller confirmations in the same log. **`scanned 0` proves the gate
ordering** (§39: `enabled` and `hook.url` are read off the meta doc, so a
workspace nobody has switched the digest on for never touches the records
collection) — the pass is doing nothing, cheaply, which is the design. And
**the body is the counts-only one**, which is what proves this check is fed by
the reminder pass rather than by the backup job: the swap that would leave
both checks green (`docs/BETA.md` § *Rotating either ping URL*) has not
happened. `196ms` on the first ping and single digits after it is a cold start
followed by a warm service.

### The other log line: an expected refusal, reported as a fault

```
Unhandled error on POST /api/feedback: PayloadTooLargeError: request entity too large
    at readStream (…/raw-body/index.js:163:17)
    …
```

Correct behaviour, mislabelled. The error handler logged **before** it
classified, so a body over the 64 KB limit — the guard working — was written
out as an unhandled error with a full stack trace. And it is not rare: the live
smoke test posts a 200 KB body on **every run** (§38), so every deploy check
left one of these in the production log.

Classification moved above the log. An expected refusal is now one line on
`console.warn` (`Refused 413 POST /api/feedback: entity.too.large`); anything
unclassified keeps the stack trace on `console.error`. Expected is not the same
as uninteresting — a burst of them is still worth seeing — so it stays on
stderr rather than being swallowed.

**Asserted on the server's own output, not on the status code**, because the
status was already right on the broken version: 413, every time. The defect
lived only in the log, so only the log can catch it. *"a refused oversized body
is logged as a refusal, not as an unhandled error"* fails on the pre-fix
handler at the `Unhandled error` assertion.

The cost of a log that shouts at its own working guards is the one §25 already
names for alerts, in a new place: it trains the reader to skim, and the lines
worth reading are the ones that get skimmed.

### The privacy page said "complete list" and was not, again

Both notification channels were verified live after the monitor fix, and the
operator channel's own history is what showed it: a problem report sitting in
Telegram carrying a beta tester's **email address** and what they wrote.

`privacy.html` named Render, Atlas, Google and GitHub, said *"If a problem
report is sent, we may receive a notification containing your email address and
what you wrote"* — and then closed the section with **"That is the complete
list."** It never said *where* that notification goes. Telegram holds real
personal data for this deployment and was not on a list that declares itself
complete, which makes the sentence false rather than merely brief.

**Exactly the GitHub omission from earlier in §38, in the same paragraph, found
the same way** — by looking at a live artifact instead of at the code. The rule
that section states ("a privacy page is the last place an intention should be
written as a fact") has a second half now: *a page that claims completeness has
to be re-checked against what the deployment is actually doing, not against
what the code could do.*

**`docs/archive/UK-LAUNCH.md` had it right and the shipped page did not.** Its
roster reads "…and whatever `FEEDBACK_WEBHOOK_URL` points at. A tenant's *own*
workspace webhook is their choice and not ours to declare." That is the correct
analysis, written in a frozen plan, never carried across to the page a regulator
reads. A plan being right is not the same as a product being right.

Three things now said, and the distinctions are the substance:

- **Telegram is named**, because it genuinely receives personal data.
- **UptimeRobot and healthchecks.io are described but not listed as recipients
  of data**, because they receive none — one asks whether the site answers, the
  other is told `scanned N, sent N, failed N` (§39's counts-only ping). Listing
  them beside Telegram would imply they hold something. Padding a roster is its
  own kind of inaccuracy.
- **The workspace digest is disclosed and explicitly excluded from our list.**
  The destination is the *owner's* choice, so on the controller/processor split
  the tenant owns it — but a team member deserves to know their workspace can
  send counts somewhere their owner picked. §39's counts-only rule is what makes
  that sentence short enough to be reassuring.

**No `CACHE_VERSION` bump.** `privacy.html` is in `sw.js`'s `STANDALONE_PAGES`
and goes straight to the network, never precached (§19) — checked rather than
assumed, including that it is absent from `APP_SHELL`.

### Invites and beta codes: the third thing a restore cannot bring back

Found while answering "what is next", by reading the export rather than the
code that consumes it. `GET /api/admin/export` carried `orgs`, `users`,
`accessRequests`, `platform`, `workspaces` — and **not `invites`, not
`betaCodes`.** Nothing in §17 or in the route's own comments mentions either;
the version-2 note explains why `accessRequests` and `platform` were added and
never considers them. So this is a third collection lost by the same export, of
the same class §17 records as *"found by running the drill, not by reading it"*,
still undiscovered because no drill had ever exercised an outstanding invite.

It was already live: after the Frankfurt migration every invite link a
colleague was holding was dead, and the beta codes were gone. That is why
"mint fresh beta codes" had been sitting on the to-do list with no explanation
attached.

**They should stay out of the export, and that is the whole design.** An unspent
invite grants membership of an org; a beta code grants an account. Both are
bearer credentials of exactly the class §17's rule keeps out of the artifact
("NEVER PUT A CREDENTIAL IN `platform`"), and a GitHub build artifact is
downloadable by anyone with repo read access. Exporting them to make a restore
lossless would put org membership into a file whose audience §17 is already
uneasy about.

So the fix is the §38 shape again, one level up: **carry a count, not a code.**

- The export gains `outstanding: { invites, betaCodes }` — two integers.
  `version: 3`, informational as before.
- **Only the VALID ones.** A spent, revoked or expired invite is already dead,
  so counting it inflates the number an operator has to act on — §25's noise
  problem in a new place. Guarded: swap `inviteState`/`betaCodeState` for a
  bare `.length` and the fixture's dead pair makes it report 2 and 2.
- `restore.mjs` turns a non-zero count into `platform.restoreNotice` and says
  so in the terminal.
- **Admin → Deployment shows it until dismissed.** Not the terminal alone —
  §38's entire lesson is that a line read once during an incident is not a
  record, and the digest that stopped was noticed weeks later.

**Why dismissible rather than self-clearing.** There is no event that means
"everything needed has been reissued": minting one invite says nothing about
the beta codes. Inferring it would clear the notice with the work half done,
and leaving it forever turns a line that matters once into furniture. So an
operator says so explicitly, and nothing guesses.

**Setting the key to `null` rather than deleting it** works identically on both
stores — FileStore spreads the patch, MongoStore `$set`s it, and the read is
`restoreNotice || null` either way. A `$unset` would be a special case on one
backend and not the other, which is §25's FileStore/MongoStore divergence: the
standing example of that costing an afternoon.

**The rejection wording is NOT changed, deliberately.** §13 makes every invite
failure answer identically so codes cannot be enumerated, and that is a
security property, not an oversight. The consequence is that the person
clicking a dead link cannot tell a lost migration from a wrong code — which is
precisely why the *operator* has to be told, since they are the only one who
can reissue and the only one who would otherwise never find out.

**Traps, and two of them were in my own tests:**

- **The version-1 clone kept `outstanding`.** `a backup from before this change
  still restores` builds its legacy file by deleting `accessRequests` and
  `platform` from a current one — so it was a v1 shape carrying a v3 key, and
  the restore correctly wrote a notice into a platform the test required to be
  empty. Deleting `outstanding` too is what makes it a real v1 file, and it
  pins the honest answer for an old artifact: it genuinely does not know how
  many invites were live, so it claims nothing.
- **`doesNotMatch(/do NOT come back/)` matched the WEBHOOK block.** Both
  notices use that phrase, so the companion test failed against correct code
  for a reason that had nothing to do with invites. Matched on
  `/unused team invite|unspent beta code/` now — wording unique to this notice.
- **The leak assertion searches the whole artifact**, not a named field.
  `invites` and `betaCodes` are absent as *keys*, so a field-by-field check
  would pass on a version that smuggled them somewhere else entirely. Same rule
  as §38's webhook assertion.
- **Dismissing must invalidate `platformCache`**, or the panel goes on showing
  the line for another 30 seconds and the button reads as having done nothing
  (§24's rule, from suspending an org).

Four mutations checked, each failing by name: marking every restore fails *"a
deployment with nothing outstanding is not told to reissue anything"*; never
marking fails *"the restore records what it could not bring back"*; counting
dead rows fails the count assertion; dropping the cache invalidation fails the
panel test.

### The restore runbook was a drill and not a procedure

Reported directly: the backup drill in `docs/BETA.md` was fine, but there were
no steps for putting a backup into a **new** or an **existing** database —
which is the thing you actually do, and the thing you do while something is on
fire.

§ *"Restoring for real"* now covers both, and the parts worth having written
down before you need them:

- **Which of the two restores you want.** `scripts/restore.mjs` is
  whole-deployment; *Settings → Import backup* is one workspace. If one
  customer deleted something, the script would take every *other* tenant back
  to the state in the file with them.
- **Into a new database, restore BEFORE pointing the deployment at it** —
  §21's first-account-becomes-`platformAdmin` bypass is a wide-open door for
  the minutes a fresh cluster sits empty, whatever `ADMIN_EMAILS` says.
  `RESTORE_OVERWRITE=1` is **not** needed there; the script refuses only when
  the target already has accounts.
- **Into an existing one it is destructive**, and the gap is
  `exportedAt` against now — for every tenant, not just the one being
  recovered. Take a fresh export of the broken state first: a damaged database
  still holds rows the backup does not.
- **Verify in the order that catches real failures.** Counts pass happily when
  rows land in the wrong workspace (§17's wsId collision: 174 of 180 records
  lost, every total plausible), so the sequence ends with signing in as a named
  account and then as a *second* tenant.

### Phase 1 of the UK launch: encrypt the artifact, and KEEP `accessRequests`

The nightly job lives in the private repo `Mohamed-AH/crmback` (§17), so the
workflow was written out and handed over rather than committed here. What
changed, and the two decisions inside it:

**Encrypted with `gpg --symmetric --cipher-algo AES256`.** The artifact is
every customer's records plus `accessRequests`, and a GitHub build artifact is
downloadable by anyone with read access to the repository. Encryption is what
makes "read access to the repo" stop meaning "read access to every customer's
CRM". Symmetric rather than asymmetric on purpose: asymmetric is stronger and
means key management, and a key managed badly is worse than a passphrase you
can actually find during an incident. Say that rather than implying the
stronger option was overlooked.

Three properties the workflow needs and would be worthless without:

- **A missing `BACKUP_PASSPHRASE` fails the job**, rather than falling back to
  plaintext. *"Encrypted unless it wasn't"* is the worst of the three states —
  you would believe the artifact was safe and nothing would ever contradict
  you. That is §17's no-op-that-reports-success in a new costume.
- **It proves the ciphertext decrypts BEFORE deleting the only readable copy.**
  An artifact that cannot be opened is not a backup, and finding that out
  during an incident is the exact failure the job exists to prevent.
- **The shape check still runs on the plaintext**, before encryption. You
  cannot check the shape of a thing you have already sealed, and catching an
  error page or a truncated body is the whole reason that step exists.

**`accessRequests` stays in, against the plan's own line.** `docs/archive/UK-LAUNCH.md`
Phase 1 says to omit it. Checked rather than executed (§21's treatment), and
the omission is the worse of the two options:

- **Approval IS the allowlist** (§20). Dropping the collection means every
  approved person has to ask again after a recovery — restoring the exact
  failure §17 records for the two collections that *were* missing.
- **Encryption already closes the exposure it was reaching for.** The concern
  was personal data about people who never became users, readable by anyone
  with repo access. Once the artifact is ciphertext, that audience is gone.

So the two changes are not independent: doing the first is what makes the
second unnecessary. Doing the second *instead* would have degraded recovery to
solve a problem the first one already solved.

**The frozen plan is left saying the opposite, on purpose.** §29's rule —
editing a plan's premises after the fact loses the reason the plan was shaped
that way. `docs/archive/README.md` carries the correction in its known-false
list instead, which is the mechanism that exists for exactly this.

**Not yet claimed on `privacy.html`.** The page says the nightly backup is
stored on GitHub and says nothing about encryption, which is currently correct
— the workflow is written but not merged. §38 records a first draft of that
same paragraph asserting backups *"are encrypted"* when they were not, caught
before the commit. The sentence goes in when the encrypted job has actually
run, not when it has been handed over.

**`docs/BETA.md` § *"Decrypting a backup"* is the operator-facing half**, and
it is written for the person doing this during an incident rather than as a
feature description:

- **The command twice** — once with `--passphrase "$BACKUP_PASSPHRASE"` for
  scripting, once prompting, because the second is the better habit on a shared
  machine and the first is what you reach for when tired.
- **A table of the four things that go wrong**, because
  `decryption failed: Bad session key` names a session key and means *you typed
  the wrong passphrase*, and a sub-1 KB `.json` is not an encryption problem at
  all — it is the export having returned an error page, which is a
  `BACKUP_TOKEN` fault two systems away.
- **Decrypting is called half the drill.** The workflow proves the round trip
  on the runner before deleting the plaintext, but *the runner proving it* and
  *you proving it* are different claims and only the second helps at 2am. Same
  distinction as §39's push-versus-pull staleness split.
- **Cleanup names the decrypted file specifically.** A `.json` left in
  Downloads is plaintext customer data on a laptop — the exact state the
  encryption exists to prevent, recreated by hand at the end of a drill that
  was meant to increase safety.
- **`MONGODB_URI=` was missing from the new-cluster step-1 command** and is
  there now. Every drill command already carries it; the migration path had one
  that did not, and that is the line where a stray `.env` reaches a real
  database.

The secrets table sits in § *"Knowing the backup ran"* rather than in
`DEPLOYMENT.md`'s environment matrix, deliberately: these are **GitHub Actions
secrets in a different repository**, not service environment variables, and
listing them beside `MONGODB_URI` would invite somebody to set
`BACKUP_PASSPHRASE` on Render where it does nothing at all.


---

## 41. Versioned terms, and the button that settled as a dismissal

Phase 2 of the UK launch (`docs/archive/UK-LAUNCH.md`). `terms.html` gained the
processor half — what we do with the records a customer puts in on *their*
customers' behalf, who else touches it, the 72-hour breach notice, what
survives a deletion — and the app now asks people to agree to it and records
**which version** they agreed to.

### A version, not a flag, and `!==` rather than `<`

§19 already stamps `betaAcceptedAt`, and a bare timestamp cannot answer the
only question that matters once the text moves: *did they agree to the terms as
they stand?* So the row carries `termsAcceptedVersion` **and**
`termsAcceptedAt` — the version is what the client compares, the date is what
makes the record evidence.

**Compared with `!==`, deliberately.** "Have they agreed to something at least
this new" would let a version that goes *backwards* — a bad publish pulled and
replaced — count everybody as already accepted. `!==` re-asks. It also means
the version never has to be orderable, which is what lets it be **a date
somebody can look up** against the published page rather than a counter nobody
can.

**`TERMS_VERSION` in `server.js` and the `Last updated` line in `terms.html`
are the same fact in two places and must move together.** That is exactly the
shape §29 warns about, and it is accepted here because the alternative — the
server parsing its own HTML at boot — is worse than the duplication. Both ends
carry a comment naming the other. Bump one alone and you either re-prompt
everybody for a document that did not change, or change the document without
telling anybody.

**Deliberately NOT an environment variable.** A seam there would let a
deployment claim acceptance of text it is not serving, and unlike
`GOOGLE_TOKEN_URL` (§30) there is nothing legitimate to point it at — the E2E
half fakes a bumped version by intercepting `/api/me`, which needs no override.

**The server stamps its own version; the POST has no body at all.** Same rule
as `req.scopeOrgId` and `workspaceIdFor()` (§5): what is stored is what the
server established. Guarded by *"the version is the SERVER's, never the
caller's"*, which posts `termsAcceptedVersion: '1999-01-01'` and requires it
not to reach the row — and by an E2E half that intercepts `/api/me` to claim
`2099-01-01` and asserts the stored version is not that either. With nothing to
read there is nothing to coerce, so §30's Phase 2 sweep gains no new call site.

### Absence is not an answer, again

Offline, `/api/me` never resolves and `termsVersion` is simply missing. Reading
that as "they have not accepted" would put a contract in front of somebody
working with the connection down and then fail to record their answer — §19's
beta-notice bug, in a new place. It asks only when the server **positively
said** which version it wants.

Guarded, and the guard is the interesting half: asserting the modal is absent
proves nothing on its own, because an account that already agreed is also
silent. So the test drops the interception and reloads, and the modal **does**
appear — which is what shows the silence came from the missing field.

### Declining has to exist, and dismissing must not

Two different things, and collapsing them was the first draft's mistake:

- **Sign out** is the decline. An "I agree" with no alternative is not
  agreement, and the stored row is supposed to be evidence that somebody
  *chose*. It destroys nothing — the workspace stays on the server and in its
  own local store — and it takes the same `pushNow` → `logout` →
  `switchScopeTo(ANON)` exit the Settings button uses.
- **Escape or a backdrop click** is "not now": nothing recorded, asked again
  next time, app not blocked. A modal that cannot be dismissed is one render
  bug away from locking somebody out of their own CRM, which §3 exists to
  prevent.

`Cloud.acceptTerms()` failing leaves the version unset, so it returns next
time. Shown twice is an annoyance; recorded-but-never-sent is a false record
(§19).

### `legal.css` had no `h3`

The processor section is the first on either legal page long enough to need a
second heading level, and `legal.css` defined `h1` and `h2` only. An `h3` falls
to the browser default — **larger than the 19px `h2` above it** — so the
subheading would have read as more important than the section containing it.
§27's invented-class trap arrived at through a plain tag rather than a class
name, which is why grepping for `.note.warn`-style mistakes would not have
found it.

### "I agree" recorded nothing, and the E2E suite is the only thing that knew

The one worth remembering, and it is a product bug rather than a test one.

```js
$('#terms-ok', modal).addEventListener('click', () => {
  closeModal();      // fires crmb:modal-closed SYNCHRONOUSLY
  resolve(true);     // …by which time the promise has already settled false
});
```

`closeModal()` dispatches `crmb:modal-closed` on `#modal-root`, and the
dismissal listener resolves the promise on it. So pressing **I agree** settled
as *dismissed*, `Cloud.acceptTerms()` was never called, and nothing was ever
written. **Sign out lost the same race**, which is worse: the button that
exists so declining is possible did nothing at all.

`askAboutRemovedFields` (§22) already had the right shape — set `answered`,
detach the listener, *then* close — and this was written without looking at it.
The fix is a single `settle()` that does those three in that order, which is
also what makes the ordering hard to reintroduce by editing one handler.

**The Node tests could not have caught it.** `POST /api/me/terms-accepted` was
covered six ways and every one passed, because they call the endpoint. The
defect was that nothing in the browser ever called it — the same shape as §30's
"the UI is not the boundary" turned around: here the endpoint was not the
product.

**And the blast radius was almost entirely elsewhere.** 13 failures on the full
run; **only 3 were terms tests**. The other ten reported
`<div class="modal-backdrop"> … intercepts pointer events` on a click many
steps later — multi-device sync journeys, four team-workspace journeys, the
admin panel, a restore test — because nothing had been recorded, so the modal
came back on the next reload and sat over a page the test was clicking on. Not
one of those failures names terms anywhere in its message. §9's blast-radius
rule, arrived at from a modal.

Checked against the broken state: restoring the close-then-resolve order fails
**3 of the 4** terms journeys, including *"declining signs out and records
nothing"* — which is the assertion that shows the decline path was broken too,
and that a test written only around the happy path would have missed.

### Agreeing now comes before the invite is redeemed

Found by the second full run, after the ordering bug was fixed: eight team
journeys still failed, all of them on a **colleague** signing in with an invite
in hand. `redeemPendingInvite()` ran first and put its own *join* prompt on
screen, so the terms modal could not appear until that was answered — and the
helper signing that colleague in was waiting for the terms modal. A deadlock,
reported as a 45s timeout on `#terms-ok`.

**Fixed in the app rather than in the helper, because the app's order was
wrong.** Joining a team swaps the local replica out and can drop unsynced work;
asking somebody to agree to the terms of the service *after* they have been
moved into somebody else's workspace has the agreement arriving too late to be
one. Terms → invite → beta notice, each awaited, so only one modal is ever up.

Signing out at the terms modal now simply leaves the invite unredeemed:
`redeemPendingInvite()` already guards on `Cloud.isAuthed` and holds the code,
toasting *"Sign in to join the team you were invited to"*. Nothing is spent and
nothing is lost.

The general rule, and it is the reusable part: **a prompt added ahead of the
terms will sit in front of them.** Anything inserted into that sequence has to
be placed against the two facts above rather than appended.

### The helper still has to wait for the record, not the click

Separate from the bug above, and still load-bearing. `signIn()` — which 64
tests go through — has to walk past this modal, and the naive version waited
for `#terms-ok`, clicked, and returned. The modal closes the instant the button
is pressed; `Cloud.acceptTerms()` resolves after that. Returning in between
leaves the POST in flight, so a `page.reload()` can still fetch an `/api/me`
that says nothing was accepted.

So it waits on the state the app itself decides on — `Cloud.me.termsVersion`
against `Cloud.user.termsAcceptedVersion`, the client mirror being set only
once the request resolves. That also removed the guess about whether a modal
was coming at all: **no fixed timeout anywhere in it**, because "no modal
appeared in six seconds" is exactly the assertion a slow machine turns into a
lie (§32).

**And `Cloud` is a bare global, not `window.Cloud`** — §39 records this for
`DB` and it cost a first draft here too. A top-level `const` in a classic
script is lexical, so the property form is `undefined` for ever and a
`waitForFunction` on it times out naming the wrong thing.

### `privacy.html` can now say the backup is encrypted

§40 deferred that sentence: *"it goes in when the encrypted job has actually
run, not when it has been handed over."* It has — the artifact was downloaded,
decrypted and restored end to end — so the page now says the nightly backup is
encrypted before it is stored, with the passphrase held separately, **and says
what that buys**: being able to download the file is not the same as being able
to read it. Scoped to *read* access on purpose, which is the claim that is
actually true (§40).

Its `Last updated` line moved with it. That page is not versioned by
`TERMS_VERSION` and deliberately does not prompt — a privacy notice is
information, not a contract to accept, and §36's rule about not nagging applies.

### Which user-facing docs this touched, and which it did not

§27's rule is that a change to *what a user can do* gets walked through six
documents. Walked, and only one of them needed anything: **`docs/BETA.md`'s
tester note**, which now says the prompt exists, names the section worth
reading, and says a *Sign out* sits beside the *I agree* and deletes nothing.

`USER-GUIDE.md` and `manual.html` do not narrate the sign-in flow step by step
— they say "signing in adds sync" and move on — so a new step in it makes
neither stale. Padding them to look thorough is its own inaccuracy (§40, on the
privacy roster). Recorded so the omission reads as checked rather than missed.

**No `CACHE_VERSION` bump for the legal pages** — both are in `sw.js`'s
`STANDALONE_PAGES` and go straight to the network, never precached (§19),
checked rather than assumed. The bump to `crmbuilder-v40` is for `js/app.js`
and `js/cloud.js`, which are in `APP_SHELL`.


---

## 42. The consent template, and a date import that lost a day east of Greenwich

Phase 3 of the UK launch (`docs/archive/UK-LAUNCH.md`), which the plan sized at
*hours* and described as "a module template seeding lawful basis, consent date
and source… check `fmtDate` and move on." The template is that. The rest of
this section is what checking found.

### Why it is a module and not three fields on Contacts

The obvious shape is `lawfulBasis` / `consentDate` / `source` on the Contacts
template, and it is wrong three ways:

- **It changes the default for everybody.** Contacts is what almost every
  workspace picks first, so three pieces of UK/EU jargon would land in front of
  a sole trader in Ohio who will never need them.
- **It reaches nobody who already exists.** Fields belong to a module, not to a
  template, and only an owner may edit them (§14) — so every current workspace
  would be untouched while every new one changed. The worst of both.
- **It breaks the demo.** `tests/demo.test.mjs` asserts every field of a seeded
  module is filled — "an empty column in the demo" (§34) — so three new
  Contacts fields would mean regenerating `js/demo-data.js` to invent consent
  records for forty fictional people.

A seventh template opts in, costs nothing to anyone who does not pick it, and
is skipped by the demo loader for free: `loadDemoData` and
`scripts/seed-fixture.mjs` both `continue` on a template with no rows.

**No relation field, and that is a constraint rather than a preference.**
`createFromTemplate` copies fields verbatim and does **not** bind
`relatedModuleName` to a runtime `relatedModule` id — only the demo loader does
that, in its own pass. A relation in a template would therefore create a picker
pointing at nothing: an empty dropdown that reads as "not configured yet"
rather than as broken (§36 again). The person is named in text, exactly as
`Deals.contact` already does.

**Option text is record data, so the options are short.** The six statutory
names, not glossed sentences — every row stores the string, carries it into
every CSV and JSON export, and renders it in a table cell.
"Contract — needed to do business with them" is 42 bytes per row and an
unreadable column. The plain-English table lives in `docs/USER-GUIDE.md` and
`docs/manual.html`, where there is room and where nobody pays for it per record.

### Two lists that had gone stale the moment a seventh template existed

Both are §29's thesis — a list written in a second place is a list that goes
stale — and both are derived now:

- **`TEMPLATE_KEYS` in `tests/demo.test.mjs`** was six keys typed by hand. Left
  alone it would have walked six templates and said nothing at all about the
  new one, which is the quiet half of the failure.
- **`.template-card` count in `tests/e2e.spec.js`** was a literal `6`. §34
  explicitly kept it as a literal on the grounds that it "really is about
  TEMPLATES rather than the demo" — true, and it still went stale the first
  time TEMPLATES grew. It reads `templates.js` now, like `DEMO` beside it.

**The exception the demo makes is NAMED, not inferred.** `consent` seeds no
demo records, so "every module has records" needed an escape — and deriving
that escape from `DEMO.records` would make the assertion vacuous, passing just
as happily on a dataset that had quietly lost Contacts. `DEMO_SKIPS` is a
one-key set with the reason attached, and it is itself asserted: a key that is
not a template, or one the demo actually fills, fails.

Why the demo does not carry it: a consent register covering six of the demo's
forty contacts reads as compliance half-done, which is worse than absent, and
covering all forty doubles a third of the dataset to show a module most
workspaces will not pick.

### A test for a hazard nobody had covered: template samples

`createFromTemplate` seeds a template's `samples` into a real workspace whenever
somebody leaves "Include a few sample records" ticked. Those rows carry exactly
the ghost-data and impossible-option hazards `demo.test.mjs` already checks for
the demo — **on rows that reach a new user's first screen** rather than a demo
they asked for — and nothing tested them.

The five existing templates were clean when checked, so this is a guard rather
than a fix. It also covers a placeholder: `{ __rel: n }` and `{ __ref: … }` are
resolved by `loadDemoData` and by nothing else, so one written into a template
sample out of habit is stored as a raw object and renders `[object Object]`.

The "never filled" direction is deliberately **not** asserted for samples. A
sample is illustrative, not exhaustive — Contacts leaves `notes` empty on
purpose, and requiring every field would push filler into the first rows a new
user sees.

### The plan's second half: checked, and one claim held

*"GBP is already in `CURRENCIES`. Dates store `YYYY-MM-DD` and
`<input type="date">` renders in the browser's locale… check `fmtDate` and move
on."* Measured rather than accepted:

| Claim | Verdict |
|---|---|
| GBP available and renders as `£` | true — `£2,400`, and in `en-US` too |
| `fmtDate` is locale-aware | true — `12 Sept 2026` in `en-GB`, `Sep 12, 2026` in `en-US` |
| The stored day never shifts on display | true — `new Date("2026-09-12T00:00:00")` is local midnight, so only the calendar parts are formatted |
| Date fields are native `<input type="date">` | true — `js/app.js` line 2275 |

### The bug the plan did not anticipate, and it is a UK one

**The CSV importer stored the wrong day for every non-ISO date, everywhere east
of Greenwich.**

```js
const d = new Date(v);            // "12 September 2026" → LOCAL midnight
return d.toISOString().slice(0, 10);   // …converted to UTC → "2026-09-11"
```

Measured across four zones: `Europe/London` and `Europe/Berlin` shift,
`America/New_York` and `UTC` do not. That is §37's signature exactly — correct
for whoever wrote it, wrong for the half of the world this launch is aimed at —
and §37's own sweep missed this call site because it swept *comparisons* and
this is a **write**.

Silent, too: the cell shows a plausible date one day out, on the bulk path where
nobody re-reads every row.

Fixed by reading the calendar day back with local getters. Guarded by an E2E
test in its **own `test.describe` with `timezoneId: 'Europe/London'`** — the
container and CI both run UTC, so the test would pass on the broken code
without it, and that is the entire reason the zone is pinned rather than
assumed. Scoped to one describe because setting it suite-wide would move every
date assertion in the file (§9). The date is in **September**, deliberately:
BST is what makes local midnight cross the UTC boundary, and a January date
passes on the bug. Checked against the broken state: `2026-09-11` against
`2026-09-12`, named in the diff.

### What was NOT fixed, and why it is a decision rather than an oversight

**`03/04/2026` imports as 4 March, not 3 April.** `new Date` reads slashed
numeric dates American-style whatever the browser's locale, and `13/04/2026`
is not read at all — there is no 13th month, so that cell arrives **empty**.
So a UK spreadsheet imports with some rows silently wrong and some silently
blank.

Not fixed here, because the fix is not a bug fix — it is a **choice**, and
choosing wrong breaks the users who work today. Preferring DD/MM would silently
re-date every US import; inferring per column from "is any first component
above 12" guesses on the ambiguous rows, which is the same class of silent
wrongness in the other direction. The honest answer is a format control on the
mapping screen, which is real UI with real tests and is not the "hours" this
phase was sized at.

Stated instead, in both user docs, with the ten-second workaround: format the
column as `YYYY-MM-DD` before exporting, which the importer takes exactly as
written. Every example in those paragraphs was **run** before it was written.

> **Now built — see §45.** The analysis above is what shaped it and stands:
> the order became an *input* rather than a better guess. The workaround
> paragraphs it describes are gone from the user docs, replaced by the
> control.

### And one more default that is wrong for this launch, reported not changed

`DEFAULT_SETTINGS.currency` is `'USD'`, so a UK business sees USD preselected
at onboarding and must notice. Getting it wrong is not free later: §23 records
that changing currency **relabels** rather than converts, for the whole team,
behind a confirmation.

Not changed, because there is no API that maps a locale to a currency — only a
hand-written table, which is the second source §29 exists to warn about — and
because the better signal (the device time zone, which the digest picker
already reads) needs a second table of its own. It is one dropdown on a screen
the user is already reading, so the cost is small and the fix is a real design
decision rather than a line.

### Blast radius

`js/templates.js` is in `APP_SHELL`, so `CACHE_VERSION` → `crmbuilder-v41`.
No server change: `ASSET_DIRS` already allow-lists `js/` and the smoke test
already names `/js/templates.js`, so the count stays 43.

### One failure in one run, and what is known about it

*"unsynced work from a previous workspace never lands in the new team"* failed
once, on the first full run, timing out after 25s waiting for the joiner's
`/api/me` to report the new org. Recorded rather than dismissed, because §32
and §35 are both about not writing "flaky" over a defect — but also not
inflated, because the evidence says what it says:

- **5 of 5 in isolation**, 7.4–8.4s each, and **98 of 98 on the next full run**
  at 4.9m. The suite is not getting slower (5.0 → 5.2 → 4.9), so §32's
  accumulating-resource signature is absent, and `data/e2e` was checked at 8 KB.
- **Nothing this phase changed sits between the click and the join.** §41 moved
  `showTermsIfNeeded()` ahead of `redeemPendingInvite()`, but both are after the
  sync, the terms check returns immediately for an account that already agreed,
  and `[data-join]` had appeared — so the redeem path ran.
- **The race is the test's subject, not a fault in it.** It clicks *Join* and
  then un-blocks `/api/sync`, because that is precisely the window in which a
  flush aimed at the old workspace would go out. `redeemPendingInvite` pushes
  before joining (§13) and the push is `.catch()`-ed, so it cannot stop the
  join — but under load the whole sequence can run long.

**The 25s budget is the only lever, and widening it is the wrong move**: it is
what makes "the join did not happen" distinguishable from "the join was slow",
which is the assertion. Left alone. If this recurs, start from the joiner's
console rather than from the timeout — `Could not join that team` in it would
mean `reconcileWorkspace` threw after a server-side join that did succeed, and
that is a different bug from the one the timeout suggests.


---

## 43. Subject access requests, and closing your own account

Phase 4 of the UK launch (`docs/archive/UK-LAUNCH.md`), in the two stages the
plan sized it at. Both are controller-side tools: a tenant answering a request
about *their* customer, and a tenant leaving. Neither makes the obligation ours.

### Stage 1 — the search, and why it is a search

**This data model has no concept of a data subject**, which the plan named and
which is the whole shape of the feature. A person is a record in Contacts, but
their name may equally sit in a Notes body, in a relation on a Deal, or in a
field somebody invented last year. So the answer to "what do you hold about me"
is a **text search across every stored value**, and the output is a list of
places to go and look rather than an automatic extract.

Client-only, no endpoint, nothing the server can refuse — §37's due-filter
shape. `js/dsar.js` is pure and carries the matching rules; `tests/dsar.test.mjs`
requires it through §39's seam, so what is unit-tested is what the browser runs.

**Four decisions inside the matching, and each is a way the search could have
answered wrongly:**

- **Relations are matched on the resolved NAME, never the stored id.** A person
  appears on a Deal without their name being anywhere in that Deal's values —
  the field holds a uuid. Searching raw values finds nothing, and "we hold
  nothing about you" is the one answer a subject access request must never get
  wrong. `relationNameMap()` builds names for **every** record in the
  workspace, rather than reusing `primeRelationCache`, which fills lazily per
  module for rendering: a module it never primed is a person the answer
  silently does not mention.
- **It walks `record.data`, not `mod.fields`.** §22: removing a field leaves
  its values in place unless the user chose to purge them, and they travel in
  every export. Walking the schema would miss data the workspace genuinely
  holds. A key with no field is reported as `orphan` and shown as *removed
  field* — the single most useful thing this search can tell a controller,
  because it is data they had stopped being able to see.
- **Accent- and case-folded on both sides.** "Jose" has to find "José". Cheap,
  and without it the tool is confidently wrong about exactly the names a UK/EU
  customer base contains.
- **Sample rows are included and flagged, never filtered.** Editing a seeded row
  keeps `_demo` (§11), so a row can be fictional in origin and hold something
  real typed over it. Hiding them makes the bundle quietly incomplete; naming
  them lets the reviewer discard them at a glance.

**Two characters minimum**, not one and not three: one matches most of a
workspace and buries the answer, three refuses "Li" and "Ng".

**Available to every role, deliberately** — the same reasoning §36 records for
Export: it reads and writes nothing, and it returns strictly *less* than the
export button directly above it already hands anybody. Gating the subset while
allowing the whole would be theatre.

**Results are shown before anything is downloadable, and that is the design.**
A substring search over-matches — "Ali" finds "Alison" — and a record naming two
people holds data about both. Sending that on is itself a disclosure, so the
review happens on screen and the download button sits underneath it.

**The limits travel inside the file.** The bundle is read by somebody who did
not run the search and never saw the warning: a colleague, a solicitor, the
subject. So `limits` is part of the JSON — different spellings, numbers in a
Number field, a colleague's device that has never synced, and the instruction to
review. A file that reads as a complete answer to a question it only partly
answers is the failure mode here.

**It syncs first, and says when it could not.** This device holds a replica;
answering a legal question from yesterday's copy is §39's stale-preview problem
with a much larger bill. When the pull fails the result says which rows it was
able to look at rather than quietly meaning less.

**Painted into `#dsar-results`, never re-rendered** — a full `renderSettings()`
would wipe the query the reviewer just typed. §38's Telegram rule, second
occurrence.

### Stage 2 — closing your own account

The route §21 said would come, and **the first caller for which
`wouldStrandDeployment()` is actually reachable**: it lives inside
`deleteAccount()` rather than at the admin call site precisely so this one
inherits it, and the admin route refuses any action on your own account.

**Two routes, and the split is the point.** `GET /api/me/deletion` says what
would go and whether it is refused; `DELETE /api/me` does it. A rule named at
the last step is a rule somebody meets holding a confirmation they have already
agreed to, so `blocked` is reported *in advance* — computed by the same
`wouldStrandTeam()` / `wouldStrandDeployment()` the DELETE consults, so it is
the real answer rather than a copy of the rule.

**No id in the path, ever.** §5: identity is what the server established.
`DELETE /api/me/:id` is not a route, which is stronger than a route with a
check somebody could later get wrong on the most destructive endpoint here.

**The strand check sits on the ROUTE, not inside `deleteAccount()`**, and that
asymmetry is deliberate: `deleteAccount()` is also the admin path, where an
operator cleaning up is entitled to strand a team. Same act, different
authority.

**Counted live, not read off the meta doc.** `refreshCounts()` maintains
`recordCount` on a push, so a workspace nobody has written to since a
colleague's device synced carries a stale one — and a delete confirmation is
the last place for a figure that is merely usually right.

**The client pushes before asking what is there**, and this was found by the
E2E rather than reasoned: `persist()` only schedules a *debounced* push (§39),
so the confirmation said **"0 records"** to somebody looking at a row they had
just typed. Uploading rows that are about to be destroyed looks odd for one
line and is right both ways — the number becomes complete, and a cancel leaves
the work safely on the server.

**Deleting wipes the local replica; signing out does not.** §11 states it as a
guarantee — "signing out hides a workspace, it never destroys one" — so the
delete path has to do something the sign-out path deliberately does not, or
closing your account leaves the workspace in IndexedDB for the next person to
use that browser. `DB.wipeScope(scope)` + `Scope.clearKeys(scope)`, with the
scope read **before** `switchScopeTo(ANON)` moves it.

**`Scope.current` is a getter, not a method.** Calling it throws, and the throw
would land after the account is already gone on the server.

### The test that passed on the bug, and how it was caught

The first version of the E2E asserted the replica was gone by signing back in
with the same address and checking `DB.getAll('records')` was empty. **It passed
against a build with the wipe removed entirely**, because a new account gets a
new id and therefore a new scope — so the stale database was never in view. The
assertion was measuring the wrong store.

It reads `Scope.dbName(Scope.current)` *before* the deletion and then asserts
`indexedDB.databases()` no longer lists it. That fails on the mutation, naming
the leftover workspace. §9's rule caught it: a test checked against the broken
state, and this one had to be rewritten rather than merely re-run.

### Two things found in the shared helpers

- **`onboard()` matched a template card by `:has-text`**, so asking for
  "Deals" resolved to two cards — Leads' description says "before they become
  deals" — and threw a strict-mode violation. Latent since the helper was
  written; it surfaced the first time a test asked for the one colliding name.
  Matched on `.template-name:text-is()` now.
- **Deals opens as a board**, so a `tr:` assertion on a new Deal times out
  saying only that it found nothing. `.kanban-card` is the row there.

### Blast radius

`js/dsar.js` is a new served file, so all four places had to agree (§3):
`index.html`, `sw.js` APP_SHELL, the smoke test's `ASSETS`, and
`CACHE_VERSION` → `crmbuilder-v42`. `ASSET_DIRS` already allow-lists `js/`, so
no server change — and the smoke count going 43 → 44 is what proves it.

`docs/API.md` carries the two new routes and its route count is **52**, checked
against `grep -cE "^app\.(get|post|put|patch|delete)\(" server.js` rather than
incremented by hand — §29 records that number going stale twice already.

`privacy.html` said *"if you want your account removed and cannot do it
yourself, contact us"*, which is now false in the ordinary case; `terms.html`'s
DSAR-assistance clause said the export was usually enough, which undersold what
is now on the screen. Both updated, and `USER-GUIDE.md` and `manual.html` carry
the whole of both features including what the search cannot find.


---

## 44. The retention review, and the delete button that is missing on purpose

Phase 5 of the UK launch (`docs/archive/UK-LAUNCH.md`), and the last of them.
A controller has to be able to answer *"how long do you keep this?"*, and the
honest state before this was that the app kept everything for ever and gave
nobody a way to see what that meant. Settings → **Data you have stopped using**
lists the records nothing has touched in a window the owner picks — 12 months,
2 years (the default), 3 years, 5 years — grouped by module, oldest first.

Client-only, no endpoint, nothing the server can refuse. Same shape as §37's
due filter and §43's search, and the same reason: it reads rows the device
already holds, so there is no new surface and no new thing to permission.

### It reports and never deletes, and that is the feature

Automated retention deletion is the most dangerous thing that was on the plan.
**A quiet record is not an unwanted one**: a closed matter may be one somebody
is legally required to hold for six years, and nothing in this data model can
tell that from an abandoned lead. A schedule that acted on the list would
destroy the second kind along with the first, and §26 records that a delete
takes the body with it — there is nothing to fish back out.

So the screen says *"a list to review, not a bin"*, and there is no control
that acts on it. The E2E pins that structurally rather than by wording:

```js
await expect(page.locator('#stale-results button')).toHaveCount(1);
await expect(page.locator('#stale-download')).toBeVisible();
```

One button, and it is the download. A "delete these" added later fails that
line by name, which is the point — it is a decision, and it should have to be
taken again rather than slipped in.

### `setMonth(m - n)` overflows rather than clamping, silently

`DateRules.monthsAgo` is the one function in that file that returns an instant
rather than a day coordinate, because it ages `updatedAt`, which is a
millisecond stamp.

The naive version is wrong twice a year and wrong in the direction that hides
it: JavaScript rolls a date over rather than clamping, so **31 August with
`setMonth(-6)` asks for 31 February and lands on 2 or 3 March** — "six months
ago" jumping *forward* past the month it was aiming at. Same for 29 February
minus 24 months. Nothing throws; the cutoff is just quietly a few days out, and
a few days at the edge of a two-year window is a handful of records that appear
or do not.

Parked at the 1st before the month moves, then clamped to the last day that
month actually has. Guarded by four tests in `tests/dateRules.test.mjs`, and
**three of the four fail on the naive version** — checked, per §9.

Local getters and setters throughout, deliberately: the time of day survives
the shift, so a DST boundary moves the instant by an hour rather than moving
the calendar day. For a 24-month window an hour is immaterial and a day is not.

### `updatedAt`, not `createdAt`, and rows with no clock are counted separately

"Stopped using" is about the last time somebody touched it, so it keys on
`updatedAt`. A row whose clock is missing or zero cannot be aged at all —
usually something restored from a hand-edited file — and it is **counted and
named rather than silently dropped or silently included**. Either of those
would make the total a number nobody can reconcile against the record count
they are looking at, which is §33's adjacent-and-wrong figure in a new place.

Orphaned rows (a `moduleId` no module answers to) are skipped: there is nothing
to name them by, and §12's rule is that a migration never deletes an orphan, so
they legitimately exist.

### What travels in the file

100 rows on screen, all of them in the JSON — a two-year window over a real
workspace is plausibly hundreds, and a list that long stops being reviewable
while the file stays useful.

The caveats are **inside the download**, exactly as §43's bundle does it,
because whoever opens it next did not run it and never saw the screen: that it
is a report and nothing was changed, that old is not the same as unwanted, that
importing or restoring a record resets its last-changed date, and that rows
which have never reached this device — a colleague who is offline — are not
included. A file that reads as a complete answer to a question it only partly
answers is the failure mode here.

It syncs first and says when it could not, same as the DSAR search.

### `ONBOARDING.md` contradicted its own rollout section

Found while walking §27's six documents, and it is §27's own drift in the file
§27 audited. *"Rolling out to a team"* had been corrected in that pass and
reads properly — one shared workspace, four roles, per-record and per-field
merge. Forty lines below it, under *"Common objections"*:

> **"Can several of us use it at once?"**
> Each person gets their own account and workspace. A single shared workspace
> edited simultaneously by several people isn't what the sync model is built
> for.

Two answers to one question, in one file, forty lines apart, and the wrong one
is the one a person reads when a client asks. §27's lesson was that the
easy-to-forget documents are the HTML ones nothing greps; this adds that **a
document can be half-updated and read as done**, because the section somebody
went looking for was correct.

### Which documents this walked, and what each needed

| | Needed |
|---|---|
| `USER-GUIDE.md`, `docs/manual.html` | a *Finding data you have stopped using* section |
| `docs/ONBOARDING.md` | the objection above, and a "does this help with GDPR" answer |
| `docs/DEMO-SCRIPT.md` | the same question, in the list of ones to expect |
| `docs/product-tour.html` | a tile and a `<details>`, both naming the limit |
| `docs/BETA.md` tester note | the three tools, and §42's CSV date trap |
| `terms.html` | retention is the controller's decision, and we set no period |
| `privacy.html` | nothing — it describes **our** retention as processor |
| `docs/API.md` | nothing — no route was added |

**The privacy/terms split is the one worth keeping.** *"We keep your workspace
for as long as your account exists"* is a statement about what the processor
does and is still true. How long a tenant keeps *their* customers' records is a
controller duty, so it belongs in `terms.html` — and it is written as a tool
offered, never as a period we set, because setting one would be us making the
tenant's decision for them.

All four public-facing answers say the same two sentences: here is what the
tool does, and it does not make you compliant. Claiming otherwise is the
fastest way to be quoted back at.

### Blast radius

`js/date-rules.js` and `js/app.js` are both in `APP_SHELL`, so `CACHE_VERSION`
→ `crmbuilder-v43`. No new served file, so the smoke count stays **44 locally** — and
running it is what proves that, per §9.

`server.js` requires `js/date-rules.js` (§39), so a change there has a second
consumer that no browser test would catch. `monthsAgo` is additive and the
server does not call it; the shared-surface test in `tests/dateRules.test.mjs`
covers the export list either way.

### Still open, and carried forward deliberately

**The CSV date-format control** (§42) — the one piece of the UK launch that was
open work rather than a closed decision. **Built in §45**, which is the section
to read; this paragraph is left as the pointer.


---

## 45. The CSV date format, and a question that has no correct default

§42 found this, costed it, and deliberately left it: `03/04/2026` imported as
4 March for everybody, and `13/04/2026` imported as **nothing** — `new Date`
reads slashed numerics month-first whatever the browser's locale, and there is
no thirteenth month, so a UK spreadsheet arrived with some rows silently wrong
and some silently blank. Two failure modes, both invisible, on the bulk path
where nobody re-reads every row.

### The fix is not a better guess, and that is the whole section

Every guess is wrong for somebody:

| | Breaks |
|---|---|
| keep month-first | every non-US import, which is the launch |
| prefer day-first | every US import, by the same mechanism reversed |
| infer per file | files where nothing happens to exceed 12 — a coin flip presented as an answer |
| browser locale | a UK laptop opening a sheet a US colleague exported |

So **the order is an input**. `js/date-rules.js` gains `parseImportedDay(value,
order)` and `scanDayOrder(values)`, and the import screen asks.

### What the data can prove, separated from what it cannot

`scanDayOrder` returns evidence, never a decision:

- `31/12/2026` **can only be day-first**, and the sample comes back with the
  verdict. The screen quotes it — *"`31/12/2026` in this file can only be
  day-first, so that is preselected"* — because a bare "day-first" is
  something the reader has to take on trust, and a quoted value is something
  they can check against their own spreadsheet.
- `03/04/2026` proves nothing and is counted as **ambiguous**.
- `2026-09-12` and `12 September 2026` name their own month, so they are
  `plain` and ask nothing at all. A control over a sheet of ISO dates is a
  question with one answer, which is noise (§36's rule 1) — so it is absent.
- `32/40/2026` is `unreadable`: no order fixes it, so asking would not help.
  Reporting it as ambiguous would request an answer that changes nothing.

Then the screen, and the three states are the substance:

| The file | The control |
|---|---|
| evidence for one order | preselected, with the value that proves it named |
| evidence for **both** | nothing preselected, and it says some rows were written the other way whichever is picked |
| only ambiguous values | nothing preselected, and **the import is blocked until answered** |

**A required-but-unanswered question disables the import button, and that is
the feature rather than friction.** A default here *is* the bug — it is exactly
what the old code did. The cost is one click, and only on a file that genuinely
cannot be read: in practice any sheet with a couple of dozen dates has a day
over 12 somewhere, so evidence exists and nothing is asked.

Guarded by `#csv-import-go` being `toBeDisabled`, which fails the moment a
fallback order is reintroduced.

### The preview answers in the file's own values

*"`03/04/2026` will be imported as 3 April 2026"*, plus — the half that
matters — *"4 values cannot be read as month-first and will be imported
empty"*. That second line is the old defect named **before** the import rather
than discovered in the table afterwards, and the import's toast repeats the
count for anything that still landed empty.

### Traps and decisions inside it

- **It scans every row, not a sample.** The one value that settles the question
  can sit anywhere in the file, and a cap would leave the control asking
  something the data had already answered. It is a regex over strings already
  in memory.
- **It re-runs when the mapping changes**, because which columns are dates is
  something the person on this screen is still choosing.
- **An explicit answer outranks a preselection** (`userChose`). Without that
  flag the harmless `'ymd'` from the no-decision branch leaks into an ambiguous
  file on a re-paint and sits there looking like an answer nobody gave — the
  exact defect, rebuilt by accident. It is cleared rather than carried.
- **A four-digit leading component is year-first whatever was chosen**, so the
  control cannot corrupt an ISO column that happens to share the import.
- **A month NAME bypasses the order entirely** and goes through `new Date` with
  **local getters** — never `toISOString`, which is §42's own bug and the
  reason this whole file exists.
- **Two-digit years follow POSIX**: 69–99 are 1900s, 00–68 are 2000s. Written
  down because a birthday column is where somebody meets it, and 1969 against
  2069 is not a rounding error.
- **A day that does not exist is refused, never rolled over.** `31/02/2026`
  through `Date.UTC` becomes 2 or 3 March — a plausible value in the cell,
  which is this file's recurring failure shape. `parseDay` already round-trips,
  so the new parser reuses it rather than repeating the check.
- **`dayOrders()` is a function, not an exported array.**
  `tests/dateRules.test.mjs` requires every key on `DateRules` to be callable —
  that is what makes a stale or partial `require()` fail rather than pass a
  shape check (§39) — so a bare array would have broken a real invariant to
  save a pair of brackets.

### Where the parsing lives, and why not a new file

In `js/date-rules.js`, which is already the one place calendar-day arithmetic
happens without a date library, is already unit-tested through both the
`new Function` harness and `require()`, and is already the file whose header
explains the UTC trap this is another face of. A new `js/csv-dates.js` would
have cost §3's four-places dance and a smoke-count bump to separate two
functions from the ones they lean on.

**`server.js` requires this file** (§39), so it has a consumer no browser test
covers. Both additions are pure and the server calls neither; the shared-surface
test covers the export list either way.

### Checked against the broken state, four ways

Per §9, and each fails by name:

| Mutation | Fails |
|---|---|
| parser ignores the order (`new Date` for everything) | 5 of the `parseImportedDay` tests |
| scan "helpfully" guesses month-first on ambiguous values | 3 scan tests, including *"a file that proves nothing returns NO suggestion"* |
| coercion hard-codes `'mdy'` | the UK journey, on the stored values |
| the import button is never disabled | *"a file that proves nothing makes you choose"* |

The E2E journeys run in **`Europe/London`**, in §42's existing describe: the
container and CI are UTC, so a date test that does not pin a zone passes on
several of these bugs.

The UK journey is the one to keep. On the old code its file stored **4 March**
for the first row and left the other two **blank** — 31/12 and 13/04 are both
Invalid Date read month-first. Two rows wrong, one right, nothing said.

### The demo file now contains the question

`docs/demo-data/demo-deals.csv` had no slashed dates, so the strongest thirty
seconds of the import demo could not happen. It now carries `03/04/2026` and a
`31/12/2026`, which is the good version of the story rather than the awkward
one: the screen works the answer out, says what it read it from, and shows what
it will do. Anyone who has migrated a CRM and found half their dates three
months out recognises it immediately. `DEMO-SCRIPT.md` carries the words.

### Docs walked (§27)

| | Needed |
|---|---|
| `USER-GUIDE.md`, `docs/manual.html` | the workaround paragraphs **replaced** — they described a limitation that no longer exists |
| `docs/BETA.md` tester note | the rough-edge bullet §44 added, removed |
| `docs/ONBOARDING.md` | a step, and *spot-check dates first — a wrong one still looks like a date* |
| `docs/DEMO-SCRIPT.md` | the messy-CSV table, and the thirty seconds above |
| `docs/product-tour.html` | the import aside, which claimed "dates in whatever format the file happens to use" |
| `docs/API.md` | nothing — no route, no wire change |

**A stale workaround is worse than a stale feature description.** "Format the
column as `YYYY-MM-DD` first" was good advice for a real limitation, and left
in place it would have had people doing pointless work while distrusting a
control that now handles it. Removed rather than softened.

### Blast radius

`js/app.js`, `js/date-rules.js` and `css/style.css` are all in `APP_SHELL`, so
`CACHE_VERSION` → `crmbuilder-v44`. No new served file, so the smoke count
stays **44 locally**. `.csv-format`, `.csv-format-row` and `.btn:disabled` are defined
in `css/style.css` — §27's invented-class trap, and `.btn:disabled` in
particular, without which a blocked import button looks pressable and reads as
a bug rather than as a question.

`.mode-switch .btn[disabled]` (specificity 0,3,0) still beats the new
`.btn:disabled` (0,2,0), so the admin mode switch is unaffected — checked,
because §4's cascade trap has now cost time twice in this file.


---

## 46. The live smoke tested the wrong build, and said the deployment was broken

Reported from CI: `✗ GET /js/dsar.js — HTTP 404`, *"Deployment is NOT healthy"*,
**and it cleared on a re-run.**

Nothing was wrong with the deployment, and nothing was wrong with the check.
The `live` job smoke-tests the **running** deployment using the **asset list
from the commit that was just pushed** — and Render has not finished deploying
that commit yet. `js/dsar.js` was added in §43; for the few minutes between the
push and the deploy landing, the live URL is an older build that genuinely does
not have that file. The audit is correct, and it is auditing the wrong thing.

### Which of the two candidates it was, established rather than assumed

A 404 on a served asset has two causes here and they want opposite fixes:

| | Check |
|---|---|
| the file is missing from the server's allow-list (§28) | `ASSET_DIRS` is `['css', 'js', 'fonts', 'icons']` — a **whole directory**, so nothing under `js/` can 404 for allow-list reasons |
| the running build does not have the file | everything else — and the file is in the repo, and a re-run passes |

So it is the second, and §28's content-based assertion is doing its job. Worth
writing down because "a served file 404s in production" is precisely the
failure §28 exists to catch, and reaching for that explanation first would have
produced a fix for a bug that is not there.

### The general shape, which §40 already named

> **A mechanism that hangs off a URL configured somewhere else has a failure
> mode no test in this repository can see.**

§40 wrote that about the keep-warm ping being on `/healthz` instead of
`/health`. This is the same sentence from the other side: the repository could
not see *which build* the URL was serving, so it could not tell "this file is
missing" from "this file is not deployed yet". **Nothing exposed the running
commit** — `/health` reports storage, sync model, deployment shape and uptime,
and not the one fact that would have made the failure self-explanatory.

### Two runs asking different questions, which is why one skip is safe

The job fires on push, on the daily schedule and on manual dispatch, and those
are not the same question:

| | Wants |
|---|---|
| **push** | "does the commit I just pushed work in production" — which cannot be answered until it *is* in production |
| **schedule / dispatch** | "is production healthy right now" — nothing is in flight, so a stale deployment failing the current asset list is a **real finding**: a deploy that never landed |

So a push run waits for the deployment to report the pushed commit and then
smokes it; if it never does, it **skips loudly and passes**, because asserting
this commit's expectations against an older build is what produced the false
red. A scheduled run does neither — no wait, no skip, and it fails.

**The skip is the dangerous half and it is bounded on purpose.** A skip that
can happen every day is §17's no-op-that-reports-success, which this file is
emphatic about: the backstop is that the daily run cannot skip, so a deploy
that never lands is red within 24 hours rather than never.

### The commit marker, and why absence is not a placeholder

`/healthz` now carries `commit`, from `APP_COMMIT` or Render's own
`RENDER_GIT_COMMIT`.

- **On `/healthz`, not `/health`.** A wait loop polls this every twenty
  seconds, and `/health` runs the alert rules and the reminder pass off the
  back of every request (§25, §39) — a CI poll there would fire real digests
  into customers' channels. `/healthz` answers and does nothing else, which is
  exactly the property §40 refused to spend by hanging work off it.
- **The field is OMITTED when neither variable is set** — not `null`, not
  `'unknown'`, not `''`. The wait branches three ways: this deployment is
  current, this deployment is behind, this deployment does not say. A
  placeholder collapses the last two into "behind", so the wait would burn its
  whole budget and skip the smoke on every host that does not set the
  variable — a silent, permanent skip, arrived at by trying to be tidy. Same
  asymmetry as §30's `verified_email`: a stated mismatch is actionable,
  absence is not. Guarded by *"/healthz omits the commit when nothing sets
  one"*, which fails on a version emitting `'unknown'`.
- The repository is public, so the commit discloses nothing that is not
  already on GitHub. On a private deployment that would be a judgement call
  rather than a free one.

### The smoke test says which build it looked at

A `deployed build` line in the Configuration section, **INFO and never a
failure** — a deployment that does not report a commit is not a broken one,
and most ways of running this have no commit to report. It earns its place
because every asset assertion above it is written against the checkout the
file came from, so when one 404s the first question is whether the deployment
is even running that commit, and until now there was no way to ask.

**The smoke count does not move**, and that is not an oversight: the summary
counts `PASS`, and this line is `INFO` in both environments. Recorded because
"I added a check and the number did not move" reads as a mistake later, and §9
treats that number as the proof the file ran.

**And the count is two numbers, not one — 44 local, 49 live.** Reported from a
real run against production and worth pinning here, because §2 states "44
smoke checks" flatly and somebody comparing that against a live run showing 49
has §33's problem exactly: two figures, both right, adjacent, unlabelled. The
same checks run either way; five of them are *informational* on a local
file-store HTTP deployment and real assertions against a live one —
`storage backend`, `sign-in method`, `dev login is off in production`,
`HSTS in production`, and `HTTPS`, which does not appear locally at all.
Measured by diffing the two runs, not derived.

### Verified

Each branch of the wait was driven against a real server, with the loop
**extracted verbatim from the YAML** rather than retyped — a copy that drifts
from the workflow proves nothing about the workflow:

| Deployment reports | Outcome |
|---|---|
| the pushed commit | `state=current` — smoke runs |
| an older commit | `state=stale` — skipped, warning names both commits |
| no commit field | `state=unknown` — smoke runs, exactly as before |
| nothing at all (down) | `state=stale` — skipped, warning says it never answered |

The last two warnings were separated after the first version said *"still
running "* for a deployment that had not answered at all — the state that
renders as nothing (§36, §38, §39), in the one place somebody reads at 2am.

A fifth case was added after the first live run, and it is the one that would
have hurt: **the match is a PREFIX comparison, not equality.** The deployment
reports whatever the host hands it, and a host abbreviating to a short SHA
would never equal `github.sha` — so every push run would wait out its budget
and skip, for ever, silently. That is the same silent-permanent-skip failure
the omitted-vs-placeholder decision above exists to avoid, reached from the
other end, and it would have looked like the fix working. Seven characters is
the floor, which is git's own for an unambiguous short SHA; a two-character
prefix is refused, because it would match almost anything.

| Reported | Wanted | Outcome |
|---|---|---|
| full SHA | full SHA | current |
| **short SHA** | full SHA | **current** — the case that would have skipped for ever |
| short SHA | an unrelated commit | stale, correctly |
| two characters | full SHA | stale — too short to trust |

Full Node suite **418**, Playwright **105**, smoke **44 locally** — the full
run because `/healthz` is polled in eight test files' boot-wait loops (§40) and
`startServer()` gained an `extraEnv` parameter, and §9 names shared test
helpers as blast radius.

**Confirmed against production**, not only locally — §30's standard for a CI
change. A live smoke run reported `49 passed · 0 warnings · 0 failed` and
`deployed build 9f8126c3c28f`, which is both halves of this working: the
marker reaches a real deployment, and the commit it names is the one that had
just been pushed. That run is also what retired the `RENDER_GIT_COMMIT` caveat
below, and what showed the count is two numbers rather than one.

**And then the wait itself was observed doing its job on CI**, which is the
confirmation that actually matters — the run above was a smoke test, not a
test of the waiting:

```
Live deployment is running 9f8126c3c28f, waiting for 9e93deb290eb…
Live deployment is running 9e93deb290eb — the commit under test.
```

One poll saw the previous build, the next saw the pushed one, and the smoke
then passed 49/49 against it. **The race is observed rather than inferred**:
that first line is precisely the state that used to produce
`✗ GET /js/dsar.js — HTTP 404` and *"Deployment is NOT healthy"*. The
`sync model` line on the same run reads `up 19s`, so the deployment had
finished restarting nineteen seconds earlier — without the wait, that smoke
would have run against the old build. The window is that narrow, and it is
why the failure looked intermittent.

### The doc that went stale, exactly where §27 says it does

Asked directly — *"docs updated?"* — and auditing rather than answering found
one real gap, in the file §27 already names as the one that goes stale fastest:
**`docs/API.md` listed `/healthz` as "older liveness probe" and nothing else.**
A caller now depends on its response shape, and the absent-not-placeholder rule
above is a contract rather than an implementation detail — a client reading the
document would have had no way to know it, or that the value wants a prefix
comparison.

§27's own words: *"a doc describing a contract goes stale the moment the
contract moves, which is more often than a doc describing a feature."* This
change added no route, so the route count stayed right and the file *looked*
current. **A response shape moved underneath a line that still read correctly**
— which is why the count is not the thing to check.

The rest of the walk was already done and was verified rather than assumed:
§44 and §45 are present in all six user-facing documents, with two greps that
came back empty for wording reasons rather than missing content, and
`docs/BETA.md`'s CSV-date rough-edge bullet is correctly *gone* — it stopped
being a rough edge when the control shipped.

**Then the same question about the README found more**, and for the same
reason: §27's six-document rule names the files a *feature* change has to walk,
and the root `README.md` was not one of them — so it had quietly fallen a year
behind while every document that is on the list stayed current. **It is on the
list now** (§27, and §47 added `guide.html` beside it), which is the actual fix:
bringing one file up to date does nothing about the next feature. Four kinds of
stale, and only the first is the sort anyone would notice:

- **Features nobody had added**: the due-date filter, workspace webhooks and
  the daily digest, and every data-protection tool (§42–§45). All shipped, all
  user-visible, none mentioned.
- **A factually wrong CI claim**: *"Set a repository variable `LIVE_URL` to
  enable the scheduled live check."* It has always had a built-in default, so
  the check runs whether or not you set one — `LIVE_URL` overrides, it does not
  enable. Someone reading that would conclude their deployment was unmonitored.
- **Five files that exist and were not listed**: `js/tour.js`,
  `js/date-rules.js`, `js/dsar.js`, `lib/safe-fetch.js`, `scripts/restore.mjs`.
  `lib/` is the one that matters — a whole top-level directory, and the README
  is where somebody looks to find out why it is not under `js/`.
- **A data model missing a collection**: `invites`, listed nowhere, beside
  `betaCodes` which was.

`docs/README.md` was checked at the same time and is fine: every file under
`docs/` is referenced, its routing table is task-based so new features need no
new row, and its *"14 sections"* claim about `USER-GUIDE.md` is still exactly
right — the new material went in as subsections. A number in a second place
that has *not* gone stale, which is worth recording too.

### The comment that had never matched the code

The `live` job said *"Runs on schedule, on manual dispatch, and after a push to
the default branch."* There has never been a branch filter — it is
`github.event_name != 'pull_request'`, so it runs on every push to every
branch. The comment described an intention nobody implemented, and it matters
here because the branch being deployed **is** the feature branch, so a reader
trusting the comment would conclude this race could not happen on it. Fixed to
say what the condition does, with the discrepancy noted rather than quietly
corrected.

### What this does not fix

**A push whose deploy is slower than the budget is skipped, not retried.** The
budget is seven minutes; a free-tier redeploy plus a cold start is usually
under two. If Render gets slower this becomes a skip that the daily run catches
the next morning rather than a red tick within the hour — acceptable, and worth
raising the budget rather than removing the wait if it starts happening.

**~~Nothing here proves Render actually sets `RENDER_GIT_COMMIT`.~~ It does —
confirmed the same day.** This session cannot reach `*.onrender.com` (§8), so
this shipped with the claim hedged and the runbook telling the operator to
check. A live smoke run then reported `deployed build 9f8126c3c28f` — the
commit that had just been pushed. Nothing to configure on Render, and
`DEPLOYMENT.md` now says so as a fact rather than an expectation.

Left visible rather than rewritten, because the hedge was correct when it was
written and the pattern is the one §17 and §40 both record: **the thing that
settled it was running the real check against the real deployment**, which is
the one job the automated version cannot do from in here.


---

## 47. Telling users what the app does, and two live bugs found on the way

Asked for two things: **a short document about what the app lets you do**, in
plain "you can X" terms and without sounding like a salesman, and **a post**
opening with a story about a cement factory that ran on two daily numbers,
followed by a walkthrough of the digest.

Both exist. What is worth recording is that planning them turned up two defects
on the pages that were *already* customer-facing, and one of them had been live
for twenty-one cache versions.

### `guide.html`, and the rule that stops it reading as a pitch

Served at **`/guide`** — a root file, so the extensionless alias (§28) makes the
URL short enough to say out loud, which is the entire point of a page you send
people. Reuses `legal.css`, loads no app JS, and renders for somebody who has
never opened the app.

**Every item states a capability and its limit in the same breath.** That is
what makes it not a pitch, and it is how this codebase already writes about
itself:

> **You can be told each morning what is overdue.** It says *how many*, not
> *which* — a chat channel usually has more people in it than your CRM does.

Organised by what somebody does in a week rather than by feature, so the
sections are "stop things slipping" and "answer the awkward questions" rather
than "reminders" and "DSAR". No pricing, no comparison table, no adjectives
doing persuasion work. One call to action, at the end: load the sample business.

**It is on §27's walk list**, along with `README.md` — see below.

### The post is dated and NOT maintained, deliberately

`docs/posts/2026-09-08-the-two-number-digest.md`, with a banner saying so.

A published post cannot be edited after it goes out, so pretending to keep it
current is the wrong promise; dating it is honest and keeps it off the walk
list. Its walkthrough stays short and points at `USER-GUIDE.md` for detail, so
there is little surface to drift.

**The digest message in it is real**, produced by pushing a workspace through
`/api/sync` and reading `/api/org/reminders`, not written from memory — §42's
rule. The story's own analysis is what the feature already does: the cement
factory report *told him which team to go and talk to*, which is exactly why
the digest carries counts and never record names (§39). The closing note
arrives at §39's push-versus-pull staleness split from the other end — the day
the report did not land on his desk **was** the signal, and the person carrying
it was the monitor.

### The bug that had been live since `crmbuilder-v24`

`sw.js` answers **every** navigation with the cached app shell and writes what
it fetched back over `index.html`. §19 excluded `/privacy` and `/terms` and
stopped there — so `/docs/manual.html` and `/docs/product-tour.html`, which
§28 and §29 both describe as deliberately public with **frozen URLs because
they may already be in somebody's inbox**, were still going through it.

**Proven before it was fixed**, and the page snapshot is unambiguous: opening
the manual with the service worker installed rendered the **CRM** — sidebar,
Dashboard and Admin links, a *New module* button. `skipWaiting` +
`clients.claim` means this hits a **first** visit, not only a return one.

The second half is worse than the first. The navigation handler caches what it
fetched *as the shell*, so after one visit to the manual the app itself is the
manual until the cache is cleared. Both halves are asserted, because they fail
differently and a fix for one is not a fix for the other.

**The general rule, now written where the list is**: anything served that is
not the app belongs in `STANDALONE_PAGES`. §19 added the two pages that were in
front of it at the time and stated the rule as *"anything added to those pages
must be added to that list too"* — which is about the legal pages specifically,
and is why two more standalone pages could be added later without anybody
hearing the rule apply.

### And the test found two more, because of a guard I did not write for this

The new test passed its own assertions and then **failed in `afterEach`** on a
console-error guard. Two CSP violations, on those same two customer-facing
pages, both live:

- **Google Fonts is blocked.** `style-src 'self' 'unsafe-inline'` (§30 Phase 4)
  does not allow `fonts.googleapis.com`, so the stylesheet has been refused
  since that header shipped, and both pages have been rendering in their
  fallback stacks.
- **`docs/manual.html`'s inline `<script>` is blocked.** `script-src 'self'`,
  so the **mobile Contents toggle has done nothing on a phone** for the same
  period — a functional break, not a cosmetic one, on the page we hand to
  customers.

The app had already learnt both lessons: it self-hosts Inter, and
`js/boot-icons.js` exists **precisely** because an inline script would be
refused (§30). The doc pages were simply never checked against a header written
for the app.

**Fixes, and both were cheap because the pages were already defensive.** The
font stacks already fell back to Georgia / `system-ui` / `ui-monospace`, so
removing the blocked `<link>` changes nothing a live visitor currently sees —
it removes a wasted request, a console error, and a third-party call that
§40's privacy roster would otherwise have to declare. The script moved to
`js/manual-toc.js`, served because `js/` is allow-listed, and deliberately
**not** added to `index.html` or `APP_SHELL` — it is not part of the app.

**The lesson is about the guard, not the bug.** `expectedConsoleErrors` was
built for §20's deliberate 403. It caught two unrelated live defects here
because it asserts on something no individual test thought to look at. A test
that only checks what it set out to check would have gone green over both.

### An outside review of the guide, and which four of five to take

A review came back with five suggestions. Each was checked against the file
rather than accepted or waved off — §21's treatment — and the split is worth
recording because the two it got wrong are wrong for the *same* reason.

**Taken: the role ladder becomes a table.** The review was right and this file
already agreed with it: §14 presents the ladder as a table precisely because
"there is one ordering to reason about rather than a matrix". Writing it as
prose on the customer-facing page was the inconsistency. Permissions are a
lookup — somebody evaluating for a team wants to find their row.

**`legal.css` had NO table styling**, checked before writing any markup: a bare
`<table>` renders at browser defaults, cramped and borderless, which is worse
than the paragraph it replaced. That is §27's invented-class trap reached
through a plain tag rather than a class name — the same way §41 found the
missing `h3`. Rules added there, and both legal pages were confirmed to contain
no tables so nothing else is restyled.

**Taken: the beta is stated, and the review missed this one.** The page said
nothing about beta status or cost — grepped, the only hit was the word "price"
in a currency sentence — while its own footer links to `/terms`, which is
headed *"What you should expect from a beta"* and says data loss is possible.
So a prospect read four confident minutes and then discovered the framing on
the legal page. That is the exact failure the page is built against: the limit
found later rather than stated up front.

**Taken: the module-visibility limit is elevated to a callout**, because it is
the one that disqualifies some buyers outright.

**Taken, but not as proposed: a top link.** The review asked for a *"Launch
Interactive Demo"* button. No such sandbox exists — loading the sample business
means opening the app and clicking through — so that label would have been an
overclaim in the header of the page written to avoid overclaiming. A plain
*open the app* link says what it does.

### The two that were declined, and why they share a cause

**Shortening the bold lead-ins to 2–4 word concept anchors** — *"Daily morning
digest"*, *"Consent tracking"*. Measured first: they run 4–12 words, mostly
6–9, so "full sentences" overstates it. But the substance is that this would
convert a claim addressed to the reader into a **feature name**, and a left
margin reading *Daily morning digest / Granular search / Consent tracking* is a
spec sheet. "You can X" is the brief, and it is what makes the page sound like
a person rather than a datasheet.

**Moving offline up to position two** for "technical decision-makers". That is
not this page's reader. The sections run in the order somebody works through a
week, and position two is the core daily experience. A CTO evaluating
architecture has `product-tour.html` and the README.

**Both declines share one cause: they optimise the page for a different
audience than the one it was written for** — a scanner collecting features, and
a technical evaluator. Either change is right for a page aimed at those
readers; neither is right for this one. Worth naming, because a suggestion can
be perfectly good craft advice and still be wrong for the document in front of
it.

### `README.md` joins §27's walk list

§46 found the README a year behind and fixed the file. This fixes the *rule*,
which is the part that stops it happening again: `README.md` and `guide.html`
are named in §27 now.

The original wording — *"not just this file and the README"* — reads as though
the README were covered by something. It was covered by nothing. That is a
sentence that describes a gap while sounding like it closes it.

### Blast radius

| | |
|---|---|
| `guide.html` | new root file → `PUBLIC_ROOT_FILES`, `STANDALONE_PAGES` |
| `js/manual-toc.js` | new served file, **not** app shell — no `index.html` or `APP_SHELL` entry |
| `sw.js` | `STANDALONE_PAGES` + `CACHE_VERSION` → `crmbuilder-v45` |
| `tests/smoke.mjs` | a reachability check for all three shareable pages — there was none, only "must **not** serve" |

**The smoke check is the one that would have caught a 404 on a URL somebody
already has.** It is content-based, not status-based, for §28's reason: the
catch-all used to answer everything with the shell, so a 200 proves nothing.

Counts: Node **418**, Playwright **105 → 109**, smoke **44 → 45** locally
(50 live). The full suite was run because `sw.js` and `CACHE_VERSION` are
shared surface (§9).

**The review's changes needed no `CACHE_VERSION` bump** — `guide.html` is in
`STANDALONE_PAGES` and `legal.css` is in neither `index.html` nor `APP_SHELL`,
so both go straight to the network. Checked rather than assumed, which is
§41's rule for the legal pages. Targeted run plus smoke per §9, and the
standalone-pages describe is what covers the shared-`legal.css` risk: it loads
all three pages.

> **That paragraph is WRONG, and it was wrong when it was written.** The page
> goes to the network; its stylesheet did not. `STANDALONE_PAGES` is matched
> against a **navigation**, so `/legal.css` — a subresource — fell straight
> through to the cache-first branch at the foot of `sw.js` and was kept with
> no revalidation. "Checked rather than assumed" checked `APP_SHELL` and the
> precache list, and there are **two** caches in that file. See the subsection
> below; the claim is left standing rather than edited, because what it got
> wrong is the useful part.

**And the new test tripped §14's own `.toast` trap on the first run.**
`.callout` matches two elements on the page now — the opening one and the
elevated limit — so `toContainText` failed strict mode. Filter, do not assume
one. The test says plainly what it does not prove: it catches deletion of the
beta line and the roles, not drift from §14, because `TEAM_ROLES` is
server-side and no browser test can read it.

### Two refinements asked for, and the second one found a live bug

Reported as *"minor refinement opportunities"* on the new page: the roles
table's mobile behaviour, and the contrast of the callout blocks. Measured
rather than judged, and the split is the interesting half — **one was already
right, one was right about the wrong thing, and checking it turned up
something neither point mentioned.**

**The table was already wrapped**, and the wrapper already scrolls
(`.table-wrap { overflow-x: auto }`, added with the table itself). Driven at
360, 320 and 280 CSS pixels: the table measures 312 / 272 / 232 against a
wrapper of exactly the same width, so it never needs to scroll — the columns
wrap — and `document.documentElement.scrollWidth` never exceeds the viewport,
so the **page** does not scroll sideways either. Both halves matter: the
wrapper is the guard for a future wider table, and the page-overflow figure is
what says the guard is not currently doing anything visible.

**The callout's text contrast was never the problem.** `--ink-soft` on
`--paper-sunk` is **7.23:1** in light and **7.36:1** in dark, comfortably past
WCAG AA's 4.5 for body text, and `strong` reaches 16.7 / 15.2. So the stated
concern does not exist.

**What is real sits under the same heading and is a different property.** The
callout's *distinction* — whether the block reads as one at all — came from a
fill of **1.06:1** (light) and **1.05:1** (dark) against the page, with a
hairline border reaching only 1.24 / 1.43. Effectively invisible, against
WCAG's 3.0 for non-text. That was tolerable while a callout was decoration;
it is not, now that `guide.html` **elevates its one disqualifying limit into
one specifically so it is seen** (above). Elevating something into a container
that does not read as a container achieves nothing.

Fixed at the boundary rather than the fill: a 3px `--accent` left edge, which
measures **4.57:1** light and **7.64:1** dark against the page. Left padding
drops 18 → 16px so the 3px edge leaves the text inset unchanged at 19px.
`--paper-sunk` is used by `.callout` and by nothing else, so darkening the
token was the alternative — rejected because it fights the ink above it and
because a token named for a surface should not be tuned for one component.
Verified by driving all three pages in both colour schemes: seven callouts,
`3px rgb(21, 112, 239)` and `3px rgb(106, 166, 255)`.

**And the fix needed a bump, which is how the paragraph above was found to be
wrong.** Installing the worker and opening `/guide` puts `/legal.css` in the
cache — printed, not inferred. So the table styling of the previous commit
was invisible to anybody already carrying a copy: the roles table at browser
defaults, cramped and borderless, which is the exact state that change existed
to remove, shipped silently by a claim that it could not happen.

`STANDALONE_ASSETS` (`/legal.css`, `/js/manual-toc.js`) joins
`STANDALONE_PAGES` in the early return. **The point is to make the claim true
rather than to restate it**: a page the worker refuses to handle should not
have its stylesheet handled either, and with that in place a `legal.css` edit
genuinely needs nothing. The bump to `crmbuilder-v46` is still required *this*
once, to evict what is already stale — the fix heals future visits, not caches
that already hold a copy.

`js/manual-toc.js` is listed for the same reason and was heading for the same
fate: §47 kept it out of `APP_SHELL` on the grounds that *"it is not part of
the app"*, which is right and which the runtime cache did not care about.

**The test asserts on the CACHE, not on the rendering**, and that is
deliberate: a stale stylesheet still renders, plausibly — this file's
recurring failure shape (§36, §38, §39). Nothing on screen would have said so,
which is why nothing did for a cache version. It also asserts `/js/app.js` **is**
cached, or it would pass just as happily on a worker that caches nothing at
all. Checked against the broken state per §9: removing the one
`STANDALONE_ASSETS` line fails it by name, listing both stray files.

Counts after: Playwright **109 → 110**. Node and smoke unchanged — no served
file was added, no route moved.

### Then the same question asked generally, and `/healthz` was worse

*"Are there other subresources the worker is caching that it shouldn't?"* —
asked straight after the fix above, and the honest answer needed the whole
reachable surface walked rather than the one file that had just been found.

**The surface is small and closed**, which is what made this answerable:
`ASSET_DIRS` + `PUBLIC_ROOT_FILES` + `PUBLIC_DOCS` + two endpoints, and
everything else 404s (§28). Every same-origin GET was visited with the worker
installed and the cache dumped. Assets are all precached or now listed; the
only paths outside both are **`/health` and `/healthz`**.

They predate `/api/`, so the prefix check that makes every other endpoint
network-only has never covered them — and **both halves of §19's bug were
still live on them**, four years and thirty-three cache versions after §19
supposedly closed it:

| | |
|---|---|
| navigating to `/healthz` | rendered **the CRM**, `#app` present, "CRM Builder Dashboard" |
| and then | wrote `{"ok":true,…}` **over the cached shell** |
| so the next load of `/` | served that JSON **as the entire application** |

**Permanently.** The navigation handler answers from the cache first, so
nothing heals it — the app is dead in that browser profile until the cache is
cleared. And the person who hits it is an operator checking their own health
endpoint in the browser they use the app in, which is a normal thing to do.

**My first sweep reported "none", and it was wrong.** It visited every path in
one profile and ended on `/no-such-route`, whose response *is* the shell — so
the last navigation put the real shell back and healed the poisoning before
the dump. The finding needs **one fresh profile per path**, and the assertion
has to be on the **first** load of `/` afterwards. A probe that heals what it
is looking for reports clean, which is the same shape as §34's test passing
against its own fixture.

### The list is the smaller half. The type check is the fix.

Two changes, and the split is the point:

- **`STANDALONE_ENDPOINTS`** joins the early return, so navigating to
  `/healthz` shows the JSON rather than the CRM. That is a **list**, and a
  list only ever covers the paths somebody thought of — which is precisely how
  `/docs/manual.html` survived twenty-one cache versions (above) and how these
  two survived thirty-three.
- **`response.ok` is not "this is the app".** The navigation handler now
  writes back only when the response is `text/html`. Any same-origin
  navigation answering 200 with something else — a JSON endpoint, the
  manifest, a stylesheet opened directly — was becoming the shell. Checking
  the **type** instead of the path is what covers the next such route nobody
  lists.

`/manifest.webmanifest` is the proof and is deliberately in **no** list: after
the fix it still *displays* the CRM when navigated to directly (nobody does
that on purpose, and it is a genuine app asset), but it can no longer replace
the application. The test that pins it passes only because of the type check.

**The `CACHE_VERSION` bump is load-bearing this time, not hygiene.** A browser
already holding a poisoned `index.html` serves it from cache before any of
this new code runs; `activate` deleting every cache whose key is not the
current one is the **only** thing that repairs an installation already in that
state. Shipping the fix without the bump would leave exactly the users it is
for still broken. → `crmbuilder-v47`.

Two tests, each checked against its own mutation per §9 and failing by name:
dropping `STANDALONE_ENDPOINTS` fails *"opening the health endpoints shows
them…"* on `#app` count 1 against 0, and restoring the bare `response.ok`
write-back fails *"a navigation that is not HTML never becomes the cached
shell"* while leaving the first one green — which is what shows the two
changes are covering different things rather than one twice.

Counts after: Playwright **110 → 112**.

### The runbook was telling operators to do the thing that broke it

*"Are the docs updated?"* — walked rather than answered, which is §46's own
lesson about this question. Two files needed a line and the rest genuinely did
not.

**`DEPLOYMENT.md` § *Verify the deployment* is where this stings.** Step 1 is
*open the app* — which installs the service worker and claims the page — and
step 2 is *open `/health` and read `"storage":"mongodb"`*. That is the exact
sequence above, written down as a procedure:

| The documented step | What actually happened |
|---|---|
| 1. open the app | worker installs, `clients.claim` |
| 2. open `/health` | **the CRM rendered**, so the value step 2 asks you to read was not on the page |
| — | and the JSON was written over the cached shell |
| 4. install it | installs a shell that is now a page of JSON |

So the step could not be completed as written, and completing it broke the
next thing. Measured on a pre-v47 worker, not reconstructed from the code.

**One reload clears it, and that is measured too.** The same profile, upgraded
to v47: the app renders on load **1**, not load 2 — `activate` drops the stale
cache and re-precaches. The note says one load because that is what was
observed; it does not explain the mechanism, because the mechanism is timing
between the update check and the claim and I did not pin it down.

**`docs/API.md` gets the other line**, and it is the §46 shape exactly: no
route moved, the route count is still right, and the `/healthz` section still
*read* correctly — but a browser-based caller's reachability changed
underneath it. §27's *"a doc describing a contract goes stale the moment the
contract moves"*, where what moved was not the response body.

**The six user-facing documents needed nothing, and that is checked rather
than skipped.** `README.md`, `guide.html`, `USER-GUIDE.md`, `manual.html`,
`product-tour.html`, `ONBOARDING.md`, `DEMO-SCRIPT.md` and `BETA.md`'s tester
note describe no endpoint and no caching rule; the only service-worker
sentences anywhere are `README.md`'s *"fully offline via a service worker"*
and `DEPLOYMENT.md`'s cold-start note, both still true. Padding them to look
thorough is its own inaccuracy (§40, §41). And **no count went stale outside
this file** — grepped for Playwright totals, smoke totals and
`crmbuilder-v[0-9]` across every doc, and the only hits are the live URL and a
browser zoom level. §29's rule holding, which is worth recording when it does.


---

## 48. Sweeping for what else is live and unnoticed, and the two launches

Asked directly after §47: *"what else has been live and unnoticed like this?"*
The question is answerable because the failure has a **shape** — a defect that
renders as plausible — and that shape is mechanically searchable. Five sweeps,
run rather than reasoned about.

### What the sweeps were, and what each returned

| Sweep | Result |
|---|---|
| Third-party subresources anywhere served (the CSP refuses them — §47's Google Fonts finding) | **clean** — every remaining external URL is an `<a href>` or demo data |
| Console errors + failed requests on all five public pages, at a phone viewport | **clean** — including `/privacy` and `/terms`, which no E2E had ever driven with a console guard |
| Undefined CSS classes on the served pages (§27's trap, which has now cost time four times) | **clean** |
| Every internal `href` on every served page, resolved against a running server | **clean** |
| Outbound links on customer-facing pages | **two findings** — below |

**A clean sweep is worth recording too.** Four of these five have caught
something before, and "I checked and there was nothing" is what stops the next
reader re-running them on a hunch.

### The one that mattered: the sales page linked to a build artifact

`docs/product-tour.html` — the page written to sell the product — had its
*"Read the manual"* button pointing at
`https://claude.ai/code/artifact/3e34f282-…`.

**Dated rather than guessed:** introduced 2026-08-26, and **four later commits
edited that same file** — §27's documentation audit and §44/§45's walks among
them — across 72 commits. Every one of them read the prose and none saw the
`href`, because a link renders as a perfectly ordinary button whether or not
the far end is anything at all. §27's own sentence explains it: *the HTML ones
are the easiest to forget because nothing greps them by habit.*

Fixed to `/docs/manual.html`. The sibling *"Open the demo"* button was an
absolute `https://crmbuilder-v1.onrender.com` and is now `/` — a page served
from the deployment does not need to name it, and an absolute host there is one
more thing to get wrong on a domain move.

**The guard covers the class, not the instance.** Five tests, one per public
page: no link may match a build-tool or scratch host, and every internal link
must answer 200. Checked against the broken state per §9 — restoring the
artifact URL fails *"/docs/product-tour.html links nowhere embarrassing…"* by
name, printing the URL.

### `MARKETING.md`, and the correction to what I did about it

Found by following `docs/README.md`'s own *"sell it"* row. It is prepared copy
for posts and landing pages, and **`CLAUDE.md` mentioned it zero times.**

It says *"**No per-seat pricing. No lock-in.**"*, *"Free. No ads."*, *"$0/month"*
three times — and opens by attacking other CRMs for being *"rented back to you
at $25 per seat per month"*. **Introducing pricing while that copy stands means
a product whose own marketing attacks other products for doing what it has
started doing**, in text somebody can quote back. That risk is real and stands.

**What I got wrong was the remedy.** I put it on §27's walk list beside
`README.md` and `guide.html`, on the reasoning that all three were
customer-facing documents no rule covered. Corrected when that was questioned:
**it is an internal document**, and the walk list is the wrong instrument.

The distinction the list actually runs on is **read directly by an outsider**,
which is not the same as *served*:

| | Served? | Read as a document by an outsider? | On the walk list |
|---|---|---|---|
| `guide.html`, `manual.html`, `product-tour.html` | yes | yes | yes |
| `README.md` | **no — 404s** | yes, it is the repository's front page | yes |
| `MARKETING.md` | no — 404s | **no** | **no** |

Nobody ever reads `MARKETING.md`. It becomes public one paragraph at a time,
when a person copies text out of it into a post — so its failure is **deferred
to the moment of publishing**, not live the way a stale manual is. Walking it
on every feature change would mostly be walking a file that nothing had made
wrong yet, and this codebase already has a name for that: §40 and §41 both
record that **padding a roster is its own kind of inaccuracy**. Adding an entry
that is usually a no-op is how a list stops being read.

So the requirement moves to where it belongs — a **publish-time gate** in
`docs/LAUNCH-CHECKLIST.md`, which is the document you open when you are about
to do the thing that makes it public. It was already the most prominent item
in that file's pricing half; what changed is that it is no longer *also* on a
list where it would have decayed into furniture.

**Recorded as a correction rather than quietly reverted**, because the reasoning
is the reusable part: "no rule covers this file" is a real finding, and
"therefore put it on the nearest existing list" is the wrong reflex. The
question to ask is *when* the file can hurt you, and add the check there.

### `docs/LAUNCH-CHECKLIST.md`

The second half of the request: one document covering everything a domain move
and a pricing launch have to change, code and docs, so neither ships half-done.
It lives in `docs/` — the tier §29 defines as maintained — and it 404s in
production by construction (§28), **checked**, which is what lets it be blunt
about what is unfinished.

**Every factual claim in it was verified, not recalled**: the `onrender.com`
occurrences were grepped per file, `manifest.webmanifest` was read (relative
`start_url`, so a move does not touch it), `render.yaml` pins a name and not a
host, and `server.js` sets no cookie `domain`.

Three things the writing turned up that were not obvious going in:

- **`terms.html` scopes itself to *"the free beta at this address"***, so the
  legal text is domain-specific and one sentence is wrong after *either*
  launch. That is why the two are one document rather than two.
- **The domain move's real risk is not a string.** IndexedDB is per-origin, so
  unsynced rows are stranded; an installed PWA keeps serving the old origin and
  never learns about the move; and `CACHE_VERSION` cannot evict a cache on an
  origin you are no longer serving (§47). **A redirect fixes the website and
  none of those three.**
- **Pricing forces decisions this codebase deliberately deferred** — whether
  quotas start being enforced (§17: *"nothing is enforced"*), what non-payment
  does (§24's suspension, which must never reach `deleteAccount()` — §15), and
  whether a suspended customer can still export (§36 says export is for every
  role, deliberately). The checklist states each as a question with the prior
  reasoning attached rather than answering it.

### The §47 item that is now closed

*"Confirm the manual's mobile Contents toggle works on a phone"* was left
outstanding for the user. Measured here at a 390px viewport: the TOC goes
75px → 591px, the label flips to *Contents ▴*, and `aria-expanded` goes true.
At 1280px the toggle is correctly not visible. §47's CSP fix works; nothing
further is needed.

Counts after: Playwright **112 → 117**. Node and smoke unchanged — no served
file was added and no route moved, and the new document is deliberately
unserved.

---

## 49. The renewals template, and a module that can vanish from the digest

The first of the three features specced in
[`docs/CHASER-AND-TRACKERS.md`](docs/CHASER-AND-TRACKERS.md), and the smallest
by a wide margin: **no new machinery at all.** §37's due filter and §39's daily
digest already count what is overdue or falling due inside a window, on any
module carrying a date field, so an owner could have built a renewals register
by hand. What they could not do is know to, or guess which columns an
inspection actually asks for.

`renewals` — holder · kind · **expires** · status · reference · issuer · notes.
§42's `consent` template is the precedent for every structural choice: a module
rather than fields on Contacts, opt-in, costing nothing to a workspace that
never picks it.

### The constraint that had to go in the file, not just in a test

`DateRules.watchedDateField` is `dates.find(f => f.showInList) || dates[0]` —
**one date field per module**, and it is what both the filter and the digest
count against. So `expires` must be the only listed date field, and the reason
belongs in `js/templates.js` beside the fields rather than only in a test,
because the person who breaks it is the one adding an `issuedOn`.

**Measured both ways against the mutation, and the quieter half is worse than
the miscount I wrote the warning for:**

| The second date field is | What happens |
|---|---|
| **filled** | the digest counts certificates by the day they were *issued*, and reads exactly as plausibly as the correct message |
| **empty** — which is what an added field is on every existing row | `daysUntil` returns null for every record, the module falls out of the `total > 0` filter, and **the register disappears from the digest entirely** |

No error, no empty section, nothing: the renewals simply stop being mentioned.
That is §36's state-that-renders-as-nothing on the one feature whose whole job
is to speak up, and it is reachable by an ordinary owner adding an ordinary
column — not only by editing the template.

The E2E fails on the mutation **one assertion earlier than predicted**, at
*"a module with an expiry date must reach the digest"* rather than on the
`field` name. The comment I wrote first predicted the wrong line; it now
records what was observed. §9's rule earning its keep — the mutation was run,
not reasoned about, and reasoning about it would have produced a confident and
wrong note.

### No samples, and it is the one template where that is a decision

Every other template's samples avoid dates because `createFromTemplate` copies
a sample verbatim and does **not** resolve `{ __rel: n }` — only `loadDemoData`
does — so a date has to be hard-coded and goes stale. Here both halves of that
bite at once:

- a hard-coded expiry lands in a brand-new workspace as a certificate that
  expired two years ago;
- and leaving it empty puts an empty cell in the one column the module exists
  for, on the first screen somebody sees (§36).

So `samples: []`, like `notes`. `DEMO_SKIPS` gains `renewals` for a related
reason worth keeping separate: the demo's dates are **relative** so the
business never looks stale, so seeding it would start reporting overdue
certificates to somebody who only wanted a look around.

### One window for the workspace, with a review condition

`remind.days` is a single number for the whole workspace, and shipping it that
way is the decision rather than an oversight. Per-module windows
(`remind.perModule`) would touch `remindSettings()`'s clamping, the
`n > remind.days` comparison, the preview, the settings screen and the message
— contained, since settings already sync whole and are already owner-only
(§14), but the bulk of the work for a problem nobody has reported.

> **Revisit the first time a workspace wants two different windows.** That will
> not appear in telemetry — it arrives as a support message, so it has to be
> *recognised*. Written into `docs/CHASER-AND-TRACKERS.md` §1 for that reason.

The user docs say the same thing as advice: pick the look-ahead for the slowest
thing you track, because the per-module Due date filter still gives you the
shorter view.

### "Overdue", not "expired"

For a certificate the right word is *expired*, and the message builder is
shared across every module with no way to tell a due date from an expiry date.
Deriving it from the field label ("starts with Expir") is a locale-bound
heuristic on a string the user typed. Left as *overdue*, said plainly in the
user docs — the price of the better word is a shared code path, and the word is
understood.

### A pre-existing find: the icon picker could not represent its own template

`MODULE_ICONS` is what the builder's icon row renders, and a swatch is marked
`on` only when it equals `draft.icon`. `shield-check` — the icon §42 gave the
`consent` template — **was not in that list**, so opening the builder on a
Consent module showed an icon row with nothing selected. Not destructive (the
module keeps its icon unless you click one) and exactly this file's recurring
shape: it reads as *unset* rather than as *chosen*.

Fixed by adding `shield-check` to `MODULE_ICONS`, not by changing the template
— `createFromTemplate` copies the icon at creation time, so editing
`js/templates.js` would leave every existing Consent module untouched. The rule
now sits in a comment on that array: **every icon a template uses has to be in
it too.** `clipboard-list`, which Renewals uses, already was.

### Blast radius

`js/templates.js` and `js/app.js` are both in `APP_SHELL`, so `CACHE_VERSION`
→ `crmbuilder-v48`. No new served file and no route, so the smoke count stays
**45 local / 50 live** — and running it is what proves that (§9). No
`docs/API.md` change: nothing about the wire moved.

`TEMPLATE_KEYS` (`tests/demo.test.mjs`) and the `.template-card` count
(`tests/e2e.spec.js`) are both derived from `js/templates.js` since §42, so an
eighth template broke neither. Verified rather than assumed — both were
literals until they went stale.

Counts: Node **418**, Playwright **117 → 118**, smoke **45** locally.

### Docs walked (§27)

| | Needed |
|---|---|
| `README.md` | the module list, and a feature bullet |
| `guide.html` | the module list, and a *Stop things slipping* paragraph naming the one-window limit |
| `USER-GUIDE.md`, `docs/manual.html` | a *Tracking things that expire* section, with the one-date-column warning |
| `docs/product-tour.html` | the module list, and a tile — this is the feature that sells to a trade business or an agency |
| `docs/ONBOARDING.md` | a row in the noun→module translation table, and *pick the look-ahead for the slowest thing they track* |
| `docs/DEMO-SCRIPT.md` | an expected question, because "we lose accounts over expired COIs" is usually the strongest reason in the room |
| `docs/BETA.md` tester note | the template, and the one-date-column rule |
| `docs/API.md` | nothing — no route, no wire change |

**Three of those lists had already gone stale**, and not because of this
change: `README.md`, `guide.html` and `docs/product-tour.html` each named the
original six templates and had never gained `consent`, which shipped in §42.
§27's drift, found by walking the list rather than by anybody noticing. Only
`renewals` was added to them — `consent` has its own paragraph in each, so
putting it in the parenthetical too would be padding (§40, §41).

**The renewals material is deliberately NOT in the GDPR paragraphs** of
`ONBOARDING.md`, `DEMO-SCRIPT.md` and `BETA.md`, which is where the eye goes
because that is where `consent` lives. Renewals is operational, not a data
protection tool, and filing it there would imply a compliance claim the
template does not make.


---

## 50. Dormancy is retention's question with a different clock

Part 2 of [`docs/CHASER-AND-TRACKERS.md`](docs/CHASER-AND-TRACKERS.md). §44's
retention review already scanned every record, grouped by module, sorted oldest
first and downloaded the list. **The scan was right and the clock was wrong**,
and that is the whole of this section:

| Question | Right clock |
|---|---|
| what have we stopped **touching**? | `updatedAt` — correct since §44 |
| who have we stopped **talking to**? | **not `updatedAt`** |

A customer whose address you corrected last month reads as active. One you
emailed last week without logging reads as dormant. Shipping dormancy on
`updatedAt` would have produced a confidently wrong list — this file's
recurring failure shape rather than a rough edge.

### The field is an input, not a better guess

The obvious move is `DateRules.watchedDateField`, the convention §37's filter
and §39's digest already share. **It does not work here**, and the reason is
worth keeping: that helper returns *one* date field per module, so on an
Invoices module carrying `dueDate` and `lastContacted` it hands the same field
to all three — and this report would age `dueDate` and call the result
dormancy. Falling back to `updatedAt` does not rescue it either: the fallback
only fires when there is **no** date field, and here there is one. It is just
the wrong one.

So the field is picked, preselected from a name that looks like contact, and
**named on screen and in the file** — §37's filter already names the field it
watches, because filtering on a date the reader cannot see is indistinguishable
from rows going missing. §45's answer to exactly this shape, one feature over.

**And my own default rebuilt the trap, which the probe caught and reading
would not have.** The first version preferred *"the first module with any date
field"*, so on an ordinary Contacts + Deals workspace — Contacts has no date
field, Deals has `closeDate` — contacted mode opened on **Deals, aged on
Expected close**. Measured at three viewports while checking the layout, and
visible in one line of probe output. It prefers a *contact-ish* module and
otherwise simply the first, so with no date field the explanatory note fires
and says what to add, rather than answering a question nobody asked.

### The two clocks, and `monthsAgoDay`

`updatedAt` is a local millisecond stamp. A stored date field is `YYYY-MM-DD`,
which `parseDay` turns into a UTC-projected midnight. **Different coordinate
systems**, and mixing them fails two ways:

- `Number('2024-09-12')` is `NaN`, so the shortcut drops every row into
  `undated` and reports a clean workspace;
- comparing a day coordinate against `monthsAgo`'s instant is off by the
  clock-time, which is **worse**, because a handful of boundary rows move and
  the list still looks right.

So `js/date-rules.js` gains `monthsAgoDay(now, months)`: the day `monthsAgo`
landed on, read with local getters and projected the way `today()` does,
directly comparable with `parseDay` and with nothing else. **No `zone`
parameter, deliberately** — both callers run in the browser, and a zone
argument would invite somebody to pass the workspace's, which is exactly the
unification §39 forbids.

Three unit tests, checked against a bare `return monthsAgo(now, months)`: all
three fail. The arithmetic is unit-tested and the wiring is E2E-tested, which
is the right split — the clock-time bug is invisible at E2E scale (a
three-year-old date is stale on both readings) and obvious at unit scale.

### One card, two questions — and the crossed pair that proves it

Two cards would be two nearly identical scanners on one screen, which is §33's
adjacent-and-unlabelled-numbers problem waiting to happen. They are one query
asked twice, so they share one control row, one scan and one renderer, and the
copy is what differs.

**The E2E is one arrangement of records and it fails in both directions.** One
record is edited today and was last contacted three years ago; another was
contacted today and last edited three years ago. Each mode must return exactly
one, and they must be different ones.

A test that only checked *"the dormant one appears"* would pass on a report
that ignored the field entirely — a row three years old is old on both clocks
unless something is deliberately new on one of them. That is why the pair is
crossed rather than a single stale record.

Two mutations were run. `byField = false` fails, but on the **wording**
(`uncontacted` becomes `unchanged`) rather than on the rows — a true failure
naming the wrong thing. Keeping the label and swapping only the comparison to
`Number(r.updatedAt)` fails on `toHaveCount(2)` against 1, which is the
assertion actually doing the work. Recorded because the first mutation looked
sufficient and was not.

### The rest, and what each is for

- **Segmentation is two more selects**: which module (you want dormant
  customers, not dormant invoices) and a dropdown value. Client-side over rows
  already in memory, §37's shape. Both reset when the module changes — a field
  key or an option value from the previous module matches nothing, and an empty
  list is reported exactly like a real answer.
- **CSV beside the JSON.** This is the one report whose output gets pasted into
  a mail tool, and `js/csv.js` already prefixes a leading `=`/`+`/`-`/`@` so a
  name cannot execute as a formula on open.
- **Empty contact dates are counted, never folded in.** They are not dormant
  customers, they are customers nobody has logged — a habit problem with a
  different fix, and on a first run usually the more useful number.
- **`fmtDate`, not `fmtWhen`, for a day coordinate.** `fmtWhen` runs
  `toLocaleDateString` on the ms, and a UTC midnight renders as the *previous*
  day for anyone west of Greenwich — §37's trap, in the one place a report says
  a date out loud.

### §44's button count became an allow-list

§44 pinned *"no delete button"* structurally with
`expect('#stale-results button').toHaveCount(1)`. Adding the CSV button makes
that 2 — and **bumping the number would have kept the shape of the assertion
and thrown away its meaning.** It now compares the sorted ids against
`['stale-download', 'stale-download-csv']`, so a third button fails by name.
A count says nothing about *which* buttons they are, which is the entire point
of a guard against a control that acts on the list.

### Traps hit while building it

- **`.dsar-search` is a non-wrapping flex row capped at 62ch.** Five controls
  in it crush each select to about ten characters — §4's layout trap, which
  renders perfectly plausibly. `.stale-search` wraps and releases the cap, and
  **must sit after `.dsar-search .input`**: same specificity (0,2,0), so order
  decides. Measured rather than judged, at 1440/900/390: the row wraps to
  38/128/173px tall and `scrollWidth` never exceeds the viewport at any of
  them.
- **`modules` is not a global in either sense.** §39 records `DB` and §41
  records `Cloud` as bare globals rather than `window.` properties; this is the
  third variant and the strictest — `modules` is a `let` *inside* app.js's
  IIFE, so a `page.evaluate` reference **throws** rather than returning
  undefined. Read module ids through `DB.getAll('modules')`.
- **`#f-name`, not `#f-client_name`.** Relabelling the builder's default field
  keeps its key, because record data survives a rename (§4). Walked straight
  into it; the id looks wrong beside a column headed *Client name*, so the test
  says why.

### Blast radius

`js/app.js`, `js/date-rules.js` and `css/style.css` are all in `APP_SHELL`, so
`CACHE_VERSION` → `crmbuilder-v49`. No new served file and no route, so the
smoke count stays **45 local / 50 live** — running it is what proves that (§9).
`server.js` requires `js/date-rules.js` (§39), so the addition has a second
consumer no browser test covers; `monthsAgoDay` is additive and the server does
not call it, and the shared-surface test covers the export list either way.

Counts: Node **418 → 421**, Playwright **118 → 119**, smoke **45** locally.

### Docs walked (§27)

| | Needed |
|---|---|
| `README.md` | its own feature bullet |
| `guide.html` | a paragraph in the week-shaped section, not the compliance one |
| `USER-GUIDE.md`, `docs/manual.html` | a *The other question* subsection with the two-clock table |
| `docs/product-tour.html` | its own tile — *The customers nobody has called* |
| `docs/ONBOARDING.md` | a week-1 step: add a *Last contacted* field while they are still keen |
| `docs/DEMO-SCRIPT.md` | its own expected question, with the distinction shown rather than described |
| `docs/BETA.md` tester note | the mode, and what an empty field means |
| `terms.html` | **nothing** — checked. Retention is a controller duty and that sentence is still true; dormancy is commercial |
| `docs/API.md` | nothing — client-only, no route, no wire change |

**The dormancy material is deliberately kept OUT of the GDPR paragraphs** in
`ONBOARDING.md`, `DEMO-SCRIPT.md` and `BETA.md` — which is where the eye goes,
because that is where the retention review lives. Winning back a lapsed
customer is a commercial act, and filing it beside the data-protection tools
would imply a compliance claim it does not make. Same call as §49's, for the
same reason, one file over.


---

## 51. The chaser that writes the email and does not send it

Part 3 of [`docs/CHASER-AND-TRACKERS.md`](docs/CHASER-AND-TRACKERS.md), first
commit. Open an overdue record and **Chase by email** drafts the reminder and
hands it to the reader's own mail client.

**This is not scaffolding for the BYOK send.** It is the permanent fallback for
any workspace that never adds a key, and it is what a sole trader — the reader
`guide.html` is written for — will use for ever. It also happens to remove the
thing the brief actually named: *chasing payment feels awkward*. The draft says
the awkward part, and the money was already earned.

What it buys by not sending: no credential, no sub-processor, no bounce
handling, no deliverability, no privacy-roster change — and the mail leaves
from the address the customer already recognises, with the sender's own
signature on it. A payment reminder from a system nobody recognises gets
ignored, so this is the point rather than the limitation.

### Available to every role, and that is a decision

§14's ladder and decision 4 in the spec say owner + member. **That governs
`canSendMail()` on the route that will send through our server, and there is no
route here.** This composes a draft in the reader's own mail client, from their
own address, out of an address they can already read off the record — §36 keeps
export open to every role for exactly that reason. Gating it would buy nothing
real and would tell a contributor their own mail client is off limits.

Recorded rather than left to be inferred, because it looks like a decision-4
violation to anybody reading the ladder first.

### `encodeURIComponent`, never `esc()` — and the reverse is a bug too

A URL and a document are different things, and the two escapes are not
interchangeable in either direction:

| | Wrong tool | What the reader gets |
|---|---|---|
| the `href` | `esc()` | `&` and `#` intact, so the body stops at the first one |
| the preview | `encodeURIComponent` | a wall of `%20` that still looks like a message |

Both directions are asserted. The mutation swapping in `esc()` fails on
`%0D%0A` and prints the raw body back in the diff, which is the failure naming
itself.

**`\r\n`, not `\n`**, so the body encodes to `%0D%0A` as RFC 6068 asks — a bare
`%0A` renders the whole message on one line in some clients. **The address
keeps its `@`**: percent-encoding it is spec-legal and every client is
nonetheless tested against the plain form, so `encodeURIComponent(...)` then
`.replace(/%40/g, '@')`.

### The subject is capped and the body is trimmed, and that asymmetry is load-bearing

A record name is not bounded by anything — it arrives from a CSV import and a
restored backup as well as from the form (§3's threat model). So:

- the **subject** is capped at 150 characters, because a subject is a label and
  a truncated one still identifies the mail;
- the **body** keeps the full reference and is trimmed only if the assembled
  href would exceed 2000 characters, **visibly**, with the count on screen
  before anything is pressed.

Truncating the reference *inside* the message would be wrong in a way somebody
could act on; truncating it in the subject is not.

**The cap is what makes the budget work at all, and the mutation proves it.**
Removing it leaves the trim with nothing it can do: the body is cut to a single
ellipsis and the href is **still 2690 characters**. That is a guard reporting
success while failing — this file's standing failure shape, and it was measured
rather than predicted.

The trim binary-searches the longest body that fits rather than estimating a
ratio: percent-encoding runs between one and nine characters per source
character, so a fixed guess is badly wrong on either an ASCII or an
emoji-heavy message.

### The address is resolved, and the preview says how

An invoice does not usually carry an email; the customer does. So
`chaseRecipient` looks for an `email` field on the record, then follows a
relation to a record that has one — and carries back **`via`**, the name of the
record the address came from, because resolving through a link is a step the
reader should be able to check. §37's filter names the date field it watches
for the same reason: a resolution the reader cannot trace is one they have to
take on trust.

Both branches are covered: the first journey resolves through a relation, the
second reads the address off the record itself.

**Absent, not inert.** The button is built only when the record is past the
watched date *and* an address was found — §36's rule 1, rather than a control
that opens a dialog to explain it cannot work. Both halves are resolved before
the modal is assembled, which is why `openRecord` gained an await.

### The real risk is accuracy, not privacy

§39's counts-only rule exists because a webhook destination may be a shared
channel. Here the recipient **is** the customer, so that reasoning does not
apply and decision 5 puts the reference and the balance in the message — a
reminder that does not say what is owed cannot do its job.

What replaces it is a different risk: **a wrong balance is a demand sent to
somebody who has already paid**, which is worse than a vague nudge. Two
mitigations, and neither is optional:

- the **preview**, which is the whole interaction rather than a confirmation
  step — and which says the message was built from the record as it stands;
- the line every real dunning email carries: *"If you have already paid, please
  disregard this message."*

The reference is the record's own **name** — the first field, whatever the user
chose to identify these by — rather than a guess at which text field holds an
invoice number. Guessing there would be confidently wrong on half the
workspaces that have one.

### A nested layer, per §22

`openModal` replaces the whole of `#modal-root`, so previewing from inside the
record would destroy the record — and Close would then cost the reader every
unsaved edit rather than returning them to it. `openNestedModal` /
`closeNested`, and the E2E asserts `#record-save` is still there afterwards.

The Open button is a real `<a href>`, so the browser performs the handoff; the
layer closes on a `setTimeout(…, 0)` **after** it, never instead of it. A
`preventDefault` here would close the preview and open nothing.

### No new CSS, and that was checked rather than assumed

§27's invented-class trap has now cost time four times, so the preview is built
entirely from classes that already exist: `.read-row` / `.read-label` /
`.read-value`, `.read-note` (which already carries `white-space: pre-wrap`,
exactly right for a message body), `.settings-hint`, `.modal-foot`.

**`.read-row` is only styled inside `.record-read`**, so the preview body
carries that class. Without it the rows render at browser defaults and look
plausible in a screenshot, which is the trap in its usual shape.

### Test traps

- **The Contacts template seeds an "Amira Hassan"**, so creating one made
  `tr:has-text("Amira Hassan")` match two rows. §34's rule is about not
  depending on what the seed produced; this is the other half — not colliding
  with it either.
- **`textContent` normalises CRLF to LF.** The href decodes back to `\r\n` and
  the screen reports `\n`, so the round-trip assertion compares on one of them.
  The first version failed by two characters in each direction and said only
  that the strings differed.
- **`#f-name`, not `#f-reference`** — §4 again, and the third time in three
  sections. Relabelling the builder's default field keeps its key.

### Blast radius

`js/app.js` is in `APP_SHELL`, so `CACHE_VERSION` → `crmbuilder-v50`. No new
served file, no route, no wire change — smoke stays **45 local / 50 live**, and
running it is what proves that (§9). `safeHref` already permits `mailto:` (§3),
so the invariant needed nothing; what is not automatic is the encoding, which
is why both directions are tested.

Counts: Node **421**, Playwright **119 → 121**, smoke **45** locally.

### Docs walked (§27)

| | Needed |
|---|---|
| `README.md` | a feature bullet |
| `guide.html` | a paragraph in *Stop things slipping*, beside the digest |
| `USER-GUIDE.md`, `docs/manual.html` | a *Chasing something that is overdue* section, with the accuracy caveat as a Careful note |
| `docs/product-tour.html` | its own tile — *Chasing what is owed* |
| `docs/ONBOARDING.md` | a week-1 step on a **real** overdue invoice, and the two limits to say in the same breath |
| `docs/DEMO-SCRIPT.md` | an expected question, with "it does not send" said immediately rather than waited for |
| `docs/BETA.md` tester note | where the button is and when it appears |
| `privacy.html` | **nothing** — checked. Nothing leaves the deployment, so there is no recipient to declare. That changes with the BYOK send, and the paragraph then has to describe **both** dispatch states because this one remains the fallback (§40's complete-list lesson) |
| `terms.html`, `docs/API.md` | nothing — no route, no wire change, no processor change |

### What is deliberately still not built

Option 2 (BYOK manual send) and Option 3 (automated escalation) are both
unbuilt, and Option 3 stays that way until the scheduler question is answered
on its own. §40 records the `/health` ping having never once fired the reminder
engine for weeks, invisibly to every test here; that is an acceptable
foundation for a message nobody loses money over and not one for money
collection. `docs/CHASER-AND-TRACKERS.md` Part 3 carries the reasoning and the
`meta.mail` design, which is the next thing to build and is independent of any
send UI.


---

## 52. A second credential on the meta doc, and no send to use it yet

BYOK infrastructure for the chaser: the tenant supplies their own Resend or
Postmark key, which moves the sending domain, the deliverability reputation,
the billing and — the one that makes a payment reminder actually get paid —
the from-address off this deployment entirely.

**Storage, redaction and the adapter. No route sends anything.** That order is
deliberate and it is §38's: the webhook transport was built before the digest
that uses it, because the alternative is writing the part that handles a
credential under pressure with the feature already half-built. §51's `mailto:`
chaser is untouched and remains the permanent fallback for every workspace
that never connects a key.

### Where the key goes was already decided, by §38

Every word of the webhook's reasoning transfers, so `mail` is a **sibling** of
`settings` on the meta doc rather than a field inside it:

- `pullChanges` sends `meta.settings` **whole** to anyone whose cursor is
  behind — member, contributor, **viewer** — so a key kept there lands in every
  colleague's IndexedDB, offline, permanently.
- **And masking it on the way down would then destroy it.** The client merges
  the pulled document into local settings and pushes the whole thing back,
  where last-write-wins accepts it, so `re_•••••` overwrites the real key the
  first time an owner changes the currency. Redaction and last-write-wins
  cannot both apply to one document.

As a sibling, `putData` merges it on both stores and `pullChanges` names
`meta.settings` specifically, so sync **structurally** cannot reach it — a
guarantee that holds for somebody who never reads the comment. Asserted across
the **whole** sync response body for all three roles rather than a named field:
a field-by-field check only covers the fields somebody thought of.

### There is no masked form, and that is the departure from `publicHook`

`publicHook` returns `masked` because a webhook URL has a non-secret half that
genuinely identifies it — the host is what tells a Slack hook from a Discord
one at a glance. **A key has no such half.** What identifies this configuration
is the provider and the from-address, and both are returned in full, so a hint
like `re_••••9f2c` would be handing back bytes of the secret for no operational
gain. There is no rotation flow here that needs two keys told apart. The test
asserts the last six characters are absent too, so "improving" this fails by
name.

`verified` is the fourth field and is deliberately not something the save can
set — see below.

### The save makes NO outbound call, and that is a decision

The webhook probes at save because it can: a test notification into a chat
channel costs nothing and proves the destination. **The only way to prove an
email key is to send an email**, which would put a message in somebody's inbox
every time an owner corrects a typo in the from-address.

So §38's refuse/warn split still applies, with the warn half moved to the first
real send, because that is the only place the answer exists:

| | |
|---|---|
| **refused, 400** | a key matching neither provider's shape; a from-address that is not one — properties of the input, needing no network |
| **stored, unverified** | everything else. `verified` stays false until a send succeeds |

The consequence is stated rather than discovered: a wrong-but-well-formed key
is stored and the first send finds out. The screen can then say *not checked
yet* rather than implying a confirmation nobody made.

**A replacement key does not inherit the old one's history.** `lastOkAt` is
what `verified` reports, so carrying it forward puts a green tick over a
credential that has never been used — §17's workflow reporting success while
producing no backups, in a smaller place. **The test for that passed on the bug
first time**: `lastOkAt` is 0 on a fresh key, so an implementation that spread
the previous row forward was indistinguishable from one that did not. It plants
a verified state stop-edit-start before replacing, per §9.

### Read and write are gated differently, unlike the webhook

`PUT` needs `canEditSettings()` — owner-only, the same rule the webhook and the
currency hang off. **`GET` needs `canSendMail()`**, a new predicate: owner,
platformAdmin or member.

Mirroring the webhook exactly would leave a member with no way to know whether
sending is available, so their client would either hide a capability they have
or offer a button that 403s. What a member sees is the provider, the address
their mail goes out under, and whether it has ever worked — the facts they need
to decide whether to press send. Never the key, which is not a question of role
at all: `publicMail` does not return it to anybody.

**`canSendMail` is a new predicate rather than the existing seam**, and that is
the substance rather than the name. `canEditRecords` and `canDeleteRecords` are
enforced inside `applyPush` because they gate **sync**; a send is a route call
and never passes through that seam, so it has to be checked on the endpoint.
Owner and member — one rung above `canEditRecords`, because this is not an edit
a colleague can see and undo: it leaves the deployment, arrives in somebody's
inbox with the business's address on it, and cannot be recalled.

**§51's `mailto:` chaser is deliberately NOT gated by it.** That composes a
draft in the reader's own mail client, from their own address, out of an
address already on the record — nothing leaves the deployment and there is no
route to check. §36 keeps export open to every role for the same reason.

### Redacted on export, and the marker is not stripped

`workspaces[].meta` **is** the `data` collection, so anything on the meta doc is
in every nightly artifact — and a provider key is worth more to whoever
downloads one than a webhook URL is: a bot token posts into one chat, a Resend
key sends mail as that business to anyone.

Same treatment, same reasons, including the one that is easy to undo by
tidying: **the provider name and the from-address go too.** Carrying them would
make the re-entry notice better — *"you were sending from accounts@…"* — and
§38 declined exactly that for the webhook host, because it would put which
provider each tenant uses into an artifact §17 is already uneasy about, to save
an owner from remembering a choice they made themselves.

`restore.mjs` rewrites `{ redacted: true }` to `{ needsReentry: true }` rather
than deleting it, and `deliverMail` and `publicMail` both key on `mail.key`
being absent. Without that marker a recovery silently switches off every
customer's sending and the settings card is byte-identical to one nobody ever
filled in — §38's defect, on the messages that ask customers for money, which
nobody notices going missing.

### The one shared-helper change: `sendGuarded` takes headers

Both providers authenticate with a **header** rather than with a token in the
path, so the credential has to be able to get into the request and this
function is the only place that can put it there. Default `{}`, so every
existing caller is byte-identical.

- **`Content-Length` sits after the spread and is not overridable.** It
  describes the buffer about to be written; a caller-supplied one that
  disagrees either truncates the payload or leaves the socket waiting for bytes
  that never arrive — the hang §38 spent an afternoon on. `Content-Type` sits
  above it, because a caller may legitimately need a different one.
- **The credential is now somewhere `scrub()` cannot see.** It only knows how
  to remove the URL from a message, because until now the URL was the only
  place a secret lived. Nothing reads a request header back out — the errors
  there come from DNS and the socket — so there is nothing to scrub today, and
  the rule that keeps it true is written into the function: a header value must
  never reach an error, a log line or a stored `lastError`.

§9's shared-helper rule applies: `sendGuarded` is on the feedback, alert,
digest and Telegram paths, so this had a full run before it was trusted.

### The adapter (`lib/mail-send.js`)

**Not a new SSRF sink**, which is what makes it affordable — the Telegram case
(§38) exactly. The host is fixed and ours to choose; only the key varies, and
it varies in a header. Everything goes through `sendGuarded`, so the block
list, the DNS pin and refuse-redirects all still apply.

**The provider is detected from the key, never asked for.** `re_` → Resend, a
UUID → Postmark; the shapes do not overlap, so the paste carries the answer and
an owner who has to be told which service their own key came from was asked a
question they had already answered. §18's precedent: one payload builder, two
shapes, no setting to get wrong.

**§18's rule arrives at two more providers, and Postmark is the sharp one.** It
answers **200 with a non-zero `ErrorCode`** for an ordinary refusal — an
inactive recipient, an unconfirmed sender signature — so reading the status
alone files a refusal as a sent message and an unpaid invoice goes unchased
with the screen saying it was chased. It also uses 406 and 422, which a
status-only reading reports as a transport fault. `read()` keys on `ErrorCode`
and `MessageID`, not on the status.

**`unconfirmed` is a third state and must not be collapsed into either
neighbour.** A 2xx whose body could not be read — unparseable, or over
`maxBytes` — is neither delivery nor refusal; the mail may well have gone. §38
found the hang underneath exactly this state. Reporting it as sent leaves an
unpaid invoice unchased; reporting it as failed invites a second copy to a
customer who already has the first. The wording says the message may have gone
and points at the provider's own dashboard. **Two ways to arrive there**, and
reading only the second is how §38 filed a truncated Telegram refusal as a
delivery: `ok` with no `json`, and `too_large`, which is *not* ok but still
carries the 2xx the provider sent before the body ran away.

**`MessageStream: 'outbound'` is pinned rather than left to the account
default.** Postmark is strict about not letting marketing leak into the
transactional stream, which is precisely the line an invoice chaser must not
cross — an owner whose default has been changed would otherwise send a payment
reminder down a broadcast stream and collect an unsubscribe footer with it.

**`redactKey` removes nothing today, and that is the reason to have it.**
Neither service echoes a key into an error, but the message is persisted on the
meta doc and rendered on a settings card, so the guarantee should be local and
testable rather than emergent from two vendors' current habits — §30's argument
for the prototype-pollution guard, in a new place.

**`MAIL_API_BASE` is one seam for both providers**, not one each: their paths
differ (`/emails` against `/email`), so a single capture server tells them
apart. The guard relaxation hangs off that same variable being set rather than
a flag of its own, because two independent switches is how the wrong one ends
up set in production (§38, and §30's `GOOGLE_TOKEN_URL` before it).

### Verification

Every mutation was run, and each fails the test that names it (§9):

| Mutation | Fails |
|---|---|
| drop `...headers` from the request | *a caller's own headers reach the destination* |
| make `Content-Length` overridable | *a caller cannot override the length of the body it is not writing* — HTTP 400, or a hang |
| read Postmark by status alone | *a 200 carrying a Postmark ErrorCode is a refusal* |
| drop `MessageStream` | *a chaser goes down the transactional stream* |
| collapse `unconfirmed` into sent | *a 2xx whose answer we could not read says so* |
| drop `redactKey` | *a key echoed back by the provider is removed* |
| carry the previous row forward on PUT | *replacing the key does not carry the old one's history* |
| gate GET like the webhook | *a member may read the configuration but not change it* |
| open PUT to a member | the same test, from the other end |
| let a viewer read it | *a viewer cannot even read it* |
| stop redacting `mail` on export | four backup tests |
| strip the marker instead of rewriting it | *the restored deployment carries the re-entry marker* |
| mark every empty mail config | *a workspace that never had one is not told to re-enter anything* |

`tests/mail.test.mjs` is new, ports **9800–9850** (§9), and split the same way
`ssrf.test.mjs` is: detection is pure and needs no sockets, the provider shapes
run against a capture server with the block list stood down, because a local
server is loopback and loopback is the first thing the guard refuses.

`tests/smoke.mjs` asserts `/lib/mail-send.js` is a **404** — the allow-list
check run backwards, beside `safe-fetch.js`. It is the file it would hurt most
to serve: a served copy is a standing invitation to move it to `js/` so a
browser could call it, which is exactly how a provider key ends up in
front-end code. Smoke **45 → 46** locally.

### No `CACHE_VERSION` bump, and no docs walk

**Checked rather than assumed.** Nothing under `js/`, `css/` or the app shell
changed — this is entirely `server.js`, `lib/`, `scripts/` and tests — so
`crmbuilder-v50` stands.

`docs/API.md` carries the two new routes and its count moves **52 → 54**,
verified with `grep -cE "^app\.(get|post|put|patch|delete)\(" server.js`
rather than incremented by hand (§29 records that number going stale twice).

**§27's six user-facing documents need nothing, and that is a checked
omission**: no client calls either route, so there is no capability a user has
gained. Padding them to look thorough is its own inaccuracy (§40, §41). They
get walked with the send UI, which is when a user can do something new.

### `privacy.html` is deliberately NOT updated

**Nothing calls the adapter, so no personal data leaves the deployment through
it.** A paragraph saying customer addresses go to Resend or Postmark would be
an intention written as a fact — §38 caught that exact shape before a commit
(backups *"are encrypted"* when they were not), §40 records it as the standing
rule, and §41 published the encryption sentence only once an encrypted artifact
had been downloaded and restored end to end.

The paragraph is **drafted** in `docs/CHASER-AND-TRACKERS.md` § *"The
`privacy.html` paragraph"*, with the four things in it that are load-bearing,
so it is written while the design is in front of somebody rather than
summarised at the end of the send commit. It moves onto the page when the first
send actually runs.

### What is still not built

The send route, the button, and the `privacy.html` paragraph. **Automated
escalation remains rejected** and the reason is unchanged: the scheduler, not
the email. §40 records the `/health` ping having never once fired the reminder
engine for weeks, invisibly to every test here — an acceptable foundation for a
message nobody loses money over, and not one for money collection.


---

## 53. The send, and the relay it would have been

The button §52 built the storage and the adapter for. `POST /api/org/mail/send`
takes an overdue record, sends the chaser through the workspace's own provider,
and reports what the provider said.

**§51's `mailto:` draft is untouched and stays the default.** It needs no
setup, works offline, works for every role, and is what a sole trader will use
for ever. The send is the second button on the same preview, demoted from
primary rather than replacing it — somebody who would rather send from their
own outbox keeps that option, and on a first send most will.

### The recipient is resolved by the SERVER, and that is the whole route

The obvious shape is `{ to, subject, text }` and it is an **open relay**: an
authenticated member of any workspace holding a key could send arbitrary text,
from a verified business domain, to any address on the internet. The key is the
tenant's and the reputation burned is theirs, which makes it their problem and
not ours — and shipping it would still be shipping a relay.

So the server looks the record up under the session's `wsId` and walks the same
two steps the client does: an `email` field on the record, then the first
relation leading to a record that carries one. **That bounds a send to the
addresses the workspace already holds**, which is the difference between a CRM
feature and a mailer.

**`to` still travels, and only to be COMPARED.** A mismatch is a **409** naming
both addresses, because it means the two copies of the record disagree — a
colleague edited it, or this replica is behind — and that is exactly the state
in which a demand for money must not go out. Silently preferring the server's
answer mails somebody the reader never saw; silently trusting the body reopens
the relay. Guarded by *"the recipient comes from the record, never from the
body"*, which asserts **nothing was sent** as well as the status.

**The client pushes before sending**, because the server reads its own copy.
`persist()` only schedules a debounced push (§39), so a record edited a moment
ago is not there yet and would earn a refusal that is correct and reads as a
bug. §43's delete confirmation had the same shape.

### What is NOT server-established, and the trade

`subject` and `text` come from the client, bounded at 200 and 4 000. A member
can therefore send arbitrary text — to an address already in their own CRM,
under their own business's name, which they could equally do from their own mail
client. The recipient is the half that matters and it is closed.

**The alternative was costed.** The server could compose the message: it has
`DateRules`, the currency, and the record. §39's digest preview is the
precedent, and returning the real string is the better product answer. It was
not done because **the `mailto:` half must work offline**, so the client
composer has to exist regardless — and then two composers must agree with
nothing checking that they do. If it is ever wanted, the thing that makes it
safe is a parity test, exactly as §39 pinned the digest count against the
filter's.

### `canSendMail` on the route, and one rung up

Owner and member. `canEditRecords` and `canDeleteRecords` live inside
`applyPush` because they gate **sync**; a send is a route call and never passes
through that seam, so it is checked on the endpoint (§52). A client-side
`canSendMail()` mirrors it and only avoids offering a button whose effect would
be refused a second later.

A record in another workspace answers **404, not 403** — the workspace is never
a parameter, so this is not a permission answer at all: the row genuinely is not
in the caller's workspace, and a different code would confirm it exists
somewhere (§5).

### A 403 from the provider is not a bad key, and saying so was a bug

**Found by a test asserting on the wording rather than on the code**, which is
the only thing that could have found it: the status was right on the broken
version.

`lib/mail-send.js` mapped 401 **and 403** to *"refused that key"*. Resend
answers 401 for a key it does not recognise and **403 for a key that is fine
but is not allowed to send from that domain** — the unverified sending domain,
which is the single most common way a first send fails. So an owner was told to
replace a perfectly good key while the real problem was a DNS record at their
provider; they would have replaced it, seen the same 403, and concluded the
feature was broken.

403 falls through to `provider` now and carries the service's own words, which
name the domain. Guarded by *"a provider's refusal reaches the caller in the
provider's own words"*; restoring the 403 fails it and its companion.

### The rate limit was wrong, and the tests are what said so

20/min, not the 10 it shipped with. §38 records the same shape for the Telegram
lookup: the first run failed with 429s, **which was the limiter working and the
number being wrong.** Proving a webhook works is done once; working down a
morning's overdue invoices is a person clicking through a list, and a bound
tuned for the first refuses the eleventh of the second. Raised on its own
merits rather than overridden in the test environment, so the suite still
exercises the production default.

### The screen

The Send button is **painted in after the preview exists**, never by
re-rendering — §38's Telegram rule. Making the whole preview wait on a round
trip to discover whether a second button exists would slow the path everybody
uses in order to serve the one some workspaces have, and the draft has to be
usable instantly and offline. A workspace with no key simply never grows it
(§36's rule 1).

The failure is left **on screen rather than toasted**: the provider's message
is what the reader has to act on, and a toast fades.

Settings gains a *Sending reminders by email* card — owner-only to write,
mirroring the webhook's. It renders the provider, the from-address and when a
send last worked as a **read view, never a filled-in input** (§36 rule 2), and
says plainly that the key has not been checked when `verified` is false.

**Two things were nearly invented, and §27's trap is why they were checked.**
`LUCIDE` has no `send` — `js/icons.js` is generated (§6) and an unknown name
falls back to a **box**, which renders plausibly and means nothing. The pair it
does carry describes the two buttons better anyway: `external-link` hands off to
another app, `mail` is the mail. And `.is-disabled` does not exist in
`css/style.css`; the juggling that wanted it was dropped rather than the class
added.

### The E2E was signed out, and one test was passing for the wrong reason

The first run failed with the Send button simply absent — which was
`offerToSend` **working**: an anonymous workspace has no server-side key, so
there is nothing that could send. The failure was the product being right about
the state the test was in.

The more useful half is the companion. *"a workspace with no provider still
gets the draft"* **passed** on that same signed-out build, and would have passed
on a version that ignored the mail state entirely — the button was absent for
the wrong reason. Both sign in now, and each mutation fails a different one:
never calling `offerToSend` fails the first, offering it regardless of
`configured` fails the second. That split is what shows they cover different
things rather than one twice.

The provider is intercepted rather than real (§20's precedent) — a browser test
cannot hold a key or reach Resend. `seedOverdueInvoice()` was **extracted**
from §51's journey rather than copied, because a second copy is what goes stale
in one direction while the other keeps passing (§29).

### `privacy.html` says it now, because it is now true

§52 deferred the paragraph with a condition: *"it moves onto the page when the
first send actually runs."* It can, so it has. The four load-bearing parts,
drafted in `docs/CHASER-AND-TRACKERS.md` before any of this was built:

- **Resend and Postmark are named.** §40 was caught twice by a roster closing
  with *"That is the complete list"* while omitting first GitHub and then
  Telegram — both found by looking at what the deployment does rather than at
  the code. This is a third recipient of personal data.
- **Scoped to the owner's choice**, like §40's treatment of the digest: their
  account, their contract, disclosed without being claimed as one of ours.
- **"Nothing is sent automatically"** is a property, not reassurance.
- **The `mailto:` fallback is in the same paragraph**, because it stays the
  behaviour for every workspace that never connects a key. Describing only the
  send would leave the majority reading about something that does not happen to
  them.

**`terms.html` moved too, and so did `TERMS_VERSION`.** It gained a sentence
saying that a digest destination or an email provider the tenant connects is
their own relationship rather than one of our sub-processors — which is the
controller/processor split, and belongs there rather than on the privacy page.
§41's rule is that the constant in `server.js` and the *Last updated* line are
one fact in two places and must move together, so both went to `2026-09-09`.
**Everybody is re-prompted**, which is the mechanism working: a change to the
terms is meant to be announced rather than slipped in.

### Not built, and still not

**~~No per-record send log.~~ Built — see §54**, and the paragraph that stood
here got the mechanism wrong, which is why it is corrected rather than deleted.
It said a `doc` sibling would lose to a stale copy through the **§26 field-merge
seam**. That is not what destroys one: `docShell()` is `{ ...stored,
...incoming }`, so a sibling is replaced **with no clock involved at all** — and
`envelope()` takes the incoming doc wholesale on the plain path besides. Two
mechanisms, neither of them the one named. The fix turned out to be *simpler*
than field clocks rather than harder, because an append-only log merges by
union. Deferring it was still right; the reasoning for deferring it was not.

**Automated escalation remains rejected**, unchanged: the scheduler, not the
email. §40 records the `/health` ping having never once fired the reminder
engine for weeks, invisibly to every test here — an acceptable foundation for a
message nobody loses money over, and not one for money collection.

### Blast radius

`js/app.js` and `js/cloud.js` are in `APP_SHELL` → `CACHE_VERSION`
**`crmbuilder-v51`**. `privacy.html` and `terms.html` are in
`STANDALONE_PAGES` and go straight to the network, never precached (§19) —
checked, not assumed. No new served file, so smoke stays **46 local / 51 live**,
and running it is what proves that (§9).

`docs/API.md` carries the route and its count moves **54 → 55**, counted with
`grep -cE "^app\.(get|post|put|patch|delete)\(" server.js`. Every one of §27's
documents needed something this time, because a user can now do something new —
which is the difference from §52, where the omission was the checked answer.

Counts: Node **467 → 480**, Playwright **121 → 123**, smoke **46** locally.


---

## 54. The chase log, and a doc sibling that nothing was protecting

"Has anyone already chased this?" — on a team, the question that decides
whether a customer gets one reminder or two demands for the same money on the
same afternoon. Every reminder sent or drafted is now recorded on the record.

### §53 deferred this for the wrong reason, and the right reason was worse

§53 said a per-record log needed a server-originated write that would land in
**§26's field-merge seam**, where a value carrying no `fieldsAt` entry loses to
a colleague's stale copy. That was reasoned about rather than read, and it is
not the mechanism. Reading `applyPush` first found **two** destroyers, neither
of them clocks:

| Path | What happens to a `doc` sibling |
|---|---|
| **merge** (`canMerge`) | `docShell()` is `{ ...stored, ...incoming }` — the pusher's copy replaces the stored one outright, with no clock anywhere in it |
| **plain** (no field clocks either side) | `envelope()` takes the incoming `doc` **wholesale** |

The second is the common case, not the exotic one: **a record nobody has
edited since creating it carries no `fieldsAt` at all** (§26), which is exactly
where a freshly imported invoice sits. So a device that synced yesterday, went
offline, and pushes today erases every chase logged in between — and it does
that whoever wrote them.

**The fix is simpler than field clocks, not harder.** A chase log is
**append-only**: entries are never edited and never removed, so there is
nothing for a clock to arbitrate. The correct merge for an append-only set is a
**union**, which cannot lose a write in either direction and needs no clocks.
That is why this was affordable where §26's field merge was genuinely hard, and
it is the part the deferral got backwards.

### Where the union sits, and why not inside mergeFields

**Hoisted above both branches**, before either is chosen. Putting it in
`mergeFields` — the obvious home, since that is where merging lives — covers
the merge path and leaves the plain path still replacing the doc wholesale.
Both branches read `item` from one place, so one union covers both.

**`chaseGrew` keeps the row out of `won`.** A push must not be echoed back what
it sent (§10), but a row whose log grew underneath it is no longer what they
sent — withholding it leaves the pusher's screen saying nobody has chased this.
Exactly the rule `mergeFields` already carries for a merged row.

**The `prior &&` guard was wrong and the tests caught it.** The first version
only unioned when there was something to union against, so a record's **first**
push skipped it — and with it the coercion and the cap, which is where they
matter most: a caller-chosen id, twenty-five entries and `by` as a Mongo
operator all went in untouched on a row nobody had seen before. Two tests
failed on it; without them it would still be there.

### Two writers, and they claim different things

| | Written by | Because |
|---|---|---|
| `via: 'sent'` | the **server**, on a successful `/api/org/mail/send` | only the server watched the provider accept it |
| `via: 'drafted'` | the **client**, on the `mailto:` handoff | nothing on the server ever sees a mailto open |

**A draft is never recorded as a send**, and an unrecognised `via` from a
client falls to `drafted` rather than being rejected — the weaker of the two
claims, because nothing may be upgraded into "this was sent" on a browser's
say-so. §52's `unconfirmed`, in a new place. The wording on screen keeps them
apart too: *a reminder was sent* against *a reminder was drafted*.

**A refused send logs nothing.** Otherwise the log says a reminder went out
when the provider refused it, and the next person leaves an unpaid invoice
alone on the strength of it. Guarded by a test that moves the write above the
`502` and fails.

**The server bumps `updatedAt`, not only `serverAt`.** `mergeChanges` on the
client skips any incoming row whose clock is not newer than its local one, so a
row that moved only its `serverAt` would reach every device and be ignored by
all of them — §26's stamp trap, arrived at from the server's side. Asserted,
because the row still *arrives* either way and only a colleague would notice.

**It re-reads the record after the send** rather than writing back the envelope
fetched before it: that one is seconds old across a network round trip and
would clobber a colleague's edit made in between.

### Traps and decisions

- **A sibling of `data`, never a key inside it.** `data` is keyed by the user's
  own field keys, so a synthetic one there would appear in every CSV export, be
  searched as a field, and collide with a field somebody named `chases` —
  §22's ghost data, invited in deliberately.
- **Coerced key by key, never spread.** This is a client-supplied array of
  objects landing on a stored document, which is the richest such payload here.
  §30's Phase 2 rule about a JSON body; `sanitiseContext`'s whitelist (§18) at
  a second site.
- **Capped at 20.** Unbounded growth on a row that syncs, against a 512 MB
  shared tier (§17, §33). A truncated entry re-offered by a stale device is
  dropped again and converges in one round.
- **A record nobody has chased grows no key at all**, so the overwhelming
  majority of rows cost nothing — §26's rule for `fieldsAt`, and it has its own
  test because "costs nothing" is the kind of claim that quietly stops holding.
- **`logChase` MUTATES the record the UI is holding.** The modal, the preview
  and the rendered row are all the same object; writing a copy would leave every
  one of them saying "Chase by email" on a record just chased. Ugly, and the
  alternative is a label that lies.
- **The draft write is not awaited.** The anchor's own navigation is what opens
  the mail client, and making it wait on an IndexedDB write — to record
  something we are not even certain will be sent — would put a storage failure
  between a person and their own email app.
- **A viewer's draft is not logged, deliberately.** A viewer may draft (§51 —
  every role) and may not write a record, so attempting it pushes a row
  `applyPush` refuses and the client reverts it and toasts *"your change was
  reverted"* at somebody who pressed **Open in my email app**. A rule arriving
  as a bug report (§14). Said plainly in the user docs.
- **Chasing counts as touching the record**, so §44's retention review and
  §50's dormancy report stop counting it. Correct rather than incidental — a
  record you chased last week is not one nothing has touched — but it is a
  consequence, so it is written down.

### The subject-access search could not see it, and that is the find

§43's whole premise is that *"we hold nothing about you"* is the one answer a
subject access request must never get wrong. The search walks `record.data` —
and the log is **not in `record.data`**. So a customer whose only trace in a
workspace was having been chased for money would have been answered with
silence, **by the tool built to stop exactly that**.

Found by walking the feature that added the field, not by re-reading
`js/dsar.js`, which read perfectly correctly the whole time. That is §46's
shape: a contract moved underneath a line that still says something true.

`js/dsar.js` searches `to` and `byName` now — a colleague can make a request
too, and their name is only in here — reports the hit as *Reminder history*,
and carries the log in the downloaded bundle. A bundle that finds a match and
then omits the thing that matched is worse than not searching for it.

### Verification

Eleven mutations, each failing the test that names it (§9):

| Mutation | Fails |
|---|---|
| union only inside `mergeFields` | four tests, including *a stale device pushing a record does not erase a chase logged since* |
| last-write-wins instead of a union | three, including *two devices each logging a chase keep both* |
| `won` set even when the log grew | *a pusher receives back a record whose log grew under it* |
| no cap | *the log is bounded, keeping the most recent* |
| `via` trusted from the client | *a client cannot invent a shape, and cannot upgrade a draft into a send* |
| the send does not log | *a successful send is logged on the record, by the server* |
| the log written before the provider answers | *a REFUSED send logs nothing* |
| `updatedAt` not bumped on the server write | *a successful send is logged…* |
| the draft is not logged | the draft journey |
| a draft claims it was sent | the same journey, on the wording |
| the role gate removed | *a view-only account can still draft a chase…* |
| the DSAR walk skips the log | *somebody who only appears in a reminder is still found* |

**And the viewer journey passed against its own mutation three times.** It
asserted the toast and the stored count, and **both read identically on a build
with the role gate removed** — `applyPush` refuses the row and
`applyRejections` restores the server's copy, so the end state is clean either
way, and the toast is a paint race on top of that. It was not diagnosed by
reading: the mutation was applied, `grep` confirmed the line was gone from the
file, and the test still passed. A probe printing the state at each step is
what showed the toast arriving *after* the assertion, and that the earlier
2-second wait — which I had removed as noise — was the thing letting the
**debounced** push fire at all (§39).

It asserts on **the push bodies** now: a correct build never writes, so the row
never goes dirty and `"chases"` never appears in a request at all. Timing-proof,
and it names the actual rule rather than a symptom of it. §9's *"a test that
passes on the bug is worthless"*, earned the hard way.

### One failure in two of four full runs, recorded rather than dismissed

Two full runs were 125/125; two had one failure each — *signing out hides the
workspace* and *an owner invites, and the colleague joins* — **different tests,
both multi-context team journeys, both passing in isolation** (8.1s and 12.8s
against 25s budgets).

What is known, and it is deliberately not inflated into a diagnosis:

- **`data/e2e` does not accumulate across runs.** 12K before a run, 560K after
  — `playwright.config.js` clears it (§32), so that mechanism is not this.
- **The suite went 5.6m → 5.7–6.2m**, and the three journeys added here
  (two of them multi-context) account for roughly that.
- **Nothing in this change sits on the sync path measurably.** `unionChases`
  on a record with no log is two maps over empty arrays.
- **23 `newContext()` calls against 23 `close()` calls** — but every one of
  them is skipped on a failure, which is pre-existing and is a real
  within-a-run leak once something fails.

**The budgets are the lever and widening them is the wrong move** (§42): they
are what makes "the join did not happen" distinguishable from "the join was
slow". If it recurs, start from the failing page's console rather than from the
timeout — and note that both failures so far were on the *owner's* page, not
the colleague's, which the snapshot is what says.

### Blast radius

`js/app.js`, `js/cloud.js` and `js/dsar.js` are in `APP_SHELL`, so
`CACHE_VERSION` → **`crmbuilder-v52`**. No new served file, so smoke stays
**46 local / 51 live** — running it is what proves that (§9).

**`docs/API.md` gains a section and no route.** The count stays 55 and the file
*looked* current, which is §46's exact trap — what moved is a **wire shape**:
`doc.chases` is the only part of a record that merges by union, and a caller's
push comes back re-sorted, coerced and possibly capped. A client reading the
old page would have had no way to know any of that.

`privacy.html` and `terms.html` need **nothing**, checked rather than skipped:
the log holds a customer's address that was already on the record and a
colleague's name already on the Team screen, it goes nowhere new, and it is
covered by "your CRM contents are stored on our server".

Counts: Node **480 → 493**, Playwright **123 → 125**, smoke **46** locally.


---

## 55. A write the server could not make took the whole deployment with it

Reported from a Windows machine: CI green, the Node half of `npm test` green
(493, one skipped — §4's SIGTERM note), and the Playwright run dying at test 33
with the **web server gone**, taking tests 33–69 with it.

```
[WebServer] Error: EPERM: operation not permitted, rename
  'data\e2e\store.json.20680.tmp' -> 'data\e2e\store.json'
    at FileStore.save (server.js:240)
    at FileStore.putItems (server.js:342)
    at applyPush (server.js:1791)
  Node.js v24.18.1        <- the process, gone
```

**Two faults, and only the second is about Windows.** Reading the stack as one
bug produces a Windows fix and leaves a deployment that dies on a full disk.

### Fault 1: Express 4 does not catch a rejected promise

An `async` route handler that rejects does not reach the error handler — Express
4 never looks at the return value, so it becomes an **unhandled rejection**, and
Node ≥ 15 exits on those by default. **48 of the 55 routes here are `async`**,
`requireAuth` is async too, and nothing wrapped any of them.

So this was never about renaming. A Mongo timeout, a full disk, or any `await`
that throws inside a handler kills the deployment the same way — and §30's
Phase 4 *"error handler that cannot leak"* only ever covered **synchronous**
throws, which is why the audit read as complete.

**Reproduced on Linux**, which is what says it is not a platform artifact
(§9's triage rule, coming out the other way for once): a probe that put a
non-empty directory where `store.json` goes gave
`PUSH RESULT: fetch failed` — the connection dying mid-flight, not a status —
then `SERVER EXITED: 1`, `STILL ALIVE: DEAD`.

The fix is at the **router**, not on 48 handlers:

```js
for (const verb of ['get', 'post', 'put', 'patch', 'delete', 'all', 'use']) {
  const original = app[verb].bind(app);
  app[verb] = (...args) => original(...args.map(wrapAsync));
}
```

- **Arity 4 is left alone.** That is how Express recognises an error handler,
  and wrapping one hides the handler this exists to reach.
- **`.catch(next)`, never `await`.** The handler owns the response; awaiting it
  would add a microtask to every successful request and change ordering on the
  one path that must not move.
- **A router patch rather than a wrapper at each call site**, because the next
  route somebody adds is `async` too and would not be wrapped. This is §31's
  argument for putting the guard in `DB.put` rather than at the writes.

`express-async-errors` does this and is a fifth production dependency for
twelve lines (§30: four dependencies is an asset on a shared free tier).
Express 5 does it natively and is not a change to make while chasing a crash.

### Fault 2: the rename is transient on Windows

rename(2) there is `MoveFileEx`, which fails **EPERM/EACCES/EBUSY** while
anything at all holds the destination — Defender scanning the file just
written, Search indexing it, an editor with it open. It clears in
milliseconds, and it is common enough that an ordinary E2E run hit it.

`save()` retries, bounded at ten attempts, **errno-scoped**: ENOSPC,
ENOTEMPTY, EISDIR and EROFS describe states that will not improve, so
retrying them turns a clear failure into a slow one. They throw at once, and
fault 1's fix is what turns that into a 500.

- **A synchronous sleep** (`Atomics.wait`), because `save()` is synchronous and
  every caller depends on that. Making it async means auditing every write path
  for an interleaving that cannot happen today. It runs only on the failure
  branch and for at most ~180ms.
- **The temp file is removed when it gives up.** Otherwise one stale
  `store.json.<pid>.tmp` accumulates per failure, in the directory holding
  every customer's records.

### The test, and how it is made to fail here

`tests/resilience.test.mjs`, ports 9900–9950 (§9). The hard part is making a
write impossible **on a machine that is not Windows**, and the honest answer is
two mechanisms plus a skip:

| | Stops | Set by |
|---|---|---|
| `chmod(dir, 0o500)` | an ordinary user — which is CI | anyone |
| `chattr +i <file>` | **root**, which is what this container runs as | root |

Neither covers both, so it tries one, tries the other, and **verifies by
attempting a real replace** rather than trusting the call — a setup that
silently did nothing gives a test that passes and proves nothing. If neither
blocks anything it **skips with the reason said out loud**, per §4's SIGTERM
precedent.

**`chattr +i` yields EPERM on rename even as root** — the same errno Windows
raises, which is what makes the retry deterministically testable here rather
than only on the reporter's machine.

**The transient test is proved by TIMING, not by status.** The block is lifted
120ms after the request goes out, so a save that succeeded on its first attempt
would have answered before then; arriving afterwards is what says something was
actually retried.

**My first probe reported no bug, and the probe was wrong.** `chmod(dir, 0o500)`
is bypassed by root, so the push succeeded and the server survived — which
would have read as "the report does not reproduce". Replaced with a non-empty
directory in the target's place, which nothing bypasses.

### Checked against the broken state, and the split is the useful part

| Mutation | Fails |
|---|---|
| drop the router patch | **4 of 5**, the first on `fetch failed` rather than a status — the reported symptom |
| drop the retry loop | **2 of 5**: *a transient block is waited out* (200 against 500) and *a failed save leaves no temp file behind*, since the cleanup lives on that branch |

Neither mutation fails the other's tests, which is what shows the two changes
cover different faults rather than one twice.

### Blast radius

`server.js` only — no client file, no served file, no route, no wire change.
`CACHE_VERSION` stays `crmbuilder-v52` and smoke stays **46 local / 51 live**;
running them is what proves that (§9).

**The router patch is shared surface in the strongest sense** — it wraps every
handler in the application, so it had a full run before it was trusted, per
§9's blast-radius rule. `app.use` is patched too, which means the JSON body
parsers, the rate limiter and the static middleware all pass through
`wrapAsync`; they are synchronous and arity 3, so they are returned unchanged,
and the full suite is what says so rather than the reasoning.

**`docs/API.md` gains a line and no route.** §46's trap exactly: the count is
still right and the file looks current, while a **status code** moved — a write
the server cannot make is now a 500 rather than a dropped connection, and that
is the difference between a client retrying and a client seeing the deployment
disappear.

Counts: Node **493 → 498**, Playwright **125**, smoke **46** locally.

---

### Then the same run found two more, and only one was a test problem

With the crash fixed, the reporter's next full run was **123 passed, 2 failed**
— the server survived, so these were always there and the crash was hiding
them. Neither is a Windows fault; both are things this container cannot see.

#### A save that said "saved" before anything left the device

*the reminder count is the number the due-date filter shows* failed with
`Expected "Asia/Calcutta", received "UTC"`. The zone name was a red herring
twice over — `resolveZone` accepts the legacy alias, and the picker offered
it (that assertion passed). The setting had simply not reached the server.

**Measured rather than reasoned**, with a probe that polled `/api/org/reminders`
after the save:

```
SYNCED +34ms   server=UTC     <- the only thing the test waits on
       +1379ms server=UTC
       +1808ms server=America/New_York
```

`saveSettings()` calls `persist()`, which only **schedules** a 1500ms debounced
push. The `.sync-status` chip therefore never left `synced`, so the wait was
satisfied by a state that predated the click, and every step after it was
racing the debounce.

**And the digest card is the product half.** §39 already made the *digest*
button `await Cloud.sync()` and re-render, with a comment saying the preview is
server-computed. The **workspace** button sets `SETTINGS.timezone` — which is
exactly what that card gates on and displays, in two places — and did neither.
So changing the zone left the card on the same screen saying *"Waiting until
09:00 in UTC"*: §33's adjacent-and-wrong number, in the place §39's own comment
was written to prevent it.

The save now pushes before it says "saved", mirroring its sibling. It re-renders
**only when the zone moved**: a full `renderSettings()` wipes the Telegram token
field (§38), the one thing on that screen an owner cannot recover, so it is not
spent on a save that cannot have made the card stale — the name and currency do
not reach the digest, whose message carries counts and never money (§39).

#### The assertion had been vacuous everywhere it had ever run

This is the finding worth keeping. `expect(reminders.zone).toBe(browserZone)`
aligns the two clocks by setting the workspace zone to the browser's own — and
**in a UTC container `browserZone` is `UTC`, which is also the server's default
for a workspace that never chose one.** So it passed whether or not the setting
had ever left the device.

Demonstrated rather than argued, in both directions:

| | Result |
|---|---|
| bug present, zone pinned to `America/New_York` | **fails**, `Expected "America/New_York", received "UTC"` — the reporter's failure, reproduced here |
| bug present, no zone pin (today's CI, this container) | **passes** |

CI has never once exercised it. The one machine with a real time zone is the
only thing that ever could, which is why a bug on the sync path surfaced as a
platform report. Now pinned, the same way §42 and §45 pin `Europe/London` and
for the same sentence: *the container and CI are UTC, so a date test that does
not name a zone passes on the bug.*

#### A toast asserted with `.last()`, on an ordering nothing controls

*work typed while a workspace is paused* failed with `.toast` `.last()` reading
`Added` for the full 20s. The read-only notice is said **exactly once** — §24
latches it, or the debounced push would fire it on every keystroke — and its
position relative to the two `Added` toasts is ordered by nothing at all. The
debounce is 1500ms against 1100ms of wait plus however long the second record's
UI steps take, so on a machine with less than ~400ms of slack the **first**
record's push lands *between* the two, `.last()` is `Added` for ever, and the
latch means it never comes again.

**Reproduced here by widening that wait to 1900ms**, which fails identically to
the report — so the slow machine is the cause and not the culprit.

A `hasText` locator does not fix it either: a toast fades and leaves the DOM, so
one that fired fifteen seconds ago is not there to find. The test records every
toast through a `MutationObserver` as they arrive and asserts the list contains
the reason — §54's answer to the same class of problem, where asserting on the
push bodies replaced a toast that was a paint race. The chip is asserted too, as
the durable half: a toast fades, `data-status="error"` stays.

#### Checked against the broken state

| Mutation | Fails |
|---|---|
| drop the `await Cloud.sync()` from the workspace save | *the workspace zone did not save* — the reported failure |
| that, **and** drop the zone pin | **nothing** — which is the vacuity, shown rather than claimed |
| widen the inter-record wait past the debounce | nothing now; failed identically to the report before |
| drop `readOnlyReason` from the toast | the recorded-toast assertion, by name |

**§27's walk needs nothing, and that is checked rather than skipped.** No
capability moved — the fix makes an existing one behave the way the documents
already describe it. `USER-GUIDE.md` and `manual.html` describe *Not before* as
"read in the workspace's time zone", which was true before and is true now;
`docs/API.md` sees no route and no wire shape move. Padding them to look
thorough is its own inaccuracy (§40, §41).

`js/app.js` is in `APP_SHELL`, so `CACHE_VERSION` → **`crmbuilder-v53`**. No new
served file and no route, so smoke stays **46 local / 51 live**. Full run,
because `sw.js` and `CACHE_VERSION` are shared surface (§9): Node **498**,
Playwright **125**, smoke **46** locally.

---

### And the green run said one more thing, in a number

The reporter's next run was clean — Node 498, Playwright 125/125 — and carried
`skipped 5` where §2 claimed one. Not noise: **four of the five are this
section's own tests.**

| Skips | Which |
|---|---|
| 1 | `signup.test.mjs`, `process.platform === 'win32'` — §4's SIGTERM note |
| 4 | `resilience.test.mjs` — nothing there could make a write fail |

So on **the one platform fault 2 was written for**, every test that exercises
the rename retry stepped aside. `chmod` on a directory does not stop a file
being created inside it on Windows, and `chattr` does not exist, so
`blockStoreWrites()` returned null and the suite reported four tidy skips. That
is §17's no-op-that-reports-success in a smaller costume — the skip is honest
about *itself* and says nothing about the retry, which shipped unverified where
it matters.

**A third mechanism, and it is inert exactly where the other two work.**
`fs.chmod(file, 0o444)` sets `FILE_ATTRIBUTE_READONLY`, and `MoveFileEx` with
`REPLACE_EXISTING` onto a read-only destination fails `ACCESS_DENIED`. On POSIX
it does nothing at all — measured, not assumed: rename keys on the
**directory's** permissions, not the destination file's, so a 0444 store is
still replaceable here. That asymmetry is the point.

**It cannot make anything worse, by construction.** Every mechanism is verified
by attempting a real replace before it is accepted, so on Linux this branch is
tried, found not to block, and skipped over — `chattr` still wins, and the file
runs 5/5 unchanged. On Windows it either blocks, and four skips become four
real assertions, or it does not, and they skip exactly as they do today.

**Unverified from here, and that is the honest state** (§8): this container is
Linux, so the branch that matters can only be exercised by the reporter. The
skip message names all three mechanisms now rather than saying *"needs chattr
or a non-root user"*, which was wrong on the platform doing the skipping.

**§2's count is not pinned any more.** "One Node test skips itself" was true
when written and went stale the moment a second conditional skip existed — a
number in a second place (§29), in this file's own status section. It now says
that some skip and say why, and points here.

`after` clears the read-only attribute alongside the other two undos: a file
left read-only is one Windows refuses to delete, so the temp directory would
survive every run and accumulate.


---

## 56. The prebuilt modules were reachable once, on your first day

Reported as three questions, and the middle one was a product bug: *"I had
selected a few modules during initial setup, now in the dashboard I can create
new modules but I can't access the built in modules which I did not select. I
was looking for how to use the renewal tracker when I realized I can't access
that module."*

True, and worse than it sounds. **Every create affordance a person would reach
for opened a BLANK builder**:

| Entrance | Opened |
|---|---|
| sidebar `+` | `openBuilder(null)` |
| dashboard *Add module* tile | `openBuilder(null)` |
| onboarding *build your own* | `openBuilder(null)` |
| **Settings → App → "Add module from template"** | the picker — the only path |

So the eight templates existed, were fully working, and lived behind one button
filed in a card headed **App**, between *Install on this device* and *Replay
the tour* — a card about the device and the demo, not about the shape of the
workspace. Nothing anywhere else said they were still available. §49 shipped
Renewals and wrote it into eight documents; the person who wanted it could not
get to it.

**The picker is the front door now**, with **Empty module** as its first entry,
so the old behaviour is one click rather than gone. Onboarding's own custom
button stays direct — it is already on a screen full of templates.

**Templates already in the workspace are MARKED, not hidden or disabled.** A
second Contacts for a different purpose is a legitimate thing to want, and the
marker answers the other half of what was actually being asked: *which of these
did I take?* Matched on **name**, because that is what the reader is comparing
against their own sidebar — a template's key is never carried onto the module
it creates.

### The console guard caught what twelve assertions were not watching for

The blank entry carries `class="template-line"` like every other row, so
`$$('.template-line')` bound the template handler to it **as well as** mine.
Clicking it ran both: `TEMPLATES[Number(undefined)]` → `TEMPLATES[NaN]` →
`undefined.name`.

**Twelve E2E tests failed, every one of them on
`Console errors during test: TypeError: Cannot read properties of undefined`**
— not on an assertion, because no test was looking at that. §47 records
`expectedConsoleErrors` catching two unrelated live defects for exactly this
reason, and it has now done it a third time. The selector is
`.template-line[data-template]`.

### Blast radius, which is the part that needed the full run

`#add-module-btn` is clicked by **six** E2E tests, and rewiring it put a modal
in front of every one — §9's named pattern, and the reason a shared entry point
is not a small change. Each gained one `[data-blank]` click.

**A trap in making that edit, worth recording because it is silent.** The
clicks sit at two indent levels, so a two-pass string replace was used — and
the 4-space pattern is a **substring of the 6-space line**, so the second pass
matched inside what the first had already rewritten and double-inserted at one
site. `grep -c` said 7 where 6 sites exist, which is the only reason it was
seen. Anchor on the whole line, or do it in one pass.

Guarded by *"a prebuilt module skipped at onboarding can still be added
later"*, which onboards with **Contacts only** so Renewals is genuinely one the
user declined — that is what makes it the reported case rather than a tour of
the picker. Checked against the broken state per §9: restoring
`() => openBuilder(null)` on the sidebar `+` fails it, waiting for a
`.template-line` that never appears.

`toContainText`, not `toHaveText`, on the module heading: it carries the
module's icon, and the exact form fails on whitespace for a reason that has
nothing to do with the fix.

### The tour's step 2, and an assertion that read one frame

Reported in the same message: *"step 2 card covers its own highlight"*, one
failure in an otherwise clean 125.

**Not §35's bug and not §35's short-viewport case** — the E2E viewport is
1440×900, which is the viewport §35 measured 0-overlap-in-20 at. The mechanism
is a window §35's own fix leaves open:

- `pop.classList.remove('is-loading')` — the test's readiness gate — runs
  **before** `position()`;
- steps 2 and 3 force their own screen in a `before` hook whose re-render is
  not awaited (§4, §7), so the board can grow under a card correctly placed for
  the shorter one;
- §35's `ResizeObserver` repositions it, but a ResizeObserver callback is
  delivered on a **later frame**.

Between the board growing and the observer firing, `coversTarget` is true. The
test read the geometry **once**, so it could land inside that window — and a
slower machine widens it, which is why this surfaced there and never here.

**Polled now, because it is a steady-state claim and one read is not.** This
does not soften §35: that defect was a card placed over the ring and *left*
there, 20 runs out of 20, and a placement that never settles still fails.

**Proven, and the first mutation was the wrong one.** Removing
`watchGeometry()` — the obvious choice — **passed**, because on this machine
the re-render lands before `position()` and the observer is idle: the mutation
does not reproduce the reporter's condition here, so it proves nothing either
way. What proves it is forcing a persistent overlap (place the card on the
ring's top-left and return): the polled assertion fails by name, at step 4.
Recorded because the first mutation looked sufficient and was not — §50 hit the
same shape.

### The docs questions, answered by reading rather than recalling

All three features were already documented; only one thing was genuinely
missing.

| | `guide.html` | `USER-GUIDE.md` |
|---|---|---|
| Renewals | ✅ | § *Tracking things that expire* |
| Dormancy | ✅ (*"who nobody has contacted"*) | § *The other question: who nobody has contacted* |
| Chaser | ✅ | § *Chasing something that is overdue* |
| Chase log | ✅ | § 9 |
| **BYOK setup** | one line | **one paragraph, no steps** |

**My first grep said dormancy was missing from `guide.html` and it was not** —
the page says *"who nobody has contacted"* and I had searched for *dormant*.
Worth recording: a grep that comes back empty is evidence about the pattern
before it is evidence about the file (§46 records two of those coming back
empty for wording reasons).

**The BYOK gap was real.** The section covered the domain-verification
requirement, the provider being detected rather than picked, the roles and the
key never being read back — everything about *how it behaves* — and nothing
about how to get one. It now carries five numbered steps, with **verify your
sending domain first** called out as the step that takes real effort and the
single most common reason a first send fails (§53's 403 finding, in the place
an owner meets it), and *send one to yourself* as the last step.

**No provider button labels are quoted**, deliberately: this session cannot
reach either service (§8), so the steps describe what is needed rather than
naming UI that would be unverifiable here and stale in a year.

### Docs walked (§27)

A user can now do something new — reach a template they skipped — so the walk
was real rather than a checked omission.

| | Needed |
|---|---|
| `guide.html` | one clause: the prebuilt ones stay available |
| `USER-GUIDE.md`, `docs/manual.html` | the picker as the entrance, that the prebuilt ones are always available, and that a template module is an ordinary module afterwards — plus the BYOK steps |
| `README.md`, `product-tour.html`, `ONBOARDING.md`, `DEMO-SCRIPT.md`, `BETA.md` | **nothing** — they describe *which* modules exist and what they are for, which has not changed. Padding them to look thorough is its own inaccuracy (§40, §41) |
| `docs/API.md` | nothing — client-only, no route, no wire change |

`js/app.js` is in `APP_SHELL`, so `CACHE_VERSION` → **`crmbuilder-v54`**. No new
served file, so smoke stays **46 local / 51 live**. Full run, because a shared
entry point moved: Node **498**, Playwright **125 → 126**, smoke **46** locally.
