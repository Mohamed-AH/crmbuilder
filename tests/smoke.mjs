#!/usr/bin/env node
/*
 * smoke.mjs — deployment health audit for any CRM Builder instance.
 *
 *   node tests/smoke.mjs                                   # localhost:8321
 *   BASE_URL=https://your-app.onrender.com node tests/smoke.mjs
 *
 * Answers "is the deployed thing actually working?" — reachability, asset
 * integrity, API contracts, and whether the environment is configured the way
 * a production deployment should be. Exits non-zero if anything FAILs, so it
 * doubles as a CI gate. WARNs are judgement calls, not failures.
 */
const BASE = (process.env.BASE_URL || 'http://localhost:8321').replace(/\/$/, '');
// A sleeping free-tier instance can take most of a minute to answer the first
// request; everything after that should be quick.
const FIRST_TIMEOUT = Number(process.env.SMOKE_FIRST_TIMEOUT || 90000);
const TIMEOUT = Number(process.env.SMOKE_TIMEOUT || 20000);

const results = [];
let firstRequestDone = false;

const c = process.stdout.isTTY
  ? { pass: '\x1b[32m', fail: '\x1b[31m', warn: '\x1b[33m', dim: '\x1b[2m', bold: '\x1b[1m', off: '\x1b[0m' }
  : { pass: '', fail: '', warn: '', dim: '', bold: '', off: '' };

function record(status, name, detail = '') {
  results.push({ status, name, detail });
  const mark = { PASS: `${c.pass}✓${c.off}`, FAIL: `${c.fail}✗${c.off}`, WARN: `${c.warn}!${c.off}`, INFO: `${c.dim}·${c.off}` }[status];
  console.log(`  ${mark} ${name}${detail ? `  ${c.dim}${detail}${c.off}` : ''}`);
}

async function get(path, opts = {}) {
  const timeout = firstRequestDone ? TIMEOUT : FIRST_TIMEOUT;
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeout),
      ...opts,
    });
    return { res, ms: Date.now() - started };
  } catch (err) {
    return { err, ms: Date.now() - started };
  } finally {
    firstRequestDone = true;
  }
}

async function check(name, fn) {
  try {
    const out = await fn();
    if (out === false) return record('FAIL', name);
    if (out && out.status) return record(out.status, name, out.detail);
    return record('PASS', name, typeof out === 'string' ? out : '');
  } catch (err) {
    return record('FAIL', name, err.message);
  }
}

console.log(`\n${c.bold}CRM Builder — deployment smoke test${c.off}`);
console.log(`${c.dim}target: ${BASE}${c.off}\n`);

// ---------------------------------------------------------------- reachability
console.log(`${c.bold}Reachability${c.off}`);

