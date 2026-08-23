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

/*
 * Sign in, and answer the claim prompt if one appears.
 *
 * Work done before signing in lives in the anonymous scope, and the app asks
 * once whether to bring it into the account. `claim` picks the answer:
 *   'work' (default) bring my work, leave any samples
 *   'all'            bring everything
 *   'none'           leave it on this device / start fresh
 * The prompt only appears when there is something to decide, so a sign-in on a
 * device with nothing on it simply proceeds.
 */
async function signIn(page, email, { claim = 'work' } = {}) {
  const trigger = page.locator('#signin-btn, #onboard-signin').first();
  await trigger.waitFor({ state: 'visible' });
  await trigger.click();
  await page.fill('#dev-email', email);
  await page.click('#dev-login-form button[type=submit]');
  await expect(page.locator('.user-chip')).toBeVisible({ timeout: 15000 });
  await answerClaimPrompt(page, claim);
}

async function answerClaimPrompt(page, claim = 'work') {
  const prompt = page.locator('[data-claim]').first();
  try {
    await prompt.waitFor({ state: 'visible', timeout: 4000 });
  } catch {
    return false; // nothing to decide
  }
  // Fall back to the primary option when the asked-for one isn't offered —
  // which choices appear depends on whether the device holds real work,
  // samples, or both.
  const wanted = page.locator(`[data-claim="${claim}"]`);
  const button = (await wanted.count()) ? wanted : page.locator('[data-claim]').first();
  await button.click();
  await expect(page.locator('[data-claim]')).toHaveCount(0);
  return true;
}

/*
 * Start the tour from the onboarding screen.
 *
 * The tour needs a populated workspace, so on an empty device it now asks
 * before seeding one — nobody gets a fictional business without saying yes.
 */
