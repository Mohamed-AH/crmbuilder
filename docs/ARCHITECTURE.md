# Multi-Tenancy & Scaling Options

How many customers the current build supports, what stops it going further, and
the routes to a pooled tier and a dedicated tier from one codebase.

Every number below is measured against the real demo workspace, not estimated.

---

## 1. Where we are today

**One tenant = one organisation; one workspace = one account.** Every user
belongs to exactly one org, and a signup creates one and owns it:

```
orgs     { id, name, createdAt, createdBy }
users    { id, email, name, orgId, role, disabled, createdAt, lastActiveAt }
modules  { userId, orgId, id, updatedAt, serverAt, deletedAt, deletedOn, doc }
records  { userId, orgId, id, updatedAt, serverAt, deletedAt, deletedOn, doc }
data     { userId, orgId, settings, settingsUpdatedAt, settingsServerAt,
           moduleCount, recordCount, perRecord, updatedAt }
events   { type, userId, orgId, day, at }
```

Roles are `platformAdmin` (operates the deployment, sees across orgs), `owner`
(administers their own org only) and `member`.

**Workspaces are still per-account, deliberately.** An org groups people for
administration; it does not yet give them a shared workspace. That is a
product decision now rather than a safety one — per-record sync removed the
data-loss reason for the split (§2.2).

### Measured sizes

The demo workspace — 6 modules, 107 records — serialises to **31.4 KB**, which
is **~269 bytes per record**.

| Workspace size | Document size | How many fit in Atlas M0 (512 MB) |
|---|---|---|
| 200 records | 0.05 MB | ~9,900 |
| 1,000 records | 0.26 MB | ~1,990 |
| 5,000 records | 1.28 MB | ~400 |
| 20,000 records | 5.14 MB | ~99 |

**A single workspace hits MongoDB's 16 MB document ceiling at roughly 62,000
records.** Past that, saves fail outright — not gracefully.

---

## 2. Three things limit growth

### 2.1 ✅ Admin scoping — resolved

This previously read: *`requireAdmin` checks one thing, so any admin calling
`GET /api/admin/users` receives every account on the deployment.* That was the
blocker on onboarding customers who administer themselves.

It is now two separate middlewares. `requireOrgAdmin` pins the caller to
`req.scopeOrgId`, taken from the session and never from a parameter;
`requirePlatformAdmin` is a distinct gate for cross-org access. Fetching an
account outside the caller's org returns **404, not 403**, so the response does
not confirm that the account exists. An org owner cannot grant `platformAdmin`.

Eight tests in `tests/api.test.mjs` assert the attack rather than the happy
path, plus two end-to-end tests covering the same boundary through the UI.

### 2.2 ✅ Sync writes the entire workspace on every change — resolved

**Resolved.** Sync is now per record. Everything below describes what the
whole-snapshot model cost and is kept because it is the reasoning that
justified replacing it; skip to *What replaced it* for the current design.

`PUT /api/data` replaced the whole document. Editing one phone number on a
5,000-record workspace uploaded 1.28 MB. This was the real ceiling long before
storage was:

- Bandwidth and Atlas write throughput scale with *workspace size*, not edit size
- Two devices editing concurrently resolve last-write-wins across the whole
  workspace, so one can silently discard the other's changes
- It rules out real-time collaboration entirely

**The practical ceiling is far below the 16 MB one.** Degradation starts around
a few thousand records, and it is a write-latency problem before it is a storage
problem:

| Workspace | Uploaded on every single edit | On a poor mobile connection (~1 Mbps up) |
|---|---|---|
| 500 records | 135 KB | ~1s — fine |
| 5,000 records | 1.28 MB | ~10s — hits the 45s timeout under congestion |
| 20,000 records | 5.14 MB | ~40s — routinely times out; edits silently queue |

Once writes start timing out, `pushNow()` marks the workspace dirty and retries,
so nothing is lost — but the user is editing against a workspace that has not
been persisted, and last-write-wins across a whole document means a concurrent
edit from another device can discard it entirely.

#### What replaced it

Every module and record is its own row, in `modules` and `records`, carrying
two clocks:

- **`updatedAt`** — the client's edit time, and the row's clock. It decides
  which whole row wins when neither side carries field clocks, and it drives
  which rows a device offers on its next push.
