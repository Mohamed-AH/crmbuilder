# Site-wide audit — 2026-11-17

> **Maintained.** This is a findings report, not a plan. Nothing in it is
> fixed; each finding is a separate commit to come, with a regression test
> checked against the broken state (§9). When one is fixed, strike it through
> here with the section number that did it — the same treatment §46 and §49
> use, because what a finding got wrong is as useful as the finding.
>
> Unserved in production by construction (§28), which is what lets it be blunt.

**Scope.** The nine world-readable pages, the app's five screens and its
modals, the 8-route server delta since §61, the service worker, and the
cold-start payload. Driven as an owner and signed out; **not** as a viewer or a
contributor — see *Not covered* at the foot.

**Five screens, not the eleven `render*` functions**, which is worth saying
because the count was taken from `grep -c "function render[A-Z]"` while sizing
this and that number includes the sub-renderers: `renderSidebar`,
`renderModuleBodyOnly`, `renderDataRequest`, `renderRetention`,
`renderRetentionControls` and `renderRouteError` are not route targets. The
router has four (`#/`, `#/m/<id>`, `#/settings`, `#/admin`) plus onboarding,
which `renderDashboard` hands off to when a workspace has no modules.

**Method.** Every figure was measured by driving the real app and is
reproducible by the command printed beside it. The probes are not Playwright
tests, deliberately: loading `playwright.config.js` runs `fs.rmSync(DATA_DIR)`
in its module body, and §4 records what that costs mid-run.

**The instrument was validated against a deliberately broken fixture before
any figure was trusted** — a page with grey-on-white text, an `alt`-less image,
no `lang`, a 10px button and a 3000px block. It caught all five. Two
calibration facts came out of that and both matter for reading this report:
axe's `meta-viewport` rule is about `user-scalable=no` and **cannot see an
absent viewport tag**, and `heading-order` only fires on a skip *between*
headings. Both of those are checked here from the DOM inventory instead.

---

## Summary

| # | Finding | Where | Severity |
|---|---|---|---|
| **A1** | An admin reloading `/app#/admin` is told to sign in, and it never recovers | app | **high** |
| **P1-1** | Every inline link on five public pages is ~2:1 in dark mode | public | **high** |
| **P1-2** | Both doc pages render at 980px on a phone (0.42 scale) | public | **high** |
| **A2** | Focus escapes the record-form dialog, which declares `aria-modal` | app | moderate |
| **A4** | Kanban cards are not focusable: the board is mouse-only | app | moderate |
| **P1-3** | Both doc pages have no `lang` attribute | public | moderate |
| **P1-5** | Table scroll containers are not keyboard-reachable | public | moderate |
| **P4-1** | Nothing is compressed: `/app` is 645 KB cold, `js/app.js` 380 KB | infra | moderate |
| **S1** | Failed-payment ids evict the dispute-attribution window | server | moderate |
| **P1-4** | `docs/manual.html` is a dead end: 15 links, all fragments | public | moderate |
| **A5** | "Module not found." is 17 characters, no heading, no way out | app | moderate |
| **P1-6** | `--ink-soft` fails AA wherever it carries text (2.84–3.94:1) | public | moderate |
| **P1-7** | `--accent` on a tinted ground is 4.29:1 | public | low |
| **P1-8** | The sales page never mentions a shipped GDPR template | docs | moderate |
| **P1-9** | No canonical on any page; no `robots.txt`; no `sitemap.xml` | SEO | moderate |
| **A3** | Dialogs have no accessible name | app | low |
| **S2** | `ALLOW_DEV_LOGIN` is absent from `DEPLOYMENT.md`'s matrix | docs | low |
| **S3** | 9 env vars undocumented there; 46 missing from `.env.example` | docs | low |
| **S4** | `.env.example` states the pre-§21 first-account rule | docs | low |
| **P1-10** | No `<main>` landmark on 8 of 9 pages; no skip link | public | low |
| **P1-11** | Nav and footer tap targets measure 23px against 24 | public | low |
| **P4-2** | The three icon PNGs are `max-age=0` | infra | low |

Severity is by consequence, not by category: a silent refusal on an
operator's own screen ranks above a missing `alt`.

---

## A1 · An admin who reloads the admin page is told to sign in

