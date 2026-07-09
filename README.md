# CRM Builder

A **modular CRM builder for small businesses** — an installable, offline-first **Progressive Web App** with optional accounts and cloud sync. Pick the modules your business needs (Contacts, Companies, Deals, Tasks, Leads, Notes) or build your own modules with custom fields. Deploys free on Render + MongoDB Atlas.

## Features

- **Modular by design** — start from prebuilt module templates or create custom modules with your own name, Lucide icon, and color.
- **Custom fields** — text, long text, number, currency, date, dropdown, checkbox, email, phone, link, and *link-to-module* relations. Mark fields required or shown in list view; reorder anytime.
- **Two views per module** — a dense, searchable table and a drag-and-drop **kanban board** for any module with a dropdown field (deal stages, lead status, …) with per-column counts and currency totals.
- **Dashboard** — record counts, total tracked value, recent activity, quick add.
- **Accounts & sync (OAuth)** — sign in with Google and your workspace syncs to MongoDB; use it from any device. Signed out or offline, everything is saved on-device (IndexedDB + a localStorage backup copy) and syncs when you're back.
- **Workspace settings** — business name and currency (30 currencies; all money fields format accordingly).
- **Admin dashboard** — account management (promote, disable, delete) plus business analytics: total/active users, workspaces, records, signups per day, and daily active users.
- **Backup & restore** — export/import the whole workspace as JSON.
- **PWA** — installable on desktop and mobile, fully offline via a service worker, light & dark mode, Inter typography, Lucide icons.

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
js/templates.js       prebuilt module templates
js/app.js             router, views, module builder, kanban, admin dashboard
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

Client data lives in the `crmbuilder` IndexedDB database (mirrored to localStorage). When signed in, the full snapshot syncs (last-write-wins) to MongoDB collections `users`, `data`, and `events`.
