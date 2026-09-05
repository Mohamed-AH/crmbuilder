# CRM Builder — User Guide

> **Current reference · end users.** Verified against the code 2026-08-26.
> Mirrored by [manual.html](manual.html) — change both, and diff the prose, not the headings.

Everything you can do in CRM Builder, in the order you're likely to need it.
If you've used Salesforce, HubSpot or Pipedrive, most of this will feel
familiar — the difference is that you decide what the CRM tracks, not the vendor.

**Contents**

1. [Core ideas](#1-core-ideas)
2. [Your first five minutes](#2-your-first-five-minutes)
3. [Working with records](#3-working-with-records)
4. [Table view and board view](#4-table-view-and-board-view)
5. [Building and changing modules](#5-building-and-changing-modules)
6. [Field types](#6-field-types)
7. [Importing from a spreadsheet](#7-importing-from-a-spreadsheet)
8. [Exporting your data](#8-exporting-your-data)
9. [Workspace settings](#9-workspace-settings)
10. [Accounts, sync and multiple devices](#10-accounts-sync-and-multiple-devices)
11. [Working offline and installing the app](#11-working-offline-and-installing-the-app)
12. [Backups](#12-backups)
13. [For administrators](#13-for-administrators)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Core ideas

Four words cover the whole product.

| Term | What it means | Familiar equivalent |
|---|---|---|
| **Workspace** | Everything you track, plus your business name and currency. | Your "org" or "account" |
| **Module** | One kind of thing you track: Contacts, Deals, Job Sites, Equipment. | Object / entity / table |
| **Field** | One piece of information on a module: Email, Value, Stage. | Field / property / column |
| **Record** | One actual entry: a specific customer, a specific deal. | Record / row / card |

The important difference from a traditional CRM: **modules are yours to define.**
There is no fixed schema to work around. If your business runs on Job Sites and
Callbacks rather than Leads and Opportunities, build those instead.

---

## 2. Your first five minutes

When you open CRM Builder for the first time you'll see the setup screen.

1. **Enter your business name and currency.** Currency controls how every money
   field is displayed across the app. You can change both later.
2. **Pick your modules.** Contacts, Deals and Tasks are pre-selected because
   most businesses want them. Tick anything else you need — Companies, Leads,
   Notes. You can add or remove modules at any time.
3. **Choose whether to include sample records.** Handy for seeing how things
   look; easy to delete later.
4. Click **Create my CRM**.

Two shortcuts on that screen:

- **Explore with demo data** fills every module with a complete fictional
  business — 40 contacts, a populated deal pipeline, tasks, leads. Best way to
  evaluate the app or run a demo without typing anything. It's added alongside
  whatever you already have, so it's safe to try.
- **Start with a custom module instead** skips the templates and takes you
  straight to the module builder.

---

## 3. Working with records

**Add** — Open a module from the sidebar and click **Add**. Required fields are
marked with a red asterisk; the form won't save until they're filled.
The dashboard also has a **Quick add** panel for the modules you use most.

**Edit** — Click any row (or any card on a board) to open it. Change what you
need and click **Save**.

> One thing to know: email, phone and website cells are real links. Clicking
> directly on an email address opens your mail app rather than the record.
> Click anywhere else on the row to open the record.

**Delete** — Open the record and click **Delete**. This can't be undone, and on
a team it deletes for everyone, so export a backup first if you're unsure. If
someone shouldn't be able to delete, the **Contributor** role lets them add and
edit without it — see *Working as a team*.

**Search** — The search box filters as you type, matching against *every* field
in the module, not just the visible columns. Clear the box to see everything again.

---

## 4. Table view and board view

Every module has a **table view**: a dense, sortable list.

**Sorting** — Click any column header to sort by it. Click again to reverse,
and a third time to return to the default order (most recently edited first).
Sorting is type-aware: money and numbers sort numerically, dates
chronologically, and dropdowns sort in *pipeline order* — so a Stage column
sorts Lead → Qualified → Proposal → Won, not alphabetically. Empty values
always sort last.

Any module with a dropdown field also gets a **board view** — click the board
icon next to the search box. Each dropdown option becomes a column, and you
**drag cards between columns** to change that field. Dragging a deal from
Proposal to Won updates its Stage, immediately and permanently.

If your module has a money field, each board column shows its **count and
total** — so a Deals board doubles as a pipeline value report.

---

## 5. Building and changing modules

Click **+** next to MODULES in the sidebar, or **Add module** on the dashboard.

1. **Name it.** Use the plural — "Projects", "Invoices", "Job Sites". Buttons
   elsewhere in the app automatically use the singular form.
2. **Pick an icon and colour.** These appear in the sidebar and dashboard and
   make modules easy to tell apart at a glance.
3. **Define fields.** For each one set a label and a type. Two checkboxes:
   - **Req** — the record can't be saved without it.
   - **List** — the field appears as a column in table view. Up to six columns
     show; the rest are still on the record form.
4. Reorder fields with the **↑** button, remove them with **✕**.

To change a module later, open it and click the **pencil** icon.

**Renaming a field keeps its data.** The label is what you see; the underlying
key stays put, so renaming "Phone" to "Mobile" doesn't empty the column.

**Deleting a field asks what to do with what's in it.** If any records hold a
value, you're told how many and offered a choice:

- **Delete the values** — they go from every record, from future exports, and
  from your colleagues' devices once it syncs. This can't be undone.
- **Keep the data** — the column disappears but the values stay in the
  workspace. They'll still show up in a JSON backup, and they come back if you
  add a field with the same name later.

Deleting is the default, because that's usually what removing a column means.
Pick *Keep* if you're reorganising and expect to put the field back.

---

## 6. Field types

| Type | Use it for | Notes |
|---|---|---|
| **Text** | Names, references, short notes | |
| **Long text** | Descriptions, meeting notes | Truncated in the table, full in the record |
| **Number** | Quantities, counts | Right-aligned, sorts numerically |
| **Currency** | Deal values, quotes, invoices | Formatted in your workspace currency; totalled on boards and the dashboard |
| **Date** | Due dates, close dates | Date picker; sorts chronologically |
| **Dropdown** | Stage, Status, Priority, Source | **Enables board view.** Enter options comma-separated; their order is the board's column order |
| **Checkbox** | Done, Paid, Active | |
| **Email** | Email addresses | Becomes a clickable mail link |
| **Phone** | Phone numbers | Becomes a clickable dial link |
| **Link** | Websites, shared documents | Opens in a new tab |
| **Link to module** | Connecting records: a Project's Client, a Deal's Company | Shows a picker listing records from the module you choose |

**A tip on dropdowns:** the option order *is* your pipeline. Put them in the
order work actually flows — Lead, Qualified, Proposal, Negotiation, Won, Lost —
and both the board and the sorting will match how you think.

---

## 7. Importing from a spreadsheet

This is usually how a real business gets started: you already have a customer
list in Excel, Numbers or Google Sheets.

1. In your spreadsheet, make sure **the first row contains column headings**,
   then export or save as **CSV**.
2. In CRM Builder, open the module you want to import into and click the
   **upload** icon in the header.
3. CRM Builder shows a **mapping screen**: every column in your file, a sample
   value from it, and where it should go. Columns whose names resemble your
   fields are matched automatically — check them.
4. For each remaining column choose either an existing field, **skip this
   column**, or **create a new field** for it.
5. Choose whether to **add** the rows to what's there (the default) or
   **replace** everything in the module.
6. Click **Import**.

**What the importer handles for you**

- Quoted fields containing commas, quotes and line breaks
- Files exported from Excel with a byte-order mark, and Windows line endings
- Money written as `$1,234.00` or `€1 234` → stored as a number
- Negative amounts written as `(500)` → stored as `-500`
- `yes` / `y` / `true` / `1` / `x` → ticked checkboxes
- Most written date formats → a proper date
- Dropdown values matched to your existing options regardless of capitalisation
- Completely blank rows are skipped rather than imported as empty records

**Before a big import:** run it on a copy of your data first, or export a
backup (Settings → Export data), so you can undo it in one step.

---

## 8. Exporting your data

**One module to CSV** — open the module and click the **download** icon.
The export contains exactly what you're looking at: if a search filter or a
sort is active, the file matches it. Every field is exported, including ones
not shown as columns.

**Everything, as JSON** — Settings → **Export data (JSON)**. This is the
complete workspace: all modules, all records, and your settings. It's the
format the importer on the same page expects, and it's how you move a
workspace between devices without an account.

Your data is yours. There is no lock-in and no export limit.

---

## 9. Workspace settings

Open **Settings** from the bottom of the sidebar.

- **Business name** — shown at the top of the sidebar and on the dashboard.
- **Currency** — 30 currencies. Changing it reformats every money field
  everywhere, immediately. It changes *display*, not the stored numbers: a
  figure showing as 10,000 USD becomes 10,000 EUR, and your totals move with
  it. If any records hold an amount you'll be asked to confirm before it
  applies. To actually convert, export a backup, convert the numbers in a
  spreadsheet, and import it back.

- **Time zone** — which calendar day a date belongs to when the server works it
  out on your behalf. Your own screens already use this device's clock, so this
  only matters for anything sent to you rather than looked at by you. Leave it
  unset and dates are treated as UTC.

Click **Save workspace** to apply.

All three are set by the team's **owner**. Everyone else sees them as values
rather than as a form — changing the currency would relabel every amount in the
workspace for the whole team, so it stays with the person who owns it.

### Notifications (owners only)

If your team uses Slack, Discord or Telegram, an owner can paste a **webhook
URL** in Settings and send a test message to check it works. Right now that
test is all it does — nothing sends on its own yet.

Three things worth knowing:

- **The URL works like a password**, so it is never shown to you again after
  you save it. You'll see enough to recognise which channel it points at. To
  change it, paste a new one; to switch it off, use **Turn off**.
- **It is never included in a backup**, for the same reason. If your workspace
  is ever restored from one, an owner has to paste the URL again.
- **Only the owner** can see or change it — not members, and not view-only
  accounts.

#### The daily digest

With a webhook set, an owner can turn on a once-a-day message: a count of what
is due or already overdue, per module — the same rows the **Due date** filter
shows (§ *Table view and board view*). Three settings:

- **Look ahead** — how far into the future counts as "due". Anything already
  overdue is always included, however old.
- **Not before** — the earliest the message may go out, read in the
  workspace's time zone. It is a floor, not an exact time: the message goes on
  the first check after that hour.
- **Send it** — off until you turn it on.

Before you switch it on, the screen shows **exactly the message your team
would get**. Read it there first.

Four things worth knowing:

- **It is counts, not names.** The message says *"Invoices: 2 overdue, 3 due
  within 7 days"* and never names a record. A chat channel often has more
  people in it than your CRM does, so the details stay in the CRM.
- **A quiet day sends nothing.** No message means nothing is due — you will
  not get a daily "all clear" to learn to ignore.
- **Once a day.** Something that becomes due this afternoon is in tomorrow's
  message.
- **If a message fails to send, that day is used up.** The reason shows on the
  Notifications card. This is deliberate: the alternative is a channel full of
  retries.

---

## 10. Accounts, sync and multiple devices

CRM Builder works fully without an account — everything is stored on the device
you're using. Signing in adds sync.

**To sign in:** click **Sign in to sync** at the bottom of the sidebar and
continue with Google.

**What happens when you sign in:**

- Work you've already done on this device is uploaded to your account.
- On a device with no data yet, your workspace is downloaded.
- From then on, every change syncs automatically a moment after you make it.
  The chip above Settings shows the current state: *Synced*, *Syncing…*,
  *Connecting…*, or *Offline — will sync*.

**Signing out returns you to a blank workspace, and deletes nothing.** Your CRM
stays on the device under your account and comes straight back when you sign in
again. This is deliberate: on a shared or family computer, the next person to
open the app should not be looking at your customers.

**Each account has its own storage on a device.** If two people use the same
computer, neither can see — or accidentally sync — the other's work, even if one
of them was in the middle of an edit that hadn't reached the server yet. That
edit is still waiting for them the next time they sign in.

**How conflicts are resolved:** sync works one record at a time. If you edit a
contact on your laptop and a different contact on your phone, both survive —
each record is sent and merged individually, not as part of a whole-workspace
upload. Only if the *same* record is edited in two places does anything have to
be chosen, and there the most recent edit wins.

Deleting a record deletes it everywhere, including on a device that was offline
when you deleted it: the delete is remembered and travels like any other
change, rather than the record quietly reappearing on the next sync.

Sync also sends only what changed, so an edit costs the same whether your
workspace has fifty records or fifty thousand.

**Anything you do before signing in stays on the device until you say
otherwise.** The first time you sign in, CRM Builder asks once what to do with
it — bring it into your account, or leave it where it is. Nothing you typed is
ever discarded without being asked.

### Working as a team

An **organisation** is your team, and everyone on it shares one workspace: the
same modules, the same records, kept in step by the same per-record sync that
keeps your own laptop and phone together.

**To invite someone** (owners only): Settings → **Invite a colleague**. You get
a private link — copy it and send it however you normally reach them. The link
works **once** and stops working after a week, so it is safe to send in a
message but not to post somewhere public. If you send one by mistake, create
another and the old one can be revoked.

**When they open the link**, they sign in and are asked one question: start on
the team's workspace, or bring their own records with them. Anything they bring
becomes visible to everyone on the team, and the prompt says so. Nothing they
decline to bring is deleted — it stays in their own workspace.

**Who can change what.** Four roles, each doing everything the one below it
does plus one more thing:

| Role | Can |
|---|---|
| **Owner** | Everything: module fields, adding and deleting modules, invites, and managing the team |
| **Member** | Create, edit and delete records |
| **Contributor** | Create and edit records, but not delete them |
| **Viewer** | Read only — and export |

A field rename changes what every record in the team means, so the schema
belongs with whoever is accountable for the workspace. Anyone below owner
opening the module builder sees the fields but cannot change them. The
workspace's name and currency are owner-only for the same reason: changing the
currency relabels every amount in the team's records rather than converting
them.

**What view-only looks like.** It is a complete app for reading, not a
restricted one for writing. A viewer sees every module and record, can search
and sort, switch between table and board, open any record, and export to CSV or
JSON — which is the whole job if they are an auditor or an investor doing due
diligence. Records open as values rather than as a form, so there is no Save
button to look for and nothing to type into by mistake. A quiet *View only*
badge sits beside their name in the sidebar, and Settings says so once in
plain words. Buttons that would create or delete something are simply not
shown.

If someone's role changes while they are offline, work they did in the meantime
that they are no longer allowed to do is undone when they reconnect, and the
app says which rule stopped it rather than leaving them to guess.

Records show who added them once there is more than one person on the team.

**Managing the team** (Settings → Team, owners only): set anyone's role from
the picker beside their name, remove them, and revoke an invite link that has
not been used yet.

**Removing someone is not deleting their account.** They keep their sign-in and
get a fresh, empty workspace of their own; the team's records stay with the
team. The next time their device reaches the internet it drops its copy of the
team's data by itself — though a device that never comes online again keeps
whatever it already had, which is true of anything that works offline.

**Leaving a team** is on the same screen, and needs nobody's permission. You get
a fresh, empty workspace; the team keeps its records. The one exception: if you
are the only owner and other people are on the team, make someone else an owner
first — otherwise they would be left with a workspace nobody can administer.

Two people editing different records both keep their work — and so do two
people editing **different fields of the same record**. If you change a
contact's phone while a colleague changes their email, both changes survive;
each field is tracked separately. Only if you both edit *the same field* does
the later one win.

### Sample data

The guided tour needs something to walk through, so it offers to load a small
fictional business first. It never loads without asking, and it never follows
you into a real account unless you choose to keep it when you sign in.

To remove it at any point: **Settings → Remove sample data**. Records *you*
added are kept, including anything you typed into a module the samples created
— that module stays, and only the sample rows inside it go. The removal syncs,
so the samples disappear from your other devices too.

---

## 11. Working offline and installing the app

CRM Builder is a Progressive Web App, so you can install it like a native app:

- **Desktop (Chrome/Edge):** the install icon in the address bar, or
  Settings → *Install on this device*.
- **iPhone/iPad (Safari):** Share → *Add to Home Screen*.
- **Android (Chrome):** menu → *Install app*.

**Offline, everything still works.** You can browse, search, add, edit and
delete records with no connection. The sidebar shows *Offline — changes saved
locally*, and anything you changed syncs automatically when you're back online.
This is deliberate: the app never makes you wait for a server to reach your own
data.

---

## 12. Backups

Your records live in the browser's local database, and in your account if
you've signed in. Two habits worth having:

- **Export a JSON backup periodically** (Settings → Export data), especially
  before a big import or before deleting anything substantial.
- **Sign in**, so a copy lives in your account rather than only on one device.

Clearing your browser's site data will erase a signed-out workspace. If that
happens after you've signed in, just sign in again and your workspace comes back.

To restore: Settings → **Import backup**, choose the JSON file, and pick what
should happen to what is already there:

- **Merge** (the default) adds everything in the file and leaves the rest of the
  workspace alone. This is almost always what you want — recovering one deleted
  module shouldn't touch anything added since.
- **Replace** additionally deletes anything the file doesn't contain. It tells
  you how many records that is before you confirm. **On a team, those deletions
  reach everyone**, because they sync like any other change.

---

## 13. For administrators

If your account has the administrator role, an **Admin** entry appears in the
sidebar. Some of what follows is only visible to a *platform* administrator —
the person who runs the deployment, as opposed to the owner of one team.

**Metrics** — total accounts, accounts active in the last 7 days, workspaces
containing data, and totals for records and modules built. Two charts show
signups over the last 30 days and daily active users over the last 14. Hover
any bar for the exact figure.

**Deployment** *(platform administrators)* — three meters showing what the
whole deployment is consuming against its free-tier ceilings:

- **Database** — what MongoDB actually reports as stored, including indexes and
  tombstones rather than an estimate from the record count.
- **Memory** — the container's resident memory, plus the peak seen since the
  last restart. It's sampled when the page loads, so it catches a slow leak
  rather than a sudden spike.
- **Bandwidth** — response bodies sent this month. Headers aren't counted, so
  the real figure is a little higher.

Below the meters, **New organisations: Allowed / Capped**. Capping stops *new*
tenants without freezing your existing customers: a colleague invited to a team
that already exists still signs up and joins. That's why it's a separate switch
from pausing signups.

**Organisations** *(platform administrators)* — every team, heaviest first,
with its people, records, stored bytes, share of the database, and last
activity. Each row has one action: **pause** or **resume** writes. A paused
workspace can still be read and its data is untouched — it just can't sync
changes up until you resume it. It is not a deletion and nothing about it is
irreversible.

**Requests to join** — people who signed in without an invite and asked.
Approving lets them straight in: they sign in again with the same Google
account and it works. Nothing is emailed. See `docs/BETA.md` for how declines
behave.

**Beta access** — whether signups are *Invite only*, *Open* or *Paused*, plus
the beta codes and their remaining uses. The mode takes effect immediately with
no redeploy, and outlives restarts. **Send a test alert** fires a webhook
message and reports what every alert rule currently sees, so silence can be
told apart from a broken webhook URL.

**Problem reports** — what testers sent from Settings → Report a problem, each
with the app version, screen, browser, sync status, counts and recent console
errors.

**Accounts** — every account with its role, status, usage, join date and last
activity. Search by name or email. For each account you can:

- **Change the role** — owner, member, contributor or viewer within a team;
  only a platform administrator can grant that role.
- **Disable** — the person is signed out immediately and can't sync until
  re-enabled. Their data is kept.
- **Delete** — removes the account *and its synced data*. This cannot be undone.

You can't disable, demote or delete your own account, so an instance can never
be left without an administrator by accident. An org owner can't act on a
platform administrator at all.

If a deployment names nobody in its `ADMIN_EMAILS` setting, the first person to
sign in becomes the platform administrator — that's the bootstrap that stops a
fresh deployment from being unusable. Once `ADMIN_EMAILS` names someone, that
list decides, and the first visitor is an ordinary user like anyone else.

---

## 14. Troubleshooting

**The app is slow to load the very first time.**
On free hosting the server sleeps when idle and takes 30–60 seconds to wake.
The app itself loads instantly from your device and shows *Connecting…* while
it waits — your data is usable the whole time. Before a demo or a meeting, open
the URL a minute early to wake it up.

**I signed in but my records are missing.**
Check the sidebar chip. If it says *Offline* or *Connecting…*, sync hasn't
completed. If it says *Synced* and data is still missing, you may have signed in
with a different email than before — each account has its own workspace.

**I signed out and my CRM disappeared.**
Nothing was deleted. Signing out returns the screen to a blank workspace so the
next person at this computer doesn't see your data; sign back in with the same
email and everything is there. If you had unsaved changes when you signed out,
those are waiting too and upload once you're back online.

**I joined a team and my own records vanished.**
They were not deleted. Joining a team switches you to the team's workspace; if
you chose to start fresh, your own records stayed in your own workspace. They
are not reachable from the team view — ask an owner to help, or use a JSON
backup taken before you joined.

**I was invited but the link says it is not valid.**
Invite links work once and expire after a week, so a link that someone else has
already used, or an old one, will be refused. Ask for a fresh one.

**Someone else uses this computer and I can see their CRM.**
You shouldn't be able to — each account's data is stored separately on the
device. If you're seeing someone else's records, they are still signed in: open
Settings and sign out, then sign in as yourself.

**My changes aren't syncing.**
The chip will show *Sync error — retrying* or *Offline*. Changes are safe on the
device and upload automatically when the connection returns. Settings →
**Sync now** forces an attempt.

**The board view isn't available.**
Board view needs a dropdown field. Edit the module and add one (for example
Stage or Status) with its options in pipeline order.

**Import produced empty or wrong values.**
Almost always a mapping issue: re-run the import and check the *Import as*
column on the mapping screen. If dates or amounts look wrong, confirm the
spreadsheet column holds one consistent format.

**I need to undo an import.**
Import your most recent JSON backup (Settings → Import backup). There's no
per-import undo, which is why exporting before a large import is worth the
ten seconds.

**I deleted a module by mistake.**
Deleting a module deletes its records too, and can't be undone from inside the
app. Restore from your latest JSON backup.