**Measured, and it never recovers.** Signed in with
`Cloud.user.role === 'platformAdmin'` and `Cloud.isAuthed === true`:

```
via hash nav  : "Admin  Business metrics and account management · storage: file  4 Total accounts…"
after reload +   0ms  role=platformAdmin  authed=true  "Sign in with an admin account to view this page."
after reload +8000ms  role=platformAdmin  authed=true  "Sign in with an admin account to view this page."
```

`scratchpad/audit/probe-admin.mjs`. Eight seconds later it still says it; the
view is rendered once and never again.

**Two defects in one line** (`js/app.js:6259`):

```js
if (!Cloud.user || !['platformAdmin', 'owner'].includes(Cloud.user.role)) {
  main.innerHTML = `… ${Cloud.isAuthed ? 'This page is for administrators only.'
                                       : 'Sign in with an admin account to view this page.'} …`;
```

1. **It refuses a state that is "not yet known" rather than "not allowed".**
   §3's paint-first invariant means `route()` → `renderAdmin()` runs *before*
   `/api/me` resolves, so `Cloud.user` is null at render time.
2. **And it then picks the wrong one of its two messages.** `Cloud.isAuthed`
   is also false at that moment, so the signed-in admin gets the *sign in*
   variant — the strictly worse half.

**Why it never recovers.** `syncInBackground()` repaints the view in exactly
two cases: `if (scopeChanged) route()`, and
`if (!modules.length && …) route()` — whose own comment says it is for the
onboarding screen specifically. Identity resolving is neither. Every other
view survives that because none of them puts its whole content behind a role;
Admin does.

**The seam to fix it already exists and is unused here.** `Cloud.ready` in
`js/cloud.js` carries this comment: *"False until /api/me has answered (or
timed out) — the first paint happens before that, so the UI needs to
distinguish 'no server' from 'not yet'."* It appears **once** in the whole app
(`js/app.js:1500`, in `renderSidebar`). And the role is not even missing —
`crmb:user` holds the full user object including `role`, and
`offlineIdentity()` reads it back; it is just not consulted until
`Cloud.init()` runs, after the paint.

```sh
grep -c 'Cloud.ready' js/app.js     # 1
```

**This is §26's recorded defect in a new place**, and that section's words
apply unchanged: *"the first version had the client choose the wording from
`Cloud.user.role` — and it named the wrong rule, because this fires precisely
when the client's idea of its own role is stale."*

Nothing is exposed — `requirePlatformAdmin` still enforces on the server. What
breaks is the operator's own screen, reachable by a refresh, a bookmark, or a
pasted link.

---

## P1-1 · Every inline link on five public pages is invisible in dark mode

`legal.css` styles exactly two anchors — `header a.back` (line 77) and
`footer a` (line 110). Every link in the **body** of a page falls through to
the browser default `#0000ee`.

| | measured |
|---|---|
| dark | **2.0:1** (`#0000ee` on `#0c111d`) — AA needs 4.5 |
| `/guide` worst case | **1.9:1** (`#0000ee` on `#111725`) |
| light | ~8.6:1 — **passes**, which is why nobody saw it |

`/pricing` 3 nodes · `/refunds` 2 · `/guide` 3 · `/privacy` 2 · `/terms` 4.
Among them the `mailto:contact@nimbleclerk.com` §85 published so a data
subject could exercise their rights, and both legal pages.

`--accent` for dark already exists in `legal.css:56,65` as `#6aa6ff`, which
§59 measured at 7.64:1 — so the fix is one rule using a token that is already
there and already measured.

**Why §60's guard could not catch it.** That section's dark-mode E2E asserts
computed **`backgroundColor`**, deliberately — *"an attribute no rule reads IS
the legal.css half-toggle bug"*. It never asserted a foreground.

```sh
grep -nE 'header a.back|footer a' legal.css     # the only two anchor rules
```

---

## P1-2 · Both doc pages render at 980px on a phone

`docs/manual.html` and `docs/product-tour.html` have **no
`<meta name="viewport">`**. On a Pixel 7 profile:

| page | layout viewport | scale | effective body text |
|---|---|---|---|
| `/guide` (has the meta) | 412 | 1.00 | 16px |
| `/docs/manual.html` | **980** | **0.42** | **~6.7px** |
| `/docs/product-tour.html` | **980** | **0.42** | **~6.7px** |

