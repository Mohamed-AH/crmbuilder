/*
 * dsar.js — finding every place one person appears in a workspace.
 *
 * A subject access request asks "what do you hold about me". This data model
 * has **no concept of a data subject**: a person is a record in Contacts, but
 * their name may equally sit in a Notes body, in a relation on a Deal, or in a
 * custom field somebody invented last year. So this is a SEARCH across every
 * value of every record, not a lookup — and the shape of the answer is a list
 * of places to go and look, not an automatic extract.
 *
 * Deliberately pure and deliberately here rather than in `js/app.js`: the
 * matching rules are the part worth unit-testing, and `tests/dsar.test.mjs`
 * requires this file through the same seam `js/date-rules.js` uses (§39). The
 * browser gets the global; Node gets the export.
 *
 * It searches what is on THIS DEVICE. The caller syncs first — a stale replica
 * would answer a legal question with yesterday's data.
 */
const DSAR = (() => {
  /*
   * Two characters, not one.
   *
   * One character matches most of a workspace and buries the real hits, and
   * three would refuse "Li" and "Ng" — real surnames, and refusing to search
   * for somebody's actual name is a worse failure than a noisy result the
   * caller is going to review anyway.
   */
  const MIN_QUERY = 2;

  /*
   * Case- and accent-insensitive, both sides.
   *
   * "Jose" has to find "José" and "Muller" has to find "Müller", or the tool
   * answers "we hold nothing about you" about somebody whose name the CRM
   * spells correctly — the one wrong answer a DSAR must never give.
   */
  const fold = (s) => String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

  /*
   * What a value reads as, or null when it is not text to search.
   *
   * **A relation is matched on the resolved NAME, never the stored id.** The
   * id is a uuid nobody will ever type, and the name is the whole reason the
   * plan called this out: a person can appear on a Deal without their name
   * being anywhere in that Deal's own values.
   *
   * Numbers, currency amounts and checkboxes are skipped because they are
   * stored as JS numbers and booleans rather than strings — so the rule is
   * "search the text", not a type allow-list somebody has to keep in step with
   * `FIELD_TYPES`. The honest consequence: a reference number typed into a
   * **Number** field is not found. Stated in the user guide rather than fixed,
   * because matching digits across every amount in a workspace produces noise
   * that buries the name the search was actually for.
   */
  function readable(field, raw, relationNames) {
    if (field && field.type === 'relation') {
      const name = relationNames && relationNames.get(raw);
      return name ? String(name) : null;
    }
    return typeof raw === 'string' && raw !== '' ? raw : null;
  }

  /*
   * Every key of `record.data`, not every field of the module.
   *
   * §22: removing a field leaves its values in place under the old key unless
   * the user chose to purge them, and those values travel in every export.
   * Walking `mod.fields` would therefore miss data the workspace genuinely
   * still holds — and answering a subject access request with "that is all"
   * while holding a column you stopped showing is exactly the wrong way round.
   * A key with no field is reported as `orphan`, which is the single most
   * useful thing this search can tell a controller.
   */
  function search({ modules = [], records = [], query = '', relationNames = null } = {}) {
    const term = String(query || '').trim();
    const q = fold(term);
    if (q.length < MIN_QUERY) {
      return { query: term, tooShort: true, minLength: MIN_QUERY, matches: [], byModule: [], total: 0 };
    }

    const byId = new Map(modules.map((m) => [m.id, m]));
    const matches = [];

    for (const r of records) {
      const mod = byId.get(r.moduleId);
      // A row whose module is gone cannot be described, and a match reported
      // against nothing is not something a controller can act on.
      if (!mod) continue;
      const fieldByKey = new Map((mod.fields || []).map((f) => [f.key, f]));

      const hits = [];
      for (const [key, raw] of Object.entries(r.data || {})) {
        const field = fieldByKey.get(key);
        const text = readable(field, raw, relationNames);
        if (text === null) continue;
        if (!fold(text).includes(q)) continue;
        hits.push({ key, label: field ? field.label : key, orphan: !field, value: text });
      }
      if (!hits.length) continue;

      matches.push({
        moduleId: mod.id,
        moduleName: mod.name,
        recordId: r.id,
        // Sample rows are INCLUDED and flagged, never filtered out. Editing a
        // seeded row keeps its `_demo` flag (§11), so a row can be fictional in
        // origin and hold something real that was typed over it. Hiding those
        // would make the bundle quietly incomplete; naming them lets the
        // reviewer discard them in a glance.
        demo: !!r._demo,
        fields: hits,
        data: { ...r.data },
      });
    }

    const counts = new Map();
    for (const m of matches) counts.set(m.moduleId, (counts.get(m.moduleId) || 0) + 1);
    const byModule = [...counts.entries()]
      .map(([moduleId, count]) => ({ moduleId, moduleName: (byId.get(moduleId) || {}).name || '', count }))
      .sort((a, b) => b.count - a.count || a.moduleName.localeCompare(b.moduleName));

    return { query: term, tooShort: false, minLength: MIN_QUERY, matches, byModule, total: matches.length };
  }

  return { search, fold, MIN_QUERY };
})();

// The browser has the global above; Node's tests require the same file, so the
// rules they check are the rules that ship (§39).
if (typeof module !== 'undefined' && module.exports) module.exports = DSAR;
