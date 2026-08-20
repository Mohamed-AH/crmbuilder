/*
 * csv.test.mjs — unit tests for the CSV reader/writer.
 * The parser is plain ES5-ish source with no imports, so it is evaluated
 * directly rather than bundled.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(fileURLToPath(new URL('../js/csv.js', import.meta.url)), 'utf8');
// eslint-disable-next-line no-new-func
const CSV = new Function(`${src}; return CSV;`)();

describe('CSV.parse', () => {
  test('parses a simple grid', () => {
    assert.deepEqual(CSV.parse('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
  });

  test('handles CRLF line endings', () => {
    assert.deepEqual(CSV.parse('a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]);
  });

  test('strips a UTF-8 BOM from the first header', () => {
    assert.deepEqual(CSV.parse('﻿name,email\nA,a@b.c'), [['name', 'email'], ['A', 'a@b.c']]);
  });

  test('keeps commas inside quoted fields', () => {
    assert.deepEqual(CSV.parse('name,note\n"Okafor, Tom",hello'), [['name', 'note'], ['Okafor, Tom', 'hello']]);
  });

  test('unescapes doubled quotes', () => {
    assert.deepEqual(CSV.parse('q\n"She said ""hi"""'), [['q'], ['She said "hi"']]);
  });

  test('treats a mid-field quote as a literal character', () => {
    // Not strictly RFC 4180, but hand-edited files do this and silently
    // dropping the quotes corrupts the value.
    assert.deepEqual(CSV.parse('name\nDaniel "Danny" Boyd'), [['name'], ['Daniel "Danny" Boyd']]);
    assert.deepEqual(CSV.parse('a,b\n5" pipe,ok'), [['a', 'b'], ['5" pipe', 'ok']]);
  });

  test('still treats a leading quote as a field opener', () => {
    assert.deepEqual(CSV.parse('name\n"Boyd, Daniel"'), [['name'], ['Boyd, Daniel']]);
    // An empty quoted field is preserved when the row has other content. A row
    // that is *only* an empty quoted field is indistinguishable from the
    // trailing blank line spreadsheets emit, and is trimmed with them.
    assert.deepEqual(CSV.parse('a,b\n"",x'), [['a', 'b'], ['', 'x']]);
  });

  test('keeps newlines inside quoted fields', () => {
    assert.deepEqual(CSV.parse('note\n"line one\nline two"'), [['note'], ['line one\nline two']]);
  });

  test('preserves empty cells', () => {
    assert.deepEqual(CSV.parse('a,b,c\n1,,3'), [['a', 'b', 'c'], ['1', '', '3']]);
  });

  test('drops trailing blank lines', () => {
    assert.deepEqual(CSV.parse('a\n1\n\n'), [['a'], ['1']]);
  });

  test('returns nothing for empty input', () => {
    assert.deepEqual(CSV.parse(''), []);
  });
});

describe('CSV.stringify', () => {
  test('quotes only what needs quoting', () => {
    assert.equal(CSV.stringify([['a', 'b,c'], ['1', 'plain']]), 'a,"b,c"\r\n1,plain');
  });

  test('escapes embedded quotes', () => {
    assert.equal(CSV.stringify([['say "hi"']]), '"say ""hi"""');
  });

  test('renders null and undefined as empty cells', () => {
    assert.equal(CSV.stringify([[null, undefined, 0]]), ',,0');
  });

  test('defuses spreadsheet formula injection', () => {
    // =cmd|... in a cell executes on open in Excel; the apostrophe prevents it.
    assert.equal(CSV.stringify([['=1+1']]), "'=1+1");
    assert.equal(CSV.stringify([['+A1']]), "'+A1");
    assert.equal(CSV.stringify([['@SUM(A1)']]), "'@SUM(A1)");
    assert.equal(CSV.stringify([['-2']]), "'-2");
  });
});

describe('round trip', () => {
  test('survives a realistic export/import cycle', () => {
    const rows = [
      ['Full name', 'Email', 'Notes'],
      ['Amira Hassan', 'amira@brightbakery.com', 'Prefers email, calls after 5pm'],
      ['Tom "TJ" Okafor', 'tom@okafor.com', 'Multi\nline\nnote'],
      ['Zoë Martin', '', ''],
    ];
    assert.deepEqual(CSV.parse(CSV.stringify(rows)), rows);
  });
});
