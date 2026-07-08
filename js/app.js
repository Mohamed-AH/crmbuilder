/*
 * app.js — routing, views, and interactions for CRM Builder.
 * Depends on DB (db.js) and TEMPLATES (templates.js).
 */
/* global DB, TEMPLATES */
(() => {
  'use strict';

  // ---------------------------------------------------------------- state
  let modules = [];
  const viewState = new Map(); // moduleId -> { q: '', view: 'table'|'kanban' }
  let deferredInstall = null;

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

  const MODULE_COLORS = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#db2777', '#7c3aed', '#dc2626', '#475569'];
  const MODULE_ICONS = ['📦', '👤', '🏢', '💰', '✅', '🎯', '📝', '📅', '🧾', '🛠', '🚚', '⭐'];

  // ---------------------------------------------------------------- utils
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
    return (shown.length ? shown : mod.fields).slice(0, 5);
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
      return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    } catch {
      return `$${n}`;
    }
  }

  function fmtDate(v) {
    if (!v) return '';
    const d = new Date(`${v}T00:00:00`);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // Formats a stored value for display, sync. Relation names resolve via cache.
  const relationNameCache = new Map(); // recordId -> display name

  function fmtValue(field, value) {
    if (value === undefined || value === null || value === '') return '<span class="muted">—</span>';
    switch (field.type) {
      case 'currency': return esc(fmtCurrency(value));
      case 'date': return esc(fmtDate(value));
      case 'checkbox': return value ? '<span class="check-yes">✓</span>' : '<span class="muted">—</span>';
      case 'url': return `<a href="${esc(value)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${esc(String(value).replace(/^https?:\/\//, ''))}</a>`;
      case 'email': return `<a href="mailto:${esc(value)}" onclick="event.stopPropagation()">${esc(value)}</a>`;
      case 'phone': return `<a href="tel:${esc(value)}" onclick="event.stopPropagation()">${esc(value)}</a>`;
      case 'select': return `<span class="pill">${esc(value)}</span>`;
      case 'relation': return esc(relationNameCache.get(value) || '(linked record)');
      case 'textarea': {
        const s = String(value);
        return esc(s.length > 60 ? `${s.slice(0, 60)}…` : s);
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
  function renderSidebar() {
    const nav = $('#nav-modules');
    const current = location.hash;
    nav.innerHTML = modules.map((m) => `
      <a href="#/m/${m.id}" class="nav-link ${current === `#/m/${m.id}` ? 'active' : ''}">
        <span class="nav-icon" style="background:${esc(m.color)}22">${esc(m.icon)}</span>
        <span class="nav-label">${esc(m.name)}</span>
      </a>`).join('') || '<p class="nav-empty">No modules yet</p>';
    $$('#nav-main .nav-link, .sidebar-footer .nav-link').forEach((a) => {
      a.classList.toggle('active', a.getAttribute('href') === (current || '#/'));
    });
  }

  function closeSidebar() {
    document.body.classList.remove('sidebar-open');
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
      .slice(0, 8);

    main.innerHTML = `
      <div class="page">
        <div class="page-head">
          <h1>Dashboard</h1>
          <p class="subtitle">Your CRM at a glance.</p>
        </div>
        <div class="stat-grid">
          ${counts.map(({ mod, records }) => `
            <a class="stat-card" href="#/m/${mod.id}" style="--accent:${esc(mod.color)}">
              <span class="stat-icon">${esc(mod.icon)}</span>
              <span class="stat-count">${records.length}</span>
              <span class="stat-label">${esc(mod.name)}</span>
            </a>`).join('')}
          <button class="stat-card stat-card-add" id="dash-add-module">
            <span class="stat-icon">＋</span>
            <span class="stat-label">Add module</span>
          </button>
        </div>
        <div class="card">
          <div class="card-head"><h2>Recent activity</h2></div>
          ${recent.length ? `
            <ul class="recent-list">
              ${recent.map(({ mod, r }) => `
                <li>
                  <a href="#/m/${mod.id}" class="recent-item">
                    <span class="nav-icon" style="background:${esc(mod.color)}22">${esc(mod.icon)}</span>
                    <span class="recent-name">${esc(recordName(mod, r))}</span>
                    <span class="recent-meta">${esc(mod.name)} · ${new Date(r.updatedAt).toLocaleDateString()}</span>
                  </a>
                </li>`).join('')}
            </ul>` : '<p class="empty-hint">No records yet. Open a module and add your first record.</p>'}
        </div>
      </div>`;
    $('#dash-add-module').addEventListener('click', () => openBuilder(null));
  }

  function renderOnboarding(main) {
    main.innerHTML = `
      <div class="page onboarding">
        <div class="onboard-hero">
          <span class="brand-logo big" aria-hidden="true"></span>
          <h1>Build your CRM</h1>
          <p class="subtitle">Pick the modules your business needs. You can add custom modules and fields anytime, and everything works offline on this device.</p>
        </div>
        <div class="template-grid">
          ${TEMPLATES.map((t, i) => `
            <label class="template-card" style="--accent:${esc(t.color)}">
              <input type="checkbox" data-template="${i}" ${['contacts', 'deals', 'tasks'].includes(t.key) ? 'checked' : ''}>
              <span class="template-icon">${esc(t.icon)}</span>
              <span class="template-name">${esc(t.name)}</span>
              <span class="template-desc">${esc(t.description)}</span>
            </label>`).join('')}
        </div>
        <div class="onboard-actions">
          <label class="checkbox-line"><input type="checkbox" id="onboard-samples" checked> Include a few sample records</label>
          <div class="onboard-buttons">
            <button class="btn btn-primary" id="onboard-create">Create my CRM</button>
            <button class="btn btn-ghost" id="onboard-custom">Start with a custom module instead</button>
          </div>
        </div>
      </div>`;
    $('#onboard-create').addEventListener('click', async () => {
      const picked = $$('input[data-template]:checked', main).map((cb) => TEMPLATES[Number(cb.dataset.template)]);
      if (!picked.length) {
        toast('Pick at least one module');
        return;
      }
      const withSamples = $('#onboard-samples').checked;
      for (const t of picked) await createFromTemplate(t, withSamples);
      await loadModules();
      renderSidebar();
      location.hash = `#/m/${modules[0].id}`;
      toast('Your CRM is ready 🎉');
    });
    $('#onboard-custom').addEventListener('click', () => openBuilder(null));
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
      <div class="page">
        <div class="page-head module-head">
          <h1><span class="module-title-icon" style="background:${esc(mod.color)}22">${esc(mod.icon)}</span> ${esc(mod.name)}
            <span class="count-badge">${records.length}</span></h1>
          <div class="module-actions">
            <input type="search" id="record-search" class="input search-input" placeholder="Search ${esc(mod.name.toLowerCase())}…" value="${esc(st.q)}">
            ${kf ? `
              <div class="seg" role="group" aria-label="View">
                <button class="seg-btn ${st.view === 'table' ? 'on' : ''}" data-view="table" title="Table view">☰</button>
                <button class="seg-btn ${st.view === 'kanban' ? 'on' : ''}" data-view="kanban" title="Board view">▦</button>
              </div>` : ''}
            <button class="icon-btn" id="edit-module-btn" title="Edit module">✎</button>
            <button class="btn btn-primary" id="add-record-btn">＋ Add</button>
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
      return `<div class="card"><p class="empty-hint">Nothing here yet. Hit <strong>＋ Add</strong> to create your first ${esc(mod.name.toLowerCase().replace(/s$/, ''))}.</p></div>`;
    }
    return `
      <div class="card table-wrap">
        <table class="records-table">
          <thead><tr>${cols.map((f) => `<th>${esc(f.label)}</th>`).join('')}</tr></thead>
          <tbody>
            ${records.map((r) => `
              <tr data-record="${r.id}" tabindex="0">
                ${cols.map((f) => `<td data-label="${esc(f.label)}">${fmtValue(f, r.data[f.key])}</td>`).join('')}
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
    // kanban drag & drop
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
        <button class="icon-btn" data-close aria-label="Close">✕</button>
      </div>
      <form id="record-form" class="modal-body">${fieldsHTML}</form>
      <div class="modal-foot">
        ${!isNew ? '<button class="btn btn-danger-ghost" id="record-delete">Delete</button>' : '<span></span>'}
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
      closeModal();
      toast(isNew ? 'Added' : 'Saved');
      renderModuleBodyOnly(mod);
    });
    const delBtn = $('#record-delete', modal);
    if (delBtn) {
      delBtn.addEventListener('click', async () => {
        if (!confirm('Delete this record? This cannot be undone.')) return;
        await DB.delete('records', record.id);
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
        <span class="drag-dots" aria-hidden="true">⋮⋮</span>
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
        <button class="icon-btn bf-up" title="Move up">↑</button>
        <button class="icon-btn bf-remove" title="Remove field">✕</button>
      </div>`;
  }

  function openBuilder(mod) {
    const isNew = !mod;
    const draft = mod || { name: '', icon: '📦', color: MODULE_COLORS[modules.length % MODULE_COLORS.length], fields: [{ label: 'Name', key: 'name', type: 'text', required: true, showInList: true }] };

    const modal = openModal(`
      <div class="modal-head">
        <h2>${isNew ? 'New module' : `Edit ${esc(mod.name)}`}</h2>
        <button class="icon-btn" data-close aria-label="Close">✕</button>
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
              ${MODULE_ICONS.map((i) => `<button class="swatch ${i === draft.icon ? 'on' : ''}" data-icon="${i}">${i}</button>`).join('')}
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
          <button class="btn btn-ghost" id="b-add-field">＋ Add field</button>
        </div>
      </div>
      <div class="modal-foot">
        ${!isNew ? '<button class="btn btn-danger-ghost" id="b-delete">Delete module</button>' : '<span></span>'}
        <div class="modal-foot-right">
          <button class="btn btn-ghost" data-close>Cancel</button>
          <button class="btn btn-primary" id="b-save">${isNew ? 'Create module' : 'Save changes'}</button>
        </div>
      </div>`, { wide: true });

    let icon = draft.icon;
    let color = draft.color;
    $$('[data-close]', modal).forEach((b) => b.addEventListener('click', closeModal));
    $('#b-icons', modal).addEventListener('click', (e) => {
      const b = e.target.closest('[data-icon]');
      if (!b) return;
      icon = b.dataset.icon;
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
        icon,
        color,
        fields,
      };
      await DB.put('modules', saved);
      await loadModules();
      closeModal();
      renderSidebar();
      toast(isNew ? `${name} module created` : 'Module updated');
      location.hash = `#/m/${saved.id}`;
      if (location.hash === `#/m/${saved.id}`) route();
    });

    const delBtn = $('#b-delete', modal);
    if (delBtn) {
      delBtn.addEventListener('click', async () => {
        if (!confirm(`Delete "${mod.name}" and ALL of its records? This cannot be undone.`)) return;
        await DB.deleteRecordsByModule(mod.id);
        await DB.delete('modules', mod.id);
        await loadModules();
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
    main.innerHTML = `
      <div class="page">
        <div class="page-head">
          <h1>Settings</h1>
          <p class="subtitle">${modules.length} module${modules.length === 1 ? '' : 's'} · ${allRecords.length} record${allRecords.length === 1 ? '' : 's'} — stored privately in this browser.</p>
        </div>
        <div class="card">
          <div class="card-head"><h2>Backup & restore</h2></div>
          <p class="settings-hint">Your data lives only on this device. Export a backup file regularly, or use it to move your CRM to another device.</p>
          <div class="btn-row">
            <button class="btn btn-primary" id="export-btn">⬇ Export data (JSON)</button>
            <button class="btn" id="import-btn">⬆ Import backup</button>
            <input type="file" id="import-file" accept="application/json,.json" class="hidden">
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h2>App</h2></div>
          <div class="btn-row">
            <button class="btn ${deferredInstall ? '' : 'hidden'}" id="settings-install">⬇ Install on this device</button>
            <button class="btn" id="add-template-btn">＋ Add module from template</button>
          </div>
        </div>
        <div class="card danger-zone">
          <div class="card-head"><h2>Danger zone</h2></div>
          <div class="btn-row">
            <button class="btn btn-danger-ghost" id="reset-btn">Delete all data</button>
          </div>
        </div>
      </div>`;

    $('#export-btn').addEventListener('click', exportData);
    $('#import-btn').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', importData);
    $('#reset-btn').addEventListener('click', async () => {
      if (!confirm('Delete ALL modules and records from this device? Export a backup first if you might need this data.')) return;
      await DB.clear('records');
      await DB.clear('modules');
      await loadModules();
      renderSidebar();
      toast('All data deleted');
      location.hash = '#/';
    });
    const installBtn = $('#settings-install');
    if (installBtn) installBtn.addEventListener('click', promptInstall);
    $('#add-template-btn').addEventListener('click', openTemplatePicker);
  }

  function openTemplatePicker() {
    const modal = openModal(`
      <div class="modal-head">
        <h2>Add module from template</h2>
        <button class="icon-btn" data-close aria-label="Close">✕</button>
      </div>
      <div class="modal-body">
        <div class="template-list">
          ${TEMPLATES.map((t, i) => `
            <button class="template-line" data-template="${i}" style="--accent:${esc(t.color)}">
              <span class="template-icon">${esc(t.icon)}</span>
              <span><strong>${esc(t.name)}</strong><br><span class="muted">${esc(t.description)}</span></span>
            </button>`).join('')}
        </div>
      </div>`, { wide: true });
    $$('[data-close]', modal).forEach((b) => b.addEventListener('click', closeModal));
    $$('.template-line', modal).forEach((b) => b.addEventListener('click', async () => {
      const t = TEMPLATES[Number(b.dataset.template)];
      const mod = await createFromTemplate(t, false);
      await loadModules();
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
    await DB.clear('records');
    await DB.clear('modules');
    for (const m of payload.modules) await DB.put('modules', m);
    for (const r of payload.records) await DB.put('records', r);
    await loadModules();
    renderSidebar();
    toast('Backup imported');
    location.hash = '#/';
    route();
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
    toast('CRM Builder installed 🎉');
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
    else renderDashboard();
  }

  async function init() {
    await loadModules();
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
