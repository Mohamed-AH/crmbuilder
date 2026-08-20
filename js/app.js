/*
 * app.js — routing, views, and interactions for CRM Builder.
 * Depends on DB (db.js), TEMPLATES (templates.js), icon() (icons.js), Cloud (cloud.js).
 */
/* global DB, TEMPLATES, icon, LUCIDE, Cloud */
(() => {
  'use strict';

  // ---------------------------------------------------------------- state
  let modules = [];
  const viewState = new Map(); // moduleId -> { q: '', view: 'table'|'kanban' }
  let deferredInstall = null;

  const SETTINGS_KEY = 'crmb:settings';
  let SETTINGS = { currency: 'USD', businessName: '' };
  try { SETTINGS = { ...SETTINGS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) }; } catch { /* fresh */ }

  const CURRENCIES = ['USD', 'EUR', 'GBP', 'SAR', 'AED', 'EGP', 'INR', 'PKR', 'JPY', 'CNY', 'CAD', 'AUD', 'CHF', 'SEK', 'NOK', 'DKK', 'BRL', 'MXN', 'ZAR', 'NGN', 'KES', 'TRY', 'MYR', 'SGD', 'PHP', 'IDR', 'THB', 'VND', 'KRW', 'BDT'];

  const FIELD_TYPES = [
    ['text', 'Text'],
    ['textarea', 'Long text'],
    ['number', 'Number'],
    ['currency', 'Currency'],
    ['date', 'Date'],
    ['select', 'Dropdown'],
    ['checkbox', 'Checkbox'],
    ['email', 'Email'],
    ['phone', 'Phone'],
    ['url', 'Link'],
    ['relation', 'Link to module'],
  ];

  const ROLE_LABELS = { platformAdmin: 'platform admin', owner: 'owner', member: 'member' };

  const MODULE_COLORS = ['#1570ef', '#0e9384', '#099250', '#dc6803', '#c11574', '#6938ef', '#d92d20', '#475467'];
  const MODULE_ICONS = ['package', 'users', 'building-2', 'handshake', 'square-check-big', 'target', 'sticky-note', 'calendar', 'receipt', 'briefcase', 'wrench', 'truck', 'star', 'tag', 'clipboard-list', 'folder', 'map-pin', 'globe', 'phone', 'mail', 'heart', 'database'];

  // ---------------------------------------------------------------- utils
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Module icons are lucide names; older exports may contain emoji — render either.
  function modIcon(mod, size = 16) {
    return LUCIDE[mod.icon] ? icon(mod.icon, size) : `<span class="emoji-icon">${esc(mod.icon)}</span>`;
  }

  // Module names are plural ("Deals", "Companies") but buttons read better in
  // the singular ("New deal"). Enough English to cover realistic module names.
  function singular(name) {
    const s = String(name).trim();
    if (/(ss|us|is)$/i.test(s)) return s;                        // Status, Analysis, Address
    if (/[^aeiou]ies$/i.test(s)) return `${s.slice(0, -3)}y`;    // Companies → Company
    if (/(s|x|z|ch|sh)es$/i.test(s)) return s.slice(0, -2);      // Boxes → Box
    if (/s$/i.test(s)) return s.slice(0, -1);                    // Deals → Deal
    return s;                                                    // Equipment → Equipment
  }

  function slug(label, taken = new Set()) {
    let base = label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field';
    let key = base;
    let i = 2;
    while (taken.has(key)) key = `${base}_${i++}`;
    return key;
  }

  function toast(msg) {
    const node = document.createElement('div');
    node.className = 'toast';
    node.textContent = msg;
    $('#toast-root').appendChild(node);
    setTimeout(() => node.classList.add('show'), 10);
    setTimeout(() => {
      node.classList.remove('show');
      setTimeout(() => node.remove(), 300);
    }, 2600);
  }

  function getModule(id) {
    return modules.find((m) => m.id === id);
  }

  function state(moduleId) {
    if (!viewState.has(moduleId)) {
      const mod = getModule(moduleId);
      viewState.set(moduleId, {
        q: '',
        view: mod && mod.defaultView === 'kanban' && kanbanField(mod) ? 'kanban' : 'table',
        sort: null, // { key, dir: 'asc'|'desc' }; null = most recently edited
      });
    }
    return viewState.get(moduleId);
  }

  // Sort values by what the field means, not by how it renders: currency and
  // numbers numerically, dates chronologically, blanks always last.
  function compareBy(field, dir) {
    const sign = dir === 'desc' ? -1 : 1;
    return (a, b) => {
      const av = a.data[field.key];
      const bv = b.data[field.key];
      const aEmpty = av === undefined || av === null || av === '';
      const bEmpty = bv === undefined || bv === null || bv === '';
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;

      switch (field.type) {
        case 'number':
        case 'currency':
          return sign * (Number(av) - Number(bv));
        case 'checkbox':
          return sign * ((av ? 1 : 0) - (bv ? 1 : 0));
        case 'date':
          return sign * (String(av) < String(bv) ? -1 : String(av) > String(bv) ? 1 : 0);
        case 'select': {
          // Dropdowns sort in the order the options were defined (pipeline
          // order), which is far more useful than alphabetical.
          const opts = field.options || [];
          const ai = opts.indexOf(av);
          const bi = opts.indexOf(bv);
          if (ai !== -1 || bi !== -1) return sign * ((ai === -1 ? 1e6 : ai) - (bi === -1 ? 1e6 : bi));
          return sign * String(av).localeCompare(String(bv));
        }
        case 'relation':
          return sign * String(relationNameCache.get(av) || '').localeCompare(String(relationNameCache.get(bv) || ''), undefined, { sensitivity: 'base' });
        default:
          return sign * String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
      }
    };
  }

  // Single source of truth for "what rows does this module view show right now".
  async function visibleRecords(mod) {
    const st = state(mod.id);
    let records = await DB.recordsByModule(mod.id);
    await primeRelationCache(mod, records);
    const q = st.q.trim().toLowerCase();
    if (q) {
      records = records.filter((r) => Object.values(r.data).some((v) => String(v ?? '').toLowerCase().includes(q)));
    }
    const sortField = st.sort && mod.fields.find((f) => f.key === st.sort.key);
    if (sortField) records.sort(compareBy(sortField, st.sort.dir));
    else records.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return records;
  }

  function kanbanField(mod) {
    return mod.fields.find((f) => f.type === 'select' && (f.options || []).length > 0);
  }

  function listFields(mod) {
    const shown = mod.fields.filter((f) => f.showInList);
    return (shown.length ? shown : mod.fields).slice(0, 6);
  }

  function titleField(mod) {
    return mod.fields.find((f) => ['text', 'email', 'phone', 'url'].includes(f.type)) || mod.fields[0];
  }

  function recordName(mod, record) {
    const f = titleField(mod);
    const v = f ? record.data[f.key] : '';
    return v ? String(v) : '(untitled)';
  }

  function fmtCurrency(v) {
    const n = Number(v);
    if (Number.isNaN(n)) return String(v);
    try {
      return n.toLocaleString(undefined, { style: 'currency', currency: SETTINGS.currency || 'USD', maximumFractionDigits: 0 });
    } catch {
      return `${SETTINGS.currency || 'USD'} ${n.toLocaleString()}`;
    }
  }

  function fmtDate(v) {
    if (!v) return '';
    const d = new Date(`${v}T00:00:00`);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const relationNameCache = new Map(); // recordId -> display name

  // Only ever emit hrefs we control the scheme of — record values arrive from
  // CSV imports and shared backups, and `javascript:` in an href is executable.
  const SAFE_SCHEME = /^(https?:|mailto:|tel:)/i;
  function safeHref(value, prefix = '') {
    const raw = `${prefix}${String(value).trim()}`;
    if (SAFE_SCHEME.test(raw)) return esc(raw);
    if (!prefix && /^[^\s:]+\.[^\s]/.test(raw)) return esc(`https://${raw}`); // bare domain
    return '';
  }

  function linkHTML(href, text) {
    if (!href) return esc(text);
    return `<a href="${href}" ${href.startsWith('http') ? 'target="_blank" rel="noopener"' : ''} onclick="event.stopPropagation()">${esc(text)}</a>`;
  }

  function fmtValue(field, value) {
    if (value === undefined || value === null || value === '') return '<span class="muted">—</span>';
    switch (field.type) {
      case 'currency': return `<span class="num">${esc(fmtCurrency(value))}</span>`;
      case 'number': return `<span class="num">${esc(Number(value).toLocaleString())}</span>`;
      case 'date': return esc(fmtDate(value));
      case 'checkbox': return value ? `<span class="check-yes">${icon('check', 15)}</span>` : '<span class="muted">—</span>';
      case 'url': return linkHTML(safeHref(value), String(value).replace(/^https?:\/\//, ''));
      case 'email': return linkHTML(safeHref(value, 'mailto:'), value);
      case 'phone': return linkHTML(safeHref(value, 'tel:'), value);
      case 'select': return `<span class="pill">${esc(value)}</span>`;
      case 'relation': return esc(relationNameCache.get(value) || '(linked record)');
      case 'textarea': {
        const s = String(value);
        return esc(s.length > 70 ? `${s.slice(0, 70)}…` : s);
      }
      default: return esc(value);
    }
  }

  async function primeRelationCache(mod, records) {
    const relFields = mod.fields.filter((f) => f.type === 'relation' && f.relatedModule);
    for (const f of relFields) {
      const relMod = getModule(f.relatedModule);
      if (!relMod) continue;
      const needed = records.some((r) => r.data[f.key] && !relationNameCache.has(r.data[f.key]));
      if (!needed) continue;
      const relRecords = await DB.recordsByModule(relMod.id);
      relRecords.forEach((r) => relationNameCache.set(r.id, recordName(relMod, r)));
    }
  }

  // -------------------------------------------------------- persistence
  // Every mutation funnels through persist(): keeps a localStorage snapshot
  // as a second local copy and schedules a cloud push when signed in.
  async function fullState() {
    return {
      modules: await DB.getAll('modules'),
      records: await DB.getAll('records'),
      settings: SETTINGS,
    };
  }

  async function persist() {
    localStorage.setItem('crmb:lastEdit', String(Date.now()));
    try {
      const state = await fullState();
      localStorage.setItem('crmb:snapshot', JSON.stringify({ ...state, at: Date.now() }));
    } catch { /* quota — IndexedDB is still the primary local store */ }
    Cloud.schedulePush();
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(SETTINGS));
    persist();
  }

  async function importState({ modules: mods, records, settings }) {
    await DB.clear('records');
    await DB.clear('modules');
    for (const m of mods || []) await DB.put('modules', m);
    for (const r of records || []) await DB.put('records', r);
    if (settings && typeof settings === 'object') {
      SETTINGS = { ...SETTINGS, ...settings };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(SETTINGS));
    }
    await loadModules();
    relationNameCache.clear();
  }

  // Reconcile local vs cloud on startup (last-write-wins on the snapshot).
  // Returns true when local data was replaced, so the caller knows to repaint.
  async function reconcileWithCloud() {
    let remote;
    try { remote = await Cloud.pull(); } catch { return false; }
    const localHas = modules.length > 0;
    const lastSync = Number(localStorage.getItem('crmb:lastSync')) || 0;
    const lastEdit = Number(localStorage.getItem('crmb:lastEdit')) || 0;
    const dirty = !!localStorage.getItem('crmb:dirty');

    const adopt = async (msg) => {
      await importState(remote);
      localStorage.setItem('crmb:lastSync', String(Date.now()));
      localStorage.removeItem('crmb:dirty');
      if (msg) toast(msg);
      return true;
    };

    if (!remote || remote.modules === null) {
      if (localHas) await Cloud.pushNow();
      return false;
    }
    if (!localHas) {
      return adopt(remote.modules.length ? 'Workspace restored from your account' : '');
    }
    if (remote.updatedAt > lastSync) {
      if (!dirty || remote.updatedAt > lastEdit) {
        return adopt('Synced latest data from your account');
      }
      await Cloud.pushNow(); // local edits are newer
      return false;
    }
    if (dirty) await Cloud.pushNow();
    return false;
  }

  // ---------------------------------------------------------------- modal
  function openModal(html, { wide = false } = {}) {
    const root = $('#modal-root');
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">${html}</div>
      </div>`;
    const backdrop = $('.modal-backdrop', root);
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) closeModal();
    });
    document.body.classList.add('modal-open');
    const first = $('.modal input, .modal select, .modal textarea, .modal button', root);
    if (first) first.focus();
    return $('.modal', root);
  }

  function closeModal() {
    $('#modal-root').innerHTML = '';
    document.body.classList.remove('modal-open');
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#modal-root').firstChild) closeModal();
  });

  // ---------------------------------------------------------------- sidebar
  function syncStatusHTML() {
    // Boot paints before /api/me answers (a sleeping free-tier host can take
    // most of a minute), so "we don't know yet" is a real state to show.
    if (!Cloud.ready && !Cloud.isAuthed) {
      return `<span class="sync-status boot-chip" data-status="connecting"><span class="sync-dot"></span>Connecting…</span>`;
    }
    if (!Cloud.me.serverAvailable) return '';
    if (!Cloud.isAuthed) {
      return `<button class="btn btn-outline btn-block" id="signin-btn">${icon('log-in', 15)} Sign in to sync</button>`;
    }
    const labels = { synced: 'Synced', syncing: 'Syncing…', connecting: 'Connecting…', error: 'Sync error — retrying', offline: 'Offline — will sync', local: 'Local' };
    const u = Cloud.user;
    return `
      <div class="user-chip">
        ${u.picture ? `<img class="avatar" src="${esc(u.picture)}" alt="" referrerpolicy="no-referrer">` : `<span class="avatar avatar-fallback">${esc((u.name || u.email)[0].toUpperCase())}</span>`}
        <span class="user-chip-text">
          <span class="user-chip-name">${esc(u.name || u.email)}</span>
          <span class="sync-status" data-status="${Cloud.status}"><span class="sync-dot"></span>${labels[Cloud.status] || 'Synced'}</span>
        </span>
      </div>`;
  }

  function renderSidebar() {
    const nav = $('#nav-modules');
    const current = location.hash;
    nav.innerHTML = modules.map((m) => `
      <a href="#/m/${m.id}" class="nav-link ${current === `#/m/${m.id}` ? 'active' : ''}">
        <span class="nav-icon" style="color:${esc(m.color)};background:${esc(m.color)}1a">${modIcon(m)}</span>
        <span class="nav-label">${esc(m.name)}</span>
      </a>`).join('') || '<p class="nav-empty">No modules yet</p>';

    // Show Admin to whoever it is actually useful to: the platform operator,
    // and org owners whose org has someone else in it. A solo signup owns an
    // org of one, and a dashboard listing only themselves is just noise.
    const adminLink = $('#nav-admin');
    const user = Cloud.user;
    const org = Cloud.me.org;
    const showAdmin = !!user && (
      user.role === 'platformAdmin'
      || (user.role === 'owner' && org && org.memberCount > 1)
    );
    adminLink.classList.toggle('hidden', !showAdmin);

    $$('#nav-main .nav-link, .sidebar-footer .nav-link').forEach((a) => {
      a.classList.toggle('active', a.getAttribute('href') === (current || '#/'));
    });

    $('#user-area').innerHTML = syncStatusHTML();
    const signinBtn = $('#signin-btn');
    if (signinBtn) signinBtn.addEventListener('click', openSignIn);

    $('#workspace-name').textContent = SETTINGS.businessName || 'CRM Builder';
    $('#workspace-name-mini').textContent = SETTINGS.businessName || 'CRM Builder';
  }

  Cloud.onStatus(() => {
    const area = $('#user-area');
    if (area) {
      area.innerHTML = syncStatusHTML();
      const signinBtn = $('#signin-btn');
      if (signinBtn) signinBtn.addEventListener('click', openSignIn);
    }
  });

  function closeSidebar() {
    document.body.classList.remove('sidebar-open');
  }

  // ---------------------------------------------------------------- sign in
  function openSignIn() {
    const { googleEnabled, devLoginEnabled } = Cloud.me;
    const modal = openModal(`
      <div class="modal-head">
        <h2>Sign in</h2>
        <button class="icon-btn" data-close aria-label="Close">${icon('x', 16)}</button>
      </div>
      <div class="modal-body">
        <p class="settings-hint">Sign in to save your CRM to your account and access it from any device. Your data also always stays available on this device.</p>
        ${googleEnabled ? `
          <a class="btn btn-google btn-block" href="/auth/google">
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.6 39.6 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C41 35.4 44 30.2 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>
            Continue with Google
          </a>` : ''}
        ${googleEnabled && devLoginEnabled ? '<div class="or-line"><span>or</span></div>' : ''}
        ${devLoginEnabled ? `
          <form id="dev-login-form">
            <div class="form-row">
              <label for="dev-email">Email (dev sign-in)</label>
              <input class="input" type="email" id="dev-email" placeholder="you@business.com" required>
            </div>
            <button class="btn btn-primary btn-block" type="submit">${icon('log-in', 15)} Sign in</button>
          </form>` : ''}
        ${!googleEnabled && !devLoginEnabled ? '<p class="empty-hint">Sign-in is not configured on this server. See DEPLOYMENT.md to enable Google OAuth.</p>' : ''}
      </div>
      <div class="modal-foot"><span class="settings-hint" style="margin:0">We only use your email to identify your workspace.</span></div>`);
    $$('[data-close]', modal).forEach((b) => b.addEventListener('click', closeModal));
    const form = $('#dev-login-form', modal);
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await Cloud.devLogin($('#dev-email', modal).value.trim());
          location.reload(); // boot re-runs and reconciles local vs cloud data
        } catch (err) {
          toast(err.message);
        }
      });
    }
  }

  // ---------------------------------------------------------------- dashboard
  async function renderDashboard() {
    const main = $('#main');
    if (modules.length === 0) {
      renderOnboarding(main);
      return;
    }
    const counts = await Promise.all(modules.map(async (m) => ({ mod: m, records: await DB.recordsByModule(m.id) })));
    const recent = counts
      .flatMap(({ mod, records }) => records.map((r) => ({ mod, r })))
      .sort((a, b) => (b.r.updatedAt || 0) - (a.r.updatedAt || 0))
      .slice(0, 10);

    // Pipeline value across currency fields (e.g. open deal value)
    const totalValue = counts.reduce((acc, { mod, records }) => {
      const cf = mod.fields.find((f) => f.type === 'currency');
      if (!cf) return acc;
      return acc + records.reduce((a, r) => a + (Number(r.data[cf.key]) || 0), 0);
    }, 0);

    main.innerHTML = `
      <div class="page">
        <div class="page-head">
          <h1>Dashboard</h1>
          <p class="subtitle">${esc(SETTINGS.businessName ? `${SETTINGS.businessName} at a glance.` : 'Your CRM at a glance.')}</p>
        </div>
        <div class="stat-grid">
          ${counts.map(({ mod, records }) => `
            <a class="stat-card" href="#/m/${mod.id}" style="--accent:${esc(mod.color)}">
              <span class="stat-icon" style="color:${esc(mod.color)};background:${esc(mod.color)}1a">${modIcon(mod, 18)}</span>
              <span class="stat-count">${records.length}</span>
              <span class="stat-label">${esc(mod.name)}</span>
            </a>`).join('')}
          <button class="stat-card stat-card-add" id="dash-add-module">
            <span class="stat-icon">${icon('plus', 18)}</span>
            <span class="stat-label">Add module</span>
          </button>
        </div>
        <div class="dash-grid">
          <div class="card">
            <div class="card-head"><h2>Recent activity</h2></div>
            ${recent.length ? `
              <ul class="recent-list">
                ${recent.map(({ mod, r }) => `
                  <li>
                    <a href="#/m/${mod.id}" class="recent-item">
                      <span class="nav-icon" style="color:${esc(mod.color)};background:${esc(mod.color)}1a">${modIcon(mod)}</span>
                      <span class="recent-name">${esc(recordName(mod, r))}</span>
                      <span class="recent-meta">${esc(mod.name)} · ${new Date(r.updatedAt).toLocaleDateString()}</span>
                    </a>
                  </li>`).join('')}
              </ul>` : '<p class="empty-hint">No records yet. Open a module and add your first record.</p>'}
          </div>
          <div class="dash-side">
            ${totalValue ? `
              <div class="card stat-tile">
                <span class="stat-tile-label">Total tracked value</span>
                <span class="stat-tile-value">${esc(fmtCurrency(totalValue))}</span>
                <span class="stat-tile-sub">Sum of all currency fields across modules</span>
              </div>` : ''}
            <div class="card">
              <div class="card-head"><h2>Quick add</h2></div>
              <div class="quick-add">
                ${modules.slice(0, 6).map((m) => `
                  <button class="btn btn-outline" data-quick-add="${m.id}">${icon('plus', 14)} ${esc(singular(m.name))}</button>`).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>`;
    $('#dash-add-module').addEventListener('click', () => openBuilder(null));
    $$('[data-quick-add]').forEach((b) => b.addEventListener('click', () => {
      const mod = getModule(b.dataset.quickAdd);
      if (mod) openRecord(mod, null);
    }));
  }

  function renderOnboarding(main) {
    main.innerHTML = `
      <div class="page onboarding">
        <div class="onboard-hero">
          <span class="brand-logo big" aria-hidden="true"></span>
          <h1>Build your CRM</h1>
          <p class="subtitle">Pick the modules your business needs — add custom modules and fields anytime. Works offline, and syncs to your account when you sign in.</p>
        </div>
        <div class="card onboard-biz">
          <div class="onboard-biz-grid">
            <div class="form-row">
              <label for="onboard-name">Business name</label>
              <input class="input" id="onboard-name" type="text" placeholder="e.g. Bright Bakery" value="${esc(SETTINGS.businessName)}">
            </div>
            <div class="form-row">
              <label for="onboard-currency">Currency</label>
              <select class="input" id="onboard-currency">
                ${CURRENCIES.map((c) => `<option value="${c}" ${c === SETTINGS.currency ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>
        <div class="template-grid">
          ${TEMPLATES.map((t, i) => `
            <label class="template-card" style="--accent:${esc(t.color)}">
              <input type="checkbox" data-template="${i}" ${['contacts', 'deals', 'tasks'].includes(t.key) ? 'checked' : ''}>
              <span class="template-icon" style="color:${esc(t.color)};background:${esc(t.color)}1a">${LUCIDE[t.icon] ? icon(t.icon, 20) : esc(t.icon)}</span>
              <span class="template-name">${esc(t.name)}</span>
              <span class="template-desc">${esc(t.description)}</span>
            </label>`).join('')}
        </div>
        <div class="onboard-actions">
          <label class="checkbox-line"><input type="checkbox" id="onboard-samples" checked> Include a few sample records</label>
          <div class="onboard-buttons">
            <button class="btn btn-primary btn-lg" id="onboard-create">Create my CRM</button>
            <button class="btn" id="onboard-demo">${icon('database', 15)} Explore with demo data</button>
            <button class="btn" id="onboard-tour">${icon('map-pin', 15)} Take the tour</button>
          </div>
          <button class="btn btn-ghost" id="onboard-custom">Start with a custom module instead</button>
          ${Cloud.me.serverAvailable && !Cloud.isAuthed ? `<button class="btn btn-ghost" id="onboard-signin">${icon('log-in', 15)} Already have an account? Sign in</button>` : ''}
        </div>
      </div>`;
    $('#onboard-create').addEventListener('click', async () => {
      const picked = $$('input[data-template]:checked', main).map((cb) => TEMPLATES[Number(cb.dataset.template)]);
      if (!picked.length) {
        toast('Pick at least one module');
        return;
      }
      SETTINGS.businessName = $('#onboard-name').value.trim();
      SETTINGS.currency = $('#onboard-currency').value;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(SETTINGS));
      const withSamples = $('#onboard-samples').checked;
      for (const t of picked) await createFromTemplate(t, withSamples);
      await loadModules();
      await persist();
      renderSidebar();
      location.hash = `#/m/${modules[0].id}`;
      toast('Your CRM is ready');
    });
    $('#onboard-custom').addEventListener('click', () => openBuilder(null));
    $('#onboard-demo').addEventListener('click', () => loadDemoData({ replace: false }));
    $('#onboard-tour').addEventListener('click', startTour);
    const signin = $('#onboard-signin');
    if (signin) signin.addEventListener('click', openSignIn);
  }

  async function createFromTemplate(t, withSamples) {
    const mod = {
      id: uid(),
      name: t.name,
      icon: t.icon,
      color: t.color,
      defaultView: t.defaultView || 'table',
      fields: t.fields.map((f) => ({ ...f, options: f.options ? [...f.options] : undefined })),
      createdAt: Date.now(),
    };
    await DB.put('modules', mod);
    if (withSamples && t.samples) {
      for (const data of t.samples) {
        const now = Date.now();
        await DB.put('records', { id: uid(), moduleId: mod.id, data: { ...data }, createdAt: now, updatedAt: now });
      }
    }
    return mod;
  }

  // ---------------------------------------------------------------- demo data
  // Builds every template module and fills it with the fictional business in
  // demo-data.js, so a demo or evaluation starts on a CRM that looks used.
  async function loadDemoData({ replace }) {
    if (typeof DEMO_DATA === 'undefined') {
      // demo-data.js did not load — usually a stale service-worker cache or an
      // incomplete deploy. Say so; a silent no-op leaves callers guessing.
      toast('Sample data could not be loaded — try reloading the page');
      return false;
    }
    const demo = resolveDemoDates(DEMO_DATA);
    if (replace) {
      await DB.clear('records');
      await DB.clear('modules');
      relationNameCache.clear();
    }
    await loadModules();

    for (const template of TEMPLATES) {
      const rows = demo.records[template.key];
      if (!rows || !rows.length) continue;
      // Reuse a module of the same name if the user already has one.
      let mod = modules.find((m) => m.name.toLowerCase() === template.name.toLowerCase());
      if (!mod) mod = await createFromTemplate(template, false);
      const now = Date.now();
      let i = 0;
      for (const data of rows) {
        i += 1;
        // Stagger updatedAt so "recent activity" has a believable order.
        await DB.put('records', { id: uid(), moduleId: mod.id, data: { ...data }, createdAt: now - i * 60000, updatedAt: now - i * 60000 });
      }
    }

    SETTINGS.businessName = demo.businessName;
    SETTINGS.currency = demo.currency;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(SETTINGS));

    await loadModules();
    await persist();
    renderSidebar();
    toast('Demo data loaded');
    location.hash = '#/';
    route();
    return true;
  }

  // ---------------------------------------------------------------- guided tour
  // Six stops that show the product working rather than describing it. Each
  // waits for its own target, so a slow render never leaves a stranded pointer.
  const moduleIdByName = (name) => (modules.find((m) => m.name === name) || {}).id;
  const dealsId = () => moduleIdByName('Deals');
  const contactsId = () => moduleIdByName('Contacts');

  function tourSteps() {
    return [
      {
        title: 'This is a CRM you assemble',
        body: 'Every item in this sidebar is a module you chose — not a fixed part of the product. Add, rename or remove them whenever your business changes.',
        route: '#/',
        target: '#nav-modules',
        place: 'right',
      },
      {
        title: 'Your pipeline, your stages',
        body: 'Drag a card between columns to change its stage. The columns are the options of a dropdown field, so they read however your business actually works. Totals update live.',
        route: () => `#/m/${dealsId()}`,
        // Don't inherit whichever view the visitor last used — put the board up.
        before: async () => {
          const id = dealsId();
          if (!id) return;
          state(id).view = 'kanban';
          await renderModule(id);
        },
        target: '.kanban',
        place: 'below',
      },
      {
        title: 'Sort the way you think',
        body: 'Money sorts numerically, dates chronologically, and stages sort in pipeline order — Lead, Qualified, Proposal — never alphabetically. This table is sorted by value, highest first.',
        route: () => `#/m/${dealsId()}`,
        // Show it rather than describe it: switch to the table and sort it.
        before: async () => {
          const id = dealsId();
          const mod = getModule(id);
          if (!mod) return;
          const money = mod.fields.find((f) => f.type === 'currency');
          const st = state(id);
          st.view = 'table';
          if (money) st.sort = { key: money.key, dir: 'desc' };
          await renderModule(id);
        },
        target: '.records-table thead',
        place: 'below',
      },
      {
        title: 'Bring your spreadsheet',
        body: 'Import a CSV and map its columns to your fields. Anything it does not recognise can become a new field right there, without leaving the import.',
        route: () => `#/m/${contactsId()}`,
        target: '#import-csv-btn',
        place: 'below',
      },
      {
        title: 'Build a module in a minute',
        body: 'Name it, pick fields, done. A custom module gets the same table, board, search and export as the built-in ones — there is no second-class kind of data here.',
        route: '#/',
        target: '#add-module-btn',
        place: 'right',
      },
      {
        title: 'Works offline, exports anytime',
        body: 'Everything is stored on your device first, so it keeps working with no connection and syncs when you are back. Export the whole workspace whenever you like — there is no lock-in.',
        route: '#/settings',
        target: '#export-btn',
        place: 'above',
      },
    ];
  }

  function startTour() {
    Tour.configure({
      steps: tourSteps(),
      goto: async (route) => {
        const hash = typeof route === 'function' ? route() : route;
        // Returning false tells the tour to skip this step rather than narrate
        // it over whatever screen happens to be showing.
        if (!hash || hash.includes('undefined')) return false;
        if (location.hash === hash) return true;
        location.hash = hash;
        // route() is async; give the view a moment to mount before anchoring.
        await new Promise((r) => setTimeout(r, 240));
        return true;
      },
      // The tour points at a populated pipeline, so one has to exist. If it
      // cannot be created the tour does not start — a walkthrough narrated
      // over an empty app is worse than no walkthrough.
      ensureReady: async () => {
        if (modules.length) return { ok: true };
        if (typeof DEMO_DATA === 'undefined') {
          return { ok: false, reason: 'The sample data could not be loaded. Reload the page and try again.' };
        }
        await loadDemoData({ replace: false });
        await loadModules();
        if (!modules.length) {
          return { ok: false, reason: 'The sample workspace could not be created on this device.' };
        }
        return { ok: true };
      },
      onEnd: ({ skipped }) => {
        // Undo the sort the tour applied so the visitor starts from a clean view.
        const id = dealsId();
        if (id && viewState.has(id)) state(id).sort = null;
        if (!skipped) toast('That’s the tour — the workspace is yours to play with');
      },
    });
    Tour.start().then((result) => {
      if (result && result.ok === false) toast(result.reason);
    });
  }

  // ---------------------------------------------------------------- module view
  async function renderModule(id) {
    const mod = getModule(id);
    const main = $('#main');
    if (!mod) {
      main.innerHTML = '<div class="page"><p class="empty-hint">Module not found.</p></div>';
      return;
    }
    const st = state(id);
    const records = await visibleRecords(mod);
    const kf = kanbanField(mod);

    main.innerHTML = `
      <div class="page page-full">
        <div class="page-head module-head">
          <h1><span class="module-title-icon" style="color:${esc(mod.color)};background:${esc(mod.color)}1a">${modIcon(mod, 20)}</span> ${esc(mod.name)}
            <span class="count-badge">${records.length}</span></h1>
          <div class="module-actions">
            <div class="search-wrap">${icon('search', 15)}<input type="search" id="record-search" class="input search-input" placeholder="Search ${esc(mod.name.toLowerCase())}…" value="${esc(st.q)}"></div>
            ${kf ? `
              <div class="seg" role="group" aria-label="View">
                <button class="seg-btn ${st.view === 'table' ? 'on' : ''}" data-view="table" title="Table view">${icon('table-properties', 15)}</button>
                <button class="seg-btn ${st.view === 'kanban' ? 'on' : ''}" data-view="kanban" title="Board view">${icon('square-kanban', 15)}</button>
              </div>` : ''}
            <button class="icon-btn" id="export-csv-btn" title="Export to CSV">${icon('download', 15)}</button>
            <button class="icon-btn" id="import-csv-btn" title="Import from CSV">${icon('upload', 15)}</button>
            <input type="file" id="import-csv-file" accept=".csv,text/csv" class="hidden">
            <button class="icon-btn" id="edit-module-btn" title="Edit module">${icon('pencil', 15)}</button>
            <button class="btn btn-primary" id="add-record-btn">${icon('plus', 15)} Add</button>
          </div>
        </div>
        <div id="module-body">
          ${st.view === 'kanban' && kf ? kanbanHTML(mod, kf, records) : tableHTML(mod, records)}
        </div>
      </div>`;

    const search = $('#record-search');
    search.addEventListener('input', () => {
      st.q = search.value;
      renderModuleBodyOnly(mod);
    });
    $$('.seg-btn', main).forEach((b) => b.addEventListener('click', () => {
      st.view = b.dataset.view;
      renderModule(id);
    }));
    $('#add-record-btn').addEventListener('click', () => openRecord(mod, null));
    $('#edit-module-btn').addEventListener('click', () => openBuilder(mod));
    $('#export-csv-btn').addEventListener('click', () => exportModuleCSV(mod));
    $('#import-csv-btn').addEventListener('click', () => $('#import-csv-file').click());
    $('#import-csv-file').addEventListener('change', (e) => openCSVImport(mod, e));
    bindModuleBody(mod);
  }

  async function renderModuleBodyOnly(mod) {
    const st = state(mod.id);
    const records = await visibleRecords(mod);
    const kf = kanbanField(mod);
    const body = $('#module-body');
    if (!body) return;
    body.innerHTML = st.view === 'kanban' && kf ? kanbanHTML(mod, kf, records) : tableHTML(mod, records);
    const badge = $('.count-badge');
    if (badge) badge.textContent = records.length;
    bindModuleBody(mod);
  }

  function tableHTML(mod, records) {
    const cols = listFields(mod);
    const st = state(mod.id);
    if (!records.length) {
      const searching = st.q.trim().length > 0;
      return `<div class="card"><p class="empty-hint">${searching
        ? `No ${esc(mod.name.toLowerCase())} match “${esc(st.q)}”.`
        : `Nothing here yet. Hit <strong>Add</strong> to create your first ${esc(singular(mod.name).toLowerCase())}, or import a CSV.`}</p></div>`;
    }
    const sortIcon = (f) => {
      if (!st.sort || st.sort.key !== f.key) return `<span class="sort-hint">${icon('chevron-up', 13)}</span>`;
      return `<span class="sort-on ${st.sort.dir}">${icon('chevron-up', 13)}</span>`;
    };
    return `
      <div class="card table-wrap">
        <table class="records-table">
          <thead><tr>${cols.map((f) => `
            <th class="th-sortable ${['currency', 'number'].includes(f.type) ? 'th-num' : ''} ${st.sort && st.sort.key === f.key ? 'th-sorted' : ''}"
                data-sort-key="${esc(f.key)}"
                aria-sort="${st.sort && st.sort.key === f.key ? (st.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"
                tabindex="0" role="button"
                title="Sort by ${esc(f.label)}">${esc(f.label)}${sortIcon(f)}</th>`).join('')}</tr></thead>
          <tbody>
            ${records.map((r) => `
              <tr data-record="${r.id}" tabindex="0">
                ${cols.map((f) => `<td data-label="${esc(f.label)}" class="${['currency', 'number'].includes(f.type) ? 'td-num' : ''}">${fmtValue(f, r.data[f.key])}</td>`).join('')}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function kanbanHTML(mod, kf, records) {
    const columns = [...kf.options, null]; // null = no value
    const byCol = new Map(columns.map((c) => [c, []]));
    records.forEach((r) => {
      const v = r.data[kf.key];
      (byCol.get(kf.options.includes(v) ? v : null)).push(r);
    });
    const valueField = mod.fields.find((f) => f.type === 'currency');
    return `
      <div class="kanban">
        ${columns.map((col) => {
          const cards = byCol.get(col);
          if (col === null && !cards.length) return '';
          const sum = valueField ? cards.reduce((acc, r) => acc + (Number(r.data[valueField.key]) || 0), 0) : 0;
          return `
            <div class="kanban-col" data-col="${esc(col ?? '')}">
              <div class="kanban-col-head">
                <span>${esc(col ?? 'No ' + kf.label.toLowerCase())}</span>
                <span class="kanban-col-meta">${cards.length}${valueField && sum ? ' · ' + esc(fmtCurrency(sum)) : ''}</span>
              </div>
              <div class="kanban-cards">
                ${cards.map((r) => `
                  <div class="kanban-card" draggable="true" data-record="${r.id}">
                    <span class="kanban-card-title">${esc(recordName(mod, r))}</span>
                    ${valueField && r.data[valueField.key] ? `<span class="kanban-card-value">${esc(fmtCurrency(r.data[valueField.key]))}</span>` : ''}
                  </div>`).join('')}
              </div>
            </div>`;
        }).join('')}
      </div>`;
  }

  function bindModuleBody(mod) {
    // Header clicks cycle: ascending → descending → back to "recently edited".
    $$('#module-body [data-sort-key]').forEach((th) => {
      const apply = () => {
        const st = state(mod.id);
        const key = th.dataset.sortKey;
        if (!st.sort || st.sort.key !== key) st.sort = { key, dir: 'asc' };
        else if (st.sort.dir === 'asc') st.sort = { key, dir: 'desc' };
        else st.sort = null;
        renderModuleBodyOnly(mod);
      };
      th.addEventListener('click', apply);
      th.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apply(); }
      });
    });

    $$('#module-body [data-record]').forEach((node) => {
      node.addEventListener('click', async () => {
        const record = await DB.get('records', node.dataset.record);
        if (record) openRecord(mod, record);
      });
      node.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') node.click();
      });
    });
    const kf = kanbanField(mod);
    $$('#module-body .kanban-card').forEach((card) => {
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', card.dataset.record);
        e.dataTransfer.effectAllowed = 'move';
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
    });
    $$('#module-body .kanban-col').forEach((col) => {
      col.addEventListener('dragover', (e) => {
        e.preventDefault();
        col.classList.add('drop-target');
      });
      col.addEventListener('dragleave', () => col.classList.remove('drop-target'));
      col.addEventListener('drop', async (e) => {
        e.preventDefault();
        col.classList.remove('drop-target');
        const recordId = e.dataTransfer.getData('text/plain');
        const record = await DB.get('records', recordId);
        if (!record || !kf) return;
        const newVal = col.dataset.col || '';
        if (record.data[kf.key] === newVal) return;
        record.data[kf.key] = newVal;
        record.updatedAt = Date.now();
        await DB.put('records', record);
        await persist();
        renderModuleBodyOnly(mod);
      });
    });
  }

  // ---------------------------------------------------------------- csv
  function downloadFile(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Exports exactly what the user is looking at — current search and sort
  // included — because that is what "export" means everywhere else.
  async function exportModuleCSV(mod) {
    const records = await visibleRecords(mod);
    if (!records.length) {
      toast('Nothing to export');
      return;
    }
    const fields = mod.fields;
    const rows = [fields.map((f) => f.label)];
    records.forEach((r) => {
      rows.push(fields.map((f) => {
        const v = r.data[f.key];
        if (v === undefined || v === null) return '';
        if (f.type === 'checkbox') return v ? 'yes' : 'no';
        if (f.type === 'relation') return relationNameCache.get(v) || '';
        return v;
      }));
    });
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`${mod.name.toLowerCase().replace(/\s+/g, '-')}-${stamp}.csv`, CSV.stringify(rows), 'text/csv;charset=utf-8');
    toast(`Exported ${records.length} ${records.length === 1 ? 'row' : 'rows'}`);
  }

  function coerceForField(field, raw) {
    const v = String(raw ?? '').trim();
    if (v === '') return '';
    switch (field.type) {
      case 'number':
      case 'currency': {
        // Tolerate "€1,234.00", "1 234", "(500)" as spreadsheets emit them.
        const neg = /^\(.*\)$/.test(v);
        const n = Number(v.replace(/[()]/g, '').replace(/[^0-9.-]/g, ''));
        return Number.isNaN(n) ? '' : (neg ? -n : n);
      }
      case 'checkbox':
        return /^(yes|y|true|1|done|x|✓)$/i.test(v);
      case 'date': {
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
        const d = new Date(v);
        return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
      }
      case 'select': {
        // Match an existing option case-insensitively; otherwise keep the raw
        // text so nothing is silently dropped.
        const hit = (field.options || []).find((o) => o.toLowerCase() === v.toLowerCase());
        return hit || v;
      }
      default:
        return v;
    }
  }

  function guessFieldFor(header, fields, used) {
    const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
    const h = norm(header);
    if (!h) return '';
    const free = fields.filter((f) => !used.has(f.key));
    return (free.find((f) => norm(f.label) === h)
      || free.find((f) => norm(f.key) === h)
      || free.find((f) => norm(f.label).includes(h) || h.includes(norm(f.label)))
      || { key: '' }).key;
  }

  async function openCSVImport(staleMod, event) {
    // Same reason as openRecord: use the live module definition, not the one
    // captured when this page was rendered.
    const mod = getModule(staleMod.id) || staleMod;
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;

    let rows;
    try {
      rows = CSV.parse(await file.text());
    } catch {
      toast('Could not read that CSV file');
      return;
    }
    if (rows.length < 2) {
      toast('That CSV has no data rows');
      return;
    }

    const headers = rows[0];
    const dataRows = rows.slice(1);
    const used = new Set();
    const guesses = headers.map((h) => {
      const key = guessFieldFor(h, mod.fields, used);
      if (key) used.add(key);
      return key;
    });
    const matched = guesses.filter(Boolean).length;

    const modal = openModal(`
      <div class="modal-head">
        <h2>Import into ${esc(mod.name)}</h2>
        <button class="icon-btn" data-close aria-label="Close">${icon('x', 16)}</button>
      </div>
      <div class="modal-body">
        <p class="settings-hint">
          <strong>${dataRows.length}</strong> row${dataRows.length === 1 ? '' : 's'} found in
          <strong>${esc(file.name)}</strong>. ${matched} of ${headers.length} columns matched automatically —
          check the mapping below.
        </p>
        <div class="map-table">
          <div class="map-row map-head"><span>CSV column</span><span>Sample value</span><span>Import as</span></div>
          ${headers.map((h, i) => `
            <div class="map-row">
              <span class="map-col"><strong>${esc(h || `(column ${i + 1})`)}</strong></span>
              <span class="map-sample muted">${esc((dataRows.find((r) => (r[i] || '').trim())?.[i] || '—').slice(0, 40))}</span>
              <select class="input map-select" data-col="${i}">
                <option value="">— skip this column —</option>
                ${mod.fields.map((f) => `<option value="${esc(f.key)}" ${guesses[i] === f.key ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}
                <option value="__new__">+ Create new field "${esc(h || `column ${i + 1}`)}"</option>
              </select>
            </div>`).join('')}
        </div>
        <label class="checkbox-line import-mode"><input type="checkbox" id="csv-replace"> Replace all existing ${esc(mod.name.toLowerCase())} instead of adding</label>
      </div>
      <div class="modal-foot">
        <span></span>
        <div class="modal-foot-right">
          <button class="btn btn-ghost" data-close>Cancel</button>
          <button class="btn btn-primary" id="csv-import-go">Import ${dataRows.length} row${dataRows.length === 1 ? '' : 's'}</button>
        </div>
      </div>`, { wide: true });

    $$('[data-close]', modal).forEach((b) => b.addEventListener('click', closeModal));
    $('#csv-import-go', modal).addEventListener('click', async () => {
      const mapping = $$('.map-select', modal).map((sel) => ({ col: Number(sel.dataset.col), target: sel.value }));
      const active = mapping.filter((m) => m.target);
      if (!active.length) {
        toast('Map at least one column');
        return;
      }

      // Columns marked "create new field" extend the module before importing.
      const created = [];
      const taken = new Set(mod.fields.map((f) => f.key));
      active.forEach((m) => {
        if (m.target !== '__new__') return;
        const label = (headers[m.col] || `Column ${m.col + 1}`).trim();
        const key = slug(label, taken);
        taken.add(key);
        const field = { key, label, type: 'text', showInList: mod.fields.filter((f) => f.showInList).length < 6 };
        created.push(field);
        m.target = key;
      });
      if (created.length) {
        mod.fields = [...mod.fields, ...created];
        await DB.put('modules', mod);
        await loadModules();
      }

      if ($('#csv-replace', modal).checked) {
        if (!confirm(`Delete all existing ${mod.name.toLowerCase()} and replace them with ${dataRows.length} imported rows?`)) return;
        await DB.deleteRecordsByModule(mod.id);
      }

      const fieldByKey = new Map(getModule(mod.id).fields.map((f) => [f.key, f]));
      let imported = 0;
      let skipped = 0;
      for (const row of dataRows) {
        const data = {};
        let hasValue = false;
        active.forEach(({ col, target }) => {
          const field = fieldByKey.get(target);
          if (!field) return;
          const value = coerceForField(field, row[col]);
          if (value !== '' && value !== false) hasValue = true;
          data[target] = value;
        });
        if (!hasValue) { skipped += 1; continue; } // blank line in the sheet
        const now = Date.now();
        await DB.put('records', { id: uid(), moduleId: mod.id, data, createdAt: now, updatedAt: now });
        imported += 1;
      }

      await persist();
      closeModal();
      renderSidebar();
      await renderModule(mod.id);
      toast(`Imported ${imported} row${imported === 1 ? '' : 's'}${skipped ? ` · skipped ${skipped} blank` : ''}`);
    });
  }

  // ---------------------------------------------------------------- record form
  async function fieldInputHTML(mod, field, value) {
    const id = `f-${field.key}`;
    const req = field.required ? 'required' : '';
    const v = value ?? '';
    switch (field.type) {
      case 'textarea':
        return `<textarea class="input" id="${id}" name="${esc(field.key)}" rows="4" ${req}>${esc(v)}</textarea>`;
      case 'select':
        return `<select class="input" id="${id}" name="${esc(field.key)}" ${req}>
          <option value="">—</option>
          ${(field.options || []).map((o) => `<option value="${esc(o)}" ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}
        </select>`;
      case 'checkbox':
        return `<label class="checkbox-line"><input type="checkbox" id="${id}" name="${esc(field.key)}" ${v ? 'checked' : ''}> ${esc(field.label)}</label>`;
      case 'relation': {
        const relMod = getModule(field.relatedModule);
        if (!relMod) return '<p class="muted">Linked module no longer exists.</p>';
        const relRecords = await DB.recordsByModule(relMod.id);
        relRecords.forEach((r) => relationNameCache.set(r.id, recordName(relMod, r)));
        return `<select class="input" id="${id}" name="${esc(field.key)}" ${req}>
          <option value="">—</option>
          ${relRecords.map((r) => `<option value="${r.id}" ${r.id === v ? 'selected' : ''}>${esc(recordName(relMod, r))}</option>`).join('')}
        </select>`;
      }
      case 'number':
      case 'currency':
        return `<input class="input" type="number" step="any" id="${id}" name="${esc(field.key)}" value="${esc(v)}" ${req}>`;
      case 'date':
        return `<input class="input" type="date" id="${id}" name="${esc(field.key)}" value="${esc(v)}" ${req}>`;
      case 'email':
        return `<input class="input" type="email" id="${id}" name="${esc(field.key)}" value="${esc(v)}" ${req}>`;
      case 'phone':
        return `<input class="input" type="tel" id="${id}" name="${esc(field.key)}" value="${esc(v)}" ${req}>`;
      case 'url':
        return `<input class="input" type="url" id="${id}" name="${esc(field.key)}" value="${esc(v)}" placeholder="https://" ${req}>`;
      default:
        return `<input class="input" type="text" id="${id}" name="${esc(field.key)}" value="${esc(v)}" ${req}>`;
    }
  }

  async function openRecord(staleMod, record) {
    // Rows can outlive the module definition they were rendered from (a CSV
    // import adds fields, the builder edits them), so always open the form
    // against the current definition rather than the captured one.
    const mod = getModule(staleMod.id) || staleMod;
    const isNew = !record;
    const data = record ? record.data : {};
    const fieldsHTML = (await Promise.all(mod.fields.map(async (f) => `
      <div class="form-row">
        ${f.type !== 'checkbox' ? `<label for="f-${esc(f.key)}">${esc(f.label)}${f.required ? ' <span class="req">*</span>' : ''}</label>` : ''}
        ${await fieldInputHTML(mod, f, data[f.key])}
      </div>`))).join('');

    const modal = openModal(`
      <div class="modal-head">
        <h2>${isNew ? `New ${esc(singular(mod.name).toLowerCase())}` : esc(recordName(mod, record))}</h2>
        <button class="icon-btn" data-close aria-label="Close">${icon('x', 16)}</button>
      </div>
      <form id="record-form" class="modal-body">${fieldsHTML}</form>
      <div class="modal-foot">
        ${!isNew ? `<button class="btn btn-danger-ghost" id="record-delete">${icon('trash-2', 15)} Delete</button>` : '<span></span>'}
        <div class="modal-foot-right">
          <button class="btn btn-ghost" data-close>Cancel</button>
          <button class="btn btn-primary" id="record-save">Save</button>
        </div>
      </div>`);

    $$('[data-close]', modal).forEach((b) => b.addEventListener('click', closeModal));
    $('#record-save', modal).addEventListener('click', async () => {
      const form = $('#record-form', modal);
      if (!form.reportValidity()) return;
      const newData = {};
      mod.fields.forEach((f) => {
        const input = form.elements[f.key];
        if (!input) return;
        if (f.type === 'checkbox') newData[f.key] = input.checked;
        else if (f.type === 'number' || f.type === 'currency') newData[f.key] = input.value === '' ? '' : Number(input.value);
        else newData[f.key] = input.value;
      });
      const now = Date.now();
      const toSave = isNew
        ? { id: uid(), moduleId: mod.id, data: newData, createdAt: now, updatedAt: now }
        : { ...record, data: newData, updatedAt: now };
      await DB.put('records', toSave);
      await persist();
      closeModal();
      toast(isNew ? 'Added' : 'Saved');
      renderModuleBodyOnly(mod);
    });
    const delBtn = $('#record-delete', modal);
    if (delBtn) {
      delBtn.addEventListener('click', async () => {
        if (!confirm('Delete this record? This cannot be undone.')) return;
        await DB.delete('records', record.id);
        await persist();
        closeModal();
        toast('Deleted');
        renderModuleBodyOnly(mod);
      });
    }
  }

  // ---------------------------------------------------------------- module builder
  function builderFieldRowHTML(f = {}, idx) {
    return `
      <div class="builder-field" data-idx="${idx}">
        <span class="drag-dots" aria-hidden="true">${icon('grip-vertical', 14)}</span>
        <input class="input bf-label" type="text" placeholder="Field label" value="${esc(f.label || '')}" data-key="${esc(f.key || '')}">
        <select class="input bf-type">
          ${FIELD_TYPES.map(([val, label]) => `<option value="${val}" ${f.type === val ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
        <div class="bf-actions">
          <label class="bf-flag" title="Required"><input type="checkbox" class="bf-required" ${f.required ? 'checked' : ''}>Req</label>
          <label class="bf-flag" title="Show in list view"><input type="checkbox" class="bf-list" ${f.showInList ? 'checked' : ''}>List</label>
          <button class="icon-btn bf-up" title="Move up">${icon('chevron-up', 15)}</button>
          <button class="icon-btn bf-remove" title="Remove field">${icon('x', 15)}</button>
        </div>
        <input class="input bf-options ${f.type === 'select' ? '' : 'hidden'}" type="text"
          placeholder="Options, comma separated" value="${esc((f.options || []).join(', '))}">
        <select class="input bf-related ${f.type === 'relation' ? '' : 'hidden'}">
          ${modules.map((m) => `<option value="${m.id}" ${f.relatedModule === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
        </select>
      </div>`;
  }

  function openBuilder(mod) {
    const isNew = !mod;
    const draft = mod || { name: '', icon: 'package', color: MODULE_COLORS[modules.length % MODULE_COLORS.length], fields: [{ label: 'Name', key: 'name', type: 'text', required: true, showInList: true }] };

    const modal = openModal(`
      <div class="modal-head">
        <h2>${isNew ? 'New module' : `Edit ${esc(mod.name)}`}</h2>
        <button class="icon-btn" data-close aria-label="Close">${icon('x', 16)}</button>
      </div>
      <div class="modal-body">
        <div class="form-row">
          <label for="b-name">Module name <span class="req">*</span></label>
          <input class="input" id="b-name" type="text" placeholder="e.g. Projects, Invoices, Equipment" value="${esc(draft.name)}" required>
        </div>
        <div class="builder-meta">
          <div class="form-row">
            <label>Icon</label>
            <div class="swatch-row" id="b-icons">
              ${MODULE_ICONS.map((i) => `<button class="swatch ${i === draft.icon ? 'on' : ''}" data-icon="${i}" title="${i}">${icon(i, 16)}</button>`).join('')}
            </div>
          </div>
          <div class="form-row">
            <label>Color</label>
            <div class="swatch-row" id="b-colors">
              ${MODULE_COLORS.map((c) => `<button class="swatch color ${c === draft.color ? 'on' : ''}" data-color="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}
            </div>
          </div>
        </div>
        <div class="form-row">
          <label>Fields</label>
          <div id="builder-fields">
            ${draft.fields.map((f, i) => builderFieldRowHTML(f, i)).join('')}
          </div>
          <button class="btn btn-ghost" id="b-add-field">${icon('plus', 15)} Add field</button>
        </div>
      </div>
      <div class="modal-foot">
        ${!isNew ? `<button class="btn btn-danger-ghost" id="b-delete">${icon('trash-2', 15)} Delete module</button>` : '<span></span>'}
        <div class="modal-foot-right">
          <button class="btn btn-ghost" data-close>Cancel</button>
          <button class="btn btn-primary" id="b-save">${isNew ? 'Create module' : 'Save changes'}</button>
        </div>
      </div>`, { wide: true });

    let iconName = draft.icon;
    let color = draft.color;
    $$('[data-close]', modal).forEach((b) => b.addEventListener('click', closeModal));
    $('#b-icons', modal).addEventListener('click', (e) => {
      const b = e.target.closest('[data-icon]');
      if (!b) return;
      iconName = b.dataset.icon;
      $$('#b-icons .swatch', modal).forEach((s) => s.classList.toggle('on', s === b));
    });
    $('#b-colors', modal).addEventListener('click', (e) => {
      const b = e.target.closest('[data-color]');
      if (!b) return;
      color = b.dataset.color;
      $$('#b-colors .swatch', modal).forEach((s) => s.classList.toggle('on', s === b));
    });

    const fieldsBox = $('#builder-fields', modal);
    fieldsBox.addEventListener('change', (e) => {
      if (!e.target.classList.contains('bf-type')) return;
      const row = e.target.closest('.builder-field');
      $('.bf-options', row).classList.toggle('hidden', e.target.value !== 'select');
      $('.bf-related', row).classList.toggle('hidden', e.target.value !== 'relation');
    });
    fieldsBox.addEventListener('click', (e) => {
      const row = e.target.closest('.builder-field');
      if (!row) return;
      if (e.target.closest('.bf-remove')) {
        if ($$('.builder-field', fieldsBox).length <= 1) {
          toast('A module needs at least one field');
          return;
        }
        row.remove();
      } else if (e.target.closest('.bf-up') && row.previousElementSibling) {
        row.parentNode.insertBefore(row, row.previousElementSibling);
      }
    });
    $('#b-add-field', modal).addEventListener('click', () => {
      fieldsBox.insertAdjacentHTML('beforeend', builderFieldRowHTML({ type: 'text' }, Date.now()));
    });

    $('#b-save', modal).addEventListener('click', async () => {
      const name = $('#b-name', modal).value.trim();
      if (!name) {
        toast('Give your module a name');
        $('#b-name', modal).focus();
        return;
      }
      const taken = new Set();
      const fields = $$('.builder-field', fieldsBox).map((row) => {
        const label = $('.bf-label', row).value.trim();
        if (!label) return null;
        const existingKey = $('.bf-label', row).dataset.key;
        const key = existingKey && !taken.has(existingKey) ? existingKey : slug(label, taken);
        taken.add(key);
        const type = $('.bf-type', row).value;
        const field = {
          key,
          label,
          type,
          required: $('.bf-required', row).checked,
          showInList: $('.bf-list', row).checked,
        };
        if (type === 'select') {
          field.options = $('.bf-options', row).value.split(',').map((s) => s.trim()).filter(Boolean);
        }
        if (type === 'relation') {
          field.relatedModule = $('.bf-related', row).value;
        }
        return field;
      }).filter(Boolean);
      if (!fields.length) {
        toast('Add at least one field');
        return;
      }
      const saved = {
        ...(mod || { id: uid(), createdAt: Date.now(), defaultView: 'table' }),
        name,
        icon: iconName,
        color,
        fields,
      };
      await DB.put('modules', saved);
      await loadModules();
      await persist();
      closeModal();
      renderSidebar();
      toast(isNew ? `${name} module created` : 'Module updated');
      location.hash = `#/m/${saved.id}`;
      route();
    });

    const delBtn = $('#b-delete', modal);
    if (delBtn) {
      delBtn.addEventListener('click', async () => {
        if (!confirm(`Delete "${mod.name}" and ALL of its records? This cannot be undone.`)) return;
        await DB.deleteRecordsByModule(mod.id);
        await DB.delete('modules', mod.id);
        await loadModules();
        await persist();
        closeModal();
        renderSidebar();
        toast('Module deleted');
        location.hash = '#/';
      });
    }
  }

  // ---------------------------------------------------------------- settings
  async function renderSettings() {
    const main = $('#main');
    // Only used for a count. Settings is where someone lands to export or
    // reset when storage is misbehaving, so it must render regardless.
    let allRecords = [];
    let storageOk = true;
    try {
      allRecords = await DB.getAll('records');
    } catch (err) {
      storageOk = false;
      console.error('Could not read records for Settings:', err);
    }
    const authed = Cloud.isAuthed;
    main.innerHTML = `
      <div class="page">
        <div class="page-head">
          <h1>Settings</h1>
          <p class="subtitle">${storageOk
            ? `${modules.length} module${modules.length === 1 ? '' : 's'} · ${allRecords.length} record${allRecords.length === 1 ? '' : 's'}${authed ? ' — synced to your account' : ' — stored privately on this device'}.`
            : 'This browser is blocking local storage, so records cannot be read on this device.'}</p>
        </div>
        ${storageOk ? '' : `
          <div class="card danger-zone">
            <div class="card-head"><h2>Local storage unavailable</h2></div>
            <p class="settings-hint">The app could not open its database in this browser. That usually means private browsing, or a privacy setting or extension blocking site storage. Your synced data is unaffected — try a normal window, or allow storage for this site.</p>
          </div>`}
        <div class="card">
          <div class="card-head"><h2>Workspace</h2></div>
          <div class="settings-grid">
            <div class="form-row">
              <label for="set-name">Business name</label>
              <input class="input" id="set-name" type="text" value="${esc(SETTINGS.businessName)}" placeholder="Your business">
            </div>
            <div class="form-row">
              <label for="set-currency">Currency</label>
              <select class="input" id="set-currency">
                ${CURRENCIES.map((c) => `<option value="${c}" ${c === SETTINGS.currency ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
            </div>
          </div>
          <button class="btn btn-primary" id="save-workspace">Save workspace</button>
        </div>
        <div class="card">
          <div class="card-head"><h2>Account & sync</h2></div>
          ${authed ? `
            <p class="settings-hint">Signed in as <strong>${esc(Cloud.user.email)}</strong>${Cloud.user.role === 'platformAdmin' ? ' (platform admin)' : Cloud.user.role === 'owner' ? ' (owner)' : ''}. Your workspace syncs automatically; changes made offline sync when you're back online.</p>
            <div class="btn-row">
              <button class="btn" id="sync-now-btn">${icon('refresh-cw', 15)} Sync now</button>
              <button class="btn" id="signout-btn">${icon('log-out', 15)} Sign out</button>
            </div>` : Cloud.me.serverAvailable ? `
            <p class="settings-hint">You're not signed in. Data is saved on this device (with a local backup copy). Sign in to sync it to your account and use it on other devices.</p>
            <button class="btn btn-primary" id="settings-signin">${icon('log-in', 15)} Sign in</button>` : `
            <p class="settings-hint">This copy of CRM Builder is running without a server — everything is stored on this device. Deploy with the included server (see DEPLOYMENT.md) to enable accounts and sync.</p>`}
        </div>
        <div class="card">
          <div class="card-head"><h2>Backup & restore</h2></div>
          <p class="settings-hint">Export a backup file anytime, or use one to move your CRM between devices.</p>
          <div class="btn-row">
            <button class="btn" id="export-btn">${icon('download', 15)} Export data (JSON)</button>
            <button class="btn" id="import-btn">${icon('upload', 15)} Import backup</button>
            <input type="file" id="import-file" accept="application/json,.json" class="hidden">
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h2>App</h2></div>
          <div class="btn-row">
            <button class="btn ${deferredInstall ? '' : 'hidden'}" id="settings-install">${icon('download', 15)} Install on this device</button>
            <button class="btn" id="add-template-btn">${icon('plus', 15)} Add module from template</button>
            <button class="btn" id="load-demo-btn">${icon('database', 15)} Load demo data</button>
            <button class="btn" id="replay-tour-btn">${icon('map-pin', 15)} Replay the tour</button>
          </div>
          <p class="settings-hint" style="margin:12px 0 0">Demo data fills every module with a sample business so you can explore or present without entering records first. It is added alongside anything you already have.</p>
        </div>
        <div class="card danger-zone">
          <div class="card-head"><h2>Danger zone</h2></div>
          <div class="btn-row">
            <button class="btn btn-danger-ghost" id="reset-btn">${icon('trash-2', 15)} Delete all data</button>
          </div>
        </div>
      </div>`;

    $('#save-workspace').addEventListener('click', () => {
      SETTINGS.businessName = $('#set-name').value.trim();
      SETTINGS.currency = $('#set-currency').value;
      saveSettings();
      renderSidebar();
      toast('Workspace saved');
    });
    $('#export-btn').addEventListener('click', exportData);
    $('#import-btn').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', importData);
    $('#reset-btn').addEventListener('click', async () => {
      if (!confirm('Delete ALL modules and records from this device? Export a backup first if you might need this data.')) return;
      await DB.clear('records');
      await DB.clear('modules');
      localStorage.removeItem('crmb:snapshot');
      await loadModules();
      await persist();
      renderSidebar();
      toast('All data deleted');
      location.hash = '#/';
      route();
    });
    const installBtn = $('#settings-install');
    if (installBtn) installBtn.addEventListener('click', promptInstall);
    $('#add-template-btn').addEventListener('click', openTemplatePicker);
    $('#replay-tour-btn').addEventListener('click', startTour);
    $('#load-demo-btn').addEventListener('click', async () => {
      const replace = modules.length > 0
        && confirm('Replace your current modules and records with the demo business?\n\nOK = replace everything (your current data is deleted)\nCancel = add demo data alongside what you have');
      await loadDemoData({ replace });
    });
    const signinBtn = $('#settings-signin');
    if (signinBtn) signinBtn.addEventListener('click', openSignIn);
    const signoutBtn = $('#signout-btn');
    if (signoutBtn) {
      signoutBtn.addEventListener('click', async () => {
        await Cloud.pushNow();
        await Cloud.logout();
        toast('Signed out — your data remains on this device');
        renderSidebar();
        renderSettings();
      });
    }
    const syncBtn = $('#sync-now-btn');
    if (syncBtn) {
      syncBtn.addEventListener('click', async () => {
        toast((await Cloud.pushNow()) ? 'Synced' : 'Sync failed — will retry when online');
      });
    }
  }

  function openTemplatePicker() {
    const modal = openModal(`
      <div class="modal-head">
        <h2>Add module from template</h2>
        <button class="icon-btn" data-close aria-label="Close">${icon('x', 16)}</button>
      </div>
      <div class="modal-body">
        <div class="template-list">
          ${TEMPLATES.map((t, i) => `
            <button class="template-line" data-template="${i}">
              <span class="template-icon" style="color:${esc(t.color)};background:${esc(t.color)}1a">${LUCIDE[t.icon] ? icon(t.icon, 18) : esc(t.icon)}</span>
              <span><strong>${esc(t.name)}</strong><br><span class="muted">${esc(t.description)}</span></span>
            </button>`).join('')}
        </div>
      </div>`, { wide: true });
    $$('[data-close]', modal).forEach((b) => b.addEventListener('click', closeModal));
    $$('.template-line', modal).forEach((b) => b.addEventListener('click', async () => {
      const t = TEMPLATES[Number(b.dataset.template)];
      const mod = await createFromTemplate(t, false);
      await loadModules();
      await persist();
      closeModal();
      renderSidebar();
      toast(`${t.name} added`);
      location.hash = `#/m/${mod.id}`;
    }));
  }

  async function exportData() {
    const payload = {
      app: 'crmbuilder',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: SETTINGS,
      modules: await DB.getAll('modules'),
      records: await DB.getAll('records'),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crmbuilder-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Backup downloaded');
  }

  async function importData(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let payload;
    try {
      payload = JSON.parse(await file.text());
    } catch {
      toast('That file is not valid JSON');
      return;
    }
    if (payload.app !== 'crmbuilder' || !Array.isArray(payload.modules) || !Array.isArray(payload.records)) {
      toast('That does not look like a CRM Builder backup');
      return;
    }
    if (!confirm(`Import ${payload.modules.length} modules and ${payload.records.length} records? This REPLACES everything currently on this device.`)) return;
    await importState(payload);
    await persist();
    renderSidebar();
    toast('Backup imported');
    location.hash = '#/';
    route();
  }

  // ---------------------------------------------------------------- admin
  // Charts follow the dataviz method: single-series bars in the validated
  // accent hue, thin marks with 2px gaps, recessive axis, per-bar tooltip,
  // values in text tokens (not series color).
  function barChart({ data, height = 120, label }) {
    const W = 560;
    const max = Math.max(1, ...data.map((d) => d.count));
    const n = data.length;
    const gap = 2;
    const bw = Math.max(3, Math.floor((W - gap * (n - 1)) / n));
    const plotH = height - 18;
    const bars = data.map((d, i) => {
      const h = d.count === 0 ? 0 : Math.max(3, Math.round((d.count / max) * (plotH - 4)));
      const x = i * (bw + gap);
      const nice = new Date(`${d.day}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return `<g class="bar-g" data-tip="${esc(nice)}: ${d.count} ${esc(label)}">
        <rect x="${x}" y="0" width="${bw}" height="${plotH}" fill="transparent"></rect>
        ${h ? `<rect class="bar" x="${x}" y="${plotH - h}" width="${bw}" height="${h}" rx="2"></rect>` : `<rect class="bar bar-zero" x="${x}" y="${plotH - 1.5}" width="${bw}" height="1.5"></rect>`}
      </g>`;
    }).join('');
    const first = data[0], last = data[n - 1];
    const fmtD = (d) => new Date(`${d.day}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `
      <div class="chart" role="img" aria-label="${esc(label)} per day">
        <svg viewBox="0 0 ${W} ${height}" preserveAspectRatio="none" class="chart-svg">
          <line class="chart-baseline" x1="0" y1="${plotH + 0.5}" x2="${W}" y2="${plotH + 0.5}"></line>
          ${bars}
        </svg>
        <div class="chart-x"><span>${esc(fmtD(first))}</span><span>${esc(fmtD(last))}</span></div>
        <div class="chart-max muted">peak ${max}</div>
      </div>`;
  }

  function bindChartTooltips(root) {
    let tip = $('#chart-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'chart-tip';
      tip.className = 'chart-tip hidden';
      document.body.appendChild(tip);
    }
    $$('.bar-g', root).forEach((g) => {
      g.addEventListener('mouseenter', () => {
        tip.textContent = g.dataset.tip;
        tip.classList.remove('hidden');
      });
      g.addEventListener('mousemove', (e) => {
        tip.style.left = `${Math.min(e.clientX + 12, window.innerWidth - 160)}px`;
        tip.style.top = `${e.clientY - 34}px`;
      });
      g.addEventListener('mouseleave', () => tip.classList.add('hidden'));
    });
  }

  async function renderAdmin() {
    const main = $('#main');
    if (!Cloud.user || !['platformAdmin', 'owner'].includes(Cloud.user.role)) {
      main.innerHTML = `<div class="page"><div class="card"><p class="empty-hint">${Cloud.isAuthed ? 'This page is for administrators only.' : 'Sign in with an admin account to view this page.'}</p></div></div>`;
      return;
    }
    main.innerHTML = '<div class="page"><p class="empty-hint">Loading analytics…</p></div>';
    let stats, usersRes;
    try {
      [stats, usersRes] = await Promise.all([Cloud.admin.stats(), Cloud.admin.users()]);
    } catch (err) {
      // The signed-in role is whatever it was at sign-in; an administrator can
      // change it since. A 403 here means exactly that, so say the plain thing
      // rather than surfacing the API's wording.
      const denied = err.status === 403;
      main.innerHTML = `<div class="page"><div class="card"><p class="empty-hint">${denied
        ? 'This page is for administrators only.'
        : `Could not load admin data: ${esc(err.message)}`}</p></div></div>`;
      return;
    }
    const t = stats.totals;
    const fmtWhen = (ts) => (ts ? new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

    main.innerHTML = `
      <div class="page page-full">
        <div class="page-head">
          <h1>Admin</h1>
          <p class="subtitle">Business metrics and account management · storage: ${esc(stats.storage)}</p>
        </div>
        <div class="stat-grid admin-stats">
          <div class="stat-card"><span class="stat-icon accent-chip">${icon('users', 18)}</span><span class="stat-count">${t.users}</span><span class="stat-label">Total accounts</span></div>
          <div class="stat-card"><span class="stat-icon accent-chip">${icon('activity', 18)}</span><span class="stat-count">${t.activeLast7d}</span><span class="stat-label">Active (7 days)</span></div>
          <div class="stat-card"><span class="stat-icon accent-chip">${icon('layout-dashboard', 18)}</span><span class="stat-count">${t.workspaces}</span><span class="stat-label">Workspaces with data</span></div>
          <div class="stat-card"><span class="stat-icon accent-chip">${icon('database', 18)}</span><span class="stat-count">${t.records.toLocaleString()}</span><span class="stat-label">Records stored</span></div>
          <div class="stat-card"><span class="stat-icon accent-chip">${icon('package', 18)}</span><span class="stat-count">${t.modules}</span><span class="stat-label">Modules built</span></div>
        </div>
        <div class="chart-grid">
          <div class="card">
            <div class="card-head"><h2>Signups — last 30 days</h2></div>
            ${barChart({ data: stats.signups, label: 'signups' })}
          </div>
          <div class="card">
            <div class="card-head"><h2>Daily active users — last 14 days</h2></div>
            ${barChart({ data: stats.activeUsers, label: 'active users' })}
          </div>
        </div>
        <div class="card table-card">
          <div class="card-head admin-users-head">
            <h2>Accounts</h2>
            <div class="search-wrap">${icon('search', 15)}<input type="search" id="admin-search" class="input search-input" placeholder="Search accounts…"></div>
          </div>
          <div class="table-scroll">
          <table class="records-table" id="admin-users-table">
            <thead><tr><th>User</th><th>Role</th><th>Status</th><th class="th-num">Modules</th><th class="th-num">Records</th><th>Joined</th><th>Last active</th><th>Actions</th></tr></thead>
            <tbody>
              ${usersRes.users.map((u) => `
                <tr data-email="${esc(u.email)}" data-name="${esc(u.name || '')}" class="admin-row">
                  <td data-label="User"><strong>${esc(u.name || '—')}</strong><br><span class="muted">${esc(u.email)}</span></td>
                  <td data-label="Role"><span class="pill ${u.role === 'platformAdmin' || u.role === 'owner' ? 'pill-accent' : ''}">${esc(ROLE_LABELS[u.role] || u.role)}</span></td>
                  <td data-label="Status">${u.disabled ? '<span class="pill pill-danger">disabled</span>' : '<span class="pill pill-ok">active</span>'}</td>
                  <td data-label="Modules" class="td-num">${u.moduleCount}</td>
                  <td data-label="Records" class="td-num">${u.recordCount}</td>
                  <td data-label="Joined">${fmtWhen(u.createdAt)}</td>
                  <td data-label="Last active">${fmtWhen(u.lastActiveAt)}</td>
                  <td data-label="Actions" class="admin-actions">
                    ${u.id === Cloud.user.id ? '<span class="muted">you</span>' : `
                      <button class="icon-btn" data-act="role" data-id="${u.id}" data-role="${u.role === 'owner' ? 'member' : 'owner'}" title="${u.role === 'owner' ? 'Demote to member' : 'Make an owner'}">${icon(u.role === 'owner' ? 'user' : 'shield-check', 15)}</button>
                      <button class="icon-btn" data-act="disable" data-id="${u.id}" data-disabled="${u.disabled ? '0' : '1'}" title="${u.disabled ? 'Re-enable account' : 'Disable account'}">${icon('ban', 15)}</button>
                      <button class="icon-btn" data-act="delete" data-id="${u.id}" title="Delete account and data">${icon('trash-2', 15)}</button>`}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
          </div>
        </div>
      </div>`;

    bindChartTooltips(main);
    $('#admin-search').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      $$('.admin-row', main).forEach((row) => {
        row.classList.toggle('hidden', q && !(row.dataset.email + ' ' + row.dataset.name).toLowerCase().includes(q));
      });
    });
    $$('[data-act]', main).forEach((btn) => {
      btn.addEventListener('click', async () => {
        const { act, id } = btn.dataset;
        try {
          if (act === 'role') {
            await Cloud.admin.update(id, { role: btn.dataset.role });
            toast(`Role changed to ${btn.dataset.role}`);
          } else if (act === 'disable') {
            const disable = btn.dataset.disabled === '1';
            if (disable && !confirm('Disable this account? The user will be signed out and unable to sync.')) return;
            await Cloud.admin.update(id, { disabled: disable });
            toast(disable ? 'Account disabled' : 'Account re-enabled');
          } else if (act === 'delete') {
            if (!confirm('Delete this account AND all of its synced data? This cannot be undone.')) return;
            await Cloud.admin.remove(id);
            toast('Account deleted');
          }
          renderAdmin();
        } catch (err) {
          toast(err.message);
        }
      });
    });
  }

  // ---------------------------------------------------------------- pwa bits
  function promptInstall() {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    deferredInstall.userChoice.then(() => {
      deferredInstall = null;
      $('#install-btn').classList.add('hidden');
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
    $('#install-btn').classList.remove('hidden');
  });

  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    $('#install-btn').classList.add('hidden');
    toast('CRM Builder installed');
  });

  function updateOnlineBadge() {
    $('#offline-badge').classList.toggle('hidden', navigator.onLine);
  }
  window.addEventListener('online', updateOnlineBadge);
  window.addEventListener('offline', updateOnlineBadge);

  // ---------------------------------------------------------------- boot
  async function loadModules() {
    modules = (await DB.getAll('modules')).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }

  function renderRouteError(err) {
    console.error('Render failed:', err);
    $('#main').innerHTML = `
      <div class="page"><div class="card">
        <div class="card-head"><h2>This page could not be loaded</h2></div>
        <p class="empty-hint">${esc(err && err.message ? err.message : 'Unexpected error')}</p>
        <div class="btn-row">
          <button class="btn btn-primary" id="route-retry">Try again</button>
          <a class="btn" href="#/">Go to dashboard</a>
        </div>
      </div></div>`;
    const retry = $('#route-retry');
    if (retry) retry.addEventListener('click', () => route());
  }

  function route() {
    closeSidebar();
    closeModal();
    const hash = location.hash.replace(/^#\/?/, '');
    const [section, id] = hash.split('/');
    // A view that throws must not leave the previous screen up — that reads as
    // a dead link. Sidebar and body are guarded separately so a failure in one
    // does not take out the other.
    try {
      renderSidebar();
    } catch (err) {
      console.error('Sidebar render failed:', err);
    }
    const render = section === 'm' && id ? () => renderModule(id)
      : section === 'settings' ? renderSettings
        : section === 'admin' ? renderAdmin
          : renderDashboard;
    try {
      Promise.resolve(render()).catch(renderRouteError);
    } catch (err) {
      renderRouteError(err);
    }
  }

  // Sync happens after the first paint, so it must not disturb whatever the
  // user is already doing. Repaint only when the cloud actually replaced our
  // data, and never out from under an open modal.
  async function syncInBackground() {
    await Cloud.init(fullState);
    renderSidebar();
    // The onboarding screen offers "already have an account?" only once we know
    // a server exists, so repaint it now that we do.
    if (!modules.length && !$('#modal-root').firstChild) route();
    if (!Cloud.isAuthed) return;
    const changed = await reconcileWithCloud();
    if (!changed) return;
    await loadModules();
    if ($('#modal-root').firstChild) return; // mid-edit: leave the screen alone
    route();
  }

  // Everything below is best-effort. The one hard guarantee is that the app
  // paints and responds to navigation — a failure reading local storage must
  // degrade to an empty workspace, never to the bare HTML shell with dead links.
  async function init() {
    // Wire the chrome first: if anything later fails, the app is still
    // navigable rather than inert.
    window.addEventListener('hashchange', route);
    $('#add-module-btn').addEventListener('click', () => openBuilder(null));
    $('#install-btn').addEventListener('click', promptInstall);
    $('#menu-btn').addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
    $('#scrim').addEventListener('click', closeSidebar);
    updateOnlineBadge();

    const params = new URLSearchParams(location.search);
    if (params.get('auth_error')) {
      toast(params.get('auth_error') === 'disabled' ? 'This account has been disabled' : 'Sign-in failed — please try again');
      history.replaceState(null, '', location.pathname + location.hash);
    }

    // Watchdog: if local data is slow or wedged, show the UI anyway. Whatever
    // loads afterwards triggers a second render.
    let painted = false;
    const paint = () => { painted = true; route(); };
    const watchdog = setTimeout(() => { if (!painted) paint(); }, 2500);

    try {
      await loadModules();

      // If IndexedDB was evicted but the localStorage snapshot survived, restore it.
      if (!modules.length) {
        try {
          const snap = JSON.parse(localStorage.getItem('crmb:snapshot'));
          if (snap && Array.isArray(snap.modules) && snap.modules.length) {
            await importState(snap);
            toast('Restored from local backup');
          }
        } catch { /* no snapshot */ }
      }
    } catch (err) {
      console.error('Could not read local data:', err);
      modules = [];
      toast('Could not open local storage — your data is safe, try reloading');
    } finally {
      clearTimeout(watchdog);
      // Paint from local data. A sleeping free-tier server must never stand
      // between the user and their own data — /api/me is not awaited here.
      paint();
    }

    syncInBackground();

    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('sw.js');
      } catch (err) {
        console.warn('Service worker registration failed:', err);
      }
    }
  }

  // Last resort. If init() itself fails, the shell would otherwise sit there
  // looking loaded but doing nothing, which is worse than an honest error.
  init().catch((err) => {
    console.error('Startup failed:', err);
    try {
      route();
    } catch {
      $('#main').innerHTML = `
        <div class="page"><div class="card">
          <h2>Something went wrong starting the app</h2>
          <p class="empty-hint">Reload the page to try again. Your data is stored on this device and has not been lost.</p>
          <button class="btn btn-primary" onclick="location.reload()">Reload</button>
        </div></div>`;
    }
  });
})();
