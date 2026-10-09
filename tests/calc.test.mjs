/*
 * calc.test.mjs — the arithmetic behind calculated fields (CLAUDE.md §66).
 *
 * js/calc.js is plain ES5-ish source with no imports, so it is evaluated
 * directly rather than bundled — the same trick tests/dateRules.test.mjs and
 * tests/csv.test.mjs use, which is what lets the browser and these tests read
 * one file. There is deliberately no `module.exports` line in calc.js: its
 * sibling has one because server.js requires it (§39), and nothing
 * server-side calculates.
 *
 * The split is §50's: the arithmetic is unit-tested here and the wiring is
 * E2E-tested. A blanks-versus-zero bug or a divide-by-zero is invisible at
 * E2E scale — three numbers in a cell look like three numbers — and obvious
 * at this one.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(fileURLToPath(new URL('../js/calc.js', import.meta.url)), 'utf8');
// eslint-disable-next-line no-new-func
const Calc = new Function(`${src}; return Calc;`)();

// A module shaped like the one that prompted this work: production downtime
// per line, plus a figure in a different unit so a mixed set is reachable.
const MOD = {
  id: 'm1',
  fields: [
    { key: 'name', label: 'Shift', type: 'text' },
    { key: 'l1', label: 'Down time L1 (hours)', type: 'number' },
    { key: 'l2', label: 'Down time L2 (hours)', type: 'number' },
    { key: 'l3', label: 'Down time L3 (hours)', type: 'number' },
    { key: 'tons', label: 'Sales (tonnes)', type: 'number' },
    { key: 'fee', label: 'Fee', type: 'currency' },
    { key: 'cost', label: 'Cost', type: 'currency' },
  ],
};

const rec = (data) => ({ id: 'r1', moduleId: 'm1', data });
const f = (operation, inputs, extra = {}) => ({ key: 'calc', label: 'Total', type: 'formula', operation, inputs, ...extra });

describe('Calc.value — the operations', () => {
  test('sum adds the inputs', () => {
    const r = Calc.value(MOD, f('sum', ['l1', 'l2', 'l3']), rec({ l1: 2, l2: 0, l3: 1 }));
    assert.equal(r.value, 3);
    assert.equal(r.used, 3);
    assert.equal(r.total, 3);
  });

  test('average divides by the values present, not by the fields chosen', () => {
    const r = Calc.value(MOD, f('avg', ['l1', 'l2', 'l3']), rec({ l1: 2, l3: 1 }));
    assert.equal(r.value, 1.5);
    assert.equal(r.used, 2);
    assert.equal(r.total, 3);
  });

  test('minimum and maximum ignore blanks', () => {
    const row = rec({ l1: 5, l2: '', l3: 2 });
    assert.equal(Calc.value(MOD, f('min', ['l1', 'l2', 'l3']), row).value, 2);
    assert.equal(Calc.value(MOD, f('max', ['l1', 'l2', 'l3']), row).value, 5);
  });

  test('count filled counts the blanks out, which is the one case a blank IS the answer', () => {
    const r = Calc.value(MOD, f('count', ['l1', 'l2', 'l3']), rec({ l1: 2, l3: 0 }));
    assert.equal(r.value, 2);
  });

  test('a zero counts as filled — it is a measurement, not an absence', () => {
    const r = Calc.value(MOD, f('count', ['l1', 'l2']), rec({ l1: 0, l2: 0 }));
    assert.equal(r.value, 2);
  });

  test('difference subtracts in the order the inputs were picked', () => {
    assert.equal(Calc.value(MOD, f('diff', ['l1', 'l2']), rec({ l1: 5, l2: 2 })).value, 3);
    assert.equal(Calc.value(MOD, f('diff', ['l2', 'l1']), rec({ l1: 5, l2: 2 })).value, -3);
  });

  test('ratio divides in the order the inputs were picked', () => {
    assert.equal(Calc.value(MOD, f('ratio', ['l1', 'l2']), rec({ l1: 6, l2: 2 })).value, 3);
  });
});

describe('Calc.value — a blank is absent, never zero', () => {
  /*
   * The whole design, and the half that is easy to get backwards. Treating a
   * blank as zero reads perfectly plausibly and is wrong in the direction
   * nobody checks: an average over three columns where one was never filled
   * in comes out a third too low.
   */
  test('an average ignores blank values rather than dragging the result down', () => {
    const r = Calc.value(MOD, f('avg', ['l1', 'l2', 'l3']), rec({ l1: 3, l2: '', l3: 3 }));
    assert.equal(r.value, 3, 'blank treated as zero would give 2');
  });

  test('a sum of nothing is NO value, not 0', () => {
    const r = Calc.value(MOD, f('sum', ['l1', 'l2']), rec({}));
    assert.equal(r.value, null);
    assert.equal(r.reason, 'nodata');
  });

  test('a difference needs BOTH halves — a missing subtrahend is unknown, not a no-op', () => {
    const r = Calc.value(MOD, f('diff', ['l1', 'l2']), rec({ l1: 5 }));
    assert.equal(r.value, null, 'reading the blank as zero would answer 5');
    assert.equal(r.reason, 'nodata');
  });

  test('a ratio needs both halves too', () => {
    assert.equal(Calc.value(MOD, f('ratio', ['l1', 'l2']), rec({ l2: 2 })).value, null);
  });

  test('a non-numeric stored value is absent, not NaN', () => {
    // Reachable from a CSV import and a restored backup (§3), never from the
    // form — and `Number('n/a')` reaching a cell renders "NaN".
    const r = Calc.value(MOD, f('sum', ['l1', 'l2']), rec({ l1: 4, l2: 'n/a' }));
    assert.equal(r.value, 4);
    assert.equal(r.used, 1);
  });
});

