/*
 * tour.js — a guided walkthrough for self-serve visitors.
 *
 * No dependencies. A step names a target selector, optionally a route to visit
 * first, and optionally an action to perform so the visitor sees the product
 * doing something rather than being told about it.
 *
 * Exposes Tour.start() / Tour.stop() / Tour.hasSeen(). The host app supplies
 * navigation and demo-data loading via Tour.configure(), so this file knows
 * nothing about the CRM's internals.
 */
const Tour = (() => {
  const SEEN_KEY = 'crmb:tourSeen';
  const PAD = 6;

  let steps = [];
  let index = 0;
  let active = false;
  let hooks = { goto: null, ensureData: null, onEnd: null };
  let root = null;
  let cleanupFns = [];

  function configure(options) {
    hooks = { ...hooks, ...options };
    if (options.steps) steps = options.steps;
  }

  const hasSeen = () => localStorage.getItem(SEEN_KEY) === '1';
  const markSeen = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode */ } };

  function waitFor(selector, timeout = 6000) {
    return new Promise((resolve) => {
      const found = document.querySelector(selector);
      if (found) return resolve(found);
      const started = Date.now();
      const tick = setInterval(() => {
        const el = document.querySelector(selector);
        if (el || Date.now() - started > timeout) {
          clearInterval(tick);
          resolve(el || null);
        }
      }, 80);
    });
  }

  function buildChrome() {
    root = document.createElement('div');
    root.className = 'tour-root';
    root.innerHTML = `
      <div class="tour-scrim" data-tour-scrim></div>
      <div class="tour-ring" data-tour-ring aria-hidden="true"></div>
      <div class="tour-pop" role="dialog" aria-modal="true" aria-labelledby="tour-title">
        <p class="tour-count" data-tour-count></p>
        <h3 id="tour-title" data-tour-title></h3>
        <p class="tour-body" data-tour-body></p>
        <div class="tour-actions">
          <button class="btn btn-ghost tour-skip" data-tour-skip>Skip tour</button>
          <span class="tour-spacer"></span>
          <button class="btn tour-back" data-tour-back>Back</button>
          <button class="btn btn-primary tour-next" data-tour-next>Next</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    document.body.classList.add('tour-open');

    root.querySelector('[data-tour-skip]').addEventListener('click', () => stop(true));
    root.querySelector('[data-tour-scrim]').addEventListener('click', () => stop(true));
    root.querySelector('[data-tour-back]').addEventListener('click', () => go(index - 1));
    root.querySelector('[data-tour-next]').addEventListener('click', () => go(index + 1));

    const onKey = (e) => {
      if (!active) return;
      if (e.key === 'Escape') stop(true);
      if (e.key === 'ArrowRight' || e.key === 'Enter') go(index + 1);
      if (e.key === 'ArrowLeft') go(index - 1);
    };
    document.addEventListener('keydown', onKey);
    cleanupFns.push(() => document.removeEventListener('keydown', onKey));

    const onResize = () => position();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    cleanupFns.push(() => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    });
  }

  let currentTarget = null;

  function position() {
    if (!root || !active) return;
    const ring = root.querySelector('[data-tour-ring]');
    const pop = root.querySelector('.tour-pop');
    const step = steps[index];

    if (!currentTarget) {
      // No anchor: centre the card and hide the highlight.
      ring.style.opacity = '0';
      pop.style.left = `${(window.innerWidth - pop.offsetWidth) / 2}px`;
      pop.style.top = `${(window.innerHeight - pop.offsetHeight) / 2}px`;
      return;
    }

    const r = currentTarget.getBoundingClientRect();
    ring.style.opacity = '1';
    ring.style.left = `${r.left - PAD}px`;
    ring.style.top = `${r.top - PAD}px`;
    ring.style.width = `${r.width + PAD * 2}px`;
    ring.style.height = `${r.height + PAD * 2}px`;

    const gap = 14;
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const M = 12;

    const clamp = (v, min, max) => Math.max(min, Math.min(v, max));
    const candidates = {
      below: { left: r.left + r.width / 2 - pw / 2, top: r.bottom + gap },
      above: { left: r.left + r.width / 2 - pw / 2, top: r.top - ph - gap },
      right: { left: r.right + gap, top: r.top + r.height / 2 - ph / 2 },
      left: { left: r.left - pw - gap, top: r.top + r.height / 2 - ph / 2 },
    };

    // Preference order: the step's hint first, then the rest.
    const order = [step.place, 'below', 'above', 'right', 'left'].filter((p, i, a) => p && p !== 'auto' && a.indexOf(p) === i);

    // A card sitting on top of the thing it is describing is the failure mode
    // worth avoiding — a large target (a whole board) makes it easy to hit.
    const fits = (c) => c.left >= M && c.top >= M && c.left + pw <= vw - M && c.top + ph <= vh - M;
    const clear = (c) => c.left + pw < r.left || c.left > r.right || c.top + ph < r.top || c.top > r.bottom;

    let chosen = order.map((p) => candidates[p]).find((c) => fits(c) && clear(c));
    if (!chosen) chosen = order.map((p) => candidates[p]).find((c) => fits(c));
    if (!chosen) chosen = candidates.below;

    pop.style.left = `${clamp(chosen.left, M, vw - pw - M)}px`;
    pop.style.top = `${clamp(chosen.top, M, vh - ph - M)}px`;
  }

  async function render() {
    const step = steps[index];
    // Rendering a step spans several awaits — navigation, waiting for the
    // target, letting scroll settle. The visitor can skip at any point in
    // there, which tears the chrome down underneath us.
    const stillRunning = () => active && root;

    const pop = root.querySelector('.tour-pop');
    pop.classList.add('is-loading');

    if (step.route && hooks.goto) await hooks.goto(step.route);
    if (!stillRunning()) return;

    if (step.before) {
      try { await step.before(); } catch (err) { console.warn('Tour step setup failed:', err); }
      if (!stillRunning()) return;
    }

    currentTarget = step.target ? await waitFor(step.target) : null;
    if (!stillRunning()) return;

    if (currentTarget) {
      currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' });
      // Let smooth scrolling settle before measuring.
      await new Promise((r) => setTimeout(r, 220));
      if (!stillRunning()) return;
    }

    root.querySelector('[data-tour-count]').textContent = `Step ${index + 1} of ${steps.length}`;
    root.querySelector('[data-tour-title]').textContent = step.title;
    root.querySelector('[data-tour-body]').textContent = step.body;
    root.querySelector('[data-tour-back]').style.visibility = index === 0 ? 'hidden' : 'visible';
    root.querySelector('[data-tour-next]').textContent = index === steps.length - 1 ? 'Finish' : 'Next';
    pop.classList.remove('is-loading');
    position();
  }

  async function go(next) {
    if (!active) return;
    if (next < 0) return;
    if (next >= steps.length) return stop(false);
    index = next;
    await render();
  }

  async function start({ force = false } = {}) {
    if (active) return;
    if (!steps.length) return;
    if (hooks.ensureData) {
      try { await hooks.ensureData(); } catch (err) { console.warn('Tour data setup failed:', err); }
    }
    active = true;
    index = 0;
    buildChrome();
    await render();
    if (force) markSeen();
  }

  function stop(skipped) {
    if (!active) return;
    active = false;
    markSeen();
    cleanupFns.forEach((fn) => fn());
    cleanupFns = [];
    if (root) root.remove();
    root = null;
    currentTarget = null;
    document.body.classList.remove('tour-open');
    if (hooks.onEnd) hooks.onEnd({ skipped: !!skipped });
  }

  return { configure, start, stop, hasSeen, get isActive() { return active; } };
})();
