# Calculations — sums, averages, and the three features behind them

> **Status: live, and kept current.** This sits in `docs/`, which `CLAUDE.md`
> §29 defines as the maintained tier — not `docs/archive/`, which is frozen.
> If you build a part of this, move it out of here and write it up as a
> numbered section in `CLAUDE.md`, the same as everything else.
>
> **Parts A, C and C+ are all built — `CLAUDE.md` §66, §67, §68.** Category B
> (rollups) is the only one left, and is still named rather than costed. This
> was the spec agreed before any code, written so the decisions are recorded
> with their reasoning rather than reconstructed from a diff; it is kept
> accurate as each part lands rather than frozen, because this is `docs/` and
> not `docs/archive/`.
>
> **Three things the plan got wrong about Part A, all recorded in §66 rather
> than edited away here:** the caller list named the kanban card (which renders
> one currency field, not the column list) and omitted `compareBy` (which is a
> caller, and whose signature had to change); the builder picker as specified
> could not work on a new module, because a checkbox needs a field key and
> `slug()` runs at save; and the removal prompt was not needed, because a
> refusal is strictly better when nothing is destroyed on either branch.
>
> **And two about Part C, recorded in §67:** the aggregate list is not the
> operation list minus two — `count` means a different thing down a column, and
> only *average* can carry a coverage note without becoming noise; and §9's
> instruction to re-render the whole module view was over-specified, because an
> aggregate change moves no row and so cannot stale the count badge that rule
> exists for.
>
> **And two about Part C+, recorded in §68:** §5's own warning about §44's
> `setMonth` overflow does not apply, because a period boundary on a day
> coordinate never steps a month at all — the shape removes the question rather
> than clamping it; and the mock's ascending group order was wrong for a module
> that has been running a year, so the built version puts the newest period
> first.
>
> Where a choice was taken the alternatives are kept beside it — a decision
> without its rejected options is a decision nobody can safely reverse. Nine
> decisions are taken (§8); rollups, the largest, are deliberately left open
> and named rather than costed.
>
> Internal: not served (`CLAUDE.md` §28), which is what lets it be blunt about
> what is unfinished.
>
> Researched 2026-10-09 against Salesforce, HubSpot, Airtable and Notion. The
> sources are at the foot. Every claim about *this* codebase was read out of
> the source and is cited by file and line.

---

## 0. Where this came from

A custom **Daily digest** module, built to demonstrate the pitch behind §39's
digest: a cement factory with four production lines, and a one-page morning
report carrying two numbers — downtime in hours and sales in tonnes. High
downtime meant a conversation with production; low downtime and low sales
meant a conversation with sales.

The module has four columns and one row. The question asked of it was: *how do
we get a total downtime column, an average, and a sum at the end of a week or
a month?*

That is three different questions, and the industry answers them with three
different features. Conflating them is the main thing this document exists to
prevent.

---

## 1. The three categories

| | Question it answers | Industry name | Lives on |
|---|---|---|---|
| **A** | across **this record's own fields** | formula field / calculated property | a field on the record |
| **B** | across **records related to this one** | **rollup** | a field on the parent record |
| **C** | down **a column of visible rows** | summary bar / calculate row | the view, not the data |

All four major products carry all three: Salesforce (formula fields, Roll-Up
Summary, report summary levels), HubSpot (calculation properties, rollup
properties, custom reports), Airtable (formula, rollup, summary bar), Notion
(formula, rollup, calculate row).

**A and C are in scope here. B is named in §7 and not costed.** That split is
deliberate: A and C are client-only over rows already in memory, and B is the
one with the worst failure modes in every product that ships it.

**The categories deliberately do not compose.** Airtable states this outright
— summary values cannot be used in formulas — and adopting that boundary up
front is cheaper than discovering it. A column total is not available to a
calculated field, and a calculated field's result is not available to another
calculated field (§4, decision 9).

---

## 2. The blocker, which comes before any of it

**The module's four columns are `text`, not `number`.** The unit sits inside
the value — `2 hours`, `0 hours`, `1 hour`, `30 tons` — so every value is a
string. Two consequences, and the second is already live:

