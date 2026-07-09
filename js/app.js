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
      viewState.set(moduleId, { q: '', view: mod && mod.defaultView === 'kanban' && kanbanField(mod) ? 'kanban' : 'table' });
    }
    return viewState.get(moduleId);
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

  function fmtValue(field, value) {
    if (value === undefined || value === null || value === '') return '<span class="muted">—</span>';
    switch (field.type) {
      case 'currency': return `<span class="num">${esc(fmtCurrency(value))}</span>`;
      case 'number': return `<span class="num">${esc(Number(value).toLocaleString())}</span>`;
      case 'date': return esc(fmtDate(value));
      case 'checkbox': return value ? `<span class="check-yes">${icon('check', 15)}</span>` : '<span class="muted">—</span>';
      case 'url': return `<a href="${esc(value)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${esc(String(value).replace(/^https?:\/\//, ''))}</a>`;
      case 'email': return `<a href="mailto:${esc(value)}" onclick="event.stopPropagation()">${esc(value)}</a>`;
      case 'phone': return `<a href="tel:${esc(value)}" onclick="event.stopPropagation()">${esc(value)}</a>`;
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
  async function reconcileWithCloud() {
    let remote;
    try { remote = await Cloud.pull(); } catch { return; }
    const localHas = modules.length > 0;
    const lastSync = Number(localStorage.getItem('crmb:lastSync')) || 0;
    const lastEdit = Number(localStorage.getItem('crmb:lastEdit')) || 0;
    const dirty = !!localStorage.getItem('crmb:dirty');

    if (!remote || remote.modules === null) {
      if (localHas) await Cloud.pushNow();
      return;
    }
    if (!localHas) {
      await importState(remote);
      localStorage.setItem('crmb:lastSync', String(Date.now()));
      localStorage.removeItem('crmb:dirty');
      if (remote.modules.length) toast('Workspace restored from your account');
      return;
    }
    if (remote.updatedAt > lastSync) {
      if (!dirty || remote.updatedAt > lastEdit) {
        await importState(remote);
        localStorage.setItem('crmb:lastSync', String(Date.now()));
        localStorage.removeItem('crmb:dirty');
        toast('Synced latest data from your account');
      } else {
        await Cloud.pushNow(); // local edits are newer
      }
    } else if (dirty) {
      await Cloud.pushNow();
    }
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
    if (!Cloud.me.serverAvailable) return '';
    if (!Cloud.isAuthed) {
      return `<button class="btn btn-outline btn-block" id="signin-btn">${icon('log-in', 15)} Sign in to sync</button>`;
    }
    const labels = { synced: 'Synced', syncing: 'Syncing…', error: 'Sync error — retrying', offline: 'Offline — will sync', local: 'Local' };
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

    const adminLink = $('#nav-admin');
    adminLink.classList.toggle('hidden', !(Cloud.user && Cloud.user.role === 'admin'));

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
                  <button class="btn btn-outline" data-quick-add="${m.id}">${icon('plus', 14)} ${esc(m.name.replace(/s$/, ''))}</button>`).join('')}
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
            <button class="btn btn-ghost" id="onboard-custom">Start with a custom module instead</button>
          </div>
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

  // ---------------------------------------------------------------- module view
  async function renderModule(id) {
    const mod = getModule(id);
    const main = $('#main');
    if (!mod) {
      main.innerHTML = '<div class="page"><p class="empty-hint">Module not found.</p></div>';
      return;
    }
    const st = state(id);
    let records = await DB.recordsByModule(id);
    await primeRelationCache(mod, records);
    const q = st.q.trim().toLowerCase();
    if (q) {
      records = records.filter((r) => Object.values(r.data).some((v) => String(v ?? '').toLowerCase().includes(q)));
    }
    records.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
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
    bindModuleBody(mod);
  }

  async function renderModuleBodyOnly(mod) {
    const st = state(mod.id);
    let records = await DB.recordsByModule(mod.id);
    await primeRelationCache(mod, records);
    const q = st.q.trim().toLowerCase();
    if (q) {
      records = records.filter((r) => Object.values(r.data).some((v) => String(v ?? '').toLowerCase().includes(q)));
    }
    records.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
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
    if (!records.length) {
      return `<div class="card"><p class="empty-hint">Nothing here yet. Hit <strong>Add</strong> to create your first ${esc(mod.name.toLowerCase().replace(/s$/, ''))}.</p></div>`;
    }
    return `
      <div class="card table-wrap">
        <table class="records-table">
          <thead><tr>${cols.map((f) => `<th class="${['currency', 'number'].includes(f.type) ? 'th-num' : ''}">${esc(f.label)}</th>`).join('')}</tr></thead>
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

  async function openRecord(mod, record) {
    const isNew = !record;
    const data = record ? record.data : {};
    const fieldsHTML = (await Promise.all(mod.fields.map(async (f) => `
      <div class="form-row">
        ${f.type !== 'checkbox' ? `<label for="f-${esc(f.key)}">${esc(f.label)}${f.required ? ' <span class="req">*</span>' : ''}</label>` : ''}
        ${await fieldInputHTML(mod, f, data[f.key])}
      </div>`))).join('');

    const modal = openModal(`
      <div class="modal-head">
        <h2>${isNew ? `New ${esc(mod.name.replace(/s$/, ''))}` : esc(recordName(mod, record))}</h2>
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
        <input class="input bf-options ${f.type === 'select' ? '' : 'hidden'}" type="text"
          placeholder="Options, comma separated" value="${esc((f.options || []).join(', '))}">
        <select class="input bf-related ${f.type === 'relation' ? '' : 'hidden'}">
          ${modules.map((m) => `<option value="${m.id}" ${f.relatedModule === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
        </select>
        <label class="bf-flag" title="Required"><input type="checkbox" class="bf-required" ${f.required ? 'checked' : ''}>Req</label>
        <label class="bf-flag" title="Show in list view"><input type="checkbox" class="bf-list" ${f.showInList ? 'checked' : ''}>List</label>
        <button class="icon-btn bf-up" title="Move up">${icon('chevron-up', 15)}</button>
        <button class="icon-btn bf-remove" title="Remove field">${icon('x', 15)}</button>
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
    const allRecords = await DB.getAll('records');
    const authed = Cloud.isAuthed;
    main.innerHTML = `
      <div class="page">
        <div class="page-head">
          <h1>Settings</h1>
          <p class="subtitle">${modules.length} module${modules.length === 1 ? '' : 's'} · ${allRecords.length} record${allRecords.length === 1 ? '' : 's'}${authed ? ' — synced to your account' : ' — stored privately on this device'}.</p>
        </div>
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
            <p class="settings-hint">Signed in as <strong>${esc(Cloud.user.email)}</strong>${Cloud.user.role === 'admin' ? ' (admin)' : ''}. Your workspace syncs automatically; changes made offline sync when you're back online.</p>
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
          </div>
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
    if (!Cloud.user || Cloud.user.role !== 'admin') {
      main.innerHTML = `<div class="page"><div class="card"><p class="empty-hint">${Cloud.isAuthed ? 'This page is for administrators only.' : 'Sign in with an admin account to view this page.'}</p></div></div>`;
      return;
    }
    main.innerHTML = '<div class="page"><p class="empty-hint">Loading analytics…</p></div>';
    let stats, usersRes;
    try {
      [stats, usersRes] = await Promise.all([Cloud.admin.stats(), Cloud.admin.users()]);
    } catch (err) {
      main.innerHTML = `<div class="page"><div class="card"><p class="empty-hint">Could not load admin data: ${esc(err.message)}</p></div></div>`;
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
                  <td data-label="Role"><span class="pill ${u.role === 'admin' ? 'pill-accent' : ''}">${esc(u.role)}</span></td>
                  <td data-label="Status">${u.disabled ? '<span class="pill pill-danger">disabled</span>' : '<span class="pill pill-ok">active</span>'}</td>
                  <td data-label="Modules" class="td-num">${u.moduleCount}</td>
                  <td data-label="Records" class="td-num">${u.recordCount}</td>
                  <td data-label="Joined">${fmtWhen(u.createdAt)}</td>
                  <td data-label="Last active">${fmtWhen(u.lastActiveAt)}</td>
                  <td data-label="Actions" class="admin-actions">
                    ${u.id === Cloud.user.id ? '<span class="muted">you</span>' : `
                      <button class="icon-btn" data-act="role" data-id="${u.id}" data-role="${u.role === 'admin' ? 'user' : 'admin'}" title="${u.role === 'admin' ? 'Demote to user' : 'Promote to admin'}">${icon(u.role === 'admin' ? 'user' : 'shield-check', 15)}</button>
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

  function route() {
    closeSidebar();
    closeModal();
    const hash = location.hash.replace(/^#\/?/, '');
    const [section, id] = hash.split('/');
    renderSidebar();
    if (section === 'm' && id) renderModule(id);
    else if (section === 'settings') renderSettings();
    else if (section === 'admin') renderAdmin();
    else renderDashboard();
  }

  async function init() {
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

    await Cloud.init(fullState);
    if (Cloud.isAuthed) {
      await reconcileWithCloud();
      await loadModules();
    }

    const params = new URLSearchParams(location.search);
    if (params.get('auth_error')) {
      toast(params.get('auth_error') === 'disabled' ? 'This account has been disabled' : 'Sign-in failed — please try again');
      history.replaceState(null, '', location.pathname + location.hash);
    }

    window.addEventListener('hashchange', route);
    $('#add-module-btn').addEventListener('click', () => openBuilder(null));
    $('#install-btn').addEventListener('click', promptInstall);
    $('#menu-btn').addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
    $('#scrim').addEventListener('click', closeSidebar);
    updateOnlineBadge();
    route();

    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('sw.js');
      } catch (err) {
        console.warn('Service worker registration failed:', err);
      }
    }
  }

  init();
})();