let health = null;
await check('server responds to /healthz', async () => {
  const { res, err, ms } = await get('/healthz');
  if (err) throw new Error(`${err.message} after ${ms}ms — server unreachable`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  health = await res.json();
  const slow = ms > 5000;
  return {
    status: slow ? 'WARN' : 'PASS',
    detail: slow
      ? `${ms}ms — cold start; warm the URL before a demo`
      : `${ms}ms`,
  };
});

await check('app shell loads', async () => {
  const { res, err } = await get('/');
  if (err) throw new Error(err.message);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  for (const marker of ['id="app"', 'js/app.js', 'manifest.webmanifest']) {
    if (!html.includes(marker)) throw new Error(`shell missing ${marker}`);
  }
  return `${(html.length / 1024).toFixed(1)}kb`;
});

await check('SPA deep link falls back to the shell', async () => {
  const { res, err } = await get('/some/deep/link');
  if (err) throw new Error(err.message);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  if (!html.includes('id="app"')) throw new Error('did not serve the shell');
  return true;
});

// ---------------------------------------------------------------- assets
console.log(`\n${c.bold}Assets${c.off}`);

const ASSETS = [
  ['/css/style.css', 'text/css'],
  ['/js/app.js', 'javascript'],
  ['/js/cloud.js', 'javascript'],
  ['/js/db.js', 'javascript'],
  ['/js/icons.js', 'javascript'],
  ['/js/boot-icons.js', 'javascript'],
  ['/js/templates.js', 'javascript'],
  ['/js/csv.js', 'javascript'],
  ['/js/date-rules.js', 'javascript'],
  ['/js/demo-data.js', 'javascript'],
  // scope.js and tour.js are in index.html and sw.js's APP_SHELL but were not
  // checked here. That gap costs more now the server serves an allow-list: a
  // file left off it 404s in production while still working locally from cache.
  ['/js/scope.js', 'javascript'],
  ['/js/tour.js', 'javascript'],
  ['/legal.css', 'text/css'],
  ['/sw.js', 'javascript'],
  ['/manifest.webmanifest', 'json'],
  ['/fonts/inter-var-latin.woff2', 'font'],
  ['/icons/icon-192.png', 'image/png'],
  ['/icons/icon-512.png', 'image/png'],
  ['/icons/icon-maskable-512.png', 'image/png'],
];

for (const [path, expectType] of ASSETS) {
  await check(`GET ${path}`, async () => {
    const { res, err } = await get(path);
    if (err) throw new Error(err.message);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get('content-type') || '';
    if (!type.includes(expectType)) {
      return { status: 'WARN', detail: `content-type ${type}` };
    }
    return '';
  });
}

// The server used to run express.static(__dirname), which served the whole
// repository. This asserts the allow-list that replaced it, and it is written
// against content rather than status: the failure being guarded is a file
// leaking, and a leak that arrives with a 200 is the one that matters.
const MUST_NOT_SERVE = [
  ['/CLAUDE.md', 'internal working notes'],
  ['/DEPLOYMENT.md', 'deployment runbook'],
  ['/docs/BETA.md', 'operator runbook'],
  ['/docs/archive/SCALING-OPTIONS.md', 'archived design notes'],
  ['/package.json', 'dependency list'],
  ['/.git/config', 'repository metadata'],
  ['/.env', 'environment file'],
  // Only present when a deployment has fallen back to the file store — which
  // is exactly when it would be every customer's records on a guessable path.
  ['/data/store.json', 'file-store database'],
  /*
   * The allow-list check run backwards.
   *
   * `lib/` is server-side code and is deliberately NOT `js/`, which is an
   * allow-listed asset directory (§28) — a file there is downloadable and
   * wants an index.html entry, an sw.js APP_SHELL entry and a CACHE_VERSION
   * bump. Every other assertion in this suite proves a file IS reachable;
   * this one proves a directory is not, which is what would catch somebody
   * adding 'lib' to ASSET_DIRS to make an import work.
   */
  ['/lib/safe-fetch.js', 'server-side source'],
];

for (const [path, what] of MUST_NOT_SERVE) {
  await check(`${path} is not served`, async () => {
    const { res, err } = await get(path);
    if (err) throw new Error(err.message);
    if (res.status === 404) return '404';
    const body = await res.text();
    // The catch-all answers unknown non-file paths with the shell. That is not
    // a leak, so it passes — but it must be the shell and nothing else.
    if (/id="app"/.test(body)) return { status: 'WARN', detail: 'served the app shell, not a 404' };
    throw new Error(`HTTP ${res.status} exposed ${what} (${body.length}b)`);
  });
}

/*
 * Security headers. Asserted on the app shell and on a legal page, because the
 * legal pages are served by a different branch of the allow-list (§28) and it
 * would be easy to harden one and not the other.
 */
for (const path of ['/', '/privacy']) {
  await check(`security headers on ${path}`, async () => {
    const { res, err } = await get(path);
    if (err) throw new Error(err.message);
    const missing = [];
    const csp = res.headers.get('content-security-policy') || '';
    if (!csp) missing.push('Content-Security-Policy');
    // The two that carry the weight: no inline script, and not framable.
    else {
      if (!/script-src[^;]*'self'/.test(csp) || /script-src[^;]*'unsafe-inline'/.test(csp)) {
        missing.push("CSP script-src 'self' without 'unsafe-inline'");
      }
      if (!/frame-ancestors[^;]*'none'/.test(csp)) missing.push('CSP frame-ancestors');
    }
    if ((res.headers.get('x-content-type-options') || '') !== 'nosniff') missing.push('X-Content-Type-Options');
    if (!(res.headers.get('x-frame-options') || '')) missing.push('X-Frame-Options');
    if (!(res.headers.get('referrer-policy') || '')) missing.push('Referrer-Policy');
    if (missing.length) throw new Error(`missing: ${missing.join(', ')}`);
    return 'CSP + nosniff + frame-options + referrer-policy';
  });
}

await check('HSTS in production', async () => {
  const { res, err } = await get('/');
  if (err) throw new Error(err.message);
  const hsts = res.headers.get('strict-transport-security');
  if (hsts) return hsts;
  // isLocal is declared further down; derive it here rather than reorder the file.
  return /localhost|127\.0\.0\.1/.test(BASE)
    ? { status: 'INFO', detail: 'not set — correct off HTTPS' }
    : { status: 'WARN', detail: 'not set; is NODE_ENV=production?' };
});

await check('an oversized body is refused, not absorbed', async () => {
  // Everything but /api/sync takes a small object. 8 MB used to be the limit
  // on every route, which handed an anonymous caller a cheap allocation.
  const { res, err } = await get('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'x'.repeat(200000) }),
  });
  if (err) throw new Error(err.message);
  // 401 is fine too — auth runs first. What must not happen is a 200.
  if (res.status === 413 || res.status === 401) return `HTTP ${res.status}`;
  throw new Error(`HTTP ${res.status} — a 200 KB body was not refused`);
});

