# Roadmap — five things asked for, costed against this codebase

> **Status: live, and kept current.** This sits in `docs/`, which `CLAUDE.md`
> §29 defines as the maintained tier — not `docs/archive/`, which is frozen.
> If you build one of these, move it out of here and write it up as a numbered
> section in `CLAUDE.md`, the same as everything else.
>
> **Nothing here is scheduled and nothing here is decided.** It is five items
> the owner named, each sized against what is actually in the repository rather
> than against the feature's usual price elsewhere. Where an item forces a
> decision it is written as a question with the prior reasoning attached, never
> as an answer — the same rule `docs/LAUNCH-CHECKLIST.md` runs on.
>
> **Two are built** — dark mode (§60) and the security re-audit (§61). Their
> entries are reduced to what survives being finished: where the estimate held,
> where it did not, and what a future reader must not undo. Both kept their
> numbers, because everything else cross-references them (§29).

**Every number below was measured, not recalled.** The commands are given so
they can be re-run; a figure that has gone stale is worse than none (§29).

---

## The short version

Ordered by how much of it already exists, which is not the order they were
asked in and is the more useful order to read.

| | Size | Because |
|---|---|---|
| ~~**Dark mode**~~ | **built — `CLAUDE.md` §60** | it already worked; what was missing was a *choice*. The estimate held |
| **Accessibility** | small to start, open-ended after | the primitives are in place — `aria-live`, `aria-modal`, `aria-sort`, `lang`. It needs measuring before it needs building — and dark mode's contrast pass already produced three findings for it |
| ~~**Security re-audit**~~ | **done — `CLAUDE.md` §61** | thirteen routes and three credential classes had landed since §30. Six real findings, four of them latent, one live |
| **Email & social integrations** | large, and it is two different projects | outbound already exists twice over. **Inbound** is the new thing, and it is a new trust boundary |
| **Multi-language, incl. Arabic** | large, and the translation is the cheap half | there is no string table, no build step, and one word — *versioned* — makes the legal pages the hard part |

**One of these is not what it sounds like.** "Email integration" is not the
email sending that shipped in §53 — planning it from the name would waste the
estimate. Dark mode was the other, and building it is what proved the point:
see below.

---

## 1. Dark mode — **built, see `CLAUDE.md` §60**

Per the banner: a built item moves out of here. What is worth keeping is that
**the estimate held and it held for the stated reason** — the palette was
already tokenised, so the job was a choice rather than a repaint. Three of the
four costings in the original entry survived contact:

| Costed as | Turned out |
|---|---|
| both branches in both files; `legal.css` is the one that bites | correct, and it was the mutation that failed by name |
| the attribute must be set before the first paint | correct — `js/boot-theme.js`, first in `<head>`, the `js/boot-icons.js` precedent |
| device-level `crmb:theme`, never a workspace setting | correct, and unchanged |
| ~~"12 loose hex literals… they are the actual work"~~ | **wrong by a factor of four.** Three literals mattered, all of them `#fff` over `var(--accent)`; the rest were in dark blocks or brand artwork |

**The one thing the entry did not predict is the thing that mattered most.**
It said contrast should be measured rather than judged, citing §47 — and
measuring it found a **live WCAG AA failure in the shipped app**: white on the
dark-mode accent, on `.btn-primary`, at **3.14:1**. Every dark-OS visitor since
the dark palette shipped has been pressing *Create my CRM* with a label under
AA. Nothing in the suite drove `colorScheme`, so the OS-following half that had
shipped years ago had never once been tested. The lesson is §36's, in a new
place: **an untested code path does not have to be new to be wrong.**

Three further findings were **left deliberately** and belong to item 2 below,
because they are light-mode failures with no dark-mode component and fixing
them means retuning tokens used across the app.

---

## 2. Accessibility and screen-reader compatibility

### It is not a greenfield, and it is not finished

```sh
grep -o 'aria-[a-z]*' js/app.js | sort | uniq -c
```

