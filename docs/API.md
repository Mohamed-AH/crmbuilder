# API reference

> **Current reference · developers.** Verified against `server.js` 2026-08-27.
> Internal: not served publicly.
>
> This is the contract. The *reasoning* behind each boundary is in `CLAUDE.md`,
> and every section here points at the relevant one rather than restating it —
> one fact, one home (`CLAUDE.md` §27).

43 routes over six boundaries. All JSON unless noted. All authenticated routes
take the session cookie; there is no bearer token anywhere except
`/api/admin/export`, which is deliberately different (see §5).

---

## The rules that apply everywhere

**Identity comes from the session, never the request.** `req.scopeOrgId` (which
org an admin may see) and `workspaceIdFor(user)` (which workspace a caller reads
and writes) are both resolved from the authenticated user. No endpoint accepts a
workspace, org or user id that decides *whose* data is touched. Handing one in a
body or query is ignored. `CLAUDE.md` §5.

**Crossing a tenant boundary returns 404, never 403.** A 403 confirms the thing
exists. This applies to orgs, users and access requests alike, and includes an
org owner acting on a `platformAdmin` — which 404s, because a platform admin has
an org like anyone else. `CLAUDE.md` §21.

**Refusals of *content* are not errors.** A push containing a write the caller
may not make returns **200** with the rejected rows echoed back carrying the
server's own copy. The client overwrites its local row and the edit un-happens.
A failed sync would leave the two sides disagreeing forever. See §2.

**Status codes**

| Code | Means |
|---|---|
| 400 | Malformed body — wrong type, missing required field |
| 401 | No session, or the account is disabled |
| 403 | Authenticated but not permitted (role gate on the *route*) |
| 404 | Not found, **or** found but not yours |
| 409 | Conflicting state (e.g. joining would strand a team) |
| 413 | Body over the route's limit (64 KB, or 8 MB on `/api/sync` and `/api/data`), or a push over `MAX_SYNC_ITEMS` (20,000 per kind) |
| 429 | Rate limited — see *Limits and headers* below |
| 500 | Something threw. The body is `{ "error": "Something went wrong." }` and **never** a stack trace |

### Limits and headers

Every response carries a fixed set of security headers, including a CSP with
`script-src 'self'` and `frame-ancestors 'none'`. Nothing here is meant to be
framed or to run inline script. `style-src` keeps `'unsafe-inline'` for dynamic
`style=` attributes — inline style cannot execute script. `CLAUDE.md` §30.

**Body limits are per route.** 64 KB by default; `/api/sync` and `/api/data`
opt into 8 MB (`SYNC_BODY_LIMIT`) because a push legitimately carries a
workspace. Over the limit is a **413**, not a truncated read.

**Rate limits are narrow on purpose**, and where they are *absent* matters as
much as where they apply:

| Route | Limit | Why |
|---|---|---|
| `POST /api/access-request` | 5/min per IP | The queue an operator works by hand is otherwise trivially floodable |
| `GET /auth/google/callback` | 60/min per IP | Each call makes the server exchange a token with Google — outbound work an anonymous caller can trigger. **Not** brute-force protection; there is nothing to guess |
| `POST /api/feedback` | 10/hour per user | Bounded because it writes to the same 512 MB the customers use |
| `POST /api/sync` | **none** | A large workspace, or a week offline, legitimately pushes hard. Throttling it turns a slow sync into lost work |
| `POST /auth/dev` | **none** | 404s in production, so a limit protects nothing real |

Sign-in generally is not limited **because there is no password here** — Google
owns authentication, and trying a beta or invite code costs a full OAuth round
trip, so the flow is already its own rate limiter.

Counting is in memory and therefore **per instance**. On a single free-tier
service that is the whole deployment; on a multi-instance one the effective
limit multiplies by the instance count.

---

## 1. Auth

```
GET  /auth/google              → 302 to Google
GET  /auth/google/callback     → 302 back to the app, session set
POST /auth/dev                 { email, name? }  dev only
POST /auth/logout              → clears the session
GET  /api/me                   → identity + deployment config
```

