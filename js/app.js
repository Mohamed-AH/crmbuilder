/*
 * app.js — routing, views, and interactions for CRM Builder.
 * Depends on DB (db.js), TEMPLATES (templates.js), icon() (icons.js), Cloud (cloud.js).
 */
/* global DB, TEMPLATES, icon, LUCIDE, Cloud, Scope */
(() => {
  'use strict';

  // ---------------------------------------------------------------- state
  let modules = [];
  const viewState = new Map(); // moduleId -> { q: '', view: 'table'|'kanban' }
  let deferredInstall = null;

  // Settings and the local snapshot belong to a workspace, not to the browser,
  // so they are addressed through Scope. Reading them at module scope is safe:
  // Scope resolves synchronously from the last known identity, which is what
  // keeps the first paint immediate.
  const DEFAULT_SETTINGS = { currency: 'USD', businessName: '' };
  let SETTINGS = { ...DEFAULT_SETTINGS };
  function loadSettingsFromScope() {
    SETTINGS = { ...DEFAULT_SETTINGS };
    try { SETTINGS = { ...SETTINGS, ...(JSON.parse(Scope.get('settings')) || {}) }; } catch { /* fresh */ }
    return SETTINGS;
  }
  if (Scope.needsLegacyMigration()) Scope.migrateLegacyKeys();
  loadSettingsFromScope();

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

  const ROLE_LABELS = {
    platformAdmin: 'platform admin', owner: 'owner', member: 'member',
    contributor: 'contributor', viewer: 'viewer',
  };
  // What each rung adds, said in the terms an owner actually decides in.
  const ROLE_BLURB = {
    owner: 'Everything, including modules, invites and the team',
    member: 'Add, edit and delete records',
    contributor: 'Add and edit records, but not delete them',
    viewer: 'Read only',
  };

  /*
   * May this person change the shape of the workspace?
   *
   * Mirrors canEditSchema() on the server, which is the one that actually
   * decides — this only keeps members from being offered a button whose effect
   * would be undone a second later. Nobody signed in owns their own workspace,
   * so signed out is allowed: the anonymous scope has no team to protect.
   */
  const canEditSchema = () => !Cloud.isAuthed
    || !Cloud.user
    || Cloud.user.role === 'owner'
    || Cloud.user.role === 'platformAdmin';

  // Same rule, one rung lower each time. Signed out is always allowed: the
  // anonymous scope has no team to protect.
  const myRole = () => (Cloud.isAuthed && Cloud.user ? Cloud.user.role : null);
  const canEditRecords = () => myRole() !== 'viewer';
  const canDeleteRecords = () => myRole() !== 'viewer' && myRole() !== 'contributor';

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

  function fmtBytes(n) {
    if (n == null || Number.isNaN(Number(n))) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let v = Number(n);
    let i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
    return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
  }

  /*
   * How much of an organisation's stored bytes are tombstones.
   *
   * The size column alone cannot tell a heavy tenant from a scarred one, and
   * the two want opposite responses: one is a customer worth talking to about
   * their plan, the other is a workspace that has loaded and cleared the demo
   * data a few times and will shrink on its own. The storage alerts (§25) fire
   * on the figure that conflates them, so the split belongs beside the total.
   *
   * Rendered as a qualifier on the number rather than a column of its own: it
   * is meaningless without the total it qualifies, and the table is already
   * seven columns wide.
   *
   * Silent below 10%. Every workspace that has ever deleted anything carries
   * some, and a "2% reclaimable" on every row is noise that trains the eye to
   * skip the cell — which costs the reading the 50% case exists for.
   */
  function reclaimable(o, days) {
    if (!o || !o.bytes || !o.deadBytes) return '';
    const pct = Math.round((o.deadBytes / o.bytes) * 100);
    if (pct < 10) return '';
    const expires = o.oldestDeletedAt ? fmtWhen(Number(o.oldestDeletedAt) + days * 86400000) : null;
    // Says what it is, not only how much. "Reclaimable" alone reads as waste
    // somebody should go and clear up, and there is no such button (§26).
    const why = `${fmtBytes(o.deadBytes)} of this is deleted rows, kept so devices that were offline learn about the delete.`
      + ` Not recoverable, and it frees itself after ${days} days.`
      + (expires ? ` The oldest expires ${expires}.` : '');
    return `<div class="cell-sub" title="${esc(why)}">${pct}% reclaimable</div>`;
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

  const fmtWhen = (ts) => (ts ? new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

  const APP_VERSION = 'crmbuilder-v10';

  /*
   * The last few things that went wrong, kept for a bug report.
   *
   * A tester who says "it broke" and a tester who says "it broke, and here is
   * the exception" are hours apart. Bounded to ten so it cannot grow, and it
   * wraps console.error rather than replacing it so nothing stops appearing in
   * devtools.
   */
  const recentErrors = [];
  function noteError(what) {
    recentErrors.push(`${new Date().toISOString().slice(11, 19)} ${what}`.slice(0, 400));
    if (recentErrors.length > 10) recentErrors.shift();
  }
  const realConsoleError = console.error.bind(console);
  console.error = (...args) => {
    try { noteError(args.map((a) => (a && a.stack) || String(a)).join(' ')); } catch { /* never break logging */ }
    realConsoleError(...args);
  };
  window.addEventListener('error', (e) => noteError(`uncaught: ${e.message} (${e.filename}:${e.lineno})`));
  window.addEventListener('unhandledrejection', (e) => noteError(`unhandled rejection: ${e.reason && e.reason.message ? e.reason.message : e.reason}`));

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
    return `<a href="${href}" ${href.startsWith('http') ? 'target="_blank" rel="noopener"' : ''}>${esc(text)}</a>`;
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
    Scope.set('lastEdit', String(Date.now()));
    try {
      const state = await fullState();
      // The snapshot exists to survive IndexedDB eviction. Sample data is not
      // worth spending the localStorage quota on — it can always be seeded
      // again — and leaving it out keeps the mirror close to what the user
      // would actually miss.
      Scope.set('snapshot', JSON.stringify({
        modules: state.modules.filter((m) => !m._demo),
        records: state.records.filter((r) => !r._demo),
        settings: state.settings,
        at: Date.now(),
      }));
    } catch { /* quota — IndexedDB is still the primary local store */ }
    Cloud.schedulePush();
  }


  function saveSettings() {
    Scope.set('settings', JSON.stringify(SETTINGS));
    Scope.set('settingsAt', String(Date.now()));
    persist();
  }

  /*
   * Replace the whole local workspace.
   *
   * `tombstone` marks whatever is being displaced as deleted rather than just
   * dropping it, so the other devices on the account learn about it. `stamp`
   * re-dates the incoming rows to now — an explicit restore is a deliberate
   * act and should win the next sync, even though the backup file's own
   * timestamps are older than what is on the server.
   */
  /*
   * `mode` is what the caller means by "import", and there are three of them.
   *
   *   merge    put the incoming rows, touch nothing else
   *   replace  tombstone whatever is not in the file, so the removal travels
   *   adopt    hard-clear first, for a local store being seeded from scratch
   *
   * They were two before, and the pair did not include a merge: the flag was
   * `tombstone`, and turning it off took the other branch — a hard `DB.clear`.
   * So "do not broadcast deletions" and "do not delete anything" looked like
   * one option and were not; the gentle-sounding one still emptied the device.
   * Naming the three is what stops that being rediscovered.
   */
  /*
   * A clock per field, advanced only for the fields that actually moved.
   *
   * This is what lets two people edit different fields of one record and both
   * keep their edit — the server merges key by key on these (see mergeFields).
   * Only changed keys advance, so a record nobody has edited since it was
   * created carries no map at all and costs nothing; the map grows one entry
   * at a time, and only for contested fields.
   *
   * A key the user cleared is still a change and still gets a clock. A key
   * REMOVED from the schema is handled by the purge path, which clocks its
   * removals for the same reason — otherwise a stale copy would put the value
   * back on the next sync.
   */
  function stampChangedFields(previous, nextData, at) {
    const clocks = { ...((previous && previous.fieldsAt) || {}) };
    const before = (previous && previous.data) || {};
    const keys = new Set([...Object.keys(before), ...Object.keys(nextData)]);
    for (const key of keys) {
      const was = before[key];
      const now = nextData[key];
      // Absent and empty are the same thing to a user who cleared a box, and
      // treating them as different would stamp a clock on every save.
      const same = (was === now) || ((was === undefined || was === '') && (now === undefined || now === ''));
      if (!same) clocks[key] = at;
    }
    return clocks;
  }

  async function importState({ modules: mods, records, settings }, { mode = 'merge', stamp = false } = {}) {
    const now = Date.now();
    const incoming = new Set([...(mods || []).map((m) => m && m.id), ...(records || []).map((r) => r && r.id)]);

    if (mode === 'replace') {
      // Tombstones, not a clear: the point of replacing is that the workspace
      // ends up matching the file everywhere, which means the removals sync.
      for (const kind of ['records', 'modules']) {
        for (const row of await DB.getAll(kind)) {
          if (!incoming.has(row.id)) await DB.delete(kind, row.id, now);
        }
      }
    } else if (mode === 'adopt') {
      await DB.clear('records');
      await DB.clear('modules');
    }

    for (const m of mods || []) await DB.put('modules', stamp ? { ...m, updatedAt: now } : m);
    for (const r of records || []) await DB.put('records', stamp ? { ...r, updatedAt: now } : r);
    if (settings && typeof settings === 'object') {
      SETTINGS = { ...SETTINGS, ...settings };
      Scope.set('settings', JSON.stringify(SETTINGS));
      if (stamp) Scope.set('settingsAt', String(now));
    }
    await loadModules();
    relationNameCache.clear();
  }

  // ------------------------------------------------------------ delta sync
  // The two hooks Cloud drives. Everything here speaks in single records:
  // what changed locally since our last accepted push, and how to fold in
  // what changed elsewhere.

  const rowClock = (r) => r.updatedAt || r.deletedAt || r.createdAt || 0;

  async function localChanges(since) {
    const [mods, recs] = await Promise.all([DB.getAllRaw('modules'), DB.getAllRaw('records')]);
    let highWater = since;

    // `>=`, not `>`: several rows can share a millisecond, and a strict
    // comparison would strand every one of them that isn't the last. Re-sending
    // the boundary row costs nothing — the server's tie-break skips it.
    const pick = (rows) => rows.filter((r) => r && rowClock(r) >= since).map((r) => {
      const at = rowClock(r);
      if (at > highWater) highWater = at;
      return r.deletedAt
        ? { id: r.id, updatedAt: at, deleted: true, deletedAt: r.deletedAt }
        : { id: r.id, updatedAt: at, doc: r };
    });

    const modules_ = pick(mods);
    const records_ = pick(recs);
    const settingsAt = Number(Scope.get('settingsAt')) || 0;
    if (settingsAt > highWater) highWater = settingsAt;

    return {
      modules: modules_,
      records: records_,
      // Only settings this device has actually chosen. Defaults have a clock
      // of 0 and must never be offered as an edit — a device signing in for
      // the first time would otherwise push its blank defaults at a workspace
      // that already has real ones.
      settings: settingsAt > 0 && settingsAt >= since ? SETTINGS : undefined,
      settingsUpdatedAt: settingsAt,
      highWater,
    };
  }

  /*
   * Writes the server refused, applied as the truth.
   *
   * Deliberately NOT last-write-wins. The local row is a tombstone or an edit
   * stamped later than the server's copy, so the ordinary rule would keep it
   * and push it again on every sync, forever. A refusal is the server saying
   * "this is what the row is", and it is taken at its word — including the
   * local clock, so the reverted row falls behind the push watermark and stops
   * being offered.
   *
   * Returns what was refused so the caller can explain it, which is the whole
   * difference between this reading as a rule and reading as a bug.
   */
  async function applyRejections(rejected) {
    const undone = [];
    for (const kind of ['modules', 'records']) {
      for (const item of rejected[kind] || []) {
        if (!item || !item.id) continue;
        const local = await DB.getRaw(kind, item.id);
        if (local) console.warn('Change refused by the server, reverting:', kind, item.id, local);
        if (item.absent || item.deleted) {
          // Nothing on the server to restore. Removed outright rather than
          // tombstoned: a tombstone would be pushed, refused, and revert
          // again on every single sync.
          await DB.purge(kind, item.id);
        } else {
          await DB.put(kind, { ...item.doc, id: item.id, updatedAt: item.updatedAt, createdBy: item.createdBy || null });
        }
        undone.push({
          kind, id: item.id,
          name: (item.doc && item.doc.name) || (local && local.name) || null,
          // Why the server said no. It knows; this client's own role may be
          // stale, which is exactly when this fires.
          reason: item.reason || null,
        });
      }
    }
    if (undone.length) relationNameCache.clear();
    return undone;
  }

  async function mergeChanges(remote) {
    let changed = 0;

    for (const kind of ['modules', 'records']) {
      for (const item of remote[kind] || []) {
        if (!item || !item.id) continue;
        const local = await DB.getRaw(kind, item.id);
        // Last-write-wins, per row. A tie keeps what is already here: the two
        // sides agree often enough (a row we just pushed) that rewriting on
        // equality would churn the store for nothing.
        if (local && rowClock(local) >= item.updatedAt) continue;
        if (item.deleted) {
          const at = item.deletedAt || item.updatedAt;
          if (local) await DB.delete(kind, item.id, at);
          // A tombstone for something never seen here still has to be stored:
          // the row may arrive from a third device later, out of order.
          else await DB.put(kind, { id: item.id, deletedAt: at, updatedAt: at });
        } else {
          await DB.put(kind, {
            ...item.doc, id: item.id, updatedAt: item.updatedAt, createdBy: item.createdBy || null,
          });
        }
        changed += 1;
      }
    }

    if (remote.settings && remote.settings.doc) {
      const localAt = Number(Scope.get('settingsAt')) || 0;
      if ((remote.settings.updatedAt || 0) > localAt) {
        SETTINGS = { ...SETTINGS, ...remote.settings.doc };
        Scope.set('settings', JSON.stringify(SETTINGS));
        Scope.set('settingsAt', String(remote.settings.updatedAt));
        changed += 1;
      }
    }

    // Refusals last, so they overwrite whatever the ordinary merge just wrote
    // and the two cannot fight over the same row.
    const undone = remote.rejected ? await applyRejections(remote.rejected) : [];
    if (undone.length) changed += undone.length;

    if (changed) relationNameCache.clear();
    // Reported from here rather than from the caller, because every path that
    // syncs comes through this function — boot, the debounced push after an
    // edit, and "Sync now" — and a refusal that repainted silently on two of
    // them would be exactly the bug report this is meant to prevent.
    if (undone.length) await reportRejections(undone);

    /*
     * A paused workspace, said once rather than every sync.
     *
     * Every path that syncs comes through here, and the debounced push after
     * each keystroke comes through here too — so without the latch this would
     * toast continuously while somebody typed, which is how a clear
     * explanation turns into noise people click past.
     */
    if (remote.readOnly && !readOnlyNotified) {
      readOnlyNotified = true;
      toast(remote.readOnlyReason || 'This workspace is paused — your changes are not being saved');
    } else if (!remote.readOnly && readOnlyNotified) {
      readOnlyNotified = false;
      toast('Saving again — your workspace is back');
    }
    return changed;
  }

  // Latched so the message lands once when it starts and once when it stops.
  let readOnlyNotified = false;

  /*
   * Explain a refusal, after it has landed on screen.
   *
   * Order matters: repaint first, then speak. A message that arrives before
   * the screen changes leaves the reader watching their work disappear a beat
   * after being told it would — worse than either half alone.
   */
  async function reportRejections(undone) {
    await loadModules();
    if (!$('#modal-root').firstChild) route();

    /*
     * Say which rule stopped it, not just that something was undone.
     *
     * The case this exists for is someone who made the change offline while
     * they still could and was demoted before reconnecting: their work
     * legitimately vanishes, and a named reason is the difference between a
     * rule and a bug report. Modules are named first because losing a schema
     * change is the more startling of the two.
     */
    const mod = undone.find((r) => r.kind === 'modules');
    if (mod) {
      toast(mod.name
        ? `Only an owner can change module fields — ${mod.name} was restored`
        : 'Only an owner can change modules — your change was undone');
      return;
    }
    const records = undone.filter((r) => r.kind === 'records');
    const n = records.length;
    const what = n === 1 ? 'change' : `${n} changes`;
    const readOnly = records.some((r) => r.reason === 'readonly');
    toast(readOnly
      ? `Your account is read-only here — your ${what} to the records was undone`
      : `Only a member can delete records — your ${what} was undone`);
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

  /*
   * A second layer on top of an open modal, without destroying it.
   *
   * openModal() replaces the whole of #modal-root, so using it to ask a
   * question from inside the module builder would throw the builder away —
   * and "Cancel" would then lose every unsaved edit rather than returning to
   * them. This appends instead, and closeNested() takes down only the layer it
   * added. A global closeModal() still clears both, which is what Escape
   * should do.
   */
  function openNestedModal(html) {
    const root = $('#modal-root');
    const layer = document.createElement('div');
    layer.className = 'modal-backdrop';
    layer.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    root.appendChild(layer);
    const first = $('.modal button, .modal input', layer);
    if (first) first.focus();
    return layer;
  }

  function closeNested(layer) {
    if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
  }

  function closeModal() {
    const root = $('#modal-root');
    root.innerHTML = '';
    document.body.classList.remove('modal-open');
    // A modal that answers a question can be dismissed by Escape or a click on
    // the backdrop, neither of which goes through its buttons. Without this a
    // promise-returning prompt simply never settles and its caller waits for
    // ever. Fired on #modal-root because that element is static in index.html
    // and outlives the modal it just removed.
    root.dispatchEvent(new CustomEvent('crmb:modal-closed'));
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
      <a href="#/m/${esc(m.id)}" class="nav-link ${current === `#/m/${m.id}` ? 'active' : ''}">
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
    if (signinBtn) signinBtn.addEventListener('click', () => openSignIn());

    $('#workspace-name').textContent = SETTINGS.businessName || 'CRM Builder';
    $('#workspace-name-mini').textContent = SETTINGS.businessName || 'CRM Builder';
  }

  Cloud.onStatus(() => {
    const area = $('#user-area');
    if (area) {
      area.innerHTML = syncStatusHTML();
      const signinBtn = $('#signin-btn');
      if (signinBtn) signinBtn.addEventListener('click', () => openSignIn());
    }
  });

  function closeSidebar() {
    document.body.classList.remove('sidebar-open');
  }

  // ---------------------------------------------------------------- sign in
  /*
   * Why the sign-in did not become an account.
   *
   * Worth a screen rather than a toast: the person did nothing wrong, they are
   * probably confused, and the useful thing to tell them is that the product
   * they were about to try still works without an account at all.
   */
  function explainClosedSignup(reason) {
    // Already on the list. Nothing to ask for, and saying "invite-only" to
    // someone who asked last week reads as having been ignored.
    if (reason === 'pending') {
      const waiting = openModal(`
        <div class="modal-head">
          <h2>You are on the list</h2>
          <button class="icon-btn" data-close aria-label="Close">${icon('x', 16)}</button>
        </div>
        <div class="modal-body">
          <p class="settings-hint">We have your request and we are working through them by hand. When it is your turn, signing in with the same Google account is all it takes — there is nothing else to do and nothing to wait for in your inbox.</p>
          <p class="settings-hint"><strong>Meanwhile the whole thing works without an account.</strong> Anything you build on this device is yours to keep, and it comes with you when you do get in.</p>
        </div>
        <div class="modal-foot claim-actions">
          <button class="btn btn-primary" data-close>Carry on</button>
        </div>`);
      $$('[data-close]', waiting).forEach((b) => b.addEventListener('click', closeModal));
      return;
    }

    const modal = openModal(`
      <div class="modal-head">
        <h2>${reason === 'closed' ? 'Signups are paused' : 'This is a private beta'}</h2>
        <button class="icon-btn" data-close aria-label="Close">${icon('x', 16)}</button>
      </div>
      <div class="modal-body">
        <p class="settings-hint">${reason === 'closed'
    ? 'New accounts are paused while we work through the current round of testing.'
    : 'Accounts are invite-only for now. If someone sent you a link with a code in it, open that link and sign in from there.'}</p>
        <p class="settings-hint"><strong>You can still use the whole thing without an account.</strong> Everything on this device works offline — modules, records, import, export. An account only adds syncing between devices and sharing with a team, and you can bring your work with you if you get one later.</p>
        <div id="ask-block">
          <div class="form-row">
            <label for="ask-note">Want in? Tell us what you would use it for <span class="muted">(optional)</span></label>
            <textarea class="input" id="ask-note" rows="2" placeholder="e.g. I run a two-person landscaping business and track jobs in a spreadsheet"></textarea>
          </div>
        </div>
      </div>
      <div class="modal-foot claim-actions">
        <button class="btn" data-close>Keep looking around</button>
        <button class="btn btn-primary" id="ask-send">${icon('user-plus', 15)} Ask to join the beta</button>
      </div>`);
    $$('[data-close]', modal).forEach((b) => b.addEventListener('click', closeModal));

    const send = $('#ask-send', modal);
    if (send) {
      send.addEventListener('click', async () => {
        send.disabled = true;
        send.textContent = 'Sending…';
        try {
          await Cloud.requestAccess($('#ask-note', modal).value.trim());
          // Deliberately the same wording whatever came back. The server says
          // "received" for a decision already made, and re-litigating that on
          // screen would tell someone they were turned down — which starts an
          // argument and helps nobody.
          $('#ask-block', modal).innerHTML = `<p class="settings-hint"><strong>Asked.</strong> We go through these by hand. When you are in, signing in with the same Google account is all it takes — nothing will arrive in your inbox that you need to click.</p>`;
          send.remove();
        } catch (err) {
          send.disabled = false;
          send.textContent = 'Ask to join the beta';
          // The ten-minute window on the refusal cookie can lapse while the
          // screen sits open, and "try signing in again" is the actual fix.
          toast(err && err.status === 403
            ? 'That took a while — sign in again and we will offer this straight away'
            : 'Could not send that just now — try again in a moment');
        }
      });
    }
  }

  /*
   * Report a problem, with the context already filled in.
   *
   * Only offered when signed in: a report from nobody is a report nobody can
   * follow up. Someone anonymous is told what to do instead rather than being
   * shown a form that will not work.
   */
  async function openProblemReport() {
    if (!Cloud.isAuthed) {
      toast('Sign in first so we can follow up on your report');
      return;
    }

    let counts = { modules: 0, records: 0 };
    try {
      counts = { modules: (await DB.getAll('modules')).length, records: (await DB.getAll('records')).length };
    } catch { /* storage is exactly what might be broken */ }

    const context = {
      version: APP_VERSION,
      route: location.hash || '#/',
      userAgent: navigator.userAgent,
      syncStatus: Cloud.status,
      online: navigator.onLine,
      ...counts,
      errors: [...recentErrors],
    };

    const modal = openModal(`
      <div class="modal-head">
        <h2>Report a problem</h2>
        <button class="icon-btn" data-close aria-label="Close">${icon('x', 16)}</button>
      </div>
      <div class="modal-body">
        <div class="form-row">
          <label for="report-text">What happened?</label>
          <textarea class="input" id="report-text" rows="5" placeholder="What you were doing, and what it did instead."></textarea>
        </div>
        <p class="settings-hint">
          Sent with this: version ${esc(context.version)}, screen <code>${esc(context.route)}</code>,
          sync ${esc(context.syncStatus)}, ${context.modules} module(s) and ${context.records} record(s),
          your browser, and ${context.errors.length} recent error${context.errors.length === 1 ? '' : 's'}.
          <strong>Your records are not included.</strong>
        </p>
      </div>
      <div class="modal-foot claim-actions">
        <button class="btn btn-primary" id="report-send">Send report</button>
      </div>`);
    $$('[data-close]', modal).forEach((b) => b.addEventListener('click', closeModal));

    $('#report-send', modal).addEventListener('click', async () => {
      const message = $('#report-text', modal).value.trim();
      if (!message) {
        toast('Say what went wrong first');
        return;
      }
      try {
        await Cloud.feedback.send(message, context);
        closeModal();
        toast('Thanks — report sent');
      } catch (err) {
        toast(err.message || 'Could not send that report');
      }
    });
  }

  /*
   * Say what a free beta means, once, and remember that we did.
   *
   * Shown after the first successful sign-in rather than before it: someone
   * who has not decided to have an account yet does not need a warning about
   * an account. The acknowledgement goes to the server, so it survives a new
   * device and is answerable later.
   */
  async function showBetaNoticeIfNeeded() {
    if (!Cloud.isAuthed || !Cloud.user) return;
    // Only on an answer the server actually gave, so the test is for a mode
    // that gates signups rather than for "not open". Offline, /api/me never
    // resolves and signupMode is absent; reading that absence as "not open"
    // put a modal over the app of anyone working with the connection down and
    // asked them to acknowledge something we could not record. Same rule as
    // §13 — and note Cloud.me.serverAvailable is not the signal here, since
    // offlineIdentity() sets it from the cached auth flag.
    if (Cloud.me.signupMode !== 'code' && Cloud.me.signupMode !== 'closed') return;
    if (Cloud.user.betaAcceptedAt) return;

    await new Promise((resolve) => {
      const modal = openModal(`
        <div class="modal-head"><h2>Welcome to the beta</h2></div>
        <div class="modal-body">
          <p class="settings-hint">Thanks for testing this. Two things worth knowing before you put real work in:</p>
          <ul class="beta-points">
            <li><strong>Keep your own backup.</strong> We take one every day, so the realistic worst case is losing a day. Settings → Export backup gives you everything as a file, any time.</li>
            <li><strong>It may be slow to wake.</strong> The first visit after a quiet spell can take up to a minute to sign in. The app itself always loads instantly from your device.</li>
          </ul>
          <p class="settings-hint">Found something broken? <strong>Settings → Report a problem</strong> sends it with the details we need. That is the whole point of the beta.</p>
          <p class="settings-hint"><a href="/privacy" target="_blank" rel="noopener">Privacy</a> · <a href="/terms" target="_blank" rel="noopener">Terms</a></p>
        </div>
        <div class="modal-foot claim-actions">
          <button class="btn btn-primary" id="beta-ok">Got it</button>
        </div>`);
      $('#beta-ok', modal).addEventListener('click', () => {
        closeModal();
        resolve();
      });
    });

    try {
      await Cloud.acceptBeta();
      if (Cloud.user) Cloud.user.betaAcceptedAt = Date.now();
    } catch {
      // Offline, or the server is asleep. Shown again next time rather than
      // silently treated as accepted.
    }
  }

  // Whatever the signup gate needs to see, in one place so the two entry
  // points cannot drift apart.
  function authQuery(overrideCode) {
    const params = new URLSearchParams();
    const code = overrideCode === undefined ? betaCode() : overrideCode;
    if (code) params.set('beta', code);
    if (pendingInvite()) params.set('invite', pendingInvite());
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }

  function openSignIn({ signUp = false } = {}) {
    const { googleEnabled, devLoginEnabled } = Cloud.me;
    // Only asked for when the deployment actually gates signups.
    const needsCode = Cloud.me.signupMode === 'code';
    // Someone holding an invite is here to create an account, not to return to
    // one. Same single Google button either way — only the framing moves.
    //
    // Open signups do NOT imply this on their own: the sidebar's "Sign in to
    // sync" is pressed by returning users all day, and titling their modal
    // "Create your account" would be wrong for them. So the intent comes from
    // the caller that knows it — the onboarding button — and an invite in hand
    // is the one signal strong enough to stand on its own.
    const signingUp = !Cloud.isAuthed && (signUp || !!betaCode());
    const modal = openModal(`
      <div class="modal-head">
        <h2>${signingUp ? 'Create your account' : 'Sign in'}</h2>
        <button class="icon-btn" data-close aria-label="Close">${icon('x', 16)}</button>
      </div>
      <div class="modal-body">
        <p class="settings-hint">${signingUp
    ? 'Your account is created the first time you continue with Google — there is no separate form. It saves this CRM so you can open it on your phone too, and share it with colleagues.'
    : 'Sign in to save your CRM to your account and access it from any device. Your data also always stays available on this device.'}</p>
        ${googleEnabled ? `
          <a class="btn btn-google btn-block" href="/auth/google${authQuery()}" id="google-signin">
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
        ${needsCode ? `
          <div class="form-row">
            <label for="beta-code">Beta code</label>
            <input class="input" id="beta-code" type="text" placeholder="Paste the code you were sent" value="${esc(betaCode())}">
            <p class="settings-hint">Only needed the first time, to create your account. Already have one? Leave it blank.</p>
          </div>` : ''}
        ${!googleEnabled && !devLoginEnabled ? '<p class="empty-hint">Sign-in is not configured on this server. See DEPLOYMENT.md to enable Google OAuth.</p>' : ''}
      </div>
      <div class="modal-foot"><span class="settings-hint" style="margin:0">We only use your email to identify your workspace.</span></div>`);
    $$('[data-close]', modal).forEach((b) => b.addEventListener('click', closeModal));
    // The round trip to Google comes back as a fresh page load, and the last
    // known identity on this device may be somebody else's. Tell boot not to
    // trust it, so nobody's workspace flashes up for the wrong person.
    const codeField = $('#beta-code', modal);
    const google = $('#google-signin', modal);
    if (google) {
      google.addEventListener('click', (e) => {
        Scope.markSignInPending();
        // A code typed in just now has to reach the redirect, which was built
        // when the modal opened.
        const typed = codeField ? codeField.value.trim() : '';
        if (typed) {
          e.preventDefault();
          try { localStorage.setItem(BETA_KEY, typed); } catch { /* private mode */ }
          location.href = `/auth/google${authQuery(typed)}`;
        }
      });
    }
    const form = $('#dev-login-form', modal);
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await Cloud.devLogin($('#dev-email', modal).value.trim(), '', codeField ? codeField.value.trim() : betaCode(), pendingInvite());
          Scope.markSignInPending();
          location.reload(); // boot re-runs and reconciles local vs cloud data
        } catch (err) {
          // A gated refusal is a screen, not a toast — and the same screen the
          // Google path gets, since the server ran the identical check and has
          // already handed over the right to ask.
          if (err.reason === 'beta' || err.reason === 'closed' || err.reason === 'pending') {
            closeModal();
            explainClosedSignup(err.reason);
            return;
          }
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
                    <a href="#/m/${esc(mod.id)}" class="recent-item">
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

  /*
   * The door for someone who does not have an account yet.
   *
   * There is no separate signup: upsertUser creates the account on the first
   * successful callback, so signing up and signing in are one click. That is
   * fine for the plumbing and was wrong on the screen — every label said "sign
   * in" and "already have an account?", which is the opposite of true for the
   * one audience the beta gate was built for. Someone arriving on an invite
   * link was being told, by the only affordance on the page, that it was meant
   * for other people.
   *
   * So the label follows the context while the flow stays single-path. Kept
   * below the primary action on purpose: using the whole CRM without an account
   * is the fastest way to understand it, and that has to stay the loudest
   * option on this screen.
   *
   * The question it answers is "can this visitor create an account right now",
   * which is two things and not one. An invite is one way; `open` signups are
   * the other, and keying on the invite alone told every new visitor of an open
   * deployment that the only door was for people who already had an account.
   * Once the beta closes and SIGNUP_MODE goes to `open`, that is everybody.
   */
  const canCreateAccount = () => !!betaCode() || Cloud.me.signupMode === 'open';

  function accountAffordanceHTML() {
    // serverAvailable gates this because a static-hosted or asleep deployment
    // has nothing to sign in to; syncInBackground() repaints once /api/me lands.
    // It also means signupMode below is an answer the server actually gave: an
    // unauthenticated visitor only gets here once /api/me has landed.
    if (!Cloud.me.serverAvailable || Cloud.isAuthed) return '';
    if (!canCreateAccount()) {
      // `code` without an invite, or `closed`: they cannot create an account,
      // so the honest offer is the one for people who already have one.
      return `<button class="btn btn-ghost" id="onboard-signin">${icon('log-in', 15)} Already have an account? Sign in</button>`;
    }
    return `
      <div class="onboard-account">
        <p class="settings-hint">${betaCode()
    ? 'Your beta invite is ready. Creating an account keeps this CRM on your other devices — everything here works without one either way.'
    : 'Creating an account keeps this CRM on your other devices and lets you share it with colleagues — everything here works without one either way.'}</p>
        <button class="btn" id="onboard-signin" data-signup="1">${icon('user-plus', 15)} Create your account</button>
      </div>`;
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
          ${accountAffordanceHTML()}
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
      Scope.set('settings', JSON.stringify(SETTINGS));
      Scope.set('settingsAt', String(Date.now()));
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
    $('#onboard-tour').addEventListener('click', startTourWithConsent);
    const signin = $('#onboard-signin');
    if (signin) signin.addEventListener('click', () => openSignIn({ signUp: signin.dataset.signup === '1' }));
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
      updatedAt: Date.now(),
    };
    await DB.put('modules', mod);
    if (withSamples && t.samples) {
      for (const data of t.samples) {
        const now = Date.now();
        // The module is the user's choice and is real. These rows are ours, so
        // they carry the flag and "Remove sample data" can take them back out
        // without touching anything the user typed into the same module.
        await DB.put('records', { id: uid(), moduleId: mod.id, data: { ...data }, createdAt: now, updatedAt: now, _demo: true });
      }
    }
    return mod;
  }

  // ---------------------------------------------------------------- demo data
  // Builds every template module and fills it with the fictional business in
  // demo-data.js, so a demo or evaluation starts on a CRM that looks used.
  async function loadDemoData({ replace, silent = false }) {
    if (typeof DEMO_DATA === 'undefined') {
      // demo-data.js did not load — usually a stale service-worker cache or an
      // incomplete deploy. Say so; a silent no-op leaves callers guessing.
      toast('Sample data could not be loaded — try reloading the page');
      return false;
    }
    const demo = resolveDemoDates(DEMO_DATA);
    if (replace) {
      // Tombstoned, not cleared: the other devices on this account have to be
      // told the old workspace is gone, or they will push it straight back.
      await DB.softClearAll();
      relationNameCache.clear();
    }
    await loadModules();

    for (const template of TEMPLATES) {
      const rows = demo.records[template.key];
      if (!rows || !rows.length) continue;
      // Reuse a module of the same name if the user already has one.
      let mod = modules.find((m) => m.name.toLowerCase() === template.name.toLowerCase());
      if (!mod) {
        mod = await createFromTemplate(template, false);
        // Created solely to hold the demo business, so it is demo too — unlike
        // a module the user picked at onboarding, which stays theirs.
        mod._demo = true;
        mod.updatedAt = Date.now();
        await DB.put('modules', mod);
      }
      const now = Date.now();
      let i = 0;
      for (const data of rows) {
        i += 1;
        // Stagger updatedAt so "recent activity" has a believable order.
        await DB.put('records', { id: uid(), moduleId: mod.id, data: { ...data }, createdAt: now - i * 60000, updatedAt: now - i * 60000, _demo: true });
      }
    }

    SETTINGS.businessName = demo.businessName;
    SETTINGS.currency = demo.currency;
    Scope.set('demoSettings', JSON.stringify({ businessName: demo.businessName, currency: demo.currency }));
    Scope.set('settings', JSON.stringify(SETTINGS));
    Scope.set('settingsAt', String(Date.now()));

    await loadModules();
    await persist();
    renderSidebar();
    if (!silent) toast('Demo data loaded');
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

  /*
   * Ask before seeding, always.
   *
   * The tour points at a populated pipeline, so an empty workspace needs the
   * sample business first. Nobody gets it without saying yes, and the promise
   * made here — one click to remove it — is kept by Settings.
   */
  async function startTourWithConsent() {
    if (!modules.length) {
      if (typeof DEMO_DATA === 'undefined') {
        toast('Sample data could not be loaded — try reloading the page');
        return;
      }
      const ok = await confirmSampleData({
        title: 'The tour needs something to show',
        body: 'It walks through a small fictional business — a pipeline, contacts, a few deals. Nothing is sent anywhere until you sign in, and you can remove it in one click from Settings.',
        confirm: 'Load the sample business',
      });
      if (!ok) return;
      if (!(await loadDemoData({ replace: false, silent: true }))) return;
    }
    startTour();
  }

  // A yes/no the caller can await. Deliberately not window.confirm: this one
  // has to explain what is about to be written and how to undo it.
  function confirmSampleData({ title, body, confirm }) {
    return new Promise((resolve) => {
      const modal = openModal(`
        <div class="modal-head"><h2>${esc(title)}</h2></div>
        <div class="modal-body"><p class="settings-hint">${esc(body)}</p></div>
        <div class="modal-foot claim-actions">
          <button class="btn btn-ghost" data-consent="no">Not now</button>
          <button class="btn btn-primary" data-consent="yes">${esc(confirm)}</button>
        </div>`);
      $$('[data-consent]', modal).forEach((b) => b.addEventListener('click', () => {
        closeModal();
        resolve(b.dataset.consent === 'yes');
      }));
    });
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
      // Seeding is the CALLER's job now. A walkthrough that quietly fills your
      // workspace with a fictional business is exactly the surprise this flow
      // exists to remove, so by the time the tour starts the data is either
      // already there or the visitor has said yes to it.
      ensureReady: async () => {
        if (modules.length) return { ok: true };
        return { ok: false, reason: 'The tour needs a workspace to walk through.' };
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
            ${canEditRecords() ? `<button class="btn btn-primary" id="add-record-btn">${icon('plus', 15)} Add</button>` : ''}
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
    const addBtn = $('#add-record-btn');
    if (addBtn) addBtn.addEventListener('click', () => openRecord(mod, null));
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
              <tr data-record="${esc(r.id)}" tabindex="0">
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
                  <div class="kanban-card" draggable="true" data-record="${esc(r.id)}">
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
      node.addEventListener('click', async (e) => {
        // Email/phone/URL cells are real links. They used to carry an inline
        // onclick="event.stopPropagation()", which CSP's script-src forbids;
        // the row ignoring clicks that landed on a link does the same job.
        if (e.target.closest('a')) return;
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
        mod.updatedAt = Date.now();
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
        return `<textarea class="input" id="${esc(id)}" name="${esc(field.key)}" rows="4" ${req}>${esc(v)}</textarea>`;
      case 'select':
        return `<select class="input" id="${esc(id)}" name="${esc(field.key)}" ${req}>
          <option value="">—</option>
          ${(field.options || []).map((o) => `<option value="${esc(o)}" ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}
        </select>`;
      case 'checkbox':
        return `<label class="checkbox-line"><input type="checkbox" id="${esc(id)}" name="${esc(field.key)}" ${v ? 'checked' : ''}> ${esc(field.label)}</label>`;
      case 'relation': {
        const relMod = getModule(field.relatedModule);
        if (!relMod) return '<p class="muted">Linked module no longer exists.</p>';
        const relRecords = await DB.recordsByModule(relMod.id);
        relRecords.forEach((r) => relationNameCache.set(r.id, recordName(relMod, r)));
        return `<select class="input" id="${esc(id)}" name="${esc(field.key)}" ${req}>
          <option value="">—</option>
          ${relRecords.map((r) => `<option value="${esc(r.id)}" ${r.id === v ? 'selected' : ''}>${esc(recordName(relMod, r))}</option>`).join('')}
        </select>`;
      }
      case 'number':
      case 'currency':
        return `<input class="input" type="number" step="any" id="${esc(id)}" name="${esc(field.key)}" value="${esc(v)}" ${req}>`;
      case 'date':
        return `<input class="input" type="date" id="${esc(id)}" name="${esc(field.key)}" value="${esc(v)}" ${req}>`;
      case 'email':
        return `<input class="input" type="email" id="${esc(id)}" name="${esc(field.key)}" value="${esc(v)}" ${req}>`;
      case 'phone':
        return `<input class="input" type="tel" id="${esc(id)}" name="${esc(field.key)}" value="${esc(v)}" ${req}>`;
      case 'url':
        return `<input class="input" type="url" id="${esc(id)}" name="${esc(field.key)}" value="${esc(v)}" placeholder="https://" ${req}>`;
      default:
        return `<input class="input" type="text" id="${esc(id)}" name="${esc(field.key)}" value="${esc(v)}" ${req}>`;
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
      <form id="record-form" class="modal-body">${fieldsHTML}${authorHTML(record)}</form>
      <div class="modal-foot">
        ${!isNew && canDeleteRecords() ? `<button class="btn btn-danger-ghost" id="record-delete">${icon('trash-2', 15)} Delete</button>` : '<span></span>'}
        <div class="modal-foot-right">
          <button class="btn btn-ghost" data-close>${canEditRecords() ? 'Cancel' : 'Close'}</button>
          ${canEditRecords() ? '<button class="btn btn-primary" id="record-save">Save</button>' : ''}
        </div>
      </div>`);

    $$('[data-close]', modal).forEach((b) => b.addEventListener('click', closeModal));
    const saveBtn = $('#record-save', modal);
    if (saveBtn) saveBtn.addEventListener('click', async () => {
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
        : { ...record, data: newData, updatedAt: now, fieldsAt: stampChangedFields(record, newData, now) };
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
          ${modules.map((m) => `<option value="${esc(m.id)}" ${f.relatedModule === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
        </select>
      </div>`;
  }

  /*
   * Who added this record.
   *
   * Only worth showing on a shared workspace — on a team of one it is always
   * the reader, and a line saying so is noise. The id is resolved against the
   * member list /api/me already carries.
   */
  function authorHTML(record) {
    if (!record || !record.createdBy) return '';
    const org = Cloud.me.org;
    if (!org || !org.memberCount || org.memberCount < 2) return '';
    const who = (org.members || []).find((m) => m.id === record.createdBy);
    const name = who ? (who.name || who.email) : null;
    if (!name) return '';
    return `<p class="settings-hint record-author">Added by ${esc(name)}</p>`;
  }

  /*
   * Removing a field used to leave its values behind, invisibly.
   *
   * The builder writes `module.fields` and nothing else, so every record kept
   * its `data` keys. Nothing was destroyed — but the person who removed the
   * field believed it was, and those values still travelled in every JSON
   * export, still sat in the admin export, and came back the moment a field
   * with the same label was recreated (`slug()` produces the same key). That
   * is the wrong way round for anyone who removed a column *because* it held
   * something they should not be keeping.
   *
   * Purging is the default, because "deleted" should mean deleted. It is not
   * silent, because a schema change that destroys months of data without
   * saying so is the shape this codebase has just spent a release removing —
   * see the restore path in §21. So: say how many records are affected, and
   * let the answer be no.
   *
   * A rename is not a removal. `existingKey` is carried through the save, so a
   * relabelled field keeps its key and never appears here (§4).
   */
  async function askAboutRemovedFields(mod, nextFields) {
    const keeping = new Set(nextFields.map((f) => f.key));
    const removed = mod.fields.filter((f) => !keeping.has(f.key));
    if (!removed.length) return { proceed: true, keys: [] };

    const records = await DB.recordsByModule(mod.id);
    const holding = removed
      .map((f) => ({
        field: f,
        n: records.filter((r) => {
          const v = r.data ? r.data[f.key] : undefined;
          return v !== undefined && v !== null && v !== '';
        }).length,
      }))
      .filter((x) => x.n > 0);

    // Nothing stored under them: no question worth asking.
    if (!holding.length) return { proceed: true, keys: removed.map((f) => f.key) };

    const names = holding.map((x) => `<li><strong>${esc(x.field.label)}</strong> — ${x.n} record${x.n === 1 ? '' : 's'}</li>`).join('');
    return new Promise((resolve) => {
      // Nested, so cancelling returns to the builder with every edit intact.
      const layer = openNestedModal(`
        <div class="modal-head"><h2>Delete the data in ${holding.length === 1 ? 'this field' : 'these fields'} too?</h2></div>
        <div class="modal-body">
          <p class="settings-hint">You are removing ${holding.length === 1 ? 'a field that holds' : 'fields that hold'} data:</p>
          <ul class="beta-points">${names}</ul>
          <p class="settings-hint"><strong>Delete the values</strong> and they are gone from every record, from future exports, and from your team's devices when this syncs. That cannot be undone.</p>
          <p class="settings-hint"><strong>Keep them</strong> and the column disappears but the data stays in the workspace — it will still appear in a JSON backup, and it comes back if you add a field with the same name later.</p>
        </div>
        <div class="modal-foot claim-actions">
          <button class="btn btn-ghost" data-ghost="cancel">Cancel</button>
          <button class="btn" data-ghost="keep">Keep the data</button>
          <button class="btn btn-primary" data-ghost="purge">Delete the values</button>
        </div>`);

      let answered = false;
      // Escape clears every layer at once, builder included — a global dismiss
      // is still a dismissal, and the save must not proceed on one.
      const onDismiss = () => { if (!answered) { answered = true; resolve({ proceed: false, keys: [] }); } };
      $('#modal-root').addEventListener('crmb:modal-closed', onDismiss, { once: true });
      $$('[data-ghost]', layer).forEach((btn) => btn.addEventListener('click', () => {
        answered = true;
        $('#modal-root').removeEventListener('crmb:modal-closed', onDismiss);
        const choice = btn.dataset.ghost;
        closeNested(layer);
        // Cancel abandons the save and leaves the builder open, so the schema
        // is untouched and nothing the user typed is thrown away.
        if (choice === 'cancel') { resolve({ proceed: false, keys: [] }); return; }
        resolve({ proceed: true, keys: choice === 'purge' ? removed.map((f) => f.key) : [] });
      }));
    });
  }

  /*
   * Take the values out of every record that has one.
   *
   * Every write is issued in the same tick via Promise.all: an IndexedDB
   * transaction commits when the microtask queue drains, so awaiting between
   * puts finds it already closed (§10). Each row is re-stamped, because a row
   * whose updatedAt did not move is a row the sync engine will never send —
   * and then the values would be gone here and still present for everyone else.
   */
  /*
   * The currency setting relabels; it does not convert.
   *
   * That is the right behaviour — this app has no exchange rates and guessing
   * one would be worse than not having it — but it is not what the word
   * "currency" leads people to expect. Switching USD to EUR turns a $10,000
   * deal into a €10,000 deal, and every pipeline total moves with it, silently.
   *
   * Asked only when there is money on the line: with nothing stored in a
   * currency field there is no misreading to prevent, and a dialog over an
   * empty workspace is just noise. Same rule as askAboutRemovedFields.
   */
  async function confirmCurrencyChange(from, to) {
    let amounts = 0;
    for (const mod of modules) {
      const moneyFields = mod.fields.filter((f) => f.type === 'currency');
      if (!moneyFields.length) continue;
      for (const r of await DB.recordsByModule(mod.id)) {
        if (moneyFields.some((f) => Number(r.data && r.data[f.key]))) amounts += 1;
      }
    }
    if (!amounts) return true;

    return new Promise((resolve) => {
      const modal = openModal(`
        <div class="modal-head"><h2>Change the currency to ${esc(to)}?</h2></div>
        <div class="modal-body">
          <p class="settings-hint">This changes how amounts are <strong>labelled</strong>, not what they are worth. Nothing is converted — no exchange rate is applied.</p>
          <p class="settings-hint"><strong>${amounts} record${amounts === 1 ? '' : 's'}</strong> hold an amount. A figure showing as 10,000 ${esc(from)} today will show as 10,000 ${esc(to)} afterwards, and your totals will move with it.</p>
          <p class="settings-hint">If you meant to convert the numbers, export a backup, convert them in a spreadsheet, and import it back.</p>
        </div>
        <div class="modal-foot claim-actions">
          <button class="btn" data-currency="no">Cancel</button>
          <button class="btn btn-primary" data-currency="yes">Relabel as ${esc(to)}</button>
        </div>`);
      let answered = false;
      const onDismiss = () => { if (!answered) { answered = true; resolve(false); } };
      $('#modal-root').addEventListener('crmb:modal-closed', onDismiss, { once: true });
      $$('[data-currency]', modal).forEach((btn) => btn.addEventListener('click', () => {
        answered = true;
        $('#modal-root').removeEventListener('crmb:modal-closed', onDismiss);
        closeModal();
        resolve(btn.dataset.currency === 'yes');
      }));
    });
  }

  async function purgeFieldValues(moduleId, keys) {
    const records = await DB.recordsByModule(moduleId);
    const now = Date.now();
    const touched = records.filter((r) => r.data && keys.some((k) => k in r.data));
    if (!touched.length) return;
    await Promise.all(touched.map((r) => {
      const data = { ...r.data };
      /*
       * The removal is CLOCKED, not just done.
       *
       * Field-level merge resolves each key on its own clock, and a key with
       * no clock counts as never edited — so a colleague still holding the old
       * value would win the merge and quietly put it back on their next sync.
       * Stamping the removal is what makes "deleted" survive a stale copy.
       */
      const fieldsAt = { ...(r.fieldsAt || {}) };
      for (const k of keys) { delete data[k]; fieldsAt[k] = now; }
      return DB.put('records', { ...r, data, fieldsAt, updatedAt: now });
    }));
    relationNameCache.clear();
  }

  function openBuilder(mod) {
    const isNew = !mod;
    const mayEdit = canEditSchema();
    if (isNew && !mayEdit) {
      toast('Only an owner can add modules to this team');
      return;
    }
    const draft = mod || { name: '', icon: 'package', color: MODULE_COLORS[modules.length % MODULE_COLORS.length], fields: [{ label: 'Name', key: 'name', type: 'text', required: true, showInList: true }] };

    const modal = openModal(`
      <div class="modal-head">
        <h2>${isNew ? 'New module' : `${mayEdit ? 'Edit' : ''} ${esc(mod.name)}`.trim()}</h2>
        <button class="icon-btn" data-close aria-label="Close">${icon('x', 16)}</button>
      </div>
      <div class="modal-body${mayEdit ? '' : ' builder-readonly'}">
        <div class="form-row">
          <label for="b-name">Module name <span class="req">*</span></label>
          <input class="input" id="b-name" type="text" placeholder="e.g. Projects, Invoices, Equipment" value="${esc(draft.name)}" ${mayEdit ? 'required' : 'readonly'}>
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
          ${mayEdit ? `<button class="btn btn-ghost" id="b-add-field">${icon('plus', 15)} Add field</button>` : ''}
        </div>
      </div>
      <div class="modal-foot">
        ${!isNew && mayEdit ? `<button class="btn btn-danger-ghost" id="b-delete">${icon('trash-2', 15)} Delete module</button>` : '<span></span>'}
        <div class="modal-foot-right">
          ${mayEdit ? '' : '<span class="settings-hint" style="margin:0">Only an owner can change module fields</span>'}
          <button class="btn btn-ghost" data-close>${mayEdit ? 'Cancel' : 'Close'}</button>
          ${mayEdit ? `<button class="btn btn-primary" id="b-save">${isNew ? 'Create module' : 'Save changes'}</button>` : ''}
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
    const addFieldBtn = $('#b-add-field', modal);
    if (addFieldBtn) addFieldBtn.addEventListener('click', () => {
      fieldsBox.insertAdjacentHTML('beforeend', builderFieldRowHTML({ type: 'text' }, Date.now()));
    });

    const saveBtn = $('#b-save', modal);
    if (saveBtn) saveBtn.addEventListener('click', async () => {
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
      // Decided before the module is written, so cancelling here leaves the
      // schema exactly as it was rather than half-applied.
      const purge = mod ? await askAboutRemovedFields(mod, fields) : { proceed: true, keys: [] };
      if (!purge.proceed) return;

      const saved = {
        ...(mod || { id: uid(), createdAt: Date.now(), defaultView: 'table' }),
        name,
        icon: iconName,
        color,
        fields,
        // Per-record sync selects by this. A module without one would look
        // unchanged forever and never leave the device.
        updatedAt: Date.now(),
      };
      await DB.put('modules', saved);
      if (purge.keys.length) await purgeFieldValues(saved.id, purge.keys);
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
    let allModules = [];
    let storageOk = true;
    try {
      allRecords = await DB.getAll('records');
      allModules = await DB.getAll('modules');
    } catch (err) {
      storageOk = false;
      console.error('Could not read records for Settings:', err);
    }
    // Offered for as long as any seeded row survives, in any scope — including
    // an account the samples were deliberately brought into. "Easy to discard"
    // has to keep being true after sign-in, not only before it.
    const demoRecords = allRecords.filter((r) => r._demo).length;
    const demoModules = allModules.filter((m) => m._demo).length;
    const demoCount = demoRecords + demoModules;
    /*
     * Say what the number counts, because it is not the number above it.
     *
     * The header on this screen reads "6 modules · 214 records" and this
     * button read "(220)". Both were right — the button totals everything it
     * will remove, records AND modules — and side by side they read as a
     * discrepancy in the data. It was reported as one.
     *
     * Not solved by counting records only: that understates what pressing it
     * does, which is the worse error on a destructive control.
     *
     * Both parts are conditional because either can legitimately be zero.
     * A demo module the user has since added their own record to is PROMOTED
     * rather than deleted (§11), so a workspace can hold demo records whose
     * modules are no longer sample data.
     */
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    const demoBreakdown = [
      demoRecords ? plural(demoRecords, 'record') : '',
      demoModules ? plural(demoModules, 'module') : '',
    ].filter(Boolean).join(', ');
    // Membership and whether this person may invite. Cheap enough to re-ask,
    // and /api/me's copy goes stale the moment anyone joins or leaves.
    let org = null;
    if (Cloud.isAuthed) {
      try {
        const res = await Cloud.org.get();
        if (res && res.org) {
          const team = await Cloud.org.members().catch(() => ({ members: [], canManage: false }));
          // Only an owner may list invites, and asking as a member is a 403 —
          // expected, not an error worth surfacing.
          const pending = res.canInvite
            ? await Cloud.org.invites().catch(() => ({ invites: [] }))
            : { invites: [] };
          org = {
            ...res.org,
            memberCount: res.memberCount,
            canInvite: res.canInvite,
            canManage: team.canManage,
            members: team.members,
            invites: (pending.invites || []).filter((i) => i.state === 'valid'),
          };
        }
      } catch { org = null; }
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
              <button class="btn" id="report-problem-btn">${icon('sticky-note', 15)} Report a problem</button>
              <button class="btn" id="signout-btn">${icon('log-out', 15)} Sign out</button>
            </div>` : Cloud.me.serverAvailable ? `
            <p class="settings-hint">You're not signed in. Data is saved on this device (with a local backup copy). Sign in to sync it to your account and use it on other devices.</p>
            <button class="btn btn-primary" id="settings-signin">${icon('log-in', 15)} Sign in</button>` : `
            <p class="settings-hint">This copy of CRM Builder is running without a server — everything is stored on this device. Deploy with the included server (see DEPLOYMENT.md) to enable accounts and sync.</p>`}
        </div>
        ${authed && org ? `
        <div class="card">
          <div class="card-head"><h2>Team</h2></div>
          <p class="settings-hint">
            <strong>${esc(org.name)}</strong> — ${org.memberCount === 1 ? 'just you so far' : `${org.memberCount} people`}.
            Everyone on a team shares one workspace: the same modules, the same records.
          </p>
          ${org.members && org.members.length ? `
            <ul class="team-list">
              ${org.members.map((m) => `
                <li>
                  <span class="team-who">${esc(m.name || m.email)}${m.isYou ? ' <span class="muted">(you)</span>' : ''}</span>
                  <span class="pill ${m.role === 'owner' || m.role === 'platformAdmin' ? 'pill-accent' : ''}">${esc(ROLE_LABELS[m.role] || m.role)}</span>
                  ${org.canManage && !m.isYou ? `
                    <span class="team-actions">
                      <select class="input team-role" data-member="${esc(m.id)}" aria-label="Role for ${esc(m.name || m.email)}">
                        ${['owner', 'member', 'contributor', 'viewer'].map((r) => `
                          <option value="${r}" ${m.role === r ? 'selected' : ''} title="${esc(ROLE_BLURB[r])}">${esc(ROLE_LABELS[r])}</option>`).join('')}
                      </select>
                      <button class="icon-btn" data-member="${esc(m.id)}" data-act="remove" title="Remove from this team">${icon('trash-2', 15)}</button>
                    </span>` : '<span class="team-actions"></span>'}
                </li>`).join('')}
            </ul>` : ''}
          ${org.canInvite ? `
            <div class="btn-row">
              <button class="btn btn-primary" id="invite-btn">${icon('user', 15)} Invite a colleague</button>
            </div>
            <p class="settings-hint">An invite is a private link that works once and expires after a week. Send it however you normally reach them.</p>
            ${org.invites && org.invites.length ? `
              <p class="settings-hint"><strong>Unused invites</strong></p>
              <ul class="team-list">
                ${org.invites.map((i) => `
                  <li>
                    <span class="team-who muted">Expires ${esc(fmtWhen(i.expiresAt))}</span>
                    <span class="team-actions"><button class="btn btn-ghost" data-revoke="${esc(i.code)}">Revoke</button></span>
                  </li>`).join('')}
              </ul>` : ''}`
    : '<p class="settings-hint">Only an owner can invite people to this team.</p>'}
          ${org.memberCount > 1 ? `
            <div class="btn-row">
              <button class="btn btn-danger-ghost" id="leave-team-btn">${icon('log-out', 15)} Leave this team</button>
            </div>
            <p class="settings-hint">Leaving gives you a fresh, empty workspace of your own. The team's records stay with the team.</p>` : ''}
        </div>` : ''}
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
            ${demoCount ? `<button class="btn" id="remove-demo-btn">${icon('trash-2', 15)} Remove sample data (${esc(demoBreakdown)})</button>` : ''}
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

    $('#save-workspace').addEventListener('click', async () => {
      const nextCurrency = $('#set-currency').value;
      if (nextCurrency !== SETTINGS.currency && !(await confirmCurrencyChange(SETTINGS.currency, nextCurrency))) return;
      SETTINGS.businessName = $('#set-name').value.trim();
      SETTINGS.currency = nextCurrency;
      saveSettings();
      renderSidebar();
      toast('Workspace saved');
    });
    const inviteBtn = $('#invite-btn');
    if (inviteBtn) inviteBtn.addEventListener('click', openInvite);
    const reportBtn = $('#report-problem-btn');
    if (reportBtn) reportBtn.addEventListener('click', openProblemReport);
    bindTeamActions();
    $('#export-btn').addEventListener('click', exportData);
    $('#import-btn').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', importData);
    $('#reset-btn').addEventListener('click', async () => {
      if (!confirm('Delete ALL modules and records from this device? Export a backup first if you might need this data.')) return;
      await DB.softClearAll();
      Scope.remove('snapshot');
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
    $('#replay-tour-btn').addEventListener('click', startTourWithConsent);
    const removeDemo = $('#remove-demo-btn');
    if (removeDemo) {
      removeDemo.addEventListener('click', async () => {
        if (!confirm('Remove the sample data?\n\nAnything you added yourself is kept, including records you created inside a sample module.')) return;
        const { removed, promoted } = await discardDemoData();
        renderSidebar();
        toast(promoted
          ? `Sample data removed — kept ${promoted} module${promoted === 1 ? '' : 's'} you had added to`
          : `Sample data removed (${removed} record${removed === 1 ? '' : 's'})`);
        route();
      });
    }
    $('#load-demo-btn').addEventListener('click', async () => {
      const replace = modules.length > 0
        && confirm('Replace your current modules and records with the demo business?\n\nOK = replace everything (your current data is deleted)\nCancel = add demo data alongside what you have');
      await loadDemoData({ replace });
    });
    const signinBtn = $('#settings-signin');
    if (signinBtn) signinBtn.addEventListener('click', () => openSignIn());
    const signoutBtn = $('#signout-btn');
    if (signoutBtn) {
      signoutBtn.addEventListener('click', async () => {
        await Cloud.pushNow();
        await Cloud.logout();
        // Back to the anonymous workspace. The account's own store is left
        // exactly as it is and returns on the next sign-in — signing out hides
        // a workspace, it never destroys one.
        await switchScopeTo(Scope.ANON);
        toast('Signed out — sign back in to see your workspace');
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

  /*
   * Promote, demote, remove, revoke, leave.
   *
   * Removing someone is not deleting their account: they keep it and get a
   * fresh empty workspace, and the team's records are untouched. The
   * confirmations say so, because "remove" and "delete" are one word apart and
   * a decade of data apart.
   */
  function bindTeamActions() {
    const nameIn = (el) => {
      const row = el.closest('li');
      return row ? $('.team-who', row).textContent.replace(/\(you\)$/, '').trim() : 'this person';
    };

    // A four-rung ladder does not fit a toggle, so the role is a picker and
    // the confirmation says what the rung actually means.
    $$('select.team-role').forEach((sel) => {
      const was = sel.value;
      sel.addEventListener('change', async () => {
        const who = nameIn(sel);
        const role = sel.value;
        if (!confirm(`Make ${who} a ${ROLE_LABELS[role]}?\n\n${ROLE_BLURB[role]}.`)) {
          sel.value = was; // put the control back, or it lies about the state
          return;
        }
        try {
          await Cloud.org.setRole(sel.dataset.member, role);
          toast(`${who} is now a ${ROLE_LABELS[role]}`);
          await renderSettings();
        } catch (err) {
          sel.value = was;
          toast(err.message);
        }
      });
    });

    $$('button[data-member]').forEach((btn) => btn.addEventListener('click', async () => {
      const who = nameIn(btn);
      if (!confirm(`Remove ${who} from this team?\n\nThey keep their account and get a fresh, empty workspace. The team's records are not affected.`)) return;
      try {
        await Cloud.org.remove(btn.dataset.member);
        toast(`${who} was removed from the team`);
        await renderSettings();
      } catch (err) {
        toast(err.message);
      }
    }));

    $$('[data-revoke]').forEach((btn) => btn.addEventListener('click', async () => {
      if (!confirm('Revoke this invite link? Anyone holding it will no longer be able to join.')) return;
      try {
        await Cloud.org.revoke(btn.dataset.revoke);
        toast('Invite revoked');
        await renderSettings();
      } catch (err) {
        toast(err.message);
      }
    }));

    const leaveBtn = $('#leave-team-btn');
    if (leaveBtn) {
      leaveBtn.addEventListener('click', async () => {
        if (!confirm("Leave this team?\n\nYou will get a fresh, empty workspace of your own. The team's records stay with the team and you will no longer be able to see them.")) return;
        try {
          // Deliver anything still pending while this is still our workspace —
          // after the move the server would file it under the new one.
          if (Scope.get('dirty')) await Cloud.sync().catch(() => {});
          await Cloud.org.leave();
          await Cloud.init({ getState: fullState, getChanges: localChanges, applyChanges: mergeChanges });
          await reconcileWorkspace();
          renderSidebar();
          route();
          toast('You have left the team');
        } catch (err) {
          toast(err.message);
        }
      });
    }
  }

  /*
   * Mint an invite link and put it somewhere the owner can copy it.
   *
   * No email is sent — there is no mail plumbing in this product and inventing
   * some would be a bigger commitment than the feature. The link goes wherever
   * they already talk to their colleague.
   */
  async function openInvite() {
    const modal = openModal(`
      <div class="modal-head">
        <h2>Invite a colleague</h2>
        <button class="icon-btn" data-close aria-label="Close">${icon('x', 16)}</button>
      </div>
      <div class="modal-body"><p class="settings-hint">Creating a link…</p></div>`);
    $$('[data-close]', modal).forEach((b) => b.addEventListener('click', closeModal));

    let out;
    try {
      out = await Cloud.org.invite();
    } catch (err) {
      $('.modal-body', modal).innerHTML = `<p class="empty-hint">${esc(err.message || 'Could not create an invite link')}</p>`;
      return;
    }

    const expires = new Date(out.invite.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    $('.modal-body', modal).innerHTML = `
      <p class="settings-hint">Send this link to the person you want on the team. It works <strong>once</strong> and stops working after <strong>${esc(expires)}</strong>.</p>
      <div class="form-row">
        <label for="invite-url">Invite link</label>
        <input class="input" id="invite-url" type="text" readonly value="${esc(out.url)}">
      </div>
      <p class="settings-hint">They will be asked whether to bring their own records with them. Anything they bring becomes visible to everyone on the team.</p>
      <div class="btn-row"><button class="btn btn-primary" id="invite-copy">${icon('clipboard-list', 15)} Copy link</button></div>`;

    const field = $('#invite-url', modal);
    field.addEventListener('focus', () => field.select());
    $('#invite-copy', modal).addEventListener('click', async () => {
      field.select();
      try {
        await navigator.clipboard.writeText(out.url);
        toast('Invite link copied');
      } catch {
        // Clipboard access is refused in plenty of contexts; the link is
        // selected either way, so say what to do rather than just failing.
        toast('Press Ctrl/Cmd+C to copy the selected link');
      }
    });
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
    const choice = await askHowToRestore(payload);
    if (!choice) return;
    await importState(payload, { mode: choice, stamp: true });
    await persist();
    renderSidebar();
    toast(choice === 'replace' ? 'Workspace replaced from backup' : 'Backup merged in');
    location.hash = '#/';
    route();
  }

  /*
   * Restoring used to mean replacing, and said so in a way that undersold it.
   *
   * "This REPLACES everything currently on this device" was wrong twice. The
   * removals are tombstones, and tombstones sync — so restoring a month-old
   * backup deleted, from every colleague's device, everything added since.
   * Someone recovering one lost module took the whole team back in time, using
   * the feature named recovery.
   *
   * So merging is the default: add and update what is in the file, remove
   * nothing. That is what recovering a deleted module actually wants, and it
   * cannot destroy anybody's work. Replacing is still available, because
   * "put it back exactly as it was" is a real need — it just has to say what
   * it costs, in rows, before it happens.
   */
  async function askHowToRestore(payload) {
    const counts = `${payload.modules.length} module(s) and ${payload.records.length} record(s)`;
    const shared = (Cloud.me.org && Cloud.me.org.memberCount > 1);
    return new Promise((resolve) => {
      const modal = openModal(`
        <div class="modal-head">
          <h2>Restore from backup</h2>
          <button class="icon-btn" data-close aria-label="Close">${icon('x', 16)}</button>
        </div>
        <div class="modal-body">
          <p class="settings-hint">This file holds ${esc(counts)}.</p>
          <div class="restore-choice">
            <p><strong>Merge</strong> — put everything in the file back, and leave anything else alone. Records added since the backup are kept.</p>
            <p><strong>Replace</strong> — make the workspace match the file exactly. Anything not in it is deleted${shared ? ' <strong>for everyone on your team</strong>' : ''}.</p>
          </div>
        </div>
        <div class="modal-foot claim-actions">
          <button class="btn" data-close>Cancel</button>
          <button class="btn" id="restore-replace">Replace everything</button>
          <button class="btn btn-primary" id="restore-merge">${icon('plus', 15)} Merge</button>
        </div>`);

      let answered = false;
      // Escape and a backdrop click are cancellations, not silent merges.
      const onDismiss = () => { if (!answered) { answered = true; resolve(null); } };
      $('#modal-root').addEventListener('crmb:modal-closed', onDismiss, { once: true });
      const done = (value) => {
        answered = true;
        $('#modal-root').removeEventListener('crmb:modal-closed', onDismiss);
        closeModal();
        resolve(value);
      };
      $$('[data-close]', modal).forEach((b) => b.addEventListener('click', () => done(null)));
      $('#restore-merge', modal).addEventListener('click', () => done('merge'));
      $('#restore-replace', modal).addEventListener('click', async () => {
        // The count is the point of this second step: "everything not in the
        // file" is abstract until it is a number, and on a team it is other
        // people's work.
        const doomed = await countRowsAbsentFrom(payload);
        const warning = doomed
          ? `Delete ${doomed} item(s) that are not in this backup${shared ? ', for everyone on your team' : ''}? This cannot be undone.`
          : 'Nothing on this device is missing from the backup, so nothing will be deleted. Continue?';
        if (!confirm(warning)) return;
        done('replace');
      });
      // Closing by any other route is a cancellation, not a silent merge.
    });
  }

  async function countRowsAbsentFrom(payload) {
    const incoming = new Set([
      ...(payload.modules || []).map((m) => m && m.id),
      ...(payload.records || []).map((r) => r && r.id),
    ]);
    let n = 0;
    for (const kind of ['modules', 'records']) {
      for (const row of await DB.getAll(kind)) if (!incoming.has(row.id)) n += 1;
    }
    return n;
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
    let betaCodes = null;
    let reports = [];
    let access = null;
    let platform = null;
    try {
      [stats, usersRes] = await Promise.all([Cloud.admin.stats(), Cloud.admin.users()]);
      // Platform admins only, so a 403 here is the expected answer for an org
      // owner rather than something worth reporting.
      if (Cloud.user && Cloud.user.role === 'platformAdmin') {
        betaCodes = await Cloud.admin.betaCodes().catch(() => null);
        reports = (await Cloud.admin.feedback().catch(() => ({ reports: [] }))).reports;
        access = await Cloud.admin.accessRequests().catch(() => null);
        platform = await Cloud.admin.platform().catch(() => null);
      }
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
        ${reports && reports.length ? `
        <div class="card">
          <div class="card-head"><h2>Problem reports</h2></div>
          <ul class="report-list">
            ${reports.map((r) => `
              <li class="${r.status === 'resolved' ? 'is-resolved' : ''}">
                <div class="report-head">
                  <strong>${esc(r.from)}</strong>
                  <span class="muted">${esc(fmtWhen(r.createdAt))} · ${esc((r.context && r.context.route) || '')} · sync ${esc((r.context && r.context.syncStatus) || '?')}</span>
                  <button class="btn btn-ghost" data-report="${esc(r.id)}" data-status="${r.status === 'resolved' ? 'open' : 'resolved'}">${r.status === 'resolved' ? 'Reopen' : 'Resolve'}</button>
                </div>
                <p class="report-message">${esc(r.message)}</p>
                ${r.context && r.context.errors && r.context.errors.length ? `
                  <details><summary class="muted">${r.context.errors.length} console error(s)</summary>
                    <pre class="report-errors">${esc(r.context.errors.join('\n'))}</pre>
                  </details>` : ''}
                <p class="muted report-meta">${esc((r.context && r.context.version) || '')} · ${(r.context && r.context.records) || 0} record(s) · ${esc(((r.context && r.context.userAgent) || '').slice(0, 90))}</p>
              </li>`).join('')}
          </ul>
        </div>` : ''}
        ${platform ? `
        <div class="card">
          <div class="card-head"><h2>Deployment</h2></div>
          <p class="settings-hint">${platform.counts.users} account${platform.counts.users === 1 ? '' : 's'} across ${platform.counts.orgs} organisation${platform.counts.orgs === 1 ? '' : 's'} · ${platform.counts.records.toLocaleString()} records${platform.counts.disabled ? ` · ${platform.counts.disabled} paused` : ''}</p>
          <div class="meter-grid">
            ${[
    ['Database', platform.meters.storage, 'Atlas M0 · counts indexes and tombstones, not just records'],
    ['Memory', platform.meters.ram, `Container RSS · peak seen ${fmtBytes(platform.meters.ram.peakBytes)}`],
    ['Bandwidth', platform.meters.egress, `Response bodies sent in ${platform.meters.egress.month} · excludes headers, so the real figure is higher`],
  ].map(([label, m, note]) => `
              <div class="meter" data-level="${esc(m.level)}">
                <div class="meter-head"><span>${esc(label)}</span><strong>${m.percent == null ? '—' : `${m.percent}%`}</strong></div>
                <div class="meter-bar"><span style="width:${Math.min(100, m.percent || 0)}%"></span></div>
                <p class="muted">${fmtBytes(m.bytes)} of ${fmtBytes(m.limitBytes)}</p>
                <p class="muted meter-note">${esc(note)}</p>
              </div>`).join('')}
          </div>
          <p class="settings-hint">Memory is sampled when this page loads, so it catches a slow leak rather than a sudden spike — the burst that would actually restart the container happens between looks.</p>
          <div class="mode-switch">
            <span class="settings-hint" style="margin:0;align-self:center">New organisations:</span>
            ${[['open', 'Allowed'], ['closed', 'Capped']].map(([value, label]) => `
              <button class="btn ${platform.orgCreation === value ? 'btn-primary' : ''}" data-orgmode="${value}"
                      ${platform.orgCreation === value ? 'disabled' : ''}>${esc(label)}</button>`).join('')}
          </div>
          <p class="settings-hint">Capping stops <em>new</em> tenants. Colleagues invited to a team that already exists still sign up and join — that is the whole reason this is a separate switch from pausing signups.</p>
        </div>
        <div class="card table-card">
          <div class="card-head"><h2>Organisations</h2></div>
          <p class="settings-hint">Heaviest first. Share is of what is actually stored, so one tenant dominating the database is visible without doing the arithmetic. <strong>Reclaimable</strong> is the part that is deleted rows waiting out the ${esc(String(platform.tombstoneDays || 180))}-day retention window — a workspace that is mostly that will shrink on its own, and is not the same problem as one that is genuinely large.</p>
          <div class="table-scroll">
            <table class="records-table">
              <thead><tr><th>Organisation</th><th>People</th><th>Records</th><th>Stored</th><th>Share</th><th>Last active</th><th>Actions</th></tr></thead>
              <tbody>
                ${platform.orgs.map((o) => `
                  <tr>
                    <td data-label="Organisation"><strong>${esc(o.name || '—')}</strong>${o.suspendedAt ? ' <span class="pill pill-danger">paused</span>' : ''}</td>
                    <td data-label="People" class="td-num">${o.members}</td>
                    <td data-label="Records" class="td-num">${o.records.toLocaleString()}</td>
                    <td data-label="Stored" class="td-num">${fmtBytes(o.bytes)}${reclaimable(o, platform.tombstoneDays || 180)}</td>
                    <td data-label="Share" class="td-num">${o.shareOfData}%</td>
                    <td data-label="Last active">${o.lastActiveAt ? fmtWhen(o.lastActiveAt) : '—'}</td>
                    <td data-label="Actions" class="admin-actions">
                      <button class="icon-btn" data-org-suspend="${esc(o.id)}" data-on="${o.suspendedAt ? '0' : '1'}"
                              title="${o.suspendedAt ? 'Let this workspace write again' : 'Pause writes — nothing is deleted'}">${icon(o.suspendedAt ? 'shield-check' : 'ban', 15)}</button>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>` : ''}
        ${access && access.requests.length ? `
        <div class="card">
          <div class="card-head"><h2>Requests to join${access.pending ? ` <span class="count-badge">${access.pending} waiting</span>` : ''}</h2></div>
          <p class="settings-hint">People who signed in without an invite and asked. <strong>Approving lets them straight in</strong> — they sign in again with the same Google account and it works. Nothing is emailed, so there is nothing for them to wait on.</p>
          ${access.usage && (access.usage.level === 'warn' || access.usage.level === 'critical') ? `
            <p class="settings-hint"><strong>Storage is at ${esc(String(access.usage.percentOfLimit))}%.</strong> Worth taking a backup before you add more people.</p>` : ''}
          <ul class="team-list">
            ${access.requests.map((r) => `
              <li>
                <span class="team-who">${esc(r.name || r.email)}
                  <span class="muted">· ${esc(r.email)} · asked ${esc(fmtWhen(r.requestedAt))}</span>
                  ${r.note ? `<br><span class="muted">${esc(r.note)}</span>` : ''}
                </span>
                <span class="pill ${r.status === 'approved' ? 'pill-ok' : r.status === 'declined' ? 'pill-danger' : 'pill-accent'}">${esc(r.status)}${r.usedAt ? ' · joined' : ''}</span>
                <span class="team-actions">
                  ${r.status === 'pending' ? `
                    <button class="icon-btn" data-ask-yes="${esc(r.email)}" title="Approve — they can sign in from now on">${icon('shield-check', 15)}</button>
                    <button class="icon-btn" data-ask-no="${esc(r.email)}" title="Decline">${icon('ban', 15)}</button>` : ''}
                </span>
              </li>`).join('')}
          </ul>
        </div>` : ''}
        ${betaCodes ? `
        <div class="card">
          <div class="card-head"><h2>Beta access</h2></div>
          <p class="settings-hint">
            Signups are <strong>${esc(betaCodes.signupMode)}</strong>.
            ${betaCodes.signupMode === 'code'
    ? 'A code is needed to create an account, and never to sign back in. Send the link; it carries the code.'
    : betaCodes.signupMode === 'open'
      ? 'Anyone who can sign in with Google gets an account. Codes below are ignored.'
      : 'No new accounts are being created. Everyone who already has one still works.'}
          </p>
          <div class="mode-switch">
            ${[
    ['code', 'Invite only', 'A code or an approved request creates an account'],
    ['open', 'Open', 'Anyone who signs in with Google gets an account'],
    ['closed', 'Paused', 'No new accounts; everyone who has one still works'],
  ].map(([value, label, why]) => `
              <button class="btn ${betaCodes.signupMode === value ? 'btn-primary' : ''}"
                      data-mode="${value}" title="${esc(why)}"
                      ${betaCodes.signupMode === value ? 'disabled' : ''}>${esc(label)}</button>`).join('')}
          </div>
          <p class="settings-hint">Takes effect immediately — no redeploy. This outlives restarts, so the <code>SIGNUP_MODE</code> variable stops deciding once you set it here. You and everyone with an account can always sign in, whatever this says.</p>
          ${betaCodes.codes.length ? `
            <ul class="team-list">
              ${betaCodes.codes.map((c) => `
                <li>
                  <span class="team-who">${esc(c.label || 'Unlabelled')} <span class="muted">· ${c.remaining} of ${c.maxUses} left · expires ${esc(fmtWhen(c.expiresAt))}</span></span>
                  <span class="pill ${c.state === 'valid' ? 'pill-ok' : ''}">${esc(c.state)}</span>
                  <span class="team-actions">
                    ${c.state === 'valid' ? `
                      <button class="icon-btn" data-beta-copy="${esc(c.code)}" title="Copy the invite link">${icon('clipboard-list', 15)}</button>
                      <button class="icon-btn" data-beta-revoke="${esc(c.code)}" title="Revoke">${icon('ban', 15)}</button>` : ''}
                  </span>
                </li>`).join('')}
            </ul>` : '<p class="settings-hint">No codes yet.</p>'}
          <div class="btn-row">
            <button class="btn btn-primary" id="mint-beta-btn">${icon('plus', 15)} New beta code</button>
            <button class="btn" id="test-alert-btn">${icon('triangle-alert', 15)} Send a test alert</button>
          </div>
        </div>` : ''}
        <div class="card table-card">
          <div class="card-head admin-users-head">
            <h2>Accounts</h2>
            <div class="search-wrap">${icon('search', 15)}<input type="search" id="admin-search" class="input search-input" placeholder="Search accounts…"></div>
          </div>
          <div class="table-scroll">
          <table class="records-table" id="admin-users-table">
            <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Joined</th><th>Last active</th><th>Actions</th></tr></thead>
            <tbody>
              ${usersRes.users.map((u) => `
                <tr data-email="${esc(u.email)}" data-name="${esc(u.name || '')}" class="admin-row">
                  <td data-label="User"><strong>${esc(u.name || '—')}</strong><br><span class="muted">${esc(u.email)}</span></td>
                  <td data-label="Role"><span class="pill ${u.role === 'platformAdmin' || u.role === 'owner' ? 'pill-accent' : ''}">${esc(ROLE_LABELS[u.role] || u.role)}</span></td>
                  <td data-label="Status">${u.disabled ? '<span class="pill pill-danger">disabled</span>' : '<span class="pill pill-ok">active</span>'}</td>
                  <td data-label="Joined">${fmtWhen(u.createdAt)}</td>
                  <td data-label="Last active">${fmtWhen(u.lastActiveAt)}</td>
                  <td data-label="Actions" class="admin-actions">
                    ${u.id === Cloud.user.id ? '<span class="muted">you</span>' : `
                      <button class="icon-btn" data-act="role" data-id="${esc(u.id)}" data-role="${u.role === 'owner' ? 'member' : 'owner'}" title="${u.role === 'owner' ? 'Demote to member' : 'Make an owner'}">${icon(u.role === 'owner' ? 'user' : 'shield-check', 15)}</button>
                      <button class="icon-btn" data-act="disable" data-id="${esc(u.id)}" data-disabled="${u.disabled ? '0' : '1'}" title="${u.disabled ? 'Re-enable account' : 'Disable account'}">${icon('ban', 15)}</button>
                      <button class="icon-btn" data-act="delete" data-id="${esc(u.id)}" title="Remove this account">${icon('trash-2', 15)}</button>`}
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
            // The workspace belongs to the organisation, so removing one of
            // several members takes the person and leaves the CRM. Say which
            // is about to happen rather than warning about both.
            const last = usersRes.users.filter((u) => !u.disabled).length <= 1;
            const warning = last
              ? 'Delete this account AND the workspace? They are the last member, so the CRM goes with them. This cannot be undone.'
              : 'Remove this account? They lose access immediately. The workspace and its records stay with the rest of the team.';
            if (!confirm(warning)) return;
            const out = await Cloud.admin.remove(id);
            toast(out && out.deletedWorkspace ? 'Account and workspace deleted' : 'Account removed — the workspace is untouched');
          }
          renderAdmin();
        } catch (err) {
          toast(err.message);
        }
      });
    });

    const mint = $('#mint-beta-btn');
    if (mint) mint.addEventListener('click', openMintBetaCode);

    $$('[data-report]').forEach((btn) => btn.addEventListener('click', async () => {
      try {
        await Cloud.admin.resolveFeedback(btn.dataset.report, btn.dataset.status);
        renderAdmin();
      } catch (err) {
        toast(err.message);
      }
    }));

    $$('[data-beta-revoke]').forEach((btn) => btn.addEventListener('click', async () => {
      if (!confirm('Revoke this code? Anyone holding it will no longer be able to create an account. People who already used it are unaffected.')) return;
      try {
        await Cloud.admin.revokeBetaCode(btn.dataset.betaRevoke);
        toast('Code revoked');
        renderAdmin();
      } catch (err) {
        toast(err.message);
      }
    }));

    $$('[data-beta-copy]').forEach((btn) => btn.addEventListener('click', async () => {
      const url = `${location.origin}/?beta=${encodeURIComponent(btn.dataset.betaCopy)}`;
      try {
        await navigator.clipboard.writeText(url);
        toast('Signup link copied');
      } catch {
        prompt('Copy this signup link:', url);
      }
    }));

    const testAlertBtn = $('#test-alert-btn');
    if (testAlertBtn) testAlertBtn.addEventListener('click', async () => {
      try {
        const out = await Cloud.admin.testAlert();
        // Silence and a broken webhook look identical, so say which this is.
        if (!out.webhookConfigured) {
          toast('No webhook set — alerts have nowhere to go');
          return;
        }
        const armed = out.rules.filter((r) => r.crossed).map((r) => r.rule);
        toast(armed.length
          ? `Sent. Currently over a threshold: ${armed.join(', ')}`
          : 'Sent. Nothing is over a threshold right now.');
      } catch (err) {
        toast(err.message);
      }
    });

    $$('[data-orgmode]').forEach((btn) => btn.addEventListener('click', async () => {
      const mode = btn.dataset.orgmode;
      if (mode === 'closed' && !confirm('Stop new organisations signing up?\n\nColleagues invited to teams that already exist can still join. Only brand-new tenants are turned away.')) return;
      try {
        await Cloud.admin.setOrgCreation(mode);
        toast(mode === 'closed' ? 'New organisations capped' : 'New organisations allowed');
        renderAdmin();
      } catch (err) {
        toast(err.message);
      }
    }));

    $$('[data-org-suspend]').forEach((btn) => btn.addEventListener('click', async () => {
      const id = btn.dataset.orgSuspend;
      const suspend = btn.dataset.on === '1';
      let reason = '';
      if (suspend) {
        // Named, because the workspace's own people see this sentence and
        // "your account is paused" with no explanation reads as a deletion.
        reason = prompt('Pause writes for this workspace. Their data is untouched and they can still sign in — they just cannot save until you resume.\n\nWhat should they be told?', 'Paused while we look at storage. Nothing has been deleted.');
        if (reason === null) return;
      } else if (!confirm('Let this workspace save again?')) return;
      try {
        await Cloud.admin.suspendOrg(id, suspend, reason);
        toast(suspend ? 'Workspace paused' : 'Workspace resumed');
        renderAdmin();
      } catch (err) {
        toast(err.message);
      }
    }));

    $$('[data-mode]').forEach((btn) => btn.addEventListener('click', async () => {
      const mode = btn.dataset.mode;
      // Opening the door is the one that cannot be quietly undone — anyone who
      // signs up in the meantime keeps their account when it closes again.
      if (mode === 'open' && !confirm('Open signups to anyone who can sign in with Google?\n\nAccounts created while it is open stay, even after you close it again.')) return;
      try {
        await Cloud.admin.setSignupMode(mode);
        toast(`Signups are now ${mode}`);
        renderAdmin();
      } catch (err) {
        toast(err.message);
      }
    }));

    const decide = async (email, decision) => {
      try {
        const out = await Cloud.admin.decideAccessRequest(email, decision);
        // Approval needs no delivery — that is the whole design — but the
        // operator will usually want to say so anyway, so the line is offered
        // rather than assumed.
        if (out.message) {
          try {
            await navigator.clipboard.writeText(out.message);
            toast('Approved — a reply is on your clipboard');
          } catch {
            toast('Approved — they can sign in now');
          }
        } else {
          toast('Declined');
        }
        renderAdmin();
      } catch (err) {
        toast(err.message);
      }
    };

    $$('[data-ask-yes]').forEach((btn) => btn.addEventListener('click', () => {
      const email = btn.dataset.askYes;
      if (!confirm(`Approve ${email}? They will be able to create an account by signing in with that Google address.`)) return;
      decide(email, 'approved');
    }));

    $$('[data-ask-no]').forEach((btn) => btn.addEventListener('click', () => {
      const email = btn.dataset.askNo;
      // Said plainly because it is not reversible from this screen and the
      // person is never told, so a misclick is silent on both sides.
      if (!confirm(`Decline ${email}? They will see the ordinary private-beta screen and cannot ask again.`)) return;
      decide(email, 'declined');
    }));
  }

  /*
   * Mint a code for one batch of testers.
   *
   * A cap and an expiry rather than an open-ended key: on a free database the
   * number of people who can create an account is the only lever there is, and
   * a code that lives forever is one you will forget you issued.
   */
  async function openMintBetaCode() {
    const modal = openModal(`
      <div class="modal-head">
        <h2>New beta code</h2>
        <button class="icon-btn" data-close aria-label="Close">${icon('x', 16)}</button>
      </div>
      <div class="modal-body">
        <div class="form-row">
          <label for="beta-label">What is this batch?</label>
          <input class="input" id="beta-label" type="text" placeholder="e.g. Launch week, plumbers group">
        </div>
        <div class="builder-meta">
          <div class="form-row">
            <label for="beta-uses">How many accounts</label>
            <input class="input" id="beta-uses" type="number" min="1" max="1000" value="10">
          </div>
          <div class="form-row">
            <label for="beta-days">Valid for (days)</label>
            <input class="input" id="beta-days" type="number" min="1" max="365" value="30">
          </div>
        </div>
      </div>
      <div class="modal-foot claim-actions">
        <button class="btn btn-primary" id="beta-create">Create code</button>
      </div>`);
    $$('[data-close]', modal).forEach((b) => b.addEventListener('click', closeModal));

    $('#beta-create', modal).addEventListener('click', async () => {
      try {
        const out = await Cloud.admin.mintBetaCode({
          label: $('#beta-label', modal).value.trim(),
          maxUses: Number($('#beta-uses', modal).value) || 10,
          days: Number($('#beta-days', modal).value) || 30,
        });
        $('.modal-body', modal).innerHTML = `
          <p class="settings-hint">Send this link to the batch. It creates up to <strong>${out.code.maxUses}</strong> accounts and stops working on <strong>${esc(fmtWhen(out.code.expiresAt))}</strong>.</p>
          <div class="form-row">
            <label for="beta-url">Signup link</label>
            <input class="input" id="beta-url" type="text" readonly value="${esc(out.url)}">
          </div>`;
        $('.modal-foot', modal).innerHTML = '<button class="btn btn-primary" id="beta-copy">Copy link</button>';
        const field = $('#beta-url', modal);
        field.addEventListener('focus', () => field.select());
        field.select();
        $('#beta-copy', modal).addEventListener('click', async () => {
          field.select();
          try {
            await navigator.clipboard.writeText(out.url);
            toast('Signup link copied');
          } catch {
            toast('Press Ctrl/Cmd+C to copy the selected link');
          }
        });
      } catch (err) {
        toast(err.message);
      }
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
          <button class="btn btn-ghost" id="route-report">Report this</button>
        </div>
      </div></div>`;
    const retry = $('#route-retry');
    if (retry) retry.addEventListener('click', () => route());
    // Offered right where someone is already looking at something broken.
    const report = $('#route-report');
    if (report) report.addEventListener('click', openProblemReport);
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
  // ------------------------------------------------------- demo data + scopes
  /*
   * What is sitting in a scope, split by provenance.
   *
   * `_demo` is set on rows we seeded and never on rows the user typed, so this
   * is an exact split rather than a guess — which is the whole reason the flag
   * exists alongside the scope boundary.
   */
  async function inventory() {
    const [mods, recs] = await Promise.all([DB.getAll('modules'), DB.getAll('records')]);
    return {
      modules: mods,
      records: recs,
      demoModules: mods.filter((m) => m._demo),
      demoRecords: recs.filter((r) => r._demo),
      realModules: mods.filter((m) => !m._demo),
      realRecords: recs.filter((r) => !r._demo),
      get hasDemo() { return this.demoModules.length > 0 || this.demoRecords.length > 0; },
      get hasReal() { return this.realModules.length > 0 || this.realRecords.length > 0; },
      get isEmpty() { return this.modules.length === 0 && this.records.length === 0; },
    };
  }

  /*
   * Remove sample data, carefully.
   *
   * The asymmetry that matters: we only ever delete rows we created. A demo
   * module the user has since typed their own records into is PROMOTED to a
   * real module rather than deleted, because taking it would take their work
   * with it. Everything goes through DB.delete, so the removal tombstones and
   * reaches their other devices instead of coming back on the next sync.
   */
  async function discardDemoData() {
    const inv = await inventory();
    if (!inv.hasDemo) return { removed: 0, promoted: 0 };

    const now = Date.now();
    const byModule = new Map();
    inv.records.forEach((r) => {
      if (!byModule.has(r.moduleId)) byModule.set(r.moduleId, []);
      byModule.get(r.moduleId).push(r);
    });

    const removedIds = new Set();
    let promoted = 0;

    for (const mod of inv.demoModules) {
      const rows = byModule.get(mod.id) || [];
      if (rows.some((r) => !r._demo)) {
        // The user made this module theirs. Keep it, drop only our rows.
        const { _demo, ...kept } = mod;
        await DB.put('modules', { ...kept, updatedAt: now });
        promoted += 1;
        for (const r of rows.filter((x) => x._demo)) {
          await DB.delete('records', r.id, now);
          removedIds.add(r.id);
        }
      } else {
        for (const r of rows) {
          await DB.delete('records', r.id, now);
          removedIds.add(r.id);
        }
        await DB.delete('modules', mod.id, now);
      }
    }

    // Demo rows living in a module the user chose at onboarding.
    const demoModuleIds = new Set(inv.demoModules.map((m) => m.id));
    for (const r of inv.demoRecords) {
      if (demoModuleIds.has(r.moduleId) || removedIds.has(r.id)) continue;
      await DB.delete('records', r.id, now);
      removedIds.add(r.id);
    }

    // A relation still pointing at something we just deleted renders as
    // "(linked record)" — harmless, but it reads as breakage on a record the
    // user still owns. Clear those references.
    if (removedIds.size) {
      const survivors = await DB.getAll('records');
      const relKeysByModule = new Map();
      for (const m of await DB.getAll('modules')) {
        relKeysByModule.set(m.id, (m.fields || []).filter((f) => f.type === 'relation').map((f) => f.key));
      }
      for (const r of survivors) {
        const keys = relKeysByModule.get(r.moduleId) || [];
        const stale = keys.filter((k) => r.data[k] && removedIds.has(r.data[k]));
        if (!stale.length) continue;
        const data = { ...r.data };
        stale.forEach((k) => { data[k] = ''; });
        await DB.put('records', { ...r, data, updatedAt: now });
      }
    }

    // Only revert settings the demo set and the user never touched.
    try {
      const seeded = JSON.parse(Scope.get('demoSettings'));
      if (seeded) {
        if (SETTINGS.businessName === seeded.businessName) SETTINGS.businessName = '';
        if (SETTINGS.currency === seeded.currency) SETTINGS.currency = DEFAULT_SETTINGS.currency;
        saveSettings();
      }
    } catch { /* nothing seeded */ }
    Scope.remove('demoSettings');

    relationNameCache.clear();
    await loadModules();
    await persist();
    return { removed: removedIds.size, promoted };
  }

  /*
   * Move the anonymous workspace into the account that just signed in.
   *
   * Rows are re-dated to now on purpose: bringing work into an account is a
   * deliberate act and should win the first sync, the same reasoning as an
   * explicit backup restore. Reads happen before the scope switch and writes
   * after, because DB follows whichever scope is current.
   */
  async function claimAnonWorkspace(targetScope, { keepDemo }) {
    const [mods, recs] = await Promise.all([DB.getAllRaw('modules'), DB.getAllRaw('records')]);
    const settings = { ...SETTINGS };
    const settingsAt = Number(Scope.get('settingsAt')) || 0;
    const wanted = (row) => !row.deletedAt && (keepDemo || !row._demo);
    const takeMods = mods.filter(wanted);
    const takeRecs = recs.filter(wanted);
    // A record whose module is being left behind has nowhere to live.
    const takenModuleIds = new Set(takeMods.map((m) => m.id));

    await switchScopeTo(targetScope);

    const now = Date.now();
    for (const m of takeMods) await DB.put('modules', { ...m, updatedAt: now });
    for (const r of takeRecs) {
      if (!takenModuleIds.has(r.moduleId)) continue;
      await DB.put('records', { ...r, updatedAt: now });
    }
    if (settingsAt > 0) {
      SETTINGS = { ...SETTINGS, ...settings };
      saveSettings();
    }
    relationNameCache.clear();
    await loadModules();
    return takeMods.length + takeRecs.length;
  }

  // Point every layer at a different scope and reload what they cached.
  async function switchScopeTo(scope) {
    DB.useScope(scope);
    Scope.switchTo(scope);
    loadSettingsFromScope();
    relationNameCache.clear();
    await loadModules();
  }

  /*
   * The one question that has to be asked at sign-in.
   *
   * Only ever about the ANONYMOUS scope — an account's own workspace is never
   * offered to a different account, which is what keeps a shared PC safe. The
   * options are computed from what is actually there, so nobody is asked about
   * sample data they never loaded, and real work is never discarded silently.
   */
  function askAboutAnonWorkspace(inv) {
    return new Promise((resolve) => {
      const choices = [];
      if (inv.hasReal && inv.hasDemo) {
        choices.push(['work', 'Bring my work, leave the samples', 'primary']);
        choices.push(['all', 'Bring everything, samples included', '']);
        choices.push(['none', 'Leave it all on this device', 'ghost']);
      } else if (inv.hasReal) {
        choices.push(['work', 'Bring my work into this account', 'primary']);
        choices.push(['none', 'Leave it on this device', 'ghost']);
      } else {
        choices.push(['none', 'Start fresh', 'primary']);
        choices.push(['all', 'Keep the sample data', '']);
      }

      const counts = [];
      if (inv.hasReal) counts.push(`${inv.realRecords.length} record${inv.realRecords.length === 1 ? '' : 's'} you added`);
      if (inv.hasDemo) counts.push(`${inv.demoRecords.length} sample record${inv.demoRecords.length === 1 ? '' : 's'}`);

      const modal = openModal(`
        <div class="modal-head"><h2>${inv.hasReal ? 'Bring this workspace with you?' : 'Start fresh or keep the samples?'}</h2></div>
        <div class="modal-body">
          <p class="settings-hint">This device has ${esc(counts.join(' and '))} from before you signed in.${
            inv.hasDemo && !inv.hasReal
              ? ' Sample data is there to explore with — most people start their real account fresh.'
              : ' Nothing is deleted either way: anything you leave stays on this device.'
          }</p>
        </div>
        <div class="modal-foot claim-actions">
          ${choices.map(([value, label, kind]) => `
            <button class="btn ${kind === 'primary' ? 'btn-primary' : kind === 'ghost' ? 'btn-ghost' : ''}" data-claim="${value}">${esc(label)}</button>`).join('')}
        </div>`);

      $$('[data-claim]', modal).forEach((btn) => btn.addEventListener('click', () => {
        closeModal();
        resolve(btn.dataset.claim);
      }));
    });
  }

  /*
   * One-time move of a pre-scope install into its scope.
   *
   * Before scopes there was one database for everyone. For an install that was
   * already signed in, those rows are that account's — leaving them in the
   * anonymous database would offer someone's own workspace to the next person
   * as claimable anonymous data. Copy them across before anything reads.
   *
   * Runs inside init()'s try/catch and behind its watchdog, so a slow or wedged
   * copy still ends in a painted app rather than a bare shell.
   */
  async function adoptLegacyWorkspace() {
    if (!Scope.needsLegacyMigration()) return;
    const scope = Scope.current;
    try {
      if (scope !== Scope.ANON) await DB.adoptLegacy(scope);
      // Only now: the marker is what stops this running again, so it must not
      // be written over a copy that did not finish.
      Scope.markMigrated(scope);
    } catch (err) {
      // Leave the marker unwritten and try again next boot. The legacy database
      // is untouched either way, so nothing is lost by deferring.
      console.warn('Could not move this workspace into its own store yet:', err);
    }
  }

  /*
   * Reconcile the scope we booted into with the identity the server reports.
   *
   * Boot has to guess — it paints from the last known identity before /api/me
   * can answer. Once the real answer arrives, this is where a wrong guess is
   * corrected, and it is the only place an anonymous workspace is ever offered
   * to an account.
   */
  async function reconcileScope() {
    Scope.clearSignInPending();
    const target = Scope.forUser(Cloud.user && Cloud.user.id);
    if (target === Scope.current) return false;

    // Leaving an account for another (or for nobody): switch and show what
    // belongs to whoever is here now. Never merge — one account's workspace is
    // not another's to claim, whatever is still pending in it.
    if (!Scope.isAnon) {
      await switchScopeTo(target);
      return true;
    }

    // Leaving the anonymous scope for an account. This is the only claimable
    // case, and it is offered exactly once per anonymous workspace.
    const inv = await inventory();
    const claim = Scope.claimedBy();
    if (inv.isEmpty || (claim && claim.userId !== Cloud.user.id)) {
      await switchScopeTo(target);
      return true;
    }
    if (claim && claim.userId === Cloud.user.id) {
      await switchScopeTo(target);
      return true;
    }

    const choice = await askAboutAnonWorkspace(inv);
    Scope.markClaimed(Cloud.user.id);
    if (choice === 'none') {
      await switchScopeTo(target);
      toast('Signed in — this device\u2019s earlier work was left where it is');
      return true;
    }
    const moved = await claimAnonWorkspace(target, { keepDemo: choice === 'all' });
    // Cleared only once a sync confirms the rows landed — until then the
    // anonymous copy is the only other copy. Same reasoning as the
    // export/verify/delete order in the pooled-to-dedicated runbook.
    if (moved) Scope.set('claimCleanup', '1', Scope.ANON);
    if (moved) toast('Your workspace is now saved to your account');
    return true;
  }

  /*
   * Re-pull from scratch when this scope's rows belong to a different
   * workspace than the one we now sync with.
   *
   * Happens on joining a team, leaving one, or being removed from one. The
   * local replica is of the old organisation: pushing it would publish one
   * team's records into another's workspace, which is the shared-device bug
   * wearing a different hat. So push what is owed to the OLD workspace first,
   * then throw the replica away and take the new one clean.
   */
  async function reconcileWorkspace() {
    if (!Cloud.isAuthed) return false;
    /*
     * Only ever act on an answer the server actually gave.
     *
     * Offline, /api/me never resolves and Cloud falls back to the cached
     * identity, which carries no org. Treating that absence as "the workspace
     * changed" wiped the local replica the moment the connection dropped —
     * caught by the offline sync test, which is the whole reason it exists.
     * No fresh answer means no decision.
     */
    const workspaceId = Cloud.me.org && Cloud.me.org.id;
    if (!workspaceId) return false;
    if (!Scope.workspaceChanged(workspaceId)) return false;

    /*
     * Deliberately no push here.
     *
     * The session's organisation has already moved, and the server files every
     * write under the caller's CURRENT workspace — so "flushing what is owed to
     * the old workspace" would post those rows straight into the new team's
     * CRM. Anything still pending at this point cannot be delivered anywhere it
     * belongs, so it is dropped, and the user is told rather than left to
     * notice later.
     *
     * The join flow avoids reaching here with unsynced work by pushing BEFORE
     * it joins, while the old workspace is still the caller's own.
     */
    if (Scope.get('dirty')) {
      console.warn('Unsynced changes to the previous workspace could not be transferred.');
      toast('Some unsynced changes to your previous workspace could not be brought across');
      Scope.remove('dirty');
    }

    // A hard clear, not tombstones: these rows belong to a workspace we are no
    // longer part of, and a tombstone would travel to the NEW workspace and
    // delete rows there instead.
    await DB.clear('records');
    await DB.clear('modules');
    Scope.remove('snapshot');
    // Settings belong to the workspace too — the business name and currency
    // are the team's, not the person's. Dropping the local copy and its clock
    // is what lets the new workspace's settings win the pull that follows.
    Scope.remove('settings');
    Scope.remove('settingsAt');
    loadSettingsFromScope();
    Cloud.resetCursor();
    Scope.markWorkspace(workspaceId);
    relationNameCache.clear();
    await loadModules();

    // Nothing local is left to compare against, so take the new workspace
    // whole. Without this the app sits on an empty screen until something
    // else happens to trigger a sync.
    await Cloud.sync();
    relationNameCache.clear();
    await loadModules();
    return true;
  }

  // ------------------------------------------------------------ beta access
  const BETA_KEY = 'crmb:betaCode';

  /*
   * Lift a beta code out of the URL and hold on to it.
   *
   * Same shape as captureInvite() below, and device-level for the same reason:
   * the link is opened before signing in, and sign-in is a full page load. It
   * is stripped from the address bar immediately — a code that lets someone
   * create an account is a credential, not a query parameter to leave lying in
   * browser history.
   *
   * Held only; the server decides. A code in localStorage is a suggestion.
   */
  function captureBetaCode() {
    const params = new URLSearchParams(location.search);
    const code = params.get('beta');
    if (!code) return;
    try { localStorage.setItem(BETA_KEY, code); } catch { /* private mode */ }
    params.delete('beta');
    const qs = params.toString();
    history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : '') + location.hash);
    // Say that the link was understood, at the moment its code vanishes out of
    // the address bar. Without this the invite disappears silently and the
    // tester has no signal that anything happened.
    //
    // Deliberately not validated first: a client-side check would have to ask
    // the server whether this code is real, which is an oracle for enumerating
    // codes — the same reason every rejection in §13/§16 answers identically.
    // So this reports receipt, not validity, and a bad code is refused at the
    // callback with a screen that explains itself.
    //
    // Safe before the first paint: #toast-root is static in index.html and
    // route() only ever replaces #main. The toast is reassurance and it fades;
    // the onboarding call to action below is the part that has to persist,
    // because on a cold start this is gone before sign-in is even possible.
    toast('Beta invite applied');
  }

  // The team invite has to reach the signup gate, not just the join that
  // follows it: with org creation closed, an invite is what distinguishes a
  // colleague from a new tenant.
  const pendingInvite = () => {
    try { return localStorage.getItem('crmb:pendingInvite') || ''; } catch { return ''; }
  };

  const betaCode = () => {
    try { return localStorage.getItem(BETA_KEY) || ''; } catch { return ''; }
  };

  // ------------------------------------------------------------ joining a team
  const INVITE_KEY = 'crmb:pendingInvite';

  /*
   * Pick an invite code out of the URL and hold on to it.
   *
   * Device-level, not scoped: the link is usually opened before signing in,
   * and sign-in is a full page load (OAuth) or a reload (dev login), so it has
   * to survive both. Removed from the address bar immediately — an invite code
   * is a credential and does not belong in browser history or a screenshot.
   */
  function captureInvite() {
    const params = new URLSearchParams(location.search);
    const code = params.get('invite');
    if (!code) return;
    try { localStorage.setItem(INVITE_KEY, code); } catch { /* private mode */ }
    params.delete('invite');
    const qs = params.toString();
    history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : '') + location.hash);
  }

  async function redeemPendingInvite() {
    let code = null;
    try { code = localStorage.getItem(INVITE_KEY); } catch { /* none */ }
    if (!code) return false;
    if (!Cloud.isAuthed) {
      // Held until they sign in — the invite names an account, so there is
      // nobody to add yet.
      toast('Sign in to join the team you were invited to');
      return false;
    }

    let preview;
    try {
      preview = await Cloud.org.preview(code);
    } catch (err) {
      localStorage.removeItem(INVITE_KEY);
      toast(err.status === 404 ? 'That invite link is no longer valid — ask for a fresh one' : 'Could not check that invite link');
      return false;
    }
    if (preview.alreadyMember) {
      localStorage.removeItem(INVITE_KEY);
      return false;
    }

    const inv = await inventory();
    const choice = await askAboutJoining(preview.org, inv);
    if (choice === 'cancel') return false;      // asked again next time
    localStorage.removeItem(INVITE_KEY);

    try {
      // Deliver anything still pending while this is still our own workspace.
      // After the join the server would file it under the team instead.
      if (Scope.get('dirty')) await Cloud.sync().catch(() => {});
      const out = await Cloud.org.join(code, choice === 'bring');
      // /api/me is stale the moment the org changes, so refresh it before
      // anything decides which workspace this device should be holding.
      await Cloud.init({ getState: fullState, getChanges: localChanges, applyChanges: mergeChanges });
      await reconcileWorkspace();
      renderSidebar();
      route();
      toast(out.broughtRows
        ? `Joined ${out.org.name} — your work came with you`
        : `Joined ${out.org.name}`);
      return true;
    } catch (err) {
      toast(err.message || 'Could not join that team');
      return false;
    }
  }

  /*
   * The question a joiner has to answer, and it is the same one sign-in asks:
   * does the work already on this device come with you?
   *
   * Said plainly, because joining publishes it to colleagues. Someone's
   * personal contact list appearing in front of their team is not a surprise
   * to spring.
   */
  function askAboutJoining(org, inv) {
    return new Promise((resolve) => {
      const has = inv.hasReal || inv.hasDemo;
      const count = inv.realRecords.length;
      const body = has
        ? `You have ${count} record${count === 1 ? '' : 's'} on this device. You can bring them into ${org.name}, where everyone on the team will be able to see and edit them — or leave them here and start on the team's workspace.`
        : `You will share ${org.name}'s modules and records with the rest of the team.`;

      const choices = has
        ? [['fresh', `Join and start on ${org.name}'s workspace`, 'primary'],
           ['bring', 'Join and bring my work with me', ''],
           ['cancel', 'Not now', 'ghost']]
        : [['fresh', `Join ${org.name}`, 'primary'], ['cancel', 'Not now', 'ghost']];

      const modal = openModal(`
        <div class="modal-head"><h2>Join ${esc(org.name)}?</h2></div>
        <div class="modal-body">
          <p class="settings-hint">${esc(body)}</p>
          <p class="settings-hint">${esc(org.memberCount === 1 ? 'You would be the second person on this team.' : `${org.memberCount} people are already on this team.`)}</p>
        </div>
        <div class="modal-foot claim-actions">
          ${choices.map(([value, label, kind]) => `
            <button class="btn ${kind === 'primary' ? 'btn-primary' : kind === 'ghost' ? 'btn-ghost' : ''}" data-join="${value}">${esc(label)}</button>`).join('')}
        </div>`);
      $$('[data-join]', modal).forEach((btn) => btn.addEventListener('click', () => {
        closeModal();
        resolve(btn.dataset.join);
      }));
    });
  }

  async function syncInBackground() {
    await Cloud.init({ getState: fullState, getChanges: localChanges, applyChanges: mergeChanges });
    let scopeChanged = false;
    try {
      scopeChanged = await reconcileScope();
      // Identity first (whose scope), then workspace (whose data that scope is
      // a replica of). Both can move at once when someone joins a team on a
      // device where somebody else was last signed in.
      scopeChanged = (await reconcileWorkspace()) || scopeChanged;
    } catch (err) {
      console.error('Could not settle which workspace to show:', err);
    }
    if (scopeChanged) route();
    renderSidebar();
    // The onboarding screen offers "already have an account?" only once we know
    // a server exists, so repaint it now that we do.
    if (!modules.length && !$('#modal-root').firstChild) route();
    if (!Cloud.isAuthed) return;
    const { ok, changed } = await Cloud.sync();
    // Now that the claimed rows are on the server, the anonymous copy can go.
    // Leaving it would hand the next visitor to this browser the last one's
    // workspace, which is exactly what scopes exist to prevent.
    if (ok && Scope.get('claimCleanup', Scope.ANON) === '1') {
      await DB.wipeScope(Scope.ANON);
      Scope.clearKeys(Scope.ANON);
      Scope.remove('claimCleanup', Scope.ANON);
    }
    // Tombstones the whole account has long since seen. Best-effort and never
    // in the way of the sync itself.
    DB.pruneTombstones().catch(() => {});
    // After the workspace has settled, never before: joining swaps the replica
    // out, and doing that mid-sync would race the pull that is still landing.
    await redeemPendingInvite().catch((err) => console.warn('Invite could not be handled:', err));
    await showBetaNoticeIfNeeded().catch(() => { /* never block the app on a notice */ });
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

    captureInvite();
    captureBetaCode();
    const params = new URLSearchParams(location.search);
    const authError = params.get('auth_error');
    if (authError) {
      history.replaceState(null, '', location.pathname + location.hash);
      if (authError === 'beta' || authError === 'closed' || authError === 'pending') {
        // Not a failure on their part, so it gets a screen rather than a toast
        // that disappears before it has been read.
        setTimeout(() => explainClosedSignup(authError), 300);
      } else {
        toast(authError === 'disabled' ? 'This account has been disabled' : 'Sign-in failed — please try again');
      }
    }

    // Watchdog: if local data is slow or wedged, show the UI anyway. Whatever
    // loads afterwards triggers a second render.
    let painted = false;
    const paint = () => { painted = true; route(); };
    const watchdog = setTimeout(() => { if (!painted) paint(); }, 2500);

    try {
      await adoptLegacyWorkspace();
      await loadModules();

      // If IndexedDB was evicted but the localStorage snapshot survived, restore it.
      if (!modules.length) {
        try {
          const snap = JSON.parse(Scope.get('snapshot'));
          if (snap && Array.isArray(snap.modules) && snap.modules.length) {
            // The store was evicted; this is a fresh seeding, not a merge into
            // anything, so 'adopt' is both correct and a no-op clear.
            await importState(snap, { mode: 'adopt' });
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
          <button class="btn btn-primary" id="startup-reload">Reload</button>
        </div></div>`;
      const again = document.getElementById('startup-reload');
      if (again) again.addEventListener('click', () => location.reload());
    }
  });
})();
