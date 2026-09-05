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
Run the **Nightly backup** workflow by hand — it lives in the private repo
`Mohamed-AH/crmback`, not in the app repo (`DEPLOYMENT.md` → *Backups* says
why) — then follow § *"Drilling the backup"* below. A backup you have never
restored is a rumour.

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

### Knowing the backup ran

The nightly job pings **Healthchecks.io** as its last step, and Healthchecks
alerts you when a ping does not arrive.

That is worth having because of how this fails. When `BACKUP_URL` or
`BACKUP_TOKEN` is unset the job **skips and the run goes green** — which is how
the deployment ran for weeks with a tick every night and no backups at all.
Nothing was red, and nothing was going to be. The same shape returns on its own
later: GitHub disables scheduled workflows after **60 days of repository
inactivity**, silently, and a repo holding only this workflow goes quiet fast.

**Setting it up:**

1. Create a free check at healthchecks.io. Period **1 day**, grace **1 day** —
   a nightly job that has not reported in 25 hours is worth a message.
2. Point it at Telegram or email.
3. Copy its ping URL into the backup repo's secrets as **`HEALTHCHECK_URL`**.

The ping URL is a bearer credential — anyone holding it can fake a success — so
it goes in a secret and is never echoed into a log.

**What you should see.** On a good run, the last step prints
`Pinged Healthchecks.` If the secret is unset it prints
`HEALTHCHECK_URL is not set — this backup has no dead-man's switch` and carries
on, because a missing ping URL is not a reason to fail a backup that worked.

If the ping itself fails you get a **warning, not a red run**, for the same
reason: the backup succeeded and is stored. Healthchecks will alert you about
the absent ping anyway, and the warning in the log is what distinguishes "the
URL is wrong" from "the deployment is down" — opposite problems with the same
symptom.

### Trying the daily digest, end to end

**Locally, in about ten minutes, without waiting a day.** The pass normally
fires off the keep-warm ping and refuses to run twice for the same workspace on
the same local day — both of which make it awkward to watch. This drives it on
purpose instead.

You need a webhook URL you can watch. A throwaway Slack or Discord channel is
ideal. If you have neither, `https://webhook.site` gives you a URL and a live
log in one click — but treat it as public, because it is.

**It cannot be a local capture server, and that is the guard working.** A
customer-supplied webhook may not dial a private address, so
`http://127.0.0.1:9000/hook` is refused twice over — once for `http:` and once
for loopback. Steps 3, 5 and 7 all work offline against a URL that never
delivers; only step 4 and the message itself need a real public HTTPS
destination.

**1. Start a server with the day-gate loosened.**

```sh
MONGODB_URI= DATA_DIR=./data/digest-trial ALLOW_DEV_LOGIN=1 \
  REMIND_MIN_GAP_MS=0 node server.js
```

`MONGODB_URI=` is the trap that bites here as it does with the fixture: with one
set — including from a `.env` the server picks up — the server reads Mongo and
none of this exists.

`REMIND_MIN_GAP_MS=0` only removes the five-minute gap *between passes*. The
once-per-workspace-per-day rule is still on, deliberately, and step 6 is how you
get around it.

**2. Sign in and give yourself something that is due.**

Open `http://localhost:8321`, load the demo business from the onboarding
screen, then sign in (dev sign-in takes any email, no password) choosing
**bring everything** so the samples come with you. The demo seeds Tasks with
overdue due-dates, so there is something real to count.

**3. Check the filter first, so you know the right answer.**

Open **Tasks** → the **Due date** filter → *next 7 days*. Write down the number
in the count badge. **The digest must say exactly this.** If it does not, that
is a bug worth reporting, not a rounding difference.

**4. Point it at your channel.**

Settings → **Notifications** → paste the webhook URL → **Save webhook**. You
should get *"Webhook saved, and a test message went through"* and a message in
the channel. Then press **Send a test message** to prove the button separately.

**5. Read the digest before you switch it on.**

Under **Daily digest**, set *Look ahead* to **next 7 days** and *Not before* to
**00:00**, then look at the preview block. It shows the **exact string** your
team would receive — that is deliberate, so nobody's first sight of the message
is in a shared channel. Check the Tasks number against step 3. Then set
**Send it → Once a day** and save.

**6. Make it fire now.**

```sh
curl -s http://localhost:8321/health > /dev/null
```

That is the real mechanism, not a test hatch: in production UptimeRobot hits
`/health` every 14 minutes to keep the free tier awake, and the pass rides on
the back of it. No cookie, no authentication — the endpoint is public and the
pass runs for any caller, because the keep-warm ping is the only regular caller
there is.

The pass happens *after* the response, so `curl` returns instantly and the
message lands a moment later.

**What you should see:** one message in the channel, of the shape

```
Lumen Studio — 9 items need attention
• Tasks: 4 overdue, 5 due within 7 days
http://localhost:8321
```

Your numbers will differ — they are whatever the demo data and today's date
make true — but the **shape** is fixed, and the Tasks count must match step 3.
On a hand-seeded workspace with one overdue and one upcoming row it reads
`Lumen Studio — 2 items need attention · Tasks: 1 overdue, 1 due within 7
days`, which is what this runbook was checked against.