`/api/me` is the only one the client calls on every boot, and it answers whether
authenticated or not — the app must paint before it resolves (`CLAUDE.md` §3),
so nothing may block on it.

```jsonc
{
  "authenticated": true,
  "user": { "id": "...", "email": "...", "name": "...", "role": "member" },
  "org":  { "id": "...", "name": "..." },
  "googleEnabled": true,
  "signupMode": "code",          // code | open | closed
  "betaAcceptedAt": 1750000000000
}
```

**Three cookies cross the Google round trip**, all httpOnly, all validated in the
callback against the email Google actually returned — only there is it known
whether this is a signup at all:

| Cookie | Carries | Why it is a cookie |
|---|---|---|
| `crmb_oauth_state` | CSRF state | standard |
| `crmb_beta` | a beta code | it must survive the redirect without landing in a URL |
| `crmb_invite` | a team invite | same, and it is a bearer credential |
| `ASK_COOKIE` | the refused email, 10 min | so an access request cannot claim an address its sender does not control |

**`/auth/dev` must be off in production.** The smoke test checks this.

### The signup gate

`checkSignup(email, code, inviteCode)` runs in the callback. **The order is the
security property**, not a list of modes — `CLAUDE.md` §16 and §20:

1. account already exists → in *(the gate is on signup, never sign-in)*
2. `ADMIN_EMAILS` → in
3. no users at all **and** `ADMIN_EMAILS` empty → in *(bootstrap; without the
   second condition, whoever finds a fresh URL first owns the deployment)*
4. an approved access request → in
5. **org-creation gate** — refuses a signup that would mint a *new* org, unless
   it carries a valid team invite
6. `signupMode` — `open` admits; a still-pending request is told so; `closed`
   refuses
7. the beta code

Every refusal answers **identically** (`SIGNUP_REJECTION`) except *pending*,
which is a deliberate exception: the only way to see it is to have just proved
control of the address to Google.

---

## 2. Sync — the delta protocol

```
POST /api/sync                 push + pull in one round trip
GET  /api/sync?since=N         pull only
GET  /api/data                 legacy whole-snapshot read
PUT  /api/data                 legacy whole-snapshot write
```

`/api/data` still works so a client on cached older JS keeps syncing through a
deploy. Do not build on it.

### Two clocks, and they must not be conflated

| Field | Whose | Job |
|---|---|---|
| `updatedAt` | the client | the row's edit time; decides last-write-wins |
| `serverAt` | the server | monotonic stamp; **the only thing the cursor walks** |

A device with a skewed clock must never be able to move the cursor. `CLAUDE.md`
§10 — this is the single most load-bearing distinction in the codebase.

### Request

```jsonc
{
  "since": 1750000000000,        // the cursor, NOT a wall clock
  "modules": [ /* wire items */ ],
  "records": [ /* wire items */ ],
  "settings": { "doc": {...}, "updatedAt": 0 }   // 0 is legitimate — see below
}
```

A **wire item** is one of two shapes:

```jsonc
{ "id": "...", "updatedAt": 173…, "doc": {...}, "createdBy": "...", "updatedBy": "..." }
{ "id": "...", "updatedAt": 173…, "deleted": true, "deletedAt": 173… }
```

**Deletes are tombstones, never absence.** A row that simply disappears is
indistinguishable from one the server has never seen, so it would be handed
straight back on the next pull.

### Response

```jsonc
{
  "modules": [...], "records": [...],
  "settings": { "doc": {...}, "updatedAt": … } | null,
  "cursor": 1750000000123,       // feed this back as `since`
  "pushed": 4,
  "rejected": { "modules": [...], "records": [...] },  // only when non-empty
  "readOnly": true,                                    // only when suspended
  "readOnlyReason": "…"
}
```

### Field-level merge

A record's `doc` may carry `fieldsAt: { [fieldKey]: ts }` — a clock per field.
Two people editing *different fields of one record* both keep their edit.

- **A missing key means clock 0, never the row's `updatedAt`.** Falling back to
  the row clock makes an untouched copy claim it set every field when it was
  last saved, so a stale value beats a real edit. Zero says "as far as this copy
  knows, nobody ever edited this."
