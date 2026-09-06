# Deploying CRM Builder

CRM Builder deploys as a single Node web service. This guide covers the
recommended free stack: **Render (free tier) + MongoDB Atlas (free tier) +
Google OAuth**. Total cost: $0.

## Choosing a deployment shape

There are two supported shapes, and they are the same application — only the
isolation boundary differs.

| | **Pooled** (Option B) | **Dedicated** (Option D) |
|---|---|---|
| Blueprint | `render.yaml` | `render.dedicated.yaml` |
| Render service | one, shared | one per client |
| MongoDB | one cluster, shared | one cluster per client |
| Isolation | `orgId` on every scoped query | infrastructural — nothing is shared |
| URL | one for everyone | the client's own |
| Cost per client | ~$0 | one service + one cluster |
| Onboarding a client | they sign up | you provision, ~30 min |
| `DEPLOYMENT_MODE` | `pooled` | `dedicated` |

**Start pooled.** It is the default, it is what
`crmbuilder-v1.onrender.com` runs, and the tenant isolation it relies on is
covered by eight tests in `tests/api.test.mjs` that assert the attack — an
owner in org B reaching for org A's accounts, workspaces and stats — rather
than the happy path.

**Move a client to dedicated** when the reason is one pooled hosting cannot
answer: contractual single-tenancy, data residency in a particular region, a
retention or audit regime of their own, or volume that warrants resources
nobody else can consume. "They are an important customer" is not one of
those reasons; `orgId` scoping does not get stronger by being lonely.

What dedicated actually buys is that a bug in a query filter cannot cross a
tenant boundary, because there is no other tenant in the database. What it
costs is that every deploy, every migration and every incident is now N
times the work.

### Environment matrix

| Variable | Pooled | Dedicated | Notes |
|---|---|---|---|
| `NODE_ENV` | `production` | `production` | |
| `SESSION_SECRET` | generated | generated | per service; rotating it signs everyone out |
| `MONGODB_URI` | shared cluster | the client's own cluster | never point a dedicated service at the pooled cluster |
| `APP_URL` | the shared URL | the client's URL | must match the OAuth redirect URI exactly |
| `GOOGLE_CLIENT_ID` / `_SECRET` | one pair | the client's own pair | a shared pair would list every client's URL as an origin |
| `ADMIN_EMAILS` | your operators | see below | |
| `DEPLOYMENT_MODE` | `pooled` | `dedicated` | reported by `/health` |
| `TENANT_NAME` | unset | the client's short name | reported by `/health`, so instances are distinguishable |
| `HEALTH_DETAIL` | **unset** | `1` | exposes org/user counts on public `/health` — a customer count on a pooled deployment |
| `EVENT_RETENTION_DAYS` | `90` (default) | as contracted | analytics events TTL |
| `TOMBSTONE_RETENTION_DAYS` | `180` (default) | as contracted | how long a deleted record's tombstone survives, i.e. how long a device may be offline and still learn about the delete |
| `FEEDBACK_RETENTION_DAYS` | `90` (default) | `90` | problem reports TTL |
| `SIGNUP_MODE` | `code` | `open` | the **starting** mode only — see *Who can create an account* |

**Limits and alerting.** These decide what the Deployment card meters against
and when a webhook fires. Every one has a working default; set them when the
hosting plan is not the free tier they assume.