async function startTour(page) {
  await page.click('#onboard-tour');
  const consent = page.locator('[data-consent="yes"]');
  if (await consent.isVisible().catch(() => false)) await consent.click();
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
    await startTour(page);
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
    await startTour(page);
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
    await expect(page.locator('.toast').last()).toContainText('Sample data could not be loaded');
    await expect(page.locator('[data-consent]')).toHaveCount(0, { timeout: 5000 });
    await expect(page.locator('.tour-pop')).toHaveCount(0);
  });

  test('can be skipped, and does not trap the page', async ({ page }) => {
    await page.goto('/');
    await startTour(page);
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
    await startTour(page);
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

  /*
   * Signing out hides a workspace; it never destroys one.
   *
   * This used to assert the opposite — that the data stayed on screen after
   * sign-out. That is convenient on a personal laptop and a leak on a shared
   * one: the next person to sit down saw the last person's CRM. The workspace
   * is still on the device, in that account's own store, and comes straight
   * back on the next sign-in.
   */
  test('signing out hides the workspace, and signing back in restores it', async ({ page }) => {
    const email = uniqueEmail('logout');
    await onboard(page, { name: 'Logout Co' });
    await signIn(page, email);
    await page.click('#nav-modules .nav-link:has-text("Contacts")');
    await page.click('#add-record-btn');
    await page.fill('#f-name', 'Kept Across Sign Out');
    await page.click('#record-save');
    await expect(page.locator('tr:has-text("Kept Across Sign Out")')).toBeVisible();

    await page.goto('/#/settings');
    await page.click('#signout-btn');
    await expect(page.locator('#signin-btn')).toBeVisible();

    // Back to a blank slate — not the previous session's records.
    await page.goto('/#/');
    await expect(page.locator('.template-card').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('tr:has-text("Kept Across Sign Out")')).toHaveCount(0);

    // Nothing was deleted: the same account gets it all back.
    await signIn(page, email);
    await expect(page.locator('#workspace-name')).toHaveText('Logout Co', { timeout: 25000 });
    await page.click('#nav-modules .nav-link:has-text("Contacts")');
    await expect(page.locator('tr:has-text("Kept Across Sign Out")')).toBeVisible({ timeout: 25000 });
  });

  /*
   * The shared PC.
   *
   * A signs in, edits, and cannot sync (offline). They leave without signing
   * out. B sits down and signs in on the same browser profile.
   *
   * Before storage scopes this pushed A's pending rows straight into B's
   * account: one IndexedDB database served every visitor, and the sync engine
   * uploaded whatever it found under whichever session was current.
   */
  test('one person\u2019s unsynced work never lands in the next person\u2019s account', async ({ page, context }) => {
    const a = uniqueEmail('shared-a');
    const b = uniqueEmail('shared-b');

    await onboard(page, { name: 'Person A Co' });
    await signIn(page, a);
    await expect(page.locator('.sync-status')).toHaveAttribute('data-status', 'synced', { timeout: 20000 });

    // A edits with no way to reach the server, then walks away.
    await context.setOffline(true);
    await page.click('#nav-modules .nav-link:has-text("Contacts")');
    await page.click('#add-record-btn');
    await page.fill('#f-name', 'A Unsynced Contact');
    await page.click('#record-save');
    await expect(page.locator('tr:has-text("A Unsynced Contact")')).toBeVisible();
    await context.setOffline(false);

    // B signs in on the same machine, without A ever signing out.
    await page.goto('/#/settings');
    await page.click('#signout-btn');
    await expect(page.locator('#signin-btn')).toBeVisible();
    await signIn(page, b);

    // The assertion that matters most first: whatever is on screen, A's rows
    // must never become part of B's account on the server.
    await page.waitForTimeout(3000); // give any stray sync every chance to misbehave
    const bData = await (await page.request.get('/api/data')).json();
    const bNames = (bData.records || []).map((r) => r.data.name);
    expect(bNames, "B's account must not contain A's records").not.toContain('A Unsynced Contact');

    // And B must not be looking at A's workspace either.
    await expect(page.locator('#workspace-name')).not.toHaveText('Person A Co');
    const contactsLink = page.locator('#nav-modules .nav-link:has-text("Contacts")');
    if (await contactsLink.count()) {
      await contactsLink.click();
      await expect(page.locator('tr:has-text("A Unsynced Contact")')).toHaveCount(0);
    }

    // A comes back to the same machine. Their pending edit is still theirs and
    // syncs with no special recovery step.
    await page.goto('/#/settings');
    await page.click('#signout-btn');
    await expect(page.locator('#signin-btn')).toBeVisible();
    await signIn(page, a);
    await expect(page.locator('#workspace-name')).toHaveText('Person A Co', { timeout: 25000 });
    await expect(async () => {
      const data = await (await page.request.get('/api/data')).json();
      expect(data.records.some((r) => r.data.name === 'A Unsynced Contact')).toBe(true);
    }).toPass({ timeout: 25000 });
  });
});

/*
 * Sample data must never arrive in a real account unasked, and must always be
 * removable without taking the user's own work with it.
 */
