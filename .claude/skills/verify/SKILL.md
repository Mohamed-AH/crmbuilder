---
name: verify
description: How to run and extend the CRM Builder test suite, and how to drive the app by hand.
---

# Verifying CRM Builder

Node/Express server (`server.js`) serving a static PWA plus auth/sync/admin APIs.
There is a real test suite now — **run it before hand-driving anything.**

## Run the tests

```sh
npm install
npm test              # unit + API + e2e (playwright boots its own server)
npm run test:unit     # tests/csv.test.mjs      — CSV parse/stringify
npm run test:api      # tests/api.test.mjs      — spawns a server on a random port
npm run test:e2e      # tests/e2e.spec.js       — Playwright, 24 journeys
npm run test:smoke    # tests/smoke.mjs         — deployment audit, localhost

BASE_URL=https://your-app.onrender.com npm run test:smoke   # audit a live deploy
```

- `npm run test:api` and `test:e2e` each boot their own server with `DATA_DIR`
  pointed at a throwaway directory — no cleanup needed, nothing shared with dev data.
- `playwright.config.js` pins `ADMIN_EMAILS=e2e-admin@example.com` so admin tests
  don't depend on which test created the first account.
- Playwright browsers are preinstalled (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`).
  Never run `playwright install` here.

## Driving it by hand

```sh
ALLOW_DEV_LOGIN=1 node server.js     # http://localhost:8321, file storage, dev login on
```

Dev login takes any email, no password. The first account (or anything in
`ADMIN_EMAILS`) is an admin.

**Killing the server:** `pkill -f "[s]erver\.js"` in a **separate** Bash call —
a compound command that mentions `server.js` matches itself and kills the shell.

## Gotchas that have bitten before

- **Async re-render races.** `renderModuleBodyOnly` is async and not awaited by
  click handlers. In tests, wait on rendered state (`aria-sort`, a row appearing)
  before reading the DOM — reading immediately samples the *previous* render and
  produces assertions that pass for the wrong reason.
- **Row clicks land on links.** Email/phone/URL cells are anchors that stop
  propagation. Click `tr td:first-child`, not the row centre, to open a record.
- **Template cards** wrap a visually hidden checkbox — `.check()` fails; click the
  `.template-card` itself.
- **Hidden-but-present elements.** `#topbar` is `display:none` on desktop and
  `#import-csv-file` is always hidden; don't `waitForSelector` on them, and don't
  assert `svg.lucide` `.first()` is visible (the first one is in the hidden topbar).
- **Navigating between modules is async** — waiting for `#export-csv-btn` resolves
  against the *old* page. Wait for something identifying, e.g. `h1:has-text("Contacts")`.
- **Renaming a field keeps its key**, so the default builder field stays `#f-name`.
- Bump `CACHE_VERSION` in `sw.js` whenever a precached asset changes.
- `js/icons.js` is generated from lucide-static: extract the **inner** content of
  `<svg>` (the files open with a license comment; a naive first-`>` regex nests
  svgs and swallows trailing text).

## Invariants worth protecting

- **The UI must paint before any network call resolves.** `init()` in `js/app.js`
  calls `route()` and only then `syncInBackground()`. There is a regression test
  ("paints immediately even when the server is asleep") that hangs `/api/me` for
  8s and requires paint under 5s. Free-tier hosts sleep; this is why.
- All `Cloud` API calls carry an `AbortSignal.timeout`. Nothing may block forever.
- `openRecord` and `openCSVImport` re-resolve their module via `getModule(id)`;
  rendered rows can outlive the module definition they were drawn from.
- Only `http/https/mailto/tel` may reach an `href` (`safeHref`) — record values
  arrive from CSV imports and shared backups.