**28 `aria-` attributes in `js/app.js`** — 22 `aria-label`, 3 `aria-hidden`,
2 `aria-modal`, 1 `aria-sort` — plus 6 `role="…"`. `lang="en"` is on all four
root pages. `#toast-root` already carries `aria-live="polite"`, so status
messages are announced. `docs/manual.html`'s Contents control has
`aria-expanded` and was measured working at 390px (§48).

So the vocabulary is in use. What has never happened is somebody **driving it
with a keyboard and a screen reader**, which is §36's whole lesson: the hole
that audit found was invisible to the code-reading passes that preceded it, and
turned up the moment the product was driven as a real viewer.

### Three things already visible from the source, offered as leads not findings

- **`aria-modal="true"` is a promise the focus management does not keep.**
  `openModal` sets `role="dialog" aria-modal="true"` and moves focus to the
  first control; Escape closes. There is **no Tab trap and no focus restore on
  close**. `aria-modal` tells assistive technology the rest of the page is
  inert — Tab does not know that, so a keyboard user tabs out of the dialog
  into content their screen reader has been told is not there.
- **The template cards wrap a visually hidden checkbox.** §4 records this as a
  test trap — `.check()` fails, click the card — and the same shape is a
  keyboard question: is the hidden input focusable, and does its label announce
  the card? This is the onboarding screen, so it is the first thing anybody
  meets.
- **The kanban board is drag-and-drop.** Whether moving a card between columns
  is reachable without a mouse is not answerable by reading, and the answer
  decides whether this item is small or large.

### Three contrast failures, measured rather than suspected

These came out of §60's dark-mode pass and were **deliberately not fixed
there** — they are light-mode failures with no dark-mode component, and each
means retuning a token the whole app uses, which is a wider change than a theme
toggle should carry. WCAG AA is 4.5:1 for body text.

| Token | Light | Dark | Where it is text |
|---|---|---|---|
| `--text-faint` | **2.58** on `--surface` | **3.38** | ~17 places — `.nav-empty`, `.stat-tile-sub`, `.recent-meta`, the field hints |
| `--ok` | **4.01** | 10.13 | `.check-yes` puts it straight on `--surface` |
| `--warn` | **3.49** | 10.09 | the same pattern |

Three things about that table, and each is the reason it is here rather than
fixed:

- **`--text-faint` fails in BOTH themes** and always has; the dark value is
  untouched by §60. It is the only one of the three that does.
- **They are representative, not measurement artifacts.** Checked: the tokens
  really are used as text directly on those grounds, rather than only as
  borders or as ink on a tinted pill where the ratio would be different.
- **`--danger` passes at 4.83 light / 7.84 dark**, so this is not "the whole
  status palette is wrong" — it is three specific values, and one of them is
  the faint-text token that the fix would make less faint. That is a design
  decision about how quiet a hint may be, not a bug fix, which is exactly why
  it wants the axe-core pass below rather than a guess.

### The instrument matters more than the checklist

§30 is emphatic that a checklist written for a different stack produces ticks
for mitigations that were never applicable, and that *reading the source rather
than working the list* is what found the finding that cost the most. The same
applies here, in the same shape:

1. **An automated pass** (axe-core in the existing Playwright suite) on every
   route and every modal. It is cheap, it runs in CI, and it catches contrast,
   missing labels and heading order.
2. **A keyboard-only walk** of the six journeys the E2E suite already knows:
   onboard, add a record, sort a table, move a kanban card, invite a colleague,
   run the tour.
3. **A screen reader on the two screens that matter most** — the record form
   and the table — because that is where the app stops being a document and
   starts being an application.

Automated tools find perhaps a third of what is wrong and cannot find the
kanban question at all. Reporting the axe result as *"accessible"* would be
this file's recurring failure: a claim that renders as plausible.

### The one that will need a real decision