- **`fieldsAt`** — a clock per field, inside a record's `doc`, advanced only
  for keys whose value actually moved. The server merges key by key on these,
  so two people editing *different fields of the same record* both keep their
  edit. A key with no entry counts as clock zero — never the row's clock, or an
  untouched stale value would beat somebody's real edit. A record with no map
  at all resolves whole-row exactly as it did before.
- **`serverAt`** — a monotonic stamp assigned by the server. The delta cursor
  walks this, never `updatedAt`, so a device with a skewed clock cannot push
  the cursor past changes other devices have not seen. It ticks forward on a
  collision: two rows written in the same millisecond with a cursor landing
  between them would otherwise strand the second one forever.

One round trip is one `POST /api/sync`: everything this device changed since
its last accepted push, and in the response everything anyone changed since
its cursor, minus the rows it just pushed and won. `GET /api/sync?since=N`
pulls without pushing.

What an edit now costs:

| Workspace | Uploaded on one edit, before | After |
|---|---|---|
| 500 records | 135 KB | ~270 bytes |
| 5,000 records | 1.28 MB | ~270 bytes |
| 20,000 records | 5.14 MB | ~270 bytes |

**Deletes are tombstones, not removals.** A row that simply vanishes is
indistinguishable from one a device has never seen, so the next push would
hand it straight back. A deleted row keeps its id and clocks, drops its
payload, and is filtered out of every read. Tombstones expire after
`TOMBSTONE_RETENTION_DAYS` (180) — which is also the longest a device may sit
offline and still be told about a delete.

**Settings stay a single small document.** Last-write-wins is honest at that
granularity: there is no partial edit worth merging in a currency choice.

`PUT`/`GET /api/data` still work, reading and writing the same rows, so a
client running cached older JS keeps syncing through a deploy; the client
falls back to them if `/api/sync` 404s. `migrateToPerRecord()` splits existing
snapshots on boot, preserves ids exactly, and is idempotent.

**Shared team workspaces are now unblocked** — this was the gate. They remain
unbuilt: an org still groups people for administration only, and each account
still has its own workspace. What changed is that building them no longer
means shipping silent data loss along with them.

### 2.3 `events` grows without bound

`events` has an index on `at` but no TTL. Every login, signup and sync appends a
row forever. At 100 active users syncing 50×/day that is ~1.8M documents a year,
quietly consuming the same 512 MB the customer data needs.

✅ **Resolved.** Events expire after 90 days (`EVENT_RETENTION_DAYS`). The
dashboard only reads 30 days back, so the retention costs nothing.

---

## 3. How many customers can we onboard right now?

Assuming small businesses averaging ~500 records each (~135 KB):

| Constraint | Ceiling | Notes |
|---|---|---|
| Atlas M0 storage (512 MB) | **~3,800 workspaces** | Before the `events` TTL fix; less after a year of unbounded events |
| Atlas M0 connections (500) | Not binding | One Node instance pools ~5–10 |
| Render free RAM (512 MB) | Not binding | Stateless; memory is per-request |
| **Render free instance-hours (750/mo)** | **One always-on service** | The real constraint — a second free service cannot also run 24/7 |
| Render free spin-down (15 min idle) | Cold starts | Mitigated in the client, not eliminated |
| Practical support load | **~20–50 paying customers** | One shared deployment, you as sole admin |

**Honest answer: the infrastructure would hold several hundred small workspaces,
and with org scoping shipped the binding limit is now your own support capacity
rather than anything technical.**

Where it breaks down sooner: any single customer exceeding ~5,000 records makes
every save slow, and ~62,000 records makes saves fail.

---

## 4. Can multiple businesses share the existing database?

**Technically yes, today** — data is keyed by `userId` and the API enforces that
boundary on every read and write. Two businesses' records cannot leak into each
other through the normal app surface.

**Safely with customer admins too**, now that §2.1 is resolved — an org owner
sees only their own org. What is still missing is a **shared workspace**: two
colleagues in one org each have their own records. That needs per-record sync
first (§2.2).

---

## 5. The options

### Option A — Stay as-is: one workspace per person, shared DB

Change nothing. Each customer is one account. You remain the only admin.