- **Nothing can sum them.** `fmtValue` (`js/app.js:465`) only calls
  `Number(value)` for `type: 'number'`; everything else falls through to
  `esc(value)` at `:477`.
- **The column already sorts wrong, and one row hides it.** `compareBy`
  (`js/app.js:281`) compares numerically only for `number` and `currency`;
  `text` falls to a string compare. Add `10 hours` and the sort puts it between
  `1 hour` and `2 hours`. A defect that renders as plausible — this
  repository's standing failure shape (`CLAUDE.md` §36, §38, §39).

### The fix is the column label, not a new field property

The first draft of this plan proposed an optional `unit` string on number and
currency fields, so a field could store `2` and render `2 hours`. **Withdrawn
after checking the market: nobody does that.** The standard is a *format* —
number, currency, percent — with the unit in the **column label**:

```
Down time, line 1 (hours)      2
Sales (tonnes)                30
```

Cheaper (zero code), already supported, and it keeps the value a number all
the way through sorting, export and arithmetic. HubSpot supplies the
cautionary tale for the alternative: their duration and average values are
stored in **milliseconds**, so an average "looks unexpectedly large" — a unit
problem presenting as a calculation bug.

**So part 0 of the work is data, not code:** change the four fields to
`Number`, move the unit into each label, and retype the row. One row, so there
is nothing to migrate.

### Converting existing text columns is NOT in scope

A general field-type migration — scan the column, show what each value would
become, refuse to guess — is §45's shape and is its own feature with its own
tests. It is not needed here and must not be bundled in. Noted in §8.

---

## 3. Part A — the calculated field

A new entry in `FIELD_TYPES` (`js/app.js:41`). Gives *Total down time* =
`line1 + line2 + line3`, and *Average down time* = the same three averaged.

### The expression language must not be an expression language

This is the decision to defend hardest, because every competitor does the
opposite.

**What they do.** Salesforce has its own formula syntax with a 3,900-character
cap; Notion and Airtable have function languages. *Nobody* ships a pick-list
for category A.

**Why not here.** `script-src 'self'` (§30 Phase 4) forbids `eval` and
`new Function` on user input — but the CSP is the lesser argument. The real one
is §3's threat model: *record values arrive from CSV imports and shared
backups*. A **module definition** arrives the same way, because `importState`
writes whatever fields the file carries. So a formula *string* is untrusted
input, and an evaluator fed untrusted input is a code-execution sink reachable
by handing somebody a backup file. That is the same reasoning that made
unescaped record ids a real stored-XSS finding (§30 Phase 3), and it is why
`slug()` is not the boundary — the API is.

**So: a pick-list.** An operation, and a set of fields.

```
Calculated field
  Label:      Total down time (hours)
  Operation:  ⌄ Sum
  Fields:     ☑ Down time, line 1 (hours)
              ☑ Down time, line 2 (hours)
              ☑ Down time, line 3 (hours)
              ☐ Sales (tonnes)
```

| Operation | Takes | Notes |
|---|---|---|
| Sum | 2+ fields | |
| Average | 2+ fields | over the fields that have a value — see decision 3 |
| Minimum / Maximum | 2+ fields | |
| Count filled | 1+ fields | the only one that counts blanks as information |
| Difference (a − b) | exactly 2, ordered | the picker becomes two dropdowns |
| Ratio (a ÷ b) | exactly 2, ordered | `—` on a zero divisor, never `Infinity` |

**A constrained operation list is well within industry norms**, which is the
part that makes this affordable rather than merely safe: **Salesforce's Roll-Up
Summary supports only COUNT, SUM, MIN and MAX — not even average.** HubSpot's
rollup does min/max/count/sum/earliest/latest/average. So the list above is
richer than the market leader's aggregate.

**What it costs, stated rather than implied:** `(a − b) / c` is out of reach.
A real grammar is the later extension, and it must be a hand-written
whitelisted parser tested against hostile input — **never the `Function`
constructor, under any circumstances**, whatever the apparent provenance of
the string.