**The guided tour** (§7, §35) positions a card next to a highlighted element
and narrates. To a screen reader that is either an `aria-live` region that
interrupts, or it is silent. Neither is obviously right, and §35's history says
the tour's geometry is the most delicate code in the client. Cost it separately
from the rest.

---

## 3. Security re-audit — **done, see `CLAUDE.md` §61**

Per the banner: a built item moves out of here. What is worth keeping is that
**the item's own opening number was wrong, and it was wrong in the direction
that undersold the work.** It said §30 "ran against 47 routes", repeating §57.
Counted at the audit's own commit rather than recalled:

```sh
git show f51656d:server.js | grep -cE "^app\.(get|post|put|patch|delete)\("   # 42
grep -cE "^app\.(get|post|put|patch|delete)\(" server.js                      # 55
```

Thirteen unaudited routes, not eight. §29's own failure mode — a number written
in a second place — landing in the entry that states it, twice over.

### What it found, and the shape of the answer

Six real findings, and **four of them were not reachable through any current
caller**. That is the character of a re-audit rather than an audit: the live
holes were closed the first time, and what accumulates afterwards is safety
that holds by accident — a `Host` header that could override a validated
destination, an argument shape the router wrap silently skipped, a `Map` whose
replacement with `{}` would drop a chase entry, and a scrub with nothing yet to
scrub. §30's argument for the prototype-pollution guard, four more times.

The two that were **live**:

- **A webhook or healthcheck URL carrying credentials wrote itself into the
  log** — password and bot token together, in the log of a public
  repository's deployment. The guarding comment claimed Node's network errors
  carry hostnames and not paths; true of every fetch *failure*, false of the
  one case where no request is ever constructed.
- **`POST /api/org/mail/send` metered before it authorized**, so a refused
  viewer could exhaust a colleague's send budget on a shared IP — the reverse
  of its own two siblings' ordering.

### What a future re-audit must still not re-raise

**§30's five FALSE findings.** No CORS middleware (absence *is* the
mitigation), `SESSION_SECRET` falling back to random bytes, no reachable NoSQL
injection, no mass assignment, no exploitable prototype pollution. §30 says to
read them as carefully as the real ones, because a reader working from a
generic checklist would "fix" them and make the code worse. §61 re-raised none
of them, and a next pass that does has regressed rather than progressed.

**Row 12's SSRF verdict stays superseded** by §38. The question is not whether
there is an outbound sink — there is, deliberately — but whether the guard in
front of it still holds. §61 asked that of the `headers` option specifically
and found two ways it did not.

**And the audit gate stays at `high`.** §61 R5 records why in full: the three
moderate `qs` advisories were green *by design*, were patched on their merits,
and lowering the threshold would trade a real high-severity catch for a red
tick on every deploy (§25).

An outside checklist is welcome and should be treated the way §21, §30 and §61
all treated one: **checked against the code, with the false findings recorded
as false.**

---

## 4. Email and social integrations

### The name hides two different projects

**Outbound already exists, twice.** §53 sends a chaser through the workspace's
own Resend or Postmark account; §38 posts a digest to a Slack, Discord or
Telegram destination. Both are behind `sendGuarded`, both keep the credential
off `settings` and out of the nightly artifact, and both were built transport
first. If "email integration" means *the app can send mail*, it is done.

**What is not built is inbound**, and that is the whole cost:

| | Direction | Exists |
|---|---|---|
| chaser, digest, alerts, feedback | out | ✅ §38, §39, §52, §53 |
| **a reply landing on the record** | **in** | ❌ |
| **posting to a social account** | out, but with *their* credentials | ❌ |
| **pulling messages in from a social account** | in | ❌ |

### Inbound email is a new trust boundary, not a new feature

Everything in `lib/safe-fetch.js` guards **outbound** requests. It does nothing
whatever for a request arriving *at* us, so an inbound mail webhook needs the
§30 Phase 4 treatment from scratch: its own body limit (mail is large — the
global limit is 64 KB and `/api/sync` opts up to 8 MB), its own rate-limit
bucket, and **signature verification**, because the sender is not authenticated
by a session cookie.

