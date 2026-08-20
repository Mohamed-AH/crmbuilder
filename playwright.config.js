// Playwright config. The dev server is booted per-run with dev login enabled
// and an isolated data directory, unless BASE_URL points somewhere else.
const { defineConfig, devices } = require('@playwright/test');

const PORT = process.env.PORT || 8322;
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;

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
    webServer: {
      command: 'node server.js',
      url: `http://127.0.0.1:${PORT}/healthz`,
      timeout: 30000,
      reuseExistingServer: false,
      env: {
        PORT: String(PORT),
        ALLOW_DEV_LOGIN: '1',
        DATA_DIR: process.env.E2E_DATA_DIR || './data/e2e',
        SESSION_SECRET: 'e2e-secret-not-for-production',
        MONGODB_URI: '',
        // Pin the admin account so the admin tests don't depend on which test
        // happened to create the very first account.
        ADMIN_EMAILS: 'e2e-admin@example.com',
      },
    },
  }),
});
