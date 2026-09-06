# Demo Script

> **Current reference · presenter.** Verified against the code 2026-08-26.
> Internal: not served publicly.

A 10-minute walkthrough written for an audience that already knows what a CRM
is — people who've used Salesforce, HubSpot or Pipedrive and will judge this in
the first ninety seconds.

**The one idea to land:** every other CRM asks you to fit your business into its
data model. This one is assembled around yours. Everything else is support.

---

## Setup (do this before they arrive)

- [ ] **Open the URL a minute early.** Free-tier hosting sleeps after ~15
      minutes idle. The app itself paints instantly and shows *Connecting…*,
      but sync and sign-in wait for the server. Wake it first.
- [ ] Load the demo business: **Settings → Load demo data** (or *Explore with
      demo data* on a fresh browser). You get 40 contacts, an 18-deal pipeline
      worth ~$166k, tasks, leads and notes.
- [ ] Have a **second browser profile** ready and signed out — for the sync moment.
- [ ] Decide whether to sign in on the demo machine *before* the walkthrough. If
      you sign in with the sample business loaded, you'll be asked whether to
      keep it; answering "keep" is fine for a demo and it stays removable from
      Settings.
- [ ] Put **`docs/demo-data/demo-contacts.csv`** on your desktop, ready to pick.
      It's built for this moment: 8 rows, 4 of its 5 columns auto-match the
      Contacts module, and the fifth (*Referred by*) doesn't exist yet — that's
      the column you create live during the import.
      Optional second file, **`demo-deals.csv`**, is for the "does it handle real
      spreadsheet mess?" question — see [the sidebar below](#the-second-csv).
- [ ] Zoom the browser to ~110% so the table is readable on a shared screen.

---

## The demo

### 0:00 — Open on the dashboard *(30 seconds)*

Don't explain anything yet. Let them look at a populated CRM: module counts,
recent activity, total tracked value.

> "This is a CRM for a small design studio. Six modules, about a hundred
> records. Nothing here is a fixed part of the product — I'll show you."

### 0:30 — The pipeline *(90 seconds)*

Open **Deals**, board view. Drag a card from Proposal to Won. Let the column
totals update on screen.

> "Standard kanban pipeline — drag to change stage. Column totals are live, so
> this doubles as a pipeline value report."

Then the hook:

> "Here's the part that's different. These columns aren't 'stages' because the
> product has a Stage concept. They're columns because this module has a
> dropdown field, and these are its options. If your business runs Quoted →
> Scheduled → Invoiced → Paid, you type that in and the board is that."

### 2:00 — Build a module live *(2 minutes)*

This is the centrepiece. **Do it live, don't describe it.**

Click **+** next to MODULES. Build something from *their* industry — ask them
first: "what's something you track that a CRM never has a field for?" Job Sites,
Equipment, Bookings, Livestock, Kilns — whatever they say, build it:

- Name it, pick an icon and colour
- Add a text field, a currency field, a date
- Add a **dropdown** with their real statuses
- Add a **Link to module** field pointing at Contacts

Save. Add one record. Switch to board view.

> "Ninety seconds, no code, no admin console, no consultant. And it's a
> first-class module — same table, same board, same search, same export as the
> built-in ones."

### 4:00 — Import their world *(90 seconds)*

Open **Contacts** → upload icon → drop in your CSV.

> "Most businesses' real CRM is a spreadsheet. So this has to be good."

Point at the mapping screen — matched columns, the sample values, and the
unmatched column:

> "It matched what it could. This column doesn't exist here yet — rather than
> making me go and create it first, I can create the field right from the
> import."

Import. Show the rows landing — then point at the first row, `Okafor, Tunde`:

> "That name has a comma in it, and it survived. It handles what spreadsheets
> actually produce: quoted commas, escaped quotes, Excel's encoding, money as
> `$1,234`, negatives in brackets, yes/no as checkboxes."

<a id="the-second-csv"></a>
**If they push on that** — and someone who has migrated a CRM before usually
will — open Deals and import `demo-deals.csv` instead of asserting it. Every
row in that file is deliberately messy, and the mapping screen shows it landing
clean:

| In the file | Becomes |
|---|---|
| `"$12,500.00"`, `"€8,400"`, `"1 950"` | `12500`, `8400`, `1950` |
| `(450)` | `-450` — accounting-style negative |
| `proposal`, `QUALIFIED`, `won` | matched to the real Stage options |
| `Oct 3 2026`, `15 Nov 2026` | proper dates, sortable |
| `Probability` | a column Deals doesn't have — create it inline |

### 5:30 — Table craft *(45 seconds)*

Switch Deals to table view. Click **Value** twice.

> "Sorts numerically, not as text. Click Stage and it sorts in pipeline order —
> Lead, Qualified, Proposal — not alphabetically. Small thing; it's the kind of
> small thing you notice every day."

Type in search:

> "Search covers every field, including ones that aren't columns."

### 6:15 — Offline *(45 seconds)*

Open devtools → Network → **Offline** (or turn off wifi). Reload the page.

> "Full app. Their data, searchable and editable."