**Only `number` and `currency` fields are selectable.** Offering `text` would
mean parsing `2 hours`, which is §45's trap in a new place: a guess that is
confidently wrong on some rows and silently empty on others.

### Read-only, everywhere

A calculated field is read-only in every product that has one, and here it must
be read-only in three places: the record form renders it as a value rather than
an input, the CSV **import** mapping screen must not offer it as a destination
column, and `applyPush` must never see a value for its key (there is none to
send — see below).

### What saves, and what deliberately does not

| Thing | Where | Syncs | Who may change |
|---|---|---|---|
| the operation and the field list | an entry in `module.fields[]`, `type: 'formula'` | **yes, with the module** | owner only (`canEditSchema`) |
| **the computed value** | **nowhere** | — | — |

**Computed at render, never stored.** The *definition* saves; the *result* does
not, and that is the right way round for three reasons:

- **Zero change to the sync engine.** Nothing new to merge, no `fieldsAt`
  clock, no rejection path. That engine carries six recorded traps (§10) plus
  §14's refusal rules; a derived value that has to merge is the most expensive
  possible place to put this.
- **It cannot go stale.** Change the operation and every row is correct
  immediately. A stored result is wrong on every device until something
  rewrites it, which is §31's backdated-row bug in a new costume.
- **No ghost data.** §22: a key in `record.data` with no field behind it
  travels in every export for ever. A stored result that outlives its formula
  is exactly that.

**Salesforce proves this the hard way, and it is the strongest external
evidence in this document.** Their formula fields are computed, not stored.
Their *rollups* are stored — and the consequence is that **deleting a child
record does not trigger a recalculation**, so there is a *"Force a mass
recalculation of this field"* button whose entire purpose is to repair a stale
derived value by hand. A manual repair path for a number the product computed
itself is what storing results buys.

One function, `Calc.value(mod, field, record)`, with four callers: the table
cell, the kanban card, the record read view, and the CSV exporter.
`exportModuleCSV` reads `r.data[f.key]` directly today (`js/app.js:2090`), so
that is the one existing path that needs threading.

### Deliberately not in the DSAR search

§43 walks every stored value to answer *"what do you hold about this person"*.
A calculated result is a number derived from numbers that search already
covers, and nobody answers a subject access request by looking for `3`.
Recorded as checked rather than left unmentioned (§40's rule: padding a roster
is its own kind of inaccuracy, and so is an unexplained gap).

---

## 4. Part C — column totals

> **Built — `CLAUDE.md` §67.** Everything below is the spec as agreed and held,
> except the two items the banner names. Read §67 for what building it added.

A footer row on the table, under every `number`, `currency` and `formula`
column.

```
  DOWN TIME L1   DOWN TIME L2   DOWN TIME L3   TOTAL DOWN TIME   SALES
  2              0              1              3                 30
  4              1              0              5                 22
  ────────────────────────────────────────────────────────────────────
  Sum ⌄  6       Sum ⌄  1       Sum ⌄  1       8                 52
         2 rows
```

**This is Airtable's summary bar, and the design below is theirs rather than
invented.** Their footer defaults numeric fields to **Sum**, leaves non-numeric
blank, opens a menu whose options depend on the field type, and in a grouped
view shows a summary per group *plus* an overall total. Arriving at the same
shape independently and then finding it is the standard is a reason to stop
designing.

- **It reads `visibleRecords()`** (`js/app.js:318`), whose own comment calls it
  *the single source of truth for what rows this module view shows*. So the
  total respects the search box and the due-date filter for free.
- **And it must say so when a filter is narrowing it.** §33 is an entire
  section about two adjacent correct numbers reading as a discrepancy — the
  count badge in the page head against a sum in the footer. *"Sum of 4 filtered
  rows"* while the filter is on.
- **The per-column choice saves on the field** (`aggregate: 'sum' | 'avg' |
  'min' | 'max' | 'count' | 'none'`), so a team agrees what a column means
  rather than each device deciding. Owner-only to change (decision 4).