- **The merge runs on the server**, and **runs even when the incoming row is
  newer** — a newer row can still carry a stale value for a field somebody else
  changed.
- `updatedAt` becomes `max(prior, incoming)`, because the client skips any
  incoming row not newer than its local one.
- A row with no `fieldsAt` resolves whole-row, exactly as before.
- **Tombstones stay whole-row.** Deleting is not a field edit.

`CLAUDE.md` §26.

### Rejections — the role-enforcement seam

`applyPush` is where every write permission is enforced. A refused write is
**not** an error; it comes back in `rejected` and the client applies it over its
local row.

| Rejection carries | Means | Client does |
|---|---|---|
| the server's copy + `reason` | the write was refused | overwrite local, un-happen the edit |
| `absent: true` | a refused **creation** — nothing to restore | **purge**, do not tombstone |

`reason` is `'readonly'` (a viewer wrote) or `'nodelete'` (a contributor
deleted). **The server decides the wording because the client's idea of its own
role is stale precisely when this fires** — that is the whole scenario. Asking
the client to guess produces a confident, wrong explanation. `CLAUDE.md` §26.

Two cascades that are easy to miss: a refused module *deletion* must restore its
record tombstones too (`refusedModuleIds`), and a refused module *creation* must
take the records pointing at it (`absentModuleIds`). Refusing only the module
leaves the records destroyed — worse than either outcome.

### Suspension

A suspended org still **pulls**. Only the push is refused, with `readOnly` and
`readOnlyReason`. **The client must not advance its push watermark on a refused
push** — doing so marks the rows as sent, and resuming the org would restore
writing having silently lost everything typed during the pause.

---

## 3. Roles

`ROLES = ['platformAdmin', 'owner', 'member', 'contributor', 'viewer']`
`TEAM_ROLES` is what an owner may hand out — `platformAdmin` is deliberately not
in it.

A ladder, so there is one ordering to reason about rather than a matrix:

| | owner / platformAdmin | member | contributor | viewer |
|---|---|---|---|---|
| read | ✅ | ✅ | ✅ | ✅ |
| records: create, edit | ✅ | ✅ | ✅ | ❌ |
| records: delete | ✅ | ✅ | ❌ | ❌ |
| module fields, add/delete modules | ✅ | ❌ | ❌ | ❌ |
| invite, roles, remove members | ✅ | ❌ | ❌ | ❌ |

Enforced by `canEditSchema` / `canEditRecords` / `canDeleteRecords`, all inside
`applyPush`. **The same names exist in `js/app.js` and decide nothing** — they
only avoid offering a button whose effect the server would undo a second later.

Route-level gates are separate middleware: `requireAuth`, `requireOrgAdmin`
(sets `req.scopeOrgId`) and `requirePlatformAdmin`. **`requirePlatformAdmin` is
its own middleware, never a branch inside the org check** — the conditional form
gets copied into a handler with the precedence wrong.

---

## 4. Team and org

```
GET    /api/org                     the caller's org
GET    /api/org/members             anyone on the team; canManage says who may act
PATCH  /api/org/members/:id         owner only — TEAM_ROLES, never platformAdmin
DELETE /api/org/members/:id         owner only — removes from the TEAM
POST   /api/org/leave               self-service exit
GET    /api/org/invites             owner only
POST   /api/org/invites             owner only → { code }
DELETE /api/org/invites/:code       revoke
GET    /api/org/invites/:code/preview   unauthenticated
POST   /api/org/join                { code }
```

**Removing is not deleting.** `DELETE /api/org/members/:id` moves the person to
a fresh org of their own: account intact, team workspace untouched. Account
deletion is `/api/admin/users/:id`, and `deleteAccount()` is still the only
thing that can take a workspace with it. The two are one word apart and a decade
of data apart. `CLAUDE.md` §15.

**`wouldStrandTeam()` is one rule behind three endpoints** — leave, self-demote
and join. The last owner of a populated team walking away leaves people with a
workspace nobody can administer. Answers **409**.

