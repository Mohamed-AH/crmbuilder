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

`ADMIN_EMAILS` grants `platformAdmin`, which crosses orgs. On the pooled
deployment that means your operators and nobody else — never a customer. On a
dedicated deployment there is only one customer, so it can be their own IT
lead; decide which before the first sign-in, because **the first account ever
to sign in becomes a platform admin regardless**.

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
- **Admin role**: the *first account ever to sign in* automatically becomes admin, and so does any email listed in `ADMIN_EMAILS`. Admins get the **Admin** section in the sidebar (accounts, business analytics).

## 4. Verify the deployment

1. Open `https://<your-app>.onrender.com` — the onboarding screen should load.
2. `https://<your-app>.onrender.com/health` should report `"storage":"mongodb"` and `"sync":"per-record"` — if storage says `"file"`, `MONGODB_URI` isn't set. It must **not** report `counts` on a pooled deployment; if it does, `HEALTH_DETAIL` is set and should not be.
   (`/healthz` still answers `{"ok":true,"storage":"..."}` for anything already probing it.)
3. Sign in with Google, create a module, then open the site in a private window and sign in again — your workspace should sync down.
4. Install it: browser menu → *Install CRM Builder* (desktop) or *Add to Home Screen* (mobile).
5. Run the audit from a machine that can reach the URL:
   `BASE_URL=https://<your-app>.onrender.com npm run test:smoke`

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

**MongoDB M0 has no automated backups and no point-in-time recovery.** The
nightly export in `.github/workflows/backup.yml` is the entire safety net.

Set up:

1. Generate a token: `openssl rand -base64 32`
2. Add `BACKUP_TOKEN` to the Render service's environment.
3. Add the same value as a GitHub Actions **secret** named `BACKUP_TOKEN`, plus
   `BACKUP_URL` set to the deployment's URL.
4. Run the workflow once by hand (Actions → Nightly backup → Run workflow) and
   check the artifact.

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

Nothing is enforced. A hard cap firing mid-beta looks like the bug the tester
was chasing, and you end up debugging your own limiter. The numbers exist to be
looked at before that becomes a decision.

### Who can sign up

`SIGNUP_MODE` controls it:

| Value | Effect |
|---|---|
| `code` (default) | A beta code is needed to **create** an account. Signing back in never asks. |
| `open` | Anyone who can authenticate gets an account. |
| `closed` | No new accounts; everyone who has one still works. |

Mint codes from the admin dashboard (**Beta access → New beta code**), each with
a use cap and an expiry, and send the link it gives you. Three bypasses exist,
in this order: an account that already exists, an address in `ADMIN_EMAILS`, and
the very first account on an empty deployment — without that last one a fresh
install in `code` mode would have no way in at all.

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
