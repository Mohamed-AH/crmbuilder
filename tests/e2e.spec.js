/*
 * e2e.spec.js — user journeys through the real UI.
 *
 *   npm run test:e2e
 *
 * Each test gets a fresh browser context, so IndexedDB and localStorage start
 * empty and the app opens on onboarding. Accounts are shared across tests via
 * the server, so each test that signs in uses its own email.
 */
const { test, expect } = require('@playwright/test');

// --- helpers ---------------------------------------------------------------

async function onboard(page, { name = 'Test Co', currency = 'USD', templates = null } = {}) {
  await page.goto('/');
  await expect(page.locator('.template-card').first()).toBeVisible();
  await page.fill('#onboard-name', name);
  await page.selectOption('#onboard-currency', currency);
  if (templates) {
    // Cards are labels wrapping a visually hidden checkbox; click the card.
    await page.evaluate(() => document.querySelectorAll('input[data-template]').forEach((cb) => { cb.checked = false; }));
    for (const t of templates) await page.locator(`.template-card:has-text("${t}")`).click();
  }
  await page.click('#onboard-create');
  await expect(page.locator('#nav-modules .nav-link').first()).toBeVisible();
}

async function signIn(page, email) {
  const trigger = page.locator('#signin-btn, #onboard-signin').first();
  await trigger.waitFor({ state: 'visible' });
  await trigger.click();
  await page.fill('#dev-email', email);
  await page.click('#dev-login-form button[type=submit]');
  await expect(page.locator('.user-chip')).toBeVisible({ timeout: 15000 });
}

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`;
}

// Fail loudly on unexpected console errors; offline tests opt out.
test.beforeEach(async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/ERR_INTERNET_DISCONNECTED|Failed to fetch|net::ERR/.test(m.text())) return; // expected offline noise
    errors.push(m.text());
  });
  testInfo.consoleErrors = errors;
});
test.afterEach(async ({ page }, testInfo) => {
  // Tests that deliberately break something declare the errors they expect via
  // test.info().expectedConsoleErrors — those are diagnostics, not defects.
  const allowed = testInfo.expectedConsoleErrors || [];
  const unexpected = (testInfo.consoleErrors || []).filter((e) => !allowed.some((re) => re.test(e)));
  if (testInfo.status === 'passed' && unexpected.length) {
    throw new Error(`Console errors during test:\n${unexpected.join('\n')}`);
  }
});

// --- boot & resilience -----------------------------------------------------

test.describe('boot', () => {
  test('renders the onboarding screen with real icons and fonts', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.template-card')).toHaveCount(6);
    // Every template tile draws a real Lucide SVG, not an emoji fallback.
    await expect(page.locator('.template-icon svg.lucide')).toHaveCount(6);
    await expect(page.locator('.template-icon svg.lucide').first()).toBeVisible();
    const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(font).toContain('Inter');
  });

  test('paints immediately even when the server is asleep', async ({ page }) => {
    // Render's free tier can take ~a minute to wake. The UI must not wait for
    // it: this is the regression test for the blank-page-on-cold-start bug.
    await page.route('**/api/me', async (route) => {
      await new Promise((r) => setTimeout(r, 8000));
      await route.continue();
    });

    const started = Date.now();
    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.locator('.template-card').first()).toBeVisible({ timeout: 5000 });
    const paintedMs = Date.now() - started;

    expect(paintedMs, `UI took ${paintedMs}ms to paint while /api/me hung`).toBeLessThan(5000);
    // And it should say it is still connecting rather than lying about state.
    await expect(page.locator('.boot-chip')).toBeVisible();
  });

  // A returning user once saw the bare HTML shell — sidebar chrome present,
  // main area blank, nav links inert — because a stalled await in init() meant
  // route() never ran. Local storage must never be able to do that.
  test('still renders when IndexedDB refuses to open', async ({ page }) => {
    test.info().expectedConsoleErrors = [/storage blocked/, /Could not read/];
    await page.addInitScript(() => {
      indexedDB.open = () => { throw new Error('storage blocked'); };
    });
    await page.goto('/');
    await expect(page.locator('.template-card').first()).toBeVisible({ timeout: 10000 });
    // And navigation still works, which is what "unresponsive" really meant.
    await page.click('a[href="#/settings"]');
    await expect(page.locator('h1')).toHaveText('Settings');
  });

  test('still renders when IndexedDB hangs forever', async ({ page }) => {
    test.info().expectedConsoleErrors = [/did not open within/, /Could not read/];
    await page.addInitScript(() => {
      // Never fires success, error or blocked — the case with no timeout hung.
      indexedDB.open = () => ({ onsuccess: null, onerror: null, onblocked: null, onupgradeneeded: null });
    });
    await page.goto('/');
    await expect(page.locator('.template-card').first()).toBeVisible({ timeout: 10000 });
    await page.click('a[href="#/settings"]');
    await expect(page.locator('h1')).toHaveText('Settings');
  });

  test('works with no server at all (static hosting)', async ({ page }) => {
    await page.route('**/api/**', (route) => route.abort());
    await page.goto('/');
    await onboardWithoutServer(page);
    async function onboardWithoutServer(p) {
      await expect(p.locator('.template-card').first()).toBeVisible();
      await p.click('#onboard-create');
      await expect(p.locator('#nav-modules .nav-link').first()).toBeVisible();
    }
    await page.click('#add-record-btn');
    await page.fill('#f-name', 'Local Only Contact');
    await page.click('#record-save');
    await expect(page.locator('tr:has-text("Local Only Contact")')).toBeVisible();
  });
});

// --- core CRM --------------------------------------------------------------

test.describe('records', () => {
  test('create, edit, search and delete', async ({ page }) => {
    await onboard(page);
    await page.click('#nav-modules .nav-link:has-text("Contacts")');

    await page.click('#add-record-btn');
    await page.fill('#f-name', 'Sara Lindqvist');
    await page.fill('#f-email', 'sara@nordicplants.se');
    await page.fill('#f-company', 'Nordic Plants');
    await page.click('#record-save');
    await expect(page.locator('tr:has-text("Sara Lindqvist")')).toBeVisible();

    // Edit
    await page.click('tr:has-text("Sara Lindqvist")');
    await page.fill('#f-phone', '+46 70 123 4567');
    await page.click('#record-save');
    await expect(page.locator('tr:has-text("+46 70 123 4567")')).toBeVisible();

    // Search narrows, then clears
    await page.fill('#record-search', 'nordic');
    await expect(page.locator('.records-table tbody tr')).toHaveCount(1);
    await page.fill('#record-search', 'zzzznomatch');
    await expect(page.locator('.empty-hint')).toContainText('No contacts match');
    await page.fill('#record-search', '');
    await expect(page.locator('.records-table tbody tr').first()).toBeVisible();

    // Delete
    page.once('dialog', (d) => d.accept());
    await page.click('tr:has-text("Sara Lindqvist")');
    await page.click('#record-delete');
    await expect(page.locator('tr:has-text("Sara Lindqvist")')).toHaveCount(0);
  });

  test('required fields block an empty save', async ({ page }) => {
    await onboard(page);
    await page.click('#nav-modules .nav-link:has-text("Contacts")');
    await page.click('#add-record-btn');
    await page.click('#record-save');
    await expect(page.locator('#record-form')).toBeVisible(); // modal stayed open
  });

  test('data survives a reload', async ({ page }) => {
    await onboard(page);
    await page.click('#nav-modules .nav-link:has-text("Contacts")');
    await page.click('#add-record-btn');
    await page.fill('#f-name', 'Persistent Percy');
    await page.click('#record-save');
    await page.reload();
    await page.click('#nav-modules .nav-link:has-text("Contacts")');
    await expect(page.locator('tr:has-text("Persistent Percy")')).toBeVisible();
  });
});

test.describe('table sorting', () => {
  test('sorts by value numerically and cycles back to default', async ({ page }) => {
    await onboard(page);
    await page.click('#nav-modules .nav-link:has-text("Deals")');
    await page.click('.seg-btn[data-view="table"]');

    const header = page.locator('th:has-text("Value")');
    const values = async () => (await page.locator('.records-table tbody tr td:nth-child(2)').allTextContents())
      .map((t) => Number(t.replace(/[^0-9.-]/g, '')))
      .filter((n) => !Number.isNaN(n));

    // Re-rendering is async, so wait for the header state before reading rows;
    // otherwise the previous render is sampled and the assertion is meaningless.
    await header.click();
    await expect(header).toHaveAttribute('aria-sort', 'ascending');
    const asc = await values();
    expect(asc).toEqual([...asc].sort((a, b) => a - b));

    await header.click();
    await expect(header).toHaveAttribute('aria-sort', 'descending');
    const desc = await values();
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
    expect(desc).toEqual([...asc].reverse());

    await header.click();
    await expect(header).toHaveAttribute('aria-sort', 'none');
  });

  test('sorts dropdowns in pipeline order, not alphabetically', async ({ page }) => {
    await onboard(page);
    await page.click('#nav-modules .nav-link:has-text("Deals")');
    await page.click('.seg-btn[data-view="table"]');
    await page.click('th:has-text("Stage")');
    const stages = (await page.locator('.records-table tbody tr td:nth-child(3)').allTextContents()).map((s) => s.trim());
    // Lead precedes Proposal in the option list even though P < L alphabetically.
    const order = ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'];
    const idx = stages.filter((s) => order.includes(s)).map((s) => order.indexOf(s));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });
});

test.describe('kanban', () => {
  test('drag between columns persists across a reload', async ({ page }) => {
    await onboard(page);
    await page.click('#nav-modules .nav-link:has-text("Deals")');
    await expect(page.locator('.kanban')).toBeVisible();

    const card = page.locator('.kanban-card:has-text("Monthly supplies contract")');
    await card.dragTo(page.locator('.kanban-col[data-col="Qualified"] .kanban-cards'));
    await expect(page.locator('.kanban-col[data-col="Qualified"] .kanban-card:has-text("Monthly supplies")')).toBeVisible();

    await page.reload();
    await page.click('#nav-modules .nav-link:has-text("Deals")');
    await expect(page.locator('.kanban-col[data-col="Qualified"] .kanban-card:has-text("Monthly supplies")')).toBeVisible();
  });

  test('column totals use the workspace currency', async ({ page }) => {
    await onboard(page, { currency: 'EUR' });
    await page.click('#nav-modules .nav-link:has-text("Deals")');
    await expect(page.locator('.kanban-card-value').first()).toContainText('€');
  });
});

test.describe('module builder', () => {
  // Dropdown and Link-to-module reveal an extra input on its own line. That
  // used to disturb the row's layout and squash the "Req" label to 16px, so
  // its text painted over "List". Check the controls hold their shape.
  for (const [type, label] of [['text', 'Text'], ['select', 'Dropdown'], ['relation', 'Link to module']]) {
    test(`field controls stay aligned when the type is ${label}`, async ({ page }) => {
      await onboard(page);
      await page.click('#add-module-btn');
      await page.locator('.builder-field .bf-type').first().selectOption(type);

      const metrics = await page.evaluate(() => {
        const row = document.querySelector('.builder-field');
        const flags = [...row.querySelectorAll('.bf-flag')].map((el) => {
          const r = el.getBoundingClientRect();
          return {
            text: el.textContent.trim(),
            x: r.x, y: r.y, right: r.right, width: r.width,
            clipped: el.scrollWidth > el.clientWidth + 1,
          };
        });
        return { flags, rowRight: row.getBoundingClientRect().right };
      });

      const [req, list] = metrics.flags;
      expect(req.text).toBe('Req');
      expect(list.text).toBe('List');
      expect(req.y, 'Req and List should sit on the same line').toBe(list.y);
      expect(list.x, 'Req must not overlap List').toBeGreaterThanOrEqual(req.right);
      // A starved box is what made the label text spill over its neighbour.
      expect(req.width, 'Req is too narrow for its label').toBeGreaterThan(35);
      expect(list.width, 'List is too narrow for its label').toBeGreaterThan(35);
      expect(req.clipped, 'Req label is clipped').toBe(false);
      expect(list.clipped, 'List label is clipped').toBe(false);
      expect(list.right).toBeLessThanOrEqual(metrics.rowRight);
    });
  }

  test('creates a custom module with a dropdown and a relation', async ({ page }) => {
    await onboard(page);
    await page.click('#add-module-btn');
    await page.fill('#b-name', 'Projects');
    await page.locator('.builder-field .bf-label').first().fill('Project name');

    await page.click('#b-add-field');
    let row = page.locator('.builder-field').last();
    await row.locator('.bf-label').fill('Status');
    await row.locator('.bf-type').selectOption('select');
    await row.locator('.bf-options').fill('Planned, Active, Done');
    await row.locator('.bf-list').check();

    await page.click('#b-add-field');
    row = page.locator('.builder-field').last();
    await row.locator('.bf-label').fill('Client');
    await row.locator('.bf-type').selectOption('relation');

    await page.click('#b-save');
    await expect(page.locator('#nav-modules .nav-link:has-text("Projects")')).toBeVisible();

    // The relation picker should list real records from the linked module.
    await page.click('#add-record-btn');
    await page.fill('#f-name', 'Website revamp');
    await page.selectOption('#f-status', 'Active');
    const options = await page.locator('#f-client option').allTextContents();
    expect(options.length).toBeGreaterThan(1);
    await page.click('#record-save');
    await expect(page.locator('tr:has-text("Website revamp")')).toBeVisible();

    // A dropdown field unlocks the board view.
    await page.click('.seg-btn[data-view="kanban"]');
    await expect(page.locator('.kanban-col[data-col="Active"] .kanban-card:has-text("Website revamp")')).toBeVisible();
  });
});

// --- CSV -------------------------------------------------------------------

test.describe('CSV', () => {
  test('exports the current view', async ({ page }) => {
    await onboard(page);
    await page.click('#nav-modules .nav-link:has-text("Contacts")');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#export-csv-btn'),
    ]);
    expect(download.suggestedFilename()).toMatch(/^contacts-\d{4}-\d{2}-\d{2}\.csv$/);
    const stream = await download.createReadStream();
    const text = await new Promise((resolve) => {
      let out = '';
      stream.on('data', (c) => { out += c; });
      stream.on('end', () => resolve(out));
    });
    expect(text).toContain('Full name');
    expect(text).toContain('Amira Hassan');
  });

  test('imports with column mapping, type coercion and new fields', async ({ page }) => {
    await onboard(page);
    await page.click('#nav-modules .nav-link:has-text("Contacts")');

    const csv = [
      'Full name,Email,Phone,Loyalty tier',
      '"Okafor, Tunde",tunde@example.com,+1 555 0101,Gold',
      'Marta Ruiz,marta@example.com,+1 555 0102,Silver',
      '"Quote ""Q"" Person",q@example.com,,Bronze',
      ',,,', // blank row: should be skipped, not imported as an empty record
    ].join('\n');

    await page.setInputFiles('#import-csv-file', {
      name: 'contacts.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv, 'utf8'),
    });

    // Known headers should be auto-mapped; the unknown one offered as new.
    await expect(page.locator('.map-row')).toHaveCount(5); // header row + 4 columns
    const nameSelect = page.locator('.map-select[data-col="0"]');
    await expect(nameSelect).toHaveValue('name');
    await page.locator('.map-select[data-col="3"]').selectOption('__new__');

    await page.click('#csv-import-go');
    await expect(page.locator('tr:has-text("Okafor, Tunde")')).toBeVisible();
    await expect(page.locator('tr:has-text("Quote \\"Q\\" Person")')).toBeVisible();
    await expect(page.locator('tr:has-text("Marta Ruiz")')).toBeVisible();

    // The new field was created and populated. Click the name cell, not the
    // row centre: email/phone cells are real links that deliberately swallow
    // the click rather than opening the record.
    await page.locator('tr:has-text("Marta Ruiz") td').first().click();
    await expect(page.locator('#f-loyalty_tier')).toHaveValue('Silver');
  });

  test('round-trips an export back through import', async ({ page }) => {
    await onboard(page);
    await page.click('#nav-modules .nav-link:has-text("Contacts")');
    const before = await page.locator('.records-table tbody tr').count();

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-csv-btn')]);
    const path = await download.path();
    await page.setInputFiles('#import-csv-file', path);
    await page.click('#csv-import-go');

    await expect(page.locator('.records-table tbody tr')).toHaveCount(before * 2);
  });
});

// --- demo data -------------------------------------------------------------

test.describe('demo data', () => {
  test('fills every module and makes the dashboard look alive', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#onboard-demo')).toBeVisible();
    await page.click('#onboard-demo');

    await expect(page.locator('#workspace-name')).toHaveText('Lumen Studio', { timeout: 20000 });
    await expect(page.locator('#nav-modules .nav-link')).toHaveCount(6);
    await expect(page.locator('.stat-tile-value')).toBeVisible();

    // Deals populate several pipeline columns, which is the point of the demo.
    await page.click('#nav-modules .nav-link:has-text("Deals")');
    await expect(page.locator('.kanban-card')).toHaveCount(18);
    const filled = await page.locator('.kanban-col:has(.kanban-card)').count();
    expect(filled).toBeGreaterThanOrEqual(4);

    await page.click('#nav-modules .nav-link:has-text("Contacts")');
    await expect(page.locator('.count-badge')).toHaveText('40');
  });
});

test.describe('guided tour', () => {
  test('runs all six steps, loading demo data on the way', async ({ page }) => {
    await page.goto('/');
    await page.click('#onboard-tour');
    await expect(page.locator('.tour-pop')).toBeVisible({ timeout: 30000 });

    for (let step = 1; step <= 6; step += 1) {
      await expect(page.locator('.tour-pop:not(.is-loading)')).toBeVisible();
      await expect(page.locator('[data-tour-count]')).toHaveText(`Step ${step} of 6`);

      // The card must stay on screen and must not cover the thing it points at.
      const layout = await page.evaluate(() => {
        const pop = document.querySelector('.tour-pop').getBoundingClientRect();
        const ring = document.querySelector('.tour-ring').getBoundingClientRect();
        return {
          onScreen: pop.left >= 0 && pop.top >= 0
            && pop.right <= window.innerWidth + 1 && pop.bottom <= window.innerHeight + 1,
          coversTarget: !(pop.right < ring.left || pop.left > ring.right
            || pop.bottom < ring.top || pop.top > ring.bottom),
        };
      });
      expect(layout.onScreen, `step ${step} card is off screen`).toBe(true);
      expect(layout.coversTarget, `step ${step} card covers its own highlight`).toBe(false);

      await page.click('[data-tour-next]');
    }

    await expect(page.locator('.tour-pop')).toHaveCount(0);
    // It landed on a populated workspace rather than an empty one.
    await expect(page.locator('#nav-modules .nav-link')).toHaveCount(6);
  });

  test('sets up each screen it describes, and never stalls', async ({ page }) => {
    await page.goto('/');
    await page.click('#onboard-tour');
    await expect(page.locator('.tour-pop')).toBeVisible({ timeout: 30000 });

    const settle = async () => {
      const t0 = Date.now();
      await expect(page.locator('.tour-pop:not(.is-loading)')).toBeVisible();
      // Steps used to burn a 6s target-polling budget when navigation silently
      // failed, which read as the app freezing.
      expect(Date.now() - t0, 'step took too long to settle').toBeLessThan(4000);
    };

    await settle();                                  // 1 — dashboard
    await page.click('[data-tour-next]');
    await settle();                                  // 2 — must be the board
    await expect(page.locator('.kanban')).toBeVisible();

    await page.click('[data-tour-next]');
    await settle();                                  // 3 — must be the sorted table
    await expect(page.locator('.records-table')).toBeVisible();
    await expect(page.locator('th[aria-sort="descending"]')).toContainText('Value');

    await page.click('[data-tour-next]');
    await settle();                                  // 4 — import lives on a module page
    await expect(page.locator('#import-csv-btn')).toBeVisible();

    // No step may narrate over the onboarding screen.
    await expect(page.locator('.template-card')).toHaveCount(0);
  });

  test('refuses to start when the sample data is unavailable', async ({ page }) => {
    // The reported failure: without demo data the tour ran anyway, leaving
    // steps 2-4 describing screens that were never opened.
    await page.route('**/js/demo-data.js', (route) => route.abort());
    await page.goto('/');
    await page.click('#onboard-tour');
    await expect(page.locator('.toast').last()).toContainText('sample data could not be loaded');
    await expect(page.locator('.tour-pop')).toHaveCount(0);
  });

  test('can be skipped, and does not trap the page', async ({ page }) => {
    await page.goto('/');
    await page.click('#onboard-tour');
    await expect(page.locator('.tour-pop')).toBeVisible({ timeout: 30000 });
    await page.click('[data-tour-skip]');
    await expect(page.locator('.tour-pop')).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveClass(/tour-open/);
    // The app underneath is still usable.
    await page.click('#nav-modules .nav-link:has-text("Deals")');
    await expect(page.locator('h1')).toContainText('Deals');
  });

  test('Escape closes it', async ({ page }) => {
    await page.goto('/');
    await page.click('#onboard-tour');
    await expect(page.locator('.tour-pop')).toBeVisible({ timeout: 30000 });
    await page.keyboard.press('Escape');
    await expect(page.locator('.tour-pop')).toHaveCount(0);
  });
});

// --- accounts, sync, admin -------------------------------------------------

test.describe('accounts and sync', () => {
  test('signing in uploads local work, and a new device gets it back', async ({ page, browser }) => {
    const email = uniqueEmail('sync');
    await onboard(page, { name: 'Sync Co', currency: 'GBP' });
    await signIn(page, email);

    await expect(page.locator('.sync-status')).toHaveAttribute('data-status', 'synced', { timeout: 20000 });
    const cloud = await (await page.request.get('/api/data')).json();
    expect(cloud.modules.length).toBeGreaterThan(0);
    expect(cloud.settings.currency).toBe('GBP');

    // A brand new browser profile signing in as the same person.
    const fresh = await browser.newContext();
    const page2 = await fresh.newPage();
    await page2.goto('/');
    await signIn(page2, email);
    await expect(page2.locator('#workspace-name')).toHaveText('Sync Co', { timeout: 20000 });
    await expect(page2.locator('#nav-modules .nav-link').first()).toBeVisible();
    await fresh.close();
  });

  test('edits made offline sync once the connection returns', async ({ page, context }) => {
    await onboard(page);
    await signIn(page, uniqueEmail('offline'));
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); // become controlled by the service worker

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#nav-modules .nav-link:has-text("Tasks")')).toBeVisible({ timeout: 15000 });
    await page.click('#nav-modules .nav-link:has-text("Tasks")');
    await page.click('#add-record-btn');
    await page.fill('#f-title', 'Written while offline');
    await page.click('#record-save');
    await expect(page.locator('tr:has-text("Written while offline")')).toBeVisible();

    await context.setOffline(false);
    await expect(async () => {
      const data = await (await page.request.get('/api/data')).json();
      expect(data.records.some((r) => r.data.title === 'Written while offline')).toBe(true);
    }).toPass({ timeout: 20000 });
  });

  /*
   * Two devices, one account. This is the case whole-snapshot sync got wrong:
   * whoever saved second uploaded their entire workspace and the other
   * person's record simply disappeared. Driven through the real UI in two
   * browser contexts, because the failure was only ever visible there.
   */
  test('two devices editing different records both keep their work', async ({ page, browser }) => {
    const email = uniqueEmail('two-device');
    await onboard(page, { name: 'Two Device Co' });
    await signIn(page, email);
    await expect(page.locator('.sync-status')).toHaveAttribute('data-status', 'synced', { timeout: 20000 });

    const second = await browser.newContext();
    const page2 = await second.newPage();
    await page2.goto('/');
    await signIn(page2, email);
    await expect(page2.locator('#nav-modules .nav-link:has-text("Contacts")')).toBeVisible({ timeout: 20000 });

    // Neither device knows about the other's edit until it syncs.
    await page.click('#nav-modules .nav-link:has-text("Contacts")');
    await page.click('#add-record-btn');
    await page.fill('#f-name', 'Added on device one');
    await page.click('#record-save');
    await expect(page.locator('tr:has-text("Added on device one")')).toBeVisible();

    await page2.click('#nav-modules .nav-link:has-text("Contacts")');
    await page2.click('#add-record-btn');
    await page2.fill('#f-name', 'Added on device two');
    await page2.click('#record-save');
    await expect(page2.locator('tr:has-text("Added on device two")')).toBeVisible();

    await expect(async () => {
      const data = await (await page.request.get('/api/data')).json();
      const names = data.records.map((r) => r.data.name);
      expect(names).toContain('Added on device one');
      expect(names).toContain('Added on device two');
    }).toPass({ timeout: 25000 });

    // And each device sees the other's record once it reloads and syncs.
    await page.reload();
    await expect(page.locator('tr:has-text("Added on device two")')).toBeVisible({ timeout: 25000 });
    await second.close();
  });

  test('a record deleted on one device stays deleted on the other', async ({ page, browser }) => {
    const email = uniqueEmail('tombstone');
    await onboard(page, { name: 'Tombstone Co' });
    await signIn(page, email);
    await page.click('#nav-modules .nav-link:has-text("Contacts")');
    await page.click('#add-record-btn');
    await page.fill('#f-name', 'Doomed Contact');
    await page.click('#record-save');
    await expect(page.locator('tr:has-text("Doomed Contact")')).toBeVisible();
    // Wait on the server, not on the sync chip: the chip can still read
    // "synced" from the previous trip while this record is queued behind a
    // debounce, and the second device would then start from a workspace that
    // never contained the record this test is about.
    await expect(async () => {
      const data = await (await page.request.get('/api/data')).json();
      expect(data.records.some((r) => r.data.name === 'Doomed Contact')).toBe(true);
    }).toPass({ timeout: 25000 });

    // A second device that has the record, then goes quiet.
    const second = await browser.newContext();
    const page2 = await second.newPage();
    await page2.goto('/');
    await signIn(page2, email);
    await page2.click('#nav-modules .nav-link:has-text("Contacts")');
    await expect(page2.locator('tr:has-text("Doomed Contact")')).toBeVisible({ timeout: 25000 });

    // Deleted on device one.
    await page.click('tr:has-text("Doomed Contact") td:first-child');
    page.once('dialog', (d) => d.accept());
    await page.click('#record-delete');
    await expect(page.locator('tr:has-text("Doomed Contact")')).toHaveCount(0);

    await expect(async () => {
      const data = await (await page.request.get('/api/data')).json();
      expect(data.records.some((r) => r.data.name === 'Doomed Contact')).toBe(false);
    }).toPass({ timeout: 25000 });

    // Device two reloads and must drop it — not push its stale copy back.
    await page2.reload();
    await page2.click('#nav-modules .nav-link:has-text("Contacts")');
    await expect(page2.locator('tr:has-text("Doomed Contact")')).toHaveCount(0, { timeout: 25000 });

    await expect(async () => {
      const data = await (await page2.request.get('/api/data')).json();
      expect(data.records.some((r) => r.data.name === 'Doomed Contact')).toBe(false);
    }).toPass({ timeout: 25000 });
    await second.close();
  });

  test('signing out keeps the data on the device', async ({ page }) => {
    await onboard(page);
    await signIn(page, uniqueEmail('logout'));
    await page.goto('/#/settings');
    await page.click('#signout-btn');
    await expect(page.locator('#signin-btn')).toBeVisible();
    await page.goto('/#/');
    await expect(page.locator('#nav-modules .nav-link').first()).toBeVisible();
  });
});

test.describe('admin', () => {
  test('shows metrics and manages accounts', async ({ page, browser }) => {
    // ADMIN_EMAILS in playwright.config.js guarantees this address is an admin
    // regardless of which test created the first account.
    await page.goto('/');
    await signIn(page, 'e2e-admin@example.com');
    await expect(page.locator('#nav-admin')).toBeVisible();

    await page.click('#nav-admin');
    await expect(page.locator('.admin-stats .stat-card')).toHaveCount(5);
    await expect(page.locator('.chart .bar').first()).toBeVisible();

    // Chart tooltips are the only way to read exact values.
    await page.locator('.bar-g').last().hover();
    await expect(page.locator('#chart-tip')).toBeVisible();

    // A second account appears in the table and can be disabled.
    const victimEmail = uniqueEmail('victim');
    const other = await browser.newContext();
    const page2 = await other.newPage();
    await page2.goto('/');
    await signIn(page2, victimEmail);
    // A solo signup owns an org of one, so no Admin link is offered — and if
    // they call the API directly they see only their own org, never ours.
    await expect(page2.locator('#nav-admin')).toBeHidden();
    const theirStats = await (await page2.request.get('/api/admin/stats')).json();
    expect(theirStats.scope).toBe('org');
    expect(theirStats.totals.users, 'another tenant leaked into their stats').toBe(1);

    await page.click('#nav-admin');
    await page.reload();
    await page.click('#nav-admin');
    const row = page.locator(`.admin-row:has-text("${victimEmail}")`);
    await expect(row).toBeVisible();

    page.once('dialog', (d) => d.accept());
    await row.locator('[data-act="disable"]').click();
    await expect(page.locator(`.admin-row:has-text("${victimEmail}") .pill-danger`)).toBeVisible();
    expect((await page2.request.get('/api/data')).status()).toBe(401);

    await other.close();
  });

  test('one tenant never sees another in the admin view', async ({ page, browser }) => {
    // Two unrelated businesses on the same deployment.
    const aEmail = uniqueEmail('tenant-a');
    const bEmail = uniqueEmail('tenant-b');

    await page.goto('/');
    await signIn(page, aEmail);

    const second = await browser.newContext();
    const pageB = await second.newPage();
    await pageB.goto('/');
    await signIn(pageB, bEmail);

    // B's admin surface must contain B and nobody else.
    const listing = await (await pageB.request.get('/api/admin/users')).json();
    expect(listing.scope).toBe('org');
    expect(listing.users.map((u) => u.email)).toEqual([bEmail]);

    // And the org ids genuinely differ.
    const orgA = await (await page.request.get('/api/org')).json();
    const orgB = await (await pageB.request.get('/api/org')).json();
    expect(orgA.org.id).not.toBe(orgB.org.id);

    await second.close();
  });

  test('a member is told the admin page is not for them', async ({ page, browser }) => {
    const ownerEmail = uniqueEmail('team-owner');
    const memberEmail = uniqueEmail('team-member');

    await page.goto('/');
    await signIn(page, ownerEmail);

    const ctx = await browser.newContext();
    const memberPage = await ctx.newPage();
    await memberPage.goto('/');
    await signIn(memberPage, memberEmail);
    const memberId = (await (await memberPage.request.get('/api/me')).json()).user.id;

    // Demote them via the platform admin, who can reach across orgs.
    const admin = await browser.newContext();
    const adminPage = await admin.newPage();
    await adminPage.goto('/');
    await signIn(adminPage, 'e2e-admin@example.com');
    const res = await adminPage.request.patch(`/api/admin/users/${memberId}`, { data: { role: 'member' } });
    expect(res.status()).toBe(200);

    await memberPage.goto('/#/admin');
    await expect(memberPage.locator('.empty-hint')).toContainText('administrators only');

    await ctx.close();
    await admin.close();
  });
});

// --- settings --------------------------------------------------------------

test.describe('settings', () => {
  test('changing currency reformats money everywhere', async ({ page }) => {
    await onboard(page, { currency: 'USD' });
    await page.goto('/#/settings');
    await page.selectOption('#set-currency', 'JPY');
    await page.click('#save-workspace');
    await page.click('#nav-modules .nav-link:has-text("Deals")');
    await expect(page.locator('.kanban-card-value').first()).toContainText('¥');
  });

  test('exports and re-imports a JSON backup', async ({ page }) => {
    await onboard(page, { name: 'Backup Co' });
    await page.goto('/#/settings');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-btn')]);
    const path = await download.path();

    page.once('dialog', (d) => d.accept());
    await page.setInputFiles('#import-file', path);
    await expect(page.locator('#nav-modules .nav-link').first()).toBeVisible();
    await expect(page.locator('#workspace-name')).toHaveText('Backup Co');
  });

  test('rejects a file that is not a CRM Builder backup', async ({ page }) => {
    await onboard(page);
    await page.goto('/#/settings');
    await page.setInputFiles('#import-file', {
      name: 'nope.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"hello":"world"}', 'utf8'),
    });
    await expect(page.locator('.toast').last()).toContainText('does not look like');
  });
});

// --- security --------------------------------------------------------------

test('javascript: URLs in link fields are not rendered as executable hrefs', async ({ page }) => {
  await onboard(page, { templates: ['Companies'] });
  await page.click('#nav-modules .nav-link:has-text("Companies")');
  await page.click('#add-record-btn');
  await page.fill('#f-name', 'Sketchy Ltd');
  await page.fill('#f-website', 'https://ok.example');
  await page.click('#record-save');

  // Write a hostile value straight into storage, as a malicious CSV or a
  // tampered backup would, then confirm it never becomes a javascript: href.
  await page.evaluate(async () => {
    const all = await DB.getAll('records');
    const rec = all.find((r) => r.data.name === 'Sketchy Ltd');
    rec.data.website = 'javascript:window.__pwned = true';
    await DB.put('records', rec);
  });
  await page.reload();
  await page.click('#nav-modules .nav-link:has-text("Companies")');

  const hrefs = await page.locator('.records-table a').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  expect(hrefs.some((h) => (h || '').toLowerCase().startsWith('javascript:'))).toBe(false);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});