**Invites are bearer credentials**: 24 random bytes, single use, 7 days,
revocable, never logged. **Every failure answers identically** — unknown,
expired, spent, revoked — or the response enumerates which codes exist.

**Joining means leaving**, and the client must **push before joining**. The
server files every write under the caller's *current* workspace, so flushing
afterwards posts the old workspace's rows into the new team's CRM. `CLAUDE.md`
§13.

---

## 5. Platform administration

```
GET  /api/admin/platform            counts, per-org rows, three meters
GET  /api/admin/stats               analytics
GET  /api/admin/users               scoped by req.scopeOrgId
PATCH/DELETE /api/admin/users/:id
PUT  /api/admin/signup-mode         { mode }
PUT  /api/admin/org-creation        { mode }
POST /api/admin/orgs/:id/suspend    { suspended, reason? }
GET  /api/admin/beta-codes          POST, DELETE /:code
GET  /api/admin/access-requests     POST /:email/decide
GET  /api/admin/feedback            PATCH /:id
POST /api/admin/alerts/test
GET  /api/admin/export              ← Bearer token, NOT a session
```

### `GET /api/admin/platform`

Platform admin only. Cached `PLATFORM_CACHE_MS` (30s) because `usageByOrg()`
scans; `?fresh=1` bypasses.

```jsonc
{
  "counts": { "users": 12, "orgs": 5, "records": 1840, "disabled": 0,
              "tenantBytes": 284672, "reclaimableBytes": 142336 },
  "orgs": [ { "id","name","members","records","modules","bytes",
              "deadBytes","oldestDeletedAt",
              "shareOfData","lastActiveAt","suspendedAt" } ],
  "meters": {
    "storage": { "bytes","limitBytes","percent","level" },
    "ram":     { …, "peakBytes" },
    "egress":  { …, "month" }
  },
  "orgCreation": "open",
  "tombstoneDays": 180,
  "cached": true
}
```

**`records` and `bytes` count different populations, deliberately.** `records`
is live rows only — an operator reading a number the customer's own screen
contradicts is being told something false. `bytes` counts everything, because a
tombstone occupies real storage and a size meter that ignores it under-reports
exactly what it exists to catch. Do not reconcile them.

**`deadBytes` is how much of `bytes` is tombstones**, and `oldestDeletedAt`
plus `tombstoneDays` is when the first of it comes back. Both are **measured**
— `$bsonSize` on Mongo, serialised length on the file store — never
`deadRows × an average`: a tombstone is ~346 bytes against a live record
several times that, so a count-derived figure is wrong in the direction that
matters. A workspace can be half gravestones (`CLAUDE.md` §33), and the storage
alerts fire on the total that conflates the two.

`tombstoneDays` is a deployment constant, sent once rather than per row.

`level` is `ok` | `warn` | `critical`.

**Per-org bytes are measured, never records × a constant** — `$bsonSize` in a
`$group` on Mongo, serialised length in the file store. Indexes and tombstones
are real storage and an estimate that ignores them reads fine right up until the
tier fills. A test asserts one large record outweighs six small ones.

**RSS is a point sample** taken when the endpoint is hit, so it catches a leak,
not the burst that would OOM-kill the container. `peakBytes` is the worst
observed. Do not present it as protection against an OOM.

**Egress never writes per request.** It accumulates in memory, flushes on an
interval **and on SIGTERM** — a free instance spins down constantly, and without
the signal handler the month's figure reads far too low.

### Stored settings beat environment variables

`signupMode` and `orgCreation` live in the `platform` document. **A stored value
wins over the env var**, so a redeploy cannot silently undo the operator; the
env var only decides for a deployment that never set one. Cached in-process,
invalidated on write, 30s TTL so a multi-instance deployment converges.

### `GET /api/admin/export`

The highest-value route in the app — one request returns every customer's data —
so it is deliberately awkward. `CLAUDE.md` §17:

- **404, not 401, when `BACKUP_TOKEN` is unset.** Nothing should be able to
  discover whether a deployment has backups.
- **`Authorization: Bearer` only.** A *correct* token in a query string is
  refused with an explanation: Render logs request URLs, so `?token=` writes a
  credential into plaintext logs, history and `Referer`.
