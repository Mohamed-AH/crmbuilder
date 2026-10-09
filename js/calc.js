/*
 * js/calc.js — calculated fields: arithmetic across one record's own fields.
 *
 * docs/CALCULATIONS.md is the spec and carries the reasoning. Three things
 * here are load-bearing and are not visible in the code:
 *
 * 1. THERE IS NO EXPRESSION LANGUAGE, AND THERE MUST NOT BE ONE. A formula is
 *    an operation picked from a fixed list plus a list of field keys. Every
 *    competitor ships a formula language; this deliberately does not, because
 *    a module definition arrives in a restored backup exactly like a record
 *    value does (CLAUDE.md §3's threat model), so a formula STRING would be
 *    untrusted input — and an evaluator fed untrusted input is a
 *    code-execution sink under `script-src 'self'` (§30 Phase 4). Never
 *    `eval`, never `new Function`, whatever the apparent provenance of the
 *    string. The cost is that `(a - b) / c` is out of reach; that is the trade.
 *
 * 2. NOTHING IS STORED. The result is computed at render, every time. The
 *    DEFINITION lives on the module and syncs with it; the VALUE lives
 *    nowhere. §22's ghost data and §31's backdated rows are the local reasons.
 *    The external one is Salesforce: their formula fields are computed, their
 *    rollups are stored, and the consequence is a "Force a mass recalculation
 *    of this field" button whose whole job is repairing a stale derived number
 *    by hand.
 *
 * 3. A BLANK IS ABSENT, NOT ZERO. `sum of [2, blank, 1]` is 3 over two
 *    values, and `used`/`total` come back so the screen can say so. Reading a
 *    blank as zero silently drags an average down — §36's defect that renders
 *    as plausible, which is this repository's standing failure shape.
 *
 * Pure. No DOM, no storage, no formatting — `fmtValue` in js/app.js turns the
 * number into a cell, because that needs the workspace currency and this does
 * not. Unit-tested in tests/calc.test.mjs through a `new Function` harness, so
 * there is deliberately no `module.exports` line: js/date-rules.js has one
 * because server.js requires it (§39), and nothing server-side calculates.
 */