Both are customer-facing with **frozen URLs** (§28, §29) because they may
already be in somebody's inbox.

**Why the earlier measurement missed it.** §48 measured the manual's mobile
Contents toggle "at a 390px viewport" and found it worked — correct, and a
desktop Chromium window has no 980px fallback, so an absent viewport tag is
invisible to it. It needs device emulation, and axe cannot see it either
(above).

---

## A2 · Focus escapes a dialog that declares `aria-modal="true"`

Twelve Tab presses from the open record form, in all four theme/width
combinations:

```
INPUT#f-name > INPUT#f-email > INPUT#f-phone > INPUT#f-company >
INPUT#f-tags > TEXTAREA#f-notes > BUTTON.btn > BUTTON#record-save > *BODY.modal-open
```

`escapedModal: true`, 2–4 of 12 tabs landing outside. `openModal` sets
`role="dialog" aria-modal="true"` (`js/app.js:1443`) and focuses the first
control (1451); there is **no Tab trap and no focus restore** —

```sh
grep -c 'lastFocus\|document.activeElement\|trapFocus' js/app.js    # 0
```

**The module builder does not escape, and that is not a second data point** —
it has more than twelve focusable controls, so twelve tabs never reach the
end. It has the same absent trap.

§57 filed this as a *lead* rather than a finding, on the grounds that driving
it was the only way to know. Driven: it is a finding.

---

## A4 · The kanban board cannot be used without a mouse

Measured on every theme/width combination:

```json
{ "tag": "div", "cls": "kanban-card", "focusable": false,
  "tabindex": null, "role": null, "draggable": "true", "ariaLabel": null }
```

So a card cannot be focused, cannot be opened, and cannot be moved between
columns by keyboard. `js/app.js:2640` emits `draggable="true"` with no
`tabindex`; the only handlers are `dragstart` / `dragover` / `drop`
(2758–2771). The table view's rows, by contrast, carry `tabindex="0"` and an
Enter handler (1001, 2752) — so the gap is specific to the board, and Deals
opens as a board by default.

The sortable column headers are the model to copy: `tabindex="0" role="button"`
plus an Enter/Space handler (2608, 2662).

**A keyboard route to move a card is a design decision, not a one-liner** —
the roadmap already names it as what decides whether that item is small or
large. Focusing and opening a card is the cheap half.

---

## A5 · The not-found screen is seventeen characters

```js
main.innerHTML = '<div class="page"><p class="empty-hint">Module not found.</p></div>';
```

Measured: `mainTextLength: 17`, `mainInteractiveCount: 0`, no heading.

`renderRouteError`, forty lines away, is the model it does not follow — an
`<h2>`, the reason, and three actions (*Try again* · *Go to dashboard* ·
*Report this*).

**It is reachable without anybody doing anything odd.** §15 records it: *"A
removed member's page is still on the old module's route, which no longer
exists for them — that renders 'Module not found', not onboarding."* So the
screen a removed colleague lands on is one sentence with no heading and
nothing to press.

---

## P1-5 · Table scroll containers are not keyboard-reachable

`scrollable-region-focusable` — WCAG 2.1.1 and 2.1.3, level **A**, serious.
`/docs/manual.html` 2 regions at 390px and 4 at 320px;
`/docs/product-tour.html` 1 at 320px. The app's kanban has the same shape:
its columns sit in `div.kanban`, a scroll container.

The `div.table-wrap` wrappers correctly stop the **page** scrolling sideways
(see *Swept and clean*) — and a keyboard user cannot scroll the table inside
one. §47 measured `/guide`'s roles table as never needing to scroll at
360/320, which is true of that table; these need to.

---

## P4-1 · Nothing is compressed

Cold load of `/app`, service worker blocked:

```
requests 18   total body 645.4 KB   DCL 50ms
  380.5 KB  enc=none  /js/app.js
   50.6 KB  enc=none  /css/style.css
   47.1 KB  enc=none  /fonts/inter-var-latin.woff2
   38.3 KB  enc=none  /js/demo-data.js
```

`Content-Encoding` is absent on **every** text asset; eleven of them are over
8 KB. There is no `compression` dependency and no mention of gzip, deflate or
brotli in `server.js`:

```sh
grep -c 'compression\|gzip\|deflate\|brotli' server.js    # 0
```

