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

  let allSteps = [];
  let steps = [];
  let index = 0;
  let active = false;
  let hooks = { goto: null, ensureReady: null, onEnd: null };
  let root = null;
  let cleanupFns = [];

  function configure(options) {
    hooks = { ...hooks, ...options };
    if (options.steps) allSteps = options.steps;
  }

  const hasSeen = () => localStorage.getItem(SEEN_KEY) === '1';
  const markSeen = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode */ } };

  // Short on purpose. A target that is going to appear appears within a frame
  // or two of the route rendering; a longer budget just buys dead air when it
  // is never going to appear at all.
  function waitFor(selector, timeout = 2000) {
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
    cleanupFns.push(() => { if (sizeWatch) { sizeWatch.disconnect(); sizeWatch = null; } });
  }

  /*
   * Reposition when the TARGET changes size, not only when the window does.
   *
   * position() ran once, at the end of render(). Several steps force their own
   * screen in a `before` hook (§7) — a sorted table, a kanban board — and those
   * re-renders are async: when one lands after the card has been placed, the
   * target grows underneath it and the card ends up sitting on the ring it is
   * pointing at. That is the "step N card covers its own highlight" failure,
   * and it moved between steps depending on which re-render won the race, which
   * is exactly what made it read as flakiness rather than a bug.
   *
   * The pop is watched too: its height depends on the copy, and a taller card
   * changes which side it can fit on.
   *
   * No feedback loop — position() sets left/top, which a ResizeObserver does
   * not fire on.
   */
  let sizeWatch = null;
  function watchGeometry() {
    if (typeof ResizeObserver === 'undefined' || !root) return; // degrade, never throw
    if (!sizeWatch) sizeWatch = new ResizeObserver(() => position());
    sizeWatch.disconnect();
    if (currentTarget) sizeWatch.observe(currentTarget);
    const pop = root.querySelector('.tour-pop');
    if (pop) sizeWatch.observe(pop);
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

    /*
     * Place against the RING, not the target.
     *
     * The ring is drawn at r ± PAD, so a card measured clear of the target
     * could still sit on the highlight by up to PAD a side. That is what a
     * user sees, and what the E2E check measures.
     */
    const ringBox = { left: r.left - PAD, top: r.top - PAD, right: r.right + PAD, bottom: r.bottom + PAD };

    /*
     * One axis is FIXED per side, and only the cross axis is clamped.
     *
     * The previous version chose a candidate and then clamped both axes into
     * the viewport, which could slide the card straight back over the ring it
     * had just been placed clear of. Here "below" pins top to the ring's
     * bottom edge and only slides horizontally, so it cannot overlap whatever
     * the clamp does. Same for the other three.
     */
    const room = {
      below: vh - M - (ringBox.bottom + gap),
      above: (ringBox.top - gap) - M,
      right: vw - M - (ringBox.right + gap),
      left: (ringBox.left - gap) - M,
    };
    const acrossX = clamp(r.left + r.width / 2 - pw / 2, M, Math.max(M, vw - pw - M));
    const acrossY = clamp(r.top + r.height / 2 - ph / 2, M, Math.max(M, vh - ph - M));
    const slots = {
      below: { left: acrossX, top: ringBox.bottom + gap, ok: room.below >= ph },
      above: { left: acrossX, top: ringBox.top - gap - ph, ok: room.above >= ph },
      right: { left: ringBox.right + gap, top: acrossY, ok: room.right >= pw },
      left: { left: ringBox.left - gap - pw, top: acrossY, ok: room.left >= pw },
    };

    // Preference order: the step's hint first, then the rest.
    const order = [step.place, 'below', 'above', 'right', 'left']
      .filter((p, i, a) => p && p !== 'auto' && a.indexOf(p) === i);

    /*
     * If ANY side has room, the card goes there and cannot cover the ring.
     *
     * The old fallback was `find(fits)` — a placement that fits on screen
     * whether or not it overlaps — so a target tall enough to leave no room
     * above or below got a card laid over it. That is a real bug a user sees,
     * and it fired more often once the demo dataset grew: more rows means a
     * taller table means less room above and below it.
     */
    let chosen = order.map((p) => slots[p]).find((s) => s.ok);

    if (!chosen) {
      // Nothing has room for the whole card. Take the roomiest side and sit at
      // the far edge of it — still the least-bad answer, and deterministic.
      const best = Object.keys(room).reduce((a, b) => (room[b] > room[a] ? b : a));
      chosen = best === 'below' ? { left: acrossX, top: Math.max(M, vh - ph - M) }
        : best === 'above' ? { left: acrossX, top: M }
          : best === 'right' ? { left: Math.max(M, vw - pw - M), top: acrossY }
            : { left: M, top: acrossY };
    }

    pop.style.left = `${clamp(chosen.left, M, Math.max(M, vw - pw - M))}px`;
    pop.style.top = `${clamp(chosen.top, M, Math.max(M, vh - ph - M))}px`;
  }

  async function render() {
    const step = steps[index];
    // Rendering a step spans several awaits — navigation, waiting for the
    // target, letting scroll settle. The visitor can skip at any point in
    // there, which tears the chrome down underneath us.
    const stillRunning = () => active && root;

    const pop = root.querySelector('.tour-pop');
    pop.classList.add('is-loading');

    if (step.route && hooks.goto) {
      const moved = await hooks.goto(step.route);
      if (!stillRunning()) return;
      if (moved === false) {
        // Pre-flight passed but the screen went away since. Rather than
        // narrating this step over the wrong background, move past it.
        console.warn(`Tour step "${step.title}" skipped: could not open its screen.`);
        return go(index + 1);
      }
    }
    if (!stillRunning()) return;

    if (step.before) {
      try { await step.before(); } catch (err) { console.warn('Tour step setup failed:', err); }
      if (!stillRunning()) return;
    }

    currentTarget = step.target ? await waitFor(step.target) : null;
    if (!stillRunning()) return;
    if (step.target && !currentTarget) {
      // Show the step centred rather than sitting in a loading state: the copy
      // still stands on its own, and a stalled card reads as a frozen app.
      console.warn(`Tour step "${step.title}": "${step.target}" never appeared; showing it unanchored.`);
    }

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
    watchGeometry();
  }

  async function go(next) {
    if (!active) return;
    if (next < 0) return;
    if (next >= steps.length) return stop(false);
    index = next;
    await render();
  }

  /*
   * Pre-flight, then run.
   *
   * The tour points at real screens, so it is only honest if those screens can
   * exist. Two things are checked before anything is shown:
   *   1. the workspace it describes is actually there
   *   2. every step's route resolves — a step whose module is missing would
   *      otherwise be narrated over whatever happened to be on screen
   * Steps that cannot work are dropped, so "Step 2 of 5" stays true.
   */
  async function start() {
    if (active) return { ok: false, reason: 'The tour is already running.' };
    if (!allSteps.length) return { ok: false, reason: 'No tour steps are configured.' };

    if (hooks.ensureReady) {
      let ready;
      try {
        ready = await hooks.ensureReady();
      } catch (err) {
        console.error('Tour setup failed:', err);
        return { ok: false, reason: err.message || 'The sample workspace could not be prepared.' };
      }
      if (!ready || ready.ok !== true) {
        return { ok: false, reason: (ready && ready.reason) || 'The sample workspace could not be prepared.' };
      }
    }

    steps = allSteps.filter((step) => {
      if (!step.route) return true;
      const hash = typeof step.route === 'function' ? step.route() : step.route;
      // Unusable means an unresolved id: "#/m/undefined" or "#/m/". Plain
      // "#/" is the dashboard and is perfectly valid — an endsWith('/') check
      // would silently drop it.
      const usable = !!hash
        && !/\b(undefined|null)\b/.test(hash)
        && !/#\/m\/?$/.test(hash);
      if (!usable) console.warn(`Tour step "${step.title}" skipped: its screen is unavailable.`);
      return usable;
    });
    if (!steps.length) return { ok: false, reason: 'None of the tour screens are available.' };

    active = true;
    index = 0;
    buildChrome();
    await render();
    return { ok: true };
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
