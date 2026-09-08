# CRM Builder

A **modular CRM builder for small businesses** — an installable, offline-first **Progressive Web App** with optional accounts and cloud sync. Pick the modules your business needs (Contacts, Companies, Deals, Tasks, Leads, Notes, Renewals) or build your own modules with custom fields. Deploys free on Render + MongoDB Atlas.

## Features

- **Modular by design** — start from prebuilt module templates or create custom modules with your own name, Lucide icon, and color.
- **Custom fields** — text, long text, number, currency, date, dropdown, checkbox, email, phone, link, and *link-to-module* relations. Mark fields required or shown in list view; reorder anytime.
- **Two views per module** — a dense, searchable table and a drag-and-drop **kanban board** for any module with a dropdown field (deal stages, lead status, …) with per-column counts and currency totals.
- **Dashboard** — record counts, total tracked value, recent activity, quick add.
- **Accounts & sync (OAuth)** — sign in with Google and your workspace syncs to MongoDB; use it from any device. Signed out or offline, everything is saved on-device (IndexedDB + a localStorage backup copy) and syncs when you're back. Each account gets its own local store, so a shared computer never mixes two people's data — including edits that hadn't reached the server yet.
- **Workspace settings** — business name and currency (30 currencies; all money fields format accordingly).
- **Admin dashboard** — account management (roles, disable, delete) plus business analytics: total/active users, workspaces, records, signups per day, and daily active users.
- **Operator controls** — a Deployment card showing what the instance is carrying against its three real limits (Atlas storage, container memory, monthly bandwidth), an Organisations table sorted by who is heaviest with each tenant's share, levers to pause signups or cap new organisations without a redeploy, and reversible read-only suspension for a single workspace. Threshold alerts reach Discord, Slack or Telegram, each level announced once rather than every quarter of an hour.
- **Spreadsheet import/export** — CSV export of the current view, and CSV import with automatic column matching, a mapping step, on-the-fly field creation, and type coercion for money, dates and yes/no columns. `03/04/2026` is 3 April or 4 March and the file does not say which, so the import **asks** — working the answer out from the file where something in it settles the question, naming the value it read that from, and requiring an answer where nothing does, rather than guessing and putting half the rows in the wrong month.
- **Sortable columns** — click any header; sorting is type-aware (numbers numerically, dates chronologically, dropdowns in pipeline order).
- **Team workspaces** — an organisation shares one workspace; owners invite colleagues with a single-use link that expires after a week. Joiners choose whether to bring their own records with them. Four roles: **owner** (schema, invites, the team), **member** (records, including deleting them), **contributor** (add and edit, but not delete) and **viewer** (read only). Records carry who added them, and removing someone from a team is not deleting their account.
- **Concurrent editing** — two people editing *different fields of the same record* both keep their edit. Each field carries its own clock and the server merges key by key, so a colleague's phone-number change does not vanish because you saved the email a second later.
- **Due-date filter** — every module with a date field can show just what is due in the next 7, 14 or 30 days. Overdue rows are always included however old, because a filter that hides the lapsed invoice hides the row most worth looking at.
- **A nudge, once a day** — point a workspace at a Slack, Discord or Telegram channel and it posts a morning count of what is due or overdue. Off until switched on, **counts and module names only, never record contents** (a chat channel usually has more people in it than the CRM does), and a day with nothing due sends nothing. Telegram needs no webhook URL: paste the bot token and pick the chat from a list the app looks up for you.
- **A register of things that expire** — a **Renewals** template for insurance certificates, trade licences, safety checks and vehicle inspections: who or what it covers, the policy number, where the renewal has got to, and the date it lapses. It needs no new machinery — the due-date filter and the daily digest already count a date field — which is the point: set *Look ahead* to 30 days and the morning message tells you a month before, rather than a client asking first.
- **Who you have stopped talking to** — the same review that answers *"how long do you keep this?"* asks a second question with a different clock: not what nobody has **changed**, but who nobody has **contacted**, aged on a date field you pick rather than on the record's last edit. A customer whose address you corrected last month is not a customer you have spoken to. Narrow it to one module and one dropdown value, and take the list out as CSV. It reports; nothing here sends anything.
- **Data-protection tools** — for a business holding other people's details: a **Consent & lawful basis** module template, a **data request** search that answers *"what do you hold about me"* across every text field (including names that only appear as a link, and values under fields you have since removed), a **retention review** of what nothing has touched in a window you pick, and **closing your own account** from Settings. The search and the review report; they never delete on your behalf.
- **Demo data** — one click fills every module with a coherent fictional business (144 records across 8 modules, two of them beyond the prebuilt templates, with projects linked to the companies paying for them) for evaluations and demos. It is never loaded without asking, never syncs to an account unless you choose to keep it, and **Settings → Remove sample data** takes it back out while keeping anything you added yourself.
- **Backup & restore** — export/import the whole workspace as JSON.
- **PWA** — installable on desktop and mobile, fully offline via a service worker, light & dark mode, Inter typography, Lucide icons.