describe('Calc.value — the refusals, and each says which kind of nothing it is', () => {
  test('a zero divisor is an em dash, never Infinity', () => {
    const r = Calc.value(MOD, f('ratio', ['l1', 'l2']), rec({ l1: 5, l2: 0 }));
    assert.equal(r.value, null);
    assert.equal(r.reason, 'divzero');
  });

  test('an input whose field was removed refuses, and names the key', () => {
    // Computing over what is left would turn a three-input Sum into a
    // two-input Sum and change every total on screen in silence.
    const r = Calc.value(MOD, f('sum', ['l1', 'gone']), rec({ l1: 2 }));
    assert.equal(r.value, null);
    assert.equal(r.reason, 'missingfield');
    assert.deepEqual(r.missing, ['gone']);
  });

  test('an input retyped to text refuses, the same as a removed one', () => {
    const r = Calc.value(MOD, f('sum', ['l1', 'name']), rec({ l1: 2, name: 'Monday' }));
    assert.equal(r.reason, 'missingfield');
    assert.deepEqual(r.missing, ['name']);
  });

  test('no inputs, and an unknown operation, each say so', () => {
    assert.equal(Calc.value(MOD, f('sum', []), rec({})).reason, 'noinputs');
    assert.equal(Calc.value(MOD, f('nonsense', ['l1', 'l2']), rec({ l1: 1, l2: 1 })).reason, 'nooperation');
  });

  test('an overflow is caught centrally — Infinity never reaches a cell', () => {
    const r = Calc.value(MOD, f('sum', ['l1', 'l2']), rec({ l1: 1e308, l2: 1e308 }));
    assert.equal(r.value, null);
    assert.equal(r.reason, 'overflow');
  });

  test('a non-formula field is refused rather than guessed at', () => {
    const r = Calc.value(MOD, { key: 'l1', type: 'number' }, rec({ l1: 2 }));
    assert.equal(r.reason, 'notformula');
  });
});

describe('Calc.eligibleInputs', () => {
  test('only number and currency are offered', () => {
    const keys = Calc.eligibleInputs(MOD, 'calc').map((x) => x.key);
    assert.deepEqual(keys, ['l1', 'l2', 'l3', 'tons', 'fee', 'cost']);
  });

  test('a formula may not reference another formula, which is what makes a cycle impossible', () => {
    const withTwo = { fields: [...MOD.fields, f('sum', ['l1', 'l2']), { key: 'calc2', label: 'Other', type: 'formula' }] };
    const keys = Calc.eligibleInputs(withTwo, 'calc2').map((x) => x.key);
    assert.ok(!keys.includes('calc'), 'a formula was offered as an input to another formula');
  });

  test('a formula may not reference itself', () => {
    const withSelf = { fields: [...MOD.fields, f('sum', ['l1'])] };
    assert.ok(!Calc.eligibleInputs(withSelf, 'calc').some((x) => x.key === 'calc'));
  });
});

describe('Calc.resultType', () => {
  test('all-currency inputs give a currency result', () => {
    assert.equal(Calc.resultType(MOD, f('sum', ['fee', 'cost'])), 'currency');
  });

  test('a MIXED set is a plain number — the sum of £5 and 3 is not £8', () => {
    assert.equal(Calc.resultType(MOD, f('sum', ['fee', 'tons'])), 'number');
  });

  test('a count is a tally and a ratio is dimensionless, so neither inherits a currency', () => {
    assert.equal(Calc.resultType(MOD, f('count', ['fee', 'cost'])), 'number');
    assert.equal(Calc.resultType(MOD, f('ratio', ['fee', 'cost'])), 'number');
  });
});

describe('Calc.describe', () => {
  test('names the operation and the fields, in the order picked', () => {
    assert.equal(
      Calc.describe(MOD, f('sum', ['l1', 'l2'])),
      'Sum of Down time L1 (hours), Down time L2 (hours)',
    );
  });

  test('a removed input is NAMED rather than dropped', () => {
    // Dropping it would describe a formula that is not the one stored, which
    // is how somebody concludes the rule is fine and the data is broken.
    assert.match(Calc.describe(MOD, f('sum', ['l1', 'gone'])), /gone \(removed\)/);
  });
});

describe('the operation list', () => {
  test('every key on Calc is callable', () => {
    // A stale or partial evaluation of the file fails here rather than
    // passing a shape check — §45's rule for its sibling, same reason.
    for (const [name, v] of Object.entries(Calc)) {
      assert.equal(typeof v, 'function', `Calc.${name} is not callable`);
    }
  });

  test('operations() hands out copies, so a caller cannot mutate the list', () => {
    const first = Calc.operations();
    first[0].label = 'TAMPERED';
    assert.equal(Calc.operations()[0].label, 'Sum');
  });

  test('difference and ratio take exactly two inputs; the rest are unbounded', () => {
    const byKey = Object.fromEntries(Calc.operations().map((o) => [o.key, o]));
    assert.equal(byKey.diff.max, 2);
    assert.equal(byKey.ratio.max, 2);
    assert.equal(byKey.sum.max, null);
    assert.equal(byKey.count.min, 1, 'count is the one that is useful with a single field');
  });
});