Then the part with no precedent here at all:

- **Matching a message to a record.** A reply carries a threading header if we
  put one there; otherwise it is address matching, which is the same
  over-matching problem §43's subject-access search already documents — "Ali"
  finds "Alison" — with a worse consequence, because this one *writes*.
- **The body is somebody else's content.** §3's rule that only
  `http/https/mailto/tel` may reach an `href`, and §30 Phase 3's finding that
  identifiers reach HTML attributes unescaped, both apply to a payload that
  arrives from outside the workspace rather than from a CSV the owner chose.
- **Storage cost.** Message bodies on a 512 MB shared tier, against §33's
  measurement that tombstones alone reached 54% of one workspace's bytes.
- **`_demo`-style provenance.** A record the CRM wrote is not a record the user
  typed, and §11's whole discard algorithm rests on that distinction being
  honest.

### Social means holding somebody else's refresh token

An OAuth connection to a third party stores **their** long-lived credential,
per workspace. Where it goes is already decided by two precedents that agree:
a sibling of `settings` on the meta doc, never inside it (§38's two reasons —
`pullChanges` sends `settings` whole to every role including viewers, and
masking it would then destroy it under last-write-wins), redacted on export
with a `needsReentry` marker rather than stripped (§38, §52).

What is new is that a refresh token **expires and rotates**, which none of the
existing credentials do. That is a background job, and this deployment's only
scheduler is the keep-warm ping — which §40 records as having silently not run
the reminder engine for weeks. Read §40 before designing anything that must
happen on a timer.

### The decision this forces first

**Which one, and for whom?** "Integrations" as a category is unbounded; each
one is a sub-processor, and `privacy.html` closes its roster with *"That is the
complete list"* — a sentence §40 records being wrong twice by omission, both
times found by looking at what the deployment actually did rather than at the
code. Every connector added is an edit to that page and, if it changes what a
tenant's data does, to `terms.html` and therefore to `TERMS_VERSION` (§41),
which re-prompts every user.

So the honest sequencing is: **pick one, ship it end to end including the legal
text, and see what it costs** — rather than building a connector framework for
a set of connectors nobody has asked for by name yet.

---

## 5. Multi-language, including Arabic, Indian and Southeast Asian languages

### The app is already half-localized, in the direction nobody chose

```sh
grep -nE "toLocale|Intl\." js/app.js
```

Every date and every number goes through `toLocaleString(undefined, …)` or
`toLocaleDateString(undefined, …)` — **the device's locale**, not a chosen one.
So on an Arabic-locale phone, this app *today* renders Arabic-Indic digits and
Arabic month names inside English chrome. That is worth knowing before anybody
plans "add localization": the formatting layer is done and it is done in a way
that a UI-language picker would have to deliberately override, not extend.

And `js/date-rules.js` is locale-**independent** by construction: it parses
`YYYY-MM-DD` with a regex and reads today from local calendar getters, because
§37 records what `new Date('2026-09-12')` does west of Greenwich. Nobody should
"improve" that into locale parsing while localizing.

### The strings are the bulk, and there is nowhere to put them

`js/app.js` is 6,358 lines with its strings inline in template literals — 56
`toast('…')` calls alone. There is **no string table, no framework and no build
step** (§1), so the work is:

1. **Extraction** — every user-visible string into a keyed catalogue. This is
   most of the effort and it is mechanical, error-prone, and untestable by
   unit tests. The instrument that catches a missed string is a pseudo-locale
   pass, not a review.
2. **A loader that resolves before first paint**, for §3's reason again.
3. **A fallback that never throws** — a missing key renders the English, the
   way §39's `resolveZone()` never throws because §38 stores a timezone without
   validating it.

### What is *not* translated, and saying so early prevents a bad promise

- **Record data.** It is the tenant's own content; a Deals module stays named
  whatever they named it.