## Documentation

**→ [docs/README.md](docs/README.md) is the map.** It routes by what you are
trying to do, and marks what is current versus frozen. The short version:

| Document | For |
|---|---|
| **[What you can do](guide.html)** | The short version for a customer or a prospect — what the app lets you do and what it deliberately does not, in about four minutes. Served at **`/guide`**. |
| **[User Guide](docs/USER-GUIDE.md)** | End users — every feature, in the order you need it. Also published as a [shareable web manual](docs/manual.html). |
| **[Onboarding Playbook](docs/ONBOARDING.md)** | Whoever rolls this out to a business: session plans, data migration, week-1 check-in. |
| **[Demo Script](docs/DEMO-SCRIPT.md)** | A timed 10-minute demo aimed at people who already use professional CRMs. Presenter-facing, deliberately imperative. |
| **[Product Tour](docs/product-tour.html)** | Customer-facing overview for prospects, leads and recruiters. Third person; pairs with the in-app guided tour. |
| **[API reference](docs/API.md)** | The HTTP contract: auth, the delta sync protocol, role enforcement, platform admin, alerts. |
| **[Working notes](CLAUDE.md)** | **Read this before changing code.** Architecture, invariants, and every trap that has already cost time. Has a topic index at the top. |
| **[Deployment](DEPLOYMENT.md)** | Getting it running on Render + MongoDB Atlas + Google OAuth, and what the deployment publishes. |
| **[Running the beta](docs/BETA.md)** | Operator runbook for opening it to testers, plus the tester-facing note to send with the invite. |
| **[Archive](docs/archive/)** | Frozen plans and decision records — kept for the *why*, **not maintained**, and some of it is now false. |
| **[Marketing](MARKETING.md)** | B2B/B2C copy and launch threads. |
| **[Posts](docs/posts/)** | Story-led pieces, **dated and not maintained** — a published post cannot be edited afterwards. |

## Testing

```sh
npm test              # unit + API contract + end-to-end
npm run test:unit     # CSV parser/serializer
npm run test:api      # API contracts (boots a throwaway server)
npm run test:e2e      # Playwright user journeys
npm run test:smoke    # deployment health audit (localhost)

# Audit a live deployment — reachability, assets, API contracts, and whether
# storage/OAuth/dev-login are configured safely for production:
BASE_URL=https://your-app.onrender.com npm run test:smoke
```

CI (`.github/workflows/test.yml`) runs the full suite on every push, and
smoke-tests the live deployment on every push *and* daily. A repository
variable `LIVE_URL` overrides which deployment it audits; without one it falls
back to a built-in default, so the scheduled check runs whether or not you set
it.

**A push run waits for the deployment to be running that commit before
auditing it** — `/healthz` reports the deployed commit, and CI polls it. Without
that, a push adding a new file audits the *previous* build, which 404s on the
new file and reports the deployment broken until somebody re-runs the job. The
daily run deliberately does not wait: nothing is in flight, so a stale
deployment failing the current asset list is a real finding rather than a race.

A `security` job runs alongside: `npm audit` gates on high/critical in
**production** dependencies (a dev-only advisory should not block a server
deploy), and **gitleaks** scans the full git history for secrets from a pinned,
checksum-verified binary. The secret scan is non-blocking — a scanner outage
should not stop a deploy — but it is redacted and it scans history rather than
the tip, both of which are the difference between a real scan and a false pass.
See `CLAUDE.md` §30.

## Quick start (local)

```sh
npm install
npm run dev        # http://localhost:8321
```

No configuration needed locally: storage falls back to a JSON file (`./data/`, git-ignored) and a passwordless dev sign-in is enabled so you can try accounts, sync, and the admin dashboard. With no `ADMIN_EMAILS` set, the first account to sign in becomes the platform admin — locally that is you.

