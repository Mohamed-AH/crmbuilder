# Client Onboarding Playbook

> **Current reference · whoever rolls this out.** Verified against the code 2026-08-26.
> Internal: not served publicly.

For whoever is rolling CRM Builder out to a business — an internal admin, a
consultant, or an agency setting it up for a client. The goal is a customer
who is *using* the CRM within a week, not one who has merely been given a login.

The single biggest predictor of success: **their real data is in it on day one.**
A CRM with someone else's sample records in it never gets adopted.

---

## Before the kickoff call (15 minutes)

- [ ] Deployment is live and healthy — run `BASE_URL=https://their-url npm run test:smoke`
      and confirm no warnings (storage should be `mongodb`, Google OAuth enabled,
      dev login disabled).
- [ ] Their email is in `ADMIN_EMAILS` if they should administer their own instance.
- [ ] **Open the URL a minute before the call.** Free-tier hosting sleeps when
      idle; waking it in front of the client is a bad first impression.
- [ ] Ask them to send their current customer list (spreadsheet, export from an
      old CRM, even a contacts export) ahead of time.

---

## Session 1 — Set up the workspace (45 minutes)

### 1. Understand what they actually track (10 min)

Don't open the app yet. Ask:

> "Walk me through what happens from someone first contacting you to the job
> being finished and paid."

Write down every **noun** they say. Those are their modules. Then, for each
noun, ask what they'd need to know about one. Those are the fields.

Typical translations:

| They say | Module |
|---|---|
| "customers", "clients", "patients", "members" | Contacts |
| "quotes", "jobs", "projects", "opportunities" | Deals |
| "follow-ups", "callbacks", "to-dos" | Tasks |
| "enquiries", "walk-ins", "web forms" | Leads |
| "sites", "properties", "vehicles", "equipment" | a custom module |
| "certificates", "licences", "insurance", "MOTs", "DBS checks" | Renewals |

Resist adding everything at once. **Three modules used daily beats eight
modules used never.** Anything can be added in two minutes later.

### 2. Create the workspace (5 min)

Do this on screen, with them watching — it takes under a minute and it's the
moment they realise the tool bends to them:

- Business name and currency
- Their modules
- Uncheck sample records (their real data is coming next)

### 3. Define their pipeline (10 min)

If they sell anything, open Deals → edit → the **Stage** dropdown, and replace
the default options with *their* stage names in *their* order. This is the
highest-value five minutes of the whole onboarding — the board view is the
screen most people live in, and it should read like their whiteboard.

Same treatment for Lead statuses and Task priorities if they use them.

### 4. Import their existing data (15 min)

1. Open their spreadsheet and check row 1 holds column headings. Fix it if not.
2. Save as CSV.
3. Module → **upload** icon → check the mapping screen carefully.
4. Map anything unmatched, or create new fields for columns worth keeping.
5. **If it asks which way round the dates are written, answer it with them
   looking.** `03/04/2026` is 3 April or 4 March and the file does not say;
   the screen preselects an answer when the file proves one and names the
   value it read that from. Check that value is really theirs — a file
   assembled from two sources can carry both conventions, and the screen says
   so when it does.
6. Import, then spot-check five records against the spreadsheet — **dates
   first**, because a wrong one still looks like a date.

Do this **with them**, not for them — the mapping screen is the part they'll
need to repeat, and it's easy once they've seen it once.

### 5. Install it (5 min)

Put it on their home screen or desktop right now, while you're together. A CRM
in a browser tab gets closed; a CRM with an icon gets opened. Show them it works
with the wifi off.

---

## Session 2 — Working habits (30 minutes, a few days later)

By now they've either used it or they haven't, and that tells you what to cover.

- **Adding records fast** — Quick add on the dashboard.
- **Search** — searches every field, not just visible columns.
- **The board** — drag a real deal to its real stage while they watch.
- **Sorting** — click a column header; show them sorting by value or due date.
- **Export** — show them the CSV and JSON export *specifically* so they know
  they're not locked in. This lands better than any feature.

Then agree one habit, out loud: *"every enquiry gets entered the same day."*
One habit, consistently kept, is what makes the data trustworthy enough to rely on.

---

## Week 1 check-in (15 minutes)

### Switch the daily digest on — but only now, not on day one

Leave it off during setup. A digest over a half-imported workspace counts rows
nobody has looked at yet, and the first message they ever get from the system
being wrong is expensive.

By week 1 there is real data and a real due date to chase, so:

1. **Settings → Notifications**. For Slack or Discord, paste the webhook URL
   from their channel. For **Telegram** there is no URL to paste — open *Using
   Telegram? Set it up here*, and the screen walks through BotFather, the
   token, and **Find my chat**. Then press **Send a test message** and watch it
   arrive in the channel before going further.
2. Under **Daily digest**, set the look-ahead window and the earliest hour, and
   check the preview — the screen shows the exact message their team will get.
3. Only then switch it on.

**Pick the look-ahead for the slowest thing they track, not the fastest.** It
is one setting for the whole workspace. A week is right for chasing a quote and
useless for a certificate nobody can renew that fast, so a business with a
**Renewals** module wants 30 days — the per-module Due date filter still lets
them look at a shorter window whenever they want.

**Set three expectations while you are there**, because each is otherwise a
support question:

- It says *how many*, never *which*. The details stay in the CRM.
- It goes once a day. Something due this afternoon is in tomorrow's message.
- A quiet day sends nothing at all.

**Only the owner can see or change this**, and the URL is never shown back to
anyone after it is saved — so if they rotate it in Slack, they paste the new
one rather than editing the old.


- [ ] Are records being added? (If not: what's the friction — is it a missing
      field, or a missing habit?)
- [ ] Does the pipeline reflect reality, or has everything stalled in one column?
- [ ] Any fields they're leaving blank every time? Delete them.
- [ ] Any information they keep writing into Notes? That's a field waiting to
      be created.
- [ ] Show them **Export data** once more and suggest a monthly backup.

Adjusting the module *after* a week of real use is normal and expected. That's
the point of the product — say so, so they don't feel they got it wrong.

---

## Rolling out to a team

1. Have one person sign in with their own Google account and build the
   workspace. They own the organisation it creates.
2. That owner invites everyone else from **Settings → Team**, which produces a
   private single-use link they send themselves — there is no mail plumbing in
   this product. The whole team then shares one workspace.
3. Give each person the role that matches what they do. **Owner** changes the
   schema and manages the team; **member** works with records; **contributor**
   can add and edit but not delete; **viewer** reads only. The server enforces
   it, so a client that tries anyway has the change quietly undone with an
   explanation rather than a failed sync.
4. Add the address of whoever should administer the *deployment* (as opposed to
   one team) to `ADMIN_EMAILS`.
5. Point them at [USER-GUIDE.md](USER-GUIDE.md) — it's written for end users.
6. Set the expectation about concurrent edits: two people editing different
   records both keep their work, and so do two people editing *different fields
   of the same record*. Two people typing into the **same field** at the same
   time is still last-write-wins.
7. The honest limit to state up front: **everyone on a team sees every module.**
   Roles govern what you can do, not what you can see.
8. If they share a computer, tell them signing out is how they hand it over.
   Each account's data is stored separately on the device, so nobody sees or
   syncs anyone else's, and signing out never deletes anything — it just puts
   the workspace away until that person signs back in.

---

## Common objections, and honest answers

**"We already tried a CRM and stopped using it."**
Ask which fields they never filled in. Those fields are why. Here they simply
delete them.

**"Can we get our data out?"**
Yes — CSV per module, JSON for everything, no limits, no plan required.
Show them; don't just say it.

**"What happens if you disappear?"**
It's a self-hosted app running on their own hosting and their own database,
and they hold a complete export. Nothing depends on you being around.

**"Is it slow?"**
The app runs locally, so record-level work is instant even offline. On free
hosting the *server* sleeps after 15 minutes idle and takes up to a minute to
wake; that affects sync, not the app. Upgrading the hosting plan removes it.

**"Can several of us use it at once?"**
Yes — one shared workspace, each person on their own account, with roles
deciding what they may do. Two people editing different records both keep their
work, and so do two people editing different *fields* of the same record. The
one honest limit is two people typing into the *same* field at the same moment:
that is last-write-wins. State that up front rather than after they find it.

**"Does this help us with GDPR?"**
With the parts a tool can help with, yes; it does not make anyone compliant on
its own, and saying otherwise is the fastest way to be quoted back at.
Concretely: the **Consent & lawful basis** template records why they may hold
each person's details and where they came from; Settings → **Data requests**
answers "what do you hold about me" by searching every text field, including
values under fields they have since removed; Settings → **Data you have stopped
using** shows what nothing has touched in a window they choose, so a retention
policy is something they can act on rather than only write down. The decisions —
which lawful basis, how long to keep it — are theirs. [terms.html](/terms)
carries the processor half in writing.