The font is woff2 and already compressed, so the headroom is the ~560 KB of JS
and CSS — which gzip typically takes to a fifth. §3's paint-first invariant is
about **ordering** and is unaffected; this is weight, which has never been
measured, on a free tier where §8 records cold starts as a standing limit and
§2 says to warm the URL before a demo.

**Measured locally, and the live answer may differ.** This session reaches
neither host (§8), and a platform edge may compress on its own. One command
settles it:

```sh
curl -s -o /dev/null -D - -H 'Accept-Encoding: gzip,br' \
  https://nimbleclerk.com/js/app.js | grep -i 'content-encoding\|content-length'
```

If that shows an encoding, this finding is **infrastructure-only** and the fix
is a line in `DEPLOYMENT.md` saying so. If it does not, it is the cheapest
single improvement available to a first visit.

---

## S1 · Failed-payment ids evict the window that attributes disputes

`PAYMENT_ID_HISTORY` is 12 and the list exists for exactly one purpose: a
dispute payload carries no `metadata`, so §84 attributes it by looking the
`payment_id` up against recent payments.

Every member of `BILLING_PAYMENT_EVENTS` writes into that window:

```js
if (BILLING_PAYMENT_EVENTS.has(type)) {
  const id = String(data.payment_id || '');
  if (id) paymentIds = [id, ...paymentIds.filter((p) => p !== id)].slice(0, PAYMENT_ID_HISTORY);
}
```

and the set is `payment.succeeded`, **`payment.failed`**, `payment.processing`.

`processing` is harmless — it carries the same `payment_id` as the eventual
success, so the dedup collapses it. **`failed` is not**: §73 measured that a
failed payment and its retry carry *different* payment ids. So a dunning
sequence consumes several slots a month, and a window sized for twelve
payments covers proportionally less — against a chargeback window that runs to
120 days.

**A dispute can only ever be against money that moved.** A failed payment
cannot be charged back, so its id can never be the one a dispute names:
recording it has no upside and evicts ids that do. Gating the push on
`payment.succeeded` makes the window exactly twelve settled payments.

The failure mode is quiet: an unattributable dispute is logged *"could not be
attributed"* and acknowledged with a 2xx, and §84 describes that line as
nobody's fault — so an operator reading it would not know it was an eviction
rather than a foreign payment. It also lands hardest on the customers most
likely to dispute, the ones whose payments are failing.

---

## P1-4 · The manual is a dead end

15 links, **every one a fragment** — its own table of contents. The footer is
a single `<p>`:

```html
<footer><p>Nimble Clerk — modular CRM for small businesses. …</p></footer>
```

No route to the app, the site, pricing or the privacy policy, from a URL that
is deliberately shareable and frozen.

`docs/product-tour.html` links `/app`, `/docs/manual.html` and `/terms` — and
**not** `/pricing`, on the page written to sell the product.

The legal pages' footers are also uneven: `/refunds` is linked only from
`/pricing`, so from `/terms` or `/privacy` a customer cannot reach the refund
policy — which §79 records as a page the payment provider requires to be
publicly reachable.

| page | internal links |
|---|---|
| `/`, `/welcome` | `/` `/app` `/guide` `/pricing` `/privacy` `/terms` + both doc pages |
| `/pricing` | `/` `/guide` `/privacy` `/refunds` `/terms` |
| `/refunds` | `/` `/pricing` `/privacy` `/terms` |
| `/guide` | `/` `/app` `/docs/manual.html` `/privacy` `/terms` |
| `/privacy` | `/` `/pricing` `/terms` |
| `/terms` | `/` `/pricing` `/privacy` |
| `/docs/manual.html` | **none** |
| `/docs/product-tour.html` | `/app` `/docs/manual.html` `/terms` |

---

## P1-6 · The faint ink token fails AA wherever it carries text

`--ink-soft` as text: **3.01:1** on `--paper` and **2.84:1** on
`--paper-sunk` in light; **3.94** and **3.74** in dark. The sites are 13px
bold and 12–14px normal, so the large-text 3:1 allowance does not apply —
axe reports *"Expected contrast ratio of 4.5:1"* for each.

`welcome.html` `.spine > h2`, `.next > h2`, `.foot-row > span` ·
`manual.html` `.eyebrow`, `.masthead-meta`, `.toc-title`, `.alias` ·
`product-tour.html` `.hero-note`.

