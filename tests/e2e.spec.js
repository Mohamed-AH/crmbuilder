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
const fs = require('fs');
const path = require('path');

/*
 * How many modules "Load demo data" produces — read from the dataset, not
 * pinned here.
 *
 * This was the literal 6 in three separate places, and all three failed the
 * moment the dataset grew a module. The assertion those tests were making is
 * "the demo seeded its modules", which is what this expresses; the exact
 * number is the dataset's business, and tests/demo.test.mjs guards its shape.
 */
const DEMO = (() => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'demo-data.js'), 'utf8');
  // eslint-disable-next-line no-new-func
  const { DEMO_DATA } = new Function(`${src}; return { DEMO_DATA };`)();
  return {
    moduleCount: Object.keys(DEMO_DATA.records).length,
    recordCount: Object.values(DEMO_DATA.records).reduce((n, rows) => n + rows.length, 0),
    // How many rows land in one module. Every count in these journeys comes
    // from here: three literal 6s, an 18 and a 40 were all really saying "what
    // the demo seeded", and every one of them broke when the dataset grew.
    countFor: (key) => (DEMO_DATA.records[key] || []).length,
    // A module the six TEMPLATES do not provide — the demo's own.
    customModule: (DEMO_DATA.modules || [])[0],
  };
})();

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
    // Reloading straight after the click races the write: the save is async,
    // and a reload mid-flight loses the record while the modules — written
    // during onboarding, long since committed — survive. That asymmetry is
    // what the failure looked like, and it only showed up under full-suite
    // load. Waiting for the row to render is waiting for DB.put to have
    // resolved, since that is what the re-render follows.
    await expect(page.locator('tr:has-text("Persistent Percy")')).toBeVisible();

    await page.reload();
    const contacts = page.locator('#nav-modules .nav-link:has-text("Contacts")');
    await expect(contacts).toBeVisible({ timeout: 15000 });
    await contacts.click();
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

/*
 * Removing a field, and what happens to what was in it.
 *
 * The builder only ever wrote module.fields, so every record kept its data
 * keys: nothing was destroyed, but the person who removed the column believed
 * it was, and the values still rode along in every JSON export and came back
 * if a field with the same name was recreated. Wrong way round for anyone who
 * removed a column *because* of what it held.
 */
