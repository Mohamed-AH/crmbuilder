# CRM Builder

A **modular CRM builder for small businesses** — an installable, offline-first **Progressive Web App** with optional accounts and cloud sync. Pick the modules your business needs (Contacts, Companies, Deals, Tasks, Leads, Notes) or build your own modules with custom fields. Deploys free on Render + MongoDB Atlas.

## Features

- **Modular by design** — start from prebuilt module templates or create custom modules with your own name, Lucide icon, and color.
- **Custom fields** — text, long text, number, currency, date, dropdown, checkbox, email, phone, link, and *link-to-module* relations. Mark fields required or shown in list view; reorder anytime.
- **Two views per module** — a dense, searchable table and a drag-and-drop **kanban board** for any module with a dropdown field (deal stages, lead status, …) with per-column counts and currency totals.
- **Dashboard** — record counts, total tracked value, recent activity, quick add.
- **Accounts & sync (OAuth)** — sign in with Google and your workspace syncs to MongoDB; use it from any device. Signed out or offline, everything is saved on-device (IndexedDB + a localStorage backup copy) and syncs when you're back. Each account gets its own local store, so a shared computer never mixes two people's data — including edits that hadn't reached the server yet.
- **Workspace settings** — business name and currency (30 currencies; all money fields format accordingly).
- **Admin dashboard** — account management (roles, disable, delete) plus business analytics: total/active users, workspaces, records, signups per day, and daily active users.
- **Operator controls** — a Deployment card showing what the instance is carrying against its three real limits (Atlas storage, container memory, monthly bandwidth), an Organisations table sorted by who is heaviest with each tenant's share, levers to pause signups or cap new organisations without a redeploy, and reversible read-only suspension for a single workspace. Threshold alerts reach Discord, Slack or Telegram, each level announced once rather than every quarter of an hour.
- **Spreadsheet import/export** — CSV export of the current view, and CSV import with automatic column matching, a mapping step, on-the-fly field creation, and type coercion for money, dates and yes/no columns.
- **Sortable columns** — click any header; sorting is type-aware (numbers numerically, dates chronologically, dropdowns in pipeline order).
- **Team workspaces** — an organisation shares one workspace; owners invite colleagues with a single-use link that expires after a week. Joiners choose whether to bring their own records with them. Four roles: **owner** (schema, invites, the team), **member** (records, including deleting them), **contributor** (add and edit, but not delete) and **viewer** (read only). Records carry who added them, and removing someone from a team is not deleting their account.
- **Concurrent editing** — two people editing *different fields of the same record* both keep their edit. Each field carries its own clock and the server merges key by key, so a colleague's phone-number change does not vanish because you saved the email a second later.
- **Demo data** — one click fills every module with a coherent fictional business (107 records) for evaluations and demos. It is never loaded without asking, never syncs to an account unless you choose to keep it, and **Settings → Remove sample data** takes it back out while keeping anything you added yourself.
- **Backup & restore** — export/import the whole workspace as JSON.
- **PWA** — installable on desktop and mobile, fully offline via a service worker, light & dark mode, Inter typography, Lucide icons.

## Documentation

**→ [docs/README.md](docs/README.md) is the map.** It routes by what you are
trying to do, and marks what is current versus frozen. The short version:

| Document | For |
|---|---|
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

CI (`.github/workflows/test.yml`) runs the full suite on every push and smoke-tests
the live deployment daily. Set a repository variable `LIVE_URL` to enable the
scheduled live check.

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
css/style.css         styles (Inter, light/dark, desktop-first)
legal.css             standalone styling for the two pages above (they load no app JS)
js/icons.js           inline Lucide SVG icons
js/boot-icons.js      fills static icon placeholders (a file, not inline — CSP script-src)
js/db.js              promise-based IndexedDB wrapper
js/cloud.js           account + sync layer (server ⇄ local fallback)
js/csv.js             RFC 4180 CSV reader/writer
js/templates.js       prebuilt module templates
js/scope.js           storage scopes — which account local data belongs to
js/demo-data.js       fictional business used by "Load demo data"
js/app.js             router, views, module builder, kanban, admin dashboard
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
- **Settings**: `{ businessName, currency }`

Client data lives in the `crmbuilder` IndexedDB database (mirrored to localStorage). When signed in, each module and record syncs individually to the MongoDB collections `modules` and `records`, carrying an `updatedAt` (the row's edit clock) and a `serverAt` (the delta cursor). A record also carries `fieldsAt`, a clock per field, so two people editing different fields of one record resolve key by key instead of one overwriting the other; a row without it resolves whole-row exactly as before. Deletes are tombstones, so a device that was offline learns about them instead of resurrecting the row — and a tombstone discards the body, so a delete is not undoable. Accounts, orgs, settings, analytics, beta codes, access requests and platform settings live in `users`, `orgs`, `data`, `events`, `betaCodes`, `accessRequests` and `platform`.