- **Good for:** solo operators, freelancers, single-owner businesses
- **Capacity:** several hundred accounts
- **Effort:** none
- **Blocks:** teams, customer-managed admins, per-business analytics

### Option B — Organisations with row-level isolation *(the pooled tier)*

Introduce a tenant that isn't the individual.

```
orgs     { id, name, plan, currency, createdAt }
users    { ..., orgId, role: 'platformAdmin' | 'owner' | 'member' | 'contributor' | 'viewer' }
data     { ..., orgId }
```

- One shared Render service and one shared Atlas cluster
- Customers see only their own business; you see everything

**Good for:** the low-volume, non-technical tier — exactly the "pool them and
hide the backend" case. **Effort:** ~2–3 days.

Three things this must get right:

**Two distinct admin layers, not one role with exceptions.** `platformAdmin`
must be a separate middleware that bypasses org scoping explicitly, rather than
an `if` inside the org check. Anything shaped like
`if (user.role === 'admin' || user.orgId === target.orgId)` will eventually be
copied into a handler where the precedence is wrong.

```js
// Scoped by default. Every org-facing route uses this.
const requireOrg = (req, res, next) => {
  req.orgId = req.user.orgId;                       // never from the request body
  if (!req.orgId) return res.status(403).json({ error: 'No organisation' });
  next();
};
// Deliberately separate, deliberately narrow, and never mixed into the above.
const requirePlatformAdmin = (req, res, next) =>
  (req.user.role === 'platformAdmin' ? next() : res.status(403).json({ error: 'Admin only' }));
```

The scoping key must always come from the *session*, never from a parameter a
caller can set.

**Composite indexes, not just a new field.** Adding `orgId` without reindexing
turns every scoped read into a collection scan as the pooled document count
grows:

```js
// Email stays GLOBALLY unique: sign-in resolves an account by email alone.
await users.createIndex({ email: 1 }, { unique: true });
await data.createIndex({ userId: 1 }, { unique: true });

// orgId LEADS every scoped index.
await users.createIndex({ orgId: 1, createdAt: -1 });
await data.createIndex({ orgId: 1 });
await events.createIndex({ orgId: 1, at: 1 });

// TTL stays on its own single-field index — see below.
await events.createIndex({ at: 1 }, { expireAfterSeconds: 7776000 });
```

`orgId` must be the **leading** field — an index on `{ userId: 1, orgId: 1 }`
does not serve a query filtered on `orgId` alone.

Two traps found while implementing this, both of which fail *silently*:

**Do not make email unique per org.** `{ orgId: 1, email: 1 }` unique looks
symmetrical but is the wrong constraint here: sign-in resolves an account from
an email address alone, with no org in hand. Allowing the same address in two
orgs makes `getUserByEmail` ambiguous and login non-deterministic. Email is
globally unique; the org is a property of the account it finds.

**TTL cannot live on a compound index.** MongoDB TTL indexes are single-field
only — `expireAfterSeconds` on `{ orgId: 1, at: 1 }` is accepted without error
and then *ignored*, so nothing ever expires and you find out months later when
storage fills. Keep `{ at: 1 }` for expiry and `{ orgId: 1, at: 1 }` for queries.

**Isolation tests in CI, asserting the attack rather than the happy path.**
Signing in as tenant B and requesting tenant A's resources must 403/404 — for
reads *and* writes, and for every admin route. The suite already has the shape
for this (`tests/api.test.mjs` has two-account tests); these become the gate
that stops a missed `orgId` filter reaching production:

```js
// For each route: B must never see or touch A's data.
GET    /api/data            as B  → only B's workspace, never A's
PUT    /api/data            as B  → cannot write into A's org
GET    /api/admin/users     as B  → only B's org members
PATCH  /api/admin/users/:aId as B → 404, not 403 (don't confirm A exists)
DELETE /api/admin/users/:aId as B → 404
```

**Risk:** one missed filter is a cross-tenant leak. The tests above are what
make this option safe to ship, not optional hardening after it.

### Option C — Database-per-tenant, shared application

One Render service; a separate Mongo database (or cluster) per customer, chosen
per request from the signed-in user's `orgId`.

- Strong blast-radius isolation; per-customer backup and restore is trivial
- Per-customer export/deletion is a drop, which is a clean answer to
  data-residency and GDPR questions