test.describe('removing a field', () => {
  // Build a module with a second field and put a value in it.
  const withExtraField = async (page, value = 'Sensitive note') => {
    await onboard(page, { templates: ['Contacts'] });
    await page.click('#nav-modules .nav-link:has-text("Contacts")');
    await page.click('#edit-module-btn');
    await page.click('#b-add-field');
    const row = page.locator('.builder-field').last();
    await row.locator('.bf-label').fill('Private note');
    // Shown in the table, so the column assertions below mean something — a
    // new field is not a list column by default, and without this "the column
    // is gone" would pass on a column that was never there.
    await row.locator('.bf-list').check();
    await page.click('#b-save');

    await page.click('#add-record-btn');
    await page.fill('#f-name', 'Dana');
    await page.fill('#f-private_note', value);
    await page.click('#record-save');
    await expect(page.locator('tr:has-text("Dana")')).toBeVisible();
  };

  const removePrivateNote = async (page) => {
    await page.click('#edit-module-btn');
    await page.locator('.builder-field:has(.bf-label[value="Private note"]) .bf-remove').click();
    await page.click('#b-save');
  };

  test('deleting the values really deletes them, out of the export too', async ({ page }) => {
    await withExtraField(page);
    await removePrivateNote(page);

    // The question names the cost before it is paid.
    await expect(page.locator('.modal-head h2').last()).toContainText('Delete the data');
    await expect(page.locator('.modal-body').last()).toContainText('1 record');
    await page.click('[data-ghost="purge"]');
    await expect(page.locator('.modal-backdrop')).toHaveCount(0, { timeout: 10000 });

    // Gone from the record, and — the part that matters — gone from the file
    // the user hands to somebody else.
    await page.goto('/#/settings');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-btn')]);
    const dump = require('node:fs').readFileSync(await download.path(), 'utf8');
    expect(dump).toContain('Dana');
    expect(dump).not.toContain('Sensitive note');
  });

  test('keeping the data is possible, and says what that means', async ({ page }) => {
    await withExtraField(page);
    await removePrivateNote(page);
    await page.click('[data-ghost="keep"]');
    await expect(page.locator('.modal-backdrop')).toHaveCount(0, { timeout: 10000 });

    // The column is gone from the table either way.
    await expect(page.locator('th:has-text("Private note")')).toHaveCount(0);
    // But the value is still there, which is exactly what they were told.
    await page.goto('/#/settings');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-btn')]);
    expect(require('node:fs').readFileSync(await download.path(), 'utf8')).toContain('Sensitive note');
  });

  /*
   * Cancel has to leave the schema alone AND keep the builder open — the
   * question is nested rather than opened over the top precisely so that an
   * unsaved edit is not the price of changing your mind.
   */
  test('cancelling leaves the field, the data and the builder exactly as they were', async ({ page }) => {
    await withExtraField(page);
    await page.click('#edit-module-btn');
    await page.locator('.builder-field:has(.bf-label[value="Private note"]) .bf-remove').click();
    await page.click('#b-save');
    await page.click('[data-ghost="cancel"]');

    // Still in the builder, with the removal still pending rather than lost.
    await expect(page.locator('#b-save')).toBeVisible();
    await page.click('[data-close]');
    // And the module was never written: the column is still there.
    await expect(page.locator('th:has-text("Private note")')).toBeVisible();
  });

  test('renaming a field is not a removal', async ({ page }) => {
    await withExtraField(page);
    await page.click('#edit-module-btn');
    await page.locator('.builder-field:has(.bf-label[value="Private note"]) .bf-label').fill('Internal note');
    await page.click('#b-save');

    // No question at all: the key is carried through a rename, so nothing was
    // removed and nothing is at risk.
    await expect(page.locator('.modal-backdrop')).toHaveCount(0, { timeout: 10000 });
    await expect(page.locator('th:has-text("Internal note")')).toBeVisible();
    await expect(page.locator('tr:has-text("Sensitive note")')).toBeVisible();
  });

  test('removing an empty field asks nothing', async ({ page }) => {
    await onboard(page, { templates: ['Contacts'] });
    await page.click('#nav-modules .nav-link:has-text("Contacts")');
    await page.click('#edit-module-btn');
    await page.click('#b-add-field');
    await page.locator('.builder-field').last().locator('.bf-label').fill('Never used');
    await page.click('#b-save');

    await page.click('#edit-module-btn');
    await page.locator('.builder-field:has(.bf-label[value="Never used"]) .bf-remove').click();
    await page.click('#b-save');
    // Nothing was stored under it, so there is no question worth asking.
    await expect(page.locator('.modal-backdrop')).toHaveCount(0, { timeout: 10000 });
    await expect(page.locator('th:has-text("Never used")')).toHaveCount(0);
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
    await expect(page.locator('#nav-modules .nav-link')).toHaveCount(DEMO.moduleCount);
    await expect(page.locator('.stat-tile-value')).toBeVisible();

    // Deals populate several pipeline columns, which is the point of the demo.
    await page.click('#nav-modules .nav-link:has-text("Deals")');
    await expect(page.locator('.kanban-card')).toHaveCount(DEMO.countFor('deals'));
    // Every stage carries at least one card — the generator spreads an exact
    // count for that reason, so an empty column here is a real regression.
    const filled = await page.locator('.kanban-col:has(.kanban-card)').count();
    expect(filled).toBeGreaterThanOrEqual(4);

    await page.click('#nav-modules .nav-link:has-text("Contacts")');
    await expect(page.locator('.count-badge')).toHaveText(String(DEMO.countFor('contacts')));
  });

  /*
   * The date filter, driven rather than reasoned about (§9).
   *
   * The assertions are derived from what is on screen, not from a count the
   * demo happens to seed today — every date in the demo is generated relative
   * to the day it loads (`{ __rel: days }`, §6), so a hardcoded number here
   * would be the trap §34 already records for three other counts.
   */
  test('the due-date filter narrows a module to what needs attention', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#onboard-demo')).toBeVisible();
    await page.click('#onboard-demo');
    await expect(page.locator('#workspace-name')).toHaveText('Lumen Studio', { timeout: 20000 });

    // Tasks has a "Due date" and opens as a table, so the dates are readable.
    await page.click('#nav-modules .nav-link:has-text("Tasks")');
    const filter = page.locator('#due-filter');
    await expect(filter).toBeVisible();

    // It names the field it watches — filtering on a date the reader cannot
    // see is indistinguishable from rows going missing.
    await expect(filter.locator('option').nth(1)).toContainText('Due date');

    const all = Number(await page.locator('.count-badge').textContent());
    expect(all).toBeGreaterThan(0);

    await filter.selectOption('7');
    // The badge is in the page head, so it has to move with the filter — a
    // total that stays put beside a shortened list is §33's adjacent-and-wrong
    // number in a new place.
    await expect(page.locator('.count-badge')).not.toHaveText(String(all));
    const narrowed = Number(await page.locator('.count-badge').textContent());
    expect(narrowed).toBeLessThan(all);
    await expect(page.locator('tbody tr')).toHaveCount(narrowed);

    /*
     * Every row shown is genuinely inside the window, read off the rendered
     * cells rather than from state — this is what a user sees.
     */
    const cells = await page.locator('tbody tr td[data-label="Due date"]').allTextContents();
    expect(cells.length).toBe(narrowed);
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 7);
    for (const text of cells) {
      expect(text.trim(), 'a row with no due date must not survive the filter').not.toBe('');
      expect(new Date(text).getTime()).toBeLessThanOrEqual(horizon.getTime());
    }

    /*
     * And at least one of them is already OVERDUE.
     *
     * Without this the test passes just as happily against a future-only
     * window, because every row would still be under the horizon — the first
     * version of this test claimed to catch that and did not. The demo seeds
     * four tasks with a negative offset (§6's `{ __rel: days }`), so this is
     * deterministic rather than a hope about the dataset.
     *
     * It is the assertion that stops somebody "tidying" isDueWithin into
     * `n >= 0 && n <= days` and quietly hiding every overdue invoice.
     */
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const overdue = cells.filter((t) => new Date(t).getTime() < startOfToday.getTime());
    expect(overdue.length, 'overdue rows must survive the filter — they are the reason to look')
      .toBeGreaterThan(0);

    // And back: clearing restores every row, so the filter is a view and not a
    // deletion the user has to undo.
    await filter.selectOption('');
    await expect(page.locator('.count-badge')).toHaveText(String(all));
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
    await expect(page.locator('#nav-modules .nav-link')).toHaveCount(DEMO.moduleCount);
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
    // Nothing may put a modal over the app just because the server is
    // unreachable. The beta notice did exactly that: /api/me never answers
    // offline, so signupMode was absent and "not open" read as "gated beta".
    // Asserted here rather than left to a click timeout, which reports the
    // symptom several lines later and blames the wrong thing.
    await expect(page.locator('.modal-backdrop')).toHaveCount(0);
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
  /*
   * Two people, one record, different fields — through the real app.
   *
   * The test below covers two devices editing DIFFERENT records, which is what
   * per-record sync was built for. This is the case it did not fix: A changes
   * the phone while B changes the email on the same contact, and whoever
   * synced second used to overwrite the whole row. No offline device, no bad
   * actor — just two people working at once.
   */
  test('two people editing different fields of one contact both keep their edit', async ({ page, browser }) => {
    const email = uniqueEmail('field-merge');
    await onboard(page, { templates: ['Contacts'] });
    await signIn(page, email);
    await page.click('#nav-modules .nav-link:has-text("Contacts")');
    await page.click('#add-record-btn');
    await page.fill('#f-name', 'Dana Shared');
    await page.fill('#f-email', 'old@example.com');
    await page.fill('#f-phone', '111');
    await page.click('#record-save');
    await expect(page.locator('.sync-status')).toHaveAttribute('data-status', 'synced', { timeout: 20000 });

    // The colleague, on the same workspace, with the record already in hand.
    const second = await browser.newContext();
    const page2 = await second.newPage();
    await page2.goto('/');
    await signIn(page2, email);
    // The record has to be on the server before the colleague can have it —
    // asserted here so a slow first push fails as itself rather than as a
    // missing row twenty seconds later.
    await expect(async () => {
      const data = await (await page2.request.get('/api/data')).json();
      expect(data.records.some((r) => r.data && r.data.name === 'Dana Shared')).toBe(true);
    }).toPass({ timeout: 20000 });
    await expect(page2.locator('#nav-modules .nav-link:has-text("Contacts")')).toBeVisible({ timeout: 20000 });
    await page2.reload();
    await page2.click('#nav-modules .nav-link:has-text("Contacts")');
    await expect(page2.locator('tr:has-text("Dana Shared")')).toBeVisible({ timeout: 20000 });

    // A edits the phone.
    await page.click('tr:has-text("Dana Shared") td:first-child');
    await page.fill('#f-phone', '222');
    await page.click('#record-save');
    await expect(page.locator('.sync-status')).toHaveAttribute('data-status', 'synced', { timeout: 20000 });

    // B, who never saw that, edits the email.
    await page2.click('tr:has-text("Dana Shared") td:first-child');
    await page2.fill('#f-email', 'new@example.com');
    await page2.click('#record-save');
    await expect(page2.locator('.sync-status')).toHaveAttribute('data-status', 'synced', { timeout: 20000 });

    // Both edits stand, on the server, which is what propagates.
    await expect(async () => {
      const data = await (await page.request.get('/api/data')).json();
      const row = data.records.find((r) => r.data && r.data.name === 'Dana Shared');
      expect(row).toBeTruthy();
      expect(row.data.email).toBe('new@example.com');
      expect(row.data.phone).toBe('222');
    }).toPass({ timeout: 30000 });

    // And the person who lost the race sees the other's field once they pull,
    // rather than their own stale copy.
    await page.reload();
    await page.click('#nav-modules .nav-link:has-text("Contacts")');
    await page.click('tr:has-text("Dana Shared") td:first-child');
    await expect(page.locator('#f-email')).toHaveValue('new@example.com', { timeout: 20000 });
    await expect(page.locator('#f-phone')).toHaveValue('222');
    await second.close();
  });

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
    await expect(page.locator('#nav-modules .nav-link')).toHaveCount(DEMO.moduleCount);

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

    /*
     * The button must name what its number counts.
     *
     * It read "(220)" while the header two lines above read "214 records" —
     * both correct, because the button totals records AND modules, and read
     * side by side as a discrepancy in the data. It was reported as one.
     *
     * Asserted against the header rather than a literal, so it holds whatever
     * the demo dataset grows to, and it fails on the old bare total: 220 is
     * neither of the two numbers the header shows.
     *
     * Waits on the rendered subtitle before reading it. `.page-head .subtitle`
     * exists on every screen, so reading it straight after the navigation
     * samples the PREVIOUS page and the match comes back null — §4's re-render
     * race, which made the first version of this fail for a reason that had
     * nothing to do with the label.
     */
    const subtitle = page.locator('.page-head .subtitle');
    await expect(subtitle).toHaveText(/\d+ modules? · \d+ records?/, { timeout: 20000 });
    const summary = await subtitle.innerText();
    const modules = Number(summary.match(/(\d+)\s+modules?/)[1]);
    const records = Number(summary.match(/(\d+)\s+records?/)[1]);
    await expect(page.locator('#remove-demo-btn')).toContainText(`${records} records`);
    await expect(page.locator('#remove-demo-btn')).toContainText(`${modules} modules`);

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

  /*
   * Promotion, on a module the six TEMPLATES do not provide.
   *
   * The test above covers a template module, which is the easy half: that
   * module also exists in onboarding, so a bug that spared template-named
   * modules and destroyed custom ones would pass it. The demo's own modules
   * exist ONLY because the demo created them, which is exactly the case where
   * deleting rather than promoting would take the user's work with it.
   */
  test('a custom demo module the user has added to is kept, not deleted', async ({ page }) => {
    const custom = DEMO.customModule;
    test.skip(!custom, 'the dataset carries no custom modules');

    await page.goto('/');
    await page.click('#onboard-demo');
    await expect(page.locator(`#nav-modules .nav-link:has-text("${custom.name}")`)).toBeVisible({ timeout: 25000 });

    await page.click(`#nav-modules .nav-link:has-text("${custom.name}")`);
    await expect(page.locator('h1')).toContainText(custom.name);
    await page.click('#add-record-btn');
    await page.fill(`#f-${custom.fields[0].key}`, 'Mine, not a sample');
    await page.click('#record-save');
    await expect(page.locator('.kanban-card:has-text("Mine, not a sample"), tr:has-text("Mine, not a sample")').first())
      .toBeVisible({ timeout: 15000 });

    await page.goto('/#/settings');
    page.once('dialog', (d) => d.accept());
    await page.click('#remove-demo-btn');

    // The module is promoted — it survives with only the user's row in it.
    await expect(page.locator(`#nav-modules .nav-link:has-text("${custom.name}")`)).toBeVisible({ timeout: 25000 });
    await page.click(`#nav-modules .nav-link:has-text("${custom.name}")`);
    await expect(page.locator('.count-badge')).toHaveText('1', { timeout: 15000 });
  });

  /*
   * Relations only work if the loader resolved them, and an unresolved one is
   * silent: the cell renders empty and everything else looks fine. Asserting
   * the linked NAME is what proves an id was resolved to a real record —
   * "(linked record)" is what a dangling id renders as.
   */
  test('demo relations resolve to the records they name', async ({ page }) => {
    const custom = DEMO.customModule;
    const relation = custom && custom.fields.find((f) => f.type === 'relation');
    test.skip(!relation, 'the dataset carries no relations');

    await page.goto('/');
    await page.click('#onboard-demo');
    await expect(page.locator(`#nav-modules .nav-link:has-text("${custom.name}")`)).toBeVisible({ timeout: 25000 });
    await page.click(`#nav-modules .nav-link:has-text("${custom.name}")`);
    await expect(page.locator('h1')).toContainText(custom.name);

    /*
     * Table view, and assert on the relation's own CELL.
     *
     * Two ways the first version of this test fooled itself, both worth
     * naming: the module defaults to kanban, and a kanban card does not render
     * the relation column at all — so there was nothing to be wrong. And a
     * project is titled "Brand refresh — Bright Bakery", so a check against the
     * page text matched the company name inside the TITLE whether or not the
     * link resolved. It passed against a loader with ref resolution removed.
     */
    const table = page.locator('[data-view="table"], .view-toggle button').first();
    if (await table.isVisible().catch(() => false)) await table.click();
    await expect(page.locator('table.records-table tbody tr').first()).toBeVisible({ timeout: 15000 });

    const cells = page.locator(`td[data-label="${relation.label}"]`);
    await expect(cells.first()).toBeVisible({ timeout: 15000 });

    // A dangling id renders as "(linked record)"; an unresolved ref or a blank
    // renders as nothing. Both are failures, and neither throws.
    await expect(cells.first()).not.toHaveText('');
    await expect(cells.first()).not.toContainText('(linked record)');

    // And the text in the cell is a real record in the module it points at.
    const names = await page.evaluate(async (targetName) => {
      const db = await new Promise((res) => { const r = indexedDB.open('crmbuilder'); r.onsuccess = () => res(r.result); });
      const all = (s) => new Promise((res) => { const q = db.transaction(s).objectStore(s).getAll(); q.onsuccess = () => res(q.result); });
      const mods = await all('modules');
      const target = mods.find((m) => m.name.toLowerCase() === targetName.toLowerCase());
      const recs = await all('records');
      return recs.filter((r) => r.moduleId === target.id && !r.deletedAt).map((r) => r.data[target.fields[0].key]);
    }, relation.relatedModuleName);

    const shown = (await cells.first().innerText()).trim();
    expect(names, `"${shown}" is not a record in ${relation.relatedModuleName}`).toContain(shown);
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
  /*
   * The same race, one rung lower: demoted to viewer while offline.
   *
   * This is the case record roles actually exist for — not a poked-at hidden
   * button, but somebody who edited a record while their client still believed
   * it could and reconnects after the server knows better. Their work
   * legitimately vanishes, and the named toast is the difference between a
   * rule and a bug report.
   */
  test('someone demoted to viewer has their record edit reverted, and is told why', async ({ page, browser }) => {
    const ownerEmail = uniqueEmail('viewer-owner');
    await onboard(page, { name: 'Viewer Co', templates: ['Contacts'] });
    await signIn(page, ownerEmail);
    await page.click('#nav-modules .nav-link:has-text("Contacts")');
    await page.click('#add-record-btn');
    await page.fill('#f-name', 'Shared Contact');
    await page.click('#record-save');
    await expect(page.locator('.sync-status')).toHaveAttribute('data-status', 'synced', { timeout: 20000 });
    const url = await inviteLink(page);

    const second = await browser.newContext();
    const mate = await second.newPage();
    await mate.goto(new URL(url).pathname + new URL(url).search);
    const mateEmail = uniqueEmail('viewer-mate');
    await signIn(mate, mateEmail, { claim: 'none' });
    await expect(mate.locator('[data-join]').first()).toBeVisible({ timeout: 25000 });
    await mate.click('[data-join="fresh"]');
    await expect(mate.locator('#nav-modules .nav-link:has-text("Contacts")')).toBeVisible({ timeout: 25000 });

    // The owner demotes them to viewer, from their own session.
    const members = await (await page.request.get('/api/org/members')).json();
    const target = members.members.find((m) => m.email === mateEmail);
    expect(target).toBeTruthy();
    const demote = await page.request.patch(`/api/org/members/${target.id}`, { data: { role: 'viewer' } });
    expect(demote.ok()).toBeTruthy();

    // Their client has not heard yet, and edits a record.
    await mate.evaluate(async () => {
      const rows = await DB.getAll('records');
      const target2 = rows.find((r) => r.data && r.data.name === 'Shared Contact');
      await DB.put('records', { ...target2, data: { ...target2.data, name: 'Edited While Demoted' }, updatedAt: Date.now() });
      Scope.set('dirty', '1');
    });
    await mate.evaluate(() => Cloud.sync());

    // Undone, and named. .last() because several toasts can be on screen and
    // strict mode refuses a multi-match.
    await expect(mate.locator('.toast').last()).toContainText('read-only', { timeout: 25000 });

    // And the team never saw it.
    const team = await (await page.request.get('/api/data')).json();
    expect(team.records.map((r) => r.data && r.data.name))
      .not.toContain('Edited While Demoted');
    expect(team.records.map((r) => r.data && r.data.name)).toContain('Shared Contact');
    await second.close();
  });

  /*
   * What a view-only account SEES, not just what the server refuses.
   *
   * The complaint that started this: a viewer opened a record and got six
   * editable fields, a required-field asterisk and a lone Close button — a form
   * whose Save had apparently failed to render. It read as unfinished software
   * rather than a deliberate read-only view, which matters because a view-only
   * account may belong to an intern, an investor or an external auditor.
   *
   * Values, not disabled inputs: a greyed-out form still looks like one that
   * broke.
   */
  test('a view-only account gets a finished app for reading, not a broken one for writing', async ({ page, browser }) => {
    const ownerEmail = uniqueEmail('ro-owner');
    await onboard(page, { name: 'Read Only Co', templates: ['Contacts'] });
    await signIn(page, ownerEmail);
    await page.click('#nav-modules .nav-link:has-text("Contacts")');
    await page.click('#add-record-btn');
    await page.fill('#f-name', 'Visible Contact');
    await page.fill('#f-email', 'visible@example.test');
    await page.click('#record-save');
    await expect(page.locator('.sync-status')).toHaveAttribute('data-status', 'synced', { timeout: 20000 });
    const url = await inviteLink(page);

    const second = await browser.newContext();
    const mate = await second.newPage();
    await mate.goto(new URL(url).pathname + new URL(url).search);
    const mateEmail = uniqueEmail('ro-mate');
    await signIn(mate, mateEmail, { claim: 'none' });
    await expect(mate.locator('[data-join]').first()).toBeVisible({ timeout: 25000 });
    await mate.click('[data-join="fresh"]');
    await expect(mate.locator('#nav-modules .nav-link:has-text("Contacts")')).toBeVisible({ timeout: 25000 });

    const members = await (await page.request.get('/api/org/members')).json();
    const target = members.members.find((m) => m.email === mateEmail);
    expect((await page.request.patch(`/api/org/members/${target.id}`, { data: { role: 'viewer' } })).ok()).toBeTruthy();

    // Their client learns its new role the ordinary way.
    await mate.reload();
    await expect(mate.locator('#nav-modules .nav-link:has-text("Contacts")')).toBeVisible({ timeout: 25000 });
    await mate.click('#nav-modules .nav-link:has-text("Contacts")');
    await expect(mate.locator('tr:has-text("Visible Contact")')).toBeVisible({ timeout: 20000 });
    await mate.click('tr:has-text("Visible Contact") td:first-child');

    const modal = mate.locator('#modal-root');
    await expect(modal.locator('.record-read')).toBeVisible({ timeout: 15000 });

    // The record is READABLE — this is not an empty shell.
    await expect(modal).toContainText('Visible Contact');
    await expect(modal).toContainText('visible@example.test');

    // And there is nothing to type into, nothing to submit, and no asterisk
    // instructing them to fill in a field they cannot fill in.
    expect(await modal.locator('input, select, textarea').count()).toBe(0);
    expect(await modal.locator('#record-form').count()).toBe(0);
    expect(await modal.locator('.req').count()).toBe(0);
    expect(await modal.locator('#record-save, #record-delete').count()).toBe(0);
    await expect(modal.locator('[data-close]').last()).toHaveText(/Close/);
    await mate.keyboard.press('Escape');

    /*
     * And the rest of the surface, in one pass.
     *
     * The audit that started this found write controls offered on every
     * screen: quick-add and Add module on the dashboard, Import from CSV and
     * Edit module in the header, and a Save workspace button over an editable
     * business name and currency — which a viewer could actually change until
     * the server gate landed (§14).
     *
     * The rule (§36): creating is hidden, non-mutating stays. Export is
     * deliberately in the second group — reading the workspace and taking a
     * copy IS the job for an auditor or an investor.
     */
    await mate.goto('/#/');
    await expect(mate.locator('.stat-card').first()).toBeVisible({ timeout: 20000 });
    expect(await mate.locator('#dash-add-module').count(), 'dashboard offers Add module').toBe(0);
    expect(await mate.locator('[data-quick-add]').count(), 'dashboard offers quick add').toBe(0);
    expect(await mate.locator('#add-module-btn:visible').count(), 'sidebar offers a new module').toBe(0);

    await mate.click('#nav-modules .nav-link:has-text("Contacts")');
    await expect(mate.locator('h1')).toContainText('Contacts');
    expect(await mate.locator('#add-record-btn').count(), 'module offers Add').toBe(0);
    expect(await mate.locator('#import-csv-btn').count(), 'module offers CSV import').toBe(0);
    // Kept, but retitled: the builder is already a read view for non-owners,
    // so this opens something legible rather than refusing.
    await expect(mate.locator('#edit-module-btn')).toHaveAttribute('title', 'View module fields');
    await expect(mate.locator('#export-csv-btn'), 'export must stay — it is the job').toBeVisible();
    await expect(mate.locator('#record-search'), 'search must stay').toBeVisible();

    await mate.goto('/#/settings');
    await expect(mate.locator('.page-head .subtitle')).toBeVisible({ timeout: 20000 });
    expect(await mate.locator('#set-name').count(), 'settings offers an editable name').toBe(0);
    expect(await mate.locator('#set-currency').count(), 'settings offers an editable currency').toBe(0);
    expect(await mate.locator('#save-workspace').count(), 'settings offers Save workspace').toBe(0);
    expect(await mate.locator('#import-btn').count(), 'settings offers Import backup').toBe(0);
    expect(await mate.locator('#reset-btn').count(), 'settings offers Delete all data').toBe(0);
    expect(await mate.locator('#add-template-btn').count(), 'settings offers Add module').toBe(0);
    await expect(mate.locator('#export-btn'), 'JSON export must stay').toBeVisible();

    // The workspace is still READABLE — this is a read view, not a blank card.
    await expect(mate.locator('.card:has(h2:text-is("Workspace"))')).toContainText('Read Only Co');

    // Said once, where identity lives, and once more where the account is
    // described. Not a banner on every screen.
    await expect(mate.locator('.role-pill')).toHaveText('View only');
    await expect(mate.locator('#main')).toContainText('view-only access');
    // Framed as what they can do, never as a refusal.
    await expect(mate.locator('#main')).not.toContainText(/denied|forbidden|not permitted/i);
    await second.close();
  });

  /*
   * The same rules, on a module the USER built.
   *
   * Every other role test drives a template module or one the demo dataset
   * created. A module made in the builder is a third case: its fields, types
   * and options are chosen at runtime and its id was never in TEMPLATES. If
   * anything about the gating keyed off a known module rather than off the
   * caller's role, this is where it would show.
   */
  test('roles apply the same way to a module the user built themselves', async ({ page, browser }) => {
    const ownerEmail = uniqueEmail('custom-owner');
    await onboard(page, { name: 'Custom Co', templates: ['Contacts'] });
    await signIn(page, ownerEmail);

    // A module of their own, with a field type the templates never use here.
    await page.click('#add-module-btn');
    await page.fill('#b-name', 'Equipment');
    await page.click('#b-add-field');
    const row = page.locator('.builder-field').last();
    await row.locator('.bf-label').fill('Serial');
    await row.locator('.bf-list').check();
    await page.click('#b-save');
    await expect(page.locator('#nav-modules .nav-link:has-text("Equipment")')).toBeVisible({ timeout: 20000 });

    await page.click('#nav-modules .nav-link:has-text("Equipment")');
    await page.click('#add-record-btn');
    await page.fill('#f-name', 'Laser cutter');
    await page.fill('#f-serial', 'LC-0042');
    await page.click('#record-save');
    await expect(page.locator('tr:has-text("Laser cutter")')).toBeVisible();
    await expect(page.locator('.sync-status')).toHaveAttribute('data-status', 'synced', { timeout: 20000 });
    const url = await inviteLink(page);

    const second = await browser.newContext();
    const mate = await second.newPage();
    await mate.goto(new URL(url).pathname + new URL(url).search);
    const mateEmail = uniqueEmail('custom-mate');
    await signIn(mate, mateEmail, { claim: 'none' });
    await expect(mate.locator('[data-join]').first()).toBeVisible({ timeout: 25000 });
    await mate.click('[data-join="fresh"]');
    await expect(mate.locator('#nav-modules .nav-link:has-text("Equipment")')).toBeVisible({ timeout: 25000 });

    const members = await (await page.request.get('/api/org/members')).json();
    const target = members.members.find((m) => m.email === mateEmail);
    expect((await page.request.patch(`/api/org/members/${target.id}`, { data: { role: 'viewer' } })).ok()).toBeTruthy();
    await mate.reload();

    // The custom module is fully readable, including its custom field.
    await mate.click('#nav-modules .nav-link:has-text("Equipment")');
    await expect(mate.locator('tr:has-text("Laser cutter")')).toBeVisible({ timeout: 20000 });
    await expect(mate.locator('#main')).toContainText('LC-0042');

    // And gated exactly as a template module is.
    expect(await mate.locator('#add-record-btn').count(), 'custom module offers Add').toBe(0);
    expect(await mate.locator('#import-csv-btn').count(), 'custom module offers CSV import').toBe(0);
    await expect(mate.locator('#export-csv-btn')).toBeVisible();

    await mate.click('tr:has-text("Laser cutter") td:first-child');
    const modal = mate.locator('#modal-root');
    await expect(modal.locator('.record-read')).toBeVisible({ timeout: 15000 });
    expect(await modal.locator('input, select, textarea').count(), 'custom fields are editable').toBe(0);
    await expect(modal).toContainText('LC-0042');
    await mate.keyboard.press('Escape');

    /*
     * And the server refuses a write to it, which is the half the UI cannot
     * guarantee. Pushed directly, so this is the rule and not the button.
     */
    const before = await (await page.request.get('/api/data')).json();
    const rec = before.records.find((r) => r.data && r.data.name === 'Laser cutter');
    const out = await mate.evaluate(async (id) => {
      const rows = await DB.getAll('records');
      const target2 = rows.find((r) => r.id === id);
      await DB.put('records', { ...target2, data: { ...target2.data, serial: 'TAMPERED' }, updatedAt: Date.now() });
      Scope.set('dirty', '1');
      return Cloud.sync();
    }, rec.id);
    expect(out, 'the sync should have reported a refusal').toBeTruthy();

    const after = await (await page.request.get('/api/data')).json();
    const still = after.records.find((r) => r.id === rec.id);
    expect(still.data.serial, 'a viewer edited a record in a user-built module').toBe('LC-0042');
    await second.close();
  });

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

/*
 * What a stranger sees when the beta will not have them.
 *
 * The server-side gate has its own suite; this is about the screen. Someone
 * turned away has done nothing wrong, and the useful thing to tell them is
 * that the product still works without an account — which is true, and is the
 * whole reason the gate is defensible in the first place.
 */
test.describe('beta access', () => {
  test('a refused signup is explained, not just failed', async ({ page }) => {
    await page.goto('/?auth_error=beta');
    await expect(page.locator('.modal')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.modal')).toContainText('private beta');
    await expect(page.locator('.modal')).toContainText('without an account');
    // The code is not left in the address bar either.
    expect(page.url()).not.toContain('auth_error');

    await page.click('.modal [data-close]');
    // And they land in a working app rather than a dead end.
    await expect(page.locator('.template-card').first()).toBeVisible();
    await page.click('#onboard-create');
    await expect(page.locator('#nav-modules .nav-link').first()).toBeVisible();
    await page.click('#add-record-btn');
    await page.fill('#f-name', 'Works Without An Account');
    await page.click('#record-save');
    await expect(page.locator('tr:has-text("Works Without An Account")')).toBeVisible();
  });

  test('paused signups say so rather than blaming the visitor', async ({ page }) => {
    await page.goto('/?auth_error=closed');
    await expect(page.locator('.modal')).toContainText('paused', { timeout: 15000 });
  });

  test('a beta code is taken out of the address bar on arrival', async ({ page }) => {
    await page.goto('/?beta=some-code-from-an-invite');
    await expect(page.locator('.template-card').first()).toBeVisible();
    // A code that creates accounts is a credential; it does not belong in
    // history or a screenshot once the page has it.
    await expect(async () => {
      expect(page.url()).not.toContain('beta=');
    }).toPass({ timeout: 10000 });
    const held = await page.evaluate(() => localStorage.getItem('crmb:betaCode'));
    expect(held).toBe('some-code-from-an-invite');
  });

  /*
   * The invite link, walked end to end by the person it was sent to.
   *
   * There is no signup screen — the account is created on the first successful
   * callback — and for a long time every label on that single path said "sign
   * in" and "already have an account?". Someone arriving on an invite has no
   * account, so the only affordance on the page was telling them it was meant
   * for somebody else. What is asserted here is the wording, because the
   * wording was the whole defect.
   */
  test('an invited tester is offered an account, not asked if they already have one', async ({ page }) => {
    await page.goto('/?beta=e2e-welcome-code');

    // The code leaves the address bar; something has to say it was understood.
    await expect(page.locator('.toast').last()).toContainText('Beta invite applied');

    // Waits for the repaint after /api/me: the affordance cannot render until
    // we know a server exists to sign in to.
    const cta = page.locator('#onboard-signin');
    await expect(cta).toBeVisible({ timeout: 15000 });
    await expect(cta).toContainText('Create your account');
    await expect(cta).not.toContainText('Already have an account');
    await expect(page.locator('.onboard-account')).toContainText('beta invite is ready');

    await cta.click();
    await expect(page.locator('.modal-head h2')).toHaveText('Create your account');
    await expect(page.locator('.modal-body')).toContainText('no separate form');

    // And it is one path, not two: the ordinary sign-in completes the signup.
    await page.fill('#dev-email', 'invited-tester@example.com');
    await page.click('#dev-login-form button[type=submit]');
    await expect(page.locator('.user-chip')).toBeVisible({ timeout: 15000 });
    // The chip shows a display name, so the account itself is what gets
    // asserted — the claim is that an account now exists for this address.
    const me = await (await page.request.get('/api/me')).json();
    expect(me.authenticated).toBe(true);
    expect(me.user.email).toBe('invited-tester@example.com');
  });

  /*
   * "Can this visitor create an account" is two questions, not one.
   *
   * An invite is one way in; open signups are the other. Keying the copy on
   * the invite alone was right for the beta and wrong the moment SIGNUP_MODE
   * goes to `open` — which is the setting this deployment ends up on — because
   * then every new visitor can create an account and was being asked whether
   * they already had one. The suite runs in `open` mode (playwright.config.js).
   */
  test('open signups offer an account to a visitor with no invite', async ({ page }) => {
    await page.goto('/');
    const cta = page.locator('#onboard-signin');
    await expect(cta).toBeVisible({ timeout: 15000 });
    await expect(cta).toContainText('Create your account');
    await expect(cta).not.toContainText('Already have an account');
    // The invite wording must not appear for someone who was not invited.
    await expect(page.locator('.onboard-account')).not.toContainText('beta invite');
    await cta.click();
    await expect(page.locator('.modal-head h2')).toHaveText('Create your account');
  });

  /*
   * And the other half: a gated deployment cannot offer what it will refuse.
   *
   * SIGNUP_MODE is process-wide, so rather than boot a second server this
   * drives the client with the answer a `code`-mode server would give — which
   * is the input the affordance actually reads.
   */
  test('a gated deployment with no invite asks whether they already have an account', async ({ page }) => {
    await page.route('**/api/me', async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      body.signupMode = 'code';
      await route.fulfill({ response: res, json: body });
    });
    await page.goto('/');
    const cta = page.locator('#onboard-signin');
    await expect(cta).toBeVisible({ timeout: 15000 });
    await expect(cta).toContainText('Already have an account');
    await expect(page.locator('.onboard-account')).toHaveCount(0);

    // The sidebar's own button is a sign-in offer at all times: it is what a
    // returning user presses, and it must not retitle itself for them.
    await page.locator('#signin-btn').click();
    await expect(page.locator('.modal-head h2')).toHaveText('Sign in');
  });

  /*
   * A stranger who was turned away can knock.
   *
   * The server half of this — the cookie, the queue, approval letting them in
   * — is in tests/signup.test.mjs, which can boot a gated server; this suite
   * runs one server in `open` mode, so the refusal is injected. What is proved
   * here is the screen: that being refused offers a way to ask at all, that
   * asking says so, and that the client sends the note and nothing else.
   */
  test('a refused stranger is offered a way to ask, and told when they have', async ({ page }) => {
    // The refusal is the point of the test, so its 403 is a diagnostic.
    test.info().expectedConsoleErrors = [/403 \(Forbidden\)/];
    await page.route('**/auth/dev', (route) => route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'That beta code is not valid. Ask for a fresh one.', reason: 'beta' }),
    }));
    const sent = [];
    await page.route('**/api/access-request', (route) => {
      sent.push(route.request().postDataJSON());
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, status: 'received' }) });
    });

    await page.goto('/');
    await page.locator('#onboard-signin').waitFor({ timeout: 15000 });
    await page.locator('#onboard-signin').click();
    await page.fill('#dev-email', 'turned-away@example.com');
    await page.click('#dev-login-form button[type=submit]');

    // A refusal is a screen, not a toast that fades before it is read.
    await expect(page.locator('.modal-head h2')).toHaveText('This is a private beta');
    await page.fill('#ask-note', 'I run a two-person landscaping business');
    await page.click('#ask-send');

    await expect(page.locator('#ask-block')).toContainText('Asked');
    await expect(page.locator('#ask-send')).toHaveCount(0, { timeout: 5000 });

    expect(sent).toHaveLength(1);
    expect(sent[0].note).toBe('I run a two-person landscaping business');
    // The address is established by the server at the refusal and read from an
    // httpOnly cookie. There is deliberately nothing here to put one in.
    expect(sent[0].email).toBeUndefined();

    // And the dead end is gone: they can still use the product.
    await page.click('.modal [data-close]');
    await expect(page.locator('.template-card').first()).toBeVisible();
  });

  test('someone already on the list is told that, not that it is invite-only', async ({ page }) => {
    // The refusal is the point of the test, so its 403 is a diagnostic.
    test.info().expectedConsoleErrors = [/403 \(Forbidden\)/];
    await page.route('**/auth/dev', (route) => route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'That beta code is not valid. Ask for a fresh one.', reason: 'pending' }),
    }));
    await page.goto('/');
    await page.locator('#onboard-signin').waitFor({ timeout: 15000 });
    await page.locator('#onboard-signin').click();
    await page.fill('#dev-email', 'already-asked@example.com');
    await page.click('#dev-login-form button[type=submit]');

    await expect(page.locator('.modal-head h2')).toHaveText('You are on the list');
    // Nothing to ask for twice, and nothing to watch an inbox for.
    await expect(page.locator('#ask-send')).toHaveCount(0);
    await expect(page.locator('.modal-body')).toContainText('nothing to wait for in your inbox');
  });
});

