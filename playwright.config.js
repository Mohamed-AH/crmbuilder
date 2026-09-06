// Playwright config. The dev server is booted per-run with dev login enabled
// and an isolated data directory, unless BASE_URL points somewhere else.
const { defineConfig, devices } = require('@playwright/test');
const fs = require('fs');

const PORT = process.env.PORT || 8322;
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;
const DATA_DIR = process.env.E2E_DATA_DIR || './data/e2e';
// Below every node --test block (§9 starts at 8300), so a Playwright run and a
// Node run cannot collide over it.
const TELEGRAM_PORT = process.env.TELEGRAM_PORT || 8299;

/*
 * Start every run from an empty store.
 *
 * The API and signup suites each mkdtemp a throwaway directory; only this one
 * reused a fixed path, so it accumulated every account and record from every
 * run that had ever happened. It reached 9.7 MB — 1,972 users and 11,720 rows —
 * and FileStore.save() rewrites the WHOLE file on every write (CLAUDE.md §30),
 * so each DB.put in each test was rewriting all of it.
 *
 * The symptom was not an error. It was the suite getting slower (4.0 → 6.5
 * minutes) and a different test timing out on each run while every one of them
 * passed in isolation — which reads as flakiness and is nothing of the sort.
 * Clearing this took a full run from 6.5 minutes back to 4.0.
 *
 * Not BASE_URL runs: those point at a deployment whose data is not ours to
 * delete.
 *
 * Guarded to the MAIN process. Playwright loads this config in every worker as
 * well, and the worker's load happens after the server is already up — so an
 * unguarded rmSync deletes the data directory out from under the running
 * server, whose next write then fails. The symptom is 47 tests failing with
 * ERR_CONNECTION_REFUSED partway through a run, which looks nothing like the
 * cleanup that caused it. TEST_WORKER_INDEX is set only in workers.
 */
if (!process.env.BASE_URL && process.env.TEST_WORKER_INDEX === undefined) {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
}

module.exports = defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.js/,
  timeout: 45000,
  expect: { timeout: 10000 },
  fullyParallel: false, // one shared server and one shared account namespace
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  ...(process.env.BASE_URL ? {} : {
    /*
     * Two servers: the app, and a stand-in for api.telegram.org.
     *
     * The Telegram chat lookup happens on the SERVER, so no amount of
     * browser-side stubbing can cover it — the journey either dials the real
     * Telegram (a network dependency, with a bogus token, in CI) or dials
     * something of ours. tests/fake-telegram.mjs is the same fixture
     * tests/api.test.mjs uses, so there is one copy to keep true (§29).
     *
     * Playwright starts these in order and waits on each URL.
     */
    webServer: [
      {
        command: 'node tests/fake-telegram.mjs',
        url: `http://127.0.0.1:${TELEGRAM_PORT}/healthz`,
        timeout: 15000,
        reuseExistingServer: false,
        env: { PORT: String(TELEGRAM_PORT) },
      },
      {
        command: 'node server.js',
        url: `http://127.0.0.1:${PORT}/healthz`,
        timeout: 30000,
        reuseExistingServer: false,
        env: {
          PORT: String(PORT),
          ALLOW_DEV_LOGIN: '1',
          DATA_DIR,
          SESSION_SECRET: 'e2e-secret-not-for-production',
          MONGODB_URI: '',
          // Pin the admin account so the admin tests don't depend on which test
          // happened to create the very first account.
          ADMIN_EMAILS: 'e2e-admin@example.com',
          // These journeys are about the app, not the signup gate — every one of
          // them creates an account, and threading a beta code through all of
          // them would test the harness. The gate has its own suite in
          // tests/signup.test.mjs, with a server per mode.
          SIGNUP_MODE: 'open',
          // Setting this also stands the SSRF block list down for that one
          // call, which is what lets it reach loopback — one variable rather
          // than two, so a deployment that does not redirect the host cannot
          // reach the relaxed path (CLAUDE.md §38).
          TELEGRAM_API_BASE: `http://127.0.0.1:${TELEGRAM_PORT}`,
        },
      },
    ],
  }),
});