- **Cost:** connection pools multiply; Atlas free tier allows one M0 per project,
  so this means paid clusters (M10+, ~$57/mo each) or many projects
- **Effort:** ~3–4 days, plus real operational work

### Option D — Fully dedicated deployment per client *(the enterprise tier)*

Their own Render service, their own Atlas cluster, their own domain, their own
OAuth credentials. Just this repo deployed again with different env vars.

- **This already works today**, and now has its own blueprint:
  `render.dedicated.yaml`, alongside the pooled `render.yaml`. The two are the
  same application with different isolation boundaries; `DEPLOYMENT.md`
  §"Choosing a deployment shape" carries the environment matrix and the
  pooled→dedicated migration runbook
- `DEPLOYMENT_MODE`, `TENANT_NAME` and `HEALTH_DETAIL` make an instance
  identifiable from `/health`. `HEALTH_DETAIL=1` is safe here and only here:
  on a dedicated deployment the org and user counts are the operator's own,
  whereas on the pooled one they are a customer count on a public endpoint
- Maximum isolation; the client can hold their own database credentials and take
  the whole thing in-house
- **Cost:** ~$7/mo Render Starter + their Atlas tier, per client
- **Effort:** ~15 minutes per client to stand up; ongoing cost is *upgrades* —
  every client is a separate deployment to keep current

### Option E — Hybrid: pooled + dedicated from one codebase ✅ *shipped*

Build Option B, keep Option D available, and let the same image serve both.
Both blueprints are in the repo (`render.yaml`, `render.dedicated.yaml`) and
neither forks the code — a deployment's shape is entirely a matter of which
environment variables it was given.

```
Pooled tier      →  one Render service + one Atlas cluster, many orgs
Dedicated tier   →  same image, own service + own cluster, single org
```

The only difference between a pooled and a dedicated deployment is environment
variables and how many orgs exist in it. One codebase, one CI pipeline, one
upgrade path.

### Migrating a customer from pooled to dedicated

The existing JSON export/import is the mechanism, and it is safe for this
**because the app's identifiers are application-owned, not database-owned.**
Records carry a `crypto.randomUUID()` `id`, reference their module by that same
`moduleId`, and relation fields store the target record's `id`. Mongo's `_id` is
never exposed, never referenced, and is stripped on read (`projection: {_id: 0}`).
So a round-trip preserves every cross-reference by construction.

The rule to hold to when writing the migration tool:

- **Re-key nothing.** Ids, `createdAt` and `updatedAt` transfer verbatim.
  Regenerating a `moduleId` orphans every record in it; regenerating a record id
  breaks every `relation` field pointing at it.
- Only `orgId`/`userId` may be rewritten, since those are the tenancy keys — and
  every record must be rewritten consistently in the same pass.
- Verify after import by comparing counts per module *and* resolving every
  relation field to an existing record id. A silent orphan is the failure mode
  worth testing for, and it is invisible in a record count.

`GET /api/data` → `PUT /api/data` on the new deployment is sufficient today for
a single-user workspace. A multi-org export needs the same guarantees applied
per org.

---

## 6. Comparison

| | A: as-is | B: orgs, shared | C: DB per tenant | D: dedicated | E: hybrid |
|---|---|---|---|---|---|
| Teams in one business | ✗ | ✓ | ✓ | ✓ | ✓ |
| Customer-managed admins | ✗ | ✓ | ✓ | ✓ | ✓ |
| Isolation strength | Low | Row-level | Database | Total | Both |
| Infra cost per customer | ~£0 | ~£0 | High | ~$7+/mo | Tiered |
| Your operational load | Low | Low | High | High | Medium |
| Works today | ✓ | ✗ | ✗ | **✓** | ✗ |
| Build effort | — | 2–3 days | 3–4 days | 0 | 3–4 days |

---

## 7. Suggested order

1. **`events` TTL index** — ✅ shipped. 90 days, configurable via
   `EVENT_RETENTION_DAYS`, and it replaces the older untl'd index in place on
   existing deployments.
2. **Sell dedicated (Option D) immediately** — needs no code and is the honest
   answer to any enterprise client asking about isolation right now.
