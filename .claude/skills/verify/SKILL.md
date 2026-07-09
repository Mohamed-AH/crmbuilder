---
name: verify
description: Build/launch/drive recipe for verifying CRM Builder (Express + PWA) end-to-end in a headless browser.
---

# Verifying CRM Builder

Node/Express server (`server.js`) serving the static PWA plus auth/sync/admin APIs.
Surface = browser GUI + JSON API.

## Launch

```sh
npm install
rm -rf data                     # reset the file store for a clean run
ALLOW_DEV_LOGIN=1 node server.js   # http://localhost:8321, storage=file, dev login on
```

- `curl localhost:8321/healthz` → `{"ok":true,"storage":"file"}`.
- No MONGODB_URI → JSON file store in `./data/` (git-ignored). Same API as Mongo.
- CAREFUL killing it: `pkill -f "server.js"` matches your own shell if the compound
  command mentions server.js — run `pkill -f "[s]erver\.js"` in a **separate** command.
- Static-only mode (no accounts) still works: `python3 -m http.server`.

## Drive (headless Chromium via globally installed playwright)

```sh
NODE_PATH=/opt/node22/lib/node_modules node <script>.js
```

Fresh `browser.newContext()` = fresh IndexedDB/localStorage → onboarding screen.

## Flows worth driving

- Onboarding: `#onboard-name`, `#onboard-currency`, template cards (click the **card**, not the hidden checkbox — `.check()` fails on opacity-0 inputs), `#onboard-create`.
- Dev sign-in: `#signin-btn` (sidebar) or `#onboard-signin` → `#dev-email` → submit → page reloads itself. First account becomes admin.
- Sync: after edits wait ~2.5s (1.5s debounce), then `page.request.get('/api/data')` to assert cloud state. Sign-in on a fresh context restores the workspace.
- Offline: `navigator.serviceWorker.ready` → reload → `ctx.setOffline(true)` → reload → app + CRUD must work; auth state survives via `crmb:auth`/`crmb:user` localStorage cache; after `setOffline(false)` the 'online' handler pushes dirty state.
- Admin (`#/admin`): `.admin-stats .stat-count`, `.chart .bar` (44 bars = 30+14 days), `#chart-tip` on `.bar-g` hover, `.admin-row` actions `[data-act=role|disable|delete]` (accept dialogs).
- API probes: non-admin `/api/admin/*` → 403; disabled user `/api/data` → 401.
- Records/kanban/builder: `#f-<fieldKey>`, `#record-save`, drag `.kanban-card` → `.kanban-col[data-col] .kanban-cards`, builder rows `.bf-*`.

## Gotchas

- Renaming a field's *label* keeps its original *key* (default builder field stays `#f-name`).
- `js/icons.js` is generated from lucide-static: extract the **inner** content of `<svg>` (files start with a license comment — a naive first-`>` regex nests svgs and swallows trailing button text).
- Currency formatting follows Settings → currency everywhere (kanban totals, tables, dashboard tile).
- Bump `CACHE_VERSION` in `sw.js` when changing any precached asset.
- Expected console noise: `/api/me` fetch fails with ERR_INTERNET_DISCONNECTED when booting offline — the app handles it.
