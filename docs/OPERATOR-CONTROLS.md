# Operator controls — the plan

Working plan for the admin-dashboard controls: seeing what the deployment is
carrying, and being able to slow it down before the free tier runs out.

**Live status lives in `CLAUDE.md` §24**, not here — this document is the
reasoning and the shape; that one is the checklist and is kept current as
stages land.

Six asks. **Two are already built, one is partly built, three are new** — and
one of the three cannot be done the way it is worded. Checked against the code
rather than assumed.

| # | Ask | State today |
|---|---|---|
| 1 | Total users and organisations | **Partly.** `/health` reports both to a platform admin; `/api/admin/stats` returns `totals.users` but **no org count**, and there is no org list at all — `store.listOrgs()` is used only by the backup export (`server.js:2221`) |
| 2 | Individual and combined org usage | **Partly.** `dataStats(orgId)` gives per-org records/modules; `storageStats()` gives whole-database bytes. **No per-org bytes, and nowhere that lists orgs side by side** |
| 3 | Render and MongoDB quotas | **Mongo yes, Render no.** `storageStats()` measures real `dataSize + indexSize` against 512 MB. Render instance-hours are **not exposed by any API we can call** — see *The honest answer on Render* |
| 4 | Halt signups for users **and orgs** | **Users done** (the mode switch, §16). **Orgs are a new lever** and a real one — see *Why orgs need their own gate* |
| 5 | Pause/resume users or orgs | **Users done** (`disabled`, `PATCH /api/admin/users/:id`). **Org-level suspend is new** |
| 6 | Telegram alerts on spikes and quotas | **New.** The transport exists (`webhookRequest`, §18); the thresholds, the state and the trigger do not |

---

## Three things worth deciding before any code

### Three meters, and what each one can actually tell you

Uptime hours were dropped: Render does not publish free-tier consumption, and a
number we cannot check is worse than no number. The three that follow are all
measurable from inside the process.

**MongoDB storage — 512 MB.** Already measured: `dbStats` gives real
`dataSize + indexSize`, not records × a constant. The most trustworthy of the
three, and the one that ends the beta if it fills.

**App RAM — 512 MB.** `process.memoryUsage().rss`. Two honest caveats, both of
which shape the alerting:

- RSS is what the Node process holds, not what the container is billed for.
  Close enough on a single-process container, and it is the only figure we can
  read from inside.
- It is a **point sample**, taken when `/health` is hit — every 14 minutes.
  A spike between pings is invisible. So this catches a **leak**, not a burst:
  slow growth over hours will trip it; the sudden allocation that actually
  OOM-kills the container will not. A high-water mark is stored alongside the
  current value so the panel shows the worst seen, not just the last glance.

**Outbound bandwidth — 5 GB/month.** Counted by middleware over every response
body. Three things to keep straight:

- It counts **application bytes**, not what Render bills — TLS framing and
  headers are not in it. A lower bound, and labelled as one.
- It **must not write to the database per request.** The counter lives in
  memory and flushes on an interval, so a crash costs at most one interval's
  bytes rather than a write amplification that would itself eat the storage
  quota.
- **`EGRESS_LIMIT_BYTES` is configurable and the 5 GB default should be checked
  against Render's current plan.** A limit encoded wrongly is worse than none:
  too low and the alerts are noise, too high and they never come.

### Why orgs need their own gate

Every signup creates an org, so "stop new accounts" and "stop new
organisations" are the same switch today — and that is a problem, not a
simplification. A colleague invited to an existing team **must create an
account first**, which mints an org, and only then can `/api/org/join` move
them. So pausing signups today also locks out every invited teammate of every
existing customer.

Splitting the lever fixes a real hole:

- `orgCreation: 'open' | 'closed'` alongside the signup mode.
- Closed means: a signup carrying a **pending team invite** still succeeds, and
  a signup that would mint a brand-new org is refused.
- That is the control the ask actually wants — cap how many *tenants* the
  shared database carries, without freezing your existing customers' hiring.

### Where the alert loop runs

There is no scheduler in this process and adding one is not needed:
**UptimeRobot already hits `/health` every 14 minutes** (§17). The alert
evaluation hangs off that request — after the response, never blocking it.

Cheap, dependency-free, and it fails safe: if the pings stop, the service is
asleep and there is nothing to alert about anyway.

---

## Stage A — see it (read-only, no new levers)

`GET /api/admin/platform`, platform admin only, returning:

- **Counts**: users, orgs, workspaces, records, modules — combined.
- **Per-org rows**: name, members, records, modules, bytes, created, last
  active. Sorted by bytes so the heavy tenants are the ones you see first.