- **For a non-owner the footer renders the value with no dropdown** — §36
  rule 2: a value, not a disabled input.

---

## 5. Part C+ — by week or by month

> **Built — `CLAUDE.md` §68.** Everything below is the spec as agreed and held,
> except the two items the banner names. Read §68 for what building it added —
> including the one question §5 did not ask: which day a week starts on.

Held until A and C are in use, and built as **grouping plus the same footer**
rather than as a separate summary screen — which is again Airtable's shape.

```
Group by:  ⌄ Week    on  ⌄ Shift date

WEEK           TOTAL DOWN TIME   SALES   SHIFTS
29 Sep–5 Oct   18                210     6
6 Oct–12 Oct   8                 142     2
───────────────────────────────────────────────
               26                352     8
```

**The date field is an explicit input, not a guess, and that is forced by an
existing collision.** `DateRules.watchedDateField` returns **exactly one** date
field per module — the same one the due filter and the daily digest count
against. §49 records what happens when a module gains a second date field: the
digest either counts the wrong one, or the module **drops out of the digest
entirely and silently**. §50 hit the same wall for dormancy and solved it by
making the field an input named on screen. Same answer here.

**The arithmetic already exists and already has a trap recorded.** `DateRules`
carries `today`, `parseDay`, `monthsAgo` and `monthsAgoDay`, and §44 records
that `setMonth(m - n)` **overflows rather than clamps** — 31 August minus six
months lands on 2 or 3 March, jumping forward past the month it aimed at.
Week and month boundaries get unit tests across timezones, not eyeballing.

**The Daily digest module has no date field at all**, so this part needs one
added before it can do anything.

---

## 6. What saves in the database, in one place

The question that prompted this document was *"we should be able to save in
db"*. Precisely:

| | Saved? | Where | Syncs | Export |
|---|---|---|---|---|
| a calculated field's **definition** | **yes** | `module.fields[]` entry | yes, with the module | yes, in the module |
| a column's **aggregate choice** | **yes** | same field entry | yes | yes |
| a calculated field's **result** | **no, by design** | derived at render | — | **yes** — resolved at export time |
| a column **total** | **no** | derived at render | — | no |
| the **grouping** a reader has chosen | **no** | view state, per device | — | no |

Nothing new reaches the wire. `doc` is opaque to the server, so a module
carrying a new field type needs no server change, no migration and no
`docs/API.md` entry. The builder already attaches type-conditional properties
— `options` only to `select`, `relatedModule` only to `relation`
(`js/app.js:3273-3278`) — so `operation` and `inputs` on a formula field follow
the existing pattern rather than introducing a mechanism.

---

## 7. Category B — rollups. Named, not costed.

**The gap in the first draft of this plan, and the feature that makes this
competitive.** A rollup answers *"total deal value for this contact"* or,
modelled properly, *"total downtime for production line 1 across every
shift"* — an aggregate over **related records**, displayed on the parent.

The hook exists: `relation` is already a field type, and `primeRelationCache`
(`js/app.js:481`) already walks a relation to the related module's records.

Why it is not in phase 1:

- **Every vendor that ships it has scar tissue.** Salesforce: one level deep,
  master-detail only, 25 per object (40 on request), COUNT/SUM/MIN/MAX only,
  and the manual recalculation button above. Notion: **a rollup cannot roll up
  another rollup.** HubSpot: a per-tier cap on how many you may create.
- **It is the only one of the three that is not obviously client-only.** A
  parent's rollup depends on child records that may live in a module this
  device has, which is fine — but the moment somebody wants it filtered,
  sorted on, or in the digest, it stops being a render-time concern.
- **The relation direction is backwards for it today.** `Deals.contact` points
  from child to parent; a rollup on Contacts needs to find every Deal pointing
  *at* this contact, which is a scan of another module per rendered row. That
  is a real performance question and it deserves measuring, not assuming.

Named here so it is not rediscovered as a new idea. If it is built, it starts
with that scan cost measured on a real workspace.

---

## 8. The decisions, with their reasoning