**Distinct from the three failures ROADMAP §2 left deliberately**, which are
`--text-faint`, `--ok` and `--warn` in `css/style.css` — the app. This is a
different token on a different stylesheet, and §58/§59 reported everything on
`welcome.html` at 4.5+ because they measured `.limit` and `.card span` (7.69
each), not these.

## P1-7 · `--accent` on a tinted ground

**4.29:1** — `#1570ef` on `#f7f8fa` at 14px — for `nav > a[href="/app"]` and
the footer nav on `/welcome`. §58 measured `--accent` at **4.57:1** against
**white**, which is correct; §59 then introduced `.band` on `--paper-sunk` for
the *Where to go next* row, and these links now sit on it. A fix moved them
onto a ground where the token no longer clears.

Also `product-tour.html` `.kicker`: **3.87:1** (`#1570ef` on `#e5edf9`).

---

## P1-8 · The sales page never mentions a shipped GDPR template

`docs/product-tour.html` contains **zero** occurrences of "consent". Its
module list (line 259) names seven of eight templates and omits *Consent &
lawful basis*, and there is no paragraph for it either.

§49's docs-walk table records the omission from the list as deliberate
*"because consent has its own paragraph in each"*. Measured:

```sh
for f in guide.html docs/product-tour.html README.md; do grep -c -i consent $f; done
# guide.html 1   docs/product-tour.html 0   README.md 2
```

`guide.html:198` is a real paragraph and `README.md:29` a real feature bullet,
so the claim holds for two of the three. On the third, a GDPR-facing feature
aimed at the UK/EU market is absent from the page written to sell to it.

---

## P1-9 · SEO: no canonical anywhere, no robots.txt, no sitemap.xml

| page | lang | canonical | desc | og | twitter | `<main>` | viewport |
|---|---|---|---|---|---|---|---|
| `/`, `/welcome` | en | **no** | 173 | 5 | 1 | **no** | yes |
| `/pricing` | en | **no** | 49 | 0 | 0 | **no** | yes |
| `/refunds` | en | **no** | 80 | 0 | 0 | **no** | yes |
| `/guide` | en | **no** | 85 | 0 | 0 | **no** | yes |
| `/privacy` | en | **no** | 58 | 0 | 0 | **no** | yes |
| `/terms` | en | **no** | 47 | 0 | 0 | **no** | yes |
| `/docs/manual.html` | **none** | **no** | 0 | 0 | 0 | yes | **none** |
| `/docs/product-tour.html` | **none** | **no** | 0 | 0 | 0 | **no** | **none** |

Apex vs `www` is **two origins** (LAUNCH-CHECKLIST §1.0), which is what makes
canonical load-bearing rather than cosmetic: without it both hosts are
independently indexable and split their own ranking.

`twitter:` is `twitter:card` alone on `/welcome`, with no
`twitter:title`/`description`/`image` — those fall back to `og:`, which works,
but only `/welcome` has any `og:` at all. `/pricing` and `/refunds`, the two
pages most likely to be shared, have none.

`/robots.txt` and `/sitemap.xml` 404 — cleanly (see below), but they do not
exist.

---

## Smaller findings

**A3 · Dialogs have no accessible name.** `role="dialog" aria-modal="true"`
with `aria-labelledby: null` and `aria-label: null`, so a screen reader
announces "dialog" and nothing else. One attribute pointing at the heading
each modal already has.

**S2 · `ALLOW_DEV_LOGIN` is absent from `DEPLOYMENT.md`.** Zero mentions, in
the matrix an operator configures from, for the variable that enables
**passwordless email login**. The code is sound — production requires an
explicit `'1'` (`server.js:63`) and smoke asserts it is off there — so this is
a documentation gap rather than an exposure, and it is the one variable in the
set where that distinction is worth stating.

**S3 · Environment variables documented in neither place.** `server.js` reads
**56**; `DEPLOYMENT.md` names 47, `.env.example` 10.

```sh
node -e '…'   # the comparison is in scratchpad/audit, and is three greps
```

