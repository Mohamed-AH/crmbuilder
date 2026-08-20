/*
 * csv.js — RFC 4180 CSV reading and writing.
 *
 * Spreadsheets are where most small businesses keep their customer list today,
 * so import/export has to cope with what Excel, Numbers and Google Sheets
 * actually emit: BOMs, CRLF, quoted fields containing commas and newlines,
 * and doubled quotes as escapes.
 */
const CSV = (() => {
  function parse(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    let i = 0;
    // Excel writes a UTF-8 BOM; left in place it corrupts the first header.
    if (text.charCodeAt(0) === 0xfeff) i = 1;

    while (i < text.length) {
      const ch = text[i];

      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false;
          i += 1;
          continue;
        }
        field += ch;
        i += 1;
        continue;
      }

      if (ch === '"') { inQuotes = true; i += 1; continue; }
      if (ch === ',') { row.push(field); field = ''; i += 1; continue; }
      if (ch === '\r') { i += 1; continue; } // CRLF and lone CR both end the line
      if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 1; continue; }
      field += ch;
      i += 1;
    }
    // Whatever is buffered when input runs out is the final field.
    if (field !== '' || row.length) { row.push(field); rows.push(row); }

    // Drop trailing blank lines, which every spreadsheet exporter adds.
    while (rows.length && rows[rows.length - 1].every((c) => c.trim() === '')) rows.pop();
    return rows;
  }

  function escapeCell(value) {
    const s = value === undefined || value === null ? '' : String(value);
    // A leading =, +, - or @ makes spreadsheets treat the cell as a formula;
    // prefix with an apostrophe so imported data can't execute on open.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  }

  function stringify(rows) {
    return rows.map((row) => row.map(escapeCell).join(',')).join('\r\n');
  }

  return { parse, stringify, escapeCell };
})();