| Variable | Default | Notes |
|---|---|---|
| `EGRESS_LIMIT_BYTES` | `5 GB` | Render's free monthly bandwidth. **Check this against your actual plan** — a wrongly encoded limit is worse than none |
| `RAM_LIMIT_BYTES` | `512 MB` | the free instance's memory ceiling; the meter reads container RSS |
| `SIGNUP_SPIKE_PER_HOUR` | `10` | signups in one hour that count as a spike worth telling you about |
| `TENANT_SHARE_LIMIT` | `25` | percent of the database one org may hold before it is called out |
| `ALERT_MIN_GAP_MS` | `300000` (5 min) | floor between alert evaluations, independent of how often `/health` is hit |
| `ACCESS_APPROVAL_DAYS` | `30` | how long an unused approval stays on the allowlist |
| `ACCESS_REQUEST_CEILING` | `500` | pending requests beyond which new ones are refused |
| `PLATFORM_CACHE_MS` | `30000` | TTL on `/api/admin/platform`; the per-org byte totals are an aggregation over every row, so they are cached from the start rather than after it hurts. `?fresh=1` bypasses it |
| `EGRESS_FLUSH_MS` / `EGRESS_FLUSH_BYTES` | `60000` / `256 KB` | how often the bandwidth counter is written down. It also flushes on SIGTERM, because a free instance spins down constantly and an unflushed counter reads low forever |
| `RATE_WINDOW_MS` | `60000` | the rate limiter's window |
| `RATE_AUTH_MAX` | `60` | OAuth callbacks per window per IP. Each one makes the server exchange a token with Google, so this bounds outbound work — it is **not** brute-force protection, because there is no password to guess |
| `RATE_ASK_MAX` | `5` | access requests per window per IP. The queue an operator works by hand is otherwise trivially floodable |
| `REMINDER_HEALTHCHECK_URL` | *(unset)* | Healthchecks.io ping URL for the reminder pass. Pinged when a pass completes — `<url>/fail` when a workspace's delivery failed, so silence ("the deployment is gone") and failure ("it is running and something is broken") stay distinguishable. A bearer credential: environment only, never `platform`, never logged. Unset means the pass simply has no dead-man's switch |
| `REMIND_MIN_GAP_MS` | `300000` | minimum wall-clock gap between reminder passes, so a burst of keep-warm pings costs one scan. Not the thing that stops a second digest — that is the once-per-workspace-per-local-day rule, which this does not replace |
| `REMIND_MAX_PER_PASS` | `25` | workspaces scanned per pass. A ceiling on what one `/health` ping can cost as tenant count grows; the ones it skips are picked up by the next ping the same day |
| `RATE_HOOK_TEST_MAX` | `6` | webhook test sends per window per IP. Owner-only already, so this is not about the population — it is the one authenticated route that makes the server dial an address the caller chose. The block list in `lib/safe-fetch.js` is the control; this bounds what a compromised owner account can do with it |
| `SYNC_BODY_LIMIT` | `8mb` | body limit for `/api/sync` and `/api/data` only. Every other route is capped at 64 KB |
| `TELEGRAM_API_BASE` | `https://api.telegram.org` | **A test seam — do not set it on a real deployment.** It redirects the Telegram chat lookup at a fake, and setting it also stands the SSRF block list down for that one call so a local capture server is reachable. One variable rather than two on purpose: a deployment that does not redirect the host cannot reach the relaxed path. Same shape as `GOOGLE_TOKEN_URL` |

**The rate limiter counts per instance, in memory.** On a single free-tier
service that is the whole deployment. On a multi-instance one the effective
limit multiplies by the instance count — a shared counter would need a Mongo
round trip per request, which costs more than the attack it prevents at this
size.

**It also depends on `trust proxy` being set**, which it is (`1`, for Render's
edge). Without it every client would share one bucket and the limiter would be
a self-inflicted outage rather than a defence.

The database and bandwidth meters need no configuration to be correct: storage
is what MongoDB reports as `dataSize + indexSize`, and bandwidth is counted as
response bodies are written. Neither is a records × constant estimate — indexes
and tombstones are real storage, and an estimate that ignores them reads fine
right up until the tier fills.

`ADMIN_EMAILS` grants `platformAdmin`, which crosses orgs. On the pooled
deployment that means your operators and nobody else — never a customer. On a
dedicated deployment there is only one customer, so it can be their own IT
lead; decide which before the first sign-in, because **on a deployment that
names nobody, the first account to sign in becomes a platform admin**. Setting
`ADMIN_EMAILS` before anyone signs in removes that entirely.

### Moving an existing client from pooled to dedicated

There is no automated migration, and inventing one would be worse than the
manual path for the handful of times this happens.

1. Stand up the dedicated deployment and verify `/health` reports
   `"deployment":"dedicated"` and the right `tenant`.
2. Have the client export a backup from **Settings → Export** on a device
   that shows `Synced`. This is the authoritative copy — it is a full
   workspace including every record.
3. Sign in on the new deployment and use **Settings → Import**. An import
   re-dates every row to now, deliberately, so it wins the first sync.
4. Confirm the record count matches what the pooled admin dashboard showed.
5. Only then remove their org from the pooled deployment.

Do not skip step 4. The pooled account keeps working until you delete it,
which means a mistake at step 3 is recoverable — right up until it isn't.

## 1. MongoDB Atlas (free tier)

