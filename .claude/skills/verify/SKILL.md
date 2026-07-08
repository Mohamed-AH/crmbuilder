---
name: verify
description: Build/launch/drive recipe for verifying CRM Builder (static PWA) end-to-end in a headless browser.
---

# Verifying CRM Builder

Static site, no build step. Surface = browser GUI.

## Launch

```sh
python3 -m http.server 8321   # from repo root; any static server works
```

Service worker + PWA features require `localhost` or HTTPS.

## Drive (headless Chromium via globally installed playwright)

```sh
NODE_PATH=/opt/node22/lib/node_modules node <script>.js
```

`chromium.launch()` works as-is (PLAYWRIGHT_BROWSERS_PATH is preconfigured).
Each `launch()` gets a fresh profile, so IndexedDB starts empty → the app
always opens on the onboarding template picker.

## Flows worth driving

- Onboarding: check template cards → `#onboard-create` → modules appear in `#nav-modules`.
- Records: `#add-record-btn`, inputs are `#f-<fieldKey>`, save with `#record-save`; search via `#record-search`.
- Kanban (Deals): `.kanban-card` dragTo `.kanban-col[data-col="…"] .kanban-cards`; verify persistence after reload.
- Builder: `#add-module-btn`, field rows `.builder-field` (`.bf-label/.bf-type/.bf-options/.bf-related`), save `#b-save`.
- Offline: `await page.evaluate(() => navigator.serviceWorker.ready)`, reload once (to become SW-controlled), `context.setOffline(true)`, reload — app must fully render and CRUD must work.
- Export: `page.waitForEvent('download')` around `#export-btn`; import via `#import-file` setInputFiles.

## Gotchas

- Renaming a field's *label* keeps its original *key* (by design, preserves record data) — the default builder field stays `#f-name` even after relabeling.
- Kanban view toggle (`.seg-btn[data-view]`) only exists when the module has a select field with options.
- Collect `pageerror`/console errors — the app should produce none.
- Bump `CACHE_VERSION` in `sw.js` when changing any precached asset, or the old shell keeps being served.
