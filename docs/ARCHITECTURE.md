# Multi-Tenancy & Scaling Options

How many customers the current build supports, what stops it going further, and
the routes to a pooled tier and a dedicated tier from one codebase.

Every number below is measured against the real demo workspace, not estimated.

---

## 1. Where we are today

**One tenant = one user account.** A person signs in, and their whole workspace
lives in a single MongoDB document keyed by `userId`:

```
users    { id, email, name, role, disabled, createdAt, lastActiveAt }
data     { userId, modules[], records[], settings, moduleCount, recordCount, updatedAt }
events   { type, userId, day, at }
```

There is no concept of a business, an organisation, or a team. Two employees of
the same company get two unrelated workspaces.

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

### 2.1 🔴 The admin role is global — fix before onboarding a second business

`requireAdmin` checks one thing: `req.user.role !== 'admin'`. There is no
scoping. Any admin calling `GET /api/admin/users` receives **every account on
the deployment**, with each one's email, join date, last activity, and record
and module counts.

That is fine today, when the only admin is you. It becomes a data-protection
problem the moment you make a customer an admin of their own business while
another customer's data is in the same deployment — they would see the other
customer's account list.

**Consequence:** in the shared/pooled model, either you remain the only admin,
or org scoping ships first. Treat this as a prerequisite, not a nice-to-have.

### 2.2 Sync writes the entire workspace on every change

`PUT /api/data` replaces the whole document. Editing one phone number on a
5,000-record workspace uploads 1.28 MB. This is the real ceiling long before
storage is:

- Bandwidth and Atlas write throughput scale with *workspace size*, not edit size
- Two devices editing concurrently resolve last-write-wins across the whole
  workspace, so one can silently discard the other's changes
- It rules out real-time collaboration entirely

Moving to per-record sync is the single highest-leverage change on this list,
and it is a prerequisite for genuine multi-user businesses.

### 2.3 `events` grows without bound

`events` has an index on `at` but no TTL. Every login, signup and sync appends a
row forever. At 100 active users syncing 50×/day that is ~1.8M documents a year,
quietly consuming the same 512 MB the customer data needs.

**Fix (one line, do it now):**
```js
await this.events.createIndex({ at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
```
The dashboard only reads 30 days back, so a 90-day TTL costs nothing.

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

**Honest answer: the infrastructure would hold several hundred small workspaces;
the binding limits are the global admin role and your own support capacity long
before storage.**

Where it breaks down sooner: any single customer exceeding ~5,000 records makes
every save slow, and ~62,000 records makes saves fail.

---

## 4. Can multiple businesses share the existing database?

**Technically yes, today** — data is keyed by `userId` and the API enforces that
boundary on every read and write. Two businesses' records cannot leak into each
other through the normal app surface.

**But not safely with customer admins**, for the reason in §2.1, and **not for a
business with more than one employee**, because there is no way to share a
workspace between accounts.

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
users    { ..., orgId, role: 'owner' | 'member' | 'platformAdmin' }
data     { ..., orgId }
```

- Scope every query by `orgId`; scope `requireAdmin` to `orgAdmin` within an org,
  with a separate `platformAdmin` for you
- One shared Render service and one shared Atlas cluster
- Customers see only their own business; you see everything

**Good for:** the low-volume, non-technical tier — exactly the "pool them and
hide the backend" case. **Effort:** ~2–3 days. **Risk:** every query must be
scoped; one missed `orgId` filter is a cross-tenant leak, so this needs tests
that specifically assert isolation.

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

- **This already works today** — it is exactly what `render.yaml` + `DEPLOYMENT.md`
  describe. No code changes needed at all
- Maximum isolation; the client can hold their own database credentials and take
  the whole thing in-house
- **Cost:** ~$7/mo Render Starter + their Atlas tier, per client
- **Effort:** ~15 minutes per client to stand up; ongoing cost is *upgrades* —
  every client is a separate deployment to keep current

### Option E — Hybrid: pooled + dedicated from one codebase ✅ *recommended*

Build Option B, keep Option D available, and let the same image serve both.

```
Pooled tier      →  one Render service + one Atlas cluster, many orgs
Dedicated tier   →  same image, own service + own cluster, single org
```

The only difference between a pooled and a dedicated deployment is environment
variables and how many orgs exist in it. One codebase, one CI pipeline, one
upgrade path. A customer can start pooled and be migrated to dedicated by
exporting their org and importing it into a fresh deployment — which the
existing JSON export/import already does.

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

1. **`events` TTL index** — one line, do it today, prevents slow storage creep.
2. **Per-org scoping (Option B)** — the prerequisite for onboarding any customer
   as an admin of their own business. Ship with cross-tenant isolation tests.
3. **Sell dedicated (Option D) immediately** — it needs no code and is the honest
   answer to any enterprise client asking about isolation right now.
4. **Per-record sync** — before any customer passes a few thousand records, or
   before any promise of multi-user editing.
5. **Database-per-tenant (Option C)** — only if a client's compliance
   requirements demand it and dedicated deployment isn't acceptable.

## 8. What to answer a prospect today

- *"Can our team all use it?"* — Not yet in one shared workspace; each person
  gets their own. Teams need Option B.
- *"Is our data separate from other customers?"* — In shared hosting, separated
  by account at the API layer. For physical separation, we offer a dedicated
  deployment with its own database (Option D), available now.
- *"Can we host it ourselves?"* — Yes. It is a standard Node app; you supply the
  Mongo connection string and Google credentials.
- *"How much data can we put in?"* — Comfortable to a few thousand records per
  workspace today. Beyond that, we move you to per-record sync or dedicated
  infrastructure.