The frontend also runs as a plain static site (`python3 -m http.server`) with sign-in disabled — fully local, per-device data.

## Deploying (free)

See **[DEPLOYMENT.md](DEPLOYMENT.md)** — Render free tier (via the included `render.yaml` blueprint) + MongoDB Atlas free tier + Google OAuth. About 15 minutes end to end.

## Project layout

```
server.js             Express server: static PWA, Google OAuth, sync API, admin API
render.yaml           Render blueprint (free tier)
index.html            app shell
privacy.html          privacy policy — a real page, and what Google needs to publish the consent screen
terms.html            terms of use
guide.html            "what you can do with it" — the short customer-facing page, served at /guide
css/style.css         styles (Inter, light/dark, desktop-first)
legal.css             standalone styling for the two pages above (they load no app JS)
js/icons.js           inline Lucide SVG icons
js/boot-icons.js      fills static icon placeholders (a file, not inline — CSP script-src)
js/db.js              promise-based IndexedDB wrapper
js/cloud.js           account + sync layer (server ⇄ local fallback)
js/csv.js             RFC 4180 CSV reader/writer
js/date-rules.js      calendar-day arithmetic — the due filter, the digest, CSV date import
js/dsar.js            finds every place one person appears, for a data request
js/manual-toc.js      contents menu for docs/manual.html — a file, not inline, because of CSP
js/templates.js       prebuilt module templates
js/scope.js           storage scopes — which account local data belongs to
js/tour.js            guided walkthrough engine (no dependencies)
js/demo-data.js       fictional business used by "Load demo data"
js/app.js             router, views, module builder, kanban, admin dashboard
lib/safe-fetch.js     SSRF guard for customer-chosen webhook destinations — server-side,
                      and deliberately NOT under js/, which is served
scripts/inspect.mjs   read-only database inspection — what is actually stored, and what disagrees
scripts/restore.mjs   puts a backup back, into Mongo or the file store, and verifies the counts
scripts/gen-demo-data.mjs  regenerates js/demo-data.js (seeded, so a re-run is byte-identical)
scripts/seed-fixture.mjs   seeds a team, roles, tombstones and meta counters into the file store
tests/                smoke, API, CSV unit and Playwright end-to-end tests
docs/                 user guide, onboarding playbook, demo script, beta runbook, web manual
sw.js                 offline-first service worker (bump CACHE_VERSION on asset changes)
manifest.webmanifest  PWA manifest
fonts/, icons/        self-hosted Inter + app icons
MARKETING.md          B2B/B2C copy + launch threads
```

## Data model

- **Module**: `{ id, name, icon, color, defaultView, fields[], createdAt }`
- **Field**: `{ key, label, type, required?, showInList?, options?, relatedModule? }`
- **Record**: `{ id, moduleId, data: { [fieldKey]: value }, fieldsAt?: { [fieldKey]: ts }, createdAt, updatedAt }`
- **Settings**: `{ businessName, currency, timezone, remind: { enabled, days, hour } }` — synced to every member of the workspace
- **Workspace webhook**: a **sibling** of settings on the meta doc, never inside it. Settings sync to everyone and resolve last-write-wins; a webhook URL is a credential (a Telegram one contains the bot token), so putting it there would hand it to every teammate's device and let an unrelated settings save overwrite it

Client data lives in the `crmbuilder` IndexedDB database (mirrored to localStorage). When signed in, each module and record syncs individually to the MongoDB collections `modules` and `records`, carrying an `updatedAt` (the row's edit clock) and a `serverAt` (the delta cursor). A record also carries `fieldsAt`, a clock per field, so two people editing different fields of one record resolve key by key instead of one overwriting the other; a row without it resolves whole-row exactly as before. Deletes are tombstones, so a device that was offline learns about them instead of resurrecting the row — and a tombstone discards the body, so a delete is not undoable. Accounts, orgs, settings, analytics, invites, beta codes, access requests and platform settings live in `users`, `orgs`, `data`, `events`, `invites`, `betaCodes`, `accessRequests` and `platform`. The nightly backup deliberately carries **counts** of outstanding invites and beta codes rather than the codes themselves — both are bearer credentials, and the artifact is downloadable by anyone with read access to the repository holding it.