const Calc = (() => {
  /*
   * What an owner may pick. `max` bounds the input count and is what makes
   * "Difference" an ordered pair rather than a checklist — `a - b - c` is not
   * what anybody means by a difference. `null` is unbounded.
   *
   * A constrained list is well within industry norms rather than a compromise:
   * Salesforce's Roll-Up Summary supports COUNT, SUM, MIN and MAX and not even
   * average. This is richer than that.
   */
  const OPERATIONS = [
    { key: 'sum', label: 'Sum', min: 2, max: null },
    { key: 'avg', label: 'Average', min: 2, max: null },
    { key: 'min', label: 'Minimum', min: 2, max: null },
    { key: 'max', label: 'Maximum', min: 2, max: null },
    { key: 'count', label: 'Count filled', min: 1, max: null },
    { key: 'diff', label: 'Difference (a − b)', min: 2, max: 2 },
    { key: 'ratio', label: 'Ratio (a ÷ b)', min: 2, max: 2 },
  ];

  // A function rather than an exported array, so a caller cannot mutate the
  // list the whole app reads — and so every key on `Calc` is callable, which
  // is the shape tests/dateRules.test.mjs already pins for its sibling.
  function operations() {
    return OPERATIONS.map((o) => ({ ...o }));
  }

  function operation(key) {
    return OPERATIONS.find((o) => o.key === key) || null;
  }

  function isFormula(field) {
    return !!field && field.type === 'formula';
  }

  /*
   * Which fields a formula may point at.
   *
   * Number and currency only: offering `text` would mean parsing "2 hours",
   * which is §45's trap in a new place — a guess that is confidently wrong on
   * some rows and silently empty on others.
   *
   * And NEVER another formula. The industry caps depth because recursion is
   * where this blows up — Notion refuses to roll up a rollup, Salesforce
   * allows one level — and a flat rule makes a cycle STRUCTURALLY impossible
   * rather than something detected by walking a graph. Relax it only with a
   * real cycle check, and only if somebody actually needs two-stage
   * arithmetic.
   */
  function eligibleInputs(mod, selfKey) {
    const fields = mod && mod.fields ? mod.fields : [];
    return fields.filter((f) => (f.type === 'number' || f.type === 'currency') && f.key !== selfKey);
  }

  function isEligible(field) {
    return !!field && (field.type === 'number' || field.type === 'currency');
  }

  /*
   * The result.
   *
   * `{ value, used, total, missing, reason }` — `value` is null whenever
   * there is no honest answer, and `reason` says which kind of nothing it is.
   * Four different silences rendered as one em dash is the state that reads as
   * breakage on a row that is fine (§36, §38, §39), and a removed input is a
   * schema problem an owner can fix while an empty row is not.
   */
  function value(mod, field, record) {
    const out = { value: null, used: 0, total: 0, missing: [], reason: null };
    if (!isFormula(field)) { out.reason = 'notformula'; return out; }

    const op = operation(field.operation);
    if (!op) { out.reason = 'nooperation'; return out; }

    const keys = Array.isArray(field.inputs) ? field.inputs : [];
    if (!keys.length) { out.reason = 'noinputs'; return out; }

    const byKey = new Map((mod && mod.fields ? mod.fields : []).map((f) => [f.key, f]));
    const data = (record && record.data) || {};

    // Resolved in the order the owner picked them, because `diff` and `ratio`
    // are ordered and a filtered list would silently reorder them.
    const resolved = [];
    keys.forEach((k) => {
      const f = byKey.get(k);
      if (!isEligible(f)) { out.missing.push(k); return; }
      const raw = data[k];
      if (raw === undefined || raw === null || raw === '') { resolved.push(null); return; }
      const n = Number(raw);
      resolved.push(Number.isFinite(n) ? n : null);
    });

    out.total = resolved.length;
    const present = resolved.filter((n) => n !== null);
    out.used = present.length;

    // An input whose field has been removed, or retyped to something that
    // cannot be summed. Refused rather than computed over what is left: a
    // three-input Sum quietly becoming a two-input Sum changes every total on
    // the screen and says nothing.
    if (out.missing.length) { out.reason = 'missingfield'; return out; }

    if (op.key === 'count') {
      // The one operation for which a blank IS the information.
      out.value = present.length;
      return finish(out);
    }

    if (op.key === 'diff' || op.key === 'ratio') {
      // Both halves are required. `a − blank` is not `a`, it is unknown — an
      // absent subtrahend read as zero turns a missing figure into a
      // confident one.
      const [a, b] = resolved;
      if (a === null || b === null) { out.reason = 'nodata'; return out; }
      if (op.key === 'diff') { out.value = a - b; return finish(out); }
      // Never Infinity. A ratio with no divisor has no value, and `Infinity`
      // in a cell is worse than an em dash because it looks like a number.
      if (b === 0) { out.reason = 'divzero'; return out; }
      out.value = a / b;
      return finish(out);
    }

    if (!present.length) { out.reason = 'nodata'; return out; }
    if (op.key === 'sum') out.value = present.reduce((s, n) => s + n, 0);
    else if (op.key === 'avg') out.value = present.reduce((s, n) => s + n, 0) / present.length;
    else if (op.key === 'min') out.value = present.reduce((m, n) => (n < m ? n : m), present[0]);
    else if (op.key === 'max') out.value = present.reduce((m, n) => (n > m ? n : m), present[0]);
    return finish(out);
  }

  // One place where NaN and Infinity are caught, rather than a guard per
  // branch — absurd stored values can overflow a sum, and neither may ever
  // reach a cell.
  function finish(out) {
    if (out.value !== null && !Number.isFinite(out.value)) {
      out.value = null;
      out.reason = 'overflow';
    }
    return out;
  }

  /*
   * What kind of number comes out, so the cell can be formatted.
   *
   * A count is a tally and a ratio is dimensionless, so neither carries its
   * inputs' currency. A MIXED set falls back to a plain number rather than
   * claiming a unit, because the sum of £5 and 3 is not £8.
   */
  function resultType(mod, field) {
    if (!isFormula(field)) return 'number';
    const op = operation(field.operation);
    if (!op || op.key === 'count' || op.key === 'ratio') return 'number';
    const byKey = new Map((mod && mod.fields ? mod.fields : []).map((f) => [f.key, f]));
    const types = (Array.isArray(field.inputs) ? field.inputs : [])
      .map((k) => (byKey.get(k) || {}).type);
    return types.length && types.every((t) => t === 'currency') ? 'currency' : 'number';
  }

  /*
   * "Sum of Down time L1, Down time L2" — for the builder's read-only view and
   * the column tooltip. A calculated column whose rule the reader cannot see
   * is indistinguishable from a number somebody typed, which is the same
   * reason §37's filter names the date field it watches.
   *
   * A removed input is named by its KEY rather than dropped, because dropping
   * it describes a formula that is not the one stored.
   */
  function describe(mod, field) {
    if (!isFormula(field)) return '';
    const op = operation(field.operation);
    if (!op) return 'Not configured';
    const keys = Array.isArray(field.inputs) ? field.inputs : [];
    if (!keys.length) return `${op.label} of nothing yet`;
    const byKey = new Map((mod && mod.fields ? mod.fields : []).map((f) => [f.key, f]));
    const names = keys.map((k) => {
      const f = byKey.get(k);
      return isEligible(f) ? f.label : `${k} (removed)`;
    });
    return `${op.label} of ${names.join(', ')}`;
  }

  return { operations, operation, isFormula, isEligible, eligibleInputs, value, resultType, describe };
})();
