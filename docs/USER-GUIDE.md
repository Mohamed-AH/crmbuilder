# CRM Builder — User Guide

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

**Delete** — Open the record and click **Delete**. This can't be undone, so
export a backup first if you're unsure.

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
Deleting a field, however, removes that field's values from every record in
the module.

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
  everywhere, immediately. It changes *display*, not the stored numbers, so
  switching currencies doesn't convert amounts.

Click **Save workspace** to apply.

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

**Signing out leaves your data on the device.** It stops syncing; it doesn't
erase anything.

**How conflicts are resolved:** sync is last-write-wins on the whole workspace.
If the same account edits on two devices while one is offline, the most recent
save wins — changes aren't merged record by record. In practice this is a
non-issue for one person on a laptop and a phone; if several people need to
edit the same workspace simultaneously, give each of them their own account.

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

To restore: Settings → **Import backup**, choose the JSON file, and confirm.
Importing a backup **replaces** the current contents of the workspace.

---

## 13. For administrators

If your account has the administrator role, an **Admin** entry appears in the
sidebar.

**Metrics** — total accounts, accounts active in the last 7 days, workspaces
containing data, and totals for records and modules built. Two charts show
signups over the last 30 days and daily active users over the last 14. Hover
any bar for the exact figure.

**Accounts** — every account with its role, status, usage, join date and last
activity. Search by name or email. For each account you can:

- **Promote / demote** between user and administrator
- **Disable** — the person is signed out immediately and can't sync until
  re-enabled. Their data is kept.
- **Delete** — removes the account *and its synced data*. This cannot be undone.

You can't disable, demote or delete your own account, so an instance can never
be left without an administrator by accident.

The first person to sign in to a new deployment automatically becomes an
administrator. After that, administrators are set by the deployment's
`ADMIN_EMAILS` setting or promoted from this page.

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