await check('manifest is valid and installable', async () => {
  const { res, err } = await get('/manifest.webmanifest');
  if (err) throw new Error(err.message);
  const m = await res.json();
  if (!m.name || !m.start_url || !m.icons?.length) throw new Error('missing required manifest fields');
  if (m.display !== 'standalone') return { status: 'WARN', detail: `display=${m.display}` };
  const maskable = m.icons.some((i) => (i.purpose || '').includes('maskable'));
  if (!maskable) return { status: 'WARN', detail: 'no maskable icon' };
  return `${m.icons.length} icons`;
});

await check('service worker is served uncached', async () => {
  const { res, err } = await get('/sw.js');
  if (err) throw new Error(err.message);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const cc = res.headers.get('cache-control') || '';
  if (!cc.includes('no-cache')) {
    return { status: 'WARN', detail: `cache-control: ${cc || 'unset'} — updates may be slow to reach users` };
  }
  return cc;
});

// ---------------------------------------------------------------- api contract
console.log(`\n${c.bold}API contract${c.off}`);

let me = null;
await check('GET /api/me returns config', async () => {
  const { res, err } = await get('/api/me');
  if (err) throw new Error(err.message);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  me = await res.json();
  if (typeof me.authenticated !== 'boolean') throw new Error('missing "authenticated"');
  return `authenticated=${me.authenticated}`;
});

await check('GET /api/data requires auth', async () => {
  const { res, err } = await get('/api/data');
  if (err) throw new Error(err.message);
  if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
  return '401';
});

await check('GET /api/admin/stats requires auth', async () => {
  const { res, err } = await get('/api/admin/stats');
  if (err) throw new Error(err.message);
  if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
  return '401';
});

await check('unknown API route 404s as JSON', async () => {
  const { res, err } = await get('/api/definitely-not-a-route');
  if (err) throw new Error(err.message);
  if (res.status !== 404) throw new Error(`expected 404, got ${res.status}`);
  const body = await res.json();
  if (!body.error) throw new Error('expected a JSON error body');
  return '404';
});

await check('PUT /api/data rejects unauthenticated writes', async () => {
  const { res, err } = await get('/api/data', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modules: [], records: [] }),
  });
  if (err) throw new Error(err.message);
  if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
  return '401';
});

// ---------------------------------------------------------------- configuration
console.log(`\n${c.bold}Configuration${c.off}`);

const isLocal = /localhost|127\.0\.0\.1/.test(BASE);

await check('storage backend', async () => {
  const storage = health?.storage || me?.storage;
  if (!storage) throw new Error('could not determine storage backend');
  if (storage === 'mongodb') return 'mongodb — durable';
  if (isLocal) return { status: 'INFO', detail: 'file — fine for local dev' };
  return {
    status: 'WARN',
    detail: 'file — data is LOST on every redeploy/restart. Set MONGODB_URI.',
  };
});