test.describe('admin', () => {
  /*
   * Opening and pausing signups from the panel.
   *
   * This used to need an environment change and a redeploy — minutes of
   * downtime on a free tier to flip one word, at the two moments you least
   * want it: the beta filling up, or something going wrong.
   *
   * The suite's server boots with SIGNUP_MODE=open, so this ends by putting it
   * back: the mode is now stored, and leaving it changed would leak into every
   * test that runs after this one.
   */
  test('signups can be paused and reopened without a redeploy', async ({ page }) => {
    await page.goto('/');
    await signIn(page, 'e2e-admin@example.com');
    await page.goto('/#/admin');
    // Two mode-switch rows exist now — signups and org creation — so this one
    // is addressed by the buttons it owns.
    await expect(page.locator('.mode-switch:has([data-mode])')).toBeVisible({ timeout: 20000 });

    try {
      await page.click('.mode-switch [data-mode="closed"]');
      await expect(page.locator('.toast').last()).toContainText('now closed');
      // The live value, not the environment's — asserted at the API because
      // that is what every client is told on boot.
      await expect(async () => {
        const me = await (await page.request.get('/api/me')).json();
        expect(me.signupMode).toBe('closed');
      }).toPass({ timeout: 10000 });

      // The button for the current mode is the one you cannot press again.
      await expect(page.locator('.mode-switch [data-mode="closed"]')).toBeDisabled();
    } finally {
      page.on('dialog', (d) => d.accept());
      await page.click('.mode-switch [data-mode="open"]');
      await expect(async () => {
        const me = await (await page.request.get('/api/me')).json();
        expect(me.signupMode).toBe('open');
      }).toPass({ timeout: 10000 });
    }
  });

  /*
   * What the deployment is carrying, on one screen.
   *
   * Three limits this can actually hit — Atlas storage, container RAM, monthly
   * egress — plus which tenant is heaviest. Uptime hours are deliberately not
   * here: Render does not publish free-tier consumption and a number nobody
   * can check is worse than none.
   */
  /*
   * A paused workspace is recoverable, and that is the whole claim.
   *
   * The push is refused while the pull still runs, so the client must NOT
   * advance its push watermark — otherwise those rows are marked as sent,
   * never offered again, and resuming the organisation restores writing while
   * having quietly lost everything typed during the pause. Driven through the
   * real app because the watermark lives in the browser.
   */
  test('work typed while a workspace is paused survives, and lands when it resumes', async ({ page, browser }) => {
    const email = uniqueEmail('paused');
    await onboard(page, { templates: ['Contacts'] });
    await signIn(page, email);
    await expect(page.locator('.sync-status')).toHaveAttribute('data-status', 'synced', { timeout: 20000 });
    const orgId = (await (await page.request.get('/api/me')).json()).user.orgId;

    // The operator pauses them, from a separate session.
    const opCtx = await browser.newContext();
    const op = await opCtx.newPage();
    await op.goto('/');
    await signIn(op, 'e2e-admin@example.com');
    const pause = await op.request.post(`/api/admin/orgs/${orgId}/suspend`, {
      data: { suspend: true, reason: 'Paused for a storage review' },
    });
    expect(pause.ok()).toBeTruthy();

    /*
     * TWO records, and they must not share a timestamp.
     *
     * Client selection uses `>=` on the watermark (§10), so a single row
     * sitting exactly on the boundary is re-sent even when the watermark
     * wrongly advanced — the first version of this test passed on the bug for
     * that reason. The earlier of two records is the one that actually falls
     * below the line and disappears.
     */
    await page.click('#nav-modules .nav-link:has-text("Contacts")');
    for (const name of ['Typed while paused', 'Typed a moment later']) {
      await page.click('#add-record-btn');
      await page.fill('#f-name', name);
      await page.click('#record-save');
      await expect(page.locator(`tr:has-text("${name}")`)).toBeVisible();
      await page.waitForTimeout(1100); // distinct updatedAt, and a sync attempt between them
    }

    // They are told, rather than left with a sync that silently stopped.
    await expect(page.locator('.toast').last()).toContainText('storage review', { timeout: 20000 });

    // The server does not have it.
    await expect(async () => {
      const data = await (await page.request.get('/api/data')).json();
      expect(data.records.some((r) => r.data && r.data.name === 'Typed while paused')).toBe(false);
    }).toPass({ timeout: 15000 });

    // Resume, and the work they did during the pause has to arrive. If the
    // watermark moved on the refused push, this is where it is lost for good.
    expect((await op.request.post(`/api/admin/orgs/${orgId}/suspend`, { data: { suspend: false } })).ok()).toBeTruthy();
    await page.reload();
    await expect(async () => {
      const data = await (await page.request.get('/api/data')).json();
      const names = data.records.map((r) => r.data && r.data.name);
      // Both, not just the newest. The earlier one is the assertion that
      // fails if the watermark moved on the refused push.
      expect(names).toContain('Typed while paused');
      expect(names).toContain('Typed a moment later');
    }).toPass({ timeout: 30000 });
    await opCtx.close();
  });

  test('a test alert says whether alerts can reach anybody at all', async ({ page }) => {
    await page.goto('/');
    await signIn(page, 'e2e-admin@example.com');
    await page.goto('/#/admin');
    await page.locator('#test-alert-btn').waitFor({ timeout: 20000 });
    await page.click('#test-alert-btn');
    // No webhook is configured in this suite, and saying so is the point:
    // silence and a broken URL are otherwise the same thing.
    await expect(page.locator('.toast').last()).toContainText('nowhere to go');
  });

  test('the deployment card shows the three meters and who is heaviest', async ({ page }) => {
    await page.goto('/');
    await signIn(page, 'e2e-admin@example.com');
    await page.goto('/#/admin');
    await expect(page.locator('.meter-grid')).toBeVisible({ timeout: 20000 });

    const meters = page.locator('.meter');
    await expect(meters).toHaveCount(3);
    await expect(page.locator('.meter-head')).toContainText(['Database', 'Memory', 'Bandwidth']);
    // Real readings, not placeholders — an empty meter would render an em dash.
    await expect(meters.filter({ hasText: 'Memory' })).toContainText(/\d+(\.\d+)? MB of 512 MB/);
    await expect(meters.filter({ hasText: 'Bandwidth' })).toContainText(/of 5(\.0)? GB/);

    // And the tenant table, with a share column so dominance is visible.
    await expect(page.locator('h2:has-text("Organisations")')).toBeVisible();
    const firstRow = page.locator('.card:has(h2:has-text("Organisations")) tbody tr').first();
    await expect(firstRow).toContainText('%');
  });

  /*
   * A workspace that is mostly gravestones has to say so on the row.
   *
   * "278 KB" alone cannot tell a heavy tenant from one that has loaded and
   * cleared the demo data a few times, and the storage alerts fire on the
   * figure that conflates them — the two want opposite responses. See §33.
   */
  test('a tenant that is mostly tombstones says so on its row', async ({ page, browser }) => {
    // A tenant that deletes most of what it created.
    const ctx = await browser.newContext();
    const tenant = await ctx.newPage();
    await tenant.goto('/');
    await signIn(tenant, uniqueEmail('reclaim'));
    const now = Date.now();
    const rows = [...Array(12)].map((_, i) => ({
      id: `reclaim-${i}`, updatedAt: now, doc: { moduleId: 'm1', data: { name: `row ${i}` } },
    }));
    await tenant.request.post('/api/sync', { data: { since: 0, records: rows } });
    await tenant.request.post('/api/sync', {
      data: {
        since: 0,
        records: rows.slice(0, 10).map((r) => ({ id: r.id, updatedAt: now + 1000, deleted: true, deletedAt: now + 1000 })),
      },
    });
    await ctx.close();

    await page.goto('/');
    await signIn(page, 'e2e-admin@example.com');

    /*
     * Ask for a fresh measurement BEFORE rendering the panel.
     *
     * /api/admin/platform is cached 30s because usageByOrg() scans, and
     * nothing invalidates it on sync — so a page drawn straight after seeding
     * can legitimately show a table from before this tenant existed. ?fresh=1
     * rewrites the cache, so the reload below sees the new rows.
     */
    const view = await (await page.request.get('/api/admin/platform?fresh=1')).json();
    const scarred = view.orgs.find((o) => o.deadBytes > 0 && o.deadBytes / o.bytes >= 0.1);
    expect(scarred, 'ten stub tombstones against two live rows should be a visible share').toBeTruthy();

    await page.goto('/#/admin');
    await expect(page.locator('h2:has-text("Organisations")')).toBeVisible({ timeout: 20000 });
    const row = page.locator('.card:has(h2:has-text("Organisations")) tbody tr', { hasText: scarred.name });
    await expect(row).toContainText('reclaimable');
    // The qualifier belongs to the size, not to the record count beside it.
    await expect(row.locator('td[data-label="Stored"]')).toContainText('% reclaimable');
  });

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
    await page.click('[data-currency="yes"]');
    await page.click('#nav-modules .nav-link:has-text("Deals")');
    await expect(page.locator('.kanban-card-value').first()).toContainText('¥');
  });

  /*
   * The currency setting relabels; it does not convert.
   *
   * Correct — there are no exchange rates here and inventing one would be
   * worse — but not what the word leads people to expect. Switching USD to EUR
   * turns a $10,000 deal into a €10,000 deal and moves every pipeline total
   * with it, and it used to do that in silence.
   */
  test('switching currency says it relabels rather than converts, and can be refused', async ({ page }) => {
    await onboard(page, { currency: 'USD' });
    await page.goto('/#/settings');
    await page.selectOption('#set-currency', 'EUR');
    await page.click('#save-workspace');

    const modal = page.locator('.modal-body').last();
    await expect(modal).toContainText('not what they are worth');
    await expect(modal).toContainText('Nothing is converted');
    // The count is what makes it concrete rather than a general warning.
    await expect(modal).toContainText(/\d+ records? hold an amount/);

    await page.click('[data-currency="no"]');
    // Refused means nothing moved — not the currency, and not the rest of the
    // form that was saved alongside it.
    await page.reload();
    await expect(page.locator('#set-currency')).toHaveValue('USD');
  });

  test('a workspace with no amounts is not asked about currency at all', async ({ page }) => {
    await onboard(page, { currency: 'USD', templates: ['Contacts'] });
    await page.goto('/#/settings');
    await page.selectOption('#set-currency', 'GBP');
    await page.click('#save-workspace');
    // Nothing is stored in a currency field, so there is no misreading to
    // prevent and a dialog would be pure noise.
    await expect(page.locator('.modal-backdrop')).toHaveCount(0);
    await expect(page.locator('.toast').last()).toContainText('Workspace saved');
  });

  test('exports and re-imports a JSON backup', async ({ page }) => {
    await onboard(page, { name: 'Backup Co' });
    await page.goto('/#/settings');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-btn')]);
    const path = await download.path();

    await page.setInputFiles('#import-file', path);
    await page.click('#restore-merge');
    await expect(page.locator('#nav-modules .nav-link').first()).toBeVisible();
    await expect(page.locator('#workspace-name')).toHaveText('Backup Co');
  });

  /*
   * Restoring a backup must not delete a colleague's work.
   *
   * Import used to tombstone every local row absent from the file, and
   * tombstones sync — so recovering one deleted module took the whole team
   * back to the date of the backup, using the feature named recovery. The
   * confirmation said "REPLACES everything currently on this device", which
   * undersold it on both counts.
   *
   * Two halves have to hold, and both are asserted, because either alone
   * passes on a broken build: the restore actually restores (otherwise a
   * no-op import looks identical to a good merge), and nothing else is
   * touched — checked at the server, since that is what propagates.
   */
  test('a merge restore brings back what was lost without deleting a colleague’s work', async ({ page, browser }) => {
    const email = uniqueEmail('restore-merge');
    await onboard(page, { name: 'Merge Co', templates: ['Contacts', 'Tasks'] });
    await signIn(page, email);
    await expect(page.locator('.sync-status')).toHaveAttribute('data-status', 'synced', { timeout: 20000 });

    // The backup captures both modules.
    await page.goto('/#/settings');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-btn')]);
    const backup = await download.path();

    // Something real to recover: delete Tasks entirely.
    await page.click('#nav-modules .nav-link:has-text("Tasks")');
    await page.click('#edit-module-btn');
    // One handler, on the one click that actually raises a confirm. Two armed
    // `once` listeners both fire on the same dialog and the second throws
    // "already handled", which fails the test several steps later.
    page.once('dialog', (d) => d.accept());
    await page.click('#b-delete');
    await expect(page.locator('#nav-modules .nav-link:has-text("Tasks")')).toHaveCount(0);

    // A colleague, on the same workspace, adds something after the backup.
    const second = await browser.newContext();
    const page2 = await second.newPage();
    await page2.goto('/');
    await signIn(page2, email);
    await page2.click('#nav-modules .nav-link:has-text("Contacts")');
    await page2.click('#add-record-btn');
    await page2.fill('#f-name', 'Added after the backup');
    await page2.click('#record-save');
    await expect(page2.locator('.sync-status')).toHaveAttribute('data-status', 'synced', { timeout: 20000 });

    // Capture its id from the server, so the tombstone check below can name it.
    let addedId = null;
    await expect(async () => {
      const data = await (await page.request.get('/api/data')).json();
      const row = data.records.find((r) => r.data && r.data.name === 'Added after the backup');
      expect(row).toBeTruthy();
      addedId = row.id;
    }).toPass({ timeout: 20000 });

    // Device one pulls it in, so it is genuinely present before the restore —
    // otherwise the assertion afterwards could pass without meaning anything.
    await page.reload();
    await page.click('#nav-modules .nav-link:has-text("Contacts")');
    await expect(page.locator('tr:has-text("Added after the backup")')).toBeVisible({ timeout: 20000 });

    await page.goto('/#/settings');
    await page.setInputFiles('#import-file', backup);
    await page.click('#restore-merge');

    // Half one: the restore restored. Tasks is back.
    await expect(page.locator('#nav-modules .nav-link:has-text("Tasks")')).toBeVisible({ timeout: 20000 });
    // Half two: it took nothing with it.
    await page.click('#nav-modules .nav-link:has-text("Contacts")');
    await expect(page.locator('tr:has-text("Added after the backup")')).toBeVisible();

    // And the half that matters — nothing was broadcast. Not just "the record
    // survived": a tombstone minted at import time carries `stamp: true`'s
    // clock, so it would be NEWER than the colleague's row and would win. The
    // claim is that no tombstone was created at all.
    await expect(page.locator('.sync-status')).toHaveAttribute('data-status', 'synced', { timeout: 20000 });
    await expect(async () => {
      const delta = await (await page.request.get('/api/sync?since=0')).json();
      const row = delta.records.find((r) => r.id === addedId);
      expect(row, 'the colleague’s record should still be on the server').toBeTruthy();
      expect(row.deleted, 'a merge restore must not tombstone anything').toBeFalsy();
    }).toPass({ timeout: 20000 });

    // The colleague's own device never loses it either.
    await page2.reload();
    await page2.click('#nav-modules .nav-link:has-text("Contacts")');
    await expect(page2.locator('tr:has-text("Added after the backup")')).toBeVisible({ timeout: 20000 });
    await second.close();
  });

  /*
   * And the destructive path stays destructive, deliberately and by name.
   *
   * Without this, a build where replace silently merged would pass the test
   * above — "restore never deletes anything" is not the guarantee, "restore
   * does not delete anything unless you asked for it, having been told the
   * count" is.
   */
  test('a replace restore says how many rows it will delete, and then does', async ({ page }) => {
    await onboard(page, { name: 'Replace Co', templates: ['Contacts'] });
    await page.goto('/#/settings');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-btn')]);
    const backup = await download.path();

    await page.click('#nav-modules .nav-link:has-text("Contacts")');
    await page.click('#add-record-btn');
    await page.fill('#f-name', 'Added after the backup');
    await page.click('#record-save');
    await expect(page.locator('tr:has-text("Added after the backup")')).toBeVisible();

    await page.goto('/#/settings');
    await page.setInputFiles('#import-file', backup);
    let warning = '';
    page.once('dialog', (d) => { warning = d.message(); d.accept(); });
    await page.click('#restore-replace');

    // The count is the point: "everything not in the file" is abstract until
    // it is a number.
    await expect(async () => expect(warning).toMatch(/Delete 1 item/)).toPass({ timeout: 5000 });
    await page.click('#nav-modules .nav-link:has-text("Contacts")');
    await expect(page.locator('tr:has-text("Added after the backup")')).toHaveCount(0);
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

/*
 * A record id is attacker-influenceable and lands in an HTML attribute.
 *
 * Values were escaped from the start; ids were not, because they are normally
 * uid() output and "obviously" safe. They are not: importState writes whatever
 * ids a backup file carries, and /api/sync does String(item.id) without
 * restricting characters, so a colleague pushing by hand can choose one too.
 * That is the same threat model safeHref already names — CSV imports and
 * shared backups.
 */
test('a hostile record id cannot break out of the attribute it is rendered into', async ({ page }) => {
  await onboard(page, { templates: ['Contacts'] });
  await page.click('#nav-modules .nav-link:has-text("Contacts")');
  await page.click('#add-record-btn');
  await page.fill('#f-name', 'Ordinary Person');
  await page.click('#record-save');
  await expect(page.locator('.records-table tbody tr:has-text("Ordinary Person")')).toHaveCount(1);

  // Exactly what a tampered backup or a hand-crafted push carries.
  await page.evaluate(async () => {
    const all = await DB.getAll('records');
    const rec = all.find((r) => r.data && r.data.name === 'Ordinary Person');
    await DB.delete('records', rec.id, Date.now());
    await DB.put('records', {
      ...rec,
      id: '" onfocus="window.__pwnedById = true" autofocus x="',
      updatedAt: Date.now(),
    });
  });
  await page.reload();
  await page.click('#nav-modules .nav-link:has-text("Contacts")');
  await expect(page.locator('.records-table tbody tr:has-text("Ordinary Person")')).toHaveCount(1);

  // The id must arrive as ONE attribute value, not as markup that introduced
  // attributes of its own.
  const injected = await page.locator('.records-table tbody tr').evaluateAll(
    (rows) => rows.flatMap((r) => r.getAttributeNames()),
  );
  expect(injected).not.toContain('onfocus');
  expect(injected).not.toContain('autofocus');
  expect(await page.evaluate(() => window.__pwnedById)).toBeUndefined();
});

/*
 * Same class, different sink: a module id lands in an href, and a field key
 * lands in an input's id. Both come from the same places a record id does —
 * a restored backup, or a colleague's hand-written push.
 */
test('a hostile module id cannot inject attributes into the nav', async ({ page }) => {
  await onboard(page, { templates: ['Contacts'] });

  await page.evaluate(async () => {
    const mods = await DB.getAll('modules');
    const mod = mods.find((m) => m.name === 'Contacts');
    await DB.put('modules', {
      ...mod,
      id: '" onmouseover="window.__pwnedByModule = true" y="',
      updatedAt: Date.now(),
    });
  });
  await page.reload();
  await expect(page.locator('#nav-modules .nav-link').first()).toBeVisible();

  const navAttrs = await page.locator('#nav-modules .nav-link').evaluateAll(
    (els) => els.flatMap((e) => e.getAttributeNames()),
  );
  expect(navAttrs).not.toContain('onmouseover');
  expect(navAttrs).not.toContain('y');
  expect(await page.evaluate(() => window.__pwnedByModule)).toBeUndefined();
});

/*
 * A field key becomes an element id on the record form. Same origin as the
 * others: slug() cannot produce this, a restored backup can.
 */
test('a hostile field key cannot inject attributes into the record form', async ({ page }) => {
  await onboard(page, { templates: ['Contacts'] });

  await page.evaluate(async () => {
    const mods = await DB.getAll('modules');
    const mod = mods.find((m) => m.name === 'Contacts');
    await DB.put('modules', {
      ...mod,
      fields: [
        ...(mod.fields || []),
        { key: '" onclick="window.__pwnedByField = true" z="', label: 'Odd', type: 'text' },
      ],
      updatedAt: Date.now(),
    });
  });
  await page.reload();
  await page.click('#nav-modules .nav-link:has-text("Contacts")');
  await page.click('#add-record-btn');
  await expect(page.locator('#modal-root .modal')).toBeVisible();

  const formAttrs = await page.locator('#modal-root input, #modal-root textarea, #modal-root select')
    .evaluateAll((els) => els.flatMap((e) => e.getAttributeNames()));
  expect(formAttrs).not.toContain('onclick');
  expect(formAttrs).not.toContain('z');
  expect(await page.evaluate(() => window.__pwnedByField)).toBeUndefined();
});

/*
 * A record stamped in the past never reaches the server, and the app says
 * "Synced" anyway.
 *
 * localChanges() selects rows with `rowClock(r) >= since`, where `since` is the
 * push watermark — and the watermark only ever moves FORWARD. So any row
 * written with an updatedAt older than the last successful push is invisible to
 * every push that follows, permanently. The sync request still succeeds, so the
 * chip reads Synced and nothing looks wrong.
 *
 * Demo data hits this by design: it backdates records (`now - i * 60000`) so
 * "recent activity" has a believable order. Load it after any earlier sync and
 * the rows are already below the watermark.
 */
test('records stamped before the last push still reach the server', async ({ page }) => {
  await onboard(page, { templates: ['Contacts'] });
  await signIn(page, uniqueEmail('backdated'));

  // An ordinary edit first: this is what pushes the watermark up to "now".
  await page.click('#nav-modules .nav-link:has-text("Contacts")');
  await page.click('#add-record-btn');
  await page.fill('#f-name', 'Pushes The Watermark');
  await page.click('#record-save');
  await expect(page.locator('.records-table tbody tr:has-text("Pushes The Watermark")')).toHaveCount(1);
  await expect(page.locator('.sync-status')).toHaveAttribute('data-status', 'synced', { timeout: 15000 });

  // Now a record stamped in the past — exactly what loadDemoData writes.
  const backdatedId = await page.evaluate(async () => {
    const mods = await DB.getAll('modules');
    const mod = mods.find((m) => m.name === 'Contacts');
    const id = `backdated-${Date.now()}`;
    await DB.put('records', {
      id,
      moduleId: mod.id,
      data: { name: 'Stamped In The Past' },
      createdAt: Date.now() - 40 * 60000,
      updatedAt: Date.now() - 40 * 60000,
    });
    await Cloud.sync();
    return id;
  });

  await expect(page.locator('.sync-status')).toHaveAttribute('data-status', 'synced', { timeout: 15000 });

  // The app says Synced. Does the server actually have it?
  const delta = await (await page.request.get('/api/sync?since=0')).json();
  const onServer = (delta.records || []).some((r) => r.id === backdatedId && !r.deleted);
  expect(onServer, 'a backdated record must not be silently stranded on the device').toBe(true);
});