**7. Prove it will not send twice.**

Hit `/health` again. **Nothing new arrives**, and Settings still shows the same
*Last checked* time. That is the once-per-local-day rule, and it is what stops
a digest becoming a stream.

To watch a second one, delete `./data/digest-trial` and start over, or edit
`reminded.lastRunOn` for that workspace in `store.json` with the server
stopped — FileStore holds the store in memory and rewrites the whole file, so
editing it under a running server is clobbered.

**Things worth trying because they are the interesting cases:**

| Try this | What should happen |
|---|---|
| Set *Look ahead* to **next 30 days** and re-read the preview | The count grows and the wording says `due within 30 days` |
| Clear every overdue task, then force a pass | **No message at all.** A quiet day is silent by design |
| Name a module `<!channel> urgent` and re-read the preview | It appears as text, inert — it cannot wake a Slack channel |
| Point the webhook at `https://127.0.0.1/x` | Refused at save, with a reason. Customer-supplied URLs may not dial private addresses |
| Point it at `https://nothing.invalid/x` | **Saved**, with the failure recorded. Unreachable-right-now is a property of the moment, not of the URL |
| Sign in as a member of the same team and open Settings | No Notifications card at all — this is owner-only |

**And what it will not do**, so the trial does not read as a fault:

- It never names a record. *"Tasks: 4 overdue"*, never which four.
- It will not send twice in a day, even if you want it to.
- It does not chase anything that becomes due later the same day — that is
  tomorrow's message.
- Nothing arrives at a fixed clock time: *Not before* is a floor, and the
  message goes on the first pass after that hour.

### Knowing the daily digest is still running

The reminder pass (§39) runs off the same `/health` ping that keeps the free
tier awake. That is cheap and needs no scheduler, and it has one consequence
worth naming: **if the keep-warm ping stops, the digest stops, and nothing
inside the deployment can tell you** — the alert rules run off that same ping,
so whatever would have noticed has stopped too.

A second Healthchecks check closes it, and it covers **both** failure modes at
once: the engine wedging, and the ping loop dying. Either stops the pass, and
either therefore stops the signal.

**Setting it up:**

1. Create a second free check at healthchecks.io — name it something like
   **crmbuilder reminders**. Period **1 hour**, grace **1 hour**.
   The pass runs roughly every 14 minutes behind UptimeRobot, so two hours of
   silence is a real stall rather than a blip.
2. Point it at the same place as the backup check.
3. Copy its ping URL into **Render → the service → Environment** as
   `REMINDER_HEALTHCHECK_URL`, and redeploy.

The ping URL is a bearer credential — anyone holding it can fake a success —
so it lives in the environment and never in `platform`, which is in every
nightly backup artifact (§17).

**What you should see.** Within about fifteen minutes of the redeploy, the
check goes green and its log shows a line like
`scanned 0, sent 0, failed 0, 3ms`. Counts only: the ping body never carries a
workspace or module name, because that log is one more place a customer's data
must not appear.

**Green with `sent 0` is correct.** The check asserts that a pass *ran*, not
that anything was sent — a quiet weekend, or a deployment where nobody has
switched the digest on, is the engine working. Gating it on "something was
sent" would page you every Sunday, which is the fastest way to learn to ignore
it.

**A red check means one of two things**, and they are different:

| What you see | What it means |
|---|---|
| **No ping** (the check just goes down) | The deployment is asleep, or the pass is throwing before it finishes. Check that UptimeRobot is still pinging `/health`. |
| **An explicit failure** (a `/fail` ping) | The deployment is fine and *running*; one or more workspaces could not have their digest delivered. Admin → Deployment shows the last pass, and each owner's Notifications card shows their own reason. |

Silence and `/fail` are opposite problems with opposite responses, which is why
the pass signals them differently rather than just going quiet.

**Without it set**, nothing breaks and nothing is logged loudly — the pass just
has no dead-man's switch, exactly as the backup did before its own check
existed.

### Drilling the backup

**An untested backup is a rumour.** This proves that a *real* nightly artifact
can be put back. It reads a file GitHub already holds and never writes to
production — nothing here touches the live deployment or its database.

`tests/backup.test.mjs` already runs the same export → restore → boot cycle on
every push, so the *mechanism* is covered by CI. What CI cannot do is prove that
**your actual artifacts** restore, because it only ever tests a fixture it built
seconds earlier. That is what this drill is for, and it is the only part that
needs a human.

Do it **monthly**, and again after any change to the export.

---

#### Before you start

**The one safety rule.** `restore.mjs` writes to **MongoDB whenever
`MONGODB_URI` is set**, and with `RESTORE_OVERWRITE=1` it clears every
collection first. That is the live database, one environment variable away.

- Put `MONGODB_URI=` on **every** command below. It clears the variable for
  that one process, including anything a `.env` would have supplied.
- **Never** set `RESTORE_OVERWRITE` during a drill. It has no use here.
- Restore into a scratch directory, **never `./data`**.

**The artifact is every customer's data.** Treat the download like a database
dump, because it is one: keep it out of shared folders, and delete it when you
are done (step 6).