await check('sync model', async () => {
  const { res, err } = await get('/health');
  if (err) throw new Error(`${err.message} — /health unreachable`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  // A deployment predating /health has no route for it, so the SPA catch-all
  // answers with index.html. That is an out-of-date deployment, which is worth
  // saying out loud — but it is not a broken one, and failing the whole audit
  // over it points the reader at the wrong problem.
  const body = await res.text();
  let h;
  try {
    h = JSON.parse(body);
  } catch {
    return {
      status: 'WARN',
      detail: 'no /health endpoint — this deployment predates it; redeploy to pick it up',
    };
  }

  // Counts on a public /health are a customer count — fine on a single-tenant
  // deployment where they are the operator's own, not fine on a pooled one.
  if (h.counts && h.deployment !== 'dedicated') {
    return {
      status: 'WARN',
      detail: `tenant counts are public on a ${h.deployment} deployment — unset HEALTH_DETAIL`,
    };
  }
  if (h.sync !== 'per-record') {
    return { status: 'WARN', detail: `${h.sync || 'unknown'} — this deployment predates per-record sync` };
  }
  return `per-record · ${h.deployment}${h.tenant ? ` · ${h.tenant}` : ''} · up ${h.uptimeSec}s`;
});

await check('privacy and terms are reachable', async () => {
  // Google will not publish an OAuth consent screen without a privacy policy
  // URL, so this failing means signups cannot be opened at all.
  const missing = [];
  for (const path of ['/privacy', '/terms']) {
    const { res, err } = await get(path);
    if (err || !res.ok) { missing.push(`${path} (${err ? err.message : res.status})`); continue; }
    const body = await res.text();
    // The service worker used to answer every navigation with the app shell,
    // which would make these look present and be the CRM.
    if (/id="app"/.test(body)) missing.push(`${path} (served the app shell)`);
  }
  if (missing.length) throw new Error(missing.join(', '));
  return 'both present';
});

await check('sign-in method', async () => {
  if (me?.googleEnabled) return 'Google OAuth enabled';
  if (isLocal) return { status: 'INFO', detail: 'no OAuth (local dev)' };
  return {
    status: 'WARN',
    detail: 'Google OAuth NOT configured — accounts, sync and admin are unreachable. Set GOOGLE_CLIENT_ID/SECRET + APP_URL.',
  };
});

await check('dev login is off in production', async () => {
  if (!me?.devLoginEnabled) return 'disabled';
  if (isLocal) return { status: 'INFO', detail: 'enabled (local dev)' };
  return {
    status: 'WARN',
    detail: 'passwordless dev login is ENABLED on a public URL — anyone can sign in as anyone. Unset ALLOW_DEV_LOGIN.',
  };
});

if (!isLocal) {
  await check('HTTPS', async () => (BASE.startsWith('https://') ? 'yes' : { status: 'WARN', detail: 'not HTTPS — session cookies will not be marked secure' }));
}

// ---------------------------------------------------------------- summary
const counts = results.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] || 0) + 1 }), {});
const failed = counts.FAIL || 0;
const warned = counts.WARN || 0;

console.log(`\n${c.bold}Summary${c.off}`);
console.log(`  ${counts.PASS || 0} passed · ${warned} warnings · ${failed} failed`);

// Everything failing identically usually means the request never reached the
// deployment — a corporate proxy, VPN or egress policy in the way. Saying
// "deployment unhealthy" in that case sends people debugging the wrong system.
if (failed >= results.length - 1 && !(counts.PASS > 1)) {
  const statuses = new Set(results.filter((r) => r.status === 'FAIL').map((r) => (r.detail.match(/HTTP (\d+)/) || [])[1]).filter(Boolean));
  const blocked = statuses.size === 1 && ['403', '407', '502', '407'].includes([...statuses][0]);
  console.log(`\n${c.warn}Every check failed${blocked ? ` with the same status (HTTP ${[...statuses][0]})` : ''}.${c.off}`);
  console.log('  That pattern usually means the requests never reached the server —');
  console.log('  a proxy, VPN or network policy between you and it — rather than a');
  console.log('  broken deployment. Confirm by opening the URL in a browser first.');
}

if (warned) {
  console.log(`\n${c.warn}Warnings worth acting on:${c.off}`);
  results.filter((r) => r.status === 'WARN').forEach((r) => console.log(`  ! ${r.name} — ${r.detail}`));
}
if (failed) {
  console.log(`\n${c.fail}Failures:${c.off}`);
  results.filter((r) => r.status === 'FAIL').forEach((r) => console.log(`  ✗ ${r.name} — ${r.detail}`));
  console.log(`\n${c.fail}Deployment is NOT healthy.${c.off}\n`);
  process.exit(1);
}
console.log(`\n${c.pass}Deployment is healthy.${c.off}\n`);