- **Field keys.** §4: renaming a field keeps its key, so translating a template
  *label* is safe and the data survives — but a CSV export writes **labels** as
  headers, so a round trip through a different UI language produces different
  column names. Decide whether export follows the UI language or is pinned.
- **The digest message**, unless the server learns the workspace's language.
  §39 builds it server-side, so this needs a stored setting beside `timezone`
  — same shape, and therefore the same rule: store whatever arrives, resolve at
  read time, never throw.

### Arabic is RTL, and the CSS surface is genuinely small

```sh
grep -oE "\b(margin-left|margin-right|padding-left|padding-right|border-left|border-right|text-align|left|right)\s*:" css/style.css | sort | uniq -c
```

**22 physical left/right declarations and 8 `text-align`, across 21 lines of an
892-line file. Zero logical properties in use.** Converting to
`margin-inline-start` / `padding-inline-end` / `text-align: start` is a
contained, mechanical change with a measurable end state — the grep returning
nothing but deliberate exceptions.

**The guided tour is not RTL surface, which is worth stating because it looks
like it should be.** `js/tour.js` computes placement from
`getBoundingClientRect()` and writes `style.left` / `style.top` — physical
viewport coordinates, which mean the same thing in both directions. Its
`left`/`right` identifiers are placement *names*, not CSS logical direction.
Given §35's history, leaving it alone is a feature.

What does need driving rather than reading: the kanban board's column order,
the table's sort indicators, and the CSV import mapping screen — all of which
are layout, and §4's standing lesson is that layout is checked by measuring the
real app, not by reasoning about the rules.

### The hard part is the legal pages, and it is a versioning problem

`terms.html` is a **versioned** document: `TERMS_VERSION` in `server.js` and
the `Last updated` line in the page are one fact in two places that must move
together, and the comparison is `!==` so any change re-prompts everybody (§41).

A second language makes that one fact in **four** places, and raises a question
with no cheap answer: if the Arabic terms are translated a week later than the
English, has an Arabic-speaking user agreed to a document that did not exist
when they clicked? The safe answer is that the English remains the operative
text and translations are marked as convenience — which is ordinary practice
and must be *written on the page*, not assumed.

`privacy.html` has the same shape without the versioning.

### Sequencing that does not waste work

RTL and extraction are independent and both are prerequisites. Do **RTL first**
— it is measurable, self-contained, and its result is visible with a single
`dir="rtl"` on `<html>` and no translations at all. Extraction second, with a
pseudo-locale to find what was missed. A real translation last, and one
language, so the whole pipeline is proved before it is multiplied.

---

## What is deliberately not on this list

Recorded so they read as decisions rather than oversights.

- **Undoable deletes** (§21 item 2b, §26). Costed and declined: a tombstone
  discards the body, and keeping bodies means a workspace deleting to free
  space frees none until the retention window passes.
- **Per-module permissions** (§2). Considered and set aside: it needs
  per-module filtering in sync, or a member receives rows they cannot see.
- **Automated escalation for the chaser** (§51, §53). Rejected on the
  scheduler, not the email — §40 records the `/health` ping never once firing
  the reminder engine for weeks, invisibly to every test here. That is an
  acceptable foundation for a message nobody loses money over and not one for
  money collection.
- **Per-module reminder windows** (§49). One workspace-wide window ships; the
  revisit condition is written down and is *a support message*, not telemetry.

## Related documents

- `docs/LAUNCH-CHECKLIST.md` — the domain move to **nimbleclerk.com** and the
  pricing launch. Both are ahead of everything here in dependency order,
  because two of these items (a payment processor, a translated terms page)
  change the same legal text.
- `docs/CHASER-AND-TRACKERS.md` — the spec the last three features came from,
  including the parts still unbuilt.
- `docs/archive/` — frozen plans. `TIER-2.md` and `SECURITY-AUDIT.md` carry the
  reasoning behind two items above and must not be edited to match what
  happened (§29).
