# Running the beta

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
| `SIGNUP_MODE` | `code` | A beta code creates an account; signing back in never asks |
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

### Keeping it awake

UptimeRobot pings `/health` every 14 minutes, which is inside Render's ~15
minute idle window, so the service stays up. Two things to remember: that is
continuous, so it consumes roughly 744 of Render's 750 monthly instance-hours
and only works while this is the only free service on the account; and 14
minutes against a 15-minute timeout is one missed check away from a cold start.

### If something goes wrong

| Symptom | First thing to check |
|---|---|
| Nobody can sign up | Consent screen still in Testing? `SIGNUP_MODE=closed`? Code spent or expired? |
| A tester sees "private beta" | Their code is spent, expired or revoked. Mint another. |
| Everything is slow on first load | Cold start. Check UptimeRobot is actually running. |
| Data looks wrong for one person | Ask them to check Settings → the sync chip, and to export a backup before you touch anything. |
| Storage warning at 85% | Export a backup, then look at which workspaces are large. Nothing is enforced, so you have time. |

### Closing the beta

Set `SIGNUP_MODE=closed`. Existing accounts keep working; no new ones are
created. Take a final backup before changing anything else.

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

**Known rough edges right now:**

- Everyone on a team can see every module; there is no per-module access.
- No email notifications of any kind.
- The guided tour needs sample data, and offers to load it. Settings → Remove
  sample data takes it back out and keeps anything you added.

[Privacy](/privacy) · [Terms](/terms)