Add a record while offline. Go back online. Point at the sidebar chip changing
to *Synced*.

> "Queued locally, synced when the connection came back. For anyone working on
> a site, in a van, or in a basement, that's the difference between a CRM
> they use and one they don't."

### 7:00 — Sync across devices *(60 seconds)*

In the second browser profile, sign in as the same account. The workspace
appears.

> "Sign in with Google, and the workspace follows you. Sign out and it drops
> back to a blank slate — because on a shared machine the next person shouldn't
> see your customers. Nothing is deleted: sign back in and it's all there,
> including anything you changed while offline."

If the demo device already has the sample business on it, the sign-in prompt
appears here. Take the moment — it demos well:

> "It asks once what to do with anything already on this device. Real work
> comes with you; sample data doesn't, unless you say so. Nothing you typed is
> ever thrown away without being asked."

### 8:00 — Admin *(60 seconds)*

Open **Admin**.

> "If you're running this for a team or for clients: accounts, activity,
> signups, daily actives, and per-account usage. Change roles, pause or remove
> people from here."

If you are the platform administrator, scroll to **Deployment** and
**Organisations**:

> "And if you're hosting it for several businesses: what the whole deployment
> is consuming against its limits, and every tenant listed heaviest first, so
> one customer filling the database is visible before it becomes everyone's
> problem. You can cap new tenants, or pause one workspace's writes, without
> deleting anything."

### 9:00 — Land it *(60 seconds)*

Open **Settings** and hover **Export data**.

> "Everything exports — CSV per module, JSON for the whole workspace. No plan
> gate, no export limit. It runs on your own hosting and your own database.
> Free tier costs nothing to start."

Close on the positioning:

> "The pitch isn't that this does more than Salesforce. It's that a five-person
> business shouldn't have to pay per seat for an enterprise CRM with ninety
> percent switched off. This is the ten percent — shaped exactly like their
> business."

---

## Questions you should expect

**"How is this different from Airtable/Notion?"**
Those are general databases you must design from scratch. This opens as a CRM
with pipelines, boards and currency built in, and works offline as an installed
app. Narrower on purpose.

**"Multi-user?"**
Yes. An organisation shares one workspace, and an owner invites people with a
private link from Settings. Per-record sync means two colleagues editing
different records both keep their work — and field-level merge means two people
editing *different fields of the same record* both keep theirs too. Only the
same field edited at the same time is last-write-wins.

Four roles. Owners control the schema — module fields, adding and deleting
modules, inviting people. Members work with records freely. Contributors add
and edit but cannot delete. Viewers read only. The server enforces it, so
someone whose client tries anyway has the change quietly undone with an
explanation rather than a failed sync.

Owners manage the team from Settings — promote, demote, remove, revoke an
unused invite — and anyone can leave. Removing someone is not deleting their
account: they keep it and get a fresh empty workspace, and the team's records
are untouched.

The honest edge: everyone on a team sees every module. Per-module access is not
built.

**"Permissions / field-level security?"**
Roles decide what someone can *do* — read, edit, delete, change the schema —
and the server enforces them. What they can *see* is not yet restricted: no
per-module or per-field access.

**"Why was it slow to load the first time?"**
Free hosting sleeps when idle. The app is local-first so it paints immediately
regardless; a paid plan removes the wake-up entirely.

**"Can it send email / integrate with X?"**
No email — there is no mail plumbing at all, deliberately. What it *does* have
is **outbound webhooks**: an owner pastes a Slack or Discord webhook URL in
Settings — or, for Telegram, pastes a bot token and picks the chat from a list
the app looks up — and the workspace can post to that channel. CSV in and out
is still the data integration surface.

**"Can it chase me about things that are due?"**
Yes, once a day. Turn on the **daily digest** in Settings and the workspace
posts a count of what is due or overdue to your chat channel — *"Invoices: 2
overdue, 3 due within 7 days"*. Three things to say plainly, because each one
will otherwise be a surprise:

- **Counts, not names.** It never says *which* invoice. A chat channel usually
  has more people in it than the CRM does, so the details stay in the CRM and
  the message is a nudge to open it.
- **Once a day, in the morning.** They pick the earliest hour and the
  look-ahead window. Something that becomes due at lunchtime is in tomorrow's.
- **A quiet day sends nothing.** There is no daily "all clear" to learn to
  ignore.

Overdue rows are always counted, however old — the window only bounds the
future side. If they ask why: a reminder that hides the six-month-old unpaid
invoice is worse than none.

**"Does that mean you can see our data?"**
No. The webhook posts from the deployment to *their* chat service, using a URL
they supply and that is never shown back to them. The digest carries counts and
module names, never record contents.

---

## Don't do these

- **Don't demo on an empty CRM.** Empty boards and zeroed dashboards read as
  unfinished. Load the demo data.
- **Don't open cold.** A sleeping server during your first thirty seconds is
  the worst possible first impression, even though the UI itself is unaffected.
- **Don't talk through the module builder — build it.** The live build is the
  moment that sells it, and it takes ninety seconds.
- **Don't oversell multi-user.** It's the one place the product is genuinely
  narrower than what they're used to.