| | Decision | Why, and what was rejected |
|---|---|---|
| **1** | **No `unit` property.** The unit goes in the column label | Nobody in the market does unit strings; the standard is a format plus a label. Zero code against a new field property. HubSpot's millisecond averages are the warning |
| **2** | **Pick-list, not a formula box** | A formula string arrives in a restored backup (§3), so an evaluator is a code-execution sink under `script-src 'self'`. Costs `(a − b) / c`; a real grammar is a later, separately-tested feature and never `Function` |
| **3** | **Blanks are absent, not zero**, and the contributing row count is shown | `sum of [2, blank, 1]` is 3 over two values. §44's rule for rows with no clock: count them separately and say so. Treating blank as zero silently drags an average down |
| **4** | **Owner-only** for both the formula and the aggregate choice | Both are module shape, which `canEditSchema` already governs (§14). A per-device override is a second preference store for no stated need |
| **5** | **Default `sum` on every numeric column** | Airtable's default. The first draft said "none for currency" and that is withdrawn — a pipeline total is the single most useful aggregate in this product, and making it opt-in hides it |
| **6** | **Week/month grouping comes after A and C** | It needs a date field the module does not have, and it collides with `watchedDateField`'s one-field rule (§49) |
| **7** | **No preset aggregate on the Deals template** | §42: fields belong to a module, not a template, so it would change the default for new workspaces only and retrofit nobody — including this one. It also trips `tests/demo.test.mjs:169`. Revisit once a totals row has been used in anger |
| **8** | **Rollups are out of phase 1**, named in §7 | The feature with the worst failure modes in every product that ships it, and an unmeasured scan cost here |
| **9** | **A formula field may not reference another formula field** | The industry caps depth because recursion is where this blows up — Notion refuses rollup-on-rollup, Salesforce allows one level. One check makes a cycle **structurally impossible** rather than detected, which is cheaper and safer than the graph traversal the first draft proposed |

---

## 9. Traps, against the sections that record them

- **Deleting a referenced field.** `askAboutRemovedFields` (`js/app.js:3027`)
  is the precedent: name the formulas that would break and count the affected
  rows **before** the module is written, so Cancel leaves the schema untouched
  (§22). A formula whose input has gone renders `—` and says why, never `NaN`.
- **`showInList` defaults ON for a formula field.** Normal new fields default
  off, and §22 records an E2E assertion that passed against a column which was
  never there. A calculated column nobody can see is pointless.
- **CSS cascade.** §4 has now cost time four times, twice in `css/style.css`
  specifically (§37's `.due-filter` at 777px wide, §50's `.stale-search`).
  A footer row inside `.table-wrap` needs a selector specific enough to beat
  what is already there, and the result gets **measured at 1440/900/390**, not
  judged.
- **Invented classes.** §27's trap, four occurrences and counting
  (`.note.warn`, `.hr`, `.settings-sub`, `.digest-preview`). `.table-total`,
  `.total-cell` and `.total-pick` are defined in `css/style.css` or they render
  as plausible unstyled boxes.
- **Async re-render races.** `renderModuleBodyOnly` is async and click handlers
  do not await it (§4). A test that reads the footer straight after changing an
  aggregate samples the previous render and passes for the wrong reason.
- **A full `renderModule`, not `renderModuleBodyOnly`, when the aggregate
  changes** — if the footer ever moves into the page head, §37's reasoning for
  the count badge applies.
- **Division by zero** → `—`. **`Infinity` and `NaN` must never reach a cell.**
- **CSV injection** is already handled: `js/csv.js` prefixes a leading `=`,
  `+`, `-` or `@`. A numeric result cannot carry one, but a negative difference
  renders `-3` and goes through that path — asserted, not assumed.
- **Sorting** routes a formula column through `compareBy` as `number`
  (`js/app.js:281`), which means `compareBy` has to resolve the formula rather
  than read `a.data[field.key]`. That is the one place the "no stored value"
  decision costs something.

---

## 10. Verification

