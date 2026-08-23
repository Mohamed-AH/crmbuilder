# CRM Builder

A **modular CRM builder for small businesses** — an installable, offline-first **Progressive Web App** with optional accounts and cloud sync. Pick the modules your business needs (Contacts, Companies, Deals, Tasks, Leads, Notes) or build your own modules with custom fields. Deploys free on Render + MongoDB Atlas.

## Features

- **Modular by design** — start from prebuilt module templates or create custom modules with your own name, Lucide icon, and color.
- **Custom fields** — text, long text, number, currency, date, dropdown, checkbox, email, phone, link, and *link-to-module* relations. Mark fields required or shown in list view; reorder anytime.
- **Two views per module** — a dense, searchable table and a drag-and-drop **kanban board** for any module with a dropdown field (deal stages, lead status, …) with per-column counts and currency totals.
- **Dashboard** — record counts, total tracked value, recent activity, quick add.
- **Accounts & sync (OAuth)** — sign in with Google and your workspace syncs to MongoDB; use it from any device. Signed out or offline, everything is saved on-device (IndexedDB + a localStorage backup copy) and syncs when you're back. Each account gets its own local store, so a shared computer never mixes two people's data — including edits that hadn't reached the server yet.
- **Workspace settings** — business name and currency (30 currencies; all money fields format accordingly).
- **Admin dashboard** — account management (promote, disable, delete) plus business analytics: total/active users, workspaces, records, signups per day, and daily active users.
- **Spreadsheet import/export** — CSV export of the current view, and CSV import with automatic column matching, a mapping step, on-the-fly field creation, and type coercion for money, dates and yes/no columns.
- **Sortable columns** — click any header; sorting is type-aware (numbers numerically, dates chronologically, dropdowns in pipeline order).
- **Team workspaces** — an organisation shares one workspace; owners invite colleagues with a single-use link that expires after a week. Joiners choose whether to bring their own records with them. Owners control the schema and manage the team, members work with records, and records carry who added them. Removing someone from a team is not deleting their account.
- **Demo data** — one click fills every module with a coherent fictional business (107 records) for evaluations and demos. It is never loaded without asking, never syncs to an account unless you choose to keep it, and **Settings → Remove sample data** takes it back out while keeping anything you added yourself.
- **Backup & restore** — export/import the whole workspace as JSON.
- **PWA** — installable on desktop and mobile, fully offline via a service worker, light & dark mode, Inter typography, Lucide icons.

## Documentation

| Document | For |
|---|---|
| **[User Guide](docs/USER-GUIDE.md)** | End users — every feature, in the order you need it. Also published as a [shareable web manual](docs/manual.html). |
| **[Onboarding Playbook](docs/ONBOARDING.md)** | Whoever rolls this out to a business: session plans, data migration, week-1 check-in. |
| **[Demo Script](docs/DEMO-SCRIPT.md)** | A timed 10-minute demo aimed at people who already use professional CRMs. Presenter-facing, deliberately imperative. |
| **[Product Tour](docs/product-tour.html)** | Customer-facing overview for prospects, leads and recruiters. Third person; pairs with the in-app guided tour. |
| **[Architecture](docs/ARCHITECTURE.md)** | Capacity limits, multi-tenancy options, and the pooled vs dedicated deployment paths. |
| **[Deployment](DEPLOYMENT.md)** | Getting it running on Render + MongoDB Atlas + Google OAuth. |
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

## Quick start (local)

```sh
npm install
npm run dev        # http://localhost:8321
```

No configuration needed locally: storage falls back to a JSON file (`./data/`, git-ignored) and a passwordless dev sign-in is enabled so you can try accounts, sync, and the admin dashboard. The first account to sign in becomes admin.

The frontend also runs as a plain static site (`python3 -m http.server`) with sign-in disabled — fully local, per-device data.

## Deploying (free)

See **[DEPLOYMENT.md](DEPLOYMENT.md)** — Render free tier (via the included `render.yaml` blueprint) + MongoDB Atlas free tier + Google OAuth. About 15 minutes end to end.

## Project layout

```
server.js             Express server: static PWA, Google OAuth, sync API, admin API
render.yaml           Render blueprint (free tier)
index.html            app shell
css/style.css         styles (Inter, light/dark, desktop-first)
js/icons.js           inline Lucide SVG icons
js/db.js              promise-based IndexedDB wrapper
js/cloud.js           account + sync layer (server ⇄ local fallback)
js/csv.js             RFC 4180 CSV reader/writer
js/templates.js       prebuilt module templates
js/scope.js           storage scopes — which account local data belongs to
js/demo-data.js       fictional business used by "Load demo data"
js/app.js             router, views, module builder, kanban, admin dashboard
tests/                smoke, API, CSV unit and Playwright end-to-end tests
docs/                 user guide, onboarding playbook, demo script, web manual
sw.js                 offline-first service worker (bump CACHE_VERSION on asset changes)
manifest.webmanifest  PWA manifest
fonts/, icons/        self-hosted Inter + app icons
MARKETING.md          B2B/B2C copy + launch threads
```

## Data model

- **Module**: `{ id, name, icon, color, defaultView, fields[], createdAt }`
- **Field**: `{ key, label, type, required?, showInList?, options?, relatedModule? }`
- **Record**: `{ id, moduleId, data: { [fieldKey]: value }, createdAt, updatedAt }`
- **Settings**: `{ businessName, currency }`

Client data lives in the `crmbuilder` IndexedDB database (mirrored to localStorage). When signed in, each module and record syncs individually to the MongoDB collections `modules` and `records`, carrying an `updatedAt` (the edit clock, which resolves conflicts per record) and a `serverAt` (the delta cursor). Deletes are tombstones, so a device that was offline learns about them instead of resurrecting the row. Accounts, orgs, settings and analytics live in `users`, `orgs`, `data` and `events`.