---

#### Step 1 — Get an artifact

In the **private** repo `Mohamed-AH/crmback` — not the app repo — go to
**Actions** → **Nightly backup** → the newest green run → download
**`crmbuilder-backup`** from the Artifacts section, and unzip it. You get a file
named `crmbuilder-backup-YYYY-MM-DD.json`.

**What you should see:** a file of tens to hundreds of kilobytes. A file of a
few hundred *bytes* means the export returned an error page instead of a
backup — stop and check `BACKUP_TOKEN` on the service.

> Artifacts expire after 30 days, so there is nothing older than that to test.

#### Step 2 — Restore it into a scratch directory

```sh
MONGODB_URI= BACKUP_FILE=./crmbuilder-backup-2026-01-01.json \
  DATA_DIR=./data/drill node scripts/restore.mjs
```

**What you should see** — the figures will be yours, the shape is what matters:

```
Backup taken 2026-09-05T05:49:45.589Z
  4 organisation(s), 6 account(s)
  2 workspace(s), 11 module(s), 180 record(s)
  0 access request(s)
  no stored operator settings in this backup — the env vars will decide

Restored into ./data/drill/store.json. Counted back:
       6  accounts
       4  organisations
       2  workspaces
      11  modules
     180  records
       0  requests

Start the server with DATA_DIR=./data/drill to look at it.
```

The first block is what the **backup claims**. The second is what the restored
store **actually holds**, read back off disk. They must agree, and the script
exits non-zero if they do not.

**About that fifth line.** Artifacts taken before the export started carrying
operator settings are `version: 1` and say *"no stored operator settings in this
backup"*. That is correct for them, not a fault. A `version: 2` artifact instead
prints what it is bringing back:

```
  1 access request(s)
  operator settings restored: signupMode=closed, orgCreation=closed
```

**If it fails** it says so and stops, naming the shortfall per line:

```
       1  workspaces  <- expected 2
       6  records  <- expected 180

Counts do not match the backup. Do not trust this restore.
```

That is the whole point of the step. Do not continue past it.

#### Step 3 — Boot the restored copy

On a spare port, so you can leave anything else running.

```sh
MONGODB_URI= DATA_DIR=./data/drill PORT=9521 ALLOW_DEV_LOGIN=1 node server.js
```

**What you should see:**

```
Storage: file (set MONGODB_URI for MongoDB)
CRM Builder running on http://localhost:9521 (port 9521)
Google OAuth: disabled · Dev login: enabled
```

**`Storage: file` is the line that matters.** If it says MongoDB, a
`MONGODB_URI` leaked in from somewhere and you are looking at the live database
rather than the restore. Stop and start again.

`ALLOW_DEV_LOGIN=1` is what lets you sign in without Google. It is refused in
production, so it is safe here and useless there.

#### Step 4 — Sign in as yourself and look

Open `http://localhost:9521` and sign in with **your own real email address** —
dev sign-in takes an email and no password. The account already exists in the
restored data, so the signup gate lets you straight through.

**What you should see:** your workspace as it stood when the backup was taken.
Your modules in the sidebar, your records in them, your business name in
Settings.

**This step is not optional, and counts cannot replace it.** Rows restored into
the *wrong* workspace satisfy every total in step 2 and are only visible here.
So check that the records you see are **yours** — not merely that some records
exist.

If you have a second account (a colleague, or the fixture's), sign in as that
one too and confirm it sees its own workspace and not yours.

#### Step 5 — Check the operator settings

Admin → **Beta access**.

- **From a `version: 2` artifact:** the mode should be whatever you had set when
  the backup was taken. Step 2 already told you which.
- **From a `version: 1` artifact:** there are no stored settings, so this falls
  back to the `SIGNUP_MODE` environment variable. Expected, and the reason step
  2 says so out loud.

Deliberately **not** restored: the monthly egress counter and the alert state.
A restored deployment starts its own count and will re-announce a threshold it
is still over, rather than staying quiet because the dead deployment had
already mentioned it.

#### Step 6 — Clean up

```sh
rm -rf ./data/drill
```

And delete the downloaded artifact. It is a full copy of every customer's data
and it does not belong in a Downloads folder.

---

#### What a successful drill has proved

- The artifact parses, and is a CRM Builder backup rather than an error page.
- Every collection came back at full count, verified against the file on disk.
- A real server boots on it.
- **Your own records are in your own workspace** — the thing counts cannot show.

If any step fails, the artifact is not a recovery path and the deployment is
running without a safety net. That is worth knowing on a quiet Tuesday rather
than during an incident.

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
- **No email of any kind.** If you want to be nudged about things that are due,
  Settings → Notifications takes a Slack, Discord or Telegram webhook URL and
  posts a once-a-day count to that channel. It is off until you turn it on, it
  says *how many* rather than *which*, and a day with nothing due sends nothing
  at all. Only an owner can set it, and the URL is never shown back to you
  after you save it — treat it like a password.
- The guided tour needs sample data, and offers to load it. Settings → Remove
  sample data takes it back out and keeps anything you added.

[Privacy](/privacy) · [Terms](/terms)