3. **Per-org scoping (Option B)** — ✅ shipped. `orgs` collection, `orgId` on
   users, workspaces and events, separate `requireOrgAdmin` / `requirePlatformAdmin`
   middleware, composite indexes, an idempotent backfill that puts each existing
   account in its own org, and eight isolation tests that assert the attack.
   **Shared team workspaces are deliberately NOT part of this** — each account
   still has its own workspace, so no concurrent-edit data loss was introduced.
4. **Per-record sync** — ✅ shipped. Per-row `updatedAt`/`serverAt`, a
   watermark delta protocol, tombstoned deletes with a TTL, an idempotent
   split of existing snapshots, and the legacy endpoints kept working on the
   same rows. Sixteen sync tests plus two two-device browser journeys, each
   checked against the broken state. See §2.2.
5. **Shared team workspaces** — ✅ shipped, in four stages: org-owned
   workspaces, invite links, owner-vs-member permissions, and member
   management. What each one had to solve, kept because the reasoning is the
   record:
   - **Re-key rows from `userId` to `orgId`.** `modules` and `records` are
     keyed `{userId, id}` today; `orgId` rides along for stats and scoping but
     is not the ownership key, so two colleagues in one org have two separate
     workspaces. This is a data migration with real risk and deserves its own
     plan.
   - **Move settings to the org.** `businessName` and `currency` live on the
     user's meta document.
   - **An invite/join flow.** Every signup creates its own org; there is no way
     into an existing one. An invitee arriving with a personal workspace needs
     the *same* question the client already asks at sign-in ("bring this with
     you?"), so that prompt is reusable rather than new work.
   - **A permission model for data.** *(Built.)* A ladder — `viewer` reads,
     `contributor` adds and edits, `member` deletes, `owner` owns the schema
     and the team. Enforced in the sync push, which refuses the write and hands
     back the server's own copy so the edit un-happens.
   - **Attribution** (`createdBy`/`updatedBy`) so a shared workspace can show
     who changed what.
   - **Operational gaps a shared database needs regardless:** *(partly built —
     per-org usage is measured and visible, new organisations can be capped,
     and a single workspace can be put read-only. Still open: per-tenant rate
     limiting, one-shot org deletion, and an audit trail for admin actions.)*

   None of it risked data loss, which was the point of doing (4) first. The
   re-key turned out to be a rename rather than a merge because org↔user was
   still 1:1 — it would not have been that cheap after invites existed.

   Still unbuilt, deliberately: **per-module permissions**. Everyone on a team
   sees every module. Doing it properly needs per-module filtering inside sync,
   or a member receives rows the UI then has to pretend are not there.
6. **Database-per-tenant (Option C)** — only if a client's compliance
   requirements demand it and dedicated deployment isn't acceptable.

The sequencing point, now settled: it was tempting to ship org scoping and
treat sync as an optimisation to follow. Scoping without per-record sync would
have given several colleagues one workspace where the last person to save wins
over everyone else, silently. Org scoping shipped first *without* shared
workspaces, and per-record sync landed before them — which is why there is no
migration to write and no data-loss window to explain.

## 8. What to answer a prospect today

- *"Can our team all use it?"* — Yes. An organisation shares one workspace; an
  owner invites people with a single-use link. Owners control the schema and
  the team, members work with records — with `contributor` and `viewer` below
  them for people who should not delete or should not write at all — and
  per-record sync means two people
  editing different records both keep their work. Everyone on a team sees every
  module — per-module access is not built.
- *"We share a computer — is that safe?"* — Yes. Each account has its own local
  store on a device, so one person's work is never visible to, or synced into,
  another's account — including edits that had not reached the server yet.
  Signing out returns the screen to a blank workspace without deleting
  anything.
- *"Is our data separate from other customers?"* — In shared hosting, separated
  by account at the API layer. For physical separation, we offer a dedicated
  deployment with its own database (Option D), available now.
- *"Can we host it ourselves?"* — Yes. It is a standard Node app; you supply the
  Mongo connection string and Google credentials.
- *"How much data can we put in?"* — Sync sends only what changed, so edit
  cost no longer scales with workspace size. The remaining ceiling is the
  16 MB per-document limit on the settings/meta document — irrelevant in
  practice — and Atlas M0's 512 MB shared across tenants. Tens of thousands of
  records per workspace are comfortable; beyond that we move you to dedicated
  infrastructure for the storage, not for the sync.