Missing from `DEPLOYMENT.md`: `ALLOW_DEV_LOGIN` `DATA_DIR`
`GOOGLE_USERINFO_URL` `INVITE_TTL_DAYS` `MAIL_API_BASE` `MONGODB_DB` `PORT`
`RATE_MAIL_SEND_MAX` `STORAGE_LIMIT_BYTES`. Two of those are SSRF-relevant
test seams (§38, §52) and `GOOGLE_TOKEN_URL` **is** documented while its
sibling `GOOGLE_USERINFO_URL` is not, which is the kind of pair that goes
stale together.

**S4 · `.env.example` states the pre-§21 first-account rule.** *"(the very
first account to sign up is also made admin automatically)"* — unconditional.
§21 made it conditional: `const bootstrapAdmin = isFirst && ADMIN_EMAILS.length === 0`
(`server.js:1474`), which was the whole point of that finding. The file also
names `crmbuilder.onrender.com` as its example `APP_URL`, which §63's domain
walk did not reach. It is **not served** (404, §28's dotfile rule — checked).

**P1-10 · No `<main>` and no skip link.** `landmark-one-main` on 8 of 9 pages,
`region` on 13–47 nodes each. `/` and `/welcome` carry two unlabelled `nav`
elements at 1440 (`landmark-unique`). Best-practice rather than WCAG, but
"skip to main content" has nothing to skip to.

**P1-11 · Tap targets at 23px.** `/welcome`'s nav and footer links measure
90x23 ("Open the app"), 46x23, 49x23, 41x23 against WCAG 2.2 AA 2.5.8's
24x24. **Stated as marginal deliberately:** axe's own `target-size` rule does
not flag them — it flagged the fixture's 10px button — because 2.5.8 exempts
targets in a sentence and axe applies a spacing exception. A judgement call,
recorded because it is one CSS line.

**P4-2 · The icon PNGs are `max-age=0`.** `/fonts/inter-var-latin.woff2` is
`immutable` and `sw.js` is correctly `no-cache`; `/icons/icon-192.png` and its
two siblings revalidate on every load despite being content-addressed by name.
§28 records that the cache headers "had to come along" when the wildcard was
replaced — the font got `immutable` and these did not.

---

## Swept and clean

Recorded because §48's rule is that *"I checked and there was nothing"* is
what stops the next reader re-running it on a hunch.

- **Service-worker cache poisoning is closed as a class.** 13 paths, **one
  fresh profile each**, asserting on the first load of `/app` afterwards: the
  cached shell stays 3189 bytes and the app renders every time.
  §63's path gate (`if (url.pathname !== '/app') return`) is what does it, and
  this is the first time it has been driven rather than read — §19 and §47 each
  had to fix an instance of this twice, and §47's own probe reported "none"
  while the defect was live, because it ended on a path whose response *is* the
  shell. `scratchpad/audit/probe-sw.mjs`.
- **§3's four places agree.** `index.html` has 14 scripts; `APP_SHELL` has the
  same 14; `tests/smoke.mjs` `ASSETS` covers them. `js/manual-toc.js` is in
  none of the three, deliberately (§47).
- **Zero console errors and zero failed requests**, across 9 public pages × 2
  themes × 4 widths, and across every app view and modal.
- **No horizontal page overflow anywhere.** Every overflowing element at every
  width sits inside a scroll container, and `pageScrollsSideways` is false in
  all 72 public-page runs and every app run. §47's `.table-wrap` is doing
  exactly its job. (Its keyboard half is P1-5.)
- **Link integrity.** 9 internal targets all 200 · 16 fragment links all
  resolve · 2 external (`resend.com`, `postmarkapp.com`, both named on
  `/privacy`) · 1 `mailto`. **No `target="_blank"` anywhere**, so no
  `rel="noopener"` gap. No build-tool or scratch host — §48's finding has not
  recurred.
- **Crawler paths 404 cleanly.** `/robots.txt`, `/sitemap.xml`, `/favicon.ico`,
  `/.well-known/security.txt` each return 9 bytes of `text/plain`, not the
  landing page. §28's extensioned-path rule working.
- **Spelling: nothing.** aspell en_GB over the rendered text of all 9 pages.
  Every hit was a product term, a proper noun, a table-cell concatenation
  artifact of `innerText`, or a smart apostrophe the byte-mode pipeline could
  not read.
- **Every factual claim that can be checked locally is in sync**: the price
  `$15`/`$150` against `docs/PAYMENTS.md` §5 · `TERMS_VERSION = '2026-10-19'`
  against *"Last updated 19 October 2026"* on both legal pages (§41's pair) ·
  `/refunds`' three data facts against `readOnlyState()`, word for word (§86's
  pair) · every `Settings → …` path named on a public page exists in
  `js/app.js` (§53's rule) · *"five users"* against `SEAT_CAP` 5 · four role
  names against `TEAM_ROLES` · *"Twelve field types"* against 12 in
  `FIELD_TYPES`.
- **The privacy roster is accurate today, and the payment provider's absence
  is not a gap.** §80's free-mode gate means no checkout link is issued at all,
  so the customer email §74 prefills never leaves. It goes false at the paid
  flip, and LAUNCH-CHECKLIST §2.1 **already carries `privacy.html`** with an
  entry naming exactly that addition.
- **No credential is committed.** Shape scan over every tracked file for
  `sk_live`/`sk_test`/`whsec_`/`re_…`/`AIza…`/`ghp_…`/PEM blocks and long
  bearer tokens: every hit is a documentation placeholder, a code constant
  (`SECRET_PREFIX`), or a deliberately readable test fixture (§69).
  `.env` is gitignored and untracked; `.env.example` has every value empty.
- **`platform` holds no credentials** (§17's rule). `OPERATOR_DECISIONS` is
  five non-secret decisions, each restored with its `SetAt`/`SetBy`.
- **The payment webhook's guards are sound.** `express.raw` is mounted at
  2747, **before** the global JSON parser at 2749 (§38's ordering dependency) ·
  503 when unconfigured and 401 on a failed signature, with the code and detail
  going only to the log · the rate limit **is** wired, via `app.use` at 2844,
  not on the route signature where I first looked for it · and the three new
  admin billing routes all validate before use: an allow-list `includes` for
  the mode, `Number.isFinite` plus bounds at both ends for the windows (§10's
  `Number(x) || now` trap avoided), `String()` before `parseDay` for the
  exemption.
- **No payments credential can reach a log.** `DODO_WEBHOOK_SECRET` is named
  in a log line and its value never interpolated; `DODO_PORTAL_URL`'s refusal
  does not print the URL.
- **`/` and `/welcome` are byte-identical in every measurement**, confirming
  §63 serves one page from two paths.

## Confirmed, previously decided — not new findings

- **ROADMAP §2's three contrast failures** — `--text-faint` 2.58/3.38, `--ok`
  4.01, `--warn` 3.49 — are in `css/style.css` and belong to the app. P1-6 is a
  different token on a different stylesheet. Still open, still deliberate.
- **§30's five FALSE findings** are not revisited: no CORS middleware (absence
  is the mitigation), `SESSION_SECRET` falling back to random bytes, no
  reachable NoSQL injection, no mass assignment, no exploitable prototype
  pollution.
- **§61's R1–R5**, and its decision that the CI audit gate stays at `high`
  (§25's reasoning). §89 is that gate firing for the first time.
- **The CSP is tight enough to refuse an injected `<script>`** — which is why
  these probes inject axe through the debugger protocol instead. §30 Phase 4
  working as built.
- **`style-src 'unsafe-inline'`** stays for 14 dynamic `style=` attributes.

---

## Not covered, and what it would take

Stated so the gaps read as checked rather than missed.

- **No viewer or contributor pass.** Everything here was driven as an owner or
  signed out. §36's finding — a viewer could rename the workspace and switch
  its currency — came from driving the product *as a viewer*, which is a
  different instrument from reading the code, and it is the single most likely
  place another finding is sitting.
- **Safari and iOS.** Playwright runs Chromium only, and nothing has ever run
  this PWA on WebKit. An offline-first app leaning on IndexedDB and service
  workers has real exposure there, and `playwright.config.js` has one project.
- **No live-host measurement.** This session reaches neither host (§8), so
  every figure here is from a local file-store deployment. P4-1's compression
  question in particular has a different answer at an edge.
- **Client-side observability does not exist**, so none of this is visible in
  production. Worth a decision rather than leaving ambiguous: there is no error
  reporting from the browser beyond the ten-entry ring buffer a problem report
  carries (§18).
- **The DSAR search, retention and dormancy panels** were measured as part of
  Settings but not exercised with data; their empty and populated states are
  where §36's *renders as nothing* class would show up next.