test.describe('sample data', () => {
  test('the tour asks before seeding anything', async ({ page }) => {
    await page.goto('/');
    await page.click('#onboard-tour');
    // Nothing is written until the question is answered.
    await expect(page.locator('[data-consent="yes"]')).toBeVisible();
    await expect(page.locator('#nav-modules .nav-link')).toHaveCount(0);

    await page.click('[data-consent="no"]');
    await expect(page.locator('.tour-pop')).toHaveCount(0);
    await expect(page.locator('.template-card').first()).toBeVisible();
    await expect(page.locator('#nav-modules .nav-link')).toHaveCount(0);
  });

  test('signing in after the tour starts fresh by default', async ({ page }) => {
    await page.goto('/');
    await startTour(page);
    await expect(page.locator('.tour-pop')).toBeVisible({ timeout: 30000 });
    await page.click('[data-tour-skip]');
    await expect(page.locator('#nav-modules .nav-link')).toHaveCount(6);

    // The demo-only prompt offers "Start fresh" first.
    await signIn(page, uniqueEmail('demo-fresh'), { claim: 'none' });

    // The strongest claim first: the fictional business never reaches the
    // account's server-side workspace at all.
    const data = await (await page.request.get('/api/data')).json();
    expect(data.records === null || data.records.length === 0,
      'a fresh account must not receive the demo business').toBe(true);
    await expect(page.locator('.template-card').first()).toBeVisible({ timeout: 25000 });
    await expect(page.locator('#nav-modules .nav-link')).toHaveCount(0);
  });

  test('the demo can be kept on purpose, and removed later', async ({ page }) => {
    await page.goto('/');
    await startTour(page);
    await expect(page.locator('.tour-pop')).toBeVisible({ timeout: 30000 });
    await page.click('[data-tour-skip]');

    await signIn(page, uniqueEmail('demo-keep'), { claim: 'all' });
    await expect(page.locator('#nav-modules .nav-link').first()).toBeVisible({ timeout: 25000 });
    await expect(async () => {
      const data = await (await page.request.get('/api/data')).json();
      expect((data.records || []).length).toBeGreaterThan(50);
    }).toPass({ timeout: 25000 });

    // One click, from any device, for as long as any sample row survives.
    await page.goto('/#/settings');
    page.once('dialog', (d) => d.accept());
    await page.click('#remove-demo-btn');
    await expect(page.locator('#nav-modules .nav-link')).toHaveCount(0, { timeout: 20000 });
    await expect(async () => {
      const data = await (await page.request.get('/api/data')).json();
      expect((data.records || []).length).toBe(0);
    }).toPass({ timeout: 25000 });
  });

  test('removing samples keeps work the user added to a sample module', async ({ page }) => {
    await page.goto('/');
    await startTour(page);
    await expect(page.locator('.tour-pop')).toBeVisible({ timeout: 30000 });
    await page.click('[data-tour-skip]');

    // The user makes one of the demo modules their own.
    await page.click('#nav-modules .nav-link:has-text("Contacts")');
    await page.click('#add-record-btn');
    await page.fill('#f-name', 'My Own Contact');
    await page.click('#record-save');
    await expect(page.locator('tr:has-text("My Own Contact")')).toBeVisible();

    await page.goto('/#/settings');
    page.once('dialog', (d) => d.accept());
    await page.click('#remove-demo-btn');

    // The module survives because their record lives in it; every seeded row
    // in it is gone. Deleting the module would have taken their work along.
    await expect(page.locator('#nav-modules .nav-link:has-text("Contacts")')).toBeVisible({ timeout: 20000 });
    await page.click('#nav-modules .nav-link:has-text("Contacts")');
    await expect(page.locator('tr:has-text("My Own Contact")')).toBeVisible();
    await expect(page.locator('.count-badge')).toHaveText('1');
  });
});

/*
 * Two people, one workspace.
 *
 * The whole point of the org-owned workspace: an owner invites a colleague,
 * the colleague joins through the link, and they are looking at the same CRM.
 * Driven in two browser contexts because that is the only way to see it.
 */
