# CRM Builder

A **modular CRM builder for small businesses**, delivered as an installable, offline-first **Progressive Web App**. Pick the modules your business needs — Contacts, Companies, Deals, Tasks, Leads, Notes — or build your own modules with custom fields. All data is stored privately on your device (IndexedDB); no server, no account, no build step.

## Features

- **Modular by design** — start from prebuilt module templates or create custom modules with your own name, icon, and color.
- **Custom fields** — text, long text, number, currency, date, dropdown, checkbox, email, phone, link, and *link-to-module* (relations between modules). Mark fields required or shown in list view; reorder them anytime.
- **Two views per module** — a responsive table with instant search, and a drag-and-drop **kanban board** for any module with a dropdown field (deal stages, lead status, …). Kanban columns show card counts and currency totals.
- **Dashboard** — record counts per module and recent activity across your whole CRM.
- **Backup & restore** — export everything to a JSON file and import it on any device.
- **PWA** — installable to the home screen / desktop, works fully offline via a service worker, respects light & dark mode.

## Running it

It's a static site — serve the folder over HTTP(S) and open it:

```sh
# any static server works, e.g.:
python3 -m http.server 8080
# then open http://localhost:8080
```

For installability and the service worker you need `localhost` or HTTPS (any static host — GitHub Pages, Netlify, etc. — works as-is).

## Project layout

```
index.html            app shell
css/style.css         styles (light/dark via prefers-color-scheme)
js/db.js              promise-based IndexedDB wrapper (modules + records stores)
js/templates.js       prebuilt module templates
js/app.js             router, views (dashboard/module/settings), builder, kanban
sw.js                 offline-first service worker (bump CACHE_VERSION on asset changes)
manifest.webmanifest  PWA manifest
icons/                app icons (any + maskable)
```

## Data model

- **Module**: `{ id, name, icon, color, defaultView, fields[], createdAt }`
- **Field**: `{ key, label, type, required?, showInList?, options?, relatedModule? }`
- **Record**: `{ id, moduleId, data: { [fieldKey]: value }, createdAt, updatedAt }`

Everything lives in the `crmbuilder` IndexedDB database in your browser.
