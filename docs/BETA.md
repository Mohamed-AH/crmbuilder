# Running the beta

> **Current reference · operator.** Verified against the code 2026-08-26.
> Internal: not served publicly. Deployment mechanics live in [DEPLOYMENT.md](../DEPLOYMENT.md).

Two documents in one: the operator runbook, and the note to send testers.

---

## Part 1 — Operator runbook

### Before you open it up

**1. Publish the Google consent screen.**
Google Cloud Console → APIs & Services → OAuth consent screen → *Publish app*.

No verification review is needed: the scopes used are `openid email profile`,
all non-sensitive. Google *does* require a homepage and a privacy policy URL,
which is what `/` and `/privacy` are for. Until this is published, only emails
on the Testing user list can sign in at all — that hand-adding is the manual
step this whole flow exists to remove.

**2. Check the environment.**

| Variable | Beta value | Why |
|---|---|---|
| `SIGNUP_MODE` | `code` | The *starting* mode only — change it later from Admin → Beta access, no redeploy |
| `ADMIN_EMAILS` | your address | Bypasses the gate, so you cannot lock yourself out |
| `BACKUP_TOKEN` | a random 32 bytes | Enables the nightly export; without it there is no backup |
| `FEEDBACK_WEBHOOK_URL` | optional Discord / Slack / Telegram | Real-time notice of problem reports — see *Where problem reports get pinged* |
| `MONGODB_URI` | your Atlas string | Without it, data is lost on every redeploy |

**3. Confirm the backup works before anyone depends on it.**
Run the Nightly backup workflow by hand, download the artifact, and restore it
into a scratch database following `DEPLOYMENT.md` → *Restoring, and testing that
you can*. A backup you have never restored is a rumour.

**4. Mint a code.**
Admin → Beta access → New beta code. Give it a label (which batch of people), a
cap, and an expiry. Copy the link — it carries the code.

**5. Smoke the deployment.**
```sh
BASE_URL=https://your-app.onrender.com npm run test:smoke
```

### While it is running

- **Watch usage.** Admin → the usage block, or `/health` signed in as a platform
  admin. It reports real `dataSize + indexSize`, not an estimate. `warn` at 60%,
  `critical` at 85%. Nothing is enforced — a cap firing mid-beta looks like the
  bug the tester was chasing.
- **Watch reports.** Admin → Problem reports. Each arrives with the app version,
  the screen, the browser, sync status, counts, and recent console errors.
  Resolve them as you go so the list stays meaningful.
- **Watch the codes.** Admin → Beta access shows uses remaining. Revoke one if a
  link escapes further than you meant.
- **Open or pause signups from that same panel.** *Invite only* · *Open* ·
  *Paused*, effective immediately and with no redeploy. Once you set it there,
  the `SIGNUP_MODE` variable stops deciding — a redeploy will not quietly undo
  you. Whatever it says, you and everyone who already has an account can always
  sign in, so pausing cannot lock you out. Accounts created while it is open
  keep working after you close it again.

### Where problem reports get pinged

`FEEDBACK_WEBHOOK_URL` is optional. Every report is stored either way and shows
up under Admin → Problem reports; the ping is only so you hear about it without
looking. Three services work, detected from the URL — there is no provider
setting to get wrong.

**Discord** — Server Settings → Integrations → Webhooks → New Webhook, copy the
URL. **Slack** — an Incoming Webhook app, copy the URL.

**Telegram** takes two steps, because the Bot API needs to know which chat:

1. Message [@BotFather](https://t.me/BotFather), `/newbot`, and keep the token
   it gives you.
2. Send your new bot a message (a bot cannot start a conversation), then open
   `https://api.telegram.org/bot<TOKEN>/getUpdates` and read `message.chat.id`
   out of the response. For a group, add the bot to it first and post something
   there; group ids are negative, which is normal.

```
FEEDBACK_WEBHOOK_URL=https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=<CHAT_ID>
```

The `chat_id` has to be on the URL — without it the report is still stored, and
the log says why nothing arrived.

**Treat that URL as a credential.** It carries the bot token, so anyone holding
it can post as your bot. It is an environment variable for the same reason
`BACKUP_TOKEN` is, and nothing logs it. Revoke with `/revoke` in BotFather.

Whichever service you point it at, it is told **who reported, when, and what
they wrote — and none of the diagnostic context.** Console errors can contain
record names and customer email addresses, and sending those to a chat service
would make it a processor of your testers' CRM contents. Those stay in the
database, where the privacy policy already accounts for them.

### Someone asked to join

People who find the site on their own can knock. Signing in without an invite
lands them on the private-beta screen, which now offers **Ask to join the beta**
and a line about what they would use it for.

They appear under **Admin → Requests to join**, and — if you set
`FEEDBACK_WEBHOOK_URL` — arrive wherever bug reports do.

**Approving lets them straight in. Nothing is emailed.** The approval
allowlists their address, so they come back, press the same button that refused
them, and it works. That is deliberate: there is no mail plumbing in this
product, and an approval that depends on you sending a link is an approval that
sits unsent. Approving copies a short reply to your clipboard if you want to
tell them anyway — that is a courtesy, not the mechanism.

Worth knowing before you work the queue:

- **The address is always real.** A request can only carry an email its sender
  has just proved to Google they control, so there is nothing to verify.
- **Declining is silent and final.** They see the ordinary private-beta screen,
  are not told they were turned down, and cannot ask again. That avoids an
  argument by email; it also means a misclick is invisible to both sides.
- **Someone still waiting is told so** rather than being shown "invite-only" a
  second time, which reads as having been ignored.
- **Approvals expire after 30 days** if unused (`ACCESS_APPROVAL_DAYS`). They
  can ask again.
- **Watch storage as you say yes.** The panel shows the usage warning at 60% and
  85%, because that is the moment the decision is being made. Nothing is
  enforced.

### Alerts

If `FEEDBACK_WEBHOOK_URL` is set, the deployment tells you before you think to
look. Rules are evaluated off the UptimeRobot ping, so nothing extra runs.

| Rule | Speaks at |
|---|---|
| Database | 60%, 85%, 95% of 512 MB |
| Memory | 70%, 85% of 512 MB |
| Bandwidth | 60%, 85% of the monthly allowance |
| Signup spike | more than `SIGNUP_SPIKE_PER_HOUR` (10) in an hour |
| Heavy tenant | one org over `TENANT_SHARE_LIMIT` (25%) of the database |

**Each level is announced once.** Crossing 60% messages you and then goes quiet
until 85%; it only speaks again at that level if usage drops back under and
climbs again. That is deliberate — an alert that repeats every fourteen minutes
is one you learn to swipe away.

**Admin → Beta access → Send a test alert** fires a message and reports what
every rule currently sees, so silence can be told apart from a webhook that has
been broken since you rotated the URL. Worth pressing once after any change to
`FEEDBACK_WEBHOOK_URL`.

Thresholds are environment variables (`EGRESS_LIMIT_BYTES`, `RAM_LIMIT_BYTES`,
`SIGNUP_SPIKE_PER_HOUR`, `TENANT_SHARE_LIMIT`). **Check `EGRESS_LIMIT_BYTES`
against Render's current plan** — a wrongly encoded limit is worse than none.

### Keeping it awake

UptimeRobot pings `/health` every 14 minutes, which is inside Render's ~15
minute idle window, so the service stays up. Two things to remember: that is
continuous, so it consumes roughly 744 of Render's 750 monthly instance-hours
and only works while this is the only free service on the account; and 14
minutes against a 15-minute timeout is one missed check away from a cold start.

### Drilling the backup

An untested backup is a rumour. This proves the nightly artifact can actually
be put back, and it never writes to production — it only reads a file GitHub
already holds.

**The one safety rule:** `restore.mjs` writes to **MongoDB whenever
`MONGODB_URI` is set**, and with `RESTORE_OVERWRITE=1` it clears every
collection first. Put `MONGODB_URI=` on every command below, and never set
`RESTORE_OVERWRITE` during a drill.

```sh
# 1. Actions → Nightly backup → newest green run → download and unzip the
#    artifact. Then restore it into a scratch directory, never ./data.
MONGODB_URI= BACKUP_FILE=./crmbuilder-backup-2026-01-01.json \
  DATA_DIR=./data/drill node scripts/restore.mjs

# 2. Boot the restored copy on a spare port.
MONGODB_URI= DATA_DIR=./data/drill PORT=9521 ALLOW_DEV_LOGIN=1 node server.js

# 3. When you are done.
rm -rf ./data/drill
```

Step 1 prints a count of accounts, organisations, workspaces, modules and
records, and **exits non-zero if any of them disagrees with the backup** — so a
silent partial restore fails loudly rather than telling you to go and look.

**Counts are necessary and not sufficient.** Rows restored into the *wrong*
workspace satisfy every total, so finish by opening the restored copy at
`http://localhost:9521`, signing in as a real account, and checking that its
own records are the ones you expect.

**What a restore does not bring back:** approved join requests, and the signup
mode and org-creation gate you set in the panel. Those fall back to the
deployment's environment variables, so **check Admin → Beta access after any
real restore** — a restore can quietly reopen signups you had paused.

Do this monthly against a real artifact, and again whenever the export changes
shape.

### If something goes wrong

| Symptom | First thing to check |
|---|---|
| Nobody can sign up | Consent screen still in Testing? Mode set to Paused in Admin → Beta access? Code spent or expired? |
| Someone says they asked and heard nothing | Admin → Requests to join. Approving is what lets them in; they do not need a link. |
| A tester sees "private beta" | Their code is spent, expired or revoked. Mint another. |
| Everything is slow on first load | Cold start. Check UptimeRobot is actually running. |
| Data looks wrong for one person | Ask them to check Settings → the sync chip, and to export a backup before you touch anything. |
| Storage warning at 85% | Export a backup, then look at the Organisations table. Check the **reclaimable** line under each size before you act: a tenant that is mostly tombstones will shrink on its own and is not the same problem as one that is genuinely large. |
| A workspace looks far bigger than its record count | Probably tombstones — the row will say `N% reclaimable`. Every delete leaves a small permanent row for 180 days, so a tester who loads and clears the demo data repeatedly builds them up faster than real records. Nothing to fix; deleted rows are not recoverable and the space comes back on its own. `node scripts/inspect.mjs` prints the same split per organisation, plus the date the first ones expire. |

### Standing up a demo workspace, locally

For seeing the operator panel, the role ladder and the storage figures doing
their job without waiting for real usage. **This runs on your own machine
against the file store — it is not a deployment step**, and it cannot reach
Atlas even if you ask it to (`CLAUDE.md` §34).

```sh
# 1. Seed. DATA_DIR keeps it away from your ordinary ./data.
DATA_DIR=./data/demo node scripts/seed-fixture.mjs --yes

# 2. Run against that same directory, with dev sign-in on.
#    MONGODB_URI must be EMPTY here — see the warning below.
MONGODB_URI= DATA_DIR=./data/demo ALLOW_DEV_LOGIN=1 node server.js

# 3. Open http://localhost:8321 and sign in as any account below.
#    Dev sign-in takes an email and no password.

# When you are done:
DATA_DIR=./data/demo node scripts/seed-fixture.mjs --clean --yes
```

**`MONGODB_URI` is the trap.** If it is set — including from a `.env` file the
server picks up — the server reads MongoDB and will not see a single thing the
fixture wrote. You get a working app with an empty workspace and no error, which
is the obvious way to lose an afternoon. `MONGODB_URI=` on the command line, as
above, clears it for that one process. The seed script warns you if it sees one
set, but it cannot know what the server will be started with.

**Two environment variables and nothing else:**

| Variable | Value | Why |
|---|---|---|
| `DATA_DIR` | `./data/demo` | Where the fixture is written and where the server reads it. Both commands must use the same one |
| `MONGODB_URI` | *empty* | Forces the file store. Anything else and the fixture is invisible |
| `ALLOW_DEV_LOGIN` | `1` | Lets you sign in as the fixture accounts without Google. **Off in production**, and the smoke test checks that |

### The demo accounts

Fixed, and they only change if `scripts/seed-fixture.mjs` changes. Every address
is on `.invalid`, which RFC 2606 reserves so it can never reach a real inbox.

| Sign in as | Role | Sees |
|---|---|---|
| `maya@fixture.invalid` | **owner** of Lumen Studio | Everything: module fields, invites, the team, the workspace name and currency |
| `daniel@fixture.invalid` | **member** | Records, including deleting them. No schema, no settings |
| `priya@fixture.invalid` | **contributor** | Add and edit records, but no Delete on a record |
| `sam@fixture.invalid` | **viewer** | Read and export only — a *View only* badge, records open as values, no write buttons anywhere |
| `ops@fixture.invalid` | **platform admin**, own org | The Admin screen: Deployment card, Organisations table, quotas, alerts |
| `nadia@fixture.invalid` | **owner** of Northwind Consulting | A second tenant, so no organisation reads as 100% of the database |

**To see the role work**, sign in as `maya` in one browser profile and `sam` in
another (or a private window) against the same server — the point is two people
in one workspace, which one profile cannot show you.

**What the fixture contains:** four organisations — Lumen Studio with the four
team members, Northwind with one, an operations org for the platform admin, and
one deliberately empty placeholder so you can recognise that row rather than
fear it. Plus tombstones aged 2–176 days across the retention window, so the
Organisations table's *reclaimable* figure has something real to show.

Not to be confused with **Load demo data** inside the app, which is a user
loading samples into their own workspace on their own device (`CLAUDE.md` §34).

### Closing the beta

Admin → Beta access → **Paused**. Existing accounts keep working; no new ones
are created. Take a final backup before changing anything else.

---

## Part 2 — For testers

*Copy this into whatever you send with the invite link.*

---

**Thanks for trying CRM Builder.**

It is a CRM you build yourself: pick the modules you need, add your own fields,
and use it from your phone or laptop. It works offline and installs like an app.

**Getting in.** Open the link we sent — it carries your access code — and sign
in with Google. The code is only needed once, to create the account.

**You don't need an account to look around.** The whole thing works without
signing in; your data just stays on that one device. Signing in is what lets you
use it on your phone as well, and share a workspace with colleagues.

**Two honest warnings:**

1. **Keep your own backup.** Settings → Export backup, any time, gives you
   everything as a file. We back up daily, so the worst case is losing a day —
   but this is a beta and you should not be the only one holding a copy.
2. **The first load of the day can be slow.** The server sleeps when nobody is
   using it and takes up to a minute to wake. The app itself opens instantly;
   it is signing in and syncing that waits.

**What would help most:** use it for something real, and tell us when it annoys
you. Settings → **Report a problem** sends your message with the technical
details attached, so you do not have to describe what browser you are on. Small
irritations are as useful as crashes — those are the things that never get
reported and never get fixed.

**Pass it on if you like.** Anyone can open the site and use it without an
account. If they want one, signing in with Google shows them a *Ask to join the
beta* button — we work through those by hand.

**Known rough edges right now:**

- **Deleting a record cannot be undone.** There is no bin to fish it back out
  of, and the delete travels to everyone's device. If a colleague shouldn't be
  able to delete, give them the **Contributor** role — they can add and edit
  but not delete. **Viewer** is read-only.
- Everyone on a team can see every module; roles govern what you can *do*, not
  what you can see, and there is no per-module access.
- No email notifications of any kind.
- The guided tour needs sample data, and offers to load it. Settings → Remove
  sample data takes it back out and keeps anything you added.

[Privacy](/privacy) · [Terms](/terms)