1. Create an account at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas) and create a **free M0 cluster** (any region close to your Render region).
2. Under **Database Access**, add a database user with a strong password (role: *Read and write to any database*).
3. Under **Network Access**, add `0.0.0.0/0` (Render's free tier has no static outbound IPs).
4. Click **Connect → Drivers** and copy the connection string, e.g.
   `mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`
   This becomes `MONGODB_URI`. The app creates its collections (`users`, `orgs`, `modules`, `records`, `data`, `events`) and their indexes automatically in the `crmbuilder` database on first boot.

## 2. Google OAuth credentials

1. Go to [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials), create a project.
2. Configure the **OAuth consent screen** (External, app name "CRM Builder", add your email; publishing status "Testing" is fine to start — add your users as test users, or publish for open signup).
3. Create **Credentials → OAuth client ID → Web application**:
   - Authorized JavaScript origins: `https://<your-app>.onrender.com`
   - Authorized redirect URIs: `https://<your-app>.onrender.com/auth/google/callback`
4. Copy the **Client ID** and **Client Secret**.

> You can deploy without Google credentials — the app then runs sign-in-less
> (fully local, per-device data). Add the credentials later to enable accounts.

## 3. Render (free tier)

The repo contains a `render.yaml` blueprint.

1. Push this repository to GitHub.
2. In the [Render dashboard](https://dashboard.render.com): **New → Blueprint**, pick the repo. Render reads `render.yaml` and creates the web service on the **free** plan (`SESSION_SECRET` is generated automatically).
3. Set the remaining environment variables when prompted (or later under *Environment*):

   | Variable | Value |
   |---|---|
   | `APP_URL` | `https://<your-app>.onrender.com` (shown after first deploy) |
   | `MONGODB_URI` | the Atlas connection string from step 1 |
   | `GOOGLE_CLIENT_ID` | from step 2 |
   | `GOOGLE_CLIENT_SECRET` | from step 2 |
   | `ADMIN_EMAILS` | comma-separated emails that should get the admin role |

4. Deploy. Health checks hit `/health`.

Alternatively skip the blueprint: **New → Web Service**, runtime Node,
build command `npm install --omit=dev`, start command `npm start`, plan Free,
and set the env vars above plus `NODE_ENV=production` and a random `SESSION_SECRET`.

### Free-tier notes

- **Cold starts**: free web services spin down after ~15 minutes idle; the first request afterwards takes ~30–60s. The PWA hides this well — the app shell loads instantly from the service worker cache and data loads locally, then syncs when the server wakes.
- **Disk is ephemeral**: don't rely on the file-store fallback in production — set `MONGODB_URI`. (Without it the server still runs, but synced data would be lost on redeploys.)
- **Admin role**: any email listed in `ADMIN_EMAILS` becomes a platform admin. The *first account ever to sign in* also does, **but only when `ADMIN_EMAILS` is empty** — otherwise whoever discovered a freshly deployed URL first would own the instance. Set `ADMIN_EMAILS` before the first sign-in and that window never exists. Admins get the **Admin** section in the sidebar (accounts, business analytics).

## 4. Verify the deployment

1. Open `https://<your-app>.onrender.com` — the onboarding screen should load.
2. `https://<your-app>.onrender.com/health` should report `"storage":"mongodb"` and `"sync":"per-record"` — if storage says `"file"`, `MONGODB_URI` isn't set. It must **not** report `counts` on a pooled deployment; if it does, `HEALTH_DETAIL` is set and should not be.
   (`/healthz` still answers `{"ok":true,"storage":"..."}` for anything already probing it.)
3. Sign in with Google, create a module, then open the site in a private window and sign in again — your workspace should sync down.
4. Install it: browser menu → *Install CRM Builder* (desktop) or *Add to Home Screen* (mobile).
5. Run the audit from a machine that can reach the URL:
   `BASE_URL=https://<your-app>.onrender.com npm run test:smoke`
6. `https://<your-app>.onrender.com/CLAUDE.md` should be **404**, with exactly
   that capitalisation. The audit checks this and seven sibling paths, but it
   is worth seeing once by hand — see *What the deployment publishes*.

### What the deployment publishes

The server serves an explicit allow-list, not the repository: `css/`, `js/`,
`fonts/`, `icons/`, the root HTML pages with `/privacy` and `/terms` aliases,
`legal.css`, `manifest.webmanifest`, `sw.js`, and exactly two documents —
`/docs/manual.html` and `/docs/product-tour.html`, which are customer-facing.

Everything else 404s, including every other file under `docs/`, the markdown at
the repository root, `package.json` and `.git/`. **Adding a file to the app
means adding it to that list** (`ASSET_DIRS` / `PUBLIC_ROOT_FILES` /
`PUBLIC_DOCS` in `server.js`), or it works locally from cache and 404s in
production.

This replaced `express.static(__dirname)`, which published the whole repository
— including, on any deployment that had fallen back to the file store,
`/data/store.json`. Two things had kept it invisible: Linux is case-sensitive,
so `/claude.md` missed `CLAUDE.md` entirely, and the SPA catch-all answered
every unmatched path with 200 and the app shell, so a probe that found nothing
and a probe that found a file looked the same.

## Running a beta

The step-by-step version — publish the consent screen, mint a code, what to
watch, and the note to send testers — is **[docs/BETA.md](docs/BETA.md)**. This
section is the reference for the moving parts it refers to.

### Keeping the service awake

Render's free tier spins a web service down after ~15 minutes idle, and the
first request afterwards waits 30–60 seconds. That is survivable for a demo you
control and corrosive for testers who drop in unannounced, so point an external
uptime checker at `/health`.

**Currently configured: UptimeRobot, every 14 minutes.** That is inside the
idle window, so the service stays up continuously.

Two things to know about that:

- **It uses your whole free allowance.** Render gives 750 instance-hours a month
  across the account, and a 31-day month is 744 hours. Continuous keep-warm
  leaves ~6 hours of headroom and only works if this is the only free service
  on the account. If you add another, either narrow the ping to working hours
  or expect to be throttled.
- **14 minutes against a 15-minute timeout is one missed check from asleep.**
  Ten minutes would give real margin. Not worth changing on its own, but if you
  see cold starts in the logs, that is the first thing to look at.

Do not use GitHub Actions for this. Scheduled workflows are explicitly
best-effort and are routinely delayed under load, which at this cadence means
the service sleeps anyway.

### Backups

**MongoDB M0 has no automated backups and no point-in-time recovery.** A nightly
export is the entire safety net.

> **The backup workflow does not live in this repository.** It runs from the
> private repo **`Mohamed-AH/crmback`**, and that is the copy to edit.
>
> **This repository is public, and so are its build artifacts.** A backup is a
> complete dump of every customer's records, accounts and organisations — plus
> `accessRequests`, which carries the addresses of people who asked for access
> and were *declined*. Running the job here would publish all of it. The
> workflow was removed rather than left in place unconfigured, because a
> workflow with no secrets **skips and reports success**: it showed a green tick
> every night while producing no backups at all, which is worse than a red one.
>
> Its history is still here — `git log -- .github/workflows/backup.yml`.

Set up, in `crmback`:

1. Generate a token: `openssl rand -base64 32`
2. Add `BACKUP_TOKEN` to the Render service's environment.
3. Add the same value as a GitHub Actions **secret** named `BACKUP_TOKEN`, plus
   `BACKUP_URL` set to the deployment's URL.
4. Add `HEALTHCHECK_URL` — a healthchecks.io ping URL, period 1 day, grace
   6 hours. Without it the job still backs up, but nothing tells you when it
   stops. GitHub disables scheduled workflows after 60 days of repository
   inactivity, silently, and a repo holding one workflow goes quiet fast.
5. Run the workflow once by hand (Actions → Nightly backup → Run workflow),
   check the artifact, and confirm the check's *Last Ping* moved.

**Then drill it.** `docs/BETA.md` § *"Drilling the backup"* restores a real
artifact into a scratch directory. Do it monthly — restoring a real one is what
found a defect the automated test could not see, because the test's fixture and
the code shared an assumption (`CLAUDE.md` §17).

The endpoint is `GET /api/admin/export`, and it is deliberately awkward:

- It returns 404 when `BACKUP_TOKEN` is unset, so nothing can discover whether
  a deployment has backups.
- The token goes in `Authorization: Bearer …` and **only** there. A correct
  token in a query string is refused with an explanation, because Render logs
  request URLs — `?token=` writes a credential into plaintext logs, browser
  history and `Referer`.
- A platform-admin session is **not** accepted in place of the token. A stolen
  admin cookie must not also be a database dump.

Rotate the token if a backup artifact is ever shared, since the artifact is the
data the token protects.

### Restoring, and testing that you can

An untested backup is a rumour. Do this once before opening the beta, and again
whenever the export format changes:

1. Download an artifact from the Nightly backup workflow.
2. Create a scratch Atlas database (or run locally with no `MONGODB_URI`, which
   uses the JSON file store).
3. Restore into it:
   ```sh
   # into a scratch Atlas database
   BACKUP_FILE=crmbuilder-backup-YYYY-MM-DD.json \
     MONGODB_URI="mongodb+srv://.../scratch" node scripts/restore.mjs

   # or into a local file store, which needs nothing set up
   BACKUP_FILE=crmbuilder-backup-YYYY-MM-DD.json \
     DATA_DIR=./data/restored node scripts/restore.mjs
   ```
   It refuses to write into a database that already holds accounts unless
   `RESTORE_OVERWRITE=1` is set — restoring over live data should take saying
   twice — and counts the rows back out afterwards.
4. Start the server against the restored data, sign in as one of the restored
   accounts, and confirm the workspace is there with the right record count.

This round trip has been run, not just written down: a workspace with a live
record, changed settings and one deleted record was exported, restored into an
empty store, and read back with the live record present, the settings intact,
and the deletion still a deletion.

One thing that will look like a bug and is not: **tombstones older than
`TOMBSTONE_RETENTION_DAYS` are pruned at boot**, so restoring very old test
data can come back without its tombstones. That is the retention policy doing
its job, not the restore losing them.

The export carries **raw envelopes including tombstones**. That is deliberate:
a restore that dropped tombstones would resurrect every deleted record on every
device at the next sync.

### Watching usage

`/api/admin/stats` and `/health` both report a `usage` block to a platform
admin: real `dataSize + indexSize` from MongoDB rather than an estimate, and a
`level` of `ok`, `warn` (60%) or `critical` (85%) against the 512 MB M0 limit.

**Admin → Deployment** is the fuller view, and is platform-admin only. Three
meters — database, container memory, monthly bandwidth — plus an
**Organisations** table listing every tenant heaviest first with its share of
what is actually stored. That is the reading that answers "is one customer
about to fill the shared database", which the combined figure cannot.

Two levers sit beside it, and both are reversible:

- **New organisations: Allowed / Capped.** Capping stops new *tenants* while
  still letting a colleague invited to an existing team sign up and join. That
  is why it is a separate switch from pausing signups — pausing signups would
  lock out every existing customer's next hire.
- **Pause an organisation.** Its workspace becomes read-only: sync still pulls,
  writes are refused with a named reason the client shows, and nothing is
  deleted. `deleteAccount()` remains the only thing that can remove a workspace.

Alerts fire to `FEEDBACK_WEBHOOK_URL` when a threshold is crossed — see
`docs/BETA.md` → *Alerts* for the rules and the escalate-only behaviour.

Nothing is enforced. A hard cap firing mid-beta looks like the bug the tester
was chasing, and you end up debugging your own limiter. The numbers exist to be
looked at before that becomes a decision.

### Who can sign up

`SIGNUP_MODE` sets the **starting** mode. After that it is changed from
**Admin → Beta access**, which takes effect immediately and needs no redeploy —
and, once used, wins over the variable so a deploy cannot silently undo it:

| Value | Effect |
|---|---|
| `code` (default) | A beta code is needed to **create** an account. Signing back in never asks. |
| `open` | Anyone who can authenticate gets an account. |
| `closed` | No new accounts; everyone who has one still works. |

Mint codes from the admin dashboard (**Beta access → New beta code**), each with
a use cap and an expiry, and send the link it gives you.

The gate is checked in a fixed order, and the order is load-bearing:

1. **An account that already exists** — a returning tester is never asked for a
   code they used weeks ago. The gate is on signup, never on sign-in.
2. **An address in `ADMIN_EMAILS`** — so you cannot lock yourself out.
3. **The very first account, but only when `ADMIN_EMAILS` is empty.** Without
   this a fresh install in `code` mode has no way in at all: minting a code
   needs a platform admin and becoming one needs a signup. It is conditioned on
   `ADMIN_EMAILS` because otherwise whoever finds a freshly deployed URL first
   owns the instance — with operators named, rule 2 already lets them in.
4. **An approved request to join** — see `docs/BETA.md`.
5. **The new-organisation cap**, if set to Capped and this signup would mint a
   brand-new tenant.
6. **The mode itself** — `open` admits anyone; a still-pending request is told
   so rather than shown "invite-only" a second time; `closed` refuses.
7. **The beta code.**

Every refusal except *pending* answers identically, so codes cannot be
enumerated by the difference between "wrong" and "expired".

## Local development

```sh
npm install
npm run dev        # http://localhost:8321
```

With no env vars set, local dev uses file storage (`./data/store.json`, git-ignored)
and a passwordless **dev sign-in** (email only) so you can test accounts, sync,
and the admin dashboard without any external services. Set `MONGODB_URI` and/or
Google credentials in your shell to test the production paths.

You can also serve the frontend alone as a static site (`python3 -m http.server`) —
everything works per-device with sign-in disabled.