The split follows §50's: **the arithmetic is unit-tested and the wiring is
E2E-tested.** A blanks-versus-zero bug or a month-boundary overflow is
invisible at E2E scale and obvious at unit scale.

**`js/calc.js` is a new served file**, so §3's four places have to agree:
`index.html`, `sw.js` `APP_SHELL`, `tests/smoke.mjs` `ASSETS`, and a
`CACHE_VERSION` bump. `ASSET_DIRS` already allow-lists `js/`, so there is no
server change — and **the smoke count moving 49 → 50 locally (54 → 55 live) is
what proves it** (§9).

`tests/calc.test.mjs` loads it the way `tests/dateRules.test.mjs` loads its
subject — `new Function(src + '; return Calc;')()` — so **no `module.exports`
line is needed**. `js/date-rules.js` has one because `server.js` requires it
(§39); nothing server-side calculates here, so adding an export would create a
consumer that does not exist.

Mutations to check each test against, per §9 — *a test that passes on the bug
is worthless*:

| Mutation | Must fail |
|---|---|
| blanks counted as zero | *an average ignores blank values rather than dragging the result down* |
| the result stored in `record.data` | *a calculated column adds no key to any record* |
| the total read from `DB.recordsByModule` instead of `visibleRecords` | *a column total respects the due-date filter, and says that it did* — and this row is the one that caught a real gap: the downtime module has no date column, so the due-filter branch had no test at all until a dated deal was added (§67) |
| a text field offered in the field picker | *only numeric fields can be summed* |
| formula-on-formula permitted | *a calculated field cannot reference another one* |
| a zero divisor allowed through | *a ratio with a zero divisor renders an em dash* |
| the footer dropdown shown to a viewer | *a view-only account reads the total and cannot change it* |
| the export reading `r.data[f.key]` | *a calculated column reaches the CSV* |

Full run before it is trusted, per §9's blast-radius rule: a new `js/` file,
`CACHE_VERSION` and `sw.js` are all shared surface, and `compareBy` is reached
by every module view.

---

## 11. Deliberately not built

- **A formula parser.** §3 and decision 2.
- **Anything server-side.** No route, no wire change, no migration — the same
  shape as the due filter (§37), the DSAR search (§43) and the dormancy report
  (§50), all client-only over rows already in memory.
- **The numbers in the daily digest.** Tempting given the pitch this came from,
  and a bigger decision than it looks: §39's digest carries *counts and never
  record names*, because a webhook destination may be a shared client channel
  the owner did not think twice about. Production hours are not a name, so it is
  arguable — but it is a disclosure decision, not a calculation one.
- **Converting an existing text column to a number.** §2. A field-type
  migration is §45's shape and its own feature.
- **Rollups.** §7.

## 12. What the pitch actually points at, which is none of the above

The cement-factory report was not a sum. It was two numbers read **against an
expectation** — "downtime high, go and talk to production". That is a
**threshold**, and thresholds are a fourth feature: a number crossing a line,
announced once, escalate-only, re-arming only after it drops back. §25 already
built exactly that machinery for the operator alerts and records why it has to
be escalate-only — *an alert that fires hourly trains you to ignore it, which
is worse than none.*

Worth knowing that the story behind this work points past calculation at
thresholds, and that the hard half of thresholds is already written.

---

## Sources

Checked 2026-10-09. Every figure here is third-party or vendor-help rather than
primary API documentation; the limits move, so re-check before relying on a
number.

- [Airtable — using the summary bar](https://support.airtable.com/docs/the-summary-bar)
- [Salesforce roll-up summary limitations](https://tractioncomplete.com/articles/salesforce-rollup-summary-field-limitations/)
- [Salesforce cross-object formulas vs roll-up summary fields](https://www.salesforceben.com/salesforce-cross-object-formulas-vs-roll-up-summary-fields/)
- [HubSpot — create calculation and rollup properties](https://knowledge.hubspot.com/properties/create-calculation-properties)
- [Notion rollups: how they work and where they stop](https://sync2sheets.com/blog/notion-rollups/)
- [Notion formula syntax and functions](https://notion.com/help/formula-syntax)