test.describe('team workspaces', () => {
  async function inviteLink(page) {
    await page.goto('/#/settings');
    await page.click('#invite-btn');
    const field = page.locator('#invite-url');
    await expect(field).toBeVisible({ timeout: 20000 });
    const url = await field.inputValue();
    await page.click('.modal [data-close]');
    return url;
  }

  test('an owner invites, and the colleague joins and sees the same records', async ({ page, browser }) => {
    const ownerEmail = uniqueEmail('team-owner');
    await onboard(page, { name: 'Team Co' });
    await signIn(page, ownerEmail);
    await page.click('#nav-modules .nav-link:has-text("Contacts")');
    await page.click('#add-record-btn');
    await page.fill('#f-name', 'Shared Contact');
    await page.click('#record-save');
    await expect(async () => {
      const data = await (await page.request.get('/api/data')).json();
      expect(data.records.some((r) => r.data.name === 'Shared Contact')).toBe(true);
    }).toPass({ timeout: 25000 });

    const url = await inviteLink(page);
    expect(url).toContain('invite=');

    // A colleague, on their own machine, opening the link.
    const second = await browser.newContext();
    const mate = await second.newPage();
    await mate.goto(new URL(url).pathname + new URL(url).search);
    await signIn(mate, uniqueEmail('team-mate'), { claim: 'none' });

    await expect(mate.locator('[data-join]').first()).toBeVisible({ timeout: 25000 });
    await mate.click('[data-join="fresh"]');

    await expect(mate.locator('#workspace-name')).toHaveText('Team Co', { timeout: 25000 });
    await mate.click('#nav-modules .nav-link:has-text("Contacts")');
    await expect(mate.locator('tr:has-text("Shared Contact")')).toBeVisible({ timeout: 25000 });

    // And what the colleague writes reaches the owner — per-record sync
    // holding across people, not just devices.
    await mate.click('#add-record-btn');
    await mate.fill('#f-name', 'Added By Colleague');
    await mate.click('#record-save');
    await expect(async () => {
      const data = await (await page.request.get('/api/data')).json();
      expect(data.records.some((r) => r.data.name === 'Added By Colleague')).toBe(true);
    }).toPass({ timeout: 25000 });

    await page.reload();
    await page.click('#nav-modules .nav-link:has-text("Contacts")');
    await expect(page.locator('tr:has-text("Added By Colleague")')).toBeVisible({ timeout: 25000 });
    await second.close();
  });

  /*
   * The joiner already has an account and a synced workspace of their own.
   *
   * Their device holds a replica of THAT workspace. Joining a team has to
   * throw it away and take the team's instead — pushing it would publish one
   * organisation's records into another's, the shared-device bug in a
   * different costume. Deliberately signed in beforehand: a joiner whose work
   * is still anonymous is covered by the sign-in claim prompt, which is a
   * different mechanism.
   */
  test('a joiner who starts fresh does not publish their own records', async ({ page, browser }) => {
    const ownerEmail = uniqueEmail('fresh-owner');
    await onboard(page, { name: 'Fresh Co' });
    await signIn(page, ownerEmail);
    await expect(page.locator('.sync-status')).toHaveAttribute('data-status', 'synced', { timeout: 20000 });
    const url = await inviteLink(page);

    const second = await browser.newContext();
    const mate = await second.newPage();
    await onboard(mate, { name: 'My Own Co' });
    await signIn(mate, uniqueEmail('fresh-mate'));
    await mate.click('#nav-modules .nav-link:has-text("Contacts")');
    await mate.click('#add-record-btn');
    await mate.fill('#f-name', 'Strictly Private');
    await mate.click('#record-save');
    await expect(async () => {
      const d = await (await mate.request.get('/api/data')).json();
      expect(d.records.some((r) => r.data.name === 'Strictly Private')).toBe(true);
    }).toPass({ timeout: 25000 });

    await mate.goto(new URL(url).pathname + new URL(url).search);
    await expect(mate.locator('[data-join]').first()).toBeVisible({ timeout: 25000 });
    await mate.click('[data-join="fresh"]');

    // Wait for the join itself, then let any sync the joiner's client wants to
    // do actually happen — the leak this guards against would arrive on that
    // sync, so asserting before it settles would pass for the wrong reason.
    //
    // By org id, not by name: an organisation is named after its creator's
    // email domain, while #workspace-name shows the business name from
    // settings. They are different strings and only one of them moves here.
    const ownerOrg = (await (await page.request.get('/api/me')).json()).org.id;
    await expect(async () => {
      const me = await (await mate.request.get('/api/me')).json();
      expect(me.org && me.org.id).toBe(ownerOrg);
    }).toPass({ timeout: 25000 });
    await mate.waitForTimeout(3000);

    // The claim that matters: their private record is not in the team's
    // workspace, whatever is on screen.
    const team = await (await page.request.get('/api/data')).json();
    expect(team.records.map((r) => r.data.name),
      'declining to bring work must not publish it to the team').not.toContain('Strictly Private');

    await expect(mate.locator('#workspace-name')).toHaveText('Fresh Co', { timeout: 25000 });
    await expect(mate.locator('tr:has-text("Strictly Private")')).toHaveCount(0);
    await second.close();
  });

  /*
   * The leak this guards against, in its only real form.
   *
   * Already-synced rows are past the push watermark and would never be re-sent,
   * so the dangerous case is work the joiner made OFFLINE and has not delivered
   * yet. The server files every write under the caller's current workspace, so
   * flushing that queue after the org has moved posts one person's private
   * records into their new team's CRM.
   */
  test('unsynced work from a previous workspace never lands in the new team', async ({ page, browser }) => {
    test.info().expectedConsoleErrors = [/Failed to fetch|net::ERR|sync/i];
    await onboard(page, { name: 'Leak Co' });
    await signIn(page, uniqueEmail('leak-owner'));
    await expect(page.locator('.sync-status')).toHaveAttribute('data-status', 'synced', { timeout: 20000 });
    const url = await inviteLink(page);

    const second = await browser.newContext();
    const mate = await second.newPage();
    await onboard(mate, { name: 'Mate Own Co' });
    await signIn(mate, uniqueEmail('leak-mate'));
    await expect(mate.locator('.sync-status')).toHaveAttribute('data-status', 'synced', { timeout: 20000 });

    // Sync alone is blocked, so the edit stays queued while everything else —
    // loading the invite, joining — still works. Ordinary offline would not do:
    // the page load before joining would flush the queue and close the window
    // this test is about.
    await second.route('**/api/sync', (route) => route.abort());
    await mate.click('#nav-modules .nav-link:has-text("Contacts")');
    await mate.click('#add-record-btn');
    await mate.fill('#f-name', 'Never Meant For The Team');
    await mate.click('#record-save');
    await expect(mate.locator('tr:has-text("Never Meant For The Team")')).toBeVisible();

    await mate.goto(new URL(url).pathname + new URL(url).search);
    await expect(mate.locator('[data-join]').first()).toBeVisible({ timeout: 25000 });
    await mate.click('[data-join="fresh"]');
    // Sync works again the moment the join is under way, which is exactly when
    // a flush aimed at the wrong workspace would go out.
    await second.unroute('**/api/sync');

    const ownerOrg = (await (await page.request.get('/api/me')).json()).org.id;
    await expect(async () => {
      const me = await (await mate.request.get('/api/me')).json();
      expect(me.org && me.org.id).toBe(ownerOrg);
    }).toPass({ timeout: 25000 });
    await mate.waitForTimeout(3000);

    const team = await (await page.request.get('/api/data')).json();
    expect(team.records.map((r) => r.data.name),
      "a queued edit must not be filed under the team the author just joined")
      .not.toContain('Never Meant For The Team');
    await second.close();
  });

  test('a joiner can bring their work into the team on purpose', async ({ page, browser }) => {
    await onboard(page, { name: 'Bring Co' });
    await signIn(page, uniqueEmail('bring-owner'));
    await expect(page.locator('.sync-status')).toHaveAttribute('data-status', 'synced', { timeout: 20000 });
    const url = await inviteLink(page);

    const second = await browser.newContext();
    const mate = await second.newPage();
    await onboard(mate, { name: 'Mate Co' });
    await signIn(mate, uniqueEmail('bring-mate'));
    await mate.click('#nav-modules .nav-link:has-text("Contacts")');
    await mate.click('#add-record-btn');
    await mate.fill('#f-name', 'Comes With Me');
    await mate.click('#record-save');
    await expect(async () => {
      const d = await (await mate.request.get('/api/data')).json();
      expect(d.records.some((r) => r.data.name === 'Comes With Me')).toBe(true);
    }).toPass({ timeout: 25000 });

    await mate.goto(new URL(url).pathname + new URL(url).search);
    await expect(mate.locator('[data-join="bring"]')).toBeVisible({ timeout: 25000 });
    await mate.click('[data-join="bring"]');
    await expect(mate.locator('#workspace-name')).toHaveText('Bring Co', { timeout: 25000 });

    await expect(async () => {
      const team = await (await page.request.get('/api/data')).json();
      expect(team.records.map((r) => r.data.name)).toContain('Comes With Me');
    }).toPass({ timeout: 25000 });
    await second.close();
  });

  /*
   * Schema belongs to the owner, and a member is told rather than left guessing.
   *
   * The case this really exists for is not somebody poking at a hidden button:
   * it is an owner who edited a module offline and was demoted before they
   * reconnected. Their work legitimately vanishes, and the difference between
   * that being a rule and being a bug report is entirely the message.
   */
  test('a demoted member has their module edit reverted, and is told why', async ({ page, browser }) => {
    const ownerEmail = uniqueEmail('demote-owner');
    await onboard(page, { name: 'Demote Co' });
    await signIn(page, ownerEmail);
    await expect(page.locator('.sync-status')).toHaveAttribute('data-status', 'synced', { timeout: 20000 });
    const url = await inviteLink(page);

    const second = await browser.newContext();
    const mate = await second.newPage();
    await mate.goto(new URL(url).pathname + new URL(url).search);
    await signIn(mate, uniqueEmail('demote-mate'), { claim: 'none' });
    await expect(mate.locator('[data-join]').first()).toBeVisible({ timeout: 25000 });
    await mate.click('[data-join="fresh"]');
    await expect(mate.locator('#nav-modules .nav-link:has-text("Contacts")')).toBeVisible({ timeout: 25000 });

    // They joined as a member, so the builder is read-only and offers no save.
    await mate.click('#nav-modules .nav-link:has-text("Contacts")');
    await mate.click('#edit-module-btn');
    await expect(mate.locator('.builder-readonly')).toBeVisible();
    await expect(mate.locator('#b-save')).toHaveCount(0);
    await expect(mate.locator('#b-delete')).toHaveCount(0);
    await mate.click('.modal [data-close]');

    // Now force the race: a module edit made while their client still believed
    // it could, delivered after the server knows better.
    await mate.evaluate(async () => {
      const mods = await DB.getAll('modules');
      const target = mods.find((m) => m.name === 'Contacts');
      await DB.put('modules', { ...target, name: 'Renamed While Demoted', updatedAt: Date.now() });
      Scope.set('dirty', '1');
    });
    await mate.evaluate(() => Cloud.sync());

    // The rename is undone, and the toast names the module rather than leaving
    // them to conclude the app ate their work.
    // .last(): several toasts can be on screen at once, and strict mode
    // refuses a multi-match — the trap that has bitten here before.
    await expect(mate.locator('.toast').last())
      .toContainText('Only an owner can change module fields', { timeout: 25000 });
    await expect(mate.locator('.toast').last()).toContainText('Contacts');
    await expect(mate.locator('#nav-modules .nav-link:has-text("Contacts")')).toBeVisible();
    await expect(mate.locator('#nav-modules .nav-link:has-text("Renamed While Demoted")')).toHaveCount(0);

    // And the team never saw it.
    const team = await (await page.request.get('/api/data')).json();
    expect(team.modules.map((m) => m.name),
      "a member's rename must not reach the team").not.toContain('Renamed While Demoted');
    await second.close();
  });

  /*
   * Being removed clears the team's records from the removed person's device.
   *
   * Their orgId changes, so the next time their client reaches /api/me the
   * workspace reset fires and the replica goes. Worth asserting because the
   * honest limit is narrower than it first looks — the only real exposure is a
   * device that never comes online again, not "we cannot erase it".
   */
  test('a removed member loses the team from their device on next contact', async ({ page, browser }) => {
    await onboard(page, { name: 'Removal Co' });
    await signIn(page, uniqueEmail('removal-owner'));
    await page.click('#nav-modules .nav-link:has-text("Contacts")');
    await page.click('#add-record-btn');
    await page.fill('#f-name', 'Team Only Contact');
    await page.click('#record-save');
    await expect(async () => {
      const d = await (await page.request.get('/api/data')).json();
      expect(d.records.some((r) => r.data.name === 'Team Only Contact')).toBe(true);
    }).toPass({ timeout: 25000 });
    const url = await inviteLink(page);

    const second = await browser.newContext();
    const mate = await second.newPage();
    await mate.goto(new URL(url).pathname + new URL(url).search);
    await signIn(mate, uniqueEmail('removal-mate'), { claim: 'none' });
    await expect(mate.locator('[data-join]').first()).toBeVisible({ timeout: 25000 });
    await mate.click('[data-join="fresh"]');
    await mate.click('#nav-modules .nav-link:has-text("Contacts")');
    await expect(mate.locator('tr:has-text("Team Only Contact")')).toBeVisible({ timeout: 25000 });

    // The owner removes them from the Team screen. Reloaded, not just
    // navigated: the page is already on #/settings, so goto would be a
    // same-document hash change and would show the team as it was before the
    // colleague joined.
    await page.goto('/#/settings');
    await page.reload();
    await expect(page.locator('[data-act="remove"]')).toBeVisible({ timeout: 25000 });
    page.once('dialog', (d) => d.accept());
    await page.click('[data-act="remove"]');
    await expect(page.locator('.toast').last()).toContainText('removed from the team', { timeout: 20000 });

    // Their next visit clears the replica without them doing anything. The
    // page is still on the old module's route, which no longer exists for
    // them, so check from the dashboard rather than from a dead link.
    await mate.reload();
    await expect(mate.locator('tr:has-text("Team Only Contact")')).toHaveCount(0, { timeout: 25000 });
    await expect(mate.locator('#nav-modules .nav-link')).toHaveCount(0, { timeout: 25000 });
    await mate.goto('/#/');
    await expect(mate.locator('.template-card').first()).toBeVisible({ timeout: 25000 });

    // Their account still exists — removal is not deletion.
    const me = await (await mate.request.get('/api/me')).json();
    expect(me.authenticated, 'being removed from a team must not delete the account').toBe(true);

    // And the team is unchanged.
    await page.goto('/#/');
    await page.click('#nav-modules .nav-link:has-text("Contacts")');
    await expect(page.locator('tr:has-text("Team Only Contact")')).toBeVisible();
    await second.close();
  });

  test('leaving a team hands back a clean workspace', async ({ page, browser }) => {
    await onboard(page, { name: 'Exit Co' });
    await signIn(page, uniqueEmail('exit-owner'));
    await page.click('#nav-modules .nav-link:has-text("Contacts")');
    await page.click('#add-record-btn');
    await page.fill('#f-name', 'Stays With The Team');
    await page.click('#record-save');
    await expect(async () => {
      const d = await (await page.request.get('/api/data')).json();
      expect(d.records.some((r) => r.data.name === 'Stays With The Team')).toBe(true);
    }).toPass({ timeout: 25000 });
    const url = await inviteLink(page);

    const second = await browser.newContext();
    const mate = await second.newPage();
    await mate.goto(new URL(url).pathname + new URL(url).search);
    await signIn(mate, uniqueEmail('exit-mate'), { claim: 'none' });
    await expect(mate.locator('[data-join]').first()).toBeVisible({ timeout: 25000 });
    await mate.click('[data-join="fresh"]');
    await expect(mate.locator('#nav-modules .nav-link:has-text("Contacts")')).toBeVisible({ timeout: 25000 });

    // A member leaving needs no permission from anyone.
    await mate.goto('/#/settings');
    mate.once('dialog', (d) => d.accept());
    await mate.click('#leave-team-btn');
    await expect(mate.locator('.toast').last()).toContainText('left the team', { timeout: 25000 });
    await expect(mate.locator('tr:has-text("Stays With The Team")')).toHaveCount(0);

    // The team keeps its records, and the owner is still an owner.
    const team = await (await page.request.get('/api/data')).json();
    expect(team.records.map((r) => r.data.name)).toContain('Stays With The Team');
    await second.close();
  });

  test('the invite link is not left in the address bar', async ({ page }) => {
    await onboard(page, { name: 'Hygiene Co' });
    await signIn(page, uniqueEmail('hygiene'));
    const url = await inviteLink(page);
    await page.goto(new URL(url).pathname + new URL(url).search);
    // An invite code is a credential; it does not belong in history or a
    // screenshot once the page has taken it.
    await expect(async () => {
      expect(page.url()).not.toContain('invite=');
    }).toPass({ timeout: 10000 });
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