- **An admin session is not a token.** A stolen cookie must not also be a
  database dump.
- Compared by hashing both sides — `timingSafeEqual` throws on a length
  mismatch, and the throw would itself leak the length.

---

## 6. Public and self-service

```
GET  /health                    public; detail behind platform admin / HEALTH_DETAIL
GET  /healthz                   older liveness probe
POST /api/feedback              a problem report
POST /api/access-request        reads ASK_COOKIE, never req.body.email
POST /api/me/beta-accepted      stamps betaAcceptedAt
```

### `/health` and the alert loop

`/health` is public and **must not grow for anonymous callers**. Counts sit
behind a platform-admin / `HEALTH_DETAIL` check.

**The alert rules are evaluated off the back of this request** — UptimeRobot
hits it every 14 minutes to keep the free tier awake, so no scheduler exists.
Evaluation happens **after** the response and **for every caller**, not only a
platform admin: the detail check governs what the body *discloses*, and
evaluating is not disclosing. Gating evaluation behind it would mean the
keep-warm ping — the only regular caller — never triggers anything.

`ALERT_MIN_GAP_MS` (5 min) keeps a burst of pings to one pass. A dead webhook
must never break `/health`: evaluate and store first, notify after.

| Rule key | Fires at | Env |
|---|---|---|
| `storage` | 60 / 85 / 95 % of 512 MB | — |
| `ram` | 70 / 85 % | `RAM_LIMIT_BYTES` |
| `egress` | 60 / 85 % | `EGRESS_LIMIT_BYTES` |
| `signups` | > N in an hour | `SIGNUP_SPIKE_PER_HOUR` (10) |
| `tenant` | one org over N % of the database | `TENANT_SHARE_LIMIT` (25) |

**Escalate-only, never repeated at the same level.** State per rule lives in
`platform.alerts`; 60% speaks once and stays quiet until 85%, re-arming only
after a drop. An alert that fires hourly trains you to ignore it, which is worse
than none.

`POST /api/admin/alerts/test` fires a message **and reports what every rule
currently sees**, so "nothing is wrong" can be told apart from "the webhook has
been broken since I rotated the URL".

### `POST /api/feedback`

Stores the message plus a **whitelisted** context — version, route, browser,
sync status, counts, ≤10 recent console errors. Bounded because it writes to the
same 512 MB the customers use: 4 KB message, 10/hour/user, 90-day TTL.

**The webhook gets the message and none of the diagnostic context.** Console
errors can contain record names and customer email addresses; sending them to a
chat service would make it a processor of beta users' CRM contents. A test
stands up a local server and asserts the payload contains the message but not
the browser string, not a record count, and not an email lifted from an error.

`sanitiseContext` is a **whitelist, not a cleanup** — anything the client
invents is dropped.

### `POST /api/access-request`

**The address comes from `ASK_COOKIE` and nothing else — never `req.body`.** A
typed form would take an unverified string on an unauthenticated endpoint;
anyone could queue as `ceo@bigcorp.com` and, once approved, be handed that
account. Refusing first costs an attacker a full OAuth round trip per row.
That is why there is no "request access" form and should not be one.
`CLAUDE.md` §20.

Declining is **silent and final** — the handler short-circuits on any
non-pending row and answers *received* without writing.

---

## Adding a route

1. Pick the middleware: `requireAuth` → `requireOrgAdmin` → `requirePlatformAdmin`.
   Never re-implement a role check inline.
2. Scope from the session. If your handler reads an org, workspace or user id
   from the request to decide *whose* data it touches, it is wrong.
3. Cross-boundary → **404**.
4. Add the contract test to `tests/api.test.mjs` and **check it fails against
   the un-fixed code** (`CLAUDE.md` §9). The 8 isolation tests assert the
   attack, not the happy path — keep that style.
5. Serving a new *file* means the allow-list too — `CLAUDE.md` §28.
6. A route that legitimately takes a large body must opt in, like `/api/sync`
   does; the default is 64 KB and silence is a 413.
