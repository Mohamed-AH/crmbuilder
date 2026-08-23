# Client Onboarding Playbook

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
5. Import, then spot-check five records against the spreadsheet.

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

1. Have each person sign in with their own Google account — one workspace per
   account, so their data stays their own.
2. Promote whoever should administer the instance (Admin → promote), or add
   their address to `ADMIN_EMAILS`.
3. Point them at [USER-GUIDE.md](USER-GUIDE.md) — it's written for end users.
4. Set the expectation that the workspace is **per account**: it's built for
   one person across several devices — where per-record sync means edits on a
   laptop and a phone merge rather than overwrite — not for several people
   editing one shared workspace at once.
5. If they share a computer, tell them signing out is how they hand it over.
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
Each person gets their own account and workspace. A single shared workspace
edited simultaneously by several people isn't what the sync model is built for —
be straight about that up front rather than after they've discovered it.