- **Three meters**: Mongo bytes / 512 MB, RSS / 512 MB (plus the high-water
  mark), egress bytes this month / 5 GB — each with the `ok`/`warn`/`critical`
  level `usageReport()` already computes.

**Per-org bytes is the one piece of real work here.** `dataStats` counts rows,
not size. Mongo can total the real thing with `$bsonSize` in a `$group` over
`modules` and `records` grouped by `orgId`; the file store sums
`JSON.stringify` lengths. Both are honest measurements rather than
records × a constant, which is the trap §17 already records: indexes and
tombstones are real storage and an estimate that ignores them reads fine right
up until the tier fills.

Dashboard: an **Organisations** card under the existing usage block.

## Stage B — pull the levers

- **`orgCreation` toggle** beside the signup-mode switch, stored in the same
  `platform` document with the same precedence rule (§16): a panel decision
  wins over any env default and survives a redeploy.
- **Suspend / resume an organisation.** `suspendedAt` + `suspendedReason` on
  the org. A suspended org: sync refuses writes with a named reason the client
  surfaces, sign-in still works, and the data is untouched. The wording matters
  — this is "your workspace is read-only while we sort out storage", not a
  deletion, and the difference has to be on the screen.
- **User pause** already exists; the panel gains the same reason field so the
  two read alike.

**The rule this must not break:** suspension is reversible and never destroys.
`deleteAccount` is the only thing that removes a workspace (§5), and nothing in
this stage may touch it.

## Stage C — tell me before I look

`alerts` in the `platform` document: `{ lastFiredAt, lastLevel }` per rule.

| Rule | Fires when |
|---|---|
| Mongo storage | Crosses 60%, then 85%, then 95% |
| App RAM | RSS crosses 70%, then 85% |
| Egress | Crosses 3 GB (60%), then 4.25 GB (85%) |
| Signup spike | More than 10 signups in an hour (configurable) |
| Heavy tenant | One org holds more than 25% of the database |

**Escalate-only, and never repeat at the same level.** A rule that fires once an
hour trains you to ignore it, and an alert you ignore is worse than none. State
is stored, so crossing 60% notifies once; it goes quiet until 85%. A drop back
below re-arms it.

Reuses `webhookRequest()` (§18), so Discord and Slack work identically and
Telegram gets the shape it actually reads. A `/api/admin/alerts/test` button
proves the wiring without waiting for a real threshold.

---

## Files

| File | Change |
|---|---|
| `server.js` | `perOrgUsage()`; egress middleware + flush; RSS sampling; `/api/admin/platform`; `orgCreation` in the gate; org suspend/resume + a sync guard; alert rules and evaluation on `/health` |
| `js/app.js` | Organisations card; org-creation toggle; suspend/resume with reason; alert thresholds panel and test button |
| `js/cloud.js` | `Cloud.admin.platform()`, `setOrgCreation`, `suspendOrg`, `alerts` |
| `tests/signup.test.mjs` | org gate, invited-teammate exemption, suspend behaviour, alert rules and their de-duplication |
| `tests/e2e.spec.js` | the Organisations card, the two toggles, a suspended workspace's screen |
| `CLAUDE.md`, `docs/BETA.md`, `DEPLOYMENT.md` | §24, the runbook entries, the env table |

## Verification

Each guarantee checked against the state that breaks it, per §9:

- **Per-org bytes are measured, not estimated** — a workspace with a few large
  records must not report the same as one with many small ones.
- **The egress counter survives a restart** and does not write per request.
- **Closing org creation still lets an invited teammate in.** This is the one
  that matters; a version that simply refuses every signup fails it.
- **A suspended org cannot write and has lost nothing** — sync refused with a
  reason, records intact, resume restores writes.
- **Alerts do not repeat at the same level**, escalate when crossing the next,
  and re-arm after dropping back.
- **A dead webhook never breaks `/health`** — the same rule as the feedback
  notifier: stored/evaluated first, notification after the response.
- The 8 isolation tests and the current 149/68 stay green.

## Risks

- **`/health` is public.** The alert evaluation must stay behind the same
  platform-admin/`HEALTH_DETAIL` check the counts already sit behind, and must
  never lengthen the anonymous response.
- **`$bsonSize` scans.** Per-org totals are an aggregation over every row; on
  M0 that is fine at beta scale and would need caching later. Cache with a
  short TTL from the start rather than discovering it.
- **Suspension is a customer-visible act.** It needs the same care as the
  member-removal wording in §15 — one word apart from deletion, a decade of
  data apart.
