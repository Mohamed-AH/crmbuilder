# Nimble Clerk — working notes

Context for anyone (human or agent) picking this up mid-stream. Read this
before changing code; it records decisions and traps that are not obvious from
the source, and it is the safe restart point after a context compaction.

**Branch:** `claude/pwa-modular-crm-builder-xcwgzv` — all work goes here.
**Live:** https://nimbleclerk.com — the app itself is at `/app`; `/` is the
landing page (§63). `crmbuilder-v1.onrender.com` is the same deployment and
still answers.
**Other docs:** [`docs/README.md`](docs/README.md) is the map. This file is the
engineering half and is kept current; `docs/archive/` is frozen on purpose.

---

## Find it by topic

Sections are numbered in the order they were written, and several are named for
the build stage that produced them — "stage C", "beta stage 2" — which means
nothing if you were not there. **Read down this column instead.** The numbers
never change, because everything cross-references them.

| Looking for | Go to |
|---|---|
| **Start here** — what must not break | §3 invariants · §4 traps · §9 conventions |
| Where the files are, what loads when | §1 · §3 |
| What is shipped, and what is deliberately not | §2 |
| **Sync**: the delta protocol, the two clocks | §10 |
| Sync: field-level merge (`fieldsAt`) | §26 |
| Sync: whose data is on this device | §11 storage scopes |
| **Permissions**: the role ladder, refusals | §14 · §26 (contributor/viewer) |
| Teams: invites and joining | §13 |
| Teams: roles, removal, leaving | §15 |
| Orgs, tenancy, and the 404-not-403 rule | §5 |
| **Signup**: the gate and its bypass order | §16 · §20 (access requests) |
| Operator panel: usage, quotas, levers | §24 |
| Alerts and thresholds | §25 |
| **Before removing a meter** — what it costs | [`docs/archive/TELEMETRY.md`](docs/archive/TELEMETRY.md) |
| Backups, export auth, measured usage | §17 |
| **Restoring a backup** — what it verifies, what it loses | §17 |
| Restore granularity, and the webhook a recovery cannot bring back | §38 |
| Problem reports and webhook shapes | §18 |
| Legal pages, service-worker page trap | §19 · §47 |
| **What the server publishes** (allow-list) | §28 |
| Migrations | §12 |
| Guided tour | §7 |
| Deleting a field; currency relabels | §22 · §23 |
| Security audit and what it changed | §21 · §30 (findings, incl. the false ones) |
| Why docs go stale, and which ones | §27 |
| **"Synced" that is not synced** — backdated rows | §31 |
| **Which tests to run** — and who runs the rest | §9 |
| **Demo data vs the seed fixture** — which is which | §34 |
| Guided tour: card covering its own highlight | §35 |
| **View-only**: what it must look like, and the hole | §36 · §14 |
| **Dates**: the due filter, and the UTC parsing trap | §37 |
| **Outbound webhooks**: the guard, and where the URL lives | §38 |
| Telegram setup, and why `sendGuarded` hung | §38 |
| **UK launch, Frankfurt, and a smoke check that passed on its own bug** | §38 · [`docs/archive/UK-LAUNCH.md`](docs/archive/UK-LAUNCH.md) |
| **Daily digest**: the pass, its gates, mentions | §39 |
| Why a "reminders are stale" alert cannot work | §39 |
| **`/health` vs `/healthz`** — which one runs anything | §40 |
| Alerts and digests silently never running | §40 |
| **What a healthy reminder ping log looks like** | §40 |
| Expected refusals in the production log | §40 |
| **Restoring into a new or existing database** | §40 · [`docs/BETA.md`](docs/BETA.md) |
| **Rotating a Healthchecks ping URL** — and the swap that leaves both green | [`docs/BETA.md`](docs/BETA.md) · §39 |
| **Decrypting a backup artifact** — command, passphrase, failures | [`docs/BETA.md`](docs/BETA.md) · §40 |
| Invites and beta codes a restore cannot carry | §40 |
| **Terms acceptance**: the version, and asking again | §41 |
| **A modal button that settled as a dismissal** | §41 · §22 |
| **Consent & lawful basis template** | §42 |
| **CSV date import** — the day it lost, and DD/MM | §42 · §37 · §45 |
| **A question with no correct default** — how to ask one | §45 |
| **What to send a customer** — the short page, and the post | §47 |
| A doc page that rendered as the app | §47 · §19 |
| **CI red that clears on re-run** — the live smoke vs the deploy | §46 |
| Which commit is actually deployed | §46 · §40 |
| **Subject access requests**: the search, and what it cannot find | §43 |
| **Closing your own account** — and what it takes with it | §43 · §15 |
| **Retention**: what has gone quiet, and why nothing deletes it | §44 |
| Calendar months backwards, and the overflow that skips one | §44 |
| Workspace time zone — and why the filter ignores it | §39 · §38 · §37 |
| E2E suite slow or "flaky" | §32 |
| **What tombstones cost**, and reading storage figures | §33 · §26 |
| **How the docs are organised**, and what is frozen | §29 |
| **Own domain / pricing** — everything a launch has to change | [`docs/LAUNCH-CHECKLIST.md`](docs/LAUNCH-CHECKLIST.md) · §48 |
| **Sweeping for what is live and unnoticed** — how, and what it found | §48 |
| **Chaser, renewal tracker, dormancy report** — the spec, before any code | [`docs/CHASER-AND-TRACKERS.md`](docs/CHASER-AND-TRACKERS.md) |
| **Sums, averages, calculated columns** — the spec, before any code | [`docs/CALCULATIONS.md`](docs/CALCULATIONS.md) · §66 · §67 · §68 |
| **Calculated fields** — what was built, and the picker rebuilt from the draft | §66 |
| A derived value stored nowhere, and the `compareBy` signature that paid for it | §66 · §22 · §31 |
| A refusal that named a key instead of a label | §66 · §53 |
| **A total under a column** — what it covers, and the line that says so | §67 · §33 · §37 |
| An aggregate choice that belongs to the team, not the device | §67 · §60 · §14 |
| A suffix shown on one operation out of five, and why not all five | §67 · §33 · §66 |
| A test two unrelated mutations could fail | §67 · §9 · §4 |
| **Grouping a table by week or month** — what it groups, and what it does not store | §68 · §67 · §37 |
| Which day a week starts on, read from the runtime rather than a table | §68 · §42 · §29 |
| A period boundary that cannot overflow a month | §68 · §44 |
| A timezone pin that makes a label assertion mean something | §68 · §55 · §50 |
| Why a formula box is a code-execution sink here | [`docs/CALCULATIONS.md`](docs/CALCULATIONS.md) §3 · §3 invariants · §30 |
| A derived value that must never be stored, and Salesforce's repair button | [`docs/CALCULATIONS.md`](docs/CALCULATIONS.md) §3 · §22 · §31 |
| One date field per module — what a second one costs | §49 · §50 · [`docs/CALCULATIONS.md`](docs/CALCULATIONS.md) §5 |
| **Tracking what expires** — the template, and the one date field | §49 · §37 · §39 |
| **Dormancy vs retention** — two questions, two clocks | §50 · §44 |
| **Chasing an overdue record** — the draft, and the two escapes | §51 |
| **A provider key on the meta doc** — where it goes, and what redacts it | §52 · §38 · §17 |
| Resend vs Postmark, detected rather than asked | §52 |
| **Sending a chaser** — the recipient rule, and the relay it closes | §53 · §51 |
| **A doc sibling that survives a stale push** — the union, not more clocks | §54 · §26 · §10 |
| Who already chased this, and sent vs drafted | §54 |
| **A failed write killed the process** — async routes, and a Windows rename | §55 · §30 · §4 |
| **A test that passes in a UTC container** — and the save it was hiding | §55 · §45 · §39 |
| **Reaching a prebuilt module you skipped at onboarding** | §56 · §49 · §42 |
| **Where BYOK setup is written down** | §56 · §52 · §53 |
| **What to build next** — dark mode, a11y, i18n, integrations, re-audit | [`docs/ROADMAP.md`](docs/ROADMAP.md) · §57 |
| **The domain is `nimbleclerk.com`** — and apex vs `www` is two origins | [`docs/LAUNCH-CHECKLIST.md`](docs/LAUNCH-CHECKLIST.md) §1.0 · §57 |
| **Dark mode** — the three-branch pattern, and the half-toggle it closed | §60 · §57 |
| Why a security re-audit is due, and what it must NOT re-raise | §57 · §30 |
| **The Windows skip count that proved the rename retry** | §55 |
| **The landing page** — why `/welcome` and not `/` | §58 · [`docs/LAUNCH-CHECKLIST.md`](docs/LAUNCH-CHECKLIST.md) §1.0b |
| Auto margins on a flex child, and a width that was right by luck | §58 · §4 |
| Contrast measured rather than judged; the limit that must not be faint | §58 · §47 |
| The legal pages never loaded the font they ask for | §58 · §19 |
| **A shadow that never rendered** — `drop-shadow()` takes no spread | §59 |
| A token that is a no-op in one theme, and how "raised" is signalled | §59 · §47 |
| Why the beta box is not a trust badge at the domain move | §59 · [`docs/LAUNCH-CHECKLIST.md`](docs/LAUNCH-CHECKLIST.md) §2.1 |
| **A shipped path that no test had ever driven** — and it was under AA | §60 · §36 |
| **Where a per-device preference lives**, and why never in `settings` | §60 · §11 · §14 · §38 |
| A script that must run before first paint, under `script-src 'self'` | §60 · §30 · §3 |
| Which subresources belong in `STANDALONE_ASSETS`, and which must not | §60 · §47 |
| **Contrast failures left deliberately** — and where the decision lives | §60 · [`docs/ROADMAP.md`](docs/ROADMAP.md) §2 |
| **The security re-audit** — what it found, and what it must not re-raise | §61 · §30 |
| **A credential that reached the log** — the one fetch error that carries a URL | §61 · §18 · §39 |
| Headers a caller may not set, and why `Host` is one of them | §61 · §38 |
| **Authorize, then meter** — a limiter in front of a guard | §61 · §24 |
| A `Map` that is load-bearing, and the entry it would silently drop | §61 · §54 · §30 |
| The router wrap and the argument shape it skipped | §61 · §55 |
| **Why the CI audit gate stays at `high`** | §61 · §25 · §30 |
| **A critical advisory that does not apply** — and what would arm it | §62 · §30 · §61 |
| `trust proxy` is a hop count, and why a CDN changes that | §62 · §30 |
| **Moving to the new domain** — where it stands, what lands when | [`docs/LAUNCH-CHECKLIST.md`](docs/LAUNCH-CHECKLIST.md) §1.6 · §1.0b |
| The DNS pre-flight, the mail records that must survive, and the `www` 301 nobody owns | [`docs/LAUNCH-CHECKLIST.md`](docs/LAUNCH-CHECKLIST.md) §1.0c · §1.6 step 2 |
| Why the `/`→`/app` swap cannot be pushed before the switch | [`docs/LAUNCH-CHECKLIST.md`](docs/LAUNCH-CHECKLIST.md) §1.0b · §46 |
| **The app is at `/app`** — what moved, and the sign-in that landed on a splash | §63 · §58 |
| Only one URL may become the cached shell, and why a list could not say so | §63 · §47 |
| A state cookie is per-origin, so a stale `APP_URL` breaks sign-in rather than misrouting it | [`docs/LAUNCH-CHECKLIST.md`](docs/LAUNCH-CHECKLIST.md) §1.3 · §63 |
| **A trailing slash made the live-smoke wait a no-op** — and a repo variable outlived the default it overrides | §63 · §46 · §40 |
| **Taking payment** — the rail, the price, the chargeback plan, India tax | [`docs/PAYMENTS.md`](docs/PAYMENTS.md) · §72 · §64 · [`docs/LAUNCH-CHECKLIST.md`](docs/LAUNCH-CHECKLIST.md) §2 |
| **Setting up and TESTING test-mode payments** — the dashboard steps | [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §7 · §72 · §65 |
| **What a real payment found** — the host, the event list, the card region | §73 · §71 · §70 |
| A checkout link that renders "This link isn't available" | §73 · §71 |
| Why a test card is refused rather than declined | §73 · §45 |
| A card that said `unknown` with the answer already in the record | §73 · §39 · §36 |
| **A return URL the provider does not navigate to** — and the 429 on their hop | §73 · §71 · §70 |
| **A pricing ceiling read off a mandate screen** — ₹15,000, and annual billing | §73 · [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §5 · §3 |
| **Testing every payment scenario** — what to hand-drive, and what not to | [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §9 · §73 · §9 |
| **After somebody pays** — cancel, pause, invoices, duplicates | §74 · [`docs/SUBSCRIPTION-UX.md`](docs/SUBSCRIPTION-UX.md) · §71 · §64 |
| **Stopping a second subscription** — the key, and the race accepted | §74 · [`docs/SUBSCRIPTION-UX.md`](docs/SUBSCRIPTION-UX.md) §2 |
| Why a duplicate subscription cannot be caught by email | [`docs/SUBSCRIPTION-UX.md`](docs/SUBSCRIPTION-UX.md) §2 · §74 · §71 · §5 |
| A prefill refused in one commit and required in the next | §74 · §45 · §5 |
| Two unrecognised-value defaults pointing opposite ways, on purpose | §74 · §33 · §36 |
| **Where the customer portal link lives**, and why not composed | §74 · §73 · §70 |
| A field that survives the state it names (`paused_at`) | §74 · §9 |
| A comment that had promised an assertion nobody wrote | §74 · §46 · §14 |
| **A test count carried forward and read as measured** | §74 · §2 · §29 · §9 |
| **The product is Nimble Clerk** — and three identifiers that must not follow it | §77 · §58 · §34 · §47 |
| An internal identifier that happens to contain the old product name | §77 · §34 · §29 |
| **Our brand in the slot meant for the customer's own name** | §77 · §36 · §3 |
| A pre-paint string and its render, and a test that could only see one | §77 · §9 · §34 |
| A grep that reports "binary file matches" and prints no line | §77 · §73 |
| **The price, the seat cap, and the free/paid switch** | [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §5 · [`docs/SUBSCRIPTION-UX.md`](docs/SUBSCRIPTION-UX.md) Phase 2 · §64 |
| Why enforcement was mostly already shipped | [`docs/SUBSCRIPTION-UX.md`](docs/SUBSCRIPTION-UX.md) Phase 2 · §24 · §36 |
| Grandfathering with no new field, off a key §17 forces you to store — **and why case-by-case needs one after all** | [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §5 · §17 · §16 |
| **A boolean exemption that re-creates "for ever" by accident** | [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §5 · §70 · §74 |
| Promising notice rather than a duration, in the one place it gets quoted back | [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §5 · §47 · §41 |
| **A test that read a whitelisted projection could not see the leak behind it** | §76 · §70 · §38 · §9 |
| **Saying what to DO about a billing state**, and the phase that made it possible | §76 · §74 · [`docs/SUBSCRIPTION-UX.md`](docs/SUBSCRIPTION-UX.md) |
| A provider's vocabulary on a customer's screen — and when a map is safe to write | §76 · §73 · §45 |
| A request that is not a state, and the flag it did NOT need | §76 · §70 · §26 |
| Why a notice that might be stale has to say so | §76 · §51 |
| **Two identical verdicts in one CI run** — and the wrong one is last | §75 · §46 · §33 |
| Why a blank `workflow_dispatch` input does NOT override its fallback | §75 · §63 · §65 |
| Which five smoke checks differ between local and live, measured | §75 · §46 |
| A cancel flow that is a chargeback control rather than a nicety | [`docs/SUBSCRIPTION-UX.md`](docs/SUBSCRIPTION-UX.md) §1 · [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §3 · §64 |
| A derived list that was wrong the same way the typed one was | §73 · §29 · §34 |
| Events that production would see first, and cannot be produced in test mode | §73 · [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §9 |
| Why Stripe cannot collect for an Indian seller, and what an MoR sidesteps | §64 · [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §1 |
| What an MoR protects you from, and the half it does not | §64 · §72 · [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §3 |
| **A claim on a customer-facing card that only the MSA can support** — now supported | §72 · [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §2 · §1 · §40 |
| **A one-click switch in somebody else's dashboard that would invert the tax position** | [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §2 · §1 · §40 |
| A settings page that narrows a contractual question without closing it | [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §2 · §8 · §73 |
| **Three grades of evidence for one question**, and why only the last one closed it | [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §2 · §8 · §73 |
| One answered row read as a cleared table | [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §8 · §7 step 1 · §17 |
| A chargeback lever that turns out to belong to the provider | [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §2 · §3 · §73 |
| **A currency decision that requires a line of copy** | [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §5 · §3 · §45 |
| **A grandfathering formula whose base inverts its own purpose** | [`docs/SUBSCRIPTION-UX.md`](docs/SUBSCRIPTION-UX.md) Phase 2 · [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §5 |
| A derived cutoff that can already be in the past, and the floor that is the promise | [`docs/SUBSCRIPTION-UX.md`](docs/SUBSCRIPTION-UX.md) Phase 2 · §36 · §39 |
| **The trial's dependency path** — and the branch that needs a credential nothing reads | [`docs/SUBSCRIPTION-UX.md`](docs/SUBSCRIPTION-UX.md) Phase 2 · §72 · §17 · §71 |
| **The billing lever** — the third operator switch, and what it does NOT do yet | §78 · §16 · [`docs/SUBSCRIPTION-UX.md`](docs/SUBSCRIPTION-UX.md) Phase 2 |
| **A 30-second cache that has eaten three buttons** | §78 · §24 · §40 |
| A default that must never be what starts a charge | §78 · §16 · §17 |
| A stamp that must survive a restart, or every window re-dates | §78 · §17 · §10 |
| A list the code derived and the test typed by hand | §78 · §29 · §69 |
| **Two read-only holds on one workspace**, and which reason a customer sees | §78 · §24 · §36 |
| Why a reason tag fails silently and a second field fails visibly | §78 · §24 · §33 |
| Planting state nothing writes yet (`editStore`) | §78 · §12 · §34 |
| **The grandfather cutoff** — the window, the floor, and the per-org override | §78 · [`docs/SUBSCRIPTION-UX.md`](docs/SUBSCRIPTION-UX.md) Phase 2 · §44 |
| **A dry run on a screen that would otherwise be blank** | §78 · §33 · §39 |
| `monthsAgo(now, -n)` is months FORWARD, and the clamp is direction-agnostic | §78 · §44 · §9 |
| **An assertion that formatted a date and could not see its own mutation** | §78 · §76 · §9 |
| A `.note` base class that does not exist | §78 · §27 · §66 |
| **What the provider had already PUBLISHED** — six open rows closed off the docs | §79 · [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §8 · §72 |
| A question filed as "ask the vendor" that the vendor had answered in public | §79 · §8 · §29 |
| **A dispute that cannot be contested at all** — Visa RDR on by default at $100 | §79 · [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §3 · §5 |
| Two assumptions checked, one confirmed and one wrong, both "the worst case" | §79 · §21 · §3 |
| **The payout fee is the biggest line, and lowering the threshold doubles it** | §79 · [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §5 · §17 |
| Three grades of evidence for a FEE, and why grade B never gets quoted | §79 · §72 · §17 |
| A 4% fee hiding inside a ratio that was read as an exchange rate | §79 · §73 · §5 |
| INR payouts discontinued, so an FX question changed counterparty | §79 · [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §4 · §5 |
| **A legal page promising a contact address that is not there** | §79 · §40 · §19 |
| Account verification gated on the same commit as the price | §79 · [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §7 · §48 |
| A chargeback that reaches us as an ordinary refund, by design | §79 · §70 · §2 |
| A blocked apex reported as a DNS failure, and what named the real mechanism | §79 · §64 · §8 |
| **The free-mode card** — notice rather than duration, and the button it retires | §80 · [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §5 · §73 · §76 |
| A card whose own condition made it vanish in the state it was needed for | §80 · §39 · §71 |
| **Two opposite calls about one mode** — gate the checkout, never the portal | §80 · §74 · §24 |
| A reassurance that is false to the one reader actively being charged | §80 · §76 · §36 |
| Two nulls that wanted opposite copy, closed with one boolean | §80 · §78 · §73 |
| **A pinned env var as a test seam**, and the seven tests that named the radius | §80 · §16 · §9 |
| A precondition guard that caught the author's wrong assumption | §80 · §9 · §34 |
| **The seat cap** — why "one member count" is the half that does not work | §81 · [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §5 · §13 |
| Counting members but not unused invites, and the bypass needing no bad intent | §81 · §9 · §17 |
| **One rule, two audiences** — the owner may revoke, the joiner may only ask | §81 · §53 · §36 |
| A refusal placed above the write that spends a bearer credential | §81 · §13 · §70 |
| A cap deliberately NOT gated on the billing mode, unlike its three siblings | §81 · §78 · §24 |
| **An invariant that makes its own guard untestable**, and the plant that reaches it | §81 · §12 · §34 |
| A test that drifted into asserting the ordinary rejection and went green | §81 · §9 · §54 |
| `invites` is an ARRAY, so a keyed plant is invisible to `.find()` | §81 · §12 · §34 |
| Seventeen invites in one file, and the cap that refused the seventh | §81 · §38 · §9 |
| **The 7-day trial** — a dashboard field, and the half that is inference | §82 · [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §5 · §7 item 13 |
| A dependency deferred for a year that turned out to be a settings form | §82 · §79 · §64 |
| **A status that was never going to exist**, and a refusal that was right early | §82 · §76 · §73 |
| A trial indistinguishable from a subscription in everything we store | §82 · §70 · §29 |
| A prediction whose premise was wrong and whose conclusion held | §82 · §70 · §9 |
| An all-or-nothing product field, and a rule that needs a second product | §82 · §78 · §71 |
| Another one-click dashboard switch that inverts a written decision | §82 · [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §2 · §40 |
| A per-product lock keyed on email, beside a cap that refused that key | §82 · §81 · §74 |
| **Zero samples, so nothing is written** — the contingency and its one test | §82 · §73 · §76 |
| **Enforcement** — the hold, and why it is derived rather than scheduled | §83 · §78 · §40 |
| A hold that is never LIFTED is worse than one never placed | §83 · §40 · §78 |
| **An environment variable that would take sync away with no notice** | §83 · §78 · §80 |
| A signup held before it could reach a checkout button | §83 · §16 · §71 |
| **Two vacuous tests, and the mutations are what said so** | §83 · §9 · §78 |
| A guard checked twice, where neither half alone is load-bearing | §83 · §61 · §30 |
| Why the E2E suite cannot reach the enforcement path at all | §83 · §66 · §9 |
| A `readOnly` flag that is now computed rather than stored | §83 · §46 · §24 |
| **Disputes and refunds** — a payload that names no workspace | §84 · §70 · §79 |
| Why matching the LATEST payment id fails in the ordinary case | §84 · §79 · §73 |
| A reverse lookup, and the Mongo index deliberately not added | §84 · §24 · §4 |
| **A fourth clock, and the test that could not see the split** | §84 · §70 · §9 |
| An unattributable event that is nobody's fault, logged its own way | §84 · §40 · §18 |
| **A lost dispute does NOT suspend anybody** — surfaced, not enforced | §84 · §83 · §21 |
| Visa RDR, and a flag that must never be `undefined` | §84 · §79 · §76 |
| **Two mutations that failed nothing**, on `disputeOpen` and `disputeLost` | §84 · §9 · §34 |
| Where the provider's FEE lives, and why `payout.*` is unhandled | §84 · §73 · §79 · [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §5 |
| **A contact address** — three promises, and the route that needed no account | §85 · §79 · §20 |
| A page that says to contact us, and the guard that travels with the promise | §85 · §9 · §50 |
| **Publishing an address created a recipient** §40's sentence excluded | §85 · §40 · §38 |
| A mail host deliberately not named, and whose item that is | §85 · §69 · §38 |
| **A forwarder named as a holder** — one recipient, listed in the wrong role | §85 · §40 · §29 |
| **A terms bump that re-prompts everybody, twice, on purpose** | §85 · §41 · §53 · §77 |
| Why `Report a problem` is the wrong route for a rights request | §85 · §18 · §15 |
| **The dispute and refund events are ticked** — 25 carried, 24 handled | §85 · §84 · §73 |
| **A price on a page** — `/pricing`, `/refunds`, and nothing charged | §86 · [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §5 · §80 |
| **Naming a price is not charging one**, and the verification it unblocked | §86 · [`docs/LAUNCH-CHECKLIST.md`](docs/LAUNCH-CHECKLIST.md) §2.1 · [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §7 |
| Three sentences a pricing page must NOT contain, and why each | §86 · §82 · §38 |
| A refund that covers a renewal, because that is the dispute | §86 · §79 · [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §3 |
| **A mutation that fails nothing because an earlier commit closed the class** | §86 · §63 · §61 · §83 |
| A regex that could not cross a line break in the prose it asserted on | §86 · §4 · §9 |
| The landing page was missing from the guard built for a landing-page defect | §86 · §48 |
| **Pressing the billing switch** — the test, and the two that must run first | §87 · §78 · §24 |
| **A probe that healed the bug it was asserting on** — `?fresh=1` rewrites | §87 · §47 · §33 |
| A stamp no route can clear, so test order is a property of the data | §87 · §78 · §16 |
| A `finally` that clicked a disabled button and buried the real failure | §87 · §9 · §4 |
| "Nothing tests this" against "nothing tests this half" | §87 · §60 · §36 |
| A mutation anchor that matches seven sites | §87 · §73 · §9 |
| **`playwright test --list` deleted the running suite's store** | §4 · §87 · §32 |
| **"Terms still says free beta"** — true, and the vocabulary is the real defect | §87 · §86 · [`docs/LAUNCH-CHECKLIST.md`](docs/LAUNCH-CHECKLIST.md) §2.1 |
| One period with two names, and neither is a synonym for the other | §87 · §19 · §80 |
| A file count written in seven places, retired rather than re-synced | §87 · §29 |
| Why per-seat pricing was rejected, and where the price lives | §64 · §48 · §42 · §23 |
| **Render deploys from a mirror** — so a push here does not deploy | §65 · [`docs/LAUNCH-CHECKLIST.md`](docs/LAUNCH-CHECKLIST.md) §1.0b · `DEPLOYMENT.md` §3 |
| **Where `LIVE_URL` lives**, and why the mirror is the wrong repo for it | §65 · §46 · §40 |
| What the daily live run does NOT catch | §65 · §46 |
| **The payment webhook** — the one route with no session behind it | §70 · §69 · [`docs/API.md`](docs/API.md) §7 |
| Why ordering, not a webhook id, is what keeps a cancellation cancelled | §70 · §10 |
| Two clocks on one document, and the tidier version that loses money | §70 · §26 |
| A state that must survive a restore, next to two that must not | §70 · §38 · §52 · §17 |
| Processing before the 200, and the condition that makes it right | §70 · §18 · §55 |
| A mutation that passed, because the code it broke never ran | §70 · §9 · §34 |
| **The checkout link** — why a static link and not an overlay | §71 · §30 · §64 |
| A return URL that cannot carry a fragment, measured before it was written | §71 · §70 |
| Where the price lives, and why not in this repository | §71 · §29 · §64 |
| A customer email appended to a return URL, and what strips it | §71 · §17 · §16 |
| Two mutations that passed, and the two gaps they named | §71 · §9 · §55 |
| **Taking payment through Dodo** — what is pinned, what is not built | §69 · §72 · [`docs/PAYMENTS.md`](docs/PAYMENTS.md) · §64 |
| **A credential planned for and never needed** — and why the list got shorter | §72 · §69 · §17 |
| A rejected vendor chosen anyway, and how much of the objection moved | §72 · §21 · §29 |
| A figure deleted rather than converted when the vendor changed | §72 · §17 · §5 |
| **Verifying an inbound webhook** — the gate with no session behind it | §69 · §61 · §38 |
| Two provider CLI tools that cannot test verification, one of them a false pass | §69 · §34 |
| A fixture that must not import the thing it tests, and a vector not computed in Node | §69 · §29 · §34 |
| Why the provider's SDK is refused over a Node version floor | §69 · §38 · §30 |
| `$!` after a backgrounded `&&` chain, and a figure measured on the old binary | §4 · §69 · §47 |

---

## 1. What this is

A modular CRM for small businesses. Offline-first installable PWA, plus a small
Express backend for Google OAuth sign-in, workspace sync to MongoDB, and admin.
No build step, no frontend framework — plain ES5-ish scripts loaded in order by
`index.html`.

```
server.js             Express: static PWA, OAuth, /api/sync + /api/data, /api/admin/*, /api/org, /health
lib/safe-fetch.js     SSRF guard for customer-chosen webhook destinations (§38)
                      server-side, CommonJS, and deliberately NOT under js/
lib/mail-send.js      bring-your-own-key email — Resend and Postmark (§52)
index.html            app shell (script order matters — see §3)
privacy.html          privacy policy | terms.html  terms of use  (see §19)
guide.html            the short "what you can do" page, at /guide (§47)
welcome.html          the splash / landing page, at /welcome — CSS and figure
                      INLINE, no app JS, and the page meant to become / (§58)
pricing.html          the price, at /pricing — and that early access is free,
                      which is what keeps the beta pages true (§86)
refunds.html          cancelling and refunds, at /refunds (§86) — the data
                      answer here is readOnlyState()'s, in two places (§41)
legal.css             styling for privacy/terms/guide/pricing/refunds — no app
                      JS, but they DO load js/boot-theme.js, the one exception (§60)
css/style.css         Inter + blue/slate palette, light/dark, desktop-first
js/icons.js           inline Lucide SVGs (generated — see §6)
js/boot-icons.js      fills static icon placeholders — a file, not inline (§30 CSP)
js/boot-theme.js      light/dark/system, applied before first paint — first in
                      <head>, and the ONLY reader of `crmb:theme` (§60)
js/scope.js           whose data is this — storage scopes (see §11)
js/db.js              IndexedDB wrapper, one database per scope
js/csv.js             RFC 4180 CSV reader/writer
js/date-rules.js      calendar-day arithmetic: the due filter (§37), retention
                      windows (§44), CSV date import (§45) and week/month
                      period boundaries (§68) — also required by server.js (§39)
js/dsar.js            finds every place one person appears (see §43)
js/calc.js            calculated fields — pure arithmetic, no evaluator (§66)
js/templates.js       prebuilt module templates
js/demo-data.js       fictional business (generated — see §6)
js/tour.js            guided walkthrough engine (no dependencies)
js/cloud.js           account + sync layer, server ⇄ local fallback
js/app.js             router, all views, module builder, kanban, admin, tour steps
sw.js                 service worker (BUMP CACHE_VERSION on any asset change)
tests/                smoke, API contract, CSV unit, signup gate, migrations, E2E
docs/                 user guide, onboarding, demo script, architecture, BETA runbook
```

---

## 2. Current status

**Playwright is 177 and Node is 664** — Playwright **observed** after §87's
billing-card test: **177 of 177 in 9.0m**, clean. That figure landed *after*
§87's commit, whose message deliberately claimed only what had been run by
then (the three billing tests, the five mutations, and a run at 59 of 177); it
is recorded here rather than amended into a pushed commit. Smoke is **51 local
· 0 warnings · 0 failed**, carried from §86: §87 touches `tests/e2e.spec.js`
and nothing served, so there is no asset for it to see.
(§86's figures were 664 and 176-of-176; §85's 664 and
166-of-167; §84's 664 and
164/164; §83's 656 and 163-of-164; §81's 648 and 164; §80's 641 and 163;
§78's 638 and 161.)

**Node's 664 is CARRIED, not observed, and that is the distinction §73 got
wrong.** §86 touched no server behaviour — one allow-list entry and two
comments — and §87 touches only `tests/e2e.spec.js`, so nothing a Node test can
see has moved since it was last measured, and the suite was deliberately not
re-run. That is a different claim from §85's, where 664 was *measured* and
the fact that it had not moved was the informative part. A carried figure and
an observed one read identically in a status section unless the difference is
written down, which is §29's thesis and §73's own mistake: it reprinted §72's
measured 616 while saying in the next sentence that it had not run the suite,
and the real figure was 618.

**A delta is still the thing to check** rather than the total — 656 → 664
across §84 says none was lost, where a figure that merely *looks* plausible
would not. **Playwright's 167 → 176 is accounted for exactly** (§86: 2 new
tests, +2 standalone, +3 link guard, +2 contact route, and **0** from the
dark-mode loop, whose page array is inside one test), and §87's 176 → 177 is
one test.

**Take the total from a RUN's own summary rather than `playwright test --list`.**
§86's `--list` was safe — nothing was running — and it is not safe as a habit:
that command loads `playwright.config.js`, whose module body deletes
`DATA_DIR`, so asking it for a count **while a suite is in flight destroys the
run** (§4, and it cost §87 an hour and 41 false failures). The summary line
carries the same figure, needs no second invocation, and cannot do that.

**A clean Playwright run retires none of the three intermittents**, and the
reason is the same non-result §71 and §77 both record: none of them fired. That
happened on three consecutive full runs (§78's two and §80's), which is not
evidence of a fix — against §66's measured 1-in-3, three clean runs happen
about 30% of the time, and §83's run then had one while §84's was clean again.
Read the next short run against §77's table before concluding anything.

**Playwright's honest figure is a RANGE, and §77 is why.** Two full runs there
gave 156/158 and 157/158, with a **different** test failing in each and all of
them passing in isolation. Three are in that family: §66's *signing out hides
the workspace* (measured 1-in-3), §54's *an owner invites, and the colleague
joins* (2-in-4), and *the reminder count is the number the due-date filter
shows*. So a clean run happens and does not mean they are fixed; one short does
not mean something broke. Pin neither number: run it, and read which test
failed against §77's table before concluding anything.

**A full pass does NOT mean §66's intermittent is fixed**, and the 159/159
above is the third clean run to prove the point rather than retire it. *Signing
out hides the workspace* simply did not fire; §71 fired it, and six passes in
isolation afterwards did not re-measure its rate either (against 1-in-3, six
clean runs happen about 9% of the time). It is a known-open test that passes
most of the time. §54 records it as intermittent, §66 records what was
established and the artifact to start from, §71 records an occurrence.

**And the 616 that stood here was short by 2.** §74's five new tests take 618
to 623 — the static `test(` declarations across `tests/` moved by exactly five
between the two commits, so this commit accounts for five of the seven and the
other two predate it. **The trail is visible:** §72 *measured* 616, and §73
reprinted it on its own Counts line while saying in the next sentence that it
had run `tests/payments.test.mjs` **rather than the full suite**. A figure
carried forward reads exactly like a figure observed, which is §29's thesis
arriving in this file's own status section. Re-measured rather than adjusted,
and the only safe way to use it is to run the suite.

Smoke is at **51 passing locally and 56 live — both OBSERVED**, which retires a
hedge that stood through §63, §69–§74: this session reaches neither host (§8),
so every live figure before now was predicted. CI run **#225** printed
`56 passed · 0 warnings · 0 failed` against `nimbleclerk.com` with
`deployed build 3b01d518d991`, which is §46's rule working as written — the two
numbers differ, both are real, and CI is the thing that prints the second one.
The same checks run either way, with five informational on a local file-store
HTTP deployment and real assertions against a live one; §75 measured which five
and confirmed 51 + 5 = 56 from the other direction. **On Windows some Node tests skip
themselves** and say why — §4's SIGTERM note is one, and `resilience.test.mjs`
skips whichever of its cases cannot be made to fail on the platform in hand
(§55). A named platform limit, not a failure; the count is whatever the run
prints, so do not pin it here.

```sh
npm install
npm test                # everything
npm run test:api        # spawns its own server on a random port
npm run test:e2e        # Playwright boots its own server
npm run test:smoke      # deployment audit, localhost
BASE_URL=https://nimbleclerk.com npm run test:smoke   # audit live
```

CI (`.github/workflows/test.yml`) runs everything on push and smoke-tests the
live URL — the committed default is `https://nimbleclerk.com`, and a `LIVE_URL`
**repository variable overrides it**, which §63 records as a live fault rather
than a footnote: one left set to the old host outlives any default changed
here, and its trailing slash is what turned §46's wait loop into a no-op.

### Shipped
- Modules/fields/records, table + kanban views, type-aware column sorting
- CSV import (column mapping, inline field creation, type coercion) and export
- Google OAuth, full offline operation
- **Per-record delta sync** with tombstoned deletes — see §10
- **Storage scopes**: one local store per identity, so a shared device cannot
  cross-contaminate and demo data cannot sync — see §11
- **Shared team workspaces**, complete: org-owned workspaces (stage A), invite
  links (stage B), owner-only schema (stage C), member management and leaving
  (stage D) — see §5, §13, §14, §15
- Admin dashboard with analytics; **organisations with per-tenant scoping**
- **Pooled and dedicated deployment blueprints** (`render.yaml`,
  `render.dedicated.yaml`) and a `/health` endpoint
- One-click demo business (144 records across 8 modules, including two the
  templates do not provide, with resolved relations) and a 6-step guided tour
- **Self-serve beta signup**, complete: the code gate (stage 1), backups and
  measured usage (stage 2), problem reports (stage 3), and the legal pages,
  beta notice and runbook (stage 4) — see §16, §17, §18, §19
- **Access requests**: a stranger who arrives on their own can ask, and an
  approval lets them straight in with nothing to email — see §20
- **Per-workspace webhooks** behind an SSRF guard, and a **daily digest** of
  what is due or overdue — off by default, counts only — see §38, §39
- **An overdue chaser that drafts rather than sends** — it writes the reminder
  and hands it to the reader's own mail client, so there is no key, no
  sub-processor and nothing sent from the deployment — see §51. A workspace
  that connects **its own Resend or Postmark account** can send it in one press
  instead; the draft stays the default and needs no setup — see §52, §53
- **A dormancy report** beside the retention one — same card, same scan, a
  different clock: who nobody has *contacted*, aged on a date field you pick
  rather than on the record's last edit. Reports and never deletes — see §50
- **A `Renewals` template** — a register of certificates, licences and
  inspections that expire. No new machinery: the due filter and the digest
  already count a date field, so this is the columns plus the wiring — see §49
- **A date-format control on the CSV import screen** — the order is an input,
  preselected from what the file proves and required when it proves nothing;
  never guessed — see §45
- **Controller-side data protection tools**: a Consent & lawful basis template
  (§42), a subject-access search and self-serve account deletion (§43), and a
  retention review of what nothing has touched (§44). All three report or act
  on the tenant's own workspace; none of them make anybody compliant.
- **Receiving a payment, and managing the subscription afterwards** — a signed
  inbound webhook (§69, §70), a hosted checkout link gated so a workspace
  cannot buy a second subscription, and a link to the provider's own portal for
  cancel, pause, card and invoices (§74). Disputes and refunds are recorded,
  and a lost dispute is **surfaced rather than enforced** (§84). Enforcement
  exists — a workspace past its grace window with no live subscription is held
  read-only, derived per request rather than scheduled (§83) — and **so does a
  seat cap of 5, which is the one piece of this that is live today** (§81).
  **Nothing is on sale**: `billingMode` is `free` on every deployment, which
  gates the checkout link and the hold alike (§78, §80).

  **There IS a price now** — `$15`/month per workspace, `$150`/year
  ([`docs/PAYMENTS.md`](docs/PAYMENTS.md) §5) — and it is **published** on
  `/pricing` beside the cancellation and refund policy on `/refunds` (§86).
  That is the one claim worth keeping straight: the price is named and nobody
  is charged, which is why none of §2.1's list has moved. §64's *"there
  is no price"* is retired.
- Docs: see `docs/README.md` — the map, and which are frozen

### Not built yet
- Email sending, third-party integrations.
- ~~**Enforcing a subscription** — §74 records the state, and nothing acts on
  it. Blocked on a price before it is blocked on code.~~ **Stale since §83,
  and doubly so since §86** — enforcement is built (§83: the sync seam holds a
  workspace past its grace window, derived per request) and the price exists
  and is published. What is left is **flipping `billingMode` to `paid`**, which
  is a commit rather than a feature: §2.1's list,
  `TERMS_VERSION`, §2.4's remaining decisions and §27's owed walk. Left struck
  through rather than deleted because this is §27's drift landing in §2's own
  status list — the section that exists to say what is true — and it survived
  three sections that each had reason to look at it.
- **Per-module permissions** — everyone on a team sees every module. Roles
  govern what you may *do* (§14), not which modules you can see. Considered and
  set aside: it needs per-module filtering in sync, or a member receives rows
  they cannot see.
- **Undoing a delete** — a tombstone discards the body (§26). Costed, not built.

---

## 3. Invariants — do not break these

**The UI must paint before any network call resolves.** `init()` in `js/app.js`
calls `route()` and only then `syncInBackground()`. Free-tier hosts sleep and can
take a minute to answer; a returning user once saw a bare shell because a stalled
await ran before `route()`. Guarded by the test *"paints immediately even when the
server is asleep"* (hangs `/api/me` for 8s, requires paint under 5s).

**No single failure may leave the app unrendered.** `init()` binds chrome first,
wraps data loading in try/catch, runs a 2.5s watchdog, and has a final `.catch`.
`route()` guards sidebar and view separately. `DB.open()` always settles
(timeout + `onblocked`). Two tests break IndexedDB outright and require the app
to render *and still navigate*.

**Every `Cloud` API call carries an `AbortSignal.timeout`.** Nothing may hang.

**Script order in `index.html` matters.** `js/app.js` last; it references
`DEMO_DATA`, `Tour`, `CSV`, `LUCIDE`, `TEMPLATES`, `DB`, `Cloud`, `Calc` as
globals.
Adding a file means updating `index.html`, `sw.js` APP_SHELL, **the server's
allow-list (§28)** and the smoke test's `ASSETS`, and bumping `CACHE_VERSION`
(currently `crmbuilder-v67` — and this line was left at v62 through §74's bump
to v63, which is §29's thesis arriving in §3's own invariant: read `sw.js`,
never this sentence). Miss the allow-list and it 404s in production
while working locally from cache.

**The server serves an allow-list, never the repository.** Anything not named
in `ASSET_DIRS`, `PUBLIC_ROOT_FILES` or `PUBLIC_DOCS` is not reachable. See
§28 — the previous `express.static(__dirname)` published the whole repo.

**Tenancy scoping comes from the session, never a request.** That covers both
`req.scopeOrgId` (which org an admin may see) and `workspaceIdFor(user)` (which
workspace a caller reads and writes). See §5.

**Sync clocks are two different things and must not be conflated.** `updatedAt`
is the client's edit time and decides last-write-wins per record; `serverAt` is
the server's monotonic stamp and is the only thing the delta cursor walks. A
device with a skewed clock must never be able to move the cursor. See §10.

**Owned data is never claimable.** Only the `anon` scope can be adopted into an
account, only after an explicit prompt, and only once. A `u:<id>` scope is never
merged into a different account, whatever is still pending in it. See §11.

**Sync only ever runs in a `u:<id>` scope.** That single check in `Cloud.sync()`
is what makes demo data unable to reach a server — stronger than keeping it out
of localStorage, because it holds even if a `_demo` flag is forgotten.

**Deletes are tombstones everywhere** — `DB.delete` on the client, `deletedAt`
on the server. A row that simply disappears is indistinguishable from one a
device has never seen, so the next sync hands it straight back.

**Only `http/https/mailto/tel` may reach an `href`** (`safeHref` in app.js) —
record values arrive from CSV imports and shared backups.

**`openRecord` and `openCSVImport` re-resolve their module** via `getModule(id)`.
Rendered rows can outlive the module definition they were drawn from.

---

## 4. Traps that have already cost time

**CSS cascade.** `.input` declares the `padding` shorthand and sits *later* in
the file than `.search-input`; a bare `.search-input { padding-left }` loses and
the placeholder lands on the search icon. Use a more specific selector.

**Grid auto-placement in the module builder.** `.builder-field` is **flex, not
grid**, deliberately. With grid, revealing the dropdown-options input
(`grid-column: 2/-1`) pushed the trailing controls into columns sized for row 1,
squashing "Req" to 16px so its label painted over "List". Don't reintroduce grid.

**MongoDB TTL indexes are single-field only.** `expireAfterSeconds` on a compound
key like `{ orgId, at }` is accepted *without error* and then ignored — nothing
ever expires. `{ at: 1 }` does expiry; `{ orgId: 1, at: 1 }` serves queries.

**MongoDB refuses to change an index's options in place** (error 85/86).
`ensureEventTTL()` catches that, drops and recreates. Needed because live
deployments already have a plain `{ at: 1 }`.

**Email is globally unique, not per-org.** Sign-in resolves an account from an
email alone with no org in hand, so `{ orgId, email }` unique would make login
non-deterministic.

**Renaming a field keeps its key.** Labels are display-only, so record data
survives a rename — the default builder field stays `#f-name` after relabelling.

**Async re-render races in tests.** `renderModuleBodyOnly` is async and click
handlers don't await it. Wait on rendered state (`aria-sort`, a row appearing)
before reading the DOM, or you sample the *previous* render and the assertion
passes for the wrong reason.

**Row clicks land on links.** Email/phone/URL cells are anchors that stop
propagation. Click `tr td:first-child` to open a record.

**Template cards** wrap a visually hidden checkbox — `.check()` fails; click the
card. **Hidden-but-present elements** (`#topbar` on desktop, `#import-csv-file`)
must not be `waitForSelector`ed.

**Killing the dev server:** `pkill -f "[s]erver\.js"` in a **separate** Bash
call. A compound command mentioning `server.js` matches itself.

**And never while a test run is in flight.** That pattern matches the
`node server.js` children `api.test.mjs`, `signup.test.mjs` and six other
files spawn, so killing "the dev server" kills the suite's servers too — and
the symptom is not an error: the run **hangs**, because the tests are waiting
on sockets that will never answer, with no output to say why. It cost eight
minutes of staring at an empty log here. Kill by recorded PID, or check
`ps` first.

**And `$!` after a backgrounded `&&` chain is the SUBSHELL, not the server.**
`cp x y && node server.js > log 2>&1 &` then `kill $!` kills the wrapper and
leaves node running — so the next boot dies `EADDRINUSE`, **the old binary
keeps answering**, and whatever you then measure is the build you thought you
had replaced. Cost here: a smoke run reported `51 passed` against an
unmutated server while proving a mutation, which is the one result that
reads as success and means nothing. Record the PID with `pgrep -x node`
*after* the boot, or `exec` the server so the shell becomes it, and confirm
the mutation is live (`curl` the thing that should have changed) before
trusting a figure. Same family as the two notes above and as §47's sweep that
healed what it was looking for.

**And `pgrep … | head -1` is the same mistake wearing the fix's clothes.**
Recording the PID after the boot is the rule above, and `head -1` throws it
away: the pattern matches more than one process, so the recorded PID was
**6114** when the server was **6117** — `kill` reported success, the smoke run
had already passed, and the server was still listening afterwards. The symptom
is the one this section keeps naming: the next boot dies `EADDRINUSE`, the old
binary keeps answering, and whatever you measure next is the build you thought
you had replaced. Kill **every** match (`kill $(pgrep -f …)`), or confirm with
`pgrep -a -x node` and the port afterwards rather than trusting the kill. A
`<defunct>` entry is a zombie awaiting reap and is not a running server —
re-check a second later before concluding anything.

**And `kill $(pgrep -f …)` inside a command that MENTIONS the file kills the
shell.** That is §28's note arriving through `pgrep` rather than `pkill`: the
compound command contained `node server.js`, so the pattern matched the shell
running it, the shell died at that line (exit **144** = 128+16), and the
confirmation lines after it never ran — leaving the server up and the output
looking like a clean finish. Both halves of the fix above are therefore wrong
for this case. **Record the PID in a SEPARATE Bash call and kill it there**,
which is the only form that cannot match itself.

**And `playwright test --list` is NOT read-only — it deletes the running
suite's store.** `playwright.config.js` does `fs.rmSync(DATA_DIR)` in its
module body, so any command that loads the config performs the cleanup —
`--list` (measured), and a `-g` run or a second full run, which are runs and
load it by definition. The guard there is
`TEST_WORKER_INDEX === undefined`, which covers Playwright's own *workers* and
cannot see a separate invocation — the config's own comment describes this
failure and is one case short of it.

Run it alongside a suite in flight and the server's `DATA_DIR` vanishes
underneath it: every write then 500s (§55's router wrap turning a failed
`FileStore.save()` into a status), `POST /auth/dev` among them, so `signIn()`
hangs on `.user-chip` and **every test that signs in fails**. Cost here: 41
failures across eight describes, a run that took four times its usual duration
because each one burned a 45s timeout, and an hour reading them. **The page
snapshot shows anonymous onboarding and the failures name sign-in, so it reads
as an auth regression** — there is nothing in any artifact pointing at the
command that caused it. The tell is `du -sh data/e2e` reporting nothing.

Same family as the three notes above and as §47's sweep that healed what it
was looking for: **run nothing else from `npx playwright` while a suite is
running**, and get a test count from the run's own summary rather than from
`--list`.

**Not fixed in the config, deliberately.** Widening the guard to "and no server
is already listening on `PORT`" means a network probe in a module body that
must stay synchronous, and §9 names `playwright.config.js` as blast radius by
name — a cleanup edit there once cost 47 E2E tests with
`ERR_CONNECTION_REFUSED`. The discipline is cheaper than the guard, and this
note is the discipline.

**Restarting a test server on the same port is not reliable.** `expireInvite()`
in `api.test.mjs` stops the server, edits `store.json` and starts it again;
rebinding a port that was listening a millisecond ago races, and on Windows the
closed listener lingers long enough that the new one loses — the next request
gets `ECONNRESET` and everything after it `ECONNREFUSED`, several tests away
from the restart that caused it. Every boot takes a **fresh** port now.
Port blocks are disjoint per file (§9) so parallel files cannot collide either.

**Windows cannot deliver SIGTERM to a child process.** libuv maps
`child.kill()` to `TerminateProcess()`, so the child dies without running its
JS signal listeners. Anything guarded by a graceful-shutdown handler therefore
fails on Windows **while the server is behaving correctly** — the egress
persistence test is skipped there for exactly this reason, and it says so.
Before treating a shutdown-path failure as a bug, check the platform: the
symptom is a persisted value that is short by whatever was still buffered.
Full write-up in [`docs/archive/TELEMETRY.md`](docs/archive/TELEMETRY.md) §1.

---

## 5. Organisations and tenancy (shipped)

```
orgs    { id, name, createdAt, createdBy }
users   { id, email, name, orgId, role, disabled, createdAt, lastActiveAt }
modules { wsId, orgId, id, createdBy, updatedBy, updatedAt, serverAt,
          deletedAt, deletedOn, doc }
records { wsId, orgId, id, createdBy, updatedBy, updatedAt, serverAt,
          deletedAt, deletedOn, doc }
data    { wsId, orgId, settings, settingsUpdatedAt, settingsServerAt,
          moduleCount, recordCount, perRecord, orgOwned, updatedAt,
          hook }  ← meta.  `hook` is a SIBLING of settings, never inside it (§38)
events  { type, userId, orgId, day, at }
```

Roles: `platformAdmin` (operates the deployment, crosses orgs) · `owner`
(administers their own org only) · `member`.

- Every signup creates an org and owns it. `ADMIN_EMAILS` and the first-ever
  account become `platformAdmin`.
- `requireOrgAdmin` sets `req.scopeOrgId` **from the session**. `requirePlatformAdmin`
  is a *separate* middleware — never a branch inside the org check, because the
  conditional form gets copied into a handler with the precedence wrong.
- Cross-org access returns **404, not 403**, so responses don't confirm existence.
- An `owner` cannot grant `platformAdmin`.
- `migrateToOrgs()` runs on boot, is idempotent, and puts each pre-orgs account
  in its own org (`admin`→`platformAdmin`, `user`→`owner`).
- **Eight isolation tests in `tests/api.test.mjs` assert the attack**, not the
  happy path. Keep them passing; they are the gate on this area.

**The one that can destroy a team's data:** `store.deleteUser` deliberately no
longer touches the workspace. `deleteAccount()` deletes it only when the org has
no members left. Kept as one named function because the two calls in the wrong
order — or one of them forgotten — *is* the bug. Guarded by *"removing a member
leaves the workspace standing"*, which fails on the un-fixed code.

**Admin rows carry no per-user record counts.** Every member of an org would
report the same totals, reading as N copies of the data rather than N people
sharing it. The figure lives on `/api/admin/stats`, once per workspace.

**The workspace belongs to the org, not the account** (stage A, shipped).
`wsId` is the ownership key and `workspaceIdFor(user)` resolves it **from the
session only** — never a parameter, query or body, the same rule as
`req.scopeOrgId`. `wsId` is a separate field from `orgId` on purpose: they are
equal today, and a key named for what it keys is what stops the next reader
assuming they always will be.

All four stages are shipped: org-owned workspaces, invites, permissions, and
member management.

---

## 6. Generated files — do not hand-edit

- **`js/icons.js`** — from the `lucide-static` npm package. Extract the **inner**
  content of each `<svg>`; the files open with a license comment, and a naive
  first-`>` regex nests svgs and swallows trailing button text.
- **`js/demo-data.js`** — from **`scripts/gen-demo-data.mjs`**, which is now in
  the repo. It used to say "from a Python generator", and that generator was
  never committed — so the one file nobody was allowed to hand-edit was also
  the one nobody could regenerate. Run `node scripts/gen-demo-data.mjs`.

  **Seeded PRNG, so a re-run is byte-identical.** An unseeded `Math.random()`
  would make every regeneration a few hundred lines of noise and the diff
  useless for review.

  Two placeholders, resolved by `loadDemoData` at load time:
  `{ __rel: days }` → a date that many days from today, so the business never
  looks stale; `{ __ref: "<moduleKey>:<name>" }` → a relation, to the seeded
  record's real id. **A `__ref` may only point at a module seeded earlier** —
  resolution is a single forward pass, so a forward reference silently becomes
  a blank cell. `tests/demo.test.mjs` asserts every one resolves.

---

## 7. The guided tour (`js/tour.js`)

Pre-flights before showing anything: `ensureReady()` must return `{ ok: true }`,
and every step's route must resolve. Steps whose screen can't exist are dropped
so "Step N of M" stays true. If data can't be prepared the tour **doesn't start**
and says why.

This was flaky and the cause is worth remembering: when `demo-data.js` failed to
load, `dealsId()` returned `undefined`, routes became `#/m/undefined`, navigation
was silently skipped, and `waitFor` burned a 6s timeout per step — steps 2–4
narrated over the onboarding screen while the app appeared frozen. Fixed by
pre-flight + `goto` returning `false` + a 2s target budget.

Steps 2 and 3 set up their own screen (`before` hooks force board / sorted table)
rather than assuming inherited view state.

---

## 8. Known gaps and honest limits

- **Sync is per record**, so an edit costs ~270 bytes regardless of workspace
  size. The remaining storage ceiling is Atlas M0's 512 MB shared across
  tenants, not a per-document limit.
- **Free-tier cold starts.** The app paints instantly regardless, but sign-in and
  sync wait for the server. Warm the URL before a demo.
- **This session cannot reach `*.onrender.com`** — the egress proxy returns 403.
  Live verification must be run by the user or by CI. A uniform all-checks-failed
  result in the smoke test is reported as a probable network block, not a broken
  deployment.

---

## 9. Conventions

- Commit messages: what changed and *why*, including traps discovered.
- Every bug fix gets a regression test, and the test is checked against the
  broken state — a test that passes on the bug is worthless.
- Prefer measuring over asserting: sizes, timings and layout are checked by
  driving the real app, not by reasoning about the code.

### Who runs which tests

Three tiers, and the split is deliberate: **the full suite already runs on CI
for every push to every branch** (`push: branches: ['**']`), on ubuntu, for
free. Re-running it in the development loop buys nothing and costs minutes per
iteration — three full runs in one session where one would have done is what
prompted writing this down.

| | Runs | When |
|---|---|---|
| **Development loop** | targeted tests + `npm run test:smoke` | every change |
| **CI** | everything | automatically, on push — the default gate |
| **The user, locally** | whatever the failure needs | triaging a CI failure, or a Windows-only symptom |

**Targeted means targeted:**

```sh
node --test tests/signup.test.mjs                       # one file
node --test --test-name-pattern "egress is counted" …   # one test
npx playwright test -g "the demo can be kept on purpose"
npm run test:smoke                                      # 45 local / 50 live (§46)
```

**Port blocks are disjoint per file**, because `node --test` runs files in
parallel and they each spawn real servers:

| File | Block | Servers |
|---|---|---|
| `api.test.mjs` | 8300–8449 | 3 app + 1 capture (8440–8449, reserved) |
| `fixture.test.mjs` | 8450–8499 | 1 |
| `migration.test.mjs` | 8500–8699 | 6 |
| `signup.test.mjs` | 8700–8960 | 61 |
| `oauth.test.mjs` | 9300–9405 | 6 |
| `backup.test.mjs` | 9500–9550 | 2 |
| `ssrf.test.mjs` | 9600–9650 | 2 (capture servers, not the app) |
| `reminders.test.mjs` | 9700–9750 | 1 app + 1 capture |
| `mail.test.mjs` | 9800–9850 | 2 capture (9800–9839) + 1 app (9840–9849) |
| `resilience.test.mjs` | 9900–9950 | 1 |
| `payments.test.mjs` | 9960–9990 | 2 app (9960–9985 · 9986–9990) |
| `seats.test.mjs` | 9991–9999 | 1 app, a fresh port per boot (it restarts to plant a store row) |
| `enforcement.test.mjs` | 9000–9099 | 1 app, a fresh port per boot (it restarts to plant store rows) — carved from the unclaimed 8961–9299 gap, so it borders no block |

They used to overlap badly — `api.test.mjs` alone spanned 8300–8899, across
three other files' ranges. Widen a block and check the neighbours.

**Smoke stays in the loop even though it is not targeted**, because it is the
only thing that catches a file missing from the server's allow-list (§28) —
which works locally from cache and 404s in production. Unit and E2E tests
cannot see that failure. Run it whenever a served file is added or renamed.

**State what was actually run.** Commit messages record real coverage —
*"signup.test.mjs 63/63; full suite not run"* — never a total that was not
observed. A commit log that overstates its verification is worse than one that
admits the gap, and CI is about to produce the real number anyway.

**Say when a change wants a full run before it is trusted.** Some edits have
blast radius well past the file being changed, and all four of these happened
in one session:

| Edit | What broke, elsewhere |
|---|---|
| `deleteAccount` → `tidyVacatedOrg` | a team-workspace test that was not being targeted |
| the rate limiter | the entire Node suite |
| `playwright.config.js` cleanup | 47 E2E tests, `ERR_CONNECTION_REFUSED` |
| adding a JS file | production 404s unless four places agree (§3) |

The pattern to watch: **shared server helpers, `js/db.js` / `js/cloud.js` /
`js/scope.js`, `playwright.config.js`, and anything touching the asset
allow-list or `CACHE_VERSION`.** Flag those explicitly rather than skipping the
full run silently.

### When a test fails on the user's machine

**Send the artifacts; do not re-run.** Playwright wipes `test-results/` at the
start of every run, so re-running to see whether a failure reproduces destroys
the evidence needed to diagnose it. That mistake is recorded in §30 as one made
twice. What is wanted is `test-results/<test-name>/error-context.md` and the
assertion text.

**Triage platform against product before changing code.** The development
machine is Windows; CI and production are Linux, and the difference is real —
§4's SIGTERM note is the standing example. The egress case is the precedent
worth remembering: the failure was a Windows artifact, the correct fix was a
skip with the reason recorded, and reading it as "this telemetry is not worth
keeping" would have cost a working alert
([`docs/archive/TELEMETRY.md`](docs/archive/TELEMETRY.md)).

---

## 10. Per-record sync

Replaced whole-snapshot last-write-wins. The failure it fixes: two devices
editing *different* records lost one of the edits, because whoever saved second
uploaded their entire workspace over the other's.

**Shape.** Each module and record is its own row: `{ userId, orgId, id,
updatedAt, serverAt, deletedAt, deletedOn, doc }`. `POST /api/sync` is one
round trip — push what changed here since the last accepted push, receive what
changed there since the cursor. `GET /api/sync?since=N` pulls only.

**Traps, all of which bit during implementation:**

- **`Number(x) || now` restamps a legitimate zero.** A device signing in for
  the first time sends `settingsUpdatedAt: 0`; the server read that as "now",
  so its blank defaults won and wiped the workspace's real settings. Use
  `Number.isFinite`. The E2E two-device test is what caught it.
- **A push must not echo back what it just sent**, but those rows' `serverAt`
  still has to count toward the returned cursor — otherwise they arrive on the
  very next pull.
- **Server stamps tick forward on collision.** Two rows written in the same
  millisecond with a cursor landing between them strand the second one forever.
- **Client selection uses `>=` on its watermark, not `>`,** for the same reason
  in the other direction. Re-sending the boundary row is free: the server's tie
  goes to the stored copy, so it is skipped.
- **MongoDB TTL is single-field only** (same trap as the events TTL). Tombstones
  expire on `deletedOn`, a real `Date` that only tombstones carry — the TTL
  monitor skips non-Date values, so live rows are untouched by it.
- **IndexedDB transactions commit when the microtask queue drains.** Bulk
  tombstoning issues every `put` in one tick via `Promise.all`; awaiting between
  writes finds the transaction already closed.

**Ownership.** Rows are keyed by `wsId` (the org), so the same machinery that
made two *devices* safe is what makes two *people* safe — that was the point of
doing per-record sync first. `createdBy` is set once and carried forward, so
editing someone else's record does not rewrite its authorship.

**Backwards compatibility.** `GET`/`PUT /api/data` still work, reading and
writing the same rows, so a client on cached older JS keeps syncing through a
deploy; the client falls back to them on a 404. `migrateToPerRecord()` splits
existing snapshots on boot, **preserves ids exactly** (minting new ones would
duplicate every row instead of matching what devices already hold), and is
idempotent via `perRecord` on the meta doc.

**Deployment shapes.** `render.yaml` is pooled (Option B); `render.dedicated.yaml`
is one deployment per client (Option D). Same code, different env vars.
`HEALTH_DETAIL=1` exposes org/user counts on the public `/health` — correct on a
dedicated deployment, a customer count on a pooled one. `DEPLOYMENT.md`
§"Choosing a deployment shape" has the matrix and the migration runbook.

---

## 11. Storage scopes (`js/scope.js`)

One browser profile is not one person. Before this there was a single
`crmbuilder` database and one set of unprefixed localStorage keys for every
visitor, and the sync engine pushed whatever it found to whichever account was
signed in. The bug that forced it: A signs in, edits, sync fails, leaves; B
signs in; **A's pending rows were uploaded into B's account.** A clean sign-out
did not help — the cursor keys were cleared, IndexedDB was not.

```
anon        IndexedDB `crmbuilder`          never syncs
u:<userId>  IndexedDB `crmbuilder-u-<id>`   syncs
```

Scoped localStorage keys are `crmb:<scope>:<name>` — `settings`, `settingsAt`,
`snapshot`, `lastEdit`, `lastSync`, `dirty`, `syncCursor`, `pushedThrough`.
Device-level keys stay global: `crmb:auth`, `crmb:user`, `crmb:tourSeen`.

**Traps:**

- **The scope must resolve synchronously at boot**, or the paint-first invariant
  (§3) breaks. It reads the last known identity from `crmb:user`;
  `reconcileScope()` corrects a wrong guess once `/api/me` answers.
- **The last known identity is the wrong answer while a sign-in is in flight.**
  On a shared PC it is the *previous* person, and OAuth returns as a fresh page
  load. `Scope.markSignInPending()` makes boot paint `anon` instead — still
  immediate, just neutral.
- **A returning user needs no recovery path.** Their scope still holds the rows
  and the watermark, so the ordinary `updatedAt >= pushedThrough` rule pushes
  them. If you find yourself writing recovery code here, the scope is wrong.
- **The anonymous copy must be cleared after a claim**, or the next visitor
  sees the last one's workspace — but only once a sync confirms it landed
  (`claimCleanup`). Verify before delete, as in the deployment runbook.
- **`DB.adoptLegacy()` writes its marker only after counting rows back.** The
  marker is what stops the migration re-running, so it must not cover a
  half-copy. Two databases open at once invites a blocked upgrade: read the
  legacy one out fully and close it before writing.

### Demo data

`_demo: true` on rows we seeded, never on rows the user typed; editing a demo
row keeps the flag (`{...record}` spread already does this). It rides inside
`doc`, so **the server needs no change**. The snapshot mirror skips `_demo`
rows.

`discardDemoData()` only ever deletes rows we created. A demo module the user
has since added their own record to is **promoted** (flag cleared) rather than
deleted — deleting it would take their work. Removing that branch makes the
test *"removing samples keeps work the user added to a sample module"* fail,
which is how it is checked.

Nothing is seeded without a prompt: `Tour.ensureReady()` no longer seeds, and
`startTourWithConsent()` asks. Sign-in asks once about anything already on the
device, with the options computed from what is actually there.

---

## 12. Migrations (`tests/migration.test.mjs`)

Three run on boot, in this order, each idempotent: `migrateToOrgs()` →
`migrateToPerRecord()` → `migrateToOrgWorkspaces()`.

They are tested by hand-building a store in the shape a real deployment would
be in, booting a server against it, and asking the API what came out — not by
calling the functions, because what is under test is what a live upgrade does.

**Traps:**

- **`/api/data` reads ids out of the stored document, not out of the envelope.**
  A migration that minted fresh envelope ids still looks correct there, and the
  first version of this test passed on exactly that bug. Assert sync ids via
  `/api/sync`, which is the id the delta protocol actually matches on.
- **The account→org rename is only lossless because org↔user is 1:1.** Nothing
  can change a user's `orgId` today. If two accounts ever shared one before this
  ran, their separate workspaces would silently merge, so it refuses and says so
  rather than guessing. Removing that guard makes *"refuses when two accounts
  already share an organisation"* fail.
- **Orphaned rows are left alone, never deleted.** Deleting data during a
  migration is not a decision to make automatically.
- **FileStore keeps the store in memory and rewrites the whole file on save**,
  so editing `store.json` under a running server is clobbered by the next write.
  Stop, edit, start — that is what `moveToOrg()` in `tests/api.test.mjs` does.

---

## 13. Invites and joining (stage B)

```
invites { code, orgId, role, createdBy, createdAt, expiresAt, usedBy, usedAt, revokedAt }
```

An invite is a link the owner copies and sends themselves — there is no mail
plumbing in this product. That makes the code a **bearer credential**: 24 random
bytes, single use, 7 days, revocable, never logged, and stripped from the
address bar by `captureInvite()` as soon as the page has it.

**Every failure answers identically** (`INVITE_REJECTION`, 404) — unknown,
expired, spent, revoked. A different response for "wrong" and "expired" would
let someone enumerate which codes exist.

**Joining means leaving**, so `/api/org/join` refuses when the caller is the
last owner of an org that still has other members — walking out would strand
them with a workspace nobody can administer.

### The client side, and the trap that bit

`Scope.workspaceChanged()` stamps which workspace a scope's rows are a replica
of. When `/api/me` reports a different org, `reconcileWorkspace()` throws the
replica away and pulls the new workspace clean.

- **Never push after the org has moved.** The server files every write under the
  caller's *current* workspace, so "flushing what is owed to the old workspace"
  posts those rows into the new team's CRM. I wrote exactly that bug; the fix is
  to push **before** joining (while the old workspace is still ours) and to drop
  and report anything still pending afterwards. Guarded by *"unsynced work from
  a previous workspace never lands in the new team"*, which needs `/api/sync`
  blocked to reproduce — plain offline does not work, because the page load
  before joining flushes the queue and closes the window.
- **A hard `DB.clear`, not tombstones.** A tombstone would travel to the *new*
  workspace and delete rows there.
- **Settings belong to the workspace**, so the scope's `settings`/`settingsAt`
  are cleared too, or the joiner's own business name outlives the join.
- **Only act on an answer the server actually gave.** Offline, `/api/me` never
  resolves and `Cloud.me.org` is absent; treating that as "the org changed"
  wiped the local workspace the moment the connection dropped. Caught by the
  offline sync test.

---

## 14. Permissions (stage C)

A ladder — each rung does everything below it plus one more thing, so there is
one ordering to reason about rather than a matrix.

| | owner / platformAdmin | member | contributor | viewer |
|---|---|---|---|---|
| read, export | ✅ | ✅ | ✅ | ✅ |
| records: create, edit | ✅ | ✅ | ✅ | ❌ |
| records: delete | ✅ | ✅ | ❌ | ❌ |
| module fields, add/delete modules | ✅ | ❌ | ❌ | ❌ |
| invite, roles, remove members | ✅ | ❌ | ❌ | ❌ |
| workspace name and currency | ✅ | ❌ | ❌ | ❌ |

`canEditSchema()` exists twice on purpose: on the server (`server.js`) it
decides, and on the client (`js/app.js`) it only avoids offering a button whose
effect would be undone a second later.

**The workspace name and currency are owner-only, and were not.** `applyPush`
gated records and modules by role and wrote settings from anybody, so a
view-only account could rename the team's workspace and switch its currency —
and the owner saw both. Found by driving the seeded fixture as a real viewer
(§34), not by reading the code, which is why it survived §26's role work and
the security audit.

Currency is the half that matters: §23 records that changing it **relabels**
every stored amount rather than converting, for the whole team. That makes it a
structural setting, and it sits beside the schema rather than beside a display
preference. `canEditSettings()` is a separate function from `canEditSchema()`
deliberately — the rule is the same today, and separate names are what let one
move later without silently dragging the other.

Two traps in the fix, both of which shipped broken first:

- **The refusal must carry the server's copy AND its clock.** The pull only
  sends settings when `settingsServerAt` moves, and refusing does not move it —
  so a device whose local `settingsUpdatedAt` is newer keeps winning locally and
  re-pushes on every sync, for ever. Same rule as a rejected row, in a path
  nobody had applied it to.
- **`refused` counted only the two arrays.** A settings-only refusal was
  correctly blocked and then dropped from the response, so the client was told
  nothing — which is the same forever-repush, arrived at from the other end.

**Refused, not errored.** `applyPush` skips a member's module write and returns
the server's own copy in `rejected`. The client overwrites its local row with
that and the edit un-happens. A failed sync would instead leave the two sides
disagreeing forever.

**Traps:**

- **A rejection cannot be merged by last-write-wins.** The local row is a
  tombstone or an edit stamped *later* than the server's copy, so the ordinary
  rule keeps it and re-pushes it every sync, forever. `applyRejections()`
  overwrites unconditionally and takes the server's clock too, which drops the
  row back below the push watermark.
- **A refused module deletion must take its record tombstones with it.**
  Deleting a module tombstones the module *and* every record in it; refusing
  only the module restores it and leaves the records destroyed — worse than
  either outcome. `refusedModuleIds` cascades. Same for a refused module
  *creation* and the records pointing at it (`absentModuleIds`).
- **A rejection with nothing to restore is purged, not tombstoned.** A
  tombstone would be pushed, refused, and reverted on every subsequent sync.
- **The toast fires after the revert is on screen**, from inside
  `mergeChanges` — every sync path goes through there, and reporting from
  `syncInBackground` alone left the debounced push silent.
- **`.toast` matches several elements**; assert `.last()` (see §4).

The case this really exists for is not a poked-at hidden button: it is someone
who edited a module offline **as an owner** and was demoted before reconnecting.
Their work legitimately vanishes, and the named toast is the difference between
a rule and a bug report. Guarded by *"a demoted member has their module edit
reverted, and is told why"*, which fails both when the revert is silent and when
the client ignores the refusal.

---

## 15. Team membership (stage D)

```
GET    /api/org/members        anyone on the team; canManage says who may act
PATCH  /api/org/members/:id    owner only — owner | member, never platformAdmin
DELETE /api/org/members/:id    owner only — removes from the TEAM
POST   /api/org/leave          self-service exit
```

**Removing is not deleting.** `DELETE /api/org/members/:id` moves the person to
a fresh org of their own: account intact, team workspace untouched. Account
deletion is a different act on a different endpoint (`/api/admin/users/:id`) and
`deleteAccount()` is still the only thing that can take a workspace with it.
The two are one word apart and a decade of data apart, so the confirmations say
which is happening and the test *"removing a member keeps their account and the
team workspace"* fails if the two are ever wired together.

**`wouldStrandTeam()` is the one rule**, used by leave, self-demotion and join.
Leaving, demoting yourself, and joining another team are the same problem
wearing three hats: the last owner of a populated team walking away leaves
people with a workspace nobody can administer. Removing that guard fails five
tests.

**A removed member's device clears itself** on its next contact with the
server: their `orgId` changed, so `reconcileWorkspace()` (§13) fires and drops
the replica. The honest limit is therefore narrower than "we cannot erase it" —
it is **a device that never comes online again**. Say that, not the vaguer
version, and not an implied remote wipe.

**Traps:**

- **`page.goto('/#/settings')` when already there is a same-document hash
  change** and does not re-render. The Team screen showed the team as it was
  before the colleague joined until the test reloaded instead.
- **A removed member's page is still on the old module's route**, which no
  longer exists for them — that renders "Module not found", not onboarding.
  Assert emptiness from the dashboard.
- **`fmtWhen` was scoped inside `renderAdmin`** and had to be hoisted before
  Settings could use it.

---

## 16. Signup and the beta gate (`SIGNUP_MODE`)

There was never a signup step: `upsertUser` creates the account on the first
successful callback. `SIGNUP_MODE` (`code` default · `open` · `closed`) decides
who is allowed to reach that point.

**One path, two labels.** That design is right for the plumbing and was wrong on
the screen: every string said *Sign in* and *Already have an account?*, so the
one audience the gate exists for — someone arriving on an invite link, with no
account — was told by the only affordance on the page that it was meant for
other people. `accountAffordanceHTML()` and `openSignIn()` now say *Create your
account* instead. The flow underneath is untouched; only the framing moves.

**`canCreateAccount()` is the one rule**, and it is two conditions, not one: an
invite in hand, **or** `signupMode === 'open'`. Keying on the invite alone was
right for the beta and wrong the moment signups open — which is where this
deployment ends up — because then every new visitor can create an account and
was being asked whether they already had one. `code` without an invite, and
`closed`, keep the sign-in wording: a deployment must not offer what it will
refuse. Three E2E tests pin the three outcomes and each fails on a different
mutation of that expression, so no one of them passes on a version that always
says "create".

**Open signups do not retitle the modal on their own.** `openSignIn({ signUp })`
takes the intent from the caller, because the sidebar's *Sign in to sync* is
what returning users press all day. An invite in hand is the one signal strong
enough to stand alone.

`captureBetaCode()` toasts *Beta invite applied* as it strips the code. Three
things about that: it is safe before the first paint (`#toast-root` is static in
`index.html`, and `route()` only replaces `#main`); it reports **receipt, not
validity**, because a client-side check would have to ask the server whether a
code is real, which is an oracle for enumerating codes — a bad code is refused
at the callback instead, by the screen that explains itself; and it fades, so on
a cold start it can be gone before sign-in is even possible. The onboarding call
to action is the durable half, and the toast is the reassurance.

**The gate is on signup, never on sign-in.** `checkSignup(email, code)` returns
`{ ok: true }` immediately for an account that already exists — a returning
tester must never be asked for a code they used weeks ago. Consumption is
deferred to a `consume()` the caller runs only after the account exists.

**Order of the bypasses matters:**

1. account exists → in
2. `ADMIN_EMAILS` → in
3. **no users at all → in** — without this a fresh deployment in `code` mode is
   bricked: minting a code needs a platform admin, and becoming one needs a
   signup. Same bootstrap `upsertUser` already uses for the first
   `platformAdmin`. Found by the tests, not by reading the code.

**Traps:**

- **`SIGNUP_MODE` is the default, not the answer.** The live mode is stored
  (`platform` settings) and changed from Admin → Beta access, because opening or
  pausing signups used to need an environment change and a redeploy — minutes of
  free-tier downtime at the two moments you least want it. **Precedence is
  load-bearing:** a stored mode wins, so a redeploy cannot silently undo the
  operator; the env var only decides for a deployment that never set one.
  Guarded by *"a panel decision survives a restart, and the env var does not
  undo it"*, which fails the moment the env var wins.
  Cached in-process, invalidated on write, with a 30s TTL so a multi-instance
  deployment converges rather than staying wrong.
  `tests/signup.test.mjs` still boots one server per mode to cover the env-var
  path; `api.test.mjs` and `playwright.config.js` both pin `SIGNUP_MODE=open`,
  because those suites are about everything else. The E2E test that flips the
  mode **restores it in a `finally`** — the value is stored now, so leaving it
  changed would leak into every test after it.
- **The code crosses the Google round trip in an httpOnly cookie**
  (`crmb_beta`), beside `crmb_oauth_state` and for the same reasons. It is
  validated in the *callback*, against the email Google actually returned —
  only there is it known whether this is a signup at all.
- **Every refusal answers identically** (`SIGNUP_REJECTION`) — unknown, spent,
  revoked, expired. A test asserts the wordings are one set, not four.
- **"A use is spent only on account creation" is deliberate but untested.** No
  reachable path fails between the check and the write: a returning user
  short-circuits earlier, a malformed address is rejected earlier. The first
  version of that test passed with the ordering broken, so it now claims only
  what it proves and the code says the ordering is unguarded.

---

## 17. Backups and usage (beta stage 2)

M0 has **no automated backups and no point-in-time recovery**, so
`GET /api/admin/export` plus a nightly workflow is the entire safety net.
`scripts/restore.mjs` puts one back, into Mongo or the file store.

**The workflow is not in this repository — it runs from the private repo
`Mohamed-AH/crmback`**, and that is the copy to edit. Two reasons, and the
second is the one that would have hurt:

- **This repo is public, and so are its build artifacts.** A backup is every
  customer's records, accounts and organisations, plus `accessRequests` —
  which carries the addresses of people who asked for access and were
  *declined*. Running the job here would publish all of it.
- **It was removed, not left unconfigured.** A workflow with no secrets
  **skips and reports success**: it showed a green tick every night while
  producing no backups at all, and that state ran unnoticed for weeks. A
  no-op that reports success is worse than a failure, because nothing will
  ever contradict it. Its history is still here —
  `git log -- .github/workflows/backup.yml`.

**The dead-man's switch is the other half.** The job's last step pings
healthchecks.io, and only when a *validated backup was fetched, encrypted,
proved to decrypt, and stored* —
gated on the same `ready == 'true'` that the skip fails, so an unconfigured run
cannot report health. Without it the 60-day inactivity rule silently disables
the schedule on a repo that holds one file and therefore goes quiet fast.
`docs/BETA.md` § *"Knowing the backup ran"* has the setup.

**The export is the highest-value route in the app** — one request returns
every customer's data — so it is deliberately awkward:

- **404, not 401, when `BACKUP_TOKEN` is unset.** Nothing should be able to
  discover whether a deployment has backups.
- **`Authorization: Bearer` only.** A *correct* token in a query string is
  refused with an explanation, because Render logs request URLs; `?token=`
  writes a credential into plaintext logs, browser history and `Referer`.
  Guarded by a test that sends the right token the wrong way.
- **An admin session is not a token.** A stolen cookie must not also be a
  database dump. Also guarded.
- Compared by hashing both sides — `timingSafeEqual` throws on a length
  mismatch, and the throw would itself leak the length.

**Traps:**

- **HTTP strips trailing whitespace from header values**, so `Bearer <token> `
  arrives as the correct token. A test asserting that variant is refused fails
  for a reason that has nothing to do with the code. Use a genuinely different
  token instead.
- **Tombstones older than `TOMBSTONE_RETENTION_DAYS` are pruned at boot**, so a
  restore of old test data comes back without them and looks like the restore
  lost them. It did not; the retention policy did its job.
- **Usage is measured, not estimated.** `storageStats()` asks MongoDB for
  `dataSize + indexSize` rather than multiplying records by a bytes-per-record
  figure, because indexes and tombstones are real storage and an estimate that
  ignores them reads fine right up until the tier fills.
- **Nothing is enforced.** A cap firing mid-beta looks like the bug the tester
  was chasing.

**Keep-warm is configuration, not code.** UptimeRobot pings `/health` every 14
minutes. Two consequences worth remembering: that is continuous, so it consumes
~744 of Render's 750 monthly instance-hours and only works while this is the
only free service on the account; and 14 minutes against a 15-minute idle
timeout is one missed check from asleep.

### The restore verified one branch and not the other

`restore.mjs` counted its rows back on the **Mongo** path and, on the **file
store** path, wrote `store.json`, printed *"go and look"*, and checked nothing.
The asymmetry ran the wrong way round: the file store is the only kind of drill
that is safe to run regularly — Mongo means either a scratch cluster or
`RESTORE_OVERWRITE=1` against something real — so the cheap, repeatable half of
the exercise was the half that could not fail.

Both branches now call one `verifyCounts()` over accounts, organisations,
workspaces, modules and records, and `exit(1)` on any mismatch. Each asks the
store what it holds *now* — Mongo counts documents, the file store re-reads the
file it just wrote. **Counting the object we were about to write would restate
the intent rather than check the outcome**, which is the whole point.

**Measured against the broken state, and it was worse than predicted.** The
failure used is a real one: the file store keys workspaces by `wsId`, so a
backup carrying two workspaces with the same id has the second
`Object.fromEntries` **replace** the first's bag rather than merge with it. On
that input the pre-fix script printed *"Restored into …"* and exited **0** while
holding 6 of 180 records and 1 of 11 modules. It reports the shortfall per line
and exits 1 now.

**What a passing count still does not prove.** Rows landing in the wrong
workspace satisfy every total. The drill therefore ends by booting the restored
store and re-exporting it, comparing shapes rather than sizes — and by signing
in as a named account to see its own records. `docs/BETA.md` § *"Drilling the
backup"* has the runnable version.

### The export lost two collections, and `platform` is not one thing

**Found by running the drill, not by reading it.** The body carried `orgs`,
`users` and `workspaces` only, so a restore lost the approval allowlist (§20 —
approval *is* the allowlist) and the stored signup mode and `orgCreation` gate
(§16, §24). Nothing crashed, because `FileStore` coalesces missing collections
— **a restore silently reopened signups the operator had shut**, which is the
one failure mode you least want during a recovery. §16's guarantee that *"a
redeploy cannot silently undo the operator"* did not extend to a restore.

The export carries both now (`version: 2`, informational — `restore.mjs`
tolerates a version 1 body rather than branching on the number).

**`platform` is exported whole and restored in PART, and the split is the
point.** It mixes two kinds of thing:

| Kind | Keys | Restored? |
|---|---|---|
| operator decisions | `signupMode`, `orgCreation`, and each one's `…SetAt` / `…SetBy` | **yes** |
| runtime state | `egressBytes`, `egressMonth`, `alerts` | **no** |

**A decision is three keys, not one, and the first version of this missed
that.** `setSignupMode()` and `setOrgCreation()` each write the value plus
`<name>SetAt` and `<name>SetBy`, so the original two-name allow-list restored
the lever and dropped its provenance: signups came back open, correctly, with
no record of who opened them or when. Not data loss you would notice — an audit
trail missing at the moment somebody asks why signups were open.

**CI could not have found it.** The fixture seeded exactly the two keys the
allow-list named, so the bug and its test were built from one wrong assumption
and nine other assertions passed. What found it was **restoring a real artifact
from the live deployment** — the drill in `docs/BETA.md`, one day after it was
written, doing the one job the automated version cannot. The fixture now seeds
all six plus the runtime keys, and the list is derived from
`OPERATOR_DECISIONS` so a third lever is one string rather than three.

Restoring the runtime half seeds a fresh deployment with a dead one's traffic
against this month's allowance, and carries the escalate-only alert state
across (§25) — so a threshold that already fired stays quiet on the deployment
that now needs it. **An allow-list, not a delete-list:** a key added to
`platform` later is runtime state until somebody decides otherwise, and
defaulting the other way would carry it silently.

**`accessRequests` carries declined addresses too**, so the nightly artifact now
holds personal data about people who never became users. That is a deliberate
trade for recoverability, and it is why the artifact's retention window and its
download audience are worth revisiting.

**And the rule this creates: NEVER PUT A CREDENTIAL IN `platform`.** It is in
every nightly artifact from version 2 onward, and a GitHub build artifact is
downloadable by anyone with repo read access.

### The drill runs on every push now (`tests/backup.test.mjs`)

Export from a real server, restore with the real script, boot a second server
over the result, ask it what it has. Ports 9500–9550 (§9).

**Two canaries, one per tenant, and that is the design.** Aggregate counts pass
happily when rows land in the *wrong* workspace — the wsId collision above lost
174 of 180 records with every total still looking plausible. So each owner must
see their own canary and must **not** see the other's. The isolation test was
checked by inverting it: with the assertion flipped it fails, which is what
proves it is not passing on an empty pull.

**Three tests cover the `platform` split as one set** — two things that must
cross the restore and one that must not. Two of them were written asserting
*absence*, before the export carried anything, and inverted when it did. That
ordering is why they are assertions about behaviour rather than about a shape
somebody hoped for (§9: a test that has only ever seen the fixed code proves
nothing). The one that never flipped — *"runtime counters and spent alert steps
are left behind"* — was checked by removing the allow-list from `restore.mjs`,
which makes it fail by name.

The source deployment is seeded with a real approved request and real operator
settings before it boots, and `before` asserts they were still there at export
time. Without that check the whole set is hollow: it would pass against a
deployment that never had anything to lose.

**Do not pin the seeded `egressBytes` value.** The counter is keyed by month and
rolls over, so a value seeded without a matching `egressMonth` is zeroed and
re-accumulated by the running server — the first version of that assertion
failed with `28 !== 4242` against a counter doing its job. Assert the shape and
that the restore refuses it, never the number.

**A version 1 backup is covered too**, and is the ordinary case rather than an
edge one: the file on disk is older than the code reading it far more often than
the other way round.

**Snapshot the restored store before anything boots over it.** A running server
writes to `store.json` within its first request — the egress counter lands in
`platform` immediately — so reading it afterwards cannot tell "the restore
brought this back" from "the new deployment accumulated it". The first version
of the runtime-state assertion failed against perfectly correct code for
exactly that reason.

**And one for the workspace-webhook work before it starts.** `workspaces[].meta`
is the `data` collection, which includes `settings` — so workspace settings are
already in every nightly artifact. §18 records that a Telegram webhook URL
contains a bot token. Storing a per-workspace webhook URL in `settings` would
put live credentials into a GitHub artifact downloadable by anyone with repo
read access. Keep it out of `settings`, or redact it on export.

---

## 18. Problem reports (beta stage 3)

`POST /api/feedback` stores the message plus a **whitelisted** context —
version, route, browser, sync status, counts, and up to ten recent console
errors from a ring buffer that wraps `console.error` at boot. Bounded because
it writes to the same 512 MB the customers use: 4 KB message, ten an hour per
user, and a 90-day TTL keyed on `reportedOn` (a real `Date`, single-field —
the same rule as the events and tombstone TTLs).

**Stored *and* pushed.** `FEEDBACK_WEBHOOK_URL` gets a POST after the row is
written, carrying who, when and what they wrote — and
**none of the diagnostic context**. Console errors can contain record names,
module names and customer email addresses, so sending them to a chat service
would make it a processor of beta users' CRM contents. There is a test that
stands up a local HTTP server and asserts the payload contains the message but
not the browser string, not a record count, and not an email lifted from an
error message.

**Traps:**

- **The webhook is a notification, not the record.** A test boots against
  `http://127.0.0.1:9` — nothing listening — and requires the report to be
  stored anyway. A rotated URL must not silently swallow every bug report.
- **It fires after the response.** A slow or dead webhook must not make
  reporting a bug feel like another bug.
- **`sanitiseContext` is a whitelist, not a cleanup.** Anything the client
  invents is dropped rather than stored; the error list is capped at ten on the
  way in, not on the way out.
- **`console.error` is wrapped, never replaced** — devtools keeps working, and
  the wrapper's own failure can never stop a log line.

### Webhook shapes (Discord · Slack · Telegram)

Discord reads `content`, Slack reads `text`; sending both means one payload
serves either with no provider setting to get wrong. **Telegram is not a
webhook at all** — `sendMessage` takes `chat_id` and `text` as parameters, so a
`{content}` body is accepted by the transport and simply never delivered.

- **Detected by the path** (`/bot<token>/sendMessage`), not the hostname. That
  is what actually describes the API shape, it also covers a self-hosted Bot API
  server, and — the reason it is worth doing — a local capture server can match
  it, so the payload is testable without talking to Telegram.
- **No `parse_mode`.** With one set, a report containing an unbalanced `_` or
  `[` gets the whole message refused with a 400 and the notification vanishes
  for a formatting reason. The text carries no markup for Telegram to parse.
- **`chat_id` is moved out of the query string into the body** rather than left
  for Telegram to merge with a JSON body — that merge is not something the Bot
  API docs promise.
- **The URL is a credential**: it contains the bot token. Same class as
  `BACKUP_TOKEN`, and nothing interpolates it into a log line. A test asserts
  the token does not appear in the server's output.
- **A resolved `fetch` is not delivery.** Telegram answers 200 with
  `{ok:false}` for a bad `chat_id`, or for a bot the recipient never started.

---

## 19. Legal pages and the beta notice (beta stage 4)

The last thing between here and strangers signing themselves up. Google will
not publish an OAuth consent screen without a privacy policy URL, and until it
is published every tester has to be added to the Testing list by hand — which is
the manual step the whole signup plan exists to remove.

`privacy.html` and `terms.html` are **standalone pages**: their own `legal.css`,
no app JS, no service-worker shell. They have to render for someone who has
never opened the app and may have JavaScript off — Google's reviewer included.
`express.static(__dirname, { extensions: ['html'] })` already serves them at
`/privacy` and `/terms` with no route.

**The service worker bug this uncovered, which was real and pre-existing.** The
navigation handler answered *every* navigation with `index.html` **and** wrote
the fetched response back into the cache under `index.html`. So `/privacy` would
have shown the CRM, and worse, the *next* load of the app would have served the
privacy page as the app shell — a poisoned cache that survives a reload. Fixed
with a `STANDALONE_PAGES` list that returns early, straight to the network.
That shipped in `crmbuilder-v14`; **anything added to those pages must be added
to that list too**, or it silently becomes the app. (The current
`CACHE_VERSION` is in §3, which is the one to bump.)

**The notice is recorded, not just displayed.** `POST /api/me/beta-accepted`
stamps `betaAcceptedAt` on the user, so "they were told the data might go" is
answerable from the database rather than asserted. Shown after the first
successful sign-in, never before: someone who has not decided to have an account
does not need a warning about one.

**Traps:**

- **Absence is not an answer.** The first version skipped the notice when
  `signupMode === 'open'` — so offline, where `/api/me` never resolves and the
  field is simply absent, every user got a modal over their app asking them to
  acknowledge something the client could not record. It tests for `code` or
  `closed` now: a mode the server positively stated. Exactly §13's rule, and the
  offline sync E2E test is what caught it, by timing out on a click the backdrop
  was intercepting. That test now asserts `.modal-backdrop` count is 0 straight
  after the offline reload, so the next occurrence names itself.
- **`Cloud.me.serverAvailable` is not "the server answered."**
  `offlineIdentity()` sets it from the cached auth flag, so it is true offline
  for anyone who was signed in. Do not reach for it as the online check.
- **The acknowledgement is not assumed to have landed.** `Cloud.acceptBeta()`
  failing leaves `betaAcceptedAt` unset, so the notice returns next time. Shown
  twice is a minor annoyance; recorded-but-never-sent is a false record.

---

## 20. Access requests — people who arrive on their own

Until this, a stranger who signed in without an invite got a screen saying the
beta was invite-only and one button, *Keep looking around*. A dead end with no
way to knock.

**The whole design turns on one fact:** at the moment we refuse someone, we
already hold their **Google-verified email**. The callback had it and threw it
away. So the request hangs off the refusal, never off a form.

A typed form would take an unverified string on an unauthenticated endpoint —
anyone could queue as `ceo@bigcorp.com` and, once approved, be handed that
account. Refusing first costs an attacker a full OAuth round trip per row. That
is why there is no "request access" form and should not be one.

```
accessRequests { email, name, note, status, requestedAt, decidedAt,
                 decidedBy, usedAt, expiresOn }
```

**The address comes from `ASK_COOKIE` and nothing else — never `req.body`.**
`offerToAsk()` sets it at the point of refusal (both the Google callback and
`/auth/dev`), ten minutes, httpOnly, beside `crmb_oauth_state` and `crmb_beta`
for the same reasons. Same rule as `req.scopeOrgId` and `workspaceIdFor()`:
identity is what the server established, never what the caller claims. Guarded
by *"a request cannot claim an address its sender does not control"*, which
fails the moment the handler reads `req.body.email`.

**Approval allowlists the address. It does not mint a code.** There is no mail
plumbing in this product (§13), so a code-based approval ends with the operator
pasting a link into their own mail client and the tester waiting on it — the
manual step this whole flow exists to remove. An allowlisted address means they
come back, press the button that refused them, and are in. The clipboard reply
is a courtesy, not the mechanism.

**Traps:**

- **Bypass order is load-bearing.** `approved` sits after the three existing
  bypasses and **before** `open`; `pending` sits **after** `open` and before
  `closed`. Putting `pending` ahead of `open` means a request left over from
  when the door was shut keeps someone out once it is open — guarded by *"open
  signups let a still-pending request through"*. Putting it after `closed`
  means someone on the list is told signups are paused, which denies that
  anyone can still act on them.
- **`pending` is a deliberate exception to identical rejections.** Everything
  else answers the same way so codes cannot be enumerated (§13, §16). This one
  does not, because the only way to see it is to have just proved control of
  the address to Google — it tells the caller nothing they did not know. Without
  it, someone who asked last week is told "invite-only" again, reads it as being
  ignored, and asks again.
- **Declined is silent, and cannot re-queue.** The handler short-circuits on any
  non-pending row and answers *received* without writing. Telling someone they
  were turned down starts an argument; letting them re-ask makes the decision
  meaningless. The screen says the same thing whatever came back, so the client
  cannot leak the distinction either.
- **`expiresOn` is a real `Date` carried only by decided rows.** Single-field
  TTL, same trick as tombstones (§10) and the feedback TTL (§17). A TTL on
  `requestedAt` would quietly delete the approvals that *are* the allowlist.
- **The E2E half is injected, not real.** `playwright.config.js` pins
  `SIGNUP_MODE=open`, so no refusal is reachable there; the server loop is
  covered in `tests/signup.test.mjs`, which boots a gated server. The E2E tests
  prove the screen, and declare the deliberate 403 via
  `test.info().expectedConsoleErrors`.

---

## 21. The Tier 1 hardening (an outside audit, checked)

Eight edge cases were put to this codebase from outside. **Six held, two did
not**, and the two that did not are worth recording so they are not "fixed"
later by someone reading the report rather than the source:

- **"A stale offline delete wipes newer edits" — no.** `server.js` applyPush
  skips any incoming row whose `updatedAt` is not newer than the stored one, so
  a fortnight-old tombstone loses to a colleague's later edit. Rows nobody
  touched *do* go, which is correct and merely surprising.
- **"Deleting a field wipes its values" — backwards.** The builder wrote only
  `module.fields`; every record kept its `data` keys. Nothing was destroyed —
  but a user who "deleted" a field still had that data in the workspace, in
  every JSON export, and saw it return if a field with the same key was
  recreated. A disclosure problem, not a loss one. **Now fixed — see §22.**

### What changed

**The first account is only special on an unnamed deployment.** `isFirst` used
to mean `platformAdmin` unconditionally, and `checkSignup`'s bypass 3 let that
account past a shut gate — so whoever found a freshly deployed URL first owned
the instance. Both now require `ADMIN_EMAILS` to be empty, which is the only
case the bootstrap exists for (§16); with operators named, bypass 2 already
lets them in. Guarded by three tests, including *"a deployment that named
nobody still lets its first visitor in"* — the bricking case the bypass is for.

**An org owner cannot reach a platform admin.** `resolveTarget` scoped by org
but never compared roles, and a platform admin has an org like anyone else — so
its owner could demote, disable or delete them. 404, not 403, like every other
cross-boundary answer here.

`wouldStrandDeployment()` lives inside `deleteAccount()` rather than at the call
site, for the reason that function already documents. **No current path reaches
it**: this route refuses any action on your own account, and an owner now 404s
on a platform admin, so the actor is always a *second* platform admin and there
are at least two. That is stated in the code and deliberately **not** covered by
a test, because any test written for it would pass whatever the guard did. It
is the backstop for the next route added — a self-serve "delete my account" is
the obvious one.

**Restoring a backup merges by default.** It used to tombstone every local row
absent from the file, and tombstones sync, so recovering one deleted module
deleted from *every colleague's device* everything added since. The
confirmation said "REPLACES everything currently on this device", understating
it on both counts.

- **`importState` takes a `mode`, and there are three.** `merge` puts the
  incoming rows and touches nothing else; `replace` tombstones what is missing,
  so the removal travels; `adopt` hard-clears first, for a store being seeded
  from scratch. The old pair was a `tombstone` boolean whose *off* branch was a
  hard `DB.clear` — so "do not broadcast deletions" and "do not delete
  anything" looked like one option and were not. Naming three is what stops
  that being rediscovered; I hit it while writing the test.
- **Replace names its cost first** — the number of rows about to go, and on a
  team, that they go for everybody.
- **`closeModal()` now fires `crmb:modal-closed` on `#modal-root`.** A modal
  that answers a question can be dismissed by Escape or a backdrop click,
  neither of which goes through its buttons; without a signal, a
  promise-returning prompt never settles and its caller waits for ever. The
  older prompts (`askAboutAnonWorkspace`, the beta notice) have the same latent
  gap and simply offer no close affordance.

**Test traps hit while writing this:**

- **Two armed `page.once('dialog')` handlers both fire on one dialog**, and the
  second throws *"Cannot accept dialog which is already handled"* — which
  surfaces several steps later as an unrelated timeout. One handler, on the one
  click that raises a confirm.
- **The merge test asserts both halves.** That the restore restored (otherwise
  a no-op import is indistinguishable from a good merge) *and* that nothing
  else moved — checked at the server via `/api/sync?since=0`, since that is
  what propagates. It asserts **no tombstone was created**, not merely that the
  row survived: an import-time tombstone carries `stamp: true`'s clock, so it
  would be newer than the colleague's row and would win.

### Still open, deliberately

Only 2b from the audit remains: a delete cannot be undone, because a tombstone
discards the body. Costed and deliberately not built — keeping bodies would
mean a workspace deleting to free space frees none until the retention window
passes, against the lever §24 added, and a mass delete would temporarily double
that tenant's footprint. See §26 and `docs/archive/TIER-2.md`.

---

## 22. Removing a field, and what happens to what was in it

The builder writes `module.fields` and nothing else, so removing a field left
every value in place under its key. Nothing was destroyed — but the person who
removed the column believed it was, and those values still travelled in every
JSON export, sat in the admin export, and came back the moment a field with the
same label was recreated (`slug()` produces the same key). That is the wrong way
round for anyone who removed a column *because* of what it held.

**Purge is the default, and it is not silent.** "Deleted" should mean deleted —
but a schema change that destroys months of data without saying so is the shape
§21 has just finished removing from the restore path. So `askAboutRemovedFields`
names the fields, counts the records holding a value, and offers *Delete the
values* (primary) · *Keep the data* · *Cancel*.

**Traps:**

- **A rename is not a removal.** `existingKey` is carried through the save, so a
  relabelled field keeps its key and never reaches this prompt (§4). Guarded by
  *"renaming a field is not a removal"*.
- **The question is a NESTED layer, not `openModal`.** `openModal` replaces the
  whole of `#modal-root`, so asking from inside the builder would destroy the
  builder — and *Cancel* would then cost the user every unsaved edit rather
  than returning them to it. `openNestedModal`/`closeNested` append and remove
  one layer; a global `closeModal` still clears both, which is what Escape
  should do.
- **The decision happens before the module is written.** Cancelling has to leave
  the schema untouched, not half-applied.
- **Purged rows are re-stamped.** A row whose `updatedAt` did not move is a row
  the sync engine never sends — the values would be gone here and still present
  for everyone else. Every write goes out in one tick via `Promise.all`, because
  an IndexedDB transaction commits when the microtask queue drains (§10).
- **A new field is not a list column by default.** An E2E test asserting "the
  column is gone" passes on a column that was never there; the fixture checks
  `.bf-list` so the assertion means something.
- **The field id is the slug, and `slug()` uses underscores** — `#f-private_note`,
  not `#f-private-note`.

**Not retroactive.** This stops new ghost data; workspaces that already removed
a field still hold the old values. A cleanup pass over existing data was not
written, because rewriting every record in every workspace on the strength of a
guess about which keys are orphaned is a bigger and more dangerous act than the
problem. If it is ever wanted, it belongs in Settings as something a user runs
against their own workspace, having been shown what it found.

---

## 23. Currency relabels, and now says so

`fmtCurrency` formats the stored number with the workspace's currency code.
That is right — there are no exchange rates in this app and inventing one would
be worse than not having it — but it is not what the word leads people to
expect: switching USD to EUR turns a $10,000 deal into a €10,000 deal and moves
every pipeline total with it. It used to do that in silence.

`confirmCurrencyChange` names the count of records holding an amount, says
plainly that nothing is converted, and points at the export/convert/import path
for anyone who meant the other thing.

**Asked only when there is money on the line.** With nothing stored in a
currency field there is no misreading to prevent, and a dialog over an empty
workspace is noise. Same rule as `askAboutRemovedFields` (§22), and both
directions are tested — one test fails if the prompt never appears, another
fails if it appears when there is nothing to mislabel.

**A refusal must move nothing**, including the business name typed alongside it
in the same form, so the check runs before any of the save is applied.

### The reload flake, actually fixed

*"data survives a reload"* failed intermittently under full-suite load and never
in isolation. The first fix was wrong: it waited for the sidebar **after** the
reload, which addressed the symptom. The cause was that the test reloaded
immediately after clicking save, racing the write — so the record was lost
while the modules, written during onboarding and long since committed,
survived. That asymmetry was the clue. Waiting for the row to render before
reloading is waiting for `DB.put` to have resolved, since the re-render follows
it. Confirmed over four consecutive full runs.

---

## 24. Operator controls — COMPLETE (A, B and C)

**This section is the resume point for this work.** All three stages shipped;
what follows is what was built and why, not a to-do list. The reasoning behind the
shape — why Render cannot be read, why orgs need their own gate, the full
verification list — is in `docs/archive/OPERATOR-CONTROLS.md`. Six asks, and the first
thing to know is that they are not six pieces of work — two were already done
and one cannot be built as worded.

| Ask | Where it stands |
|---|---|
| Total users and orgs | ✅ Stage A — `GET /api/admin/platform` + the Deployment and Organisations cards. Was: `/health` reports both to a platform admin, but `/api/admin/stats` has no org count and there is **no org list at all** — `listOrgs()` is used only by the backup export |
| Per-org and combined usage | ✅ Stage A — `usageByOrg()`, measured with `$bsonSize` (Mongo) and serialised length (file store), cached 30s |
| Resource quotas | ✅ Stage A — three meters: Mongo, RSS, monthly egress. Uptime hours dropped — see below |
| Halt user signups | ✅ Done — the mode switch, §16 |
| Halt org creation | ✅ Stage B — `orgCreation`, with the invited-colleague exemption |
| Pause/resume a user | ✅ Done — `disabled` + `PATCH /api/admin/users/:id` |
| Pause/resume an org | ✅ Stage B — read-only sync, reversible, destroys nothing |
| Telegram alerts | ✅ Stage C — five rules, escalate-only, evaluated off the keep-warm ping |

### Three decisions taken before any code

> **Before removing or trimming any of this, read
> [`docs/archive/TELEMETRY.md`](docs/archive/TELEMETRY.md).** It records why the
> egress counter exists given that Render's own dashboard reports bandwidth
> (the counter's job is the *alert* — Render's dashboard is pull, not push),
> why RSS is the weaker meter of the two if one has to go, and the inventory of
> all eight files a removal touches. Written when that removal was proposed
> and declined, so the argument does not have to be reconstructed.

**Three meters, and uptime hours are deliberately not one of them.** Render
does not publish free-tier consumption and a number we cannot check is worse
than none, so that idea was dropped. What is measured instead, all from inside
the process: **Mongo `dataSize + indexSize` / 512 MB** (already built),
**`process.memoryUsage().rss` / 512 MB**, and **outbound bytes this month /
5 GB**. Two things about those last two that are easy to get wrong later:

- **RSS is a point sample taken when `/health` is hit**, so it catches a *leak*,
  not a burst — the sudden allocation that OOM-kills the container happens
  between pings and will not be seen. A high-water mark is stored alongside so
  the panel shows the worst observed rather than the last glance. Do not
  present it as protection against an OOM kill.
- **The egress counter must never write per request.** It accumulates in memory
  and flushes on an interval; a crash costs one interval's bytes, which is far
  cheaper than write amplification that would itself consume the storage quota.
  It counts application bytes, not what Render bills, and
  `EGRESS_LIMIT_BYTES` should be checked against Render's current plan — a
  wrongly encoded limit is worse than none.

**Org creation needs its own gate, and this is not tidiness.** Every signup
mints an org, so pausing signups today also locks out every *invited teammate*
of every existing customer: a colleague must create an account (→ an org)
before `/api/org/join` can move them. So `orgCreation: 'open' | 'closed'`
refuses a signup that would mint a **new** org while still admitting one
carrying a pending team invite. A version that simply refuses every signup has
missed the entire point, and there is a test for that case specifically.

**The alert loop runs on `/health`.** UptimeRobot already hits it every 14
minutes (§17), so no scheduler is needed. Evaluation happens after the
response, never blocking it, and behind the same platform-admin/`HEALTH_DETAIL`
check the counts already sit behind — `/health` is public and must not grow for
anonymous callers.

### Stages

- ✅ **A — see it.** Shipped. `GET /api/admin/platform`: combined counts, per-org rows
  (members, records, modules, **bytes**, last active), and the three meters with
  the `ok`/`warn`/`critical` levels `usageReport()` already computes. Per-org bytes
  is the real work: `$bsonSize` in a `$group` by `orgId` on Mongo, summed
  `JSON.stringify` lengths in the file store. **Measured, never
  records × a constant** — §17 records why that estimate reads fine right up
  until the tier fills. Cache with a short TTL from the start; it scans.
- ✅ **B — the levers.** Shipped. `orgCreation` beside the signup mode, same `platform`
  document and the same precedence rule (§16: a panel decision beats the env
  var and survives a redeploy). Org suspend/resume via `suspendedAt` +
  `suspendedReason`: sync refuses writes with a named reason, sign-in still
  works, **nothing is deleted**. `deleteAccount` stays the only thing that can
  remove a workspace (§5) and nothing here may touch it. The wording is one
  word from deletion and a decade of data apart — §15's lesson.
- ✅ **C — alerts.** Shipped. Mongo storage at 60/85/95%, RSS at 70/85%, egress at
  60/85%, signup spikes, and a single tenant over 25% of the database. **Escalate-only and never
  repeated at the same level**: state per rule in the `platform` document, so
  60% notifies once and stays quiet until 85%, re-arming only after a drop. An
  alert that fires hourly trains you to ignore it, which is worse than none.
  Reuses `webhookRequest()` so Telegram gets the shape it reads (§18), plus a
  test button that proves the wiring without waiting for a threshold.

### Traps expected here

- **`/health` is public.** Anything added must sit behind the existing detail
  check and must not lengthen the anonymous response.
- **A dead webhook must never break `/health`** — same rule as the feedback
  notifier: evaluate and store first, notify after the response.
- **Suspension is reversible and customer-visible.** It is not deletion, and
  the screen has to say which.

### Stage A as built

`GET /api/admin/platform` (platform admin only, 30s cache because
`usageByOrg()` scans) returns combined counts, a per-org table sorted heaviest
first with each tenant's share of stored bytes, and the three meters.

**Two things found while building it:**

- **The egress counter has to flush on SIGTERM.** Render's free tier spins down
  after ~15 minutes idle and signals to do it, so with only an interval flush
  every sleep lost whatever had been counted since the last write — on a quiet
  service, most of it. The month's figure would have read far too low to be
  worth having. Bounded by a 2s race so a slow database cannot stop the process
  exiting. Guarded by *"egress is counted, persisted, and still there after a
  restart"*, which fails without the handler.
- **A pre-existing bug in the access-requests panel**: it read
  `access.usage.percent`, but `usageReport()` returns `percentOfLimit`, so the
  storage warning rendered "Storage is at undefined%".

The per-org test asserts that **one large record outweighs six small ones**.
That is the assertion that fails the moment anybody swaps the measurement back
for records × a constant, which is the trap §17 already records.

### Stage B as built

`orgCreation: 'open' | 'closed'` in the `platform` document, same precedence as
the signup mode. Closed refuses a signup that would mint a new org **unless it
carries a valid team invite** — checked, never consumed, because
`redeemPendingInvite` spends it a moment later and burning it twice strands the
joiner in an org of their own. The invite rides the Google round trip in
`crmb_invite`, beside `crmb_beta` and for the same reason.

Suspension is `suspendedAt` + `suspendedReason` on the org. `/api/sync` still
**pulls** for a suspended org and refuses only the push, returning
`readOnly` + `readOnlyReason` — a sync that silently stopped working is
indistinguishable from the bug the tester was about to report.

**The trap that would have cost real data.** `Cloud.sync()` set the push
watermark unconditionally. On a refused push that marks the rows as sent, so
they are never offered again — resuming the organisation would restore writing
while having quietly lost everything typed during the pause. The watermark now
moves only when the push was accepted; the cursor still moves either way,
because the pull did run.

**And the test for it passed on the bug first time.** One record sits exactly
on the watermark and client selection uses `>=` (§10), so it is re-sent even
when the watermark wrongly advanced. It takes **two records with distinct
timestamps** — the earlier one is what falls below the line and disappears.

Other notes: the read-only toast is latched, or the debounced push would fire
it on every keystroke; `platformCache` is invalidated on suspend, since the
table it feeds shows exactly that column; and `.mode-switch` now matches two
rows, so the older E2E test addresses its own by `:has([data-mode])`.

**Vacated orgs are tidied now** — see §25.

---

## 25. Stage C: alerts, and the placeholder orgs

### Where the loop runs, and who for

UptimeRobot hits `/health` every 14 minutes to keep the free tier awake (§17),
so the rules are evaluated off the back of that — after the response, never
blocking it, and the body is unchanged.

**It runs for every caller, not only a platform admin.** The detail check on
`/health` governs what the body *discloses*; evaluating is not disclosing. An
earlier draft of this plan said to gate it behind the same check, which would
have meant the keep-warm ping — the only regular caller there is — never
triggered anything. `ALERT_MIN_GAP_MS` (5 min) keeps a burst of pings to one
pass.

### Escalate-only

Each rule stores the step it last announced in `platform.alerts`. Crossing 60%
speaks once and then stays quiet until 85%; dropping back under the lowest step
re-arms it. A rule that fired every fourteen minutes would train the operator
to ignore the channel, and an ignored alert is worse than none. Guarded by *"a
crossed threshold is announced once"*, which makes four pings and requires
exactly one message — it fails the moment the `step > was` comparison becomes a
bare truthiness check.

Rules: storage 60/85/95, RSS 70/85, egress 60/85, more than
`SIGNUP_SPIKE_PER_HOUR` signups in an hour, and one tenant over
`TENANT_SHARE_LIMIT`% of the database. `POST /api/admin/alerts/test` fires a
message and reports what every rule currently sees, so "nothing is wrong" can
be told apart from "the webhook has been broken since I rotated the URL".

### Tidying the org a joiner leaves behind

Signing up only to accept an invite mints an org that is abandoned seconds
later, inflating the tenant count the panel exists to make trustworthy.
`tidyVacatedOrg` removes it — but the guard is deliberately stricter than the
"no records" rule it was asked for: **no members left, no records AND no
modules.** Somebody who built their own CRM and then joined a team without
bringing it has a workspace, not a placeholder; deleting it would be the silent
destruction §12 warns against. That org stays and shows in the table with
nobody in it, which is the honest outcome and has its own test.

**The trap, and it is a nasty one.** `FileStore.updateUser` does
`Object.assign` on the stored object and `getUserById` hands back that same
reference, so `req.user.orgId` silently becomes the *new* org the moment the
join's update runs — and the tidy-up then inspected the org they had just
joined, found a member, and did nothing. `MongoStore` returns copies and does
not behave that way, so the two backends would have disagreed, with the file
store — the one the tests run on — being the broken half. **Read anything you
need about the previous state before the write**, which is what `vacatedOrgId`
is for.

---

## 26. Tier 2

**Resume point for this work.** Reasoning is in `docs/archive/TIER-2.md`; status here.

- ✅ **2c — field-level merge.** Two people editing different fields of one
  record both keep their edit. Shipped — see below.
- ✅ **2a — roles that cannot delete.** `contributor` and `viewer` on the
  ladder, enforced in the `applyPush` seam. Shipped — see below.
- ☐ **2b — undoable deletes.** Costed and deliberately not built.

### The fact that reframes 2a, found while planning

**A tombstone discards the record body.** `js/db.js` writes
`{ id, moduleId, deletedAt, updatedAt }`; `server.js` writes `doc: null`. So a
deleted record is *not* recoverable for 180 days — that window governs how long
the **gravestone** survives so offline devices learn about the delete, not the
row. Contents are gone everywhere the moment a delete syncs.

Anyone reading "tombstones are kept for 180 days" and concluding undo is nearly
free will be wrong. Undo requires **keeping the body**, which on a 512 MB
shared tier means a workspace deleting to free space would free none until the
window passed — directly against the lever Stage B just added — and a mass
delete would temporarily double that tenant's footprint, which is the exact
shape the Stage C alerting exists to catch.

### The trap 2c will hit

The merge must happen **on the server**, not only the client. `applyPush` skips
an incoming row that is not newer (`prior.updatedAt >= updatedAt → continue`),
so a client-side field merge would still be overwritten by whoever pushed last.
That is a change to the heart of the sync engine, which already carries six
recorded traps (§10) — and `updatedAt` must keep its existing job of driving
selection and the cursor, or the delta protocol breaks (§3). Only the contents
merge per field.

Also: §22's field purge **deletes keys**, and an absent key has no clock — so a
purge could be silently undone by a stale copy unless it becomes a clocked
change. The two features fight if that is missed.

### 2c as built

`fieldsAt: { key: ts }` inside `doc`, so the stored shape is unchanged.
`stampChangedFields` advances a key's clock only when its value actually moved,
so a record nobody has edited since creation carries no map and costs nothing.

**A missing key means clock 0, never the row's `updatedAt`.** That is the whole
design and it is easy to get backwards: falling back to the row clock means a
copy that never touched a field still claims to have set it when it was last
saved, so an untouched stale value beats somebody's real edit. Zero says "as
far as this copy knows, nobody ever edited this" — which is what absence means,
and it makes a partial map correct too. Guarded; swapping in the row-clock
fallback fails three tests.

**The merge runs on the server**, in `applyPush`, and **runs even when the
incoming row is newer** — a newer row can still carry a stale value for a field
somebody else changed, and skipping the merge on that branch is exactly how the
edit is lost.

**A merged row is NOT added to `won`.** `won` is what a push must not have
echoed back, because the device already has it — but a merged row is not what
they sent, so the pusher has to receive it or their screen keeps showing the
value they just lost.

**`updatedAt` becomes `max(prior, incoming)`,** and the reason is client-side:
`mergeChanges` skips any incoming row whose clock is not newer than the local
one, so the device that fed the merge would ignore the result and keep its
stale copy. The test asserting it has to run **immediately after the merge** —
the next push heals a wrong stamp and hides the defect, which the first version
of that test did, passing on the bug.

**§22's purge now clocks its removals.** A key with no clock counts as never
edited, so a colleague still holding the value would win the merge and put it
back. Its own test fails if the purge forgets.

Tombstones stay whole-row: deleting a record is not a field edit.

### 2a as built

`canEditRecords` and `canDeleteRecords` beside `canEditSchema`, enforced in the
same `applyPush` seam and refused the same way: the response carries the
server's own copy, the client overwrites its local row, the edit un-happens.

**The refusal carries WHY, and it has to.** The first version had the client
choose the wording from `Cloud.user.role` — and it named the wrong rule,
because this fires precisely when the client's idea of its own role is stale.
That is the entire scenario. The server knows and the server decides, so the
server says: `reason: 'readonly' | 'nodelete'` rides along with the rejected
row. Asking the client to guess produces a confident, wrong explanation.

**A refused creation is answered `absent`**, so `applyRejections` purges it
rather than tombstoning — a gravestone would be pushed, refused and reverted on
every subsequent sync, forever (§14's trap, now covered for records too).

`TEAM_ROLES` is what an owner may hand out, and `platformAdmin` is deliberately
not in it. The self-demotion strand check now fires for **any** step down from
owner, not just the one rung that used to exist.

The Team screen's role toggle became a picker: a four-rung ladder does not fit
a button that flips between two values, and the confirmation says what the rung
means rather than just naming it. On cancel or failure the control is put back,
or it sits there lying about the state.

---

## 27. The documentation pass, and where docs go stale

An audit of every document against the shipped code, after Tier 1, the operator
controls and Tier 2 landed in quick succession. Recorded because **the pattern
of what was stale is more useful than the list of fixes**, and it will happen
again.

**The worst drift was not in the working notes — it was in the user-facing
docs nobody re-reads.** `CLAUDE.md` gets a section per change because that is
what this file is for. The others are written once and quietly rot:

- `docs/manual.html` still said *"sync is last-write-wins on the whole
  workspace… if several people need to edit at once, give each of them their
  own account"*. Untrue since per-record sync, and it had survived teams,
  invites, roles **and** field-level merge. It had no team section at all.
- `docs/product-tour.html` told prospects *"shared team workspaces are the next
  major piece of work"* — a shipped feature described as unbuilt, on the page
  written to sell it.
- `docs/ONBOARDING.md` told the person rolling this out to set the expectation
  that a workspace is **per account**, and to give each colleague their own.
  That is now the opposite of the advice they need.

**The rule that follows:** a change that alters *what a user can do* has to be
walked through `README.md`, `guide.html`, `USER-GUIDE.md`, `manual.html`,
`product-tour.html`, `ONBOARDING.md`, `DEMO-SCRIPT.md` and `BETA.md`'s tester
note.

**`pricing.html` and `refunds.html` are on the list too, added with §86**, and
`pricing.html` is the one entry whose staleness is not about a feature: it
names a figure that also lives in the payment provider's own product, and
**the provider's copy is the one a customer is actually charged.** §71 kept the
price out of this repository entirely to avoid that duplication, which was
right while there was nowhere a customer could read it and is no longer
possible — a pricing page has to state a price. So the rule is narrower than
the walk: **change the product and the page in the same sitting**, because the
failure is not a stale document, it is a published figure that disagrees with
the charge.

**The criterion is *read directly by an outsider*, not *served*.** `README.md`
is on the list and 404s in production — it is the repository's front page and
somebody reads it as a document. That is what `MARKETING.md` is **not**: it is
source copy nobody reads as a document, which becomes public only when a person
copies a paragraph out of it into a post. It was briefly added here and has
been taken off again — see §48. `manual.html` and `product-tour.html` are the easiest to forget because
they are HTML and nothing greps them by habit.

**`README.md` and `guide.html` were added to that list later, and the README
was added because leaving it off had already cost something** (§46): it is the
front page, it is what somebody reads first, and it had fallen a year behind
while every document that *was* on the list stayed current. The original rule
said "not just this file and the README", which reads as though the README were
covered. It was not covered by anything. `guide.html` is the short
customer-facing page (§47) and goes stale the same way for the same reason.

**And the same rule for the wire contract: `docs/API.md`.** This was proved the
hard way almost immediately. API.md was written in §29's reorganisation and was
stale **one commit later** — §30's Phase 4 added per-route body limits, rate
limits and a non-leaking error handler, every one of which changes a status code
a caller sees, and none of which reached the document until it was audited
again. A doc describing a contract goes stale the moment the contract moves,
which is more often than a doc describing a feature.

**Two specific traps:**

- **`docs/manual.html` mirrors `USER-GUIDE.md` section for section, and drifts
  silently.** Both have 14 numbered sections with the same titles, so a
  matching table of contents reads as "in sync" while a section's *contents*
  are years apart. Diff the prose, not the headings.
- **Its CSS defines `.note.tip` and `.note.caution` and nothing else.** A
  `.note.warn` renders as an unstyled box that still looks plausible in a
  screenshot. Same for `.muted`, which does not exist there at all.

**Plan documents keep their original numbers.** `docs/archive/TIER-2.md` and
`docs/archive/OPERATOR-CONTROLS.md` are the reasoning as it stood, not live status —
their verification sections now say the test counts are the baseline at the
time of writing and point at §2 for the current figure. Editing a plan's
premises after the fact loses the reason the plan was shaped that way.

**Two facts that had never reached the user-facing docs at all**, because they
were consequences of decisions rather than features:

- **A delete cannot be undone**, and on a team it deletes for everybody.
  Tombstones discard the body (§26), so this is a property of the design, not a
  gap waiting on a bin. It is now stated where deletes are described, next to
  the role that prevents them.
- **Roles govern what you can do, not what you can see.** Every member still
  sees every module. Stated as an honest limit in the tour, the demo FAQ, the
  onboarding checklist and the tester note, rather than left to be discovered.

`DEPLOYMENT.md`'s environment matrix had none of the limit and alert variables;
it now carries them with defaults, and the signup gate's bypass order is
written out in full, because the *order* is the security property (§16, §20)
and a list of modes does not convey it.

---

## 28. The server served the whole repository

`express.static(__dirname)` published every file in the repo. On the live
deployment that meant `/CLAUDE.md` (74 KB of these notes), `/DEPLOYMENT.md`,
`/docs/BETA.md` (the operator runbook), `/package.json` and `/.git/config`.
No credentials were in any of them — that was checked, not assumed — so this
was disclosure, not a breach. The one that could have been a breach:
**`/data/store.json`**. It is gitignored so it never shipped, but a deployment
that lost `MONGODB_URI` falls back to the file store, and would then have
served every customer's records on a guessable path.

**Why it survived this long is the part worth keeping.** Two behaviours hid it
from exactly the probe you would run:

- **Linux is case-sensitive.** The obvious guess, `/claude.md`, does not match
  `CLAUDE.md`. It missed the file entirely.
- **The SPA catch-all answers everything.** A path that matched no file fell
  through to `app.get('*')`, which returned **200 and the app shell**. So
  `/claude.md`, `/cla` and `/totally-made-up-path` all looked identical to
  `/some/real/route`. "No such file" and "found the app" were indistinguishable
  from outside, and nothing on the site 404s to contradict you.

That is why this was found by reading `server.js` rather than by probing it,
and why the smoke test now asserts **content, not status**.

### What replaced it

Three explicit lists — `ASSET_DIRS` (`css`, `js`, `fonts`, `icons`),
`PUBLIC_ROOT_FILES` and `PUBLIC_DOCS` — and nothing else is reachable.

- **The extensionless aliases are load-bearing.** `express.static`'s
  `extensions: ['html']` went with the wildcard, and it is what served
  `/privacy` and `/terms` — the URLs on Google's OAuth consent screen. Losing
  them silently would un-publish the consent screen. Generated from the
  `.html` entries rather than hand-listed, so the two cannot drift.
- **`docs/manual.html` and `docs/product-tour.html` stay public and their
  paths are frozen.** They are customer-facing and the URLs may already be in
  somebody's inbox. Everything else under `docs/` is now unserved, which is
  what makes internal docs private **by construction rather than by
  obscurity** — the thing the doc reorganisation was going to have to work
  around.
- **Cache headers had to come along.** `sw.js` must stay `no-cache` and
  `.woff2` immutable; those lived in the wildcard's `setHeaders` and would
  have been dropped silently. A stale service worker is a bad way to find out.

### The catch-all now 404s anything that names a file

Routing here is entirely hash-based (`#/m/<id>`), so the server never needs to
answer an extensioned path with the shell. Serving 200 + 40 KB of HTML for a
missing icon was both wasteful and the thing that made the exposure invisible.

**`path.extname()` alone is not enough, and this is the trap.** It returns `''`
for `/.git/config` and `/.env`, because those basenames carry no extension — so
an extension-only test leaves precisely the dotfile paths this exists to close.
The dot-segment check is the other half. Removing it looks like tidying and
re-opens `/.git/`.

### Verification

Eight paths asserted unreachable in `tests/smoke.mjs`, checked against the
broken state per §9: on the pre-fix server the new block fails **seven times
with byte counts** (`HTTP 200 exposed internal working notes (73790b)`).
`/.env` warns rather than fails there, honestly — the file does not exist
locally, so it fell to the shell.

The assertion is **content-based on purpose**. A status-only check would pass
against the old server for every path the catch-all answered, which was all of
them. `scope.js`, `tour.js`, `legal.css` and `sw.js` were also missing from
`ASSETS`; an allow-list makes that gap load-bearing, so they are covered now.

**No `CACHE_VERSION` bump.** Nothing precached changed — `server.js` is not in
the app shell.

**Trap hit while testing this:** §4's `pkill -f "[s]erver\.js"` rule. The
bracket protects the pattern from matching itself, but the compound command
*also* contained `git stash push -q server.js`, so pkill matched the shell
running it and killed the job mid-way, leaving the stash unpopped. Kill by
recorded PID when the command has to mention the file.

---

## 29. How the documentation is organised

§27 fixed what the documents *said*. This fixes what a newcomer can *tell about
them* — which is a different failure, and the one that bites at handover.

**Status is declared, never inferred.** Git dates cannot carry it: §27's pass
touched every file on one day, so last-modified says nothing. Three places, and
the difference is the whole scheme:

| Where | Kept true? |
|---|---|
| `CLAUDE.md` | yes — a section per change |
| `docs/` | yes |
| `docs/archive/` | **no, deliberately** |

Lifecycle lives in the **directory**, so it is visible in a file listing before
anything is opened; every file also carries a one-line banner, so opening one
directly says the same thing. `docs/README.md` routes by task and audience.

**The rename is the substance, not tidiness.** `docs/ARCHITECTURE.md` →
`docs/archive/SCALING-OPTIONS.md`. It was an Options A–E deliberation under a
name that promises current reference, and it was **actively misinforming**: §1,
*"Where we are today"* — the first thing a new engineer reads — had rows keyed
`userId` (they are `wsId`), three roles (there are five), *"workspaces are still
per-account, deliberately"* (shared workspaces shipped four stages later), and a
16 MB document ceiling that per-record sync removed.

**The detail worth keeping:** §27's own pass had patched that file's *proposal*
sections — Option B lists all five roles correctly — while leaving "where we are
today" untouched. The document ended up describing the future more accurately
than the present. That is what patching a historical document in place does, and
it is the argument for freezing rather than maintaining. The known-false list is
in `docs/archive/README.md` so nobody has to rediscover it.

**Frozen does not mean deletable.** A plan records the options rejected and the
cost that made something not worth building. None of that survives in the code,
and it is exactly what is needed before reversing a decision.

### `docs/API.md`

The biggest single blocker to anyone extending the backend, since the contract
existed only in `server.js`.

**The route count lives in API.md and nowhere else**, and this section learned
that the hard way: it was written as "43 routes", repeated in `docs/README.md`,
and both were stale two phases later at 47. That is this section's own thesis
(a number written in a second place is a number that goes stale) failing
against the section that states it.

It **routes rather than restates**. Each section points at the `CLAUDE.md`
section holding the reasoning instead of re-explaining it, because a second
copy is what drifted in the `manual.html` case (§27). What it does state
directly is the wire contract: the two clocks, the wire-item shapes, the
rejection envelope (`reason` / `absent`), and the bypass order — which is a
security property and reads as a list of modes if written casually.

### `CLAUDE.md` has a topic index now

Sections are numbered in build order and several are named for the stage that
produced them — "stage C", "beta stage 2" — which is meaningless to anyone who
was not there. You could not find "how do permissions work" without knowing it
was Stage C.

**The numbers do not change.** Renumbering would break every cross-reference in
this file and in the others. The index maps topic → section and leaves the
numbering alone.

### Deliberately not written

Recorded so they are not mistaken for oversights:

- **No `SECURITY.md`.** The model is real but lives across §5, §13, §16, §17,
  §20, §21, §28 and §3's invariants. A consolidated copy becomes a second source
  that disagrees within a quarter. If it is ever wanted it should be a **map**
  into those, not a re-explanation.
- **No changelog** — git history plus these sections carry it.
- **No architecture document** — §1, §3, §10 and §11 are it. The file that was
  named `ARCHITECTURE.md` never was one.

### Two things this reorganisation depends on

- **Internal docs are private by construction** (§28), not by obscurity. Only
  `docs/manual.html` and `docs/product-tour.html` are served, and **their paths
  are frozen** — they are customer-facing and the URLs may already be in
  somebody's inbox. Verified: every other file under `docs/`, including the two
  new ones, returns 404.
- **`.claude/skills/verify/SKILL.md` said "Playwright, 24 journeys"** while the
  suite had grown past 70. It was unindexed, so nothing walked it. It now points
  at §2 for counts rather than carrying its own — a number written in a second
  place is a number that goes stale, which is this section's thesis in one line.

---

## 30. Security audit — COMPLETE (phases 1–5)

**This section is the record of what the audit found and changed.** The plan
and the reconnaissance are in `docs/archive/SECURITY-AUDIT.md`, which is frozen.
All five phases shipped; the per-phase findings are below.

> **A later pass exists: §61.** This audit ran against **42** routes; there are
> 55, and three credential classes arrived afterwards. §61 covers that ground
> and re-raises none of the FALSE findings below. Nothing here is retracted by
> it except row 12, which §38 had already superseded.

**Read the *false* findings as carefully as the real ones.** Four things the
checklist asked for were already correct or did not apply here, and a later
reader working from a generic checklist rather than this source would "fix"
them and make the code worse. They are marked throughout.

A full-application audit against a checklist supplied from outside, **checked
against the code rather than accepted** — §21's treatment, where six of eight
claims held and two did not.

### Phases

- ✅ **1 — Auth and session.** Shipped — see below.
- ✅ **2 — Injection and data integrity.** Shipped — see below. Three of the
  four suspicions were **false**; the fourth is a guard, not a fix.
- ✅ **3 — XSS.** Shipped — a real stored-XSS vector, closed. CSP moved to
  Phase 4, where the other headers land.
- ✅ **4 — Network hardening.** Shipped — see below. The SSRF finding was
  **false**; the rate-limit design changed once the tests disproved it.
- ✅ **5 — Supply chain and operational.** Shipped — see below.

### The checklist assumed a different stack, and that is load-bearing

Ticking a mitigation that was never applicable is worse than no tick. There is
no Mongoose, no `axios`, no template engine, no build step and no frontend env
vars. Four production dependencies: `express`, `cookie-parser`, `jsonwebtoken`,
`mongodb`.

**"Verify ID tokens with `google-auth-library`" does not apply.** This is the
authorization-code flow: the server exchanges the code with Google's token
endpoint and calls `/oauth2/v2/userinfo` **server-to-server over TLS**. No
client-supplied ID token is ever accepted, so there is no signature to verify.
Adding the library would add a dependency and change nothing.

### Already correct — do not "fix" these

- **OAuth state**: 128 bits of CSPRNG, httpOnly, 10 minutes, compared and cleared.
- **Cookie attributes**: all five cookies carry httpOnly + sameSite=lax + secure
  in production.
- **`SESSION_SECRET` falls back to `crypto.randomBytes(32)`** — random, not a
  static default. Restarting without it signs everyone out, which is the right
  trade and not a vulnerability.
- **CORS: no middleware is installed**, so no `Access-Control-Allow-Origin` is
  ever emitted. **Absence is the mitigation** — installing a permissive `cors()`
  would be the regression.
- **CSRF**: `sameSite=lax` plus a JSON-only API (no form-encoded parser) covers
  the state-changing routes; OAuth has its own nonce.
- **BOLA/tenancy**: already the core invariant (§5) — session-derived scoping,
  404 not 403, eight isolation tests that assert the attack.
- **NoSQL on live paths**: `/api/org/join` coerces with `String(...)`, invite
  preview uses `req.params` (always a string), the access-request listing passes
  no query parameter into a filter.
- **Secrets**: `.env` gitignored; a history scan for Google/Mongo/Telegram/OpenAI
  credential shapes returns only documentation placeholders.
- **`npm audit`**: zero vulnerabilities, lockfile committed.

### Findings marked *unknown* are unknown on purpose

Prototype pollution, mass assignment and the XSS sweep are not yet assessed.
Guessing a severity before looking is how an audit ends up reporting its own
assumptions back to itself.

### Phase 1 as built

**The finding: an unverified Google address could create an account.** Accounts
are matched by email and nothing else, so an address the holder has not proved
they control is an account-takeover vector — sign in with somebody else's
address and be handed their workspace. `/oauth2/v2/userinfo` returns
`verified_email` and it was read straight past.

**Rejects a stated `false`; does NOT reject absence.** Those are different
facts and the failure modes are asymmetric. A stated false is the attack.
Absence means Google renamed a field, and failing closed on that would lock
every user out of a working CRM for a reason nobody could diagnose from
outside. Absence is logged loudly instead. This is *not* a contradiction of
§19's "absence is not an answer" — there, absence was being read as a positive
signal; here it is read as "Google did not say", with the mitigating fact that
the whole response arrived server-to-server over TLS.

**The callback had no test at all**, which is why the bug survived: it cannot
be driven without Google on the other end. `GOOGLE_TOKEN_URL` and
`GOOGLE_USERINFO_URL` are now overridable, so `tests/oauth.test.mjs` stands up
a fake Google and exercises the **real handler** — state check, verification,
gate, upsert, session. Overriding them needs environment access, which is
already the bar for `GOOGLE_CLIENT_SECRET`.

That seam also bought the first tests for **CSRF on the callback**: a
mismatched state and a callback presenting no state cookie at all are both
asserted refused. Neither had coverage before.

Checked against the broken state per §9: removing the verification check makes
**two tests fail**, and on that server the unverified address really does get
an account — asserted by listing users as an admin, not merely by the redirect.

**`/auth/dev` passed `req.body.beta` / `req.body.invite` uncoerced** into
`getBetaCode` / `getInvite`, which build `{ code }` shorthand filters. An object
like `{"$ne": null}` would reach MongoDB as an operator. Dev-only, so defence in
depth rather than a live hole — but it is the seam every signup test drives.
Route params and cookies are strings already; **a JSON body is the one place a
non-string gets in**, which is the rule Phase 2 sweeps for exhaustively.

**`authFailure()` logs one line per failure.** A refused signup, a state
mismatch and a disabled account all redirected silently before, so a burst was
invisible. Deliberately never logged: the beta code, the invite code, the OAuth
state and the session token — all bearer credentials (§13, §16). The email is
included because it is what makes a burst diagnosable and it is already stored
on the account.

### Phase 2 as built — mostly a list of things that were already fine

The valuable output here is the **negative** result, recorded so nobody
"hardens" any of it later by reading a generic checklist rather than the source.

**No server-side JavaScript execution.** `$where`, `mapReduce`, `$function`,
`$accumulator` and `eval` do not appear anywhere in `server.js`.

**NoSQL injection is not reachable — swept exhaustively, not spot-checked.**
Filters are built as `{ email }` / `{ code }` / `{ id }` shorthand, so the
control is coercion at the call site. Every one was walked:

- **`req.params` is always a string** in Express, and seven store calls take one
  directly. Nothing to do.
- **`req.query`** is coerced at every use (`String(...)`, `Number(...)`) or
  compared in a way that fails closed — an array `state` is `!==` the cookie and
  is refused.
- **`req.body`** was the one real gap, and it was `/auth/dev`'s `beta`/`invite`,
  closed in Phase 1. Everything still uncoerced is validated against a fixed
  allow-list *before* use (`TEAM_ROLES.includes(role)`, `mode`, `status`,
  `decision`) — an object fails `includes` and fails `!== 'open'`.

**Mass assignment is not present.** Both role-changing routes build an explicit
patch object; neither spreads `req.body`. `PATCH /api/admin/users/:id` allows
exactly `role` (from `TEAM_ROLES`, with `platformAdmin` gated on the caller
already being one) and `disabled` (`typeof === 'boolean'`). There is no
Mongoose, so the `findByIdAndUpdate(req.body)` shape the checklist warns about
has no equivalent here.

**Prototype pollution: probed, and nothing was exploitable.** A record pushed
with `__proto__`, `constructor` and `prototype` as field keys — through both the
create path and the merge path — polluted nothing, and `/api/me` did not grow a
property. Three unrelated facts happen to make that true:

1. **There is no `for...in` anywhere in the codebase**, so an inherited property
   is never enumerated.
2. **Every merge except one uses spread**, which *defines* rather than
   *assigns* and so never fires the `__proto__` setter. That covers
   `docShell`, `importState` and the `DB.put` paths.
3. JSON serialisation drops the payload before it reaches storage.

**A guard went in anyway, and the reason is worth keeping.** Safety that emerges
from three unrelated properties is safety a future refactor removes by accident,
and `mergeFields` is the *one* place that does `obj[key] = value` with a
client-chosen key. Making it recursive to merge nested values is the obvious
next extension, and it is exactly what would make this live. `UNSAFE_KEYS`
makes the guarantee local and testable rather than emergent. The test is
written against the refactor, not against today's code.

**The UI cannot produce such a key regardless**: `slug()` turns `__proto__` into
`proto`. Only a hand-written API call or a hand-edited backup carries one.

**One tidy-up:** `req.body.name` reached `upsertUser` uncoerced. Not a filter and
not injection — but an object stored as an account's name renders as
`[object Object]` on the admin screen, for a person nobody can then identify.

### Phase 3 as built — the audit's real finding

**Values were escaped from the start. Identifiers were not.** Every record
value, module name, field label and business name already went through `esc()`
or `fmtValue`. But ids did not, because they are normally `uid()` output and so
read as obviously safe:

```
<tr data-record="${r.id}">            table row
<div class="kanban-card" data-record="${r.id}">
<a href="#/m/${m.id}">                sidebar nav, and the dashboard's recents
<input id="${id}">                    the record form, id = `f-${field.key}`
<option value="${r.id}">              relation pickers
<button data-id="${u.id}">            the admin account rows
```

**An id is not server-generated in every path, and that is the whole finding.**
`importState` writes whatever ids a backup file carries, and `/api/sync` does
`String(item.id)` without restricting characters, so a colleague pushing by
hand chooses their own. That is **exactly the threat model `safeHref` already
names** — "record values arrive from CSV imports and shared backups" — applied
to a field nobody had thought of as a value.

Proven, not argued: a record whose id is
`" onfocus="window.__pwnedById = true" autofocus x="` rendered a row whose
attribute list came back as
`["data-record", "onfocus", "autofocus", "x", "tabindex", …]`. Two attributes
that were never in the template. All three tests fail on the pre-fix code.

**`slug()` is why this stayed theoretical in the UI** — it turns `__proto__`
into `proto` and would strip a quote too, so no amount of typing in the app
produces one. Only a restored backup or a hand-written push does. The same
sentence, almost word for word, as §30's prototype-pollution note: the UI is
not the boundary, the API is.

**What was checked and was already right:** `toast()` uses `textContent`, not
`innerHTML`; `confirm()` is native and always plain text; every remaining
unescaped attribute interpolation is an internal constant (`CURRENCIES`,
`FIELD_TYPES`, `MODULE_COLORS`, `Cloud.status`) that no user can reach. The
sweep flagged 267 interpolations and all but these six were either escaped
already or structurally incapable of carrying markup.

**`CACHE_VERSION` bumped to `crmbuilder-v23`** — `js/app.js` is precached, so
§3's rule applies.

### CSP is Phase 4, deliberately

It is a header, and it should land with the other headers rather than half in
each commit. It is also not free here: `script-src 'self'` needs the **two**
inline `onclick` handlers in `js/app.js` removed and `index.html`'s inline
`<script>` block either extracted or hashed, and `style-src` would need
`'unsafe-inline'` for the 14 inline `style=` attributes unless those move too.
Bounded work, but work — and it is defence in depth, which is worth having
*after* the escaping is right rather than as a substitute for it.

### Phase 4 as built

**Headers are hand-rolled, not `helmet`.** Four production dependencies is an
asset on a shared free tier, and this is a dozen lines that need no supply
chain behind them. CSP, `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy`, `Permissions-Policy`, and HSTS in production only.

**`script-src 'self'` cost three changes before it could ship**, and with any
of them missed every page would have broken on deploy:

- the inline `onclick="event.stopPropagation()"` on link cells — replaced by
  the row handler ignoring clicks that land on an `<a>` (§4's rule, same
  behaviour, no inline script);
- `onclick="location.reload()"` on the startup-failure button;
- `index.html`'s inline `<script>` → **`js/boot-icons.js`**. A file rather than
  a CSP hash on purpose: a hash breaks silently on a whitespace change, and the
  symptom is icons quietly not appearing.

**`style-src` keeps `'unsafe-inline'`, deliberately.** 14 inline `style=`
attributes carry genuinely dynamic values — a module's colour, a meter's width.
Inline *style* cannot execute script, so this buys most of the protection for
none of the churn. Moving them to CSS custom properties would close it and is
not worth doing today. Say that rather than implying the CSP is airtight.

**Body limits are per route now.** 64 KB by default; `/api/sync` and
`/api/data` opt into 8 MB because a push legitimately carries a workspace.
The old single global 8 MB handed an anonymous caller a cheap way to make the
process allocate on *any* endpoint.

**The rate limiter got narrower after the tests disproved the first design.**
It started on `/auth/dev` and the callback at 20/min, and **the Node suite
failed** — which was the limiter working, and the design being wrong:

- **`/auth/dev` is not limited.** It 404s in production, so a limit there
  protects nothing real while throttling the seam every test drives. A limit
  loose enough for the suite would be too loose to matter anyway.
- **Sign-in generally is not limited, because there is no password to guess.**
  Google owns authentication. The beta and invite codes are the only guessable
  secrets and trying one costs a full OAuth round trip (§20) — the flow is
  already its own rate limiter.
- **The callback keeps a generous 60/min** for a different reason: each call
  makes the server perform a token exchange with Google, which is outbound work
  an anonymous caller can trigger.
- **`/api/access-request` at 5/min is the one that earns it** — the queue an
  operator works by hand is otherwise trivially floodable, and the 500-row
  ceiling is a backstop, not a rate.
- **`/api/sync` is never limited.** A client with a large workspace or a week
  offline legitimately pushes hard, and throttling that turns a slow sync into
  lost work.

**`trust proxy` was already 1, and that is load-bearing.** Without it `req.ip`
is Render's edge address, every client shares one bucket, and the limiter
becomes a self-inflicted outage rather than a defence. Checked before writing
the limiter, not after.

**In memory means per instance.** On a single free-tier service that is the
whole deployment. On a multi-instance one the effective limit multiplies by the
instance count — a shared counter needs a Mongo round trip per request, which
costs more than the attack it prevents at this size.

**An error handler that cannot leak.** Express's default puts the stack trace
in the response body whenever `NODE_ENV` is not exactly `production` — one
environment variable away from publishing absolute paths to anyone who can
provoke a 500, and the deployment that most needs the guard is the one that got
its env wrong. The client now gets a status and nothing else; the detail goes
to the log.

### The SSRF finding was false

`FEEDBACK_WEBHOOK_URL` is read from `process.env` and has **no runtime setter** —
there is no admin route that writes it. So no user input reaches an outbound
request, and changing it requires environment access, which is already the bar
for `GOOGLE_CLIENT_SECRET`. Recorded as false rather than "mitigated", and
deliberately *not* bounded to non-private addresses: the webhook capture test
points at `127.0.0.1`, so a block would need a bypass that weakens it to
nothing.

### A tour flake, finally diagnosed

Recorded because it was mysterious for three phases and is now not. The
intermittent failure in *"runs all six steps"* is
**`step 3 card covers its own highlight`** — `coversTarget` true when it must be
false. The tour positions its popover relative to the step target, and step 3's
`before` hook forces a sorted table (§7); when that async re-render lands after
the card is placed, the card can end up over the ring it points at.

It is a real product bug, not a test artifact — a user can see the card cover
the thing it is describing — and it is **unrelated to security and predates all
of this work**. The earlier guesses about it (shared-server state, CPU load)
were wrong and are retracted. Not fixed here, because Phase 4 is network
hardening and mixing the two would muddle the commit.

**Superseded by §35, which found this description wrong in two ways.** It was
not intermittent — step 3 overlapped on 20 runs out of 20 when measured at the
moment the card is declared ready. And "cosmetic" undersold it: the card
covered the row the step was describing, every time, for every user.

### A data-loss window found while verifying this phase

Not network hardening, and recorded separately for that reason — but it was
destroying test runs, and it would have destroyed a workspace.

`FileStore.save()` did `fs.writeFileSync(file, JSON.stringify(store))`, which
**truncates the target and then fills it**. Two windows follow. A reader during
the write sees a torn file: that is what made `tests/migration.test.mjs` fail
**four runs in six** on a `JSON.parse` of a truncated store, and it was
pre-existing — verified by stashing this phase and reproducing on the old code.
The second window is the one that matters: a crash *during* the write leaves the
file truncated **permanently**, and this is the store a deployment falls back to
when `MONGODB_URI` is unset. That is every customer's data on that deployment,
and Render's free tier sends SIGTERM to spin the service down regularly.

Now a temp file plus `renameSync`. rename(2) is atomic within a filesystem, so a
reader gets the whole old file or the whole new one, and an interrupted save
leaves the previous copy intact. **The temp file must sit beside the target** —
a rename across filesystems is a copy, and a copy is not atomic. Eight
consecutive migration runs clean afterwards, against four failures in six
before.

### Phase 5 as built — CI gates

Two jobs, both in `.github/workflows/test.yml` under `security`.

**`npm audit --omit=dev --audit-level=high` is the blocking gate.** Production
dependencies only, and high or critical only. A Playwright advisory should not
block a deploy of the server, and there are exactly four production
dependencies to keep clean. A second, never-failing `npm audit` prints
everything for the record.

**gitleaks runs from a pinned, checksummed binary — not the action.**
`gitleaks/gitleaks-action@v2` wants a `GITLEAKS_LICENSE` for organisation-owned
repositories, which is a future outage on somebody else's terms. Pinning the
version *and* verifying the SHA-256 means CI runs exactly what was reviewed
here; both directions were tested, including that a wrong digest stops the job.

**Three details that would each have made the scan worthless:**

- **`--redact` is not optional.** Without it a finding prints the secret into
  the build log, and on a public repository that log is public. A scanner that
  publishes what it found is worse than no scanner.
- **`fetch-depth: 0`.** gitleaks scans git *history*; the default shallow clone
  would scan one commit, find nothing, and report clean. That is a false pass,
  which is worse than no scan because it looks like coverage.
- **Non-blocking (`continue-on-error`).** A scanner outage should not stop a
  deploy — but the result is still on the run, so it cannot be missed.

**Result on this repository:** 47 commits scanned, no leaks. That is an
independent confirmation of the hand-rolled credential-shape grep used during
reconnaissance, which is the point of running a real tool rather than trusting
my own regex.

**Confirmed on GitHub Actions**, not only locally: run #53 on `f51656d` is green
across all three jobs, with *Dependency and secret scan* finishing in 7s. The
pinned-binary approach costs nothing in wall time, which was the other reason to
prefer it over an action that needs a licence check.

### What the audit found, in one place

| # | Claim | Verdict |
|---|---|---|
| 1 | Unverified Google address could create an account | **REAL** — fixed, Phase 1 |
| 2 | Identifiers unescaped into HTML attributes | **REAL** — stored XSS, fixed, Phase 3 |
| 3 | No security headers | **REAL** — fixed, Phase 4 |
| 4 | Global 8 MB body limit on every route | **REAL** — fixed, Phase 4 |
| 5 | No rate limiting | **PARTLY** — added where it earns its place, Phase 4 |
| 6 | `/auth/dev` passed a body value into a Mongo filter | **REAL** (dev-only) — fixed, Phase 1 |
| 7 | Auth failures left no trace | **REAL** — fixed, Phase 1 |
| 8 | `FileStore.save()` could truncate the store | **REAL, and not on the checklist** — found while verifying Phase 4 |
| 9 | NoSQL injection | **FALSE** — swept every call site, Phase 2 |
| 10 | Mass assignment | **FALSE** — both PATCH routes build explicit patches |
| 11 | Prototype pollution | **FALSE** — probed, not exploitable; guard added anyway |
| 12 | SSRF via the feedback webhook | **FALSE** — env-only, no runtime setter. **Superseded by §38:** the workspace webhook IS a runtime setter, and is a deliberate outbound sink behind `lib/safe-fetch.js` |
| 13 | Verify Google ID tokens | **DOES NOT APPLY** — authorization-code flow, no client-supplied token |
| 14 | Permissive CORS | **FALSE** — no CORS middleware exists; absence is the mitigation |
| 15 | Static fallback session secret | **FALSE** — falls back to `crypto.randomBytes(32)` |

Eight real, five false, one inapplicable, one partial — and the one that would
have cost the most (#8) was not on the checklist at all. That is the argument
for reading the source rather than working the list.

### Left deliberately undone

- **`style-src 'unsafe-inline'`** stays, for 14 dynamic `style=` attributes.
  Inline style cannot execute script. Closing it means CSS custom properties
  throughout, and it is not worth doing today (Phase 4).
- **No `SECURITY.md`.** The model spans §5, §13, §16, §17, §20, §21, §28 and
  §3's invariants; a consolidated copy becomes a second source that disagrees
  within a quarter. `docs/README.md` records this decision.
- **The rate limiter is per instance.** A shared counter needs a Mongo round
  trip per request, which costs more than the attack it prevents at this size.
- **The E2E "flakiness" was not flakiness — see §32.** It was the E2E store
  growing across runs, and it is fixed. The guided tour's *card covers its own
  highlight* was a separate, real bug and is **also fixed now** — §35.

  The guided tour's *card covers its own highlight* is **fixed** — see §35,
  which also corrects the "intermittent" and "cosmetic" framing above.

  **The recurring mistake was mine, twice:** Playwright wipes `test-results/`
  at the start of every run, so re-running to "check if it reproduces" destroys
  the trace of the failure you wanted to read. Read the trace **first**.


---

## 31. A row stamped in the past never syncs, and the app says "Synced"

Found from a live deployment, not from the tests: the admin dashboard said
**12 records** while the device showed **214**, and both were telling the truth.

**The two counts were never the disagreement.** `scripts/inspect.mjs` (added for
this) showed `orgId` and `wsId` agreeing on every row, and the server holding
**12 live records and 214 tombstones**. The client had 214 live rows the server
had never received. My first hypothesis — a `wsId`/`orgId` divergence from a
refused `migrateToOrgWorkspaces()` — was wrong, and the data disproved it.

### The mechanism

`localChanges(since)` selects rows with `rowClock(r) >= since`, where `since` is
the push watermark. And the watermark **only ever moves forward**:

```js
const highWater = local.highWater || Date.now();   // seeded from `since`, only grows
if (!out.readOnly) Scope.set(PUSHED, String(highWater));
```

So a row written with an `updatedAt` **older than the last successful push** is
invisible to every push that follows, permanently. The sync request still
succeeds, so the status chip reads *Synced*. Silent, and indistinguishable from
working — which is why it survived: nothing errors, nothing retries, and the
count that would have exposed it lives on a screen nobody cross-checks.

**Demo data walks straight into it** (`js/app.js`): records are stamped
`now - i * 60000` so "recent activity" has a believable order. Load it after any
earlier sync and every row is already below the watermark.

### The other path, which matters more

`js/app.js`'s eviction recovery calls `importState(snap, { mode: 'adopt' })`,
and `stamp` defaults to **false** — so rows recovered from the localStorage
snapshot keep their original clocks. Same bug, on the one path whose whole job
is recovering from data loss.

**Swept every other write.** The record form, kanban drag, CSV import, field
purge and currency relabel all stamp `now`. The user-facing backup restore
passes `stamp: true` and re-dates deliberately — somebody had already understood
this hazard there and fixed it locally rather than generally.

### The fix, and why it lives in `DB.put`

Lower the watermark to the row's own clock when a backdated row is written. The
next push then includes it, and re-sending the rows above that point costs
nothing: the server's tie-break skips what it already has, which is the same
reason client selection uses `>=` rather than `>` (§10).

`DB.put` is the one place every write passes through. Putting the guard at the
call sites instead means the next path that backdates a row re-opens the
bug — and there had already been two.

**Trap hit while fixing it:** the first attempt spliced the helper into the
middle of `adoptLegacy`'s object literal. `node --check` passed — it was still
valid JavaScript — and the app broke at runtime instead, with onboarding
failing to create modules. A syntax check is not a placement check.

Guarded by *"records stamped before the last push still reach the server"*,
which fails on the unfixed code. `CACHE_VERSION` bumped to `crmbuilder-v25`.

### What this does not fix

Rows already stranded on a device stay stranded until something rewrites them —
the watermark is only lowered when a write happens. For the deployment that
surfaced this, the stranded rows were demo data and the real records were safe
on the server, but that was luck rather than design.


---

## 32. The E2E suite was not flaky. Its store was growing.

Across §30's phases, **five different tests** failed once each and then passed
in isolation: the guided tour, both team-workspace journeys, the JSON backup
round-trip, and the sign-in upload. I called it load-sensitive timing and
moved on. That was wrong, and the pattern — a *different* test each run, all
passing alone — was the clue I misread.

`playwright.config.js` pointed `DATA_DIR` at a fixed `./data/e2e` and never
cleared it. The API and signup suites each `mkdtemp` a throwaway directory;
only this one persisted, so it accumulated every account and record from every
run that had ever happened. By the time I looked: **9.7 MB, 1,972 users, 1,965
orgs, 11,720 rows.**

And `FileStore.save()` rewrites the **whole file on every write** (§30). So
every `DB.put` in every test was serialising and rewriting all 9.7 MB. The
suite had drifted from 4.0 minutes to 6.5, and whichever test happened to sit
closest to its timeout lost.

**Clearing the directory took a full run from 6.5 minutes back to 4.0, and
77/77 green.** `playwright.config.js` now removes it before each run — except
when `BASE_URL` is set, because then the data belongs to a deployment and is
not ours to delete.

**The lesson is about the diagnosis, not the fix.** "Different test each time,
passes in isolation" reads as flakiness and sounds like something to tolerate.
It was a resource leak with a monotonic cost, and the giveaway was in the
timings I kept printing and not reading: 4.4, 4.3, 4.5, 5.3, 4.8, 6.8, 6.5.
A suite that is getting *slower* is not flaky, it is accumulating something.


---

## 33. Two numbers that were both right, and what tombstones actually cost

Reported from the live deployment: Settings said **214 records** and the button
below it said **Remove sample data (220)**. Nothing was wrong with the data.

`demoCount` totals demo records **and** demo modules — 214 + 6 — because that is
what pressing the button removes. The subtitle two lines above counts records
only. Both correct, adjacent, and unlabelled, so they read as a discrepancy;
after §31 had produced a real one, that is exactly how it was reported.

**Not fixed by counting records only.** That understates what a destructive
control does, which is the worse error. The button now names its parts:
*Remove sample data (214 records, 6 modules)*. Both halves are conditional,
because a demo module the user has added their own record to is **promoted**
rather than deleted (§11) — so a workspace can hold demo records whose modules
are no longer samples, and the label has to survive that.

Guarded by an assertion inside *"the demo can be kept on purpose, and removed
later"* that reads the two numbers out of the subtitle and requires the button
to name both. It fails on the old label, whose bare total is neither of them.

**A trap while writing it, and it is §4's.** `.page-head .subtitle` exists on
every screen, so reading it straight after `page.goto('/#/settings')` sampled
the *previous* page and the regex matched nothing. The test failed on the
broken code for a reason that had nothing to do with the label — which would
have passed as verification and proved nothing. Wait on the rendered text
first.

### What a tombstone costs, measured

The same report asked whether tombstones are recoverable and whether they take
space. **No, and yes** — and the second answer was bigger than expected.

A tombstone is 346 bytes: ids, both clocks, `deletedOn`, and `doc: null`. On
that deployment, 428 record tombstones and 18 module tombstones came to
**151 KB of the workspace's 278 KB — 54%.** The counts say why: 428 = 4 × 107
and 18 = 3 × 6, so four demo-data cycles and three module wipes. Each
load-then-delete round leaves 107 permanent rows for 180 days, and the next
load mints fresh ids rather than reviving them, so the cost compounds.

Nothing is broken. The rows are doing the job tombstones exist to do (§26), and
the space returns when the window passes. But **the storage meter cannot tell a
heavy tenant from a scarred one**, and the §25 alerts fire on the number that
conflates them — the two want opposite responses from an operator.

So `scripts/inspect.mjs` now reports storage composition: live bytes against
tombstone bytes per organisation, the oldest tombstone, and the date the first
of it expires. Measured with `$bsonSize` on the same grouping key the
Organisations table uses, so the two are comparable rather than merely similar.
It also prints each org's `createdAt`, which is what dates an empty org against
the fix that should have tidied it — an orphan predating `tidyVacatedOrg` (§25)
is history, not a live bug, and there was no way to tell them apart.

**The trap in the file-store half:** the loader strips `doc` from every row,
which is what keeps this script from ever holding record contents. Measure
after that and every live record reports as tombstone-sized and the whole split
becomes meaningless. Sizes are taken before the strip; the fixture proves it,
with live rows at ~454 B against tombstones at ~338 B.

Shortening the 180-day window was considered and **rejected**: it is the time an
offline device has to learn about a delete, and cutting it resurrects rows on
anyone who syncs rarely.

### The Organisations table now says which kind of large a tenant is

`usageByOrg()` returns `deadBytes` and `oldestDeletedAt` beside `bytes`, and
the panel renders a `78% reclaimable` qualifier under the size. `tombstoneDays`
rides on the body once rather than on every row — it is a deployment constant.

**Measured, never `deadRows / totalRows`.** That ratio is the same trap as
records × a constant (§17) in a new hat, and here it is wrong in the direction
that hurts: a tombstone is ~346 bytes and a live record several times that, so
a workspace that deleted half its rows is *not* half gravestones by size. The
test seeds four fat records against four stubs and asserts the byte share lands
**under 25%** — a count-derived figure reports 50% and fails.

**A qualifier on the number, not a column.** The table is already seven columns
wide, and the figure is meaningless without the total it qualifies.

**Silent below 10%.** Every workspace that has ever deleted anything carries
some; a `2% reclaimable` on every row is noise that teaches the eye to skip the
cell, which costs the reading the 50% case exists for.

**The tooltip says what it is, not only how much.** "Reclaimable" alone reads
as waste somebody should go and clear up, and there is no such button — the
rows are not recoverable and the space returns on its own (§26).

**Trap in the E2E test:** `/api/admin/platform` is cached 30s and **nothing
invalidates it on sync**, so a panel rendered straight after seeding can
legitimately show a table from before the tenant existed. The test requests
`?fresh=1` first — which rewrites the cache, not merely bypasses it — and only
then loads the screen.


---

## 34. The demo dataset, and the fixture that is not it

Two artifacts, and confusing them is the whole trap. The requirement arrived as
"expand the demo data to cover teams, roles, tombstones and meta counters", and
**three of those four cannot live in `js/demo-data.js`** — it is a client file
that seeds IndexedDB, and users, orgs, `doc: null` tombstones and the meta doc
are all server collections.

Worse, seeding tombstones client-side would make them **real**: demo rows go
through `DB.put` in the current scope, and a `u:<id>` scope syncs. §33 measured
what that costs — 428 tombstones from four demo cycles, 54% of a live
workspace's bytes.

| Artifact | Ships? | Carries |
|---|---|---|
| `js/demo-data.js` | yes, to every user | modules, records, relations |
| `scripts/seed-fixture.mjs` | no, developer/operator only | users, orgs, roles, tombstones, meta counters |

### The dataset (`js/demo-data.js`)

144 records across 8 modules — the six templates plus **Projects** and
**Invoices**, which exist because the old dataset could not show a custom
module at all (`loadDemoData` walked `TEMPLATES` and nothing else) and had no
relations.

**`scripts/gen-demo-data.mjs` is committed now.** §6 claimed a Python generator
that was never in the repo, so the one file nobody could hand-edit was also the
one nobody could regenerate. Seeded, so a re-run is byte-identical.

**Relations resolve in one forward pass**, keyed on `{ __ref: "key:name" }`,
because `relatedModule` and a relation's value are both runtime ids. A ref may
only point at a module seeded **earlier**; a forward reference resolves to
nothing, renders a blank cell, and throws nothing at all.

**Traps:**

- **`defaultView: 'board'` is silently wrong.** The token `app.js` checks is
  `kanban`. `board` reads correctly to a human, is accepted, and falls back to
  a table. It shipped that way in the first draft.
- **Weighted-random leaves board columns empty**, which reads as a broken board
  rather than a quiet week. Distributions are exact counts, shuffled.
- **Every count in `e2e.spec.js` that was really "what the demo seeded" broke
  when the dataset grew.** Three `6`s, an `18` (kanban cards) and a `40`
  (contacts) — and CI only ever reports the first, so they surface one at a
  time. They all read from the dataset now via a `DEMO` helper. The literal `6`
  for `.template-card` is correct and stays: that one really is about
  `TEMPLATES`.
- **Write the template's field keys, not invented ones.** The generator wrote
  `close` where Deals says `closeDate`, `status`/`assignee` on Tasks (which has
  a `done` checkbox and neither), and `company` on two modules that have no such
  field — plus select values outside their own options (`Urgent`, `Event`,
  `Cold outreach`, `Social`, `Unqualified`). Nothing throws: a key no field uses
  is ghost data (§22) that travels in every export and renders nowhere, an
  unfilled field is an empty column, and an out-of-range select value is a pill
  the dropdown cannot produce. The dataset before the rewrite was clean on every
  module, so this was a regression, and it was invisible until a record was
  rendered as VALUES rather than inputs (§36). `tests/demo.test.mjs` now asserts
  data keys against field keys in both directions, and every select value
  against its options.
- **Do not pre-seed a record without `_demo` to stage a promotion demo.** It
  would claim the user typed something they never did, and "`_demo` is on rows
  we seeded and never on rows the user typed" is what the whole discard
  algorithm rests on (§11).

### The fixture (`scripts/seed-fixture.mjs`)

Four orgs, six accounts covering every rung of the ladder, tombstones aged
2–176 days across the retention window, a second tenant so no org reads as
100%, and a deliberately empty placeholder org.

**File store only, and not behind a flag.** There is no MongoDB code path at
all. A script that creates users and orgs is one mistyped argument from writing
into a real tenant's database, and the cheapest way to make that impossible is
not to implement it. `inspect.mjs` may read Atlas because reading destroys
nothing; this may not write to it.

**Nothing asserts against the file.** `tests/fixture.test.mjs` boots a real
server against the fixture and asks the API. Hand-built shapes drift, and a
drifted one does not throw — it loads and is quietly wrong.

**Traps, and two of these were my own tests passing on bugs:**

- **A push heals a wrong meta counter.** `/api/sync` calls `refreshCounts()`,
  so a single accepted write rewrites the meta doc with the true figure. The
  counter test placed *after* the contributor test passed against a fixture
  seeded with a deliberately wrong count. It runs first now, and the ordering
  is the assertion. Same shape as §26's stamp trap.
- **Checking a pulled tombstone has no `doc` tests `wireItem()`, not the
  fixture.** The server strips the body from every deleted row on the way out,
  so that assertion passed against a fixture writing full bodies into its
  tombstones. Measured per-tombstone bytes instead.
- **`--clean` matched orgs by NAME, and deleted a real customer's workspace.**
  "Lumen Studio" is a plausible thing for a customer to call their own
  workspace; driven with a real owner in an org of that name, `--clean` removed
  the org and its 174 rows and reported success — leaving the account intact,
  which made it read as if nothing had happened. **A surviving member now
  vetoes removal**, whatever the org is called. Guarded by a test that fails on
  the name-only version.

### Running it, and the trap that has to be printed twice

Reported after a real attempt: the fixture was unrunnable from the docs. There
was no instruction that this is a **local** thing, no environment setup, and the
accounts existed only in the script's own output — so the only way to learn who
to sign in as was to run the thing you could not work out how to run.

`docs/BETA.md` § *"Standing up a demo workspace, locally"* now carries three
runnable commands, the env table and the six accounts with their roles.

**`MONGODB_URI` is the trap, and it fails silently.** With one set — including
from a `.env` the server picks up — the server reads Mongo and sees nothing the
fixture wrote: a working app over an empty workspace, no error, no clue. So
`MONGODB_URI=` is on the command line in the doc **and** in the line the script
prints when it finishes. The script cannot know what the server will later be
started with, so it prints the whole command rather than a hint.

**The account list belongs in both places for the same reason.** A doc gets read
before the run and the script's output gets read after it, and the person who
needs it may only see one. It prints roles now, and no longer omits the second
tenant's owner — the account you need to see that no org reads as 100%.

---

## 35. The tour card was not intermittently wrong. It was always wrong.

`step N card covers its own highlight` had been open since §30, filed as an
intermittent cosmetic flake. Both halves of that were wrong, and the measurement
is what showed it: driving the tour at the test's own viewport and reading the
geometry the instant the card is declared ready, the old code overlapped at
**step 3 on 20 runs out of 20.** The new code: 0 out of 20.

**What was intermittent was the observation, not the bug.** The card was always
placed over the ring; whether the E2E assertion caught it depended on whether
some later reflow nudged it clear before the test looked. That is also why it
appeared to "move between steps" — a report of step 5 and a local reproduction
of step 3 are the same defect seen through different timing.

Three separate faults, all in `position()`:

**It measured against the target, not the ring.** The ring is drawn at
`r ± PAD`, so a card computed clear of the target could still sit on the
highlight by up to `PAD` a side — which is what the user sees and what the test
measures.

**The fallback accepted an overlap.** When no candidate both fitted on screen
and cleared the target, the code took `find(fits)` — any placement that fits,
overlapping or not. A tall target has no room above or below it, so that branch
fired and laid the card over the thing it was pointing at. Growing the demo
dataset from 18 deals to 22 made the table taller and the branch more likely,
which is why it surfaced now.

**The final clamp could undo the choice.** Both axes were clamped into the
viewport after a placement was picked, which can slide a card back across the
ring it had just been placed clear of. Now one axis is *fixed* per side —
"below" pins the top to the ring's bottom edge and only slides horizontally —
so a clamp cannot reintroduce an overlap.

### And the placement was recomputed too early

`position()` ran once, at the end of `render()`. Steps 2 and 3 force their own
screen in a `before` hook (§7), and those re-renders are async: when one lands
after the card is placed, the target grows underneath it. A `ResizeObserver` on
the target and on the card now repositions on any geometry change. No feedback
loop — `position()` writes `left`/`top`, which a ResizeObserver does not fire on.

**A short viewport still overlaps at step 2, and that is correct.** Step 2's
target is the whole kanban board; in a 520px-tall window there is nowhere to put
a 223px card. The fallback picks the roomiest side and sits at its far edge,
which is the least-bad answer rather than a bug. Do not "fix" that by shrinking
the card — measure at a real viewport first, which is what the 1440×900 probe
exists for.

**The lesson is the one §32 already taught, in a new place.** "Fails sometimes,
passes in isolation" reads as flakiness and invites a retry. Measuring the thing
directly — 20 rounds, geometry printed — turned a three-phase mystery into a
one-line answer in minutes. A test that fails 1 run in 15 is still describing a
defect that is present 15 times out of 15.


---

## 36. View-only had to look deliberate, and the audit found a hole

Reported as polish: a view-only account could still type into a record's fields,
the Save button was simply absent, and it "feels like unfinished software rather
than an intentional feature". Auditing it by **driving the app as a real viewer
against the seeded fixture** (§34) turned up something else first.

### The hole

`applyPush` gated records and modules by role and wrote settings from anybody, so
a viewer could rename the team's workspace and change its currency — and the
owner saw both. §23: a currency change **relabels** every stored amount rather
than converting, for everybody. An external auditor holding read-only access
could turn every dollar figure into yen. Fixed in §14; `canEditSettings()` is
owner-only and deliberately separate from `canEditSchema()`.

**It survived §26's role work and the whole security audit** because both read
the code. Driving the product as each role is a different instrument, and it is
the one that found this.

### The principle, so the rest is not a dozen judgement calls

**A restricted account should feel like it is using a finished product for
reading, not a broken product for writing.**

1. **Creating something → hide it.** A missing Add button explains itself.
2. **Editing something visible → render it as a value, not a disabled input.**
   A greyed-out form still looks like a form that failed.
3. **Say the state once, calmly, where identity lives** — not a banner on every
   screen, which nags and reads as an error state.

Tone: never *denied*, *forbidden*, *not permitted*. Those are words for an
attacker, and a viewer may be an intern, an investor or an auditor. Frame it as
what they *can* do.

### The record read view

`fieldReadHTML` renders values through the same `fmtValue` the table uses, so a
field looks identical to the row it was opened from. Two departures: a textarea
shows in full (`fmtValue` truncates at 70 for a cell, and a detail view is where
you go to read the whole note), and a checkbox reads Yes/No because there is no
label beside it here to give a bare tick meaning.

A `<div>`, not a `<form>`: there is nothing to submit, and required markers go
too — a `*` is an instruction, and there is nothing here to instruct.

### What the read view exposed

Rendering values instead of inputs made an empty "Expected close" obvious on
every demo deal. The generator (§34) had invented field keys, and a sweep found
three modules wrong and five invalid select values. **Nothing about it threw**,
and an empty date cell in a table reads as "no date set" — which is why it
survived a full suite, a screenshot review and a live deployment.

The lesson is the one this file keeps relearning: a defect that renders as
*plausible* is invisible until something forces it to render differently.

### Gating the rest, and the one thing that must NOT be hidden

Creates and destructive actions are hidden per rule 1: dashboard quick-add and
Add module, the sidebar's `+`, CSV import, Import backup, Load demo data, Add
module from template, Delete all data. The workspace name and currency render
as values for anyone but an owner.

**Export stays for every role, deliberately.** Reading the workspace and taking
a copy of it *is* the job for an auditor or an investor, and nothing about it
writes. That is a policy choice, not an oversight.

**Hiding `#edit-module-btn` was wrong, and a test caught it.** The builder
already renders read-only for non-owners — no save, no delete, and a line
naming the rule — so hiding the button removed the entry point to a read view
that was already correct. It is retitled instead: *View module fields*, with a
table icon rather than a pencil. Seeing which fields a module has is reading.

The general form: **before hiding a control, check whether it already opens a
read view.** Rule 1 is about creating, not about looking.

**Every bind is guarded now.** Nine handlers used to call
`addEventListener` on an element the template always produced. Once the
template is conditional, an unguarded bind throws and takes the whole screen
down rather than just the missing button — which is a far worse failure than
the one being fixed.

### Left deliberately

`.builder-readonly` still greys its inputs with `pointer-events: none`, which
is the pattern rule 2 argues against. Not converted, because a module's *shape*
is a list of controls — the type, the required flag and the list flag are what
make it legible — and rendering that as prose would lose the thing being read.
Say that rather than treating it as an inconsistency to tidy.

### A module the user built themselves is not a different case

Asked directly, and worth an answer that is measured rather than argued: every
role test until now drove a **template** module, so "does this hold for a module
someone built in the builder" was an assumption, not a result.

It holds, and structurally it has to — nothing on either side of the seam looks
at where a module came from. `canEditRecords` / `canDeleteRecords` /
`canEditSchema` take a *user*; `applyPush` gates by role on the row's `wsId`;
`TEMPLATES` is a seed for the builder and is never consulted again. There is no
provenance field on a module for a permission check to read even if one wanted
to.

Guarded anyway, because "structurally impossible" is the claim that stops being
true after a refactor nobody connected to it. *"roles apply the same way to a
module the user built themselves"* builds an **Equipment** module through the
real builder with a custom `Serial` field, adds a record, then demotes a
colleague to viewer and asserts they read the custom module and its custom
field, get `.record-read` with zero inputs, see no add or import control — and,
pushing straight through `Cloud.sync()` rather than the UI, cannot change
`serial`. Checked against the broken state per §9: with `canEditRecords`
returning `true` it fails on the value, `LC-0042` against `TAMPERED`.

**The push is the half that matters.** Asserting only that the buttons are gone
tests the client's manners; the viewer who matters is the one who does not use
the buttons.


---

## 37. The due-date filter, and two traps it walked into

Phase 1 of the reminders work (§17's neighbour — the operator features that
grew out of "what would make this sellable"). Deliberately client-only: an
in-memory filter over rows already loaded, no new endpoint, no sync, nothing
the server can refuse.

**The plan arrived written for a React app** — `src/lib/`, `src/components/
ModuleView.jsx`, a `userTimezone` argument. There is no `src/`, no `.jsx` and
no framework here (§1). Translated rather than followed: `js/date-rules.js` as
a global beside `js/csv.js`, the control inside `renderModule` in `js/app.js`,
and the filter inside `visibleRecords()` — which already calls itself "the
single source of truth for what rows this module view shows".

### Why the file exists at all

`new Date('2026-09-12')` is parsed as **UTC midnight**. Anywhere west of
Greenwich its `.getDate()` is the 11th, so the obvious three-line inline
version reports "due tomorrow" for something due today, for every user in the
Americas, while being perfectly correct for whoever wrote it in London.

So a stored day is parsed by **regex** into its parts, today is read from local
calendar getters, and both are projected through `Date.UTC` before subtracting.
UTC has no daylight saving, so the difference of two midnights is always an
exact multiple of a day — subtracting local timestamps gives 23- and 25-hour
days twice a year and a rounded division that is off by one across the change.

`tests/dateRules.test.mjs` runs the same assertions under **five timezones in
real child processes**, because `process.env.TZ` set inside a running Node
process does not reliably re-initialise the date code. Checked against the
naive implementation: it fails `Pacific/Midway` and `America/New_York` and
passes UTC, `Pacific/Kiritimati` (+14) and `Asia/Kolkata` — exactly the
signature above, correct for the author and wrong for half the world.

### Overdue is included, and that is the whole design

The helper is **`isDueWithin`, not `isExpiringSoon`**. "Expiring soon" reads as
a future window, and a filter showing only the future hides the overdue invoice
and the lapsed certificate — the rows most worth looking at. A name promising
"soon" while returning true for a six-month-old invoice is a small lie told at
every call site.

Two tests pin it, and both were checked against `n >= 0 && n <= days`:
*"overdue is always included, however old"* fails, and so does the E2E once it
was strengthened — see below.

### The E2E claimed to catch something it did not

The first version asserted every visible row was under the horizon, and a
comment said that would fail on a future-only window. It would not: excluding
overdue leaves every remaining row under the horizon too. **The demo seeds four
tasks with a negative `{ __rel: days }` offset (§6)**, so the test now requires
at least one *overdue* row to survive, which is deterministic rather than a
hope about the dataset. Checked: it fails on the mutation.

### §4's cascade trap, hit again, in the same file

`.due-filter { width: auto }` lost to `.input { width: 100% }` — equal
specificity, and `.input` sits later in `css/style.css`. Measured rather than
guessed, by driving the app and reading geometry: the select rendered **777px
wide**, wrapped `.module-actions` into six rows, and took the page head from
39px to **130px**.

**That broke a test three files away.** The taller head pushed the kanban board
down, leaving the guided tour no room at step 2 — whose target is the whole
board — so `step 2 card covers its own highlight` failed, which §35 records as
the correct behaviour when the target genuinely does not fit. `git stash` and a
re-run proved the tour passed without this change, so it was a real regression
and not the old flake. Fixed with `.module-actions .due-filter`, per §4's own
prescription: **use a more specific selector.**

The lesson is §9's: the failure surfaced in the tour, two files and one feature
away from the CSS rule that caused it, and reading the geometry is what named
it in minutes.

### Smaller decisions, recorded so they are not re-litigated

- **One `<select>`, not a chip plus a window picker.** The options *are* the
  states, so the filter cannot be on with no window or a window with the filter
  off.
- **It names the field it watches** ("Due date: next 7 days"). Filtering on a
  date the reader cannot see is indistinguishable from rows going missing.
- **Absent entirely when a module has no date field**, rather than present and
  inert — §36's rule 1.
- **`watchedDateField` prefers a list column**, then the first date field. A
  guess, but the UI names the result, so it is a visible one.
- **A full `renderModule` on change, not `renderModuleBodyOnly`.** The count
  badge lives in the page head; leaving it on the unfiltered total is §33's
  adjacent-and-wrong number in a new place.
- **Sorted soonest-first while the filter is on**, so the overdue rows it
  deliberately keeps sit at the top.
- **No `server.js` change.** `ASSET_DIRS` allow-lists the whole `js/` directory
  (§28), so a new file there is served automatically — but the smoke test's
  `ASSETS` is what *proves* it, and it went 41 → 42.


---

## 38. The workspace webhook, and the credential that could not live in `settings`

Phase 2 of the reminders work — the transport, built before the engine that
will use it (§37 was Phase 1). Its only user-facing surface is a Settings card
and a test button; nothing sends on its own yet. That is the cost of building
the transport first, and it is still the right order: the alternative is
writing an SSRF guard under pressure with the feature already half-built.

### It cannot go in `settings`, and the second reason is worse than the first

The obvious home is beside the currency and the business name. Two facts, both
read out of the code rather than assumed:

- **`pullChanges` sends `meta.settings` WHOLE** to anyone whose cursor is
  behind `settingsServerAt` — member, contributor, **viewer**. The URL is a
  credential (§18: a Telegram webhook URL contains the bot token), so that puts
  it in every teammate's IndexedDB, offline, permanently. Masking it out of a
  `GET` does nothing, because the `GET` is not the delivery path.
- **Masking would then DESTROY it.** `js/app.js` merges the pulled document
  into local settings and `js/cloud.js` pushes the whole thing back on the next
  save, where last-write-wins accepts it — so `https://…/bot•••••/sendMessage`
  overwrites the real URL the first time an owner changes the currency.
  **Redaction and last-write-wins cannot both apply to one document.**

So `hook` is a **sibling** key on the meta doc. `putData` merges on both stores
(spread on FileStore, `$set` on MongoStore), so a settings write leaves it
standing; `pullChanges` names `meta.settings` specifically, so sync cannot
reach it. Structural rather than filtered — it holds for somebody who never
reads the comment.

§17 had already written half of this down before there was code to hit it:
*"Keep it out of `settings`, or redact it on export."* The sync path is the
half that note did not reach.

Guarded by *"an owner changing the currency does not erase the webhook"*, which
fails **destructively** on the original design, and by a leak assertion that
searches the whole response body rather than a named field — a field-by-field
check only covers the fields somebody thought of.

### `node:https`, not `fetch`, and that is the substance

**DNS rebinding is a time-of-check/time-of-use bug.** Validate with
`dns.lookup` and then call `fetch(url)` and fetch resolves the hostname *a
second time*: a one-second TTL answering public and then `169.254.169.254`
walks straight through a correct check. Enumerating hostname encodings — the
usual advice — does not touch it; the second query *is* the vulnerability.

`node:https` takes a `lookup` option that flows to `tls.connect`, so the socket
dials the address we already validated, with SNI and `Host` intact. The undici
equivalent needs undici's `Agent`, which is not reachable on any `node:`
specifier and would mean a fifth production dependency.

Two things come free that are flags on `fetch`:

- **It never follows redirects at all** — a property of the API rather than an
  option a later edit can drop, so a 30x to the metadata endpoint cannot be
  followed. The code only has to *report* it.
- **The encoding zoo needs no enumeration.** `0177.0.0.1`, `2130706433`,
  `0x7f.1` are all blocked by the same path as the dotted form, because **we
  never parse the hostname — we validate what the resolver returned.**

**The pin is proven, not asserted.** The transport test posts to
`webhook.invalid:<port>`, which no resolver answers for, and succeeds *only*
because the pinned address is the one dialled. A companion test shows the same
request failing `ENOTFOUND` without it.

### Traps, and two of them shipped broken first

- **`::ffff:0:0/96` in the block list breaks every webhook in the product.**
  It looks like a free backstop under the v4-mapped unwrapping. `net.BlockList`
  matches a v4-mapped v6 **subnet** against plain `ipv4` checks, so that one
  line makes `check('1.1.1.1','ipv4')` true and nothing is ever deliverable.
  All twenty-one blocked-range assertions passed while the guard refused the
  entire internet; *"lets an ordinary public address through"* is what caught
  it, which is why a block list needs that test.
- **`new URL('https://[::1]/').hostname` is `'[::1]'`** — brackets included —
  so `dns.lookup` failed on it and every IPv6 literal was classified
  *unresolvable* rather than *blocked*. Not exploitable (a failed resolve means
  no socket either way), but the save path treats the two differently, so
  `https://[fd00::1]/x` was being **stored**. Node's own `urlToHttpOptions`
  strips them the same way. Asserting only `ok === false` passes on the broken
  code; the test asserts the `code`.
- **The suite is split in two, and it has to be.** Classification is tested
  with no sockets; the transport is tested against a local capture server with
  the block list stood down. Together you must either weaken the guard so the
  capture server is reachable or never exercise redirects, timeouts and
  pinning. Same lesson as §30's `127.0.0.1` feedback test.
- **`lib/` is a new top-level directory and is deliberately not `js/`**, which
  is served (§28). `tests/smoke.mjs` asserts `/lib/safe-fetch.js` is a **404** —
  the allow-list check run backwards, and the only thing that would catch
  somebody adding `lib` to `ASSET_DIRS` to make an import work. Smoke 42 → 43.
- **CommonJS, and `.js` not `.mjs`.** `server.js` is CommonJS and
  `package.json` allows Node ≥ 18; `require()` of ESM only works from 22.12, so
  an `.mjs` here runs locally and throws `ERR_REQUIRE_ESM` on a deployment
  pinned to 18 or 20 — at require time, so the whole server fails to boot.

### The save refuses only what can never work

A malformed URL, `http:`, or an address the guard will not dial are properties
of the **URL**, so storing one means a webhook refused identically at every
send for ever. An unresolvable host, a refused connection, a timeout or a 500
are properties of the **moment**: refusing those means an owner cannot
configure a webhook while the far end is down, or before they have finished
setting it up at the other end. Those save, carrying the reason on
`lastError` — which the settings screen shows. `sendGuarded` returns a `code`
so the two can be told apart.

**No read-back, anywhere.** An owner who has lost the token re-enters it; the
masked form exists only so the screen can say *which* destination is
configured. `lastError` is the message with the URL scrubbed out, because
§18's "nothing interpolates a webhook URL into a log line" now has a second
place it could break: that field is persisted and rendered.

Owner-only via `canEditSettings()` — the function that exists separately from
`canEditSchema()` (§14) precisely so a workspace-level setting can hang off it.
**403, not 404**, matching the sibling team routes: §5's 404-not-403 rule is
about *cross-org* access, and a member already knows their own workspace
exists, so hiding a permission behind a lie buys nothing.

### It does not travel in a backup

`workspaces[].meta` **is** the `data` collection, so anything on the meta doc
is in every nightly artifact — downloadable by anyone with read access to the
private repo (§17). The export replaces `hook` with `{ redacted: true }`.

**Replaced, not deleted, and that is the point.** The marker is the only thing
that can tell an operator their notifications are not coming back on their own;
a silently absent hook after a recovery is a channel that has been dead since
the incident, which is exactly when somebody is relying on it. `restore.mjs`
counts them, says so, and strips the marker before writing so `publicHook()`
cannot report a hook with no URL behind it.

The drill seeds a live webhook on one tenant before boot, and `before` asserts
it survived to export time — otherwise "the export does not carry it" is true
for the wrong reason. That check doubles as proof that `refreshCounts`' meta
write merges rather than replaces.

### The time zone, and why the browser filter must not use it

`settings.timezone`, `''` when nobody has chosen — **not `'UTC'`**. The
distinction earns its place on screen: *"Not set — dates are treated as UTC"*
is a prompt, *"UTC"* is a claim somebody made. The picker is built from
`Intl.supportedValuesOf('timeZone')`, so the list cannot drift from what `Intl`
will accept, with a two-entry fallback for browsers without it — a
hand-maintained list of 400 names is a second source that goes stale (§29).

**No server-side validation, deliberately.** Validating in `applyPush` means
touching the sync seam — six recorded traps (§10) plus §14's rejection rules —
to guard against a string only a hand-written push can produce, and a refusal
there has nowhere good to go: rejecting a whole push over a timezone makes a
hard error out of what every other violation treats as a refusal. Phase 3 will
resolve at *read* time with a `UTC` fallback instead. Store whatever arrives;
never trust it at use.

**§37's filter deliberately does not read it.** That runs in the browser, and
somebody in Tokyo looking at the list should see *their* today. The workspace
zone exists for the server, which has no viewer. Unifying the two reintroduces
exactly the off-by-one `js/date-rules.js` exists to prevent.

### Telegram setup, and the hang found under it (stage 1 of 3)

Telegram is the one provider that hands you **no webhook URL**. It gives a bot
token, and the chat id has to be excavated from a raw `getUpdates` response —
four steps, of which the last three are where non-technical owners stop. The
card also *said* Telegram "gives you" a URL, which is false for the one
audience that needed the sentence.

So: paste the token, press **Find my chat**, pick from a list. Stage 1 is the
server half — the guard change and the lookup. The route and the UI follow.

**Not a new SSRF sink, which is what makes it affordable.** The host is fixed
and ours to choose; only the token varies, inside the path. It still goes
through `sendGuarded`, so the block list, the DNS pin and refuse-redirects all
still apply.

#### `sendGuarded` hung for ever on an oversized reply, and had done since §38

Found while raising the response cap, not by looking for it.

`MAX_BODY_BYTES` is 2048 — right for a *notification*, where nothing on the far
end has anything to say. `getUpdates` carries a full `from` + `chat` + `message`
object per update, so two or three messages clear it. Hence `maxBytes`: the
default is unchanged for every existing caller, and a caller that means to
**read** the answer says how much it expects.

Raising it exposed two defects in the branch underneath, and the second is the
serious one:

- **The silence.** Over the cap, the bytes that had arrived were handed back,
  `JSON.parse` failed, and the caller saw `ok: true, json: null` —
  indistinguishable from a provider that does not answer JSON. `deliverToHook`
  decides *"a 2xx is not delivery"* by reading `json.ok === false`, so a
  truncated Telegram refusal was recorded as a **successful delivery**.
- **The hang.** `res.destroy()` mid-stream emits `close` and nothing else — no
  `end`, no `error` — and the code settled only in `end`. So the promise was
  **never resolved** for any oversized reply arriving in more than one chunk,
  and nothing rescues it: a socket that has just been destroyed cannot fire its
  own timeout. Downstream that is `/api/org/hook/test` never answering, and a
  reminder pass stalling on one workspace whose destination is chatty.

**Measured, not reasoned, and the measurement is the whole reason it was
found.** A 9 KB body written with one `res.end()` gets `destroy,end,close`; the
same volume written in twenty chunks gets `destroy,close`. So the obvious test
— one big write — **passes against the hanging code**. The fixture writes in
pieces on purpose, and the test races a deadline rather than awaiting, because
on the unfixed code it does not fail, it hangs.

Settled in the `data` handler now, before the destroy, rather than in a handler
that will never run.

#### The lookup

`telegramChats(token)` returns `{ ok, chats: [{ id, title, kind }] }` and never
throws. Four things in it that each stop a working setup reading as broken:

- **No `offset`, deliberately.** Acknowledging one *consumes* the update
  stream, so a second press would legitimately come back empty and read as a
  broken button. This is a read; it must leave nothing changed.
- **`allowed_updates: ['message', 'my_chat_member']`**, and the second is not in
  the default set so it has to be asked for. It is the one that makes **groups**
  work: group privacy mode is on by default, so a bot in a group never sees
  ordinary messages — but being *added* to the group is a `my_chat_member`
  update, which it does see. **Confirmed by trial** (it was flagged here as an
  assumption first): pressing Start finds the private chat, adding the bot to a
  group finds the group, and neither needs a message posted afterwards.
- **Every failure gets its own words.** 401 (wrong token), 409 (this bot already
  has a webhook set elsewhere, so its messages cannot be read), `too_large`, and
  an empty result — which is **not** an error and must not read as one, because
  Telegram keeps updates for 24 hours and a bot messaged yesterday genuinely has
  nothing to show. Collapsing any of these into "no chats found" is the same
  dead end this feature exists to remove, reached from a different direction
  (§36).
- **The token is never logged, echoed back, or stored on its own.** It exists in
  a request body and in memory until the `sendMessage` URL is assembled, and
  what is persisted is the ordinary `hook.url` — no schema change, no sync
  change, no export change.

**`TELEGRAM_API_BASE` is the test seam, and the guard relaxation hangs off that
same variable rather than a flag of its own.** A fixed host cannot be pointed at
a capture server, and `sendGuarded` refuses loopback besides — so without a seam
this is only testable against Telegram itself, which is how §30 found the OAuth
callback had no test at all. Precedent and fix are exactly that one:
`GOOGLE_TOKEN_URL` / `GOOGLE_USERINFO_URL`. One condition, because two
independent switches is how the wrong one ends up set in production; a
deployment that does not redirect the host cannot reach the relaxed path.

#### The route (stage 2)

`POST /api/org/hook/telegram/chats`, owner-only via `requireSettingsOwner`
(403, not 404 — §5's rule is about *cross-org* access, and a member knows their
own workspace exists), token coerced with `String(...)` before it can reach a
URL, and rate-limited.

**It reads and writes nothing.** An owner who never picks a chat leaves no
trace on the workspace — in particular no half-configured hook for the settings
card to report on. Asserted, because "nothing was written" is the kind of
guarantee that quietly stops being true.

**Its own rate-limit bucket, and a higher bound than the test send.** They are
limited for the same reason — an authenticated caller making the server dial
out — but the rhythm differs: a lookup is legitimately pressed several times in
a row (paste, press, realise you have not messaged the bot yet, message it,
press again), and spending `/api/org/hook/test`'s allowance on that would refuse
the send that proves the setup worked. `RATE_TELEGRAM_MAX`, default 12.

**The first run of these tests failed with 429s**, which was the limiter working
and the test design wrong. Raised for the suite rather than thinning the tests:
what they cover is the failure *mapping*, and dropping cases to fit a rate limit
trades real coverage for a bound `rateLimit()` already enforces identically on
four other routes. Written down because "the tests made the limit looser" is
exactly the kind of change that should be visible rather than inferred.

**The fake Telegram gets ten reserved ports, not a share of the rotor.**
`api.test.mjs` hands out a fresh port per boot from its block (§4), so a capture
server on a port that rotor can also produce is a collision that surfaces as one
unrelated test failing occasionally — the shape §32 spent a week reading as
flakiness. The block is unchanged at 8300–8449; the app's span narrows to 140
and 8440–8449 is the capture server. 8450 is `fixture.test.mjs`, so the
reservation comes out of this block rather than off the end of it.

**The fixture's group has no `message` update at all**, deliberately — that is
what makes the `my_chat_member` assertion mean something rather than pass on a
group that would have been found anyway. Four mutations were checked and each
fails by name: dropping `my_chat_member` loses the group, adding an `offset`
trips the request assertion, removing the 409 branch reports *"the destination
answered HTTP 409"* instead of naming the webhook, and keying the de-duplication
map by update id returns three chats where there are two.

#### The screen (stage 3)

A collapsed `<details>` under the webhook field: BotFather link, token field,
**Find my chat**, then a list to pick from. Picking assembles the URL and goes
through the ordinary `PUT /api/org/hook`, so the save probe, the refuse/warn
split and the masked read view are all unchanged — **no schema change, no sync
change, no export change.**

**The copy fix is part of the feature, not decoration.** The card said *"paste
the webhook URL that Slack, Discord or Telegram gives you"*, which is true for
two of the three. Telegram gives you no such thing, so the only affordance on
the card sent exactly the audience that needed help looking for a button that
does not exist. It now names what each provider actually hands over.

**Results are painted into `#tg-results`, never by re-rendering.** A full
`renderSettings()` wipes the token field, so an owner would have to paste the
token again in order to pick a chat they had just been shown — and the token is
the one thing on that screen they cannot recover from anywhere. For the same
reason the pick handler **re-reads** the field rather than closing over the
value: the credential belongs in the input the owner can see, not in a captured
variable that outlives the lookup.

Collapsed by default because it is one provider of three, and an open block of
setup instructions reads as work everybody has to do. `.tg-setup`, `.tg-steps`,
`.tg-chat-list` and friends are **defined in `css/style.css`** — §27's
invented-class trap, which is how `.note.warn` shipped looking fine and meaning
nothing.

**Buttons, not a `<select>`.** Each row carries the chat's kind — *group*,
*private* — and a picker's single line would have to drop it. That label is
what tells two similarly named chats apart.

**Step 2 names the consequence, not the action — found by the trial.** It first
read *"send your new bot a message; for a group, add the bot instead"*, which
presents two interchangeable ways of making the bot visible. They are not: **the
action taken IS the destination.** Press Start and the digest arrives as a
private message to that one person; add the bot to a group and it goes to the
whole group. An owner who reads only the action discovers which they picked when
the first digest lands — possibly in a channel with the client in it, which is
the exposure §39's counts-only rule already exists for. It is now written as a
choice with its two outcomes named, and guarded by an E2E assertion so it cannot
drift back to naming only the steps.

#### The fake Telegram is one file, shared by both suites

`tests/fake-telegram.mjs` exports `createFakeTelegram()` for
`tests/api.test.mjs`, and **`playwright.config.js` runs the same file directly
as a second `webServer`**. The lookup happens on the *server*, so no amount of
browser-side stubbing covers it, and the alternative — letting the E2E dial the
real Telegram with a bogus token — puts a network dependency in CI.

A second copy of the fixture would go stale in the direction that matters, with
one suite quietly testing a shape the server no longer produces (§29). Port
**8299**, below every `node --test` block so a Playwright run and a Node run
cannot collide over it.

Two E2E journeys, each checked against the state that breaks it: reverting the
copy fix fails *"an owner finds their Telegram chat…"* on its first assertion,
and collapsing the empty result into *"No chats found"* fails *"an empty
Telegram lookup says what to do…"*. That second test asserts a bad token gets
**different** words, so it cannot pass on a version that says one thing for
every outcome.

**A stale line in two user docs, found while editing them.** `USER-GUIDE.md`
and `manual.html` both still said the webhook test *"is all it does — nothing
sends on its own yet"*, two paragraphs above the section describing the daily
digest that §39 shipped. §27's drift, in the exact pair of files §27 names as
the easiest to forget.

### Moving the deployment to Frankfurt, and the smoke check that never worked

The UK launch's Phase 0 (`docs/archive/UK-LAUNCH.md`): Render to Frankfurt,
Atlas to `eu-central-1`, seeded by restoring a real nightly artifact rather
than starting empty. **Restoring before switching is what closes §21's
first-account-becomes-`platformAdmin` window** — the app never comes up against
an empty `users` collection, so the bypass has nothing to fire on regardless of
`ADMIN_EMAILS`.

`privacy.html` said *"currently in their US regions"*, which was true that
morning and false the moment the switch landed. It also claimed a **complete**
list of who else sees the data and omitted **GitHub**, which holds the nightly
backup. Both fixed. A first draft of the new backup paragraph said backups
*"are encrypted"* — they are not yet, that is Phase 1 — and it was caught
before the commit. **A privacy page is the last place an intention should be
written as a fact.**

#### The check accepted the exact answer that means it failed

The move made `an oversized body is refused, not absorbed` fail with a timeout.
That part was mundane: it is the **only check in the file that uploads**, the
body is 200 KB, and the shared 20s budget is sized for "how long does the server
take to answer" rather than "how long does the body take to arrive". Moving the
origin further away broke it while the limit worked perfectly — a manual `curl`
answered 413 immediately. It has its own budget now (`SMOKE_UPLOAD_TIMEOUT`),
and a timeout reports **WARN** rather than FAIL, because an unanswered question
is not a failed limit and *"Deployment is NOT healthy"* over a healthy
deployment is expensive out of proportion to the check.

**The real finding came out of proving the fix.** The check accepted `413` *or*
`401`, on the reasoning that "auth runs first". **It does not.**
`app.use(express.json({ limit: '64kb' }))` is global and runs before any
route's middleware, so on a correct server an oversized body is rejected by the
parser and never reaches `requireAuth` — 413 every time. A **401 means the body
was parsed** and then refused for the unrelated reason that nobody was signed
in, which is exactly what a missing limit looks like.

Measured rather than argued: restoring the old global `8mb` — §30's finding #4,
the regression this check exists for — made it report `HTTP 401` and **pass**.
It had never once been able to catch the thing it is named after. Only 413
passes now, and 401 fails by name.

Two smaller things confirmed while proving it: `bigJson` is mounted on
`/api/sync` and `/api/data` **before** the global parser, so those two win and
the global skips them (body-parser sets `req._body` and later parsers bail) —
the ordering is load-bearing and reversing it would cap a sync push at 64 KB.
And `curl --data-binary` with a 200 KB argument dies with *"Argument list too
long"*; write the body to a file first.

### A restore switched off every webhook, silently

Asked as a question — *"each time I restore, is the webhook lost? does everyone
need to re-add?"* — and the answer was yes, on the operator path, for everybody
at once, **with nothing anywhere saying so**.

**Two restore mechanisms, and only one has this problem.** `scripts/restore.mjs`
is whole-deployment: `deleteMany({})` across seven collections, no per-tenant
filter. The owner's *Settings → Import backup* is one workspace and does not
touch the hook at all — the client's export carries `settings`, `modules`,
`records`, and never held the URL to begin with (no read-back, §38). So "can it
be restored per account" is **yes, but by the owner, not the operator**.

**The defect was the silence, not the loss.** The URL cannot come back — it is a
credential and is never exported, which is correct. But `restore.mjs` **stripped**
the `{ redacted: true }` marker before writing, so the information died in the
operator's terminal: `publicHook()` then answered `{ configured: false }`, which
is byte-identical to a workspace that never set one up. A recovery therefore
turned off every customer's notifications and the only clue was a line the
operator saw once, during an incident, weeks before anyone noticed a digest had
stopped arriving.

This file's recurring shape, in a new place: **the state that renders as
nothing** (§36, §39).

`{ needsReentry: true }` is written now instead of stripping. It carries no
`url`, so `deliverToHook` and the digest gate both refuse it unchanged, and the
Settings card says the destination needs re-entering rather than offering a
blank field. **The digest gate needed its own branch**: both states land on
"nothing configured", and *"set a webhook above first"* is advice for somebody
who never did the work.

**Not the host, and that was scope creep caught mid-change.** The first version
exported `{ redacted: true, host }` so the notice could say *"you were sending
to api.telegram.org"* — a better prompt, and it broke an existing assertion
that the backup **must not name the webhook host**. That assertion is
deliberate. Carrying the host would put which chat provider each tenant uses
into an artifact §17 is already uneasy about, to save an owner from remembering
a choice they made themselves. Reverted; the notice reads fine without it.

**A test whose name was true and whose assertion was not.** *"the owner is told
their notifications are off, rather than left to find out"* asserted
`{ configured: false }` — precisely the state in which they are **not** told. The
name described the intention and the assertion pinned the opposite, and it
passed. It now asserts `needsReentry`, with a companion that a workspace which
never had one is **not** told to re-enter anything — without which, marking every
empty hook would satisfy the first test while telling people to restore
something they never had. Both mutations checked: stripping the marker fails two
tests, marking everyone fails the third.

**The E2E half is injected, not real** — §20's precedent. The state only exists
after `restore.mjs` has run over a deployment, and Playwright cannot restore its
own server mid-run, so the journey intercepts `/api/org/reminders` (which carries
the hook and the digest state together, which is why one interception moves
both). The real export → restore → boot cycle is covered in
`tests/backup.test.mjs`. Each UI branch was mutated separately and fails on its
own.

### §30's audit table changes

Row 12 read **FALSE — env-only, no runtime setter**. These routes *are* that
setter, so it now reads: *false for the env webhook; the workspace webhook is a
deliberate outbound sink with a guard.* An audit table that quietly keeps a
stale FALSE is worse than one that never had the row.

`CACHE_VERSION` bumped to `crmbuilder-v33`.


---

## 39. The reminder engine, and the staleness alert that cannot exist

Phase 3 of the reminders work — the engine §38's transport was built for. A
daily digest of what is due or overdue, per workspace, to that workspace's own
webhook. **Off by default**, because nobody's team channel should get a
message because somebody deployed a new version.

### One file, three consumers

§37's calendar arithmetic lives in a browser global inside `js/`, which
`server.js` cannot `require`. Both usual answers are worse than the problem:
copying it into `lib/` makes a second source that goes stale (§29's whole
thesis), and eval-ing the served file at boot needs a paragraph in §30
explaining why it is not an injection risk. Instead, one line at the foot of
`js/date-rules.js`:

```js
if (typeof module !== 'undefined' && module.exports) module.exports = DateRules;
```

The browser still gets its global, `server.js` gets a `require`, and
`tests/dateRules.test.mjs`'s `new Function` harness is untouched because
`module` is undefined inside it. **Requiring `js/` from the server is
deliberate** — that directory being *served* (§28) and being *required* are
unrelated concerns.

Asserted rather than assumed: the tests `require()` through the same seam the
server uses, compare the surface **and** compare answers. A require that
quietly returned something stale would pass a shape check while leaving the
server running untested code that looks shared.

### Two clocks, and they are not the same question

| | Whose day | Used by |
|---|---|---|
| `today(now)` | the **viewer's**, from local getters | §37's filter, in the browser |
| `today(now, zone)` | a **named zone's** | the engine, which has no viewer |

The browser filter deliberately does **not** read the workspace zone: somebody
in Tokyo looking at a list should see *their* today. Unifying them
reintroduces exactly the off-by-one `js/date-rules.js` exists to prevent, so
it is written down in both files.

`resolveZone()` **never throws**, and that is a requirement rather than a
convenience — §38 records why the timezone is stored without server-side
validation, so the guarantee has to live at every point of use. A throw would
take down a scheduled pass for every workspace because one of them holds a
typo. Same rule for `remindSettings()`, which clamps rather than trusts: a NaN
window makes `isDueWithin` false for everything and the digest goes quiet
**without ever erroring** — a defect that renders as plausible (§36).

**`hourCycle: 'h23'`, not `hour12: false`.** The latter selects h24 on some
ICU builds and renders midnight as `"24"`, which puts the morning gate on the
wrong side of a day boundary. The `% 24` is a second belt, because which cycle
you get is a property of the runtime rather than of this code.

### `Intl.supportedValuesOf('timeZone')` does not contain `UTC`

418 canonical IANA names, and **not one of them is `UTC`** — not `UTC`, not
`Etc/UTC`. A container with no `TZ` set resolves to exactly `UTC`, so §38's
picker could not offer such an owner their own zone, and pre-selecting the
detected one silently selected nothing. It would have arrived as *"my time
zone isn't in the list"*.

Found by an E2E test that could not select the browser's own zone — a test
failing for a reason that turned out to be the product. The device zone and
`UTC` are unioned back in; still the runtime's list, plus the two values it
omits.

### The pass

Off the `/health` ping, like the alert rules (§25) — UptimeRobot already hits
it every 14 minutes and a second scheduler is a second thing to keep alive.
After the response, never awaited.

**One pass per workspace per LOCAL day, whether or not it sends.** That is
what bounds the cost: at most one scan of a workspace's rows per day however
often the ping arrives. The consequence is stated rather than discovered —
something that becomes due at 11am is reported tomorrow. A live version means
rescanning every tenant every fourteen minutes, which is a different feature
with a different price.

**The day is marked BEFORE the send.** Marking afterwards retries on every
ping, and a destination that fails slowly turns one digest into a channel full
of them. Spamming a team channel is worse than missing a day, so the failure
is recorded on the hook where the settings card shows it. Guarded by a test
whose destination always fails.

**The gates are ordered by cost**, and that ordering is the whole scale story:
`enabled` and `hook.url` are read off the meta doc already in hand, so a
workspace not using this never touches the records collection. Two tests
assert the day is left **unmarked** in those cases rather than merely that
nothing was sent — a marked day would prove the rows had been read.

**Nothing due sends nothing.** A daily "all clear" is the fastest way to teach
a channel to ignore this — §25's escalate-only lesson in a new place.

### Counts, never record names

A digest reads *"Invoices: 2 overdue, 3 due within 7 days"* and never names a
row. **A decision, not an omission:** a webhook destination is not necessarily
as private as the workspace — a shared client channel is a plausible place for
an owner to point it, and they will not think about that while pasting a URL.
§18 already refuses to put record names on a chat service; the direction
differs here (a team's own data to their own channel, chosen by them) but the
exposure is the same shape. The nudge works without them: the message's job is
to get somebody to open the CRM. Easy to add later, impossible to un-send.

### Mentions: two mitigations, because the providers differ

| | What pings | Control |
|---|---|---|
| Discord | bare `@everyone`, `<@id>` in `content` | `allowed_mentions: { parse: [] }` — its own documented switch |
| Slack | only `<!channel>`, `<@U123>`; a bare `@everyone` does **not** | escaping `<` and `>`, which Slack's docs also prescribe for literal brackets |
| Telegram | nothing — no `parse_mode` is ever set (§18) | — |

Both are needed; neither alone covers the other. Applied where untrusted text
**enters** the message, never to the whole string, because the app's own URL
has to stay a working link.

**The cost, stated rather than hidden:** a literal `<` in a module name renders
as `&lt;` on Discord and Telegram, which do not decode entities. A cosmetic
price on a rare character, paid to keep Slack's mention syntax inert. Do not
"fix" it by dropping the escaping.

This lands in `webhookRequest`, shared with the feedback and alert paths — so
a bug report containing `@everyone` can no longer wake the operator's channel
either. §9's shared-helper rule applies.

### The staleness alert that cannot exist

The brief asked for one. **It cannot work**, and the reason is worth keeping:
the engine and the alert rules both run off the `/health` ping, so a rule for
"reminders have gone stale" could never fire for the reason that matters — a
dead ping stops the thing that would evaluate it. That is §17's shape, the
backup workflow that reported success every night while producing nothing,
reached from a different direction.

So staleness splits, and only one half is code:

- **Pull** — `platform.reminders` on `/api/admin/platform`, rendered on the
  Deployment card, and `null` until the first pass rather than a
  zero-hour-old success. An operator who looks, sees. The card says plainly
  that if the ping stops, nothing here can tell you.
- **Push** — `REMINDER_HEALTHCHECK_URL`. **This is code, and the first
  version of this section said it was "configuration rather than code",
  which was wrong.** The backup's switch is configuration because an external
  job runs it and can `curl`; this pass runs *inside* the server, so the
  server has to emit the ping. Nothing external can see whether it happened.

**What the outbound ping fixes that a rule could not.** A rule asks "is
something wrong" and needs to be running to answer. A ping asserts "I am
alive", and the thing that notices its ABSENCE is somebody else's machine —
which is exactly the property a dead ping loop destroys in the rule and cannot
touch here. So it covers **both** failure modes at once: the engine wedging,
and the keep-warm ping dying. Either stops the pass, and either therefore
stops the signal.

**Pinged for a pass that RAN, not one that SENT.** A quiet weekend, or a
deployment where nobody has switched the digest on, is the engine working;
gating on `sent > 0` pages you every Sunday, which is §25's "an alert that
fires when nothing is wrong trains you to ignore it". That is **not** a
contradiction of §17's rule that an unconfigured run must not report health —
there, "did nothing" meant missing secrets wearing success's clothes. Here it
is a legitimate state, and the claim being made is only "a pass executed". A
pass that was rate-limited, or that threw before finishing, never reaches the
ping.

**Silence and `/fail` are told apart on purpose.** Healthchecks treats
`<url>/fail` as an explicit failure signal, so a pass with a failed delivery
says "I am running and something in me is broken" while a dead deployment says
nothing at all. Opposite problems, opposite responses — reporting both as
silence would throw that away.

Env-supplied, so it is the unrestricted trust level (§38) and uses plain
`fetch` — no runtime setter, which keeps §30's SSRF finding false for it. The
URL is a bearer credential, so it must never reach `platform` (§17's rule) and
nothing interpolates it into a log line. The body carries counts only:
Healthchecks shows it in its own log, which is one more place a customer's data
must not appear.

**Test trap, hit twice.** The healthcheck tests need their own deployment.
The main suite deliberately leaves workspaces whose sends fail, so a pass there
correctly signals `/fail` — which makes "a healthy pass reports health"
unprovable on it, and the failure reads as the ping being broken when it is the
fixture. The second server also keeps the real `REMIND_MIN_GAP_MS`, which is
what makes the rate-limited path reachable at all. And **the platform admin is
the FIRST account on a deployment** (§21): signing in fresh gets an owner,
`/api/admin/reminders/run` answers 403, no pass runs, no ping is sent — a
third way to arrive at "the ping looks broken".

Setup steps, and what a red check means in each direction, are in
`docs/BETA.md` § *"Knowing the daily digest is still running"*.

### The suite is split in three, and it has to be

A workspace webhook goes through `lib/safe-fetch.js`, which refuses loopback,
so a local capture server **cannot** receive one — and a bypass so it could is
exactly the weakening §30 declined for the feedback webhook.

| Half | How |
|---|---|
| pass mechanics | driven through the real endpoints, read back out of the store |
| payload shape | a capture server, through the **env** webhook — unrestricted by design, and it shares one payload builder |
| message wording | read off the **preview**, which returns the exact string |

Returning the real string from the preview is the better product answer
regardless: an owner reads what their team will read before switching it on.

`tests/reminders.test.mjs`, ports 9700–9750 (§9). Six mutations each fail the
test that names them: dropping any of the three gates, marking the day after
the send, dropping `neutraliseMentions`, dropping `allowed_mentions`.

**And the parity test is the one that justifies sharing a file.** The count in
the digest must equal what the due-date filter shows. It **aligns the two
clocks first**, setting the workspace zone to the browser's own — without
that it would pass in a UTC container and fail on a European developer machine
for something that is not a defect. Checked against a future-only window: it
fails by name, *"the digest would say 3 but the filter shows 7"*.

### Traps in the UI half

- **§27's invented-class trap, nearly repeated.** `.hr`, `.settings-sub` and
  `.digest-preview` did not exist in `css/style.css`; an undefined class
  renders as an unstyled box that still looks plausible in a screenshot, which
  is how `.note.warn` shipped meaning nothing. They are defined now.
- **`DB` is a bare global, not `window.DB`.** A top-level `const` in a classic
  script is lexical, so `window.DB` is `undefined` — an E2E `page.evaluate`
  reaching for it fails with a `TypeError` that names the property rather than
  the mistake.
- **The preview is computed by the SERVER**, so saving digest settings has to
  `await Cloud.sync()` before re-rendering. `persist()` only schedules a
  debounced push, and redrawing straight away shows the old window beside the
  new controls — §33's adjacent-and-wrong number in a new place.

### The state that rendered as nothing

**Found by running the trial, not the tests**, and it is §36's lesson arriving
somewhere new. With the default `hour: 9` and a server clock at 02:00, the
pass correctly skips as `too-early` — and the settings card said **nothing at
all**, because its only line was *"Last checked …"*, which needs a pass to
have run. Working exactly as designed, and indistinguishable from broken.

Every branch is named now, and `digestStatusHTML` walks the same gates the
server walks **in the same order**, so the reason shown is the reason the pass
would actually stop at:

| Card | State |
|---|---|
| *nothing is sent until you switch it on* | off |
| *set a webhook above first* | on, nowhere to send |
| *Waiting until 09:00 in \<zone\>, where it is now 07:32* | on, before the morning gate |
| *Due to go out on the next check* | on, past the hour, not yet run today |
| *Checked \<when\> — N items. Next check tomorrow* | already ran today |

`zoneParts` carries a **minute** now, so the line can say *07:32* rather than
*07:00* — an hour-rounded time reads as wrong to somebody looking at their own
clock, and it sits beside a gate expressed in whole hours.

**The E2E's first version missed a state and then failed against it.** It
never configured a webhook, so the card correctly said *"set a webhook above
first"* where the test expected *"Waiting until…"* — the missing state proving
it needed naming. It walks all four now, choosing the "later today" hour off
the **workspace's own clock** rather than assuming one, and skipping that
branch at 23:00 rather than faking it. Checked against the broken state: the
old card fails on the very first assertion, because *off* said nothing either.

`CACHE_VERSION` bumped to `crmbuilder-v35`.


---

## 40. The keep-warm ping was on the wrong URL, and six documents said otherwise

Reported as two log lines and an outage, and they turned out to be three
unrelated things: one expected refusal logged as a fault, one real mechanism
that had never run, and one deployment that was never down.

### `/healthz` is not `/health`, and only one of them does anything

```js
app.get('/healthz', (req, res) => res.json({ ok: true, storage: store.kind() }));   // 2349
app.get('/health',  async (req, res) => { …                                        // 2351
  evaluateAlerts()…                                                                // 2390
  remindPass()…                                                                    // 2398
```

The live UptimeRobot monitor was on **`/healthz`** — the original liveness
probe, kept byte-compatible on purpose (`render.yaml` calls it "the older" one)
and doing nothing but answering. So the §25 alert rules and the §39 reminder
pass, both of which are documented as running "off the keep-warm ping", had
**never once run off it.** The monitor predates `/health` and was never moved.

**The service was warm the whole time**, because any request wakes a Render
instance. That is what makes this invisible: the thing the monitor was created
for kept working perfectly, and the two things later bolted onto the same ping
did not.

### Both monitors were telling the truth, about different things

| | Said | Correct? |
|---|---|---|
| UptimeRobot | 100% over 7 days, 0 incidents | yes — the app was never down |
| Healthchecks `reminders` | DOWN 14h39m, UP at 09:44 | yes — no pass had run |

The only live caller of `/health` is the **CI smoke test** (`tests/smoke.mjs`'s
*sync model* check). So a reminder pass happened when, and only when, somebody
pushed to the repository. The check went UP at 09:44 because a deploy landed
and CI ran the live smoke against production; it had gone down overnight
because nobody pushed for longer than its 1-hour period. Read as an outage,
which is the obvious reading and the wrong one.

### What actually caught it, and what could not

§39's **outbound Healthchecks ping** — the "push" half, built because a
"reminders are stale" alert *rule* cannot work when the rule and the engine
share a trigger. That reasoning turned out to describe this exact failure, one
step earlier in the chain than it was written for: a dead ping stops the pass
**and** the rule, and only a machine that is not ours can notice the silence.

Nothing else could have. The suite proves `/health` runs the pass; **nothing
proves that anything calls `/health`**, and nothing can — the caller is a row
in somebody's UptimeRobot account. That is the general shape worth keeping:

> **A mechanism that hangs off a URL configured somewhere else has a failure
> mode no test in this repository can see.** The further the trigger lives from
> the code, the more the documentation has to be checked against the
> configuration rather than against the source.

Six places asserted the ping was on `/health` — §17, §24, §25, §39,
`DEPLOYMENT.md` and `docs/BETA.md` — and all six were describing the intent.
Every one was written by reading `server.js`. None was written by opening the
monitor. `DEPLOYMENT.md` and the BETA runbook now say to check the monitor's
address, and say what a monitor on `/healthz` looks like: green, warm, and
silent.

### Why `/healthz` was NOT changed to run the pass too

It is the obvious fix and it is the wrong one. **Eight test files poll
`/healthz` in their boot-wait loop**, so alert evaluation and reminder passes
would start firing during startup in suites written to control exactly when a
pass runs (§39's whole design). That is §9's blast-radius rule: the edit is one
line and the damage is in files that do not mention it.

The alternative — firing it from `/healthz` only when `IS_PROD` — is worse
still: production would then be the one environment running a path no test
covers. The fix is one field in the monitor, and it is the operator's, not the
code's.

### Confirmed fixed, by the only evidence that could confirm it

This section says *"nothing proves that anything calls `/health`, and nothing
can — the caller is a row in somebody's UptimeRobot account."* It is now
proven, from the one place outside this repository that could do it: the
reminders check's own ping log, after the monitor was moved.

```
04:02  scanned 0, sent 0, failed 0, 6ms
03:54  …                              4ms
03:48  …                              6ms
03:34  …                              7ms
03:20  …                              7ms
03:06  …                              6ms
02:51  …                              6ms
02:44  status: new → up               196ms
```

**The cadence is the finding.** 02:51 → 03:48 is 15, 14, 14, 14 minutes — five
pings in a row on UptimeRobot's interval, with nothing being pushed. Only a
scheduled monitor produces that, so **the monitor is on `/health` and the pass
is riding it**, which is exactly what had never once happened before §40. The
outage is closed rather than assumed closed.

The three short gaps (7, 6, 8 minutes) are CI: a push runs the live smoke,
which hits `/health`, which runs a pass. That is the same overlap that makes a
single green ping meaningless straight after a deploy — hence the quiet-period
test in the runbook. Here it cuts the other way and is just noise on top of a
cadence that is already unambiguous.

Two smaller confirmations in the same log. **`scanned 0` proves the gate
ordering** (§39: `enabled` and `hook.url` are read off the meta doc, so a
workspace nobody has switched the digest on for never touches the records
collection) — the pass is doing nothing, cheaply, which is the design. And
**the body is the counts-only one**, which is what proves this check is fed by
the reminder pass rather than by the backup job: the swap that would leave
both checks green (`docs/BETA.md` § *Rotating either ping URL*) has not
happened. `196ms` on the first ping and single digits after it is a cold start
followed by a warm service.

### The other log line: an expected refusal, reported as a fault

```
Unhandled error on POST /api/feedback: PayloadTooLargeError: request entity too large
    at readStream (…/raw-body/index.js:163:17)
    …
```

Correct behaviour, mislabelled. The error handler logged **before** it
classified, so a body over the 64 KB limit — the guard working — was written
out as an unhandled error with a full stack trace. And it is not rare: the live
smoke test posts a 200 KB body on **every run** (§38), so every deploy check
left one of these in the production log.

Classification moved above the log. An expected refusal is now one line on
`console.warn` (`Refused 413 POST /api/feedback: entity.too.large`); anything
unclassified keeps the stack trace on `console.error`. Expected is not the same
as uninteresting — a burst of them is still worth seeing — so it stays on
stderr rather than being swallowed.

**Asserted on the server's own output, not on the status code**, because the
status was already right on the broken version: 413, every time. The defect
lived only in the log, so only the log can catch it. *"a refused oversized body
is logged as a refusal, not as an unhandled error"* fails on the pre-fix
handler at the `Unhandled error` assertion.

The cost of a log that shouts at its own working guards is the one §25 already
names for alerts, in a new place: it trains the reader to skim, and the lines
worth reading are the ones that get skimmed.

### The privacy page said "complete list" and was not, again

Both notification channels were verified live after the monitor fix, and the
operator channel's own history is what showed it: a problem report sitting in
Telegram carrying a beta tester's **email address** and what they wrote.

`privacy.html` named Render, Atlas, Google and GitHub, said *"If a problem
report is sent, we may receive a notification containing your email address and
what you wrote"* — and then closed the section with **"That is the complete
list."** It never said *where* that notification goes. Telegram holds real
personal data for this deployment and was not on a list that declares itself
complete, which makes the sentence false rather than merely brief.

**Exactly the GitHub omission from earlier in §38, in the same paragraph, found
the same way** — by looking at a live artifact instead of at the code. The rule
that section states ("a privacy page is the last place an intention should be
written as a fact") has a second half now: *a page that claims completeness has
to be re-checked against what the deployment is actually doing, not against
what the code could do.*

**`docs/archive/UK-LAUNCH.md` had it right and the shipped page did not.** Its
roster reads "…and whatever `FEEDBACK_WEBHOOK_URL` points at. A tenant's *own*
workspace webhook is their choice and not ours to declare." That is the correct
analysis, written in a frozen plan, never carried across to the page a regulator
reads. A plan being right is not the same as a product being right.

Three things now said, and the distinctions are the substance:

- **Telegram is named**, because it genuinely receives personal data.
- **UptimeRobot and healthchecks.io are described but not listed as recipients
  of data**, because they receive none — one asks whether the site answers, the
  other is told `scanned N, sent N, failed N` (§39's counts-only ping). Listing
  them beside Telegram would imply they hold something. Padding a roster is its
  own kind of inaccuracy.
- **The workspace digest is disclosed and explicitly excluded from our list.**
  The destination is the *owner's* choice, so on the controller/processor split
  the tenant owns it — but a team member deserves to know their workspace can
  send counts somewhere their owner picked. §39's counts-only rule is what makes
  that sentence short enough to be reassuring.

**No `CACHE_VERSION` bump.** `privacy.html` is in `sw.js`'s `STANDALONE_PAGES`
and goes straight to the network, never precached (§19) — checked rather than
assumed, including that it is absent from `APP_SHELL`.

### Invites and beta codes: the third thing a restore cannot bring back

Found while answering "what is next", by reading the export rather than the
code that consumes it. `GET /api/admin/export` carried `orgs`, `users`,
`accessRequests`, `platform`, `workspaces` — and **not `invites`, not
`betaCodes`.** Nothing in §17 or in the route's own comments mentions either;
the version-2 note explains why `accessRequests` and `platform` were added and
never considers them. So this is a third collection lost by the same export, of
the same class §17 records as *"found by running the drill, not by reading it"*,
still undiscovered because no drill had ever exercised an outstanding invite.

It was already live: after the Frankfurt migration every invite link a
colleague was holding was dead, and the beta codes were gone. That is why
"mint fresh beta codes" had been sitting on the to-do list with no explanation
attached.

**They should stay out of the export, and that is the whole design.** An unspent
invite grants membership of an org; a beta code grants an account. Both are
bearer credentials of exactly the class §17's rule keeps out of the artifact
("NEVER PUT A CREDENTIAL IN `platform`"), and a GitHub build artifact is
downloadable by anyone with repo read access. Exporting them to make a restore
lossless would put org membership into a file whose audience §17 is already
uneasy about.

So the fix is the §38 shape again, one level up: **carry a count, not a code.**

- The export gains `outstanding: { invites, betaCodes }` — two integers.
  `version: 3`, informational as before.
- **Only the VALID ones.** A spent, revoked or expired invite is already dead,
  so counting it inflates the number an operator has to act on — §25's noise
  problem in a new place. Guarded: swap `inviteState`/`betaCodeState` for a
  bare `.length` and the fixture's dead pair makes it report 2 and 2.
- `restore.mjs` turns a non-zero count into `platform.restoreNotice` and says
  so in the terminal.
- **Admin → Deployment shows it until dismissed.** Not the terminal alone —
  §38's entire lesson is that a line read once during an incident is not a
  record, and the digest that stopped was noticed weeks later.

**Why dismissible rather than self-clearing.** There is no event that means
"everything needed has been reissued": minting one invite says nothing about
the beta codes. Inferring it would clear the notice with the work half done,
and leaving it forever turns a line that matters once into furniture. So an
operator says so explicitly, and nothing guesses.

**Setting the key to `null` rather than deleting it** works identically on both
stores — FileStore spreads the patch, MongoStore `$set`s it, and the read is
`restoreNotice || null` either way. A `$unset` would be a special case on one
backend and not the other, which is §25's FileStore/MongoStore divergence: the
standing example of that costing an afternoon.

**The rejection wording is NOT changed, deliberately.** §13 makes every invite
failure answer identically so codes cannot be enumerated, and that is a
security property, not an oversight. The consequence is that the person
clicking a dead link cannot tell a lost migration from a wrong code — which is
precisely why the *operator* has to be told, since they are the only one who
can reissue and the only one who would otherwise never find out.

**Traps, and two of them were in my own tests:**

- **The version-1 clone kept `outstanding`.** `a backup from before this change
  still restores` builds its legacy file by deleting `accessRequests` and
  `platform` from a current one — so it was a v1 shape carrying a v3 key, and
  the restore correctly wrote a notice into a platform the test required to be
  empty. Deleting `outstanding` too is what makes it a real v1 file, and it
  pins the honest answer for an old artifact: it genuinely does not know how
  many invites were live, so it claims nothing.
- **`doesNotMatch(/do NOT come back/)` matched the WEBHOOK block.** Both
  notices use that phrase, so the companion test failed against correct code
  for a reason that had nothing to do with invites. Matched on
  `/unused team invite|unspent beta code/` now — wording unique to this notice.
- **The leak assertion searches the whole artifact**, not a named field.
  `invites` and `betaCodes` are absent as *keys*, so a field-by-field check
  would pass on a version that smuggled them somewhere else entirely. Same rule
  as §38's webhook assertion.
- **Dismissing must invalidate `platformCache`**, or the panel goes on showing
  the line for another 30 seconds and the button reads as having done nothing
  (§24's rule, from suspending an org).

Four mutations checked, each failing by name: marking every restore fails *"a
deployment with nothing outstanding is not told to reissue anything"*; never
marking fails *"the restore records what it could not bring back"*; counting
dead rows fails the count assertion; dropping the cache invalidation fails the
panel test.

### The restore runbook was a drill and not a procedure

Reported directly: the backup drill in `docs/BETA.md` was fine, but there were
no steps for putting a backup into a **new** or an **existing** database —
which is the thing you actually do, and the thing you do while something is on
fire.

§ *"Restoring for real"* now covers both, and the parts worth having written
down before you need them:

- **Which of the two restores you want.** `scripts/restore.mjs` is
  whole-deployment; *Settings → Import backup* is one workspace. If one
  customer deleted something, the script would take every *other* tenant back
  to the state in the file with them.
- **Into a new database, restore BEFORE pointing the deployment at it** —
  §21's first-account-becomes-`platformAdmin` bypass is a wide-open door for
  the minutes a fresh cluster sits empty, whatever `ADMIN_EMAILS` says.
  `RESTORE_OVERWRITE=1` is **not** needed there; the script refuses only when
  the target already has accounts.
- **Into an existing one it is destructive**, and the gap is
  `exportedAt` against now — for every tenant, not just the one being
  recovered. Take a fresh export of the broken state first: a damaged database
  still holds rows the backup does not.
- **Verify in the order that catches real failures.** Counts pass happily when
  rows land in the wrong workspace (§17's wsId collision: 174 of 180 records
  lost, every total plausible), so the sequence ends with signing in as a named
  account and then as a *second* tenant.

### Phase 1 of the UK launch: encrypt the artifact, and KEEP `accessRequests`

The nightly job lives in the private repo `Mohamed-AH/crmback` (§17), so the
workflow was written out and handed over rather than committed here. What
changed, and the two decisions inside it:

**Encrypted with `gpg --symmetric --cipher-algo AES256`.** The artifact is
every customer's records plus `accessRequests`, and a GitHub build artifact is
downloadable by anyone with read access to the repository. Encryption is what
makes "read access to the repo" stop meaning "read access to every customer's
CRM". Symmetric rather than asymmetric on purpose: asymmetric is stronger and
means key management, and a key managed badly is worse than a passphrase you
can actually find during an incident. Say that rather than implying the
stronger option was overlooked.

Three properties the workflow needs and would be worthless without:

- **A missing `BACKUP_PASSPHRASE` fails the job**, rather than falling back to
  plaintext. *"Encrypted unless it wasn't"* is the worst of the three states —
  you would believe the artifact was safe and nothing would ever contradict
  you. That is §17's no-op-that-reports-success in a new costume.
- **It proves the ciphertext decrypts BEFORE deleting the only readable copy.**
  An artifact that cannot be opened is not a backup, and finding that out
  during an incident is the exact failure the job exists to prevent.
- **The shape check still runs on the plaintext**, before encryption. You
  cannot check the shape of a thing you have already sealed, and catching an
  error page or a truncated body is the whole reason that step exists.

**`accessRequests` stays in, against the plan's own line.** `docs/archive/UK-LAUNCH.md`
Phase 1 says to omit it. Checked rather than executed (§21's treatment), and
the omission is the worse of the two options:

- **Approval IS the allowlist** (§20). Dropping the collection means every
  approved person has to ask again after a recovery — restoring the exact
  failure §17 records for the two collections that *were* missing.
- **Encryption already closes the exposure it was reaching for.** The concern
  was personal data about people who never became users, readable by anyone
  with repo access. Once the artifact is ciphertext, that audience is gone.

So the two changes are not independent: doing the first is what makes the
second unnecessary. Doing the second *instead* would have degraded recovery to
solve a problem the first one already solved.

**The frozen plan is left saying the opposite, on purpose.** §29's rule —
editing a plan's premises after the fact loses the reason the plan was shaped
that way. `docs/archive/README.md` carries the correction in its known-false
list instead, which is the mechanism that exists for exactly this.

**Not yet claimed on `privacy.html`.** The page says the nightly backup is
stored on GitHub and says nothing about encryption, which is currently correct
— the workflow is written but not merged. §38 records a first draft of that
same paragraph asserting backups *"are encrypted"* when they were not, caught
before the commit. The sentence goes in when the encrypted job has actually
run, not when it has been handed over.

**`docs/BETA.md` § *"Decrypting a backup"* is the operator-facing half**, and
it is written for the person doing this during an incident rather than as a
feature description:

- **The command twice** — once with `--passphrase "$BACKUP_PASSPHRASE"` for
  scripting, once prompting, because the second is the better habit on a shared
  machine and the first is what you reach for when tired.
- **A table of the four things that go wrong**, because
  `decryption failed: Bad session key` names a session key and means *you typed
  the wrong passphrase*, and a sub-1 KB `.json` is not an encryption problem at
  all — it is the export having returned an error page, which is a
  `BACKUP_TOKEN` fault two systems away.
- **Decrypting is called half the drill.** The workflow proves the round trip
  on the runner before deleting the plaintext, but *the runner proving it* and
  *you proving it* are different claims and only the second helps at 2am. Same
  distinction as §39's push-versus-pull staleness split.
- **Cleanup names the decrypted file specifically.** A `.json` left in
  Downloads is plaintext customer data on a laptop — the exact state the
  encryption exists to prevent, recreated by hand at the end of a drill that
  was meant to increase safety.
- **`MONGODB_URI=` was missing from the new-cluster step-1 command** and is
  there now. Every drill command already carries it; the migration path had one
  that did not, and that is the line where a stray `.env` reaches a real
  database.

The secrets table sits in § *"Knowing the backup ran"* rather than in
`DEPLOYMENT.md`'s environment matrix, deliberately: these are **GitHub Actions
secrets in a different repository**, not service environment variables, and
listing them beside `MONGODB_URI` would invite somebody to set
`BACKUP_PASSPHRASE` on Render where it does nothing at all.


---

## 41. Versioned terms, and the button that settled as a dismissal

Phase 2 of the UK launch (`docs/archive/UK-LAUNCH.md`). `terms.html` gained the
processor half — what we do with the records a customer puts in on *their*
customers' behalf, who else touches it, the 72-hour breach notice, what
survives a deletion — and the app now asks people to agree to it and records
**which version** they agreed to.

### A version, not a flag, and `!==` rather than `<`

§19 already stamps `betaAcceptedAt`, and a bare timestamp cannot answer the
only question that matters once the text moves: *did they agree to the terms as
they stand?* So the row carries `termsAcceptedVersion` **and**
`termsAcceptedAt` — the version is what the client compares, the date is what
makes the record evidence.

**Compared with `!==`, deliberately.** "Have they agreed to something at least
this new" would let a version that goes *backwards* — a bad publish pulled and
replaced — count everybody as already accepted. `!==` re-asks. It also means
the version never has to be orderable, which is what lets it be **a date
somebody can look up** against the published page rather than a counter nobody
can.

**`TERMS_VERSION` in `server.js` and the `Last updated` line in `terms.html`
are the same fact in two places and must move together.** That is exactly the
shape §29 warns about, and it is accepted here because the alternative — the
server parsing its own HTML at boot — is worse than the duplication. Both ends
carry a comment naming the other. Bump one alone and you either re-prompt
everybody for a document that did not change, or change the document without
telling anybody.

**Deliberately NOT an environment variable.** A seam there would let a
deployment claim acceptance of text it is not serving, and unlike
`GOOGLE_TOKEN_URL` (§30) there is nothing legitimate to point it at — the E2E
half fakes a bumped version by intercepting `/api/me`, which needs no override.

**The server stamps its own version; the POST has no body at all.** Same rule
as `req.scopeOrgId` and `workspaceIdFor()` (§5): what is stored is what the
server established. Guarded by *"the version is the SERVER's, never the
caller's"*, which posts `termsAcceptedVersion: '1999-01-01'` and requires it
not to reach the row — and by an E2E half that intercepts `/api/me` to claim
`2099-01-01` and asserts the stored version is not that either. With nothing to
read there is nothing to coerce, so §30's Phase 2 sweep gains no new call site.

### Absence is not an answer, again

Offline, `/api/me` never resolves and `termsVersion` is simply missing. Reading
that as "they have not accepted" would put a contract in front of somebody
working with the connection down and then fail to record their answer — §19's
beta-notice bug, in a new place. It asks only when the server **positively
said** which version it wants.

Guarded, and the guard is the interesting half: asserting the modal is absent
proves nothing on its own, because an account that already agreed is also
silent. So the test drops the interception and reloads, and the modal **does**
appear — which is what shows the silence came from the missing field.

### Declining has to exist, and dismissing must not

Two different things, and collapsing them was the first draft's mistake:

- **Sign out** is the decline. An "I agree" with no alternative is not
  agreement, and the stored row is supposed to be evidence that somebody
  *chose*. It destroys nothing — the workspace stays on the server and in its
  own local store — and it takes the same `pushNow` → `logout` →
  `switchScopeTo(ANON)` exit the Settings button uses.
- **Escape or a backdrop click** is "not now": nothing recorded, asked again
  next time, app not blocked. A modal that cannot be dismissed is one render
  bug away from locking somebody out of their own CRM, which §3 exists to
  prevent.

`Cloud.acceptTerms()` failing leaves the version unset, so it returns next
time. Shown twice is an annoyance; recorded-but-never-sent is a false record
(§19).

### `legal.css` had no `h3`

The processor section is the first on either legal page long enough to need a
second heading level, and `legal.css` defined `h1` and `h2` only. An `h3` falls
to the browser default — **larger than the 19px `h2` above it** — so the
subheading would have read as more important than the section containing it.
§27's invented-class trap arrived at through a plain tag rather than a class
name, which is why grepping for `.note.warn`-style mistakes would not have
found it.

### "I agree" recorded nothing, and the E2E suite is the only thing that knew

The one worth remembering, and it is a product bug rather than a test one.

```js
$('#terms-ok', modal).addEventListener('click', () => {
  closeModal();      // fires crmb:modal-closed SYNCHRONOUSLY
  resolve(true);     // …by which time the promise has already settled false
});
```

`closeModal()` dispatches `crmb:modal-closed` on `#modal-root`, and the
dismissal listener resolves the promise on it. So pressing **I agree** settled
as *dismissed*, `Cloud.acceptTerms()` was never called, and nothing was ever
written. **Sign out lost the same race**, which is worse: the button that
exists so declining is possible did nothing at all.

`askAboutRemovedFields` (§22) already had the right shape — set `answered`,
detach the listener, *then* close — and this was written without looking at it.
The fix is a single `settle()` that does those three in that order, which is
also what makes the ordering hard to reintroduce by editing one handler.

**The Node tests could not have caught it.** `POST /api/me/terms-accepted` was
covered six ways and every one passed, because they call the endpoint. The
defect was that nothing in the browser ever called it — the same shape as §30's
"the UI is not the boundary" turned around: here the endpoint was not the
product.

**And the blast radius was almost entirely elsewhere.** 13 failures on the full
run; **only 3 were terms tests**. The other ten reported
`<div class="modal-backdrop"> … intercepts pointer events` on a click many
steps later — multi-device sync journeys, four team-workspace journeys, the
admin panel, a restore test — because nothing had been recorded, so the modal
came back on the next reload and sat over a page the test was clicking on. Not
one of those failures names terms anywhere in its message. §9's blast-radius
rule, arrived at from a modal.

Checked against the broken state: restoring the close-then-resolve order fails
**3 of the 4** terms journeys, including *"declining signs out and records
nothing"* — which is the assertion that shows the decline path was broken too,
and that a test written only around the happy path would have missed.

### Agreeing now comes before the invite is redeemed

Found by the second full run, after the ordering bug was fixed: eight team
journeys still failed, all of them on a **colleague** signing in with an invite
in hand. `redeemPendingInvite()` ran first and put its own *join* prompt on
screen, so the terms modal could not appear until that was answered — and the
helper signing that colleague in was waiting for the terms modal. A deadlock,
reported as a 45s timeout on `#terms-ok`.

**Fixed in the app rather than in the helper, because the app's order was
wrong.** Joining a team swaps the local replica out and can drop unsynced work;
asking somebody to agree to the terms of the service *after* they have been
moved into somebody else's workspace has the agreement arriving too late to be
one. Terms → invite → beta notice, each awaited, so only one modal is ever up.

Signing out at the terms modal now simply leaves the invite unredeemed:
`redeemPendingInvite()` already guards on `Cloud.isAuthed` and holds the code,
toasting *"Sign in to join the team you were invited to"*. Nothing is spent and
nothing is lost.

The general rule, and it is the reusable part: **a prompt added ahead of the
terms will sit in front of them.** Anything inserted into that sequence has to
be placed against the two facts above rather than appended.

### The helper still has to wait for the record, not the click

Separate from the bug above, and still load-bearing. `signIn()` — which 64
tests go through — has to walk past this modal, and the naive version waited
for `#terms-ok`, clicked, and returned. The modal closes the instant the button
is pressed; `Cloud.acceptTerms()` resolves after that. Returning in between
leaves the POST in flight, so a `page.reload()` can still fetch an `/api/me`
that says nothing was accepted.

So it waits on the state the app itself decides on — `Cloud.me.termsVersion`
against `Cloud.user.termsAcceptedVersion`, the client mirror being set only
once the request resolves. That also removed the guess about whether a modal
was coming at all: **no fixed timeout anywhere in it**, because "no modal
appeared in six seconds" is exactly the assertion a slow machine turns into a
lie (§32).

**And `Cloud` is a bare global, not `window.Cloud`** — §39 records this for
`DB` and it cost a first draft here too. A top-level `const` in a classic
script is lexical, so the property form is `undefined` for ever and a
`waitForFunction` on it times out naming the wrong thing.

### `privacy.html` can now say the backup is encrypted

§40 deferred that sentence: *"it goes in when the encrypted job has actually
run, not when it has been handed over."* It has — the artifact was downloaded,
decrypted and restored end to end — so the page now says the nightly backup is
encrypted before it is stored, with the passphrase held separately, **and says
what that buys**: being able to download the file is not the same as being able
to read it. Scoped to *read* access on purpose, which is the claim that is
actually true (§40).

Its `Last updated` line moved with it. That page is not versioned by
`TERMS_VERSION` and deliberately does not prompt — a privacy notice is
information, not a contract to accept, and §36's rule about not nagging applies.

### Which user-facing docs this touched, and which it did not

§27's rule is that a change to *what a user can do* gets walked through six
documents. Walked, and only one of them needed anything: **`docs/BETA.md`'s
tester note**, which now says the prompt exists, names the section worth
reading, and says a *Sign out* sits beside the *I agree* and deletes nothing.

`USER-GUIDE.md` and `manual.html` do not narrate the sign-in flow step by step
— they say "signing in adds sync" and move on — so a new step in it makes
neither stale. Padding them to look thorough is its own inaccuracy (§40, on the
privacy roster). Recorded so the omission reads as checked rather than missed.

**No `CACHE_VERSION` bump for the legal pages** — both are in `sw.js`'s
`STANDALONE_PAGES` and go straight to the network, never precached (§19),
checked rather than assumed. The bump to `crmbuilder-v40` is for `js/app.js`
and `js/cloud.js`, which are in `APP_SHELL`.


---

## 42. The consent template, and a date import that lost a day east of Greenwich

Phase 3 of the UK launch (`docs/archive/UK-LAUNCH.md`), which the plan sized at
*hours* and described as "a module template seeding lawful basis, consent date
and source… check `fmtDate` and move on." The template is that. The rest of
this section is what checking found.

### Why it is a module and not three fields on Contacts

The obvious shape is `lawfulBasis` / `consentDate` / `source` on the Contacts
template, and it is wrong three ways:

- **It changes the default for everybody.** Contacts is what almost every
  workspace picks first, so three pieces of UK/EU jargon would land in front of
  a sole trader in Ohio who will never need them.
- **It reaches nobody who already exists.** Fields belong to a module, not to a
  template, and only an owner may edit them (§14) — so every current workspace
  would be untouched while every new one changed. The worst of both.
- **It breaks the demo.** `tests/demo.test.mjs` asserts every field of a seeded
  module is filled — "an empty column in the demo" (§34) — so three new
  Contacts fields would mean regenerating `js/demo-data.js` to invent consent
  records for forty fictional people.

A seventh template opts in, costs nothing to anyone who does not pick it, and
is skipped by the demo loader for free: `loadDemoData` and
`scripts/seed-fixture.mjs` both `continue` on a template with no rows.

**No relation field, and that is a constraint rather than a preference.**
`createFromTemplate` copies fields verbatim and does **not** bind
`relatedModuleName` to a runtime `relatedModule` id — only the demo loader does
that, in its own pass. A relation in a template would therefore create a picker
pointing at nothing: an empty dropdown that reads as "not configured yet"
rather than as broken (§36 again). The person is named in text, exactly as
`Deals.contact` already does.

**Option text is record data, so the options are short.** The six statutory
names, not glossed sentences — every row stores the string, carries it into
every CSV and JSON export, and renders it in a table cell.
"Contract — needed to do business with them" is 42 bytes per row and an
unreadable column. The plain-English table lives in `docs/USER-GUIDE.md` and
`docs/manual.html`, where there is room and where nobody pays for it per record.

### Two lists that had gone stale the moment a seventh template existed

Both are §29's thesis — a list written in a second place is a list that goes
stale — and both are derived now:

- **`TEMPLATE_KEYS` in `tests/demo.test.mjs`** was six keys typed by hand. Left
  alone it would have walked six templates and said nothing at all about the
  new one, which is the quiet half of the failure.
- **`.template-card` count in `tests/e2e.spec.js`** was a literal `6`. §34
  explicitly kept it as a literal on the grounds that it "really is about
  TEMPLATES rather than the demo" — true, and it still went stale the first
  time TEMPLATES grew. It reads `templates.js` now, like `DEMO` beside it.

**The exception the demo makes is NAMED, not inferred.** `consent` seeds no
demo records, so "every module has records" needed an escape — and deriving
that escape from `DEMO.records` would make the assertion vacuous, passing just
as happily on a dataset that had quietly lost Contacts. `DEMO_SKIPS` is a
one-key set with the reason attached, and it is itself asserted: a key that is
not a template, or one the demo actually fills, fails.

Why the demo does not carry it: a consent register covering six of the demo's
forty contacts reads as compliance half-done, which is worse than absent, and
covering all forty doubles a third of the dataset to show a module most
workspaces will not pick.

### A test for a hazard nobody had covered: template samples

`createFromTemplate` seeds a template's `samples` into a real workspace whenever
somebody leaves "Include a few sample records" ticked. Those rows carry exactly
the ghost-data and impossible-option hazards `demo.test.mjs` already checks for
the demo — **on rows that reach a new user's first screen** rather than a demo
they asked for — and nothing tested them.

The five existing templates were clean when checked, so this is a guard rather
than a fix. It also covers a placeholder: `{ __rel: n }` and `{ __ref: … }` are
resolved by `loadDemoData` and by nothing else, so one written into a template
sample out of habit is stored as a raw object and renders `[object Object]`.

The "never filled" direction is deliberately **not** asserted for samples. A
sample is illustrative, not exhaustive — Contacts leaves `notes` empty on
purpose, and requiring every field would push filler into the first rows a new
user sees.

### The plan's second half: checked, and one claim held

*"GBP is already in `CURRENCIES`. Dates store `YYYY-MM-DD` and
`<input type="date">` renders in the browser's locale… check `fmtDate` and move
on."* Measured rather than accepted:

| Claim | Verdict |
|---|---|
| GBP available and renders as `£` | true — `£2,400`, and in `en-US` too |
| `fmtDate` is locale-aware | true — `12 Sept 2026` in `en-GB`, `Sep 12, 2026` in `en-US` |
| The stored day never shifts on display | true — `new Date("2026-09-12T00:00:00")` is local midnight, so only the calendar parts are formatted |
| Date fields are native `<input type="date">` | true — `js/app.js` line 2275 |

### The bug the plan did not anticipate, and it is a UK one

**The CSV importer stored the wrong day for every non-ISO date, everywhere east
of Greenwich.**

```js
const d = new Date(v);            // "12 September 2026" → LOCAL midnight
return d.toISOString().slice(0, 10);   // …converted to UTC → "2026-09-11"
```

Measured across four zones: `Europe/London` and `Europe/Berlin` shift,
`America/New_York` and `UTC` do not. That is §37's signature exactly — correct
for whoever wrote it, wrong for the half of the world this launch is aimed at —
and §37's own sweep missed this call site because it swept *comparisons* and
this is a **write**.

Silent, too: the cell shows a plausible date one day out, on the bulk path where
nobody re-reads every row.

Fixed by reading the calendar day back with local getters. Guarded by an E2E
test in its **own `test.describe` with `timezoneId: 'Europe/London'`** — the
container and CI both run UTC, so the test would pass on the broken code
without it, and that is the entire reason the zone is pinned rather than
assumed. Scoped to one describe because setting it suite-wide would move every
date assertion in the file (§9). The date is in **September**, deliberately:
BST is what makes local midnight cross the UTC boundary, and a January date
passes on the bug. Checked against the broken state: `2026-09-11` against
`2026-09-12`, named in the diff.

### What was NOT fixed, and why it is a decision rather than an oversight

**`03/04/2026` imports as 4 March, not 3 April.** `new Date` reads slashed
numeric dates American-style whatever the browser's locale, and `13/04/2026`
is not read at all — there is no 13th month, so that cell arrives **empty**.
So a UK spreadsheet imports with some rows silently wrong and some silently
blank.

Not fixed here, because the fix is not a bug fix — it is a **choice**, and
choosing wrong breaks the users who work today. Preferring DD/MM would silently
re-date every US import; inferring per column from "is any first component
above 12" guesses on the ambiguous rows, which is the same class of silent
wrongness in the other direction. The honest answer is a format control on the
mapping screen, which is real UI with real tests and is not the "hours" this
phase was sized at.

Stated instead, in both user docs, with the ten-second workaround: format the
column as `YYYY-MM-DD` before exporting, which the importer takes exactly as
written. Every example in those paragraphs was **run** before it was written.

> **Now built — see §45.** The analysis above is what shaped it and stands:
> the order became an *input* rather than a better guess. The workaround
> paragraphs it describes are gone from the user docs, replaced by the
> control.

### And one more default that is wrong for this launch, reported not changed

`DEFAULT_SETTINGS.currency` is `'USD'`, so a UK business sees USD preselected
at onboarding and must notice. Getting it wrong is not free later: §23 records
that changing currency **relabels** rather than converts, for the whole team,
behind a confirmation.

Not changed, because there is no API that maps a locale to a currency — only a
hand-written table, which is the second source §29 exists to warn about — and
because the better signal (the device time zone, which the digest picker
already reads) needs a second table of its own. It is one dropdown on a screen
the user is already reading, so the cost is small and the fix is a real design
decision rather than a line.

### Blast radius

`js/templates.js` is in `APP_SHELL`, so `CACHE_VERSION` → `crmbuilder-v41`.
No server change: `ASSET_DIRS` already allow-lists `js/` and the smoke test
already names `/js/templates.js`, so the count stays 43.

### One failure in one run, and what is known about it

*"unsynced work from a previous workspace never lands in the new team"* failed
once, on the first full run, timing out after 25s waiting for the joiner's
`/api/me` to report the new org. Recorded rather than dismissed, because §32
and §35 are both about not writing "flaky" over a defect — but also not
inflated, because the evidence says what it says:

- **5 of 5 in isolation**, 7.4–8.4s each, and **98 of 98 on the next full run**
  at 4.9m. The suite is not getting slower (5.0 → 5.2 → 4.9), so §32's
  accumulating-resource signature is absent, and `data/e2e` was checked at 8 KB.
- **Nothing this phase changed sits between the click and the join.** §41 moved
  `showTermsIfNeeded()` ahead of `redeemPendingInvite()`, but both are after the
  sync, the terms check returns immediately for an account that already agreed,
  and `[data-join]` had appeared — so the redeem path ran.
- **The race is the test's subject, not a fault in it.** It clicks *Join* and
  then un-blocks `/api/sync`, because that is precisely the window in which a
  flush aimed at the old workspace would go out. `redeemPendingInvite` pushes
  before joining (§13) and the push is `.catch()`-ed, so it cannot stop the
  join — but under load the whole sequence can run long.

**The 25s budget is the only lever, and widening it is the wrong move**: it is
what makes "the join did not happen" distinguishable from "the join was slow",
which is the assertion. Left alone. If this recurs, start from the joiner's
console rather than from the timeout — `Could not join that team` in it would
mean `reconcileWorkspace` threw after a server-side join that did succeed, and
that is a different bug from the one the timeout suggests.


---

## 43. Subject access requests, and closing your own account

Phase 4 of the UK launch (`docs/archive/UK-LAUNCH.md`), in the two stages the
plan sized it at. Both are controller-side tools: a tenant answering a request
about *their* customer, and a tenant leaving. Neither makes the obligation ours.

### Stage 1 — the search, and why it is a search

**This data model has no concept of a data subject**, which the plan named and
which is the whole shape of the feature. A person is a record in Contacts, but
their name may equally sit in a Notes body, in a relation on a Deal, or in a
field somebody invented last year. So the answer to "what do you hold about me"
is a **text search across every stored value**, and the output is a list of
places to go and look rather than an automatic extract.

Client-only, no endpoint, nothing the server can refuse — §37's due-filter
shape. `js/dsar.js` is pure and carries the matching rules; `tests/dsar.test.mjs`
requires it through §39's seam, so what is unit-tested is what the browser runs.

**Four decisions inside the matching, and each is a way the search could have
answered wrongly:**

- **Relations are matched on the resolved NAME, never the stored id.** A person
  appears on a Deal without their name being anywhere in that Deal's values —
  the field holds a uuid. Searching raw values finds nothing, and "we hold
  nothing about you" is the one answer a subject access request must never get
  wrong. `relationNameMap()` builds names for **every** record in the
  workspace, rather than reusing `primeRelationCache`, which fills lazily per
  module for rendering: a module it never primed is a person the answer
  silently does not mention.
- **It walks `record.data`, not `mod.fields`.** §22: removing a field leaves
  its values in place unless the user chose to purge them, and they travel in
  every export. Walking the schema would miss data the workspace genuinely
  holds. A key with no field is reported as `orphan` and shown as *removed
  field* — the single most useful thing this search can tell a controller,
  because it is data they had stopped being able to see.
- **Accent- and case-folded on both sides.** "Jose" has to find "José". Cheap,
  and without it the tool is confidently wrong about exactly the names a UK/EU
  customer base contains.
- **Sample rows are included and flagged, never filtered.** Editing a seeded row
  keeps `_demo` (§11), so a row can be fictional in origin and hold something
  real typed over it. Hiding them makes the bundle quietly incomplete; naming
  them lets the reviewer discard them at a glance.

**Two characters minimum**, not one and not three: one matches most of a
workspace and buries the answer, three refuses "Li" and "Ng".

**Available to every role, deliberately** — the same reasoning §36 records for
Export: it reads and writes nothing, and it returns strictly *less* than the
export button directly above it already hands anybody. Gating the subset while
allowing the whole would be theatre.

**Results are shown before anything is downloadable, and that is the design.**
A substring search over-matches — "Ali" finds "Alison" — and a record naming two
people holds data about both. Sending that on is itself a disclosure, so the
review happens on screen and the download button sits underneath it.

**The limits travel inside the file.** The bundle is read by somebody who did
not run the search and never saw the warning: a colleague, a solicitor, the
subject. So `limits` is part of the JSON — different spellings, numbers in a
Number field, a colleague's device that has never synced, and the instruction to
review. A file that reads as a complete answer to a question it only partly
answers is the failure mode here.

**It syncs first, and says when it could not.** This device holds a replica;
answering a legal question from yesterday's copy is §39's stale-preview problem
with a much larger bill. When the pull fails the result says which rows it was
able to look at rather than quietly meaning less.

**Painted into `#dsar-results`, never re-rendered** — a full `renderSettings()`
would wipe the query the reviewer just typed. §38's Telegram rule, second
occurrence.

### Stage 2 — closing your own account

The route §21 said would come, and **the first caller for which
`wouldStrandDeployment()` is actually reachable**: it lives inside
`deleteAccount()` rather than at the admin call site precisely so this one
inherits it, and the admin route refuses any action on your own account.

**Two routes, and the split is the point.** `GET /api/me/deletion` says what
would go and whether it is refused; `DELETE /api/me` does it. A rule named at
the last step is a rule somebody meets holding a confirmation they have already
agreed to, so `blocked` is reported *in advance* — computed by the same
`wouldStrandTeam()` / `wouldStrandDeployment()` the DELETE consults, so it is
the real answer rather than a copy of the rule.

**No id in the path, ever.** §5: identity is what the server established.
`DELETE /api/me/:id` is not a route, which is stronger than a route with a
check somebody could later get wrong on the most destructive endpoint here.

**The strand check sits on the ROUTE, not inside `deleteAccount()`**, and that
asymmetry is deliberate: `deleteAccount()` is also the admin path, where an
operator cleaning up is entitled to strand a team. Same act, different
authority.

**Counted live, not read off the meta doc.** `refreshCounts()` maintains
`recordCount` on a push, so a workspace nobody has written to since a
colleague's device synced carries a stale one — and a delete confirmation is
the last place for a figure that is merely usually right.

**The client pushes before asking what is there**, and this was found by the
E2E rather than reasoned: `persist()` only schedules a *debounced* push (§39),
so the confirmation said **"0 records"** to somebody looking at a row they had
just typed. Uploading rows that are about to be destroyed looks odd for one
line and is right both ways — the number becomes complete, and a cancel leaves
the work safely on the server.

**Deleting wipes the local replica; signing out does not.** §11 states it as a
guarantee — "signing out hides a workspace, it never destroys one" — so the
delete path has to do something the sign-out path deliberately does not, or
closing your account leaves the workspace in IndexedDB for the next person to
use that browser. `DB.wipeScope(scope)` + `Scope.clearKeys(scope)`, with the
scope read **before** `switchScopeTo(ANON)` moves it.

**`Scope.current` is a getter, not a method.** Calling it throws, and the throw
would land after the account is already gone on the server.

### The test that passed on the bug, and how it was caught

The first version of the E2E asserted the replica was gone by signing back in
with the same address and checking `DB.getAll('records')` was empty. **It passed
against a build with the wipe removed entirely**, because a new account gets a
new id and therefore a new scope — so the stale database was never in view. The
assertion was measuring the wrong store.

It reads `Scope.dbName(Scope.current)` *before* the deletion and then asserts
`indexedDB.databases()` no longer lists it. That fails on the mutation, naming
the leftover workspace. §9's rule caught it: a test checked against the broken
state, and this one had to be rewritten rather than merely re-run.

### Two things found in the shared helpers

- **`onboard()` matched a template card by `:has-text`**, so asking for
  "Deals" resolved to two cards — Leads' description says "before they become
  deals" — and threw a strict-mode violation. Latent since the helper was
  written; it surfaced the first time a test asked for the one colliding name.
  Matched on `.template-name:text-is()` now.
- **Deals opens as a board**, so a `tr:` assertion on a new Deal times out
  saying only that it found nothing. `.kanban-card` is the row there.

### Blast radius

`js/dsar.js` is a new served file, so all four places had to agree (§3):
`index.html`, `sw.js` APP_SHELL, the smoke test's `ASSETS`, and
`CACHE_VERSION` → `crmbuilder-v42`. `ASSET_DIRS` already allow-lists `js/`, so
no server change — and the smoke count going 43 → 44 is what proves it.

`docs/API.md` carries the two new routes and its route count is **52**, checked
against `grep -cE "^app\.(get|post|put|patch|delete)\(" server.js` rather than
incremented by hand — §29 records that number going stale twice already.

`privacy.html` said *"if you want your account removed and cannot do it
yourself, contact us"*, which is now false in the ordinary case; `terms.html`'s
DSAR-assistance clause said the export was usually enough, which undersold what
is now on the screen. Both updated, and `USER-GUIDE.md` and `manual.html` carry
the whole of both features including what the search cannot find.


---

## 44. The retention review, and the delete button that is missing on purpose

Phase 5 of the UK launch (`docs/archive/UK-LAUNCH.md`), and the last of them.
A controller has to be able to answer *"how long do you keep this?"*, and the
honest state before this was that the app kept everything for ever and gave
nobody a way to see what that meant. Settings → **Data you have stopped using**
lists the records nothing has touched in a window the owner picks — 12 months,
2 years (the default), 3 years, 5 years — grouped by module, oldest first.

Client-only, no endpoint, nothing the server can refuse. Same shape as §37's
due filter and §43's search, and the same reason: it reads rows the device
already holds, so there is no new surface and no new thing to permission.

### It reports and never deletes, and that is the feature

Automated retention deletion is the most dangerous thing that was on the plan.
**A quiet record is not an unwanted one**: a closed matter may be one somebody
is legally required to hold for six years, and nothing in this data model can
tell that from an abandoned lead. A schedule that acted on the list would
destroy the second kind along with the first, and §26 records that a delete
takes the body with it — there is nothing to fish back out.

So the screen says *"a list to review, not a bin"*, and there is no control
that acts on it. The E2E pins that structurally rather than by wording:

```js
await expect(page.locator('#stale-results button')).toHaveCount(1);
await expect(page.locator('#stale-download')).toBeVisible();
```

One button, and it is the download. A "delete these" added later fails that
line by name, which is the point — it is a decision, and it should have to be
taken again rather than slipped in.

### `setMonth(m - n)` overflows rather than clamping, silently

`DateRules.monthsAgo` is the one function in that file that returns an instant
rather than a day coordinate, because it ages `updatedAt`, which is a
millisecond stamp.

The naive version is wrong twice a year and wrong in the direction that hides
it: JavaScript rolls a date over rather than clamping, so **31 August with
`setMonth(-6)` asks for 31 February and lands on 2 or 3 March** — "six months
ago" jumping *forward* past the month it was aiming at. Same for 29 February
minus 24 months. Nothing throws; the cutoff is just quietly a few days out, and
a few days at the edge of a two-year window is a handful of records that appear
or do not.

Parked at the 1st before the month moves, then clamped to the last day that
month actually has. Guarded by four tests in `tests/dateRules.test.mjs`, and
**three of the four fail on the naive version** — checked, per §9.

Local getters and setters throughout, deliberately: the time of day survives
the shift, so a DST boundary moves the instant by an hour rather than moving
the calendar day. For a 24-month window an hour is immaterial and a day is not.

### `updatedAt`, not `createdAt`, and rows with no clock are counted separately

"Stopped using" is about the last time somebody touched it, so it keys on
`updatedAt`. A row whose clock is missing or zero cannot be aged at all —
usually something restored from a hand-edited file — and it is **counted and
named rather than silently dropped or silently included**. Either of those
would make the total a number nobody can reconcile against the record count
they are looking at, which is §33's adjacent-and-wrong figure in a new place.

Orphaned rows (a `moduleId` no module answers to) are skipped: there is nothing
to name them by, and §12's rule is that a migration never deletes an orphan, so
they legitimately exist.

### What travels in the file

100 rows on screen, all of them in the JSON — a two-year window over a real
workspace is plausibly hundreds, and a list that long stops being reviewable
while the file stays useful.

The caveats are **inside the download**, exactly as §43's bundle does it,
because whoever opens it next did not run it and never saw the screen: that it
is a report and nothing was changed, that old is not the same as unwanted, that
importing or restoring a record resets its last-changed date, and that rows
which have never reached this device — a colleague who is offline — are not
included. A file that reads as a complete answer to a question it only partly
answers is the failure mode here.

It syncs first and says when it could not, same as the DSAR search.

### `ONBOARDING.md` contradicted its own rollout section

Found while walking §27's six documents, and it is §27's own drift in the file
§27 audited. *"Rolling out to a team"* had been corrected in that pass and
reads properly — one shared workspace, four roles, per-record and per-field
merge. Forty lines below it, under *"Common objections"*:

> **"Can several of us use it at once?"**
> Each person gets their own account and workspace. A single shared workspace
> edited simultaneously by several people isn't what the sync model is built
> for.

Two answers to one question, in one file, forty lines apart, and the wrong one
is the one a person reads when a client asks. §27's lesson was that the
easy-to-forget documents are the HTML ones nothing greps; this adds that **a
document can be half-updated and read as done**, because the section somebody
went looking for was correct.

### Which documents this walked, and what each needed

| | Needed |
|---|---|
| `USER-GUIDE.md`, `docs/manual.html` | a *Finding data you have stopped using* section |
| `docs/ONBOARDING.md` | the objection above, and a "does this help with GDPR" answer |
| `docs/DEMO-SCRIPT.md` | the same question, in the list of ones to expect |
| `docs/product-tour.html` | a tile and a `<details>`, both naming the limit |
| `docs/BETA.md` tester note | the three tools, and §42's CSV date trap |
| `terms.html` | retention is the controller's decision, and we set no period |
| `privacy.html` | nothing — it describes **our** retention as processor |
| `docs/API.md` | nothing — no route was added |

**The privacy/terms split is the one worth keeping.** *"We keep your workspace
for as long as your account exists"* is a statement about what the processor
does and is still true. How long a tenant keeps *their* customers' records is a
controller duty, so it belongs in `terms.html` — and it is written as a tool
offered, never as a period we set, because setting one would be us making the
tenant's decision for them.

All four public-facing answers say the same two sentences: here is what the
tool does, and it does not make you compliant. Claiming otherwise is the
fastest way to be quoted back at.

### Blast radius

`js/date-rules.js` and `js/app.js` are both in `APP_SHELL`, so `CACHE_VERSION`
→ `crmbuilder-v43`. No new served file, so the smoke count stays **44 locally** — and
running it is what proves that, per §9.

`server.js` requires `js/date-rules.js` (§39), so a change there has a second
consumer that no browser test would catch. `monthsAgo` is additive and the
server does not call it; the shared-surface test in `tests/dateRules.test.mjs`
covers the export list either way.

### Still open, and carried forward deliberately

**The CSV date-format control** (§42) — the one piece of the UK launch that was
open work rather than a closed decision. **Built in §45**, which is the section
to read; this paragraph is left as the pointer.


---

## 45. The CSV date format, and a question that has no correct default

§42 found this, costed it, and deliberately left it: `03/04/2026` imported as
4 March for everybody, and `13/04/2026` imported as **nothing** — `new Date`
reads slashed numerics month-first whatever the browser's locale, and there is
no thirteenth month, so a UK spreadsheet arrived with some rows silently wrong
and some silently blank. Two failure modes, both invisible, on the bulk path
where nobody re-reads every row.

### The fix is not a better guess, and that is the whole section

Every guess is wrong for somebody:

| | Breaks |
|---|---|
| keep month-first | every non-US import, which is the launch |
| prefer day-first | every US import, by the same mechanism reversed |
| infer per file | files where nothing happens to exceed 12 — a coin flip presented as an answer |
| browser locale | a UK laptop opening a sheet a US colleague exported |

So **the order is an input**. `js/date-rules.js` gains `parseImportedDay(value,
order)` and `scanDayOrder(values)`, and the import screen asks.

### What the data can prove, separated from what it cannot

`scanDayOrder` returns evidence, never a decision:

- `31/12/2026` **can only be day-first**, and the sample comes back with the
  verdict. The screen quotes it — *"`31/12/2026` in this file can only be
  day-first, so that is preselected"* — because a bare "day-first" is
  something the reader has to take on trust, and a quoted value is something
  they can check against their own spreadsheet.
- `03/04/2026` proves nothing and is counted as **ambiguous**.
- `2026-09-12` and `12 September 2026` name their own month, so they are
  `plain` and ask nothing at all. A control over a sheet of ISO dates is a
  question with one answer, which is noise (§36's rule 1) — so it is absent.
- `32/40/2026` is `unreadable`: no order fixes it, so asking would not help.
  Reporting it as ambiguous would request an answer that changes nothing.

Then the screen, and the three states are the substance:

| The file | The control |
|---|---|
| evidence for one order | preselected, with the value that proves it named |
| evidence for **both** | nothing preselected, and it says some rows were written the other way whichever is picked |
| only ambiguous values | nothing preselected, and **the import is blocked until answered** |

**A required-but-unanswered question disables the import button, and that is
the feature rather than friction.** A default here *is* the bug — it is exactly
what the old code did. The cost is one click, and only on a file that genuinely
cannot be read: in practice any sheet with a couple of dozen dates has a day
over 12 somewhere, so evidence exists and nothing is asked.

Guarded by `#csv-import-go` being `toBeDisabled`, which fails the moment a
fallback order is reintroduced.

### The preview answers in the file's own values

*"`03/04/2026` will be imported as 3 April 2026"*, plus — the half that
matters — *"4 values cannot be read as month-first and will be imported
empty"*. That second line is the old defect named **before** the import rather
than discovered in the table afterwards, and the import's toast repeats the
count for anything that still landed empty.

### Traps and decisions inside it

- **It scans every row, not a sample.** The one value that settles the question
  can sit anywhere in the file, and a cap would leave the control asking
  something the data had already answered. It is a regex over strings already
  in memory.
- **It re-runs when the mapping changes**, because which columns are dates is
  something the person on this screen is still choosing.
- **An explicit answer outranks a preselection** (`userChose`). Without that
  flag the harmless `'ymd'` from the no-decision branch leaks into an ambiguous
  file on a re-paint and sits there looking like an answer nobody gave — the
  exact defect, rebuilt by accident. It is cleared rather than carried.
- **A four-digit leading component is year-first whatever was chosen**, so the
  control cannot corrupt an ISO column that happens to share the import.
- **A month NAME bypasses the order entirely** and goes through `new Date` with
  **local getters** — never `toISOString`, which is §42's own bug and the
  reason this whole file exists.
- **Two-digit years follow POSIX**: 69–99 are 1900s, 00–68 are 2000s. Written
  down because a birthday column is where somebody meets it, and 1969 against
  2069 is not a rounding error.
- **A day that does not exist is refused, never rolled over.** `31/02/2026`
  through `Date.UTC` becomes 2 or 3 March — a plausible value in the cell,
  which is this file's recurring failure shape. `parseDay` already round-trips,
  so the new parser reuses it rather than repeating the check.
- **`dayOrders()` is a function, not an exported array.**
  `tests/dateRules.test.mjs` requires every key on `DateRules` to be callable —
  that is what makes a stale or partial `require()` fail rather than pass a
  shape check (§39) — so a bare array would have broken a real invariant to
  save a pair of brackets.

### Where the parsing lives, and why not a new file

In `js/date-rules.js`, which is already the one place calendar-day arithmetic
happens without a date library, is already unit-tested through both the
`new Function` harness and `require()`, and is already the file whose header
explains the UTC trap this is another face of. A new `js/csv-dates.js` would
have cost §3's four-places dance and a smoke-count bump to separate two
functions from the ones they lean on.

**`server.js` requires this file** (§39), so it has a consumer no browser test
covers. Both additions are pure and the server calls neither; the shared-surface
test covers the export list either way.

### Checked against the broken state, four ways

Per §9, and each fails by name:

| Mutation | Fails |
|---|---|
| parser ignores the order (`new Date` for everything) | 5 of the `parseImportedDay` tests |
| scan "helpfully" guesses month-first on ambiguous values | 3 scan tests, including *"a file that proves nothing returns NO suggestion"* |
| coercion hard-codes `'mdy'` | the UK journey, on the stored values |
| the import button is never disabled | *"a file that proves nothing makes you choose"* |

The E2E journeys run in **`Europe/London`**, in §42's existing describe: the
container and CI are UTC, so a date test that does not pin a zone passes on
several of these bugs.

The UK journey is the one to keep. On the old code its file stored **4 March**
for the first row and left the other two **blank** — 31/12 and 13/04 are both
Invalid Date read month-first. Two rows wrong, one right, nothing said.

### The demo file now contains the question

`docs/demo-data/demo-deals.csv` had no slashed dates, so the strongest thirty
seconds of the import demo could not happen. It now carries `03/04/2026` and a
`31/12/2026`, which is the good version of the story rather than the awkward
one: the screen works the answer out, says what it read it from, and shows what
it will do. Anyone who has migrated a CRM and found half their dates three
months out recognises it immediately. `DEMO-SCRIPT.md` carries the words.

### Docs walked (§27)

| | Needed |
|---|---|
| `USER-GUIDE.md`, `docs/manual.html` | the workaround paragraphs **replaced** — they described a limitation that no longer exists |
| `docs/BETA.md` tester note | the rough-edge bullet §44 added, removed |
| `docs/ONBOARDING.md` | a step, and *spot-check dates first — a wrong one still looks like a date* |
| `docs/DEMO-SCRIPT.md` | the messy-CSV table, and the thirty seconds above |
| `docs/product-tour.html` | the import aside, which claimed "dates in whatever format the file happens to use" |
| `docs/API.md` | nothing — no route, no wire change |

**A stale workaround is worse than a stale feature description.** "Format the
column as `YYYY-MM-DD` first" was good advice for a real limitation, and left
in place it would have had people doing pointless work while distrusting a
control that now handles it. Removed rather than softened.

### Blast radius

`js/app.js`, `js/date-rules.js` and `css/style.css` are all in `APP_SHELL`, so
`CACHE_VERSION` → `crmbuilder-v44`. No new served file, so the smoke count
stays **44 locally**. `.csv-format`, `.csv-format-row` and `.btn:disabled` are defined
in `css/style.css` — §27's invented-class trap, and `.btn:disabled` in
particular, without which a blocked import button looks pressable and reads as
a bug rather than as a question.

`.mode-switch .btn[disabled]` (specificity 0,3,0) still beats the new
`.btn:disabled` (0,2,0), so the admin mode switch is unaffected — checked,
because §4's cascade trap has now cost time twice in this file.


---

## 46. The live smoke tested the wrong build, and said the deployment was broken

Reported from CI: `✗ GET /js/dsar.js — HTTP 404`, *"Deployment is NOT healthy"*,
**and it cleared on a re-run.**

Nothing was wrong with the deployment, and nothing was wrong with the check.
The `live` job smoke-tests the **running** deployment using the **asset list
from the commit that was just pushed** — and Render has not finished deploying
that commit yet. `js/dsar.js` was added in §43; for the few minutes between the
push and the deploy landing, the live URL is an older build that genuinely does
not have that file. The audit is correct, and it is auditing the wrong thing.

### Which of the two candidates it was, established rather than assumed

A 404 on a served asset has two causes here and they want opposite fixes:

| | Check |
|---|---|
| the file is missing from the server's allow-list (§28) | `ASSET_DIRS` is `['css', 'js', 'fonts', 'icons']` — a **whole directory**, so nothing under `js/` can 404 for allow-list reasons |
| the running build does not have the file | everything else — and the file is in the repo, and a re-run passes |

So it is the second, and §28's content-based assertion is doing its job. Worth
writing down because "a served file 404s in production" is precisely the
failure §28 exists to catch, and reaching for that explanation first would have
produced a fix for a bug that is not there.

### The general shape, which §40 already named

> **A mechanism that hangs off a URL configured somewhere else has a failure
> mode no test in this repository can see.**

§40 wrote that about the keep-warm ping being on `/healthz` instead of
`/health`. This is the same sentence from the other side: the repository could
not see *which build* the URL was serving, so it could not tell "this file is
missing" from "this file is not deployed yet". **Nothing exposed the running
commit** — `/health` reports storage, sync model, deployment shape and uptime,
and not the one fact that would have made the failure self-explanatory.

### Two runs asking different questions, which is why one skip is safe

The job fires on push, on the daily schedule and on manual dispatch, and those
are not the same question:

| | Wants |
|---|---|
| **push** | "does the commit I just pushed work in production" — which cannot be answered until it *is* in production |
| **schedule / dispatch** | "is production healthy right now" — nothing is in flight, so a stale deployment failing the current asset list is a **real finding**: a deploy that never landed |

So a push run waits for the deployment to report the pushed commit and then
smokes it; if it never does, it **skips loudly and passes**, because asserting
this commit's expectations against an older build is what produced the false
red. A scheduled run does neither — no wait, no skip, and it fails.

**The skip is the dangerous half and it is bounded on purpose.** A skip that
can happen every day is §17's no-op-that-reports-success, which this file is
emphatic about: the backstop is that the daily run cannot skip, so a deploy
that never lands is red within 24 hours rather than never.

> **The backstop is weaker than that sentence, and §65 measured it.** The
> daily run cannot *skip*, but it only **fails** when the undeployed commit
> moved something the smoke asserts on. Two commits sat undeployed on
> 2026-10-07 and the scheduled run passed **54/54**, because both were docs,
> the workflow and `tests/smoke.mjs` — nothing served. So the honest claim is:
> a never-landed deploy **that changes a served asset** is red within 24
> hours. One that does not is invisible to both runs, and the thing that
> catches it is the `deployed build` line nobody is obliged to read.

### The commit marker, and why absence is not a placeholder

`/healthz` now carries `commit`, from `APP_COMMIT` or Render's own
`RENDER_GIT_COMMIT`.

- **On `/healthz`, not `/health`.** A wait loop polls this every twenty
  seconds, and `/health` runs the alert rules and the reminder pass off the
  back of every request (§25, §39) — a CI poll there would fire real digests
  into customers' channels. `/healthz` answers and does nothing else, which is
  exactly the property §40 refused to spend by hanging work off it.
- **The field is OMITTED when neither variable is set** — not `null`, not
  `'unknown'`, not `''`. The wait branches three ways: this deployment is
  current, this deployment is behind, this deployment does not say. A
  placeholder collapses the last two into "behind", so the wait would burn its
  whole budget and skip the smoke on every host that does not set the
  variable — a silent, permanent skip, arrived at by trying to be tidy. Same
  asymmetry as §30's `verified_email`: a stated mismatch is actionable,
  absence is not. Guarded by *"/healthz omits the commit when nothing sets
  one"*, which fails on a version emitting `'unknown'`.
- The repository is public, so the commit discloses nothing that is not
  already on GitHub. On a private deployment that would be a judgement call
  rather than a free one.

### The smoke test says which build it looked at

A `deployed build` line in the Configuration section, **INFO and never a
failure** — a deployment that does not report a commit is not a broken one,
and most ways of running this have no commit to report. It earns its place
because every asset assertion above it is written against the checkout the
file came from, so when one 404s the first question is whether the deployment
is even running that commit, and until now there was no way to ask.

**The smoke count does not move**, and that is not an oversight: the summary
counts `PASS`, and this line is `INFO` in both environments. Recorded because
"I added a check and the number did not move" reads as a mistake later, and §9
treats that number as the proof the file ran.

**And the count is two numbers, not one — 44 local, 49 live.** Reported from a
real run against production and worth pinning here, because §2 states "44
smoke checks" flatly and somebody comparing that against a live run showing 49
has §33's problem exactly: two figures, both right, adjacent, unlabelled. The
same checks run either way; five of them are *informational* on a local
file-store HTTP deployment and real assertions against a live one —
`storage backend`, `sign-in method`, `dev login is off in production`,
`HSTS in production`, and `HTTPS`, which does not appear locally at all.
Measured by diffing the two runs, not derived.

### Verified

Each branch of the wait was driven against a real server, with the loop
**extracted verbatim from the YAML** rather than retyped — a copy that drifts
from the workflow proves nothing about the workflow:

| Deployment reports | Outcome |
|---|---|
| the pushed commit | `state=current` — smoke runs |
| an older commit | `state=stale` — skipped, warning names both commits |
| no commit field | `state=unknown` — smoke runs, exactly as before |
| nothing at all (down) | `state=stale` — skipped, warning says it never answered |

The last two warnings were separated after the first version said *"still
running "* for a deployment that had not answered at all — the state that
renders as nothing (§36, §38, §39), in the one place somebody reads at 2am.

A fifth case was added after the first live run, and it is the one that would
have hurt: **the match is a PREFIX comparison, not equality.** The deployment
reports whatever the host hands it, and a host abbreviating to a short SHA
would never equal `github.sha` — so every push run would wait out its budget
and skip, for ever, silently. That is the same silent-permanent-skip failure
the omitted-vs-placeholder decision above exists to avoid, reached from the
other end, and it would have looked like the fix working. Seven characters is
the floor, which is git's own for an unambiguous short SHA; a two-character
prefix is refused, because it would match almost anything.

| Reported | Wanted | Outcome |
|---|---|---|
| full SHA | full SHA | current |
| **short SHA** | full SHA | **current** — the case that would have skipped for ever |
| short SHA | an unrelated commit | stale, correctly |
| two characters | full SHA | stale — too short to trust |

Full Node suite **418**, Playwright **105**, smoke **44 locally** — the full
run because `/healthz` is polled in eight test files' boot-wait loops (§40) and
`startServer()` gained an `extraEnv` parameter, and §9 names shared test
helpers as blast radius.

**Confirmed against production**, not only locally — §30's standard for a CI
change. A live smoke run reported `49 passed · 0 warnings · 0 failed` and
`deployed build 9f8126c3c28f`, which is both halves of this working: the
marker reaches a real deployment, and the commit it names is the one that had
just been pushed. That run is also what retired the `RENDER_GIT_COMMIT` caveat
below, and what showed the count is two numbers rather than one.

**And then the wait itself was observed doing its job on CI**, which is the
confirmation that actually matters — the run above was a smoke test, not a
test of the waiting:

```
Live deployment is running 9f8126c3c28f, waiting for 9e93deb290eb…
Live deployment is running 9e93deb290eb — the commit under test.
```

One poll saw the previous build, the next saw the pushed one, and the smoke
then passed 49/49 against it. **The race is observed rather than inferred**:
that first line is precisely the state that used to produce
`✗ GET /js/dsar.js — HTTP 404` and *"Deployment is NOT healthy"*. The
`sync model` line on the same run reads `up 19s`, so the deployment had
finished restarting nineteen seconds earlier — without the wait, that smoke
would have run against the old build. The window is that narrow, and it is
why the failure looked intermittent.

### The doc that went stale, exactly where §27 says it does

Asked directly — *"docs updated?"* — and auditing rather than answering found
one real gap, in the file §27 already names as the one that goes stale fastest:
**`docs/API.md` listed `/healthz` as "older liveness probe" and nothing else.**
A caller now depends on its response shape, and the absent-not-placeholder rule
above is a contract rather than an implementation detail — a client reading the
document would have had no way to know it, or that the value wants a prefix
comparison.

§27's own words: *"a doc describing a contract goes stale the moment the
contract moves, which is more often than a doc describing a feature."* This
change added no route, so the route count stayed right and the file *looked*
current. **A response shape moved underneath a line that still read correctly**
— which is why the count is not the thing to check.

The rest of the walk was already done and was verified rather than assumed:
§44 and §45 are present in all six user-facing documents, with two greps that
came back empty for wording reasons rather than missing content, and
`docs/BETA.md`'s CSV-date rough-edge bullet is correctly *gone* — it stopped
being a rough edge when the control shipped.

**Then the same question about the README found more**, and for the same
reason: §27's six-document rule names the files a *feature* change has to walk,
and the root `README.md` was not one of them — so it had quietly fallen a year
behind while every document that is on the list stayed current. **It is on the
list now** (§27, and §47 added `guide.html` beside it), which is the actual fix:
bringing one file up to date does nothing about the next feature. Four kinds of
stale, and only the first is the sort anyone would notice:

- **Features nobody had added**: the due-date filter, workspace webhooks and
  the daily digest, and every data-protection tool (§42–§45). All shipped, all
  user-visible, none mentioned.
- **A factually wrong CI claim**: *"Set a repository variable `LIVE_URL` to
  enable the scheduled live check."* It has always had a built-in default, so
  the check runs whether or not you set one — `LIVE_URL` overrides, it does not
  enable. Someone reading that would conclude their deployment was unmonitored.
- **Five files that exist and were not listed**: `js/tour.js`,
  `js/date-rules.js`, `js/dsar.js`, `lib/safe-fetch.js`, `scripts/restore.mjs`.
  `lib/` is the one that matters — a whole top-level directory, and the README
  is where somebody looks to find out why it is not under `js/`.
- **A data model missing a collection**: `invites`, listed nowhere, beside
  `betaCodes` which was.

`docs/README.md` was checked at the same time and is fine: every file under
`docs/` is referenced, its routing table is task-based so new features need no
new row, and its *"14 sections"* claim about `USER-GUIDE.md` is still exactly
right — the new material went in as subsections. A number in a second place
that has *not* gone stale, which is worth recording too.

### The comment that had never matched the code

The `live` job said *"Runs on schedule, on manual dispatch, and after a push to
the default branch."* There has never been a branch filter — it is
`github.event_name != 'pull_request'`, so it runs on every push to every
branch. The comment described an intention nobody implemented, and it matters
here because the branch being deployed **is** the feature branch, so a reader
trusting the comment would conclude this race could not happen on it. Fixed to
say what the condition does, with the discrepancy noted rather than quietly
corrected.

### What this does not fix

**A push whose deploy is slower than the budget is skipped, not retried.** The
budget is seven minutes; a free-tier redeploy plus a cold start is usually
under two. If Render gets slower this becomes a skip that the daily run catches
the next morning rather than a red tick within the hour — acceptable, and worth
raising the budget rather than removing the wait if it starts happening.

**~~Nothing here proves Render actually sets `RENDER_GIT_COMMIT`.~~ It does —
confirmed the same day.** This session cannot reach `*.onrender.com` (§8), so
this shipped with the claim hedged and the runbook telling the operator to
check. A live smoke run then reported `deployed build 9f8126c3c28f` — the
commit that had just been pushed. Nothing to configure on Render, and
`DEPLOYMENT.md` now says so as a fact rather than an expectation.

Left visible rather than rewritten, because the hedge was correct when it was
written and the pattern is the one §17 and §40 both record: **the thing that
settled it was running the real check against the real deployment**, which is
the one job the automated version cannot do from in here.


---

## 47. Telling users what the app does, and two live bugs found on the way

Asked for two things: **a short document about what the app lets you do**, in
plain "you can X" terms and without sounding like a salesman, and **a post**
opening with a story about a cement factory that ran on two daily numbers,
followed by a walkthrough of the digest.

Both exist. What is worth recording is that planning them turned up two defects
on the pages that were *already* customer-facing, and one of them had been live
for twenty-one cache versions.

### `guide.html`, and the rule that stops it reading as a pitch

Served at **`/guide`** — a root file, so the extensionless alias (§28) makes the
URL short enough to say out loud, which is the entire point of a page you send
people. Reuses `legal.css`, loads no app JS, and renders for somebody who has
never opened the app.

**Every item states a capability and its limit in the same breath.** That is
what makes it not a pitch, and it is how this codebase already writes about
itself:

> **You can be told each morning what is overdue.** It says *how many*, not
> *which* — a chat channel usually has more people in it than your CRM does.

Organised by what somebody does in a week rather than by feature, so the
sections are "stop things slipping" and "answer the awkward questions" rather
than "reminders" and "DSAR". No pricing, no comparison table, no adjectives
doing persuasion work. One call to action, at the end: load the sample business.

**It is on §27's walk list**, along with `README.md` — see below.

### The post is dated and NOT maintained, deliberately

`docs/posts/2026-09-08-the-two-number-digest.md`, with a banner saying so.

A published post cannot be edited after it goes out, so pretending to keep it
current is the wrong promise; dating it is honest and keeps it off the walk
list. Its walkthrough stays short and points at `USER-GUIDE.md` for detail, so
there is little surface to drift.

**The digest message in it is real**, produced by pushing a workspace through
`/api/sync` and reading `/api/org/reminders`, not written from memory — §42's
rule. The story's own analysis is what the feature already does: the cement
factory report *told him which team to go and talk to*, which is exactly why
the digest carries counts and never record names (§39). The closing note
arrives at §39's push-versus-pull staleness split from the other end — the day
the report did not land on his desk **was** the signal, and the person carrying
it was the monitor.

### The bug that had been live since `crmbuilder-v24`

`sw.js` answers **every** navigation with the cached app shell and writes what
it fetched back over `index.html`. §19 excluded `/privacy` and `/terms` and
stopped there — so `/docs/manual.html` and `/docs/product-tour.html`, which
§28 and §29 both describe as deliberately public with **frozen URLs because
they may already be in somebody's inbox**, were still going through it.

**Proven before it was fixed**, and the page snapshot is unambiguous: opening
the manual with the service worker installed rendered the **CRM** — sidebar,
Dashboard and Admin links, a *New module* button. `skipWaiting` +
`clients.claim` means this hits a **first** visit, not only a return one.

The second half is worse than the first. The navigation handler caches what it
fetched *as the shell*, so after one visit to the manual the app itself is the
manual until the cache is cleared. Both halves are asserted, because they fail
differently and a fix for one is not a fix for the other.

**The general rule, now written where the list is**: anything served that is
not the app belongs in `STANDALONE_PAGES`. §19 added the two pages that were in
front of it at the time and stated the rule as *"anything added to those pages
must be added to that list too"* — which is about the legal pages specifically,
and is why two more standalone pages could be added later without anybody
hearing the rule apply.

### And the test found two more, because of a guard I did not write for this

The new test passed its own assertions and then **failed in `afterEach`** on a
console-error guard. Two CSP violations, on those same two customer-facing
pages, both live:

- **Google Fonts is blocked.** `style-src 'self' 'unsafe-inline'` (§30 Phase 4)
  does not allow `fonts.googleapis.com`, so the stylesheet has been refused
  since that header shipped, and both pages have been rendering in their
  fallback stacks.
- **`docs/manual.html`'s inline `<script>` is blocked.** `script-src 'self'`,
  so the **mobile Contents toggle has done nothing on a phone** for the same
  period — a functional break, not a cosmetic one, on the page we hand to
  customers.

The app had already learnt both lessons: it self-hosts Inter, and
`js/boot-icons.js` exists **precisely** because an inline script would be
refused (§30). The doc pages were simply never checked against a header written
for the app.

**Fixes, and both were cheap because the pages were already defensive.** The
font stacks already fell back to Georgia / `system-ui` / `ui-monospace`, so
removing the blocked `<link>` changes nothing a live visitor currently sees —
it removes a wasted request, a console error, and a third-party call that
§40's privacy roster would otherwise have to declare. The script moved to
`js/manual-toc.js`, served because `js/` is allow-listed, and deliberately
**not** added to `index.html` or `APP_SHELL` — it is not part of the app.

**The lesson is about the guard, not the bug.** `expectedConsoleErrors` was
built for §20's deliberate 403. It caught two unrelated live defects here
because it asserts on something no individual test thought to look at. A test
that only checks what it set out to check would have gone green over both.

### An outside review of the guide, and which four of five to take

A review came back with five suggestions. Each was checked against the file
rather than accepted or waved off — §21's treatment — and the split is worth
recording because the two it got wrong are wrong for the *same* reason.

**Taken: the role ladder becomes a table.** The review was right and this file
already agreed with it: §14 presents the ladder as a table precisely because
"there is one ordering to reason about rather than a matrix". Writing it as
prose on the customer-facing page was the inconsistency. Permissions are a
lookup — somebody evaluating for a team wants to find their row.

**`legal.css` had NO table styling**, checked before writing any markup: a bare
`<table>` renders at browser defaults, cramped and borderless, which is worse
than the paragraph it replaced. That is §27's invented-class trap reached
through a plain tag rather than a class name — the same way §41 found the
missing `h3`. Rules added there, and both legal pages were confirmed to contain
no tables so nothing else is restyled.

**Taken: the beta is stated, and the review missed this one.** The page said
nothing about beta status or cost — grepped, the only hit was the word "price"
in a currency sentence — while its own footer links to `/terms`, which is
headed *"What you should expect from a beta"* and says data loss is possible.
So a prospect read four confident minutes and then discovered the framing on
the legal page. That is the exact failure the page is built against: the limit
found later rather than stated up front.

**Taken: the module-visibility limit is elevated to a callout**, because it is
the one that disqualifies some buyers outright.

**Taken, but not as proposed: a top link.** The review asked for a *"Launch
Interactive Demo"* button. No such sandbox exists — loading the sample business
means opening the app and clicking through — so that label would have been an
overclaim in the header of the page written to avoid overclaiming. A plain
*open the app* link says what it does.

### The two that were declined, and why they share a cause

**Shortening the bold lead-ins to 2–4 word concept anchors** — *"Daily morning
digest"*, *"Consent tracking"*. Measured first: they run 4–12 words, mostly
6–9, so "full sentences" overstates it. But the substance is that this would
convert a claim addressed to the reader into a **feature name**, and a left
margin reading *Daily morning digest / Granular search / Consent tracking* is a
spec sheet. "You can X" is the brief, and it is what makes the page sound like
a person rather than a datasheet.

**Moving offline up to position two** for "technical decision-makers". That is
not this page's reader. The sections run in the order somebody works through a
week, and position two is the core daily experience. A CTO evaluating
architecture has `product-tour.html` and the README.

**Both declines share one cause: they optimise the page for a different
audience than the one it was written for** — a scanner collecting features, and
a technical evaluator. Either change is right for a page aimed at those
readers; neither is right for this one. Worth naming, because a suggestion can
be perfectly good craft advice and still be wrong for the document in front of
it.

### `README.md` joins §27's walk list

§46 found the README a year behind and fixed the file. This fixes the *rule*,
which is the part that stops it happening again: `README.md` and `guide.html`
are named in §27 now.

The original wording — *"not just this file and the README"* — reads as though
the README were covered by something. It was covered by nothing. That is a
sentence that describes a gap while sounding like it closes it.

### Blast radius

| | |
|---|---|
| `guide.html` | new root file → `PUBLIC_ROOT_FILES`, `STANDALONE_PAGES` |
| `js/manual-toc.js` | new served file, **not** app shell — no `index.html` or `APP_SHELL` entry |
| `sw.js` | `STANDALONE_PAGES` + `CACHE_VERSION` → `crmbuilder-v45` |
| `tests/smoke.mjs` | a reachability check for all three shareable pages — there was none, only "must **not** serve" |

**The smoke check is the one that would have caught a 404 on a URL somebody
already has.** It is content-based, not status-based, for §28's reason: the
catch-all used to answer everything with the shell, so a 200 proves nothing.

Counts: Node **418**, Playwright **105 → 109**, smoke **44 → 45** locally
(50 live). The full suite was run because `sw.js` and `CACHE_VERSION` are
shared surface (§9).

**The review's changes needed no `CACHE_VERSION` bump** — `guide.html` is in
`STANDALONE_PAGES` and `legal.css` is in neither `index.html` nor `APP_SHELL`,
so both go straight to the network. Checked rather than assumed, which is
§41's rule for the legal pages. Targeted run plus smoke per §9, and the
standalone-pages describe is what covers the shared-`legal.css` risk: it loads
all three pages.

> **That paragraph is WRONG, and it was wrong when it was written.** The page
> goes to the network; its stylesheet did not. `STANDALONE_PAGES` is matched
> against a **navigation**, so `/legal.css` — a subresource — fell straight
> through to the cache-first branch at the foot of `sw.js` and was kept with
> no revalidation. "Checked rather than assumed" checked `APP_SHELL` and the
> precache list, and there are **two** caches in that file. See the subsection
> below; the claim is left standing rather than edited, because what it got
> wrong is the useful part.

**And the new test tripped §14's own `.toast` trap on the first run.**
`.callout` matches two elements on the page now — the opening one and the
elevated limit — so `toContainText` failed strict mode. Filter, do not assume
one. The test says plainly what it does not prove: it catches deletion of the
beta line and the roles, not drift from §14, because `TEAM_ROLES` is
server-side and no browser test can read it.

### Two refinements asked for, and the second one found a live bug

Reported as *"minor refinement opportunities"* on the new page: the roles
table's mobile behaviour, and the contrast of the callout blocks. Measured
rather than judged, and the split is the interesting half — **one was already
right, one was right about the wrong thing, and checking it turned up
something neither point mentioned.**

**The table was already wrapped**, and the wrapper already scrolls
(`.table-wrap { overflow-x: auto }`, added with the table itself). Driven at
360, 320 and 280 CSS pixels: the table measures 312 / 272 / 232 against a
wrapper of exactly the same width, so it never needs to scroll — the columns
wrap — and `document.documentElement.scrollWidth` never exceeds the viewport,
so the **page** does not scroll sideways either. Both halves matter: the
wrapper is the guard for a future wider table, and the page-overflow figure is
what says the guard is not currently doing anything visible.

**The callout's text contrast was never the problem.** `--ink-soft` on
`--paper-sunk` is **7.23:1** in light and **7.36:1** in dark, comfortably past
WCAG AA's 4.5 for body text, and `strong` reaches 16.7 / 15.2. So the stated
concern does not exist.

**What is real sits under the same heading and is a different property.** The
callout's *distinction* — whether the block reads as one at all — came from a
fill of **1.06:1** (light) and **1.05:1** (dark) against the page, with a
hairline border reaching only 1.24 / 1.43. Effectively invisible, against
WCAG's 3.0 for non-text. That was tolerable while a callout was decoration;
it is not, now that `guide.html` **elevates its one disqualifying limit into
one specifically so it is seen** (above). Elevating something into a container
that does not read as a container achieves nothing.

Fixed at the boundary rather than the fill: a 3px `--accent` left edge, which
measures **4.57:1** light and **7.64:1** dark against the page. Left padding
drops 18 → 16px so the 3px edge leaves the text inset unchanged at 19px.
`--paper-sunk` is used by `.callout` and by nothing else, so darkening the
token was the alternative — rejected because it fights the ink above it and
because a token named for a surface should not be tuned for one component.
Verified by driving all three pages in both colour schemes: seven callouts,
`3px rgb(21, 112, 239)` and `3px rgb(106, 166, 255)`.

**And the fix needed a bump, which is how the paragraph above was found to be
wrong.** Installing the worker and opening `/guide` puts `/legal.css` in the
cache — printed, not inferred. So the table styling of the previous commit
was invisible to anybody already carrying a copy: the roles table at browser
defaults, cramped and borderless, which is the exact state that change existed
to remove, shipped silently by a claim that it could not happen.

`STANDALONE_ASSETS` (`/legal.css`, `/js/manual-toc.js`) joins
`STANDALONE_PAGES` in the early return. **The point is to make the claim true
rather than to restate it**: a page the worker refuses to handle should not
have its stylesheet handled either, and with that in place a `legal.css` edit
genuinely needs nothing. The bump to `crmbuilder-v46` is still required *this*
once, to evict what is already stale — the fix heals future visits, not caches
that already hold a copy.

`js/manual-toc.js` is listed for the same reason and was heading for the same
fate: §47 kept it out of `APP_SHELL` on the grounds that *"it is not part of
the app"*, which is right and which the runtime cache did not care about.

**The test asserts on the CACHE, not on the rendering**, and that is
deliberate: a stale stylesheet still renders, plausibly — this file's
recurring failure shape (§36, §38, §39). Nothing on screen would have said so,
which is why nothing did for a cache version. It also asserts `/js/app.js` **is**
cached, or it would pass just as happily on a worker that caches nothing at
all. Checked against the broken state per §9: removing the one
`STANDALONE_ASSETS` line fails it by name, listing both stray files.

Counts after: Playwright **109 → 110**. Node and smoke unchanged — no served
file was added, no route moved.

### Then the same question asked generally, and `/healthz` was worse

*"Are there other subresources the worker is caching that it shouldn't?"* —
asked straight after the fix above, and the honest answer needed the whole
reachable surface walked rather than the one file that had just been found.

**The surface is small and closed**, which is what made this answerable:
`ASSET_DIRS` + `PUBLIC_ROOT_FILES` + `PUBLIC_DOCS` + two endpoints, and
everything else 404s (§28). Every same-origin GET was visited with the worker
installed and the cache dumped. Assets are all precached or now listed; the
only paths outside both are **`/health` and `/healthz`**.

They predate `/api/`, so the prefix check that makes every other endpoint
network-only has never covered them — and **both halves of §19's bug were
still live on them**, four years and thirty-three cache versions after §19
supposedly closed it:

| | |
|---|---|
| navigating to `/healthz` | rendered **the CRM**, `#app` present, "CRM Builder Dashboard" |
| and then | wrote `{"ok":true,…}` **over the cached shell** |
| so the next load of `/` | served that JSON **as the entire application** |

**Permanently.** The navigation handler answers from the cache first, so
nothing heals it — the app is dead in that browser profile until the cache is
cleared. And the person who hits it is an operator checking their own health
endpoint in the browser they use the app in, which is a normal thing to do.

**My first sweep reported "none", and it was wrong.** It visited every path in
one profile and ended on `/no-such-route`, whose response *is* the shell — so
the last navigation put the real shell back and healed the poisoning before
the dump. The finding needs **one fresh profile per path**, and the assertion
has to be on the **first** load of `/` afterwards. A probe that heals what it
is looking for reports clean, which is the same shape as §34's test passing
against its own fixture.

### The list is the smaller half. The type check is the fix.

Two changes, and the split is the point:

- **`STANDALONE_ENDPOINTS`** joins the early return, so navigating to
  `/healthz` shows the JSON rather than the CRM. That is a **list**, and a
  list only ever covers the paths somebody thought of — which is precisely how
  `/docs/manual.html` survived twenty-one cache versions (above) and how these
  two survived thirty-three.
- **`response.ok` is not "this is the app".** The navigation handler now
  writes back only when the response is `text/html`. Any same-origin
  navigation answering 200 with something else — a JSON endpoint, the
  manifest, a stylesheet opened directly — was becoming the shell. Checking
  the **type** instead of the path is what covers the next such route nobody
  lists.

`/manifest.webmanifest` is the proof and is deliberately in **no** list: after
the fix it still *displays* the CRM when navigated to directly (nobody does
that on purpose, and it is a genuine app asset), but it can no longer replace
the application. The test that pins it passes only because of the type check.

**The `CACHE_VERSION` bump is load-bearing this time, not hygiene.** A browser
already holding a poisoned `index.html` serves it from cache before any of
this new code runs; `activate` deleting every cache whose key is not the
current one is the **only** thing that repairs an installation already in that
state. Shipping the fix without the bump would leave exactly the users it is
for still broken. → `crmbuilder-v47`.

Two tests, each checked against its own mutation per §9 and failing by name:
dropping `STANDALONE_ENDPOINTS` fails *"opening the health endpoints shows
them…"* on `#app` count 1 against 0, and restoring the bare `response.ok`
write-back fails *"a navigation that is not HTML never becomes the cached
shell"* while leaving the first one green — which is what shows the two
changes are covering different things rather than one twice.

Counts after: Playwright **110 → 112**.

### The runbook was telling operators to do the thing that broke it

*"Are the docs updated?"* — walked rather than answered, which is §46's own
lesson about this question. Two files needed a line and the rest genuinely did
not.

**`DEPLOYMENT.md` § *Verify the deployment* is where this stings.** Step 1 is
*open the app* — which installs the service worker and claims the page — and
step 2 is *open `/health` and read `"storage":"mongodb"`*. That is the exact
sequence above, written down as a procedure:

| The documented step | What actually happened |
|---|---|
| 1. open the app | worker installs, `clients.claim` |
| 2. open `/health` | **the CRM rendered**, so the value step 2 asks you to read was not on the page |
| — | and the JSON was written over the cached shell |
| 4. install it | installs a shell that is now a page of JSON |

So the step could not be completed as written, and completing it broke the
next thing. Measured on a pre-v47 worker, not reconstructed from the code.

**One reload clears it, and that is measured too.** The same profile, upgraded
to v47: the app renders on load **1**, not load 2 — `activate` drops the stale
cache and re-precaches. The note says one load because that is what was
observed; it does not explain the mechanism, because the mechanism is timing
between the update check and the claim and I did not pin it down.

**`docs/API.md` gets the other line**, and it is the §46 shape exactly: no
route moved, the route count is still right, and the `/healthz` section still
*read* correctly — but a browser-based caller's reachability changed
underneath it. §27's *"a doc describing a contract goes stale the moment the
contract moves"*, where what moved was not the response body.

**The six user-facing documents needed nothing, and that is checked rather
than skipped.** `README.md`, `guide.html`, `USER-GUIDE.md`, `manual.html`,
`product-tour.html`, `ONBOARDING.md`, `DEMO-SCRIPT.md` and `BETA.md`'s tester
note describe no endpoint and no caching rule; the only service-worker
sentences anywhere are `README.md`'s *"fully offline via a service worker"*
and `DEPLOYMENT.md`'s cold-start note, both still true. Padding them to look
thorough is its own inaccuracy (§40, §41). And **no count went stale outside
this file** — grepped for Playwright totals, smoke totals and
`crmbuilder-v[0-9]` across every doc, and the only hits are the live URL and a
browser zoom level. §29's rule holding, which is worth recording when it does.


---

## 48. Sweeping for what else is live and unnoticed, and the two launches

Asked directly after §47: *"what else has been live and unnoticed like this?"*
The question is answerable because the failure has a **shape** — a defect that
renders as plausible — and that shape is mechanically searchable. Five sweeps,
run rather than reasoned about.

### What the sweeps were, and what each returned

| Sweep | Result |
|---|---|
| Third-party subresources anywhere served (the CSP refuses them — §47's Google Fonts finding) | **clean** — every remaining external URL is an `<a href>` or demo data |
| Console errors + failed requests on all five public pages, at a phone viewport | **clean** — including `/privacy` and `/terms`, which no E2E had ever driven with a console guard |
| Undefined CSS classes on the served pages (§27's trap, which has now cost time four times) | **clean** |
| Every internal `href` on every served page, resolved against a running server | **clean** |
| Outbound links on customer-facing pages | **two findings** — below |

**A clean sweep is worth recording too.** Four of these five have caught
something before, and "I checked and there was nothing" is what stops the next
reader re-running them on a hunch.

### The one that mattered: the sales page linked to a build artifact

`docs/product-tour.html` — the page written to sell the product — had its
*"Read the manual"* button pointing at
`https://claude.ai/code/artifact/3e34f282-…`.

**Dated rather than guessed:** introduced 2026-08-26, and **four later commits
edited that same file** — §27's documentation audit and §44/§45's walks among
them — across 72 commits. Every one of them read the prose and none saw the
`href`, because a link renders as a perfectly ordinary button whether or not
the far end is anything at all. §27's own sentence explains it: *the HTML ones
are the easiest to forget because nothing greps them by habit.*

Fixed to `/docs/manual.html`. The sibling *"Open the demo"* button was an
absolute `https://crmbuilder-v1.onrender.com` and became `/` — a page served
from the deployment does not need to name it, and an absolute host there is one
more thing to get wrong on a domain move. (It is **`/app`** now, since §63
moved the app off the root; the reasoning above is why it is relative either
way, and that is what has not changed.)

**The guard covers the class, not the instance.** Five tests, one per public
page: no link may match a build-tool or scratch host, and every internal link
must answer 200. Checked against the broken state per §9 — restoring the
artifact URL fails *"/docs/product-tour.html links nowhere embarrassing…"* by
name, printing the URL.

### `MARKETING.md`, and the correction to what I did about it

Found by following `docs/README.md`'s own *"sell it"* row. It is prepared copy
for posts and landing pages, and **`CLAUDE.md` mentioned it zero times.**

It says *"**No per-seat pricing. No lock-in.**"*, *"Free. No ads."*, *"$0/month"*
three times — and opens by attacking other CRMs for being *"rented back to you
at $25 per seat per month"*. **Introducing pricing while that copy stands means
a product whose own marketing attacks other products for doing what it has
started doing**, in text somebody can quote back. That risk is real and stands.

**What I got wrong was the remedy.** I put it on §27's walk list beside
`README.md` and `guide.html`, on the reasoning that all three were
customer-facing documents no rule covered. Corrected when that was questioned:
**it is an internal document**, and the walk list is the wrong instrument.

The distinction the list actually runs on is **read directly by an outsider**,
which is not the same as *served*:

| | Served? | Read as a document by an outsider? | On the walk list |
|---|---|---|---|
| `guide.html`, `manual.html`, `product-tour.html` | yes | yes | yes |
| `README.md` | **no — 404s** | yes, it is the repository's front page | yes |
| `MARKETING.md` | no — 404s | **no** | **no** |

Nobody ever reads `MARKETING.md`. It becomes public one paragraph at a time,
when a person copies text out of it into a post — so its failure is **deferred
to the moment of publishing**, not live the way a stale manual is. Walking it
on every feature change would mostly be walking a file that nothing had made
wrong yet, and this codebase already has a name for that: §40 and §41 both
record that **padding a roster is its own kind of inaccuracy**. Adding an entry
that is usually a no-op is how a list stops being read.

So the requirement moves to where it belongs — a **publish-time gate** in
`docs/LAUNCH-CHECKLIST.md`, which is the document you open when you are about
to do the thing that makes it public. It was already the most prominent item
in that file's pricing half; what changed is that it is no longer *also* on a
list where it would have decayed into furniture.

**Recorded as a correction rather than quietly reverted**, because the reasoning
is the reusable part: "no rule covers this file" is a real finding, and
"therefore put it on the nearest existing list" is the wrong reflex. The
question to ask is *when* the file can hurt you, and add the check there.

### `docs/LAUNCH-CHECKLIST.md`

The second half of the request: one document covering everything a domain move
and a pricing launch have to change, code and docs, so neither ships half-done.
It lives in `docs/` — the tier §29 defines as maintained — and it 404s in
production by construction (§28), **checked**, which is what lets it be blunt
about what is unfinished.

**Every factual claim in it was verified, not recalled**: the `onrender.com`
occurrences were grepped per file, `manifest.webmanifest` was read (relative
`start_url`, so a move does not touch it), `render.yaml` pins a name and not a
host, and `server.js` sets no cookie `domain`.

Three things the writing turned up that were not obvious going in:

- **`terms.html` scopes itself to *"the free beta at this address"***, so the
  legal text is domain-specific and one sentence is wrong after *either*
  launch. That is why the two are one document rather than two.
- **The domain move's real risk is not a string.** IndexedDB is per-origin, so
  unsynced rows are stranded; an installed PWA keeps serving the old origin and
  never learns about the move; and `CACHE_VERSION` cannot evict a cache on an
  origin you are no longer serving (§47). **A redirect fixes the website and
  none of those three.**
- **Pricing forces decisions this codebase deliberately deferred** — whether
  quotas start being enforced (§17: *"nothing is enforced"*), what non-payment
  does (§24's suspension, which must never reach `deleteAccount()` — §15), and
  whether a suspended customer can still export (§36 says export is for every
  role, deliberately). The checklist states each as a question with the prior
  reasoning attached rather than answering it.

### The §47 item that is now closed

*"Confirm the manual's mobile Contents toggle works on a phone"* was left
outstanding for the user. Measured here at a 390px viewport: the TOC goes
75px → 591px, the label flips to *Contents ▴*, and `aria-expanded` goes true.
At 1280px the toggle is correctly not visible. §47's CSP fix works; nothing
further is needed.

Counts after: Playwright **112 → 117**. Node and smoke unchanged — no served
file was added and no route moved, and the new document is deliberately
unserved.

---

## 49. The renewals template, and a module that can vanish from the digest

The first of the three features specced in
[`docs/CHASER-AND-TRACKERS.md`](docs/CHASER-AND-TRACKERS.md), and the smallest
by a wide margin: **no new machinery at all.** §37's due filter and §39's daily
digest already count what is overdue or falling due inside a window, on any
module carrying a date field, so an owner could have built a renewals register
by hand. What they could not do is know to, or guess which columns an
inspection actually asks for.

`renewals` — holder · kind · **expires** · status · reference · issuer · notes.
§42's `consent` template is the precedent for every structural choice: a module
rather than fields on Contacts, opt-in, costing nothing to a workspace that
never picks it.

### The constraint that had to go in the file, not just in a test

`DateRules.watchedDateField` is `dates.find(f => f.showInList) || dates[0]` —
**one date field per module**, and it is what both the filter and the digest
count against. So `expires` must be the only listed date field, and the reason
belongs in `js/templates.js` beside the fields rather than only in a test,
because the person who breaks it is the one adding an `issuedOn`.

**Measured both ways against the mutation, and the quieter half is worse than
the miscount I wrote the warning for:**

| The second date field is | What happens |
|---|---|
| **filled** | the digest counts certificates by the day they were *issued*, and reads exactly as plausibly as the correct message |
| **empty** — which is what an added field is on every existing row | `daysUntil` returns null for every record, the module falls out of the `total > 0` filter, and **the register disappears from the digest entirely** |

No error, no empty section, nothing: the renewals simply stop being mentioned.
That is §36's state-that-renders-as-nothing on the one feature whose whole job
is to speak up, and it is reachable by an ordinary owner adding an ordinary
column — not only by editing the template.

The E2E fails on the mutation **one assertion earlier than predicted**, at
*"a module with an expiry date must reach the digest"* rather than on the
`field` name. The comment I wrote first predicted the wrong line; it now
records what was observed. §9's rule earning its keep — the mutation was run,
not reasoned about, and reasoning about it would have produced a confident and
wrong note.

### No samples, and it is the one template where that is a decision

Every other template's samples avoid dates because `createFromTemplate` copies
a sample verbatim and does **not** resolve `{ __rel: n }` — only `loadDemoData`
does — so a date has to be hard-coded and goes stale. Here both halves of that
bite at once:

- a hard-coded expiry lands in a brand-new workspace as a certificate that
  expired two years ago;
- and leaving it empty puts an empty cell in the one column the module exists
  for, on the first screen somebody sees (§36).

So `samples: []`, like `notes`. `DEMO_SKIPS` gains `renewals` for a related
reason worth keeping separate: the demo's dates are **relative** so the
business never looks stale, so seeding it would start reporting overdue
certificates to somebody who only wanted a look around.

### One window for the workspace, with a review condition

`remind.days` is a single number for the whole workspace, and shipping it that
way is the decision rather than an oversight. Per-module windows
(`remind.perModule`) would touch `remindSettings()`'s clamping, the
`n > remind.days` comparison, the preview, the settings screen and the message
— contained, since settings already sync whole and are already owner-only
(§14), but the bulk of the work for a problem nobody has reported.

> **Revisit the first time a workspace wants two different windows.** That will
> not appear in telemetry — it arrives as a support message, so it has to be
> *recognised*. Written into `docs/CHASER-AND-TRACKERS.md` §1 for that reason.

The user docs say the same thing as advice: pick the look-ahead for the slowest
thing you track, because the per-module Due date filter still gives you the
shorter view.

### "Overdue", not "expired"

For a certificate the right word is *expired*, and the message builder is
shared across every module with no way to tell a due date from an expiry date.
Deriving it from the field label ("starts with Expir") is a locale-bound
heuristic on a string the user typed. Left as *overdue*, said plainly in the
user docs — the price of the better word is a shared code path, and the word is
understood.

### A pre-existing find: the icon picker could not represent its own template

`MODULE_ICONS` is what the builder's icon row renders, and a swatch is marked
`on` only when it equals `draft.icon`. `shield-check` — the icon §42 gave the
`consent` template — **was not in that list**, so opening the builder on a
Consent module showed an icon row with nothing selected. Not destructive (the
module keeps its icon unless you click one) and exactly this file's recurring
shape: it reads as *unset* rather than as *chosen*.

Fixed by adding `shield-check` to `MODULE_ICONS`, not by changing the template
— `createFromTemplate` copies the icon at creation time, so editing
`js/templates.js` would leave every existing Consent module untouched. The rule
now sits in a comment on that array: **every icon a template uses has to be in
it too.** `clipboard-list`, which Renewals uses, already was.

### Blast radius

`js/templates.js` and `js/app.js` are both in `APP_SHELL`, so `CACHE_VERSION`
→ `crmbuilder-v48`. No new served file and no route, so the smoke count stays
**45 local / 50 live** — and running it is what proves that (§9). No
`docs/API.md` change: nothing about the wire moved.

`TEMPLATE_KEYS` (`tests/demo.test.mjs`) and the `.template-card` count
(`tests/e2e.spec.js`) are both derived from `js/templates.js` since §42, so an
eighth template broke neither. Verified rather than assumed — both were
literals until they went stale.

Counts: Node **418**, Playwright **117 → 118**, smoke **45** locally.

### Docs walked (§27)

| | Needed |
|---|---|
| `README.md` | the module list, and a feature bullet |
| `guide.html` | the module list, and a *Stop things slipping* paragraph naming the one-window limit |
| `USER-GUIDE.md`, `docs/manual.html` | a *Tracking things that expire* section, with the one-date-column warning |
| `docs/product-tour.html` | the module list, and a tile — this is the feature that sells to a trade business or an agency |
| `docs/ONBOARDING.md` | a row in the noun→module translation table, and *pick the look-ahead for the slowest thing they track* |
| `docs/DEMO-SCRIPT.md` | an expected question, because "we lose accounts over expired COIs" is usually the strongest reason in the room |
| `docs/BETA.md` tester note | the template, and the one-date-column rule |
| `docs/API.md` | nothing — no route, no wire change |

**Three of those lists had already gone stale**, and not because of this
change: `README.md`, `guide.html` and `docs/product-tour.html` each named the
original six templates and had never gained `consent`, which shipped in §42.
§27's drift, found by walking the list rather than by anybody noticing. Only
`renewals` was added to them — `consent` has its own paragraph in each, so
putting it in the parenthetical too would be padding (§40, §41).

**The renewals material is deliberately NOT in the GDPR paragraphs** of
`ONBOARDING.md`, `DEMO-SCRIPT.md` and `BETA.md`, which is where the eye goes
because that is where `consent` lives. Renewals is operational, not a data
protection tool, and filing it there would imply a compliance claim the
template does not make.


---

## 50. Dormancy is retention's question with a different clock

Part 2 of [`docs/CHASER-AND-TRACKERS.md`](docs/CHASER-AND-TRACKERS.md). §44's
retention review already scanned every record, grouped by module, sorted oldest
first and downloaded the list. **The scan was right and the clock was wrong**,
and that is the whole of this section:

| Question | Right clock |
|---|---|
| what have we stopped **touching**? | `updatedAt` — correct since §44 |
| who have we stopped **talking to**? | **not `updatedAt`** |

A customer whose address you corrected last month reads as active. One you
emailed last week without logging reads as dormant. Shipping dormancy on
`updatedAt` would have produced a confidently wrong list — this file's
recurring failure shape rather than a rough edge.

### The field is an input, not a better guess

The obvious move is `DateRules.watchedDateField`, the convention §37's filter
and §39's digest already share. **It does not work here**, and the reason is
worth keeping: that helper returns *one* date field per module, so on an
Invoices module carrying `dueDate` and `lastContacted` it hands the same field
to all three — and this report would age `dueDate` and call the result
dormancy. Falling back to `updatedAt` does not rescue it either: the fallback
only fires when there is **no** date field, and here there is one. It is just
the wrong one.

So the field is picked, preselected from a name that looks like contact, and
**named on screen and in the file** — §37's filter already names the field it
watches, because filtering on a date the reader cannot see is indistinguishable
from rows going missing. §45's answer to exactly this shape, one feature over.

**And my own default rebuilt the trap, which the probe caught and reading
would not have.** The first version preferred *"the first module with any date
field"*, so on an ordinary Contacts + Deals workspace — Contacts has no date
field, Deals has `closeDate` — contacted mode opened on **Deals, aged on
Expected close**. Measured at three viewports while checking the layout, and
visible in one line of probe output. It prefers a *contact-ish* module and
otherwise simply the first, so with no date field the explanatory note fires
and says what to add, rather than answering a question nobody asked.

### The two clocks, and `monthsAgoDay`

`updatedAt` is a local millisecond stamp. A stored date field is `YYYY-MM-DD`,
which `parseDay` turns into a UTC-projected midnight. **Different coordinate
systems**, and mixing them fails two ways:

- `Number('2024-09-12')` is `NaN`, so the shortcut drops every row into
  `undated` and reports a clean workspace;
- comparing a day coordinate against `monthsAgo`'s instant is off by the
  clock-time, which is **worse**, because a handful of boundary rows move and
  the list still looks right.

So `js/date-rules.js` gains `monthsAgoDay(now, months)`: the day `monthsAgo`
landed on, read with local getters and projected the way `today()` does,
directly comparable with `parseDay` and with nothing else. **No `zone`
parameter, deliberately** — both callers run in the browser, and a zone
argument would invite somebody to pass the workspace's, which is exactly the
unification §39 forbids.

Three unit tests, checked against a bare `return monthsAgo(now, months)`: all
three fail. The arithmetic is unit-tested and the wiring is E2E-tested, which
is the right split — the clock-time bug is invisible at E2E scale (a
three-year-old date is stale on both readings) and obvious at unit scale.

### One card, two questions — and the crossed pair that proves it

Two cards would be two nearly identical scanners on one screen, which is §33's
adjacent-and-unlabelled-numbers problem waiting to happen. They are one query
asked twice, so they share one control row, one scan and one renderer, and the
copy is what differs.

**The E2E is one arrangement of records and it fails in both directions.** One
record is edited today and was last contacted three years ago; another was
contacted today and last edited three years ago. Each mode must return exactly
one, and they must be different ones.

A test that only checked *"the dormant one appears"* would pass on a report
that ignored the field entirely — a row three years old is old on both clocks
unless something is deliberately new on one of them. That is why the pair is
crossed rather than a single stale record.

Two mutations were run. `byField = false` fails, but on the **wording**
(`uncontacted` becomes `unchanged`) rather than on the rows — a true failure
naming the wrong thing. Keeping the label and swapping only the comparison to
`Number(r.updatedAt)` fails on `toHaveCount(2)` against 1, which is the
assertion actually doing the work. Recorded because the first mutation looked
sufficient and was not.

### The rest, and what each is for

- **Segmentation is two more selects**: which module (you want dormant
  customers, not dormant invoices) and a dropdown value. Client-side over rows
  already in memory, §37's shape. Both reset when the module changes — a field
  key or an option value from the previous module matches nothing, and an empty
  list is reported exactly like a real answer.
- **CSV beside the JSON.** This is the one report whose output gets pasted into
  a mail tool, and `js/csv.js` already prefixes a leading `=`/`+`/`-`/`@` so a
  name cannot execute as a formula on open.
- **Empty contact dates are counted, never folded in.** They are not dormant
  customers, they are customers nobody has logged — a habit problem with a
  different fix, and on a first run usually the more useful number.
- **`fmtDate`, not `fmtWhen`, for a day coordinate.** `fmtWhen` runs
  `toLocaleDateString` on the ms, and a UTC midnight renders as the *previous*
  day for anyone west of Greenwich — §37's trap, in the one place a report says
  a date out loud.

### §44's button count became an allow-list

§44 pinned *"no delete button"* structurally with
`expect('#stale-results button').toHaveCount(1)`. Adding the CSV button makes
that 2 — and **bumping the number would have kept the shape of the assertion
and thrown away its meaning.** It now compares the sorted ids against
`['stale-download', 'stale-download-csv']`, so a third button fails by name.
A count says nothing about *which* buttons they are, which is the entire point
of a guard against a control that acts on the list.

### Traps hit while building it

- **`.dsar-search` is a non-wrapping flex row capped at 62ch.** Five controls
  in it crush each select to about ten characters — §4's layout trap, which
  renders perfectly plausibly. `.stale-search` wraps and releases the cap, and
  **must sit after `.dsar-search .input`**: same specificity (0,2,0), so order
  decides. Measured rather than judged, at 1440/900/390: the row wraps to
  38/128/173px tall and `scrollWidth` never exceeds the viewport at any of
  them.
- **`modules` is not a global in either sense.** §39 records `DB` and §41
  records `Cloud` as bare globals rather than `window.` properties; this is the
  third variant and the strictest — `modules` is a `let` *inside* app.js's
  IIFE, so a `page.evaluate` reference **throws** rather than returning
  undefined. Read module ids through `DB.getAll('modules')`.
- **`#f-name`, not `#f-client_name`.** Relabelling the builder's default field
  keeps its key, because record data survives a rename (§4). Walked straight
  into it; the id looks wrong beside a column headed *Client name*, so the test
  says why.

### Blast radius

`js/app.js`, `js/date-rules.js` and `css/style.css` are all in `APP_SHELL`, so
`CACHE_VERSION` → `crmbuilder-v49`. No new served file and no route, so the
smoke count stays **45 local / 50 live** — running it is what proves that (§9).
`server.js` requires `js/date-rules.js` (§39), so the addition has a second
consumer no browser test covers; `monthsAgoDay` is additive and the server does
not call it, and the shared-surface test covers the export list either way.

Counts: Node **418 → 421**, Playwright **118 → 119**, smoke **45** locally.

### Docs walked (§27)

| | Needed |
|---|---|
| `README.md` | its own feature bullet |
| `guide.html` | a paragraph in the week-shaped section, not the compliance one |
| `USER-GUIDE.md`, `docs/manual.html` | a *The other question* subsection with the two-clock table |
| `docs/product-tour.html` | its own tile — *The customers nobody has called* |
| `docs/ONBOARDING.md` | a week-1 step: add a *Last contacted* field while they are still keen |
| `docs/DEMO-SCRIPT.md` | its own expected question, with the distinction shown rather than described |
| `docs/BETA.md` tester note | the mode, and what an empty field means |
| `terms.html` | **nothing** — checked. Retention is a controller duty and that sentence is still true; dormancy is commercial |
| `docs/API.md` | nothing — client-only, no route, no wire change |

**The dormancy material is deliberately kept OUT of the GDPR paragraphs** in
`ONBOARDING.md`, `DEMO-SCRIPT.md` and `BETA.md` — which is where the eye goes,
because that is where the retention review lives. Winning back a lapsed
customer is a commercial act, and filing it beside the data-protection tools
would imply a compliance claim it does not make. Same call as §49's, for the
same reason, one file over.


---

## 51. The chaser that writes the email and does not send it

Part 3 of [`docs/CHASER-AND-TRACKERS.md`](docs/CHASER-AND-TRACKERS.md), first
commit. Open an overdue record and **Chase by email** drafts the reminder and
hands it to the reader's own mail client.

**This is not scaffolding for the BYOK send.** It is the permanent fallback for
any workspace that never adds a key, and it is what a sole trader — the reader
`guide.html` is written for — will use for ever. It also happens to remove the
thing the brief actually named: *chasing payment feels awkward*. The draft says
the awkward part, and the money was already earned.

What it buys by not sending: no credential, no sub-processor, no bounce
handling, no deliverability, no privacy-roster change — and the mail leaves
from the address the customer already recognises, with the sender's own
signature on it. A payment reminder from a system nobody recognises gets
ignored, so this is the point rather than the limitation.

### Available to every role, and that is a decision

§14's ladder and decision 4 in the spec say owner + member. **That governs
`canSendMail()` on the route that will send through our server, and there is no
route here.** This composes a draft in the reader's own mail client, from their
own address, out of an address they can already read off the record — §36 keeps
export open to every role for exactly that reason. Gating it would buy nothing
real and would tell a contributor their own mail client is off limits.

Recorded rather than left to be inferred, because it looks like a decision-4
violation to anybody reading the ladder first.

### `encodeURIComponent`, never `esc()` — and the reverse is a bug too

A URL and a document are different things, and the two escapes are not
interchangeable in either direction:

| | Wrong tool | What the reader gets |
|---|---|---|
| the `href` | `esc()` | `&` and `#` intact, so the body stops at the first one |
| the preview | `encodeURIComponent` | a wall of `%20` that still looks like a message |

Both directions are asserted. The mutation swapping in `esc()` fails on
`%0D%0A` and prints the raw body back in the diff, which is the failure naming
itself.

**`\r\n`, not `\n`**, so the body encodes to `%0D%0A` as RFC 6068 asks — a bare
`%0A` renders the whole message on one line in some clients. **The address
keeps its `@`**: percent-encoding it is spec-legal and every client is
nonetheless tested against the plain form, so `encodeURIComponent(...)` then
`.replace(/%40/g, '@')`.

### The subject is capped and the body is trimmed, and that asymmetry is load-bearing

A record name is not bounded by anything — it arrives from a CSV import and a
restored backup as well as from the form (§3's threat model). So:

- the **subject** is capped at 150 characters, because a subject is a label and
  a truncated one still identifies the mail;
- the **body** keeps the full reference and is trimmed only if the assembled
  href would exceed 2000 characters, **visibly**, with the count on screen
  before anything is pressed.

Truncating the reference *inside* the message would be wrong in a way somebody
could act on; truncating it in the subject is not.

**The cap is what makes the budget work at all, and the mutation proves it.**
Removing it leaves the trim with nothing it can do: the body is cut to a single
ellipsis and the href is **still 2690 characters**. That is a guard reporting
success while failing — this file's standing failure shape, and it was measured
rather than predicted.

The trim binary-searches the longest body that fits rather than estimating a
ratio: percent-encoding runs between one and nine characters per source
character, so a fixed guess is badly wrong on either an ASCII or an
emoji-heavy message.

### The address is resolved, and the preview says how

An invoice does not usually carry an email; the customer does. So
`chaseRecipient` looks for an `email` field on the record, then follows a
relation to a record that has one — and carries back **`via`**, the name of the
record the address came from, because resolving through a link is a step the
reader should be able to check. §37's filter names the date field it watches
for the same reason: a resolution the reader cannot trace is one they have to
take on trust.

Both branches are covered: the first journey resolves through a relation, the
second reads the address off the record itself.

**Absent, not inert.** The button is built only when the record is past the
watched date *and* an address was found — §36's rule 1, rather than a control
that opens a dialog to explain it cannot work. Both halves are resolved before
the modal is assembled, which is why `openRecord` gained an await.

### The real risk is accuracy, not privacy

§39's counts-only rule exists because a webhook destination may be a shared
channel. Here the recipient **is** the customer, so that reasoning does not
apply and decision 5 puts the reference and the balance in the message — a
reminder that does not say what is owed cannot do its job.

What replaces it is a different risk: **a wrong balance is a demand sent to
somebody who has already paid**, which is worse than a vague nudge. Two
mitigations, and neither is optional:

- the **preview**, which is the whole interaction rather than a confirmation
  step — and which says the message was built from the record as it stands;
- the line every real dunning email carries: *"If you have already paid, please
  disregard this message."*

The reference is the record's own **name** — the first field, whatever the user
chose to identify these by — rather than a guess at which text field holds an
invoice number. Guessing there would be confidently wrong on half the
workspaces that have one.

### A nested layer, per §22

`openModal` replaces the whole of `#modal-root`, so previewing from inside the
record would destroy the record — and Close would then cost the reader every
unsaved edit rather than returning them to it. `openNestedModal` /
`closeNested`, and the E2E asserts `#record-save` is still there afterwards.

The Open button is a real `<a href>`, so the browser performs the handoff; the
layer closes on a `setTimeout(…, 0)` **after** it, never instead of it. A
`preventDefault` here would close the preview and open nothing.

### No new CSS, and that was checked rather than assumed

§27's invented-class trap has now cost time four times, so the preview is built
entirely from classes that already exist: `.read-row` / `.read-label` /
`.read-value`, `.read-note` (which already carries `white-space: pre-wrap`,
exactly right for a message body), `.settings-hint`, `.modal-foot`.

**`.read-row` is only styled inside `.record-read`**, so the preview body
carries that class. Without it the rows render at browser defaults and look
plausible in a screenshot, which is the trap in its usual shape.

### Test traps

- **The Contacts template seeds an "Amira Hassan"**, so creating one made
  `tr:has-text("Amira Hassan")` match two rows. §34's rule is about not
  depending on what the seed produced; this is the other half — not colliding
  with it either.
- **`textContent` normalises CRLF to LF.** The href decodes back to `\r\n` and
  the screen reports `\n`, so the round-trip assertion compares on one of them.
  The first version failed by two characters in each direction and said only
  that the strings differed.
- **`#f-name`, not `#f-reference`** — §4 again, and the third time in three
  sections. Relabelling the builder's default field keeps its key.

### Blast radius

`js/app.js` is in `APP_SHELL`, so `CACHE_VERSION` → `crmbuilder-v50`. No new
served file, no route, no wire change — smoke stays **45 local / 50 live**, and
running it is what proves that (§9). `safeHref` already permits `mailto:` (§3),
so the invariant needed nothing; what is not automatic is the encoding, which
is why both directions are tested.

Counts: Node **421**, Playwright **119 → 121**, smoke **45** locally.

### Docs walked (§27)

| | Needed |
|---|---|
| `README.md` | a feature bullet |
| `guide.html` | a paragraph in *Stop things slipping*, beside the digest |
| `USER-GUIDE.md`, `docs/manual.html` | a *Chasing something that is overdue* section, with the accuracy caveat as a Careful note |
| `docs/product-tour.html` | its own tile — *Chasing what is owed* |
| `docs/ONBOARDING.md` | a week-1 step on a **real** overdue invoice, and the two limits to say in the same breath |
| `docs/DEMO-SCRIPT.md` | an expected question, with "it does not send" said immediately rather than waited for |
| `docs/BETA.md` tester note | where the button is and when it appears |
| `privacy.html` | **nothing** — checked. Nothing leaves the deployment, so there is no recipient to declare. That changes with the BYOK send, and the paragraph then has to describe **both** dispatch states because this one remains the fallback (§40's complete-list lesson) |
| `terms.html`, `docs/API.md` | nothing — no route, no wire change, no processor change |

### What is deliberately still not built

Option 2 (BYOK manual send) and Option 3 (automated escalation) are both
unbuilt, and Option 3 stays that way until the scheduler question is answered
on its own. §40 records the `/health` ping having never once fired the reminder
engine for weeks, invisibly to every test here; that is an acceptable
foundation for a message nobody loses money over and not one for money
collection. `docs/CHASER-AND-TRACKERS.md` Part 3 carries the reasoning and the
`meta.mail` design, which is the next thing to build and is independent of any
send UI.


---

## 52. A second credential on the meta doc, and no send to use it yet

BYOK infrastructure for the chaser: the tenant supplies their own Resend or
Postmark key, which moves the sending domain, the deliverability reputation,
the billing and — the one that makes a payment reminder actually get paid —
the from-address off this deployment entirely.

**Storage, redaction and the adapter. No route sends anything.** That order is
deliberate and it is §38's: the webhook transport was built before the digest
that uses it, because the alternative is writing the part that handles a
credential under pressure with the feature already half-built. §51's `mailto:`
chaser is untouched and remains the permanent fallback for every workspace
that never connects a key.

### Where the key goes was already decided, by §38

Every word of the webhook's reasoning transfers, so `mail` is a **sibling** of
`settings` on the meta doc rather than a field inside it:

- `pullChanges` sends `meta.settings` **whole** to anyone whose cursor is
  behind — member, contributor, **viewer** — so a key kept there lands in every
  colleague's IndexedDB, offline, permanently.
- **And masking it on the way down would then destroy it.** The client merges
  the pulled document into local settings and pushes the whole thing back,
  where last-write-wins accepts it, so `re_•••••` overwrites the real key the
  first time an owner changes the currency. Redaction and last-write-wins
  cannot both apply to one document.

As a sibling, `putData` merges it on both stores and `pullChanges` names
`meta.settings` specifically, so sync **structurally** cannot reach it — a
guarantee that holds for somebody who never reads the comment. Asserted across
the **whole** sync response body for all three roles rather than a named field:
a field-by-field check only covers the fields somebody thought of.

### There is no masked form, and that is the departure from `publicHook`

`publicHook` returns `masked` because a webhook URL has a non-secret half that
genuinely identifies it — the host is what tells a Slack hook from a Discord
one at a glance. **A key has no such half.** What identifies this configuration
is the provider and the from-address, and both are returned in full, so a hint
like `re_••••9f2c` would be handing back bytes of the secret for no operational
gain. There is no rotation flow here that needs two keys told apart. The test
asserts the last six characters are absent too, so "improving" this fails by
name.

`verified` is the fourth field and is deliberately not something the save can
set — see below.

### The save makes NO outbound call, and that is a decision

The webhook probes at save because it can: a test notification into a chat
channel costs nothing and proves the destination. **The only way to prove an
email key is to send an email**, which would put a message in somebody's inbox
every time an owner corrects a typo in the from-address.

So §38's refuse/warn split still applies, with the warn half moved to the first
real send, because that is the only place the answer exists:

| | |
|---|---|
| **refused, 400** | a key matching neither provider's shape; a from-address that is not one — properties of the input, needing no network |
| **stored, unverified** | everything else. `verified` stays false until a send succeeds |

The consequence is stated rather than discovered: a wrong-but-well-formed key
is stored and the first send finds out. The screen can then say *not checked
yet* rather than implying a confirmation nobody made.

**A replacement key does not inherit the old one's history.** `lastOkAt` is
what `verified` reports, so carrying it forward puts a green tick over a
credential that has never been used — §17's workflow reporting success while
producing no backups, in a smaller place. **The test for that passed on the bug
first time**: `lastOkAt` is 0 on a fresh key, so an implementation that spread
the previous row forward was indistinguishable from one that did not. It plants
a verified state stop-edit-start before replacing, per §9.

### Read and write are gated differently, unlike the webhook

`PUT` needs `canEditSettings()` — owner-only, the same rule the webhook and the
currency hang off. **`GET` needs `canSendMail()`**, a new predicate: owner,
platformAdmin or member.

Mirroring the webhook exactly would leave a member with no way to know whether
sending is available, so their client would either hide a capability they have
or offer a button that 403s. What a member sees is the provider, the address
their mail goes out under, and whether it has ever worked — the facts they need
to decide whether to press send. Never the key, which is not a question of role
at all: `publicMail` does not return it to anybody.

**`canSendMail` is a new predicate rather than the existing seam**, and that is
the substance rather than the name. `canEditRecords` and `canDeleteRecords` are
enforced inside `applyPush` because they gate **sync**; a send is a route call
and never passes through that seam, so it has to be checked on the endpoint.
Owner and member — one rung above `canEditRecords`, because this is not an edit
a colleague can see and undo: it leaves the deployment, arrives in somebody's
inbox with the business's address on it, and cannot be recalled.

**§51's `mailto:` chaser is deliberately NOT gated by it.** That composes a
draft in the reader's own mail client, from their own address, out of an
address already on the record — nothing leaves the deployment and there is no
route to check. §36 keeps export open to every role for the same reason.

### Redacted on export, and the marker is not stripped

`workspaces[].meta` **is** the `data` collection, so anything on the meta doc is
in every nightly artifact — and a provider key is worth more to whoever
downloads one than a webhook URL is: a bot token posts into one chat, a Resend
key sends mail as that business to anyone.

Same treatment, same reasons, including the one that is easy to undo by
tidying: **the provider name and the from-address go too.** Carrying them would
make the re-entry notice better — *"you were sending from accounts@…"* — and
§38 declined exactly that for the webhook host, because it would put which
provider each tenant uses into an artifact §17 is already uneasy about, to save
an owner from remembering a choice they made themselves.

`restore.mjs` rewrites `{ redacted: true }` to `{ needsReentry: true }` rather
than deleting it, and `deliverMail` and `publicMail` both key on `mail.key`
being absent. Without that marker a recovery silently switches off every
customer's sending and the settings card is byte-identical to one nobody ever
filled in — §38's defect, on the messages that ask customers for money, which
nobody notices going missing.

### The one shared-helper change: `sendGuarded` takes headers

Both providers authenticate with a **header** rather than with a token in the
path, so the credential has to be able to get into the request and this
function is the only place that can put it there. Default `{}`, so every
existing caller is byte-identical.

- **`Content-Length` sits after the spread and is not overridable.** It
  describes the buffer about to be written; a caller-supplied one that
  disagrees either truncates the payload or leaves the socket waiting for bytes
  that never arrive — the hang §38 spent an afternoon on. `Content-Type` sits
  above it, because a caller may legitimately need a different one.
- **The credential is now somewhere `scrub()` cannot see.** It only knows how
  to remove the URL from a message, because until now the URL was the only
  place a secret lived. Nothing reads a request header back out — the errors
  there come from DNS and the socket — so there is nothing to scrub today, and
  the rule that keeps it true is written into the function: a header value must
  never reach an error, a log line or a stored `lastError`.

§9's shared-helper rule applies: `sendGuarded` is on the feedback, alert,
digest and Telegram paths, so this had a full run before it was trusted.

### The adapter (`lib/mail-send.js`)

**Not a new SSRF sink**, which is what makes it affordable — the Telegram case
(§38) exactly. The host is fixed and ours to choose; only the key varies, and
it varies in a header. Everything goes through `sendGuarded`, so the block
list, the DNS pin and refuse-redirects all still apply.

**The provider is detected from the key, never asked for.** `re_` → Resend, a
UUID → Postmark; the shapes do not overlap, so the paste carries the answer and
an owner who has to be told which service their own key came from was asked a
question they had already answered. §18's precedent: one payload builder, two
shapes, no setting to get wrong.

**§18's rule arrives at two more providers, and Postmark is the sharp one.** It
answers **200 with a non-zero `ErrorCode`** for an ordinary refusal — an
inactive recipient, an unconfirmed sender signature — so reading the status
alone files a refusal as a sent message and an unpaid invoice goes unchased
with the screen saying it was chased. It also uses 406 and 422, which a
status-only reading reports as a transport fault. `read()` keys on `ErrorCode`
and `MessageID`, not on the status.

**`unconfirmed` is a third state and must not be collapsed into either
neighbour.** A 2xx whose body could not be read — unparseable, or over
`maxBytes` — is neither delivery nor refusal; the mail may well have gone. §38
found the hang underneath exactly this state. Reporting it as sent leaves an
unpaid invoice unchased; reporting it as failed invites a second copy to a
customer who already has the first. The wording says the message may have gone
and points at the provider's own dashboard. **Two ways to arrive there**, and
reading only the second is how §38 filed a truncated Telegram refusal as a
delivery: `ok` with no `json`, and `too_large`, which is *not* ok but still
carries the 2xx the provider sent before the body ran away.

**`MessageStream: 'outbound'` is pinned rather than left to the account
default.** Postmark is strict about not letting marketing leak into the
transactional stream, which is precisely the line an invoice chaser must not
cross — an owner whose default has been changed would otherwise send a payment
reminder down a broadcast stream and collect an unsubscribe footer with it.

**`redactKey` removes nothing today, and that is the reason to have it.**
Neither service echoes a key into an error, but the message is persisted on the
meta doc and rendered on a settings card, so the guarantee should be local and
testable rather than emergent from two vendors' current habits — §30's argument
for the prototype-pollution guard, in a new place.

**`MAIL_API_BASE` is one seam for both providers**, not one each: their paths
differ (`/emails` against `/email`), so a single capture server tells them
apart. The guard relaxation hangs off that same variable being set rather than
a flag of its own, because two independent switches is how the wrong one ends
up set in production (§38, and §30's `GOOGLE_TOKEN_URL` before it).

### Verification

Every mutation was run, and each fails the test that names it (§9):

| Mutation | Fails |
|---|---|
| drop `...headers` from the request | *a caller's own headers reach the destination* |
| make `Content-Length` overridable | *a caller cannot override the length of the body it is not writing* — HTTP 400, or a hang |
| read Postmark by status alone | *a 200 carrying a Postmark ErrorCode is a refusal* |
| drop `MessageStream` | *a chaser goes down the transactional stream* |
| collapse `unconfirmed` into sent | *a 2xx whose answer we could not read says so* |
| drop `redactKey` | *a key echoed back by the provider is removed* |
| carry the previous row forward on PUT | *replacing the key does not carry the old one's history* |
| gate GET like the webhook | *a member may read the configuration but not change it* |
| open PUT to a member | the same test, from the other end |
| let a viewer read it | *a viewer cannot even read it* |
| stop redacting `mail` on export | four backup tests |
| strip the marker instead of rewriting it | *the restored deployment carries the re-entry marker* |
| mark every empty mail config | *a workspace that never had one is not told to re-enter anything* |

`tests/mail.test.mjs` is new, ports **9800–9850** (§9), and split the same way
`ssrf.test.mjs` is: detection is pure and needs no sockets, the provider shapes
run against a capture server with the block list stood down, because a local
server is loopback and loopback is the first thing the guard refuses.

`tests/smoke.mjs` asserts `/lib/mail-send.js` is a **404** — the allow-list
check run backwards, beside `safe-fetch.js`. It is the file it would hurt most
to serve: a served copy is a standing invitation to move it to `js/` so a
browser could call it, which is exactly how a provider key ends up in
front-end code. Smoke **45 → 46** locally.

### No `CACHE_VERSION` bump, and no docs walk

**Checked rather than assumed.** Nothing under `js/`, `css/` or the app shell
changed — this is entirely `server.js`, `lib/`, `scripts/` and tests — so
`crmbuilder-v50` stands.

`docs/API.md` carries the two new routes and its count moves **52 → 54**,
verified with `grep -cE "^app\.(get|post|put|patch|delete)\(" server.js`
rather than incremented by hand (§29 records that number going stale twice).

**§27's six user-facing documents need nothing, and that is a checked
omission**: no client calls either route, so there is no capability a user has
gained. Padding them to look thorough is its own inaccuracy (§40, §41). They
get walked with the send UI, which is when a user can do something new.

### `privacy.html` is deliberately NOT updated

**Nothing calls the adapter, so no personal data leaves the deployment through
it.** A paragraph saying customer addresses go to Resend or Postmark would be
an intention written as a fact — §38 caught that exact shape before a commit
(backups *"are encrypted"* when they were not), §40 records it as the standing
rule, and §41 published the encryption sentence only once an encrypted artifact
had been downloaded and restored end to end.

The paragraph is **drafted** in `docs/CHASER-AND-TRACKERS.md` § *"The
`privacy.html` paragraph"*, with the four things in it that are load-bearing,
so it is written while the design is in front of somebody rather than
summarised at the end of the send commit. It moves onto the page when the first
send actually runs.

### What is still not built

The send route, the button, and the `privacy.html` paragraph. **Automated
escalation remains rejected** and the reason is unchanged: the scheduler, not
the email. §40 records the `/health` ping having never once fired the reminder
engine for weeks, invisibly to every test here — an acceptable foundation for a
message nobody loses money over, and not one for money collection.


---

## 53. The send, and the relay it would have been

The button §52 built the storage and the adapter for. `POST /api/org/mail/send`
takes an overdue record, sends the chaser through the workspace's own provider,
and reports what the provider said.

**§51's `mailto:` draft is untouched and stays the default.** It needs no
setup, works offline, works for every role, and is what a sole trader will use
for ever. The send is the second button on the same preview, demoted from
primary rather than replacing it — somebody who would rather send from their
own outbox keeps that option, and on a first send most will.

### The recipient is resolved by the SERVER, and that is the whole route

The obvious shape is `{ to, subject, text }` and it is an **open relay**: an
authenticated member of any workspace holding a key could send arbitrary text,
from a verified business domain, to any address on the internet. The key is the
tenant's and the reputation burned is theirs, which makes it their problem and
not ours — and shipping it would still be shipping a relay.

So the server looks the record up under the session's `wsId` and walks the same
two steps the client does: an `email` field on the record, then the first
relation leading to a record that carries one. **That bounds a send to the
addresses the workspace already holds**, which is the difference between a CRM
feature and a mailer.

**`to` still travels, and only to be COMPARED.** A mismatch is a **409** naming
both addresses, because it means the two copies of the record disagree — a
colleague edited it, or this replica is behind — and that is exactly the state
in which a demand for money must not go out. Silently preferring the server's
answer mails somebody the reader never saw; silently trusting the body reopens
the relay. Guarded by *"the recipient comes from the record, never from the
body"*, which asserts **nothing was sent** as well as the status.

**The client pushes before sending**, because the server reads its own copy.
`persist()` only schedules a debounced push (§39), so a record edited a moment
ago is not there yet and would earn a refusal that is correct and reads as a
bug. §43's delete confirmation had the same shape.

### What is NOT server-established, and the trade

`subject` and `text` come from the client, bounded at 200 and 4 000. A member
can therefore send arbitrary text — to an address already in their own CRM,
under their own business's name, which they could equally do from their own mail
client. The recipient is the half that matters and it is closed.

**The alternative was costed.** The server could compose the message: it has
`DateRules`, the currency, and the record. §39's digest preview is the
precedent, and returning the real string is the better product answer. It was
not done because **the `mailto:` half must work offline**, so the client
composer has to exist regardless — and then two composers must agree with
nothing checking that they do. If it is ever wanted, the thing that makes it
safe is a parity test, exactly as §39 pinned the digest count against the
filter's.

### `canSendMail` on the route, and one rung up

Owner and member. `canEditRecords` and `canDeleteRecords` live inside
`applyPush` because they gate **sync**; a send is a route call and never passes
through that seam, so it is checked on the endpoint (§52). A client-side
`canSendMail()` mirrors it and only avoids offering a button whose effect would
be refused a second later.

A record in another workspace answers **404, not 403** — the workspace is never
a parameter, so this is not a permission answer at all: the row genuinely is not
in the caller's workspace, and a different code would confirm it exists
somewhere (§5).

### A 403 from the provider is not a bad key, and saying so was a bug

**Found by a test asserting on the wording rather than on the code**, which is
the only thing that could have found it: the status was right on the broken
version.

`lib/mail-send.js` mapped 401 **and 403** to *"refused that key"*. Resend
answers 401 for a key it does not recognise and **403 for a key that is fine
but is not allowed to send from that domain** — the unverified sending domain,
which is the single most common way a first send fails. So an owner was told to
replace a perfectly good key while the real problem was a DNS record at their
provider; they would have replaced it, seen the same 403, and concluded the
feature was broken.

403 falls through to `provider` now and carries the service's own words, which
name the domain. Guarded by *"a provider's refusal reaches the caller in the
provider's own words"*; restoring the 403 fails it and its companion.

### The rate limit was wrong, and the tests are what said so

20/min, not the 10 it shipped with. §38 records the same shape for the Telegram
lookup: the first run failed with 429s, **which was the limiter working and the
number being wrong.** Proving a webhook works is done once; working down a
morning's overdue invoices is a person clicking through a list, and a bound
tuned for the first refuses the eleventh of the second. Raised on its own
merits rather than overridden in the test environment, so the suite still
exercises the production default.

### The screen

The Send button is **painted in after the preview exists**, never by
re-rendering — §38's Telegram rule. Making the whole preview wait on a round
trip to discover whether a second button exists would slow the path everybody
uses in order to serve the one some workspaces have, and the draft has to be
usable instantly and offline. A workspace with no key simply never grows it
(§36's rule 1).

The failure is left **on screen rather than toasted**: the provider's message
is what the reader has to act on, and a toast fades.

Settings gains a *Sending reminders by email* card — owner-only to write,
mirroring the webhook's. It renders the provider, the from-address and when a
send last worked as a **read view, never a filled-in input** (§36 rule 2), and
says plainly that the key has not been checked when `verified` is false.

**Two things were nearly invented, and §27's trap is why they were checked.**
`LUCIDE` has no `send` — `js/icons.js` is generated (§6) and an unknown name
falls back to a **box**, which renders plausibly and means nothing. The pair it
does carry describes the two buttons better anyway: `external-link` hands off to
another app, `mail` is the mail. And `.is-disabled` does not exist in
`css/style.css`; the juggling that wanted it was dropped rather than the class
added.

### The E2E was signed out, and one test was passing for the wrong reason

The first run failed with the Send button simply absent — which was
`offerToSend` **working**: an anonymous workspace has no server-side key, so
there is nothing that could send. The failure was the product being right about
the state the test was in.

The more useful half is the companion. *"a workspace with no provider still
gets the draft"* **passed** on that same signed-out build, and would have passed
on a version that ignored the mail state entirely — the button was absent for
the wrong reason. Both sign in now, and each mutation fails a different one:
never calling `offerToSend` fails the first, offering it regardless of
`configured` fails the second. That split is what shows they cover different
things rather than one twice.

The provider is intercepted rather than real (§20's precedent) — a browser test
cannot hold a key or reach Resend. `seedOverdueInvoice()` was **extracted**
from §51's journey rather than copied, because a second copy is what goes stale
in one direction while the other keeps passing (§29).

### `privacy.html` says it now, because it is now true

§52 deferred the paragraph with a condition: *"it moves onto the page when the
first send actually runs."* It can, so it has. The four load-bearing parts,
drafted in `docs/CHASER-AND-TRACKERS.md` before any of this was built:

- **Resend and Postmark are named.** §40 was caught twice by a roster closing
  with *"That is the complete list"* while omitting first GitHub and then
  Telegram — both found by looking at what the deployment does rather than at
  the code. This is a third recipient of personal data.
- **Scoped to the owner's choice**, like §40's treatment of the digest: their
  account, their contract, disclosed without being claimed as one of ours.
- **"Nothing is sent automatically"** is a property, not reassurance.
- **The `mailto:` fallback is in the same paragraph**, because it stays the
  behaviour for every workspace that never connects a key. Describing only the
  send would leave the majority reading about something that does not happen to
  them.

**`terms.html` moved too, and so did `TERMS_VERSION`.** It gained a sentence
saying that a digest destination or an email provider the tenant connects is
their own relationship rather than one of our sub-processors — which is the
controller/processor split, and belongs there rather than on the privacy page.
§41's rule is that the constant in `server.js` and the *Last updated* line are
one fact in two places and must move together, so both went to `2026-09-09`.
**Everybody is re-prompted**, which is the mechanism working: a change to the
terms is meant to be announced rather than slipped in.

### Not built, and still not

**~~No per-record send log.~~ Built — see §54**, and the paragraph that stood
here got the mechanism wrong, which is why it is corrected rather than deleted.
It said a `doc` sibling would lose to a stale copy through the **§26 field-merge
seam**. That is not what destroys one: `docShell()` is `{ ...stored,
...incoming }`, so a sibling is replaced **with no clock involved at all** — and
`envelope()` takes the incoming doc wholesale on the plain path besides. Two
mechanisms, neither of them the one named. The fix turned out to be *simpler*
than field clocks rather than harder, because an append-only log merges by
union. Deferring it was still right; the reasoning for deferring it was not.

**Automated escalation remains rejected**, unchanged: the scheduler, not the
email. §40 records the `/health` ping having never once fired the reminder
engine for weeks, invisibly to every test here — an acceptable foundation for a
message nobody loses money over, and not one for money collection.

### Blast radius

`js/app.js` and `js/cloud.js` are in `APP_SHELL` → `CACHE_VERSION`
**`crmbuilder-v51`**. `privacy.html` and `terms.html` are in
`STANDALONE_PAGES` and go straight to the network, never precached (§19) —
checked, not assumed. No new served file, so smoke stays **46 local / 51 live**,
and running it is what proves that (§9).

`docs/API.md` carries the route and its count moves **54 → 55**, counted with
`grep -cE "^app\.(get|post|put|patch|delete)\(" server.js`. Every one of §27's
documents needed something this time, because a user can now do something new —
which is the difference from §52, where the omission was the checked answer.

Counts: Node **467 → 480**, Playwright **121 → 123**, smoke **46** locally.


---

## 54. The chase log, and a doc sibling that nothing was protecting

"Has anyone already chased this?" — on a team, the question that decides
whether a customer gets one reminder or two demands for the same money on the
same afternoon. Every reminder sent or drafted is now recorded on the record.

### §53 deferred this for the wrong reason, and the right reason was worse

§53 said a per-record log needed a server-originated write that would land in
**§26's field-merge seam**, where a value carrying no `fieldsAt` entry loses to
a colleague's stale copy. That was reasoned about rather than read, and it is
not the mechanism. Reading `applyPush` first found **two** destroyers, neither
of them clocks:

| Path | What happens to a `doc` sibling |
|---|---|
| **merge** (`canMerge`) | `docShell()` is `{ ...stored, ...incoming }` — the pusher's copy replaces the stored one outright, with no clock anywhere in it |
| **plain** (no field clocks either side) | `envelope()` takes the incoming `doc` **wholesale** |

The second is the common case, not the exotic one: **a record nobody has
edited since creating it carries no `fieldsAt` at all** (§26), which is exactly
where a freshly imported invoice sits. So a device that synced yesterday, went
offline, and pushes today erases every chase logged in between — and it does
that whoever wrote them.

**The fix is simpler than field clocks, not harder.** A chase log is
**append-only**: entries are never edited and never removed, so there is
nothing for a clock to arbitrate. The correct merge for an append-only set is a
**union**, which cannot lose a write in either direction and needs no clocks.
That is why this was affordable where §26's field merge was genuinely hard, and
it is the part the deferral got backwards.

### Where the union sits, and why not inside mergeFields

**Hoisted above both branches**, before either is chosen. Putting it in
`mergeFields` — the obvious home, since that is where merging lives — covers
the merge path and leaves the plain path still replacing the doc wholesale.
Both branches read `item` from one place, so one union covers both.

**`chaseGrew` keeps the row out of `won`.** A push must not be echoed back what
it sent (§10), but a row whose log grew underneath it is no longer what they
sent — withholding it leaves the pusher's screen saying nobody has chased this.
Exactly the rule `mergeFields` already carries for a merged row.

**The `prior &&` guard was wrong and the tests caught it.** The first version
only unioned when there was something to union against, so a record's **first**
push skipped it — and with it the coercion and the cap, which is where they
matter most: a caller-chosen id, twenty-five entries and `by` as a Mongo
operator all went in untouched on a row nobody had seen before. Two tests
failed on it; without them it would still be there.

### Two writers, and they claim different things

| | Written by | Because |
|---|---|---|
| `via: 'sent'` | the **server**, on a successful `/api/org/mail/send` | only the server watched the provider accept it |
| `via: 'drafted'` | the **client**, on the `mailto:` handoff | nothing on the server ever sees a mailto open |

**A draft is never recorded as a send**, and an unrecognised `via` from a
client falls to `drafted` rather than being rejected — the weaker of the two
claims, because nothing may be upgraded into "this was sent" on a browser's
say-so. §52's `unconfirmed`, in a new place. The wording on screen keeps them
apart too: *a reminder was sent* against *a reminder was drafted*.

**A refused send logs nothing.** Otherwise the log says a reminder went out
when the provider refused it, and the next person leaves an unpaid invoice
alone on the strength of it. Guarded by a test that moves the write above the
`502` and fails.

**The server bumps `updatedAt`, not only `serverAt`.** `mergeChanges` on the
client skips any incoming row whose clock is not newer than its local one, so a
row that moved only its `serverAt` would reach every device and be ignored by
all of them — §26's stamp trap, arrived at from the server's side. Asserted,
because the row still *arrives* either way and only a colleague would notice.

**It re-reads the record after the send** rather than writing back the envelope
fetched before it: that one is seconds old across a network round trip and
would clobber a colleague's edit made in between.

### Traps and decisions

- **A sibling of `data`, never a key inside it.** `data` is keyed by the user's
  own field keys, so a synthetic one there would appear in every CSV export, be
  searched as a field, and collide with a field somebody named `chases` —
  §22's ghost data, invited in deliberately.
- **Coerced key by key, never spread.** This is a client-supplied array of
  objects landing on a stored document, which is the richest such payload here.
  §30's Phase 2 rule about a JSON body; `sanitiseContext`'s whitelist (§18) at
  a second site.
- **Capped at 20.** Unbounded growth on a row that syncs, against a 512 MB
  shared tier (§17, §33). A truncated entry re-offered by a stale device is
  dropped again and converges in one round.
- **A record nobody has chased grows no key at all**, so the overwhelming
  majority of rows cost nothing — §26's rule for `fieldsAt`, and it has its own
  test because "costs nothing" is the kind of claim that quietly stops holding.
- **`logChase` MUTATES the record the UI is holding.** The modal, the preview
  and the rendered row are all the same object; writing a copy would leave every
  one of them saying "Chase by email" on a record just chased. Ugly, and the
  alternative is a label that lies.
- **The draft write is not awaited.** The anchor's own navigation is what opens
  the mail client, and making it wait on an IndexedDB write — to record
  something we are not even certain will be sent — would put a storage failure
  between a person and their own email app.
- **A viewer's draft is not logged, deliberately.** A viewer may draft (§51 —
  every role) and may not write a record, so attempting it pushes a row
  `applyPush` refuses and the client reverts it and toasts *"your change was
  reverted"* at somebody who pressed **Open in my email app**. A rule arriving
  as a bug report (§14). Said plainly in the user docs.
- **Chasing counts as touching the record**, so §44's retention review and
  §50's dormancy report stop counting it. Correct rather than incidental — a
  record you chased last week is not one nothing has touched — but it is a
  consequence, so it is written down.

### The subject-access search could not see it, and that is the find

§43's whole premise is that *"we hold nothing about you"* is the one answer a
subject access request must never get wrong. The search walks `record.data` —
and the log is **not in `record.data`**. So a customer whose only trace in a
workspace was having been chased for money would have been answered with
silence, **by the tool built to stop exactly that**.

Found by walking the feature that added the field, not by re-reading
`js/dsar.js`, which read perfectly correctly the whole time. That is §46's
shape: a contract moved underneath a line that still says something true.

`js/dsar.js` searches `to` and `byName` now — a colleague can make a request
too, and their name is only in here — reports the hit as *Reminder history*,
and carries the log in the downloaded bundle. A bundle that finds a match and
then omits the thing that matched is worse than not searching for it.

### Verification

Eleven mutations, each failing the test that names it (§9):

| Mutation | Fails |
|---|---|
| union only inside `mergeFields` | four tests, including *a stale device pushing a record does not erase a chase logged since* |
| last-write-wins instead of a union | three, including *two devices each logging a chase keep both* |
| `won` set even when the log grew | *a pusher receives back a record whose log grew under it* |
| no cap | *the log is bounded, keeping the most recent* |
| `via` trusted from the client | *a client cannot invent a shape, and cannot upgrade a draft into a send* |
| the send does not log | *a successful send is logged on the record, by the server* |
| the log written before the provider answers | *a REFUSED send logs nothing* |
| `updatedAt` not bumped on the server write | *a successful send is logged…* |
| the draft is not logged | the draft journey |
| a draft claims it was sent | the same journey, on the wording |
| the role gate removed | *a view-only account can still draft a chase…* |
| the DSAR walk skips the log | *somebody who only appears in a reminder is still found* |

**And the viewer journey passed against its own mutation three times.** It
asserted the toast and the stored count, and **both read identically on a build
with the role gate removed** — `applyPush` refuses the row and
`applyRejections` restores the server's copy, so the end state is clean either
way, and the toast is a paint race on top of that. It was not diagnosed by
reading: the mutation was applied, `grep` confirmed the line was gone from the
file, and the test still passed. A probe printing the state at each step is
what showed the toast arriving *after* the assertion, and that the earlier
2-second wait — which I had removed as noise — was the thing letting the
**debounced** push fire at all (§39).

It asserts on **the push bodies** now: a correct build never writes, so the row
never goes dirty and `"chases"` never appears in a request at all. Timing-proof,
and it names the actual rule rather than a symptom of it. §9's *"a test that
passes on the bug is worthless"*, earned the hard way.

### One failure in two of four full runs, recorded rather than dismissed

Two full runs were 125/125; two had one failure each — *signing out hides the
workspace* and *an owner invites, and the colleague joins* — **different tests,
both multi-context team journeys, both passing in isolation** (8.1s and 12.8s
against 25s budgets).

What is known, and it is deliberately not inflated into a diagnosis:

- **`data/e2e` does not accumulate across runs.** 12K before a run, 560K after
  — `playwright.config.js` clears it (§32), so that mechanism is not this.
- **The suite went 5.6m → 5.7–6.2m**, and the three journeys added here
  (two of them multi-context) account for roughly that.
- **Nothing in this change sits on the sync path measurably.** `unionChases`
  on a record with no log is two maps over empty arrays.
- **23 `newContext()` calls against 23 `close()` calls** — but every one of
  them is skipped on a failure, which is pre-existing and is a real
  within-a-run leak once something fails.

**The budgets are the lever and widening them is the wrong move** (§42): they
are what makes "the join did not happen" distinguishable from "the join was
slow". If it recurs, start from the failing page's console rather than from the
timeout — and note that both failures so far were on the *owner's* page, not
the colleague's, which the snapshot is what says.

### Blast radius

`js/app.js`, `js/cloud.js` and `js/dsar.js` are in `APP_SHELL`, so
`CACHE_VERSION` → **`crmbuilder-v52`**. No new served file, so smoke stays
**46 local / 51 live** — running it is what proves that (§9).

**`docs/API.md` gains a section and no route.** The count stays 55 and the file
*looked* current, which is §46's exact trap — what moved is a **wire shape**:
`doc.chases` is the only part of a record that merges by union, and a caller's
push comes back re-sorted, coerced and possibly capped. A client reading the
old page would have had no way to know any of that.

`privacy.html` and `terms.html` need **nothing**, checked rather than skipped:
the log holds a customer's address that was already on the record and a
colleague's name already on the Team screen, it goes nowhere new, and it is
covered by "your CRM contents are stored on our server".

Counts: Node **480 → 493**, Playwright **123 → 125**, smoke **46** locally.


---

## 55. A write the server could not make took the whole deployment with it

Reported from a Windows machine: CI green, the Node half of `npm test` green
(493, one skipped — §4's SIGTERM note), and the Playwright run dying at test 33
with the **web server gone**, taking tests 33–69 with it.

```
[WebServer] Error: EPERM: operation not permitted, rename
  'data\e2e\store.json.20680.tmp' -> 'data\e2e\store.json'
    at FileStore.save (server.js:240)
    at FileStore.putItems (server.js:342)
    at applyPush (server.js:1791)
  Node.js v24.18.1        <- the process, gone
```

**Two faults, and only the second is about Windows.** Reading the stack as one
bug produces a Windows fix and leaves a deployment that dies on a full disk.

### Fault 1: Express 4 does not catch a rejected promise

An `async` route handler that rejects does not reach the error handler — Express
4 never looks at the return value, so it becomes an **unhandled rejection**, and
Node ≥ 15 exits on those by default. **48 of the 55 routes here are `async`**,
`requireAuth` is async too, and nothing wrapped any of them.

So this was never about renaming. A Mongo timeout, a full disk, or any `await`
that throws inside a handler kills the deployment the same way — and §30's
Phase 4 *"error handler that cannot leak"* only ever covered **synchronous**
throws, which is why the audit read as complete.

**Reproduced on Linux**, which is what says it is not a platform artifact
(§9's triage rule, coming out the other way for once): a probe that put a
non-empty directory where `store.json` goes gave
`PUSH RESULT: fetch failed` — the connection dying mid-flight, not a status —
then `SERVER EXITED: 1`, `STILL ALIVE: DEAD`.

The fix is at the **router**, not on 48 handlers:

```js
for (const verb of ['get', 'post', 'put', 'patch', 'delete', 'all', 'use']) {
  const original = app[verb].bind(app);
  app[verb] = (...args) => original(...args.map(wrapAsync));
}
```

- **Arity 4 is left alone.** That is how Express recognises an error handler,
  and wrapping one hides the handler this exists to reach.
- **`.catch(next)`, never `await`.** The handler owns the response; awaiting it
  would add a microtask to every successful request and change ordering on the
  one path that must not move.
- **A router patch rather than a wrapper at each call site**, because the next
  route somebody adds is `async` too and would not be wrapped. This is §31's
  argument for putting the guard in `DB.put` rather than at the writes.

`express-async-errors` does this and is a fifth production dependency for
twelve lines (§30: four dependencies is an asset on a shared free tier).
Express 5 does it natively and is not a change to make while chasing a crash.

### Fault 2: the rename is transient on Windows

rename(2) there is `MoveFileEx`, which fails **EPERM/EACCES/EBUSY** while
anything at all holds the destination — Defender scanning the file just
written, Search indexing it, an editor with it open. It clears in
milliseconds, and it is common enough that an ordinary E2E run hit it.

`save()` retries, bounded at ten attempts, **errno-scoped**: ENOSPC,
ENOTEMPTY, EISDIR and EROFS describe states that will not improve, so
retrying them turns a clear failure into a slow one. They throw at once, and
fault 1's fix is what turns that into a 500.

- **A synchronous sleep** (`Atomics.wait`), because `save()` is synchronous and
  every caller depends on that. Making it async means auditing every write path
  for an interleaving that cannot happen today. It runs only on the failure
  branch and for at most ~180ms.
- **The temp file is removed when it gives up.** Otherwise one stale
  `store.json.<pid>.tmp` accumulates per failure, in the directory holding
  every customer's records.

### The test, and how it is made to fail here

`tests/resilience.test.mjs`, ports 9900–9950 (§9). The hard part is making a
write impossible **on a machine that is not Windows**, and the honest answer is
two mechanisms plus a skip:

| | Stops | Set by |
|---|---|---|
| `chmod(dir, 0o500)` | an ordinary user — which is CI | anyone |
| `chattr +i <file>` | **root**, which is what this container runs as | root |

Neither covers both, so it tries one, tries the other, and **verifies by
attempting a real replace** rather than trusting the call — a setup that
silently did nothing gives a test that passes and proves nothing. If neither
blocks anything it **skips with the reason said out loud**, per §4's SIGTERM
precedent.

**`chattr +i` yields EPERM on rename even as root** — the same errno Windows
raises, which is what makes the retry deterministically testable here rather
than only on the reporter's machine.

**The transient test is proved by TIMING, not by status.** The block is lifted
120ms after the request goes out, so a save that succeeded on its first attempt
would have answered before then; arriving afterwards is what says something was
actually retried.

**My first probe reported no bug, and the probe was wrong.** `chmod(dir, 0o500)`
is bypassed by root, so the push succeeded and the server survived — which
would have read as "the report does not reproduce". Replaced with a non-empty
directory in the target's place, which nothing bypasses.

### Checked against the broken state, and the split is the useful part

| Mutation | Fails |
|---|---|
| drop the router patch | **4 of 5**, the first on `fetch failed` rather than a status — the reported symptom |
| drop the retry loop | **2 of 5**: *a transient block is waited out* (200 against 500) and *a failed save leaves no temp file behind*, since the cleanup lives on that branch |

Neither mutation fails the other's tests, which is what shows the two changes
cover different faults rather than one twice.

### Blast radius

`server.js` only — no client file, no served file, no route, no wire change.
`CACHE_VERSION` stays `crmbuilder-v52` and smoke stays **46 local / 51 live**;
running them is what proves that (§9).

**The router patch is shared surface in the strongest sense** — it wraps every
handler in the application, so it had a full run before it was trusted, per
§9's blast-radius rule. `app.use` is patched too, which means the JSON body
parsers, the rate limiter and the static middleware all pass through
`wrapAsync`; they are synchronous and arity 3, so they are returned unchanged,
and the full suite is what says so rather than the reasoning.

**`docs/API.md` gains a line and no route.** §46's trap exactly: the count is
still right and the file looks current, while a **status code** moved — a write
the server cannot make is now a 500 rather than a dropped connection, and that
is the difference between a client retrying and a client seeing the deployment
disappear.

Counts: Node **493 → 498**, Playwright **125**, smoke **46** locally.

---

### Then the same run found two more, and only one was a test problem

With the crash fixed, the reporter's next full run was **123 passed, 2 failed**
— the server survived, so these were always there and the crash was hiding
them. Neither is a Windows fault; both are things this container cannot see.

#### A save that said "saved" before anything left the device

*the reminder count is the number the due-date filter shows* failed with
`Expected "Asia/Calcutta", received "UTC"`. The zone name was a red herring
twice over — `resolveZone` accepts the legacy alias, and the picker offered
it (that assertion passed). The setting had simply not reached the server.

**Measured rather than reasoned**, with a probe that polled `/api/org/reminders`
after the save:

```
SYNCED +34ms   server=UTC     <- the only thing the test waits on
       +1379ms server=UTC
       +1808ms server=America/New_York
```

`saveSettings()` calls `persist()`, which only **schedules** a 1500ms debounced
push. The `.sync-status` chip therefore never left `synced`, so the wait was
satisfied by a state that predated the click, and every step after it was
racing the debounce.

**And the digest card is the product half.** §39 already made the *digest*
button `await Cloud.sync()` and re-render, with a comment saying the preview is
server-computed. The **workspace** button sets `SETTINGS.timezone` — which is
exactly what that card gates on and displays, in two places — and did neither.
So changing the zone left the card on the same screen saying *"Waiting until
09:00 in UTC"*: §33's adjacent-and-wrong number, in the place §39's own comment
was written to prevent it.

The save now pushes before it says "saved", mirroring its sibling. It re-renders
**only when the zone moved**: a full `renderSettings()` wipes the Telegram token
field (§38), the one thing on that screen an owner cannot recover, so it is not
spent on a save that cannot have made the card stale — the name and currency do
not reach the digest, whose message carries counts and never money (§39).

#### The assertion had been vacuous everywhere it had ever run

This is the finding worth keeping. `expect(reminders.zone).toBe(browserZone)`
aligns the two clocks by setting the workspace zone to the browser's own — and
**in a UTC container `browserZone` is `UTC`, which is also the server's default
for a workspace that never chose one.** So it passed whether or not the setting
had ever left the device.

Demonstrated rather than argued, in both directions:

| | Result |
|---|---|
| bug present, zone pinned to `America/New_York` | **fails**, `Expected "America/New_York", received "UTC"` — the reporter's failure, reproduced here |
| bug present, no zone pin (today's CI, this container) | **passes** |

CI has never once exercised it. The one machine with a real time zone is the
only thing that ever could, which is why a bug on the sync path surfaced as a
platform report. Now pinned, the same way §42 and §45 pin `Europe/London` and
for the same sentence: *the container and CI are UTC, so a date test that does
not name a zone passes on the bug.*

#### A toast asserted with `.last()`, on an ordering nothing controls

*work typed while a workspace is paused* failed with `.toast` `.last()` reading
`Added` for the full 20s. The read-only notice is said **exactly once** — §24
latches it, or the debounced push would fire it on every keystroke — and its
position relative to the two `Added` toasts is ordered by nothing at all. The
debounce is 1500ms against 1100ms of wait plus however long the second record's
UI steps take, so on a machine with less than ~400ms of slack the **first**
record's push lands *between* the two, `.last()` is `Added` for ever, and the
latch means it never comes again.

**Reproduced here by widening that wait to 1900ms**, which fails identically to
the report — so the slow machine is the cause and not the culprit.

A `hasText` locator does not fix it either: a toast fades and leaves the DOM, so
one that fired fifteen seconds ago is not there to find. The test records every
toast through a `MutationObserver` as they arrive and asserts the list contains
the reason — §54's answer to the same class of problem, where asserting on the
push bodies replaced a toast that was a paint race. The chip is asserted too, as
the durable half: a toast fades, `data-status="error"` stays.

#### Checked against the broken state

| Mutation | Fails |
|---|---|
| drop the `await Cloud.sync()` from the workspace save | *the workspace zone did not save* — the reported failure |
| that, **and** drop the zone pin | **nothing** — which is the vacuity, shown rather than claimed |
| widen the inter-record wait past the debounce | nothing now; failed identically to the report before |
| drop `readOnlyReason` from the toast | the recorded-toast assertion, by name |

**§27's walk needs nothing, and that is checked rather than skipped.** No
capability moved — the fix makes an existing one behave the way the documents
already describe it. `USER-GUIDE.md` and `manual.html` describe *Not before* as
"read in the workspace's time zone", which was true before and is true now;
`docs/API.md` sees no route and no wire shape move. Padding them to look
thorough is its own inaccuracy (§40, §41).

`js/app.js` is in `APP_SHELL`, so `CACHE_VERSION` → **`crmbuilder-v53`**. No new
served file and no route, so smoke stays **46 local / 51 live**. Full run,
because `sw.js` and `CACHE_VERSION` are shared surface (§9): Node **498**,
Playwright **125**, smoke **46** locally.

---

### And the green run said one more thing, in a number

The reporter's next run was clean — Node 498, Playwright 125/125 — and carried
`skipped 5` where §2 claimed one. Not noise: **four of the five are this
section's own tests.**

| Skips | Which |
|---|---|
| 1 | `signup.test.mjs`, `process.platform === 'win32'` — §4's SIGTERM note |
| 4 | `resilience.test.mjs` — nothing there could make a write fail |

So on **the one platform fault 2 was written for**, every test that exercises
the rename retry stepped aside. `chmod` on a directory does not stop a file
being created inside it on Windows, and `chattr` does not exist, so
`blockStoreWrites()` returned null and the suite reported four tidy skips. That
is §17's no-op-that-reports-success in a smaller costume — the skip is honest
about *itself* and says nothing about the retry, which shipped unverified where
it matters.

**A third mechanism, and it is inert exactly where the other two work.**
`fs.chmod(file, 0o444)` sets `FILE_ATTRIBUTE_READONLY`, and `MoveFileEx` with
`REPLACE_EXISTING` onto a read-only destination fails `ACCESS_DENIED`. On POSIX
it does nothing at all — measured, not assumed: rename keys on the
**directory's** permissions, not the destination file's, so a 0444 store is
still replaceable here. That asymmetry is the point.

**It cannot make anything worse, by construction.** Every mechanism is verified
by attempting a real replace before it is accepted, so on Linux this branch is
tried, found not to block, and skipped over — `chattr` still wins, and the file
runs 5/5 unchanged. On Windows it either blocks, and four skips become four
real assertions, or it does not, and they skip exactly as they do today.

**~~Unverified from here, and that is the honest state~~ (§8) — now confirmed,
and the confirmation is a number rather than a report.** The reporter's next
Windows run came back **`skipped 1`** where the previous one said **`skipped 5`**.
Four more tests ran, and there are exactly four conditional skips in
`resilience.test.mjs`: the read-only-attribute mechanism blocks on Windows, so
the rename retry is now exercised **on the platform fault 2 was written for**.

Left hedged rather than rewritten, because the hedge was correct when it was
written and the shape is §46's: this container is Linux, so the one thing that
could settle it was a run on the reporter's machine. What settled it was not a
test result anybody read as a result — it was **a skip count in the summary
line**, which nothing asserts on and which reads as noise. §33's lesson, from
the other side: two adjacent numbers that both look fine are worth diffing.

The skip message names all three mechanisms now rather than saying *"needs
chattr or a non-root user"*, which was wrong on the platform doing the skipping.

**§2's count is not pinned any more.** "One Node test skips itself" was true
when written and went stale the moment a second conditional skip existed — a
number in a second place (§29), in this file's own status section. It now says
that some skip and say why, and points here.

`after` clears the read-only attribute alongside the other two undos: a file
left read-only is one Windows refuses to delete, so the temp directory would
survive every run and accumulate.


---

## 56. The prebuilt modules were reachable once, on your first day

Reported as three questions, and the middle one was a product bug: *"I had
selected a few modules during initial setup, now in the dashboard I can create
new modules but I can't access the built in modules which I did not select. I
was looking for how to use the renewal tracker when I realized I can't access
that module."*

True, and worse than it sounds. **Every create affordance a person would reach
for opened a BLANK builder**:

| Entrance | Opened |
|---|---|
| sidebar `+` | `openBuilder(null)` |
| dashboard *Add module* tile | `openBuilder(null)` |
| onboarding *build your own* | `openBuilder(null)` |
| **Settings → App → "Add module from template"** | the picker — the only path |

So the eight templates existed, were fully working, and lived behind one button
filed in a card headed **App**, between *Install on this device* and *Replay
the tour* — a card about the device and the demo, not about the shape of the
workspace. Nothing anywhere else said they were still available. §49 shipped
Renewals and wrote it into eight documents; the person who wanted it could not
get to it.

**The picker is the front door now**, with **Empty module** as its first entry,
so the old behaviour is one click rather than gone. Onboarding's own custom
button stays direct — it is already on a screen full of templates.

**Templates already in the workspace are MARKED, not hidden or disabled.** A
second Contacts for a different purpose is a legitimate thing to want, and the
marker answers the other half of what was actually being asked: *which of these
did I take?* Matched on **name**, because that is what the reader is comparing
against their own sidebar — a template's key is never carried onto the module
it creates.

### The console guard caught what twelve assertions were not watching for

The blank entry carries `class="template-line"` like every other row, so
`$$('.template-line')` bound the template handler to it **as well as** mine.
Clicking it ran both: `TEMPLATES[Number(undefined)]` → `TEMPLATES[NaN]` →
`undefined.name`.

**Twelve E2E tests failed, every one of them on
`Console errors during test: TypeError: Cannot read properties of undefined`**
— not on an assertion, because no test was looking at that. §47 records
`expectedConsoleErrors` catching two unrelated live defects for exactly this
reason, and it has now done it a third time. The selector is
`.template-line[data-template]`.

### Blast radius, which is the part that needed the full run

`#add-module-btn` is clicked by **six** E2E tests, and rewiring it put a modal
in front of every one — §9's named pattern, and the reason a shared entry point
is not a small change. Each gained one `[data-blank]` click.

**A trap in making that edit, worth recording because it is silent.** The
clicks sit at two indent levels, so a two-pass string replace was used — and
the 4-space pattern is a **substring of the 6-space line**, so the second pass
matched inside what the first had already rewritten and double-inserted at one
site. `grep -c` said 7 where 6 sites exist, which is the only reason it was
seen. Anchor on the whole line, or do it in one pass.

Guarded by *"a prebuilt module skipped at onboarding can still be added
later"*, which onboards with **Contacts only** so Renewals is genuinely one the
user declined — that is what makes it the reported case rather than a tour of
the picker. Checked against the broken state per §9: restoring
`() => openBuilder(null)` on the sidebar `+` fails it, waiting for a
`.template-line` that never appears.

`toContainText`, not `toHaveText`, on the module heading: it carries the
module's icon, and the exact form fails on whitespace for a reason that has
nothing to do with the fix.

### The tour's step 2, and an assertion that read one frame

Reported in the same message: *"step 2 card covers its own highlight"*, one
failure in an otherwise clean 125.

**Not §35's bug and not §35's short-viewport case** — the E2E viewport is
1440×900, which is the viewport §35 measured 0-overlap-in-20 at. The mechanism
is a window §35's own fix leaves open:

- `pop.classList.remove('is-loading')` — the test's readiness gate — runs
  **before** `position()`;
- steps 2 and 3 force their own screen in a `before` hook whose re-render is
  not awaited (§4, §7), so the board can grow under a card correctly placed for
  the shorter one;
- §35's `ResizeObserver` repositions it, but a ResizeObserver callback is
  delivered on a **later frame**.

Between the board growing and the observer firing, `coversTarget` is true. The
test read the geometry **once**, so it could land inside that window — and a
slower machine widens it, which is why this surfaced there and never here.

**Polled now, because it is a steady-state claim and one read is not.** This
does not soften §35: that defect was a card placed over the ring and *left*
there, 20 runs out of 20, and a placement that never settles still fails.

**Proven, and the first mutation was the wrong one.** Removing
`watchGeometry()` — the obvious choice — **passed**, because on this machine
the re-render lands before `position()` and the observer is idle: the mutation
does not reproduce the reporter's condition here, so it proves nothing either
way. What proves it is forcing a persistent overlap (place the card on the
ring's top-left and return): the polled assertion fails by name, at step 4.
Recorded because the first mutation looked sufficient and was not — §50 hit the
same shape.

### The docs questions, answered by reading rather than recalling

All three features were already documented; only one thing was genuinely
missing.

| | `guide.html` | `USER-GUIDE.md` |
|---|---|---|
| Renewals | ✅ | § *Tracking things that expire* |
| Dormancy | ✅ (*"who nobody has contacted"*) | § *The other question: who nobody has contacted* |
| Chaser | ✅ | § *Chasing something that is overdue* |
| Chase log | ✅ | § 9 |
| **BYOK setup** | one line | **one paragraph, no steps** |

**My first grep said dormancy was missing from `guide.html` and it was not** —
the page says *"who nobody has contacted"* and I had searched for *dormant*.
Worth recording: a grep that comes back empty is evidence about the pattern
before it is evidence about the file (§46 records two of those coming back
empty for wording reasons).

**The BYOK gap was real.** The section covered the domain-verification
requirement, the provider being detected rather than picked, the roles and the
key never being read back — everything about *how it behaves* — and nothing
about how to get one. It now carries five numbered steps, with **verify your
sending domain first** called out as the step that takes real effort and the
single most common reason a first send fails (§53's 403 finding, in the place
an owner meets it), and *send one to yourself* as the last step.

**No provider button labels are quoted**, deliberately: this session cannot
reach either service (§8), so the steps describe what is needed rather than
naming UI that would be unverifiable here and stale in a year.

### Docs walked (§27)

A user can now do something new — reach a template they skipped — so the walk
was real rather than a checked omission.

| | Needed |
|---|---|
| `guide.html` | one clause: the prebuilt ones stay available |
| `USER-GUIDE.md`, `docs/manual.html` | the picker as the entrance, that the prebuilt ones are always available, and that a template module is an ordinary module afterwards — plus the BYOK steps |
| `README.md`, `product-tour.html`, `ONBOARDING.md`, `DEMO-SCRIPT.md`, `BETA.md` | **nothing** — they describe *which* modules exist and what they are for, which has not changed. Padding them to look thorough is its own inaccuracy (§40, §41) |
| `docs/API.md` | nothing — client-only, no route, no wire change |

`js/app.js` is in `APP_SHELL`, so `CACHE_VERSION` → **`crmbuilder-v54`**. No new
served file, so smoke stays **46 local / 51 live**. Full run, because a shared
entry point moved: Node **498**, Playwright **125 → 126**, smoke **46** locally.


---

## 57. The domain, and five items sized against the code rather than the name

Two documents and no code. `docs/ROADMAP.md` is new; `docs/LAUNCH-CHECKLIST.md`
gains the domain it was written without.

### `nimbleclerk.com`

The checklist (§48) opened *"Nothing here is decided. There is no domain chosen
and no price set."* Half of that is now false, so the banner says which half —
and says the thing that is easy to elide: **a chosen name is not a move.**
Everything in Part 1 is still outstanding, and §1.1's four silent failures
(stranded IndexedDB, installed PWAs serving the old origin, everybody signed
out, a cache on an origin you no longer serve) are exactly as true as they were
before anybody knew the name.

`<new-domain>` had a value, so the placeholders are written out — `LIVE_URL`,
the Google redirect URI, the smoke invocation, the verification greps.

**Two things the name itself decides**, added as §1.0 because both are annoying
to change afterwards:

- **Apex or `www`, and pick one.** Whichever is not canonical must 301. Two
  hosts answering the same app is **two origins**, and this codebase already
  knows exactly what that costs — IndexedDB, the service worker cache and the
  session cookie are all per-origin, so somebody who reaches `www` on Monday
  and the apex on Tuesday has two empty workspaces and no explanation.
  `server.js` sets no cookie `domain` (deliberately), so nothing in the code
  papers over it. Step 3 of the sequence now says to decide it before the
  announcement, because the announcement names one of them.
- **Google may want the DOMAIN verified**, not merely the consent-screen URLs
  updated. That is a Search Console step, it waits on somebody else, and it
  blocks nothing — so it is step **0** rather than buried in §1.3's table.
  §19's cost of an unpublished consent screen is every tester added by hand.

One stale number fixed while in there: the verification block said *expect 50
passed*, written when smoke was 45/50. It is **51** live now (§46's two-number
rule). A count in a second place, going stale, in the document that exists to
stop things being remembered late.

### `docs/ROADMAP.md`

Five items, named by the owner: security re-audit · dark mode · email and
social integrations · accessibility and screen-reader compatibility ·
multi-language localization including Arabic, Indian and Southeast Asian
languages.

**Sized against this repository, with every figure measured in the session that
wrote it.** The commands are in the document so they can be re-run; §29's rule
is that a number written in a second place goes stale, so the check is
reproducible rather than trusted.

**Two of the five are not what their names suggest, and planning either from
the name would have produced a wrong estimate:**

- **Dark mode is not greenfield.** The palette is already tokenised — 18
  properties on `:root`, **13 of them redefined** under
  `@media (prefers-color-scheme: dark)` — so the app has followed the OS for a
  long time. What is missing is a *choice*. The work is 12 hex literals that
  sit outside the token blocks, a synchronous read at boot (§3's paint-first
  invariant meeting §11's synchronous-scope rule), a second `theme-color`
  meta, and three values not two, because a light/dark toggle silently opts
  every existing user out of the behaviour they have today.
- **"Email integration" is not the email that shipped in §53.** Outbound
  exists twice over — the BYOK chaser and the webhook digest. What does not
  exist is **inbound**, and `lib/safe-fetch.js` guards *outbound* and does
  nothing whatever for a request arriving at us. An inbound mail webhook is
  §30 Phase 4 from scratch: its own body limit, its own bucket, and signature
  verification, because the sender carries no session.

**A live half-finished pattern found while measuring dark mode.** `legal.css`
already carries `:root:not([data-theme="light"])` inside its dark media query
and has **no `:root[data-theme="dark"]` block** — so the legal pages can be
forced light by an attribute nothing sets, and can never be forced dark on a
light OS. Half a toggle, shipped. It is the trap for whoever builds this: the
app and `/privacy` `/terms` `/guide` would then disagree, and those three share
one stylesheet (§47).

**Two assumptions corrected by measuring rather than reasoning**, which is why
the fact-check happened before the writing:

- **The guided tour is NOT RTL surface**, though it looks like it must be.
  `js/tour.js` computes placement from `getBoundingClientRect()` and writes
  `style.left` / `style.top` — physical viewport coordinates, which mean the
  same thing in both directions. Its `left`/`right` identifiers are placement
  *names*. Given §35's history, that is a relief and it is worth stating so
  nobody opens that file.
- **The app is already half-localized, in the direction nobody chose.** Every
  date and number goes through `toLocaleString(undefined, …)` — the *device's*
  locale — so an Arabic-locale phone renders Arabic-Indic digits and Arabic
  month names inside English chrome today. A UI-language picker would have to
  deliberately override that, not extend it.

And the RTL surface is small and measurable: **22 physical left/right
declarations and 8 `text-align`, in an 892-line stylesheet, with zero logical
properties in use.** That is a mechanical conversion with an end state a grep
can confirm — which is why the roadmap sequences RTL **first**, ahead of string
extraction: it is provable with one `dir="rtl"` and no translations at all.

**The hard part of localization is `TERMS_VERSION`.** §41 records it as one
fact in two places that must move together, compared with `!==` so any change
re-prompts everybody. A second language makes it one fact in **four**, and
raises a question with no cheap answer: if the Arabic terms are translated a
week after the English, what did an Arabic-speaking user agree to? The safe
answer — English is operative, translations are a convenience — is ordinary
practice and has to be *written on the page* rather than assumed.

**Accessibility is a measurement job before it is a building job.** 28 `aria-`
attributes are already in `js/app.js`, `#toast-root` carries
`aria-live="polite"`, and `lang="en"` is on all four root pages. Three leads
are offered **as leads, not findings**, because §36's whole lesson is that
driving the product is a different instrument from reading it: `aria-modal="true"`
is a promise the focus management does not keep (focus moves to the first
control, Escape closes, and there is **no Tab trap and no focus restore**); the
template cards wrap a visually hidden checkbox, which §4 already records as a
*test* trap and is the same shape as a keyboard question; and whether a kanban
card can be moved without a mouse is not answerable from the source, and is
what decides whether this item is small or large.

**The security re-audit is due, and the number says why.** §30 ran against ~~47~~
**42** routes — counted at the audit's own commit by §61, which is where this
figure was recalled rather than measured, so **thirteen** were unaudited and
not eight; there are **55** now, and three credential classes exist that did
not — a workspace webhook URL, a mail provider key, and
`REMINDER_HEALTHCHECK_URL`.
The roadmap is explicit about what a re-audit must **not** re-raise: §30's five
FALSE findings, which a reader working from a generic checklist would "fix"
and make the code worse. And about the one verdict that is already superseded —
row 12's *SSRF: FALSE, env-only*, which §38's runtime setter overtook.

### Why these are documents and not a plan in a chat

§48 is the precedent and its correction is the reusable part: a real finding
("no rule covers this") plus the wrong reflex ("put it on the nearest existing
list") produced a rule that would have decayed into furniture. The question to
ask is *when* a thing can hurt you, and put the check there. A roadmap's moment
is when somebody decides what to build, so it lives beside the checklist, is
routed from `docs/README.md`, is reachable from this file's topic index, and
404s in production by construction (§28) — which is what lets it say plainly
what is unfinished.

**Both files are `docs/`, not `docs/archive/`** — the maintained tier (§29). A
roadmap item that gets built moves out of it and becomes a numbered section
here, like everything else; a plan left in place to describe what happened is
the exact drift §29 exists to prevent.

### Blast radius

**None.** No code, no served file, no route, no wire change. `CACHE_VERSION`
stays `crmbuilder-v54` and smoke stays 46 local / 51 live — checked rather than
assumed, per §41's rule for a docs-only change.

`docs/API.md` needed nothing: no route moved and no response shape moved, which
is the check §46 and §54 both say to run rather than reading the route count.
§27's six user-facing documents needed nothing either, and that is a checked
omission rather than a skipped step — no capability changed, and padding them
to look thorough is its own inaccuracy (§40, §41).


---

## 58. The landing page, and three bugs that only measuring found

Asked for "a good looking landing page with splash". Two things were settled
before any markup, and the first changed what the work was.

### There was already a landing page, at a URL nobody would type

`docs/product-tour.html` is 512 lines with a hero, eleven tiles, an FAQ and a
closing call to action, and its own complete design system — Literata + IBM
Plex, the full token set, and **both** dark branches. It is a real marketing
page. It is filed under `docs/` and its path is frozen (§28, §29), so it reads
as documentation and arrives by link rather than by anybody landing on it.

So the gap was never "write a landing page". It was that **`/` is the app**: a
first-time visitor to the domain gets the CRM's onboarding screen rather than
anything explaining what they have opened.

That makes the new page's job narrow, and keeping it narrow is what stops it
becoming §27's fourth stale document: a splash, three beats, and **routing** —
guide, tour, manual. It restates none of them. If it ever starts explaining
features, it has become the tour and one of the two should go.

### `/welcome` today, `/` at the domain move — and the move is what makes it cheap

Making it `/` now means moving the app to `/app`: `start_url` and `scope` in the
manifest, `sw.js`'s precached shell, **104 `goto('/')` calls** in the E2E suite,
the smoke test — and every installed PWA launching into a page that is no longer
the app until somebody reinstalls it.

Every one of those costs is **already being paid** by the move to
nimbleclerk.com. §1.1 of the checklist: the origin changes, so installed apps
are stranded, the caches sit on an origin we no longer serve and everybody is
signed out regardless. Restructuring paths while that is already true is free;
doing it first pays it twice. `docs/LAUNCH-CHECKLIST.md` §1.0b carries the
five-step version, and the decision has to be made **before the announcement**,
because the announcement names the URL people will type.

### The CSS is inline, which is the departure from `guide.html`

`guide.html` shares `legal.css`. That is a 720px prose stylesheet — right for a
document, wrong for a full-bleed splash — so this page would have needed its
own, which means a second served file, a second entry in each of §3's four
places, and **a subresource of a standalone page**. That last one is not
hypothetical: §47 records `/legal.css` falling through `STANDALONE_PAGES` into
the runtime cache and shipping stale for an entire cache version, invisibly,
because a stale stylesheet still renders. One file has none of that, and
`docs/product-tour.html` is the precedent. `style-src` keeps `'unsafe-inline'`
(§30 Phase 4), so a `<style>` block is fine where a `<script>` block is refused.

**No external fonts, and no images.** §47 found the CSP refusing
`fonts.googleapis.com` on the doc pages; the only font this repository owns is
the self-hosted Inter. There is no image anywhere here except three PWA icons,
so the splash figure is **inline SVG** whose every fill is a token — it themes
with the page, costs no request, and cannot be the thing that renders late on
the connection it is trying to impress.

### `legal.css` has asked for Inter for its whole life and never loaded it

Found while deciding what font the new page should use. `legal.css` sets
`font: … 'Inter', system-ui, …` and **the only `@font-face` in the repository is
in `css/style.css`** — which the standalone pages deliberately do not load,
because rendering with no app CSS and no app JS is the entire point of them
(§19). So `/privacy`, `/terms` and `/guide` have been falling through to
system-ui since they shipped, while a served, self-hosted Inter sat unused.

§47 found the *other* half of this — the doc pages' blocked Google Fonts link —
and correctly leaned on the fallback stack. Nobody then asked whether the font
we already own was reaching the pages that name it. `@font-face` added to
`legal.css`; no `CACHE_VERSION` bump needed for it, because that file is in
`STANDALONE_ASSETS` and goes straight to the network (§47), checked rather than
assumed.

### Three bugs, none of which reading would have found

§9's *measure rather than assert* earning its keep three times in one file.

**Auto margins on a flex child beat `align-items: stretch`.** `.splash` is a
column flex container, so `.topbar` and `.splash-body` are flex items — and
`.wrap`'s `margin: 0 auto` makes them **shrink to fit** rather than fill. The
topbar measured **447px wide with 496px of margin each side** on a 1440px page:
the wordmark and the nav sitting together in the middle while
`justify-content: space-between` quietly did nothing.

The instructive half is `.splash-body`, which measured a correct 1080 — **by
coincidence**. Its content is wide enough to reach the `max-width`, so
shrink-to-fit lands on the same number. Trimming one sentence would have
collapsed it, months later, for no visible reason. `.splash > .wrap
{ width: 100% }` covers both.

**A `<span>` is inline, so the card link ran into the card's own text.**
`.card b` was `display: block` and the description `<span>` was not, so it and
the `.go` span were inline siblings: the tour card read *"…and where it fits.
Take the tour →"* on one line while the other two happened to wrap in a way
that hid it. **A bug whose visibility depends on the length of the copy beside
it** — found in the first screenshot, not in the markup.

**Contrast measured, not judged** — §47's rule, which caught a stated concern
that did not exist and a real one under the same heading. Here: `.note` at
**3.02:1** in light (under AA's 4.5 at 13.5px), and `.kicker` at **4.12:1**
against the 8% accent tint it sits on. The kicker moved to `--accent-deep`,
which is the higher-contrast direction in *both* themes — darker in light,
lighter in dark — so one token fixes both ends rather than needing a per-theme
override. Everything now measures 4.5+ in both schemes.

### A cascade accident that was right, and was made deliberate

`.limit` was written as `--ink-faint` and **never applied**: `.beat p` is
(0,1,1) and `.limit` is (0,1,0), so the earlier rule won and the limits
rendered at `--ink-soft`. §4's cascade trap for the **third time in this one
file** — and it was found by the contrast probe returning 7.69 where 3.02 was
expected, not by reading.

Kept rather than "fixed", because the accident is the better design and the
reason is the page's whole thesis: **the limit must not be fainter than the
claim.** Every beat states a capability and its limit in one breath (§47's rule
for `guide.html`); greying the honest half to 3:1 would undercut exactly what
the page is written to do. It is `.beat .limit` now, explicitly, with the
smaller size and the left rule doing the separating.

### Verification

The standalone-pages guard is a **loop**, so `/welcome` joins the array and
inherits both assertions — that the page renders itself with the worker
installed, and that it does not then become the cached shell. Checked against
the broken state per §9: removing `/welcome` from `STANDALONE_PAGES` fails it by
name. The smoke check is also a loop over pages, so **the smoke count does not
move** — 46 either way — and a mutation (asserting on text that is not on the
page) was run to prove it is really asserting rather than passing vacuously.
§46 records the same shape: a check that adds coverage without moving the
number reads as a mistake later unless it is written down.

Driven at 1440 / 900 / 390 / 320 in both colour schemes: no console errors, no
failed requests, no horizontal overflow at any width, actions above the fold
everywhere, and Inter actually loading. `100svh` rather than `100vh` on the
splash, with the `vh` line kept above it as the fallback — the large viewport
unit is measured with mobile browser chrome retracted, so a `100vh` hero puts
its own buttons under the fold on the one screen whose entire job is to be seen
without scrolling.

### Blast radius

`welcome.html` is a new served file, so §3's four places had to agree:
`PUBLIC_ROOT_FILES` in `server.js` (the extensionless alias is generated, so
`/welcome` comes free), `STANDALONE_PAGES` in `sw.js`, the smoke test, and
`CACHE_VERSION` → **`crmbuilder-v55`**. It is deliberately **not** in
`index.html` or `APP_SHELL` — it is not part of the app, the same call §47 made
for `js/manual-toc.js`.

**The bump is not hygiene.** Nothing precached changed, so strictly it is not
required — but a visitor whose worker predates this change is handled by the
*old* worker on their first navigation to `/welcome`, which answers with the app
shell and caches the welcome page over it. `activate` deleting every cache whose
key is not the current one is the only thing that repairs an installation
already in that state (§47), so the bump is what makes the recovery one reload
instead of never.

Counts: Node **498**, Playwright **126 → 127**, smoke **46** locally.

### Docs walked (§27)

| | Needed |
|---|---|
| `README.md` | the file map, a row in the documents table, and `legal.css`'s line, which said "the two pages above" while three pages load it |
| `docs/LAUNCH-CHECKLIST.md` | §1.0b (the `/` swap) and the `og:image` row — a root-relative one is what most scrapers resolve and some do not, so link previews are what silently look broken |
| `USER-GUIDE.md`, `manual.html`, `ONBOARDING.md`, `DEMO-SCRIPT.md`, `BETA.md` | **nothing** — no capability moved. A marketing page is not a feature, and padding them to look thorough is its own inaccuracy (§40, §41) |
| `guide.html`, `product-tour.html` | **nothing**, and this is a decision: the landing page links *out* to both, and a link back from a page somebody was sent directly is circular |
| `docs/API.md` | nothing — no route, no wire shape, and it does not list public pages |

### One thing deliberately not decided — ~~and still open~~ **DECIDED in §77**

**~~The product is still called CRM Builder.~~** The domain is
`nimbleclerk.com`, and a landing page is exactly where a brand name would live
— but renaming is a real decision that touches the manifest, `terms.html`,
`TERMS_VERSION` (§41), every document and the app itself. It is not something
to do silently while building a page. The wordmark sits in one place in
`welcome.html` and in the manifest; if the name changes, those are the two
starts.

> **It is **Nimble Clerk** as of 2026-10-17 — §77.** The paragraph above is
> left standing because its *list* was the useful part and it was incomplete
> in one way worth knowing: the wordmark is in **four** places in
> `welcome.html`, not one, and the two starts it names are two of eighty-four
> occurrences. What it got right is that this is a decision rather than a
> find-and-replace, and §77 records the three places where a replace would
> have broken something.


---

## 59. A review of the landing page: one right, one right about the wrong thing

Three points came back on `/welcome`. §21's treatment — checked against the
code rather than accepted — and the split is the useful part: **the two the
review got wrong, it got wrong in this file's own recurring shape.**

### A shadow that had been declared and silently discarded

*"Add a subtle drop shadow so the mockup pops against the light background."*
There already was one: `filter: drop-shadow(var(--shadow-lg))`.

**`drop-shadow()` takes no spread radius.** It accepts
`offset-x offset-y blur colour` and nothing else, and `--shadow-lg` in this
file was `0 24px 48px -16px …`. A fourth length makes the function invalid, an
invalid filter value drops the whole declaration, and
`getComputedStyle(el).filter` was **`none`** in both themes. Measured, not
inferred from the spec.

So the reviewer saw the symptom exactly and named the wrong cause — the same
shape §47 records, where a stated concern and its real mechanism were different
things. Nothing was missing; something was broken.

**The token is confined to this file, which is what made the fix safe.**
`css/style.css` has its own `--shadow-lg` **with** a spread, used as
`box-shadow` in six places where spread is perfectly legal. `welcome.html`'s
copy is consumed by the figure and by nothing else — checked before touching
it, so dropping the spread here cannot reach the app.

### The text contrast was fine. The card had no fill at all.

*"Ensure the secondary callout text meets WCAG AA, as light grey on off-white
can get washed out."* Measured: `.limit` is **7.69:1** light / **7.76** dark and
`.card span` **7.69 / 7.01**. The stated concern does not exist.

One line up, it does. In light, `--paper-raised` and `--paper` are **both
`#ffffff`** — so a card had a fill distinction from the page of **1.00:1** and
hung entirely off a `--rule` border at **1.24:1**. That is §47's callout
finding, the same hairline number, on a different component, and it is exactly
what washes out on a dim screen while the text stays perfectly legible.

**A token that was a no-op.** `--paper-raised` existed, was used by `.card`,
`.btn-ghost` and two SVG rects, and in the light theme meant nothing whatever.
Worth noting for §60: a light palette whose ground is pure white has no room
above it, so "raised" has to come from somewhere other than the fill.

**Fixed by giving the section a ground, not by darkening a token.** §47's
precedent is explicit that a token named for a surface should not be tuned for
one component. `.band` puts the *Where to go next* row on `--paper-sunk`, so
the white cards finally sit on something, `--rule-strong` replaces `--rule`,
and `--shadow-sm` supplies real elevation.

**And it does NOT reach WCAG's 3.0 for non-text — the plan said it would, and
that was wrong.** Measured after: the card is 1.06 against its band (was 1.00
against the page), the border 1.39 light / 1.72 dark (was 1.24). Reaching 3.0
needs an `--ink-faint` border, which computes to 3.02 and reads as a wireframe.
The honest description is that the card now signals elevation the way light UI
normally does — **lighter than its ground, with a shadow** — rather than that a
boundary line crossed a threshold. Said plainly rather than rounded up, because
§47's whole lesson here was about measuring instead of asserting.

### The beta box should not become a trust badge at the domain move

The third suggestion: swap the amber beta warning for a positive trust badge
when `nimbleclerk.com` goes live. **Declined, and recorded rather than
silently skipped.**

The domain move is not the end of the beta. `terms.html` still says free beta
and that data loss is possible, `TERMS_VERSION` governs it (§41), and §47's
rule for these pages exists precisely because *"a prospect read four confident
minutes and then discovered the framing on the legal page"*. Replacing the
warning while the terms still say beta re-creates that failure and lands on
`docs/LAUNCH-CHECKLIST.md` §2.1's list of claims that go false.

The idea is right about *where* it belongs: the trust badge is what should
replace the box **when the beta actually ends**, which is a terms change with
its own re-prompt. It is a row in the checklist now, next to the pricing
claims, rather than an action attached to the wrong trigger.

### The regression test passed on the bug, and the mutation is what said so

§9's rule, earned again. The first version compared `.card`'s computed
background against `.band`'s — and **passed against the broken state**: strip
the band's fill and it computes to `rgba(0, 0, 0, 0)`, which differs from the
card's white, so the assertion was satisfied by exactly the defect it was
written for. §34's shape, a test passing against its own broken fixture.

It resolves the **effective** ground now, walking ancestors for the first
non-transparent background — which is what the probe had been doing all along
and what the test should have copied. Both halves fail by name on their own
mutation: restoring the invalid spread fails on the filter, stripping the band
fails on the fill, and neither fails the other's.

The test runs in **light only** (`test.use({ colorScheme: 'light' })`), because
the second bug does not exist in dark — the tokens genuinely differ there — so
a theme-agnostic test would have been half vacuous.

### Blast radius

`welcome.html` and one E2E test. **No `CACHE_VERSION` bump**, checked rather
than assumed per §41: `welcome.html` is in `STANDALONE_PAGES` and absent from
`APP_SHELL`, so it goes straight to the network. No served file added, so smoke
stays **46 local / 51 live**.

`footer`'s own `border-top` was removed, because `.band` now supplies the rule
above it and two adjacent 1px borders read as a 2px one.


---

## 60. Dark mode had shipped for years; what was missing was a choice — and an untested path was under AA

Item 1 of [`docs/ROADMAP.md`](docs/ROADMAP.md), and the estimate held for the
reason it gave: the palette was already tokenised, so this was a *choice*
rather than a repaint. **18 properties on `:root`, 13 redefined under
`@media (prefers-color-scheme: dark)`** — the app has followed the OS since
long before anybody asked for dark mode.

What the roadmap did not predict is the thing that mattered most.

### White on the dark accent was 3.14:1, on the first button a new user presses

`.btn-primary` was `background: var(--accent); color: #fff`. In light the
accent is `#1570ef` and white clears AA at **4.57:1**. In dark the accent
becomes a *lighter* blue, `#4692f5`, and white on it measures **3.14:1** —
under AA's 4.5 for body text, on **Create my CRM**, live for every dark-OS
visitor since the dark palette shipped.

**`--on-accent` is ink FOR the accent, not the accent itself**, which is the
distinction that makes it a token rather than a per-site fix: `#ffffff` in
light, `#06101f` in dark, **6.07:1**. Three sites took a literal `#fff` over
`var(--accent)` — `.btn-primary`, `.avatar-fallback`, and the checked
template-card tick — and all three take the token now.

**`--danger`, `--ok` and `--warn` were never redefined in dark at all**, so the
saturated light values were being rendered on `#0c111d`. Raised to
**7.84 / 10.13 / 10.09**.

### Why it survived: nothing in the suite had ever driven `colorScheme`

133 Playwright tests and not one of them set it, so the OS-following half —
shipped, live, years old — had never once been executed by a test. That is the
whole answer to *"how was this missed"*, and the lesson is §36's arriving
somewhere new: **an untested code path does not have to be new to be wrong.**

`test.use({ colorScheme: 'light' | 'dark' })` now drives both, following the
`timezoneId` precedent (§42, §45) and for exactly the same sentence: the
container renders one way, so a test that does not name the environment passes
on the bug.

### The pattern is three branches, and each one is load-bearing

```css
:root { /* light */ }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }
:root[data-theme="dark"] { … }
```

The media query with the `:not()` guard follows the OS and is what everybody
has today. The explicit block is what lets a choice win in the **other**
direction — dark on a light OS. **Either block alone is a toggle that works one
way**, which is precisely what `legal.css` had shipped: §57 found it carrying
the guard and no `[data-theme="dark"]` sibling, so those pages could be forced
light by an attribute nothing set and could never be forced dark. Half a
toggle, live. Closed here.

**The two lists must move together, and the duplication is unavoidable.** CSS
has no mixin and a media query cannot be folded into a selector. The tempting
alternative — resolve `system` in JS and keep one attribute-keyed block — was
**rejected**: it makes the palette depend on a script, so the boot read failing
(it is in try/catch, §3) would render light on a dark OS, turning a currently
invisible failure into a visible one. It would also give the app and
`legal.css` two different mechanisms to keep in step, and **`legal.css` cannot
use JS at all** (§19).

### `js/boot-theme.js`, and why a file in `<head>`

The attribute has to be on `<html>` before the first paint or the page renders
light and flips. Two facts settled the shape, and both were read rather than
assumed:

- **`index.html`'s `<head>` contained no script at all.** Every app script is
  at the end of `<body>`, so `js/scope.js` — which already resolves
  synchronously at boot (§11) — runs far too late.
- **CSP is `script-src 'self'`**, so an inline block is refused, and §30
  rejected CSP hashes outright: *"a hash breaks silently on a whitespace
  change, and the symptom is icons quietly not appearing."*

So: a file, first in `<head>`. Exactly the `js/boot-icons.js` precedent (§30),
for exactly the same reason.

**The cold-start cost is real and the default is what absorbs it.** A
render-blocking script in `<head>` costs a round trip before any paint on a
first visit. But `system` is the default, and with **no attribute set the CSS
follows the OS exactly as it did before** — so a user on the default sees no
flash *even if the script never runs at all*. Only somebody who has explicitly
chosen against their OS can see one, once, on a cold load. That is what makes
the §3 invariant survivable here: the failure mode of this file is the old
behaviour, not a broken one.

**It owns `crmb:theme` and nothing else reads the string.** `crmb:tourSeen` is
the precedent — a device-level key owned by its module, not by `js/scope.js`.
`THEME` is a **bare global**, not `window.THEME`: a top-level `const` in a
classic script is lexical, which §39 records for `DB` and §41 for `Cloud`.

### Device-level, and that is not a style preference

`crmb:theme` sits beside `crmb:auth`, `crmb:user` and `crmb:tourSeen` (§11) and
is **not** a workspace setting. `settings` syncs **whole** to every role
including viewers and is owner-only to write (§14, §38), so a theme kept there
would push one person's preference onto their colleagues' devices and let only
an owner change it. Identical mechanism to §38's reason the webhook URL cannot
live in `settings`.

Three values — `light` · `dark` · **`system` (default)**. A two-state toggle
silently opts every existing user out of the behaviour they have today.

The control is in Settings' **App** card, beside *Install on this device* and
*Replay the tour* — the card that is already about this device rather than about
the workspace — and is available to **every role**, because it writes nothing
to the workspace. §36's reasoning for keeping Export open.

### The tests assert computed colour, never the attribute

An attribute no rule reads **is** the `legal.css` half-toggle bug, and an
attribute check passes on it. So every assertion reads
`getComputedStyle(...).backgroundColor`, walks system → light → dark → system
with a `reload()` after each, and is run at both OS settings.

**All six non-app pages are driven, in both directions, page by page** — the
whole of `sw.js`'s `STANDALONE_PAGES`. Not one representative: `/privacy`,
`/terms` and `/guide` share `legal.css`, but `/welcome`, `/docs/manual.html`
and `/docs/product-tour.html` each carry **their own** token blocks and their
own `<script>` tag, so each is a separate place the reader can be forgotten and
a single sample would prove nothing about the other five.

**My own probe hid a real gap, and the test is what found it.** The probe
forced `data-theme` with `setAttribute` — which proves the CSS responds and
nothing else. The E2E then failed on `/guide` because **that page loads no app
JS**, so nothing there read the stored choice. All six carry the reader in
`<head>` now, and they still render with JS off (§19) — they simply follow the
OS then, which is the old behaviour again.

Five mutations, each failing by name (§9):

| Mutation | Fails |
|---|---|
| drop the app's `[data-theme="dark"]` block | *every choice wins over the OS* — `choice "dark" on a light device rendered rgb(247, 248, 250)` |
| drop `legal.css`'s new block | *the standalone pages obey the same choice* |
| remove one page's `<script>` tag | the same test, **naming the page**: `/docs/product-tour.html with "dark" chosen on a light device rendered rgb(255, 255, 255)` |
| remove `boot-theme.js` from `<head>` | **both** device tests, on timeouts |
| put the literal `#fff` back on `.btn-primary` | *the primary button label fails AA on a dark device* |

### Three contrast failures left deliberately, and they are light-mode ones

Measured while checking the above, and **not fixed here**:

| Token | Light | Dark |
|---|---|---|
| `--text-faint` | **2.58** | **3.38** — fails in *both*, and the dark value is untouched by this work |
| `--ok` | **4.01** | 10.13 |
| `--warn` | **3.49** | 10.09 |

All three are used as text directly on `--surface` — checked, so these are
representative rather than measurement artifacts: `--text-faint` in ~17 places
(`.nav-empty`, `.stat-tile-sub`, `.recent-meta`, the field hints), and
`.check-yes` puts `--ok` straight on the surface.

**Not widened into this commit, for a reason rather than for scope.** Raising
`--text-faint` is a design decision about how quiet a hint may be, across the
whole app, and `--danger` passes at 4.83 — so this is three specific values and
not "the status palette is wrong". They are recorded in
[`docs/ROADMAP.md`](docs/ROADMAP.md) §2, where the axe-core pass will find them
anyway and where the decision belongs.

### `/js/boot-theme.js` is deliberately NOT in `STANDALONE_ASSETS`

It is a subresource of those six pages, so the §47 rule looks like it applies.
It does not, and the difference is the one §47 actually turned on: `legal.css`
and `js/manual-toc.js` are in **neither** `APP_SHELL` nor the precache, so the
cache-first branch kept them with **nothing able to evict them** — which is how
`legal.css` shipped stale for an entire cache version. `boot-theme.js` **is**
precached, so it lives in the `CACHE_VERSION`-keyed cache and a bump drops it
like every other app asset. Cache-first is correct for it. The reasoning is in
`sw.js` beside the list, because the next reader will see a standalone-page
subresource and reach for the list.

### Blast radius

`js/boot-theme.js` is a new served file, so §3's four places had to agree:
`index.html`, `sw.js` `APP_SHELL`, `tests/smoke.mjs` `ASSETS`, and
`CACHE_VERSION` → **`crmbuilder-v56`**. `ASSET_DIRS` already allow-lists `js/`,
so no server change — and **the smoke count moving 46 → 47 is what proves
that** (§9).

`index.html` also gains the second `<meta name="theme-color">` with
`media="(prefers-color-scheme: dark)"`, or the PWA title bar stays blue in a
dark app.

**Full run before it was trusted**, per §9: `CACHE_VERSION`, `sw.js` and a new
`<head>` script are all shared surface. Node **498**, Playwright **133**, smoke
**47** locally.

**A trap while editing `js/app.js`, and it is not a CSS one.** A backtick inside
an HTML comment inside a template literal closes the template string. `node
--check` reported *"Unexpected identifier"* on a line ~300 away from the edit,
which is a syntax check pointing at the wrong place — §31's *"a syntax check is
not a placement check"* in a new costume. The comment now says so in itself.

### Docs walked (§27)

A user can now do something new, so this was a real walk rather than a checked
omission.

| | Needed |
|---|---|
| `USER-GUIDE.md`, `docs/manual.html` | *Light, dark, or whatever your device does* — the three values, where the control is, that it is per-device and not shared with the team |
| `docs/BETA.md` tester note | one line: the choice exists and is per-device |
| `README.md` | `js/boot-theme.js` in the file map |
| `guide.html`, `docs/product-tour.html` | **nothing** — checked. Both already read correctly in dark because both already carried the tokens; a theme control is not a reason to buy a CRM, and padding them to look thorough is its own inaccuracy (§40, §41) |
| `docs/ONBOARDING.md`, `docs/DEMO-SCRIPT.md` | nothing — neither describes appearance |
| `privacy.html`, `terms.html` | nothing — a device-level key that never leaves the device is not a processing activity |
| `docs/API.md` | nothing — no route, no wire shape. §46's check run rather than the route count read |


---

## 61. The security re-audit: four latent guards, one live leak, and a threshold that was doing its job

§30's audit ran against **42** routes; there are **55**. This is the focused
re-audit [`docs/ROADMAP.md`](docs/ROADMAP.md) §3 asked for — not a five-phase
re-run, but the ground that did not exist then: two `lib/` modules, thirteen
routes, three credential classes, a client-supplied array that lands in
storage, and a patch that wraps every handler in the application.

Phases are numbered `R1`–`R5` to mirror §30's, so the two records read
together.

### What it must NOT re-raise, and this is the first thing to read

§30's **five FALSE findings** stand and are not revisited: no CORS middleware
(absence *is* the mitigation), `SESSION_SECRET` falling back to
`crypto.randomBytes(32)`, no reachable NoSQL injection, no mass assignment, no
exploitable prototype pollution. §30's own warning is that a reader working
from a generic checklist would "fix" those and make the code worse. Row 12's
SSRF verdict was already superseded by §38 and stays that way.

### The result in one table

| | Verdict |
|---|---|
| R1 · a caller header could override `Host` | **REAL**, not reachable — fixed |
| R1 · a caller header could set `Transfer-Encoding` | **REAL**, not reachable — fixed |
| R1 · a credentialled webhook URL wrote itself into the log | **REAL, LIVE** — fixed, four sites |
| R2 · the send route metered before it authorized | **REAL, LIVE** — fixed |
| R2 · coercion and body limits on 13 new routes | **CLEAN** — swept, six read no input at all |
| R3 · `unionChases` coercion, cap, `UNSAFE_KEYS` | **CLEAN** — one coverage gap closed |
| R4 · arity-4 error handlers still reached | **CLEAN** — driven, not read |
| R4 · a response sent, then a rejection | **CLEAN** — `headersSent` guards it |
| R4 · array-form middleware was not wrapped | **REAL**, not reachable — fixed |
| R5 · three moderate `qs` advisories | **REAL** — patched; the gate stays at `high` |

**Four of the six real findings were not reachable through any current caller**,
and that is the character of a *re*-audit rather than an audit: the live holes
were closed the first time, and what accumulates afterwards is safety that
holds by accident. §30's argument for the prototype-pollution guard is the
precedent and it applies four more times here — *safety that emerges from
properties nobody stated is safety a refactor removes without touching the
file.*

### R1 — the outbound surface, and the one that was live

**Measured, never read.** A capture server and a probe, because every one of
these is about what arrives on the wire rather than what the code appears to
construct.

**`Host` was overridable.** `sendGuarded(url, body, { headers: { Host:
'evil.example' } })` and the receiving server reported `req.headers.host` as
`evil.example`. `lib/safe-fetch.js`'s own opening comment promises the socket
"connects to the address we validated with SNI and **Host** still correct" —
false for any caller that supplied one. Pin a validated public address, then
ask that address for a different virtual host, and you have the SSRF variant
the DNS pin exists to close, reached from inside the module instead of through
DNS. **`Transfer-Encoding`** is the same class one step over: set beside a
`Content-Length` the request is ambiguously framed, and it reached the wire —
the receiving server answered 400 without invoking its handler.

`RESERVED_HEADERS` (`host`, `content-length`, `transfer-encoding`) is filtered
out of the caller's object, **case-insensitively**, before the spread.
`Content-Length` was already safe but **only by iteration order** — set after
the spread, so the later key won — which is exactly the guarantee a refactor
that moves one line reverses in silence. `Host` is *stripped* rather than
re-set from the URL: Node derives it from the URL it was handed, brackets and
all, so setting it ourselves would be a second place to get that wrong.

Not reachable today — `lib/mail-send.js` passes two fixed provider header
names — which is the reason to close it. The obvious next extension is headers
built from something a user chose.

**And a header value cannot carry CRLF**, which is the one thing §52 asserted
and nobody had checked. Confirmed both ways: the key regexes are anchored and
their character classes exclude CR and LF, so a smuggled header is
structurally impossible; and Node refuses one anyway with `Invalid character in
header content ["X-Key"]` — the header **name**, never the value. So
`scrub()`'s blind spot (§52: "the credential is now somewhere scrub cannot
see") is real and unreachable.

#### The live one: `err.message` carried the whole URL

Four places log `err.message` from a failed outbound `fetch`, and every one of
those URLs is a bearer credential — a Telegram webhook URL contains the bot
token (§18), and the reminder healthcheck URL lets anyone holding it fake a
success and silence the dead-man's switch (§39). Both sections state that
nothing may interpolate one into a log line, and §39's code said **why** it was
safe:

> Node's network errors carry hostnames, not paths, and the secret is in the
> path.

True of every fetch *failure*. False of the one case where **no request is ever
constructed**:

| Input | `err.message` |
|---|---|
| unresolvable host | `fetch failed` (cause: `getaddrinfo ENOTFOUND <host>`) |
| refused / bad port | `fetch failed` (cause: `bad port`) |
| `ftp://` | `fetch failed` (cause: `unknown scheme`) |
| **`https://user:pw@host/bot<token>/sendMessage`** | **`Request cannot be constructed from a URL that includes credentials: <the whole URL>`** |

`new URL()` parses that happily and it round-trips through `toString()`, so
nothing upstream refused it — and a self-hosted Healthchecks or webhook
receiver behind basic auth is exactly the deployment that carries one. A
misconfiguration therefore wrote **the password and the bot token together**
into the production log of a public repository's deployment.

Two defences, and they close different halves:

- **Refused up front** — `reminderCheckUrl` and `webhookRequest` both reject a
  URL carrying a username or password, naming the reason. §38's split: it is a
  property of the URL and not of the moment, and `fetch` would never have sent
  the credentials, so an operator would otherwise have a webhook that silently
  never authenticates.
- **`scrubOutbound`** removes every spelling of every outbound URL from any
  message that is logged — the raw environment value and whatever
  `webhookRequest` or `reminderCheckUrl` derived from it, which differ whenever
  a URL is written without a trailing slash, with a default port, or with a
  query string moved into the body (§18's Telegram reshaping). Plus §18's
  `/bot<token>/` pattern as a backstop for a URL nobody passed.

**One helper for all four sites, not a check at each.** Three of them were
already copies of one another, and §38 and §52 both record the shape where the
export half of a redaction was right while a different half was wrong.

**The scrub alone has no failing test, and that is stated rather than implied.**
With the refusal in place there is no reachable failure whose message carries
the URL — measured, per the table above. Same status as §52's `redactKey` and
§30's `UNSAFE_KEYS`: one reachable fix plus one class closed, and the second
half is what a future undici wording cannot quietly reopen.

**The stale comment is left quoted rather than deleted.** A comment that talked
itself into a guarantee is worth more as a warning than as a gap.

### R2 — the thirteen routes, and an ordering that was the reverse of its siblings

Counted rather than recalled, which is where §57's error came from:

```sh
git show f51656d:server.js | grep -cE "^app\.(get|post|put|patch|delete)\("   # 42
grep -cE "^app\.(get|post|put|patch|delete)\(" server.js                      # 55
```

**Coercion and limits: clean.** `String(...)` on every body value that reaches
a URL, a filter or storage — the hook URL, the mail key and from-address, the
Telegram token, all four `mail/send` fields — and **six of the thirteen read no
`req.body`, `req.query` or `req.params` at all**, so the only thing that varies
is the session. All thirteen sit under the global 64 KB body limit, with their
own field caps above it.

**The finding: `POST /api/org/mail/send` metered before it authorized.** It
read `requireAuth, rateLimit('mailsend', …)` and then tested the role in the
handler's first statement — so a signed-in viewer or contributor was refused
403 **after** taking a slot. `rateLimit` keys on `req.ip`, so on any shared
office connection that slot belonged to a colleague: **a refused caller could
exhaust a member's send budget for the minute.**

Both sibling routes already had it the right way round —
`/api/org/hook/test` and `/api/org/hook/telegram/chats` are `requireAuth,
requireSettingsOwner, rateLimit(…)` — and hook/test's own comment states the
relationship: *"the guard is the control; this bounds what a compromised owner
account can do with it."* **The inconsistency with its own siblings is what
makes this a finding rather than a preference.** Authenticate → authorize →
meter.

`canSendMail` is `requireSendMail` middleware now, which also removes the
oddity the plan flagged: it was the only guard on the list checked in-handler.
It was the *first statement* of both handlers, so nothing reached the work
before it — the defect was never that, it was what ran before *it*.

Guarded from both ends, because they fail differently: **an unauthorized caller
must never see 429**, because seeing one means the limiter ran first; and a
member must still be able to send after fifty-one refusals. The mutation fails
by name and **no other test notices**, which is why it survived. The suite
raises `RATE_MAIL_SEND_MAX` to 50 so the test can fill the bucket on purpose —
§38's precedent, and its rule that "the tests made the limit looser" should be
visible rather than inferred.

### R3 — `unionChases`, and the second client-chosen key

The coercion is right: `cleanChase` builds an **explicit literal** rather than
spreading the caller's object, `String(...)`s and length-caps every field,
requires a finite positive `at`, allow-lists `via` (falling to the weaker
`drafted`), and the union caps at 20 after sorting newest-first. §54's
`prior &&` bug — which skipped all of that on a record's first push — is fixed
and tested.

**The gap was coverage, not code.** An entry's `id` is the *second*
client-chosen key in `server.js` (the first is a field key, which `UNSAFE_KEYS`
guards), and it arrived after §30's prototype-pollution test was written, which
covers `data` and `fieldsAt` keys only. It is safe because `byId` is a **`Map`**,
whose keys are not prototype properties — safety by data-structure choice
rather than by a stated rule, which is precisely what `UNSAFE_KEYS`' own
comment argues against.

**Measured what the "obvious simplification" costs.** Swapping the `Map` for
`{}` loses **one of three entries**: `byId['__proto__'] = entry` creates no own
property, so an entry is **silently dropped from the log that exists to stop
two people chasing the same money** — a product bug, not only a pollution one.
The new test fails by name on that mutation and the field-key test does not,
which is what shows they cover different things.

### R4 — the router patch, driven rather than read

§55's patch wraps **every** handler in the application, including `app.use`,
and had never been reviewed. Four properties, all driven on a throwaway app:

| | |
|---|---|
| an async rejection reaches the arity-4 error handler | ✅ |
| a synchronous throw does too | ✅ |
| middleware ordering is unchanged | ✅ |
| a response already sent, **then** a rejection | ✅ — 200 delivered, handler runs, `res.headersSent` returns; no double-response crash |

**The finding: array-form arguments were not wrapped.**
`app.get('/x', [requireAuth, requireSettingsOwner, handler])` is an ordinary
Express idiom — it is what somebody reaches for the moment two routes share a
stack of guards, and **four routes here already share the same three**. Handed
an array, `wrapAsync` saw a non-function and returned it untouched, so nothing
inside was wrapped: a rejection in an array member produced an **unhandled
rejection and a request that hung until the client gave up**. That is §55's
crash, still open for one syntax.

`wrapArg` maps recursively. Not reachable today — there is no array-form
handler in the file, checked — so it has no failing test, like `scrubOutbound`.
It is here because **the whole point of patching the router rather than 48
handlers was that the next route somebody adds is covered without them knowing
this exists**, and an argument shape it silently skips defeats exactly that.

### R5 — three moderate advisories, and a threshold that was working

`npm audit --omit=dev` reported **3 moderate** in `qs` (via `express` and
`body-parser`) where §30 recorded zero: an array-limit bypass via bracket-key
comma parsing, and a DoS via attacker-controlled `isBuffer`. Both fixed in
`qs@6.16.0`.

**`npm audit fix` could not finish the job, and the reason is the interesting
half.** It moved `body-parser` to a fixed `qs` and left `express` on `6.15.3`,
because **express 4.22.2 — the last of the 4.x line — pins `qs@~6.15.1`**, a
range that forbids the fix. Express 5 pins a fixed one and is the real answer;
it is not a change to make inside a security patch, and §55 already declined it
for the same reason.

So an `overrides` entry, with the reasoning **in `package.json`** where the
next reader will be standing: `qs` parses `req.query` on every request here
(express 4 defaults the query parser to `extended`), so this is reachable on
every route rather than theoretical; `6.16.0` is a minor bump inside the same
major and the tilde is the maintainer's caution rather than a known
incompatibility. Remove the override when express moves. Full Node **and**
Playwright runs after it, because query parsing is every-route surface.

**The gate stays at `high`, and that is a decision written down rather than an
oversight.** These sat under it green *by design* — which is what a threshold
means. They were patched on their merits, not because a tick demanded it.
Lowering it to `moderate` was declined for §25's reason: a check that fires
when nothing much is wrong trains the reader to skip it, and a red tick on
every deploy over a transitive moderate is how a genuine high gets waved
through. The never-failing full report is what the moderates are for — and the
discipline that makes that work is **reading it**, which is why running the
audit by hand is part of a re-audit rather than left to CI.

### The three credential classes, walked

Four questions each: never logged, never exported un-redacted, never read back,
never in `platform`.

| | Logged | Exported | Read back | In `platform` |
|---|---|---|---|---|
| workspace webhook URL | ✅ fixed here | `{redacted:true}` → `{needsReentry:true}` (§38) | never — no read-back exists (§38) | no |
| mail provider key | `redactKey` (§52) + fixed here | redacted (§52) | `publicMail` returns it to nobody (§52) | no |
| `REMINDER_HEALTHCHECK_URL` | ✅ **fixed here — this was the live leak** | env-only, never stored | never returned | no |

Every one of the export and read-back halves was already right and tested. The
**log** half was wrong for all three, in one shared mechanism, which is the
§38/§52 shape a third time: one half of a redaction correct while another half
nobody had connected to it was not.

### Corrections this produces

- **§57's "§30 ran against 47 routes" → 42.** §29's own failure mode — a number
  written in a second place — in a section that states it. `docs/ROADMAP.md`
  §3 carried the same figure and now carries the command instead.
- **`lib/safe-fetch.js`'s "Host still correct"** was a promise the `headers`
  option broke. Fixed rather than reworded.
- **§39's reason for why the healthcheck URL could not be logged** was wrong,
  and is quoted in place with the counter-example.
- **§30's row 12** was already superseded by §38 and is unchanged.

### Blast radius

`server.js`, `lib/safe-fetch.js`, `package.json`, `package-lock.json`,
`.github/workflows/test.yml` and four test files. **No client file, no served
file, no route added, no wire shape moved** — so `CACHE_VERSION` stays
`crmbuilder-v56` and smoke stays **47 local / 52 live**, checked rather than
assumed (§41's rule for a change that touches no asset).

`wrapArg` and the `qs` bump are both whole-application surface, so this had
full runs rather than targeted ones (§9): Node **498 → 504**, Playwright
**133**, smoke **47** locally, `npm audit --omit=dev` **0 vulnerabilities**.

**`docs/API.md` needs one line and no route.** §46's trap again: the count is
still 55 and the file reads correctly, while a **status code moved** — a viewer
or contributor calling `POST /api/org/mail/send` now gets 403 before the
limiter rather than after it, so a client that was seeing 429 on a refused call
sees 403. §27's six user-facing documents need nothing, and that is checked
rather than skipped: no capability changed, and `DEPLOYMENT.md`'s environment
matrix gains the note that a webhook or healthcheck URL carrying credentials is
refused, because that is the one thing an operator could hit.


---

## 62. A critical advisory that does not apply here, and the domain move that would make it

Picked up while setting up for the domain move
([`docs/LAUNCH-CHECKLIST.md`](docs/LAUNCH-CHECKLIST.md) Part 1), a month after
§61 left `npm audit --omit=dev` at zero: **`proxy-addr` 2.0.7, critical — *IP
spoofing via IPv4-mapped IPv6 trust subnet*.**

The first read is alarming and would have been wrong. `proxy-addr` is what
turns `X-Forwarded-For` into `req.ip` under `trust proxy`, and **`req.ip` is the
rate limiter's bucket key** (§30 Phase 4, §61 R2) — so a spoofable one means
`/api/access-request`'s flood guard, the OAuth callback's bound and the mail-send
limit are all bypassable. That is the write-up I was about to produce.

**It is a FALSE finding for this configuration, and the source says so.** Read
out of the installed `express/lib/utils.js` rather than recalled:

```js
exports.compileTrust = function(val) {
  if (typeof val === 'function') return val;
  if (val === true)              return function(){ return true };
  if (typeof val === 'number')   return function(a, i){ return i < val };   // ← us
  if (typeof val === 'string')   val = val.split(',').map(…)
  return proxyaddr.compile(val || []);                                      // ← the bug
}
```

`server.js` sets `app.set('trust proxy', 1)` — a **hop count**, the only such
call in the file. So Express builds an index comparison, never parses an
address, and **`proxyaddr.compile()` is not on this path at all**. The advisory
is about that function's subnet handling. §30's category, and its standing
warning applies in the usual direction: a reader working from the advisory
rather than the source would report a bypassed rate limiter that was never
reachable.

### Patched anyway, and the reason is the move rather than the advisory

2.0.7 → 2.0.8, **lockfile only** — `package.json` needed nothing, because
express's range already allowed it. Three merits, and the third is the one that
matters:

- **The CI gate is at `high`**, so a critical fails the build (§61 R5). Leaving
  it means a red tick on every push and a reader re-deriving the analysis above.
- §61 R5's rule: patch on merits, not because a gate demanded it. One lockfile
  line against a critical in the `req.ip` path is not a trade worth thinking
  about.
- **It stops being false the moment anything goes in front of the deployment.**
  Putting Cloudflare or any CDN in front of `nimbleclerk.com` means `trust
  proxy` has to describe *more than one hop* — and a **subnet** is exactly what
  somebody reaches for there (`'trust proxy', '10.0.0.0/8'`, or Cloudflare's
  published ranges). That lands on `proxyaddr.compile()` and makes this live.
  So a configuration change nobody would connect to a dependency advisory is
  what arms it, during the one week somebody is changing the deployment's front
  end. §38's `::ffff:0:0/96` is the same bug class in this repository's own
  code, which is the other reason not to leave it.

**`npm audit fix --omit=dev` prunes devDependencies**, which is how
`@playwright/test` vanished mid-session and `npx playwright` started resolving
to the global install and failing on its own module paths. `npm install`
restores it. Worth recording because the symptom names Playwright internals and
says nothing about the flag that caused it.

Full run, because `req.ip` is on every request (§9): Node **504**, Playwright
**133**, smoke **47** locally, `npm audit --omit=dev` **0**.


---

## 63. The app moved to `/app`, and sign-in landed on a splash

The cutover commit of [`docs/LAUNCH-CHECKLIST.md`](docs/LAUNCH-CHECKLIST.md)
§1.0b, taken the day `nimbleclerk.com` went live. `/` serves `welcome.html`
(§58); the application is at `/app`.

**Done now because the deployment has no users**, which is stronger than
§1.0b's argument rather than a restatement of it. That section reasons that
the origin change pays §1.1's four costs anyway — stranded installed apps,
caches on an origin we no longer serve, everybody signed out — so restructuring
paths at the same moment is free. With nobody on the deployment those four
costs are **zero rather than already-paid**: there is no announcement to
coordinate with, and §1.6's ordering constraint between steps 5 and 6
evaporates.

### The one nobody planned for: every exit from OAuth went to `/`

`server.js` had six `res.redirect('/…')` in the Google callback — one success
and five `?auth_error=` branches. The success now dropped the user on the
**landing page**: cookie set, signed in, and a splash on screen saying nothing
had happened. The five errors went to a page that **loads no app JS**, so
`js/app.js`'s `auth_error` reader never ran and the explanation was never
shown.

Both are silent, which is this file's standing shape — and the second is the
worse half, because the error branches exist precisely to turn a refusal into
something a person can act on (§16, §20, §30).

**Not in §1.0b's file list, and not in any of the four documents that discuss
the swap.** The list was built from where `/` is *written* — the manifest, the
service worker, the tests. These are places `/` is *returned*, and nothing
greps for that.

**What caught it was an E2E journey that names nothing about redirects**:
*signing out hides the workspace, and signing back in restores it*. Its
artifact showed the anonymous state — "No modules yet", "Sign in to sync" —
after a sign-in that had succeeded on the server. §54 records that same test
failing intermittently, which is exactly the reading that would have dismissed
this; the artifact is what distinguished them, per §9's *read the trace first*.

**And the four assertions that should have caught it were already written.**
`tests/oauth.test.mjs` asserts the `Location` on all six branches — and they
passed, because the server still said `/` and the tests still expected `/`.
One of them even carried the right sentence: *"a good sign-in lands back on
the app"*. The comment was correct and the value underneath it had stopped
being the app. That is §46's trap in a new place: a line that still reads
correctly while what it describes has moved. Updating those four is the
regression guard, which is why none was added.

### Only `/app` may become the cached shell, and that is a path gate not a list

`sw.js`'s navigation branch answers from the cached shell and writes back what
it fetched. §47 closed the poisoning by checking the **content type** —
"`response.ok` alone is not *this is the app*". **That check cannot help
here**, because `welcome.html` is `text/html` exactly like the application. So
after the swap, any stray navigation would have been served the app shell and
then written over it with the splash.

```js
if (url.pathname !== '/app') return;
```

A path gate rather than a seventh entry in `STANDALONE_PAGES`. §47's own lesson
is that a list only ever covers the paths somebody thought of — which is how
`/docs/manual.html` survived twenty-one cache versions and `/healthz`
thirty-three. The lists stay, for subresources and non-navigation requests; the
gate is what closes the class.

**The server was changed to match, which is the half that makes the gate
true.** `app.get('*')` used to answer the shell for any path naming no file —
a leftover from before hash routing, since no client route has ever needed a
server path. It answers `welcome.html` now, so a mistyped URL says what the
site is **and** there is exactly one URL in the deployment that returns the
app. Two tests pin it from both ends: *`/` is the landing page, not the app*
and *an unknown path serves the landing page, never the shell*.

### The invite forward, and what it is tested on

`${APP_URL}/?invite=…` was the link shape for the app's whole life, and
`welcome.html` loads no app JS — so `captureInvite()` never runs on it, the
code is not stored, not stripped, and the colleague gets a landing page and no
team. Nothing errors. §1.0b had this, and it was live: an invite minted twenty
minutes before this commit carried the root form.

Two halves. Links are **minted** at `/app` now (`APP_BASE`, one constant beside
`APP_URL`, so the four sites that build one cannot drift), and **`/` forwards**
`?invite=` and `?beta=` with a 302 that preserves the value — so every link
already sent keeps working. A redirect in `server.js` rather than script in the
page, because giving `welcome.html` JS would undo the reason it is a standalone
page (§58).

**Asserted on what is STORED, not on the redirect**, per §54: a 302 is the
mechanism, and a build where the forward fires and the capture does not would
pass a redirect assertion. The E2E reads `crmb:pendingInvite` out of
localStorage and requires the address bar to be clean afterwards. Checked
against the broken state — remove the forward and it fails on the URL, with
`http://…/?invite=legacy-root-invite` in the diff; the smoke check fails
`HTTP 200, expected 302`, which is the silent version named.

### Traps

- **`/app/` would 404 the entire application.** `index.html` references every
  asset **relatively** — `js/app.js`, `css/style.css`, `manifest.webmanifest` —
  which resolve against `/` only while the path carries no trailing slash. At
  `/app/` they all become `/app/…`. `app.get('/app/*')` 301s to `/app`, and
  `register('sw.js')` was made **absolute** so the one subresource that fails
  *silently* cannot depend on that redirect having happened.
- **An exact-string pass over the tests missed one navigation**, and it was the
  §3 invariant test: `goto('/', { waitUntil: 'commit' })` does not match
  `goto('/')`. 110 navigations were rewritten and the 111th failed the full
  run — correctly, on a landing page where it wanted the app. Match on the
  prefix, or grep for what is left afterwards; `grep -c "goto('/')"` returning
  0 proved nothing about the form with arguments.
- **The `new URL(url).pathname + search` journeys needed no edit at all** and
  are the better test for it: twelve E2E team journeys take the invite URL
  **from the server**, so they exercise whatever shape it now mints rather than
  a copy of it.
- **`manifest.webmanifest`'s `start_url` and `scope` were `"./"`**, which §1.2
  correctly recorded as needing nothing for a *domain* change. They are `/app`
  now, which is a different change to the same file — relative was right for
  the host and wrong for the path.

### Blast radius

`js/app.js`, `sw.js` and `manifest.webmanifest` are all in `APP_SHELL`, so
`CACHE_VERSION` → **`crmbuilder-v57`**. No new served file, and the smoke count
moves **47 → 49** because two checks replaced one: the catch-all assertion
inverted, and the invite forward and the landing-page identity are new.

**Full run, and it was not optional** — the swap touches the router, the
service worker, the manifest and 111 test navigations, which is §9's
blast-radius rule several times over. Node **504 → 506**, Playwright
**133 → 134**, smoke **49** locally.

**The live figure is 54 and is predicted, not observed.** This session can
reach neither host (§8), so CI's run against `nimbleclerk.com` is what will
print it — §46's rule that the two numbers are different and both real.

### Docs walked (§27)

| | Needed |
|---|---|
| `guide.html`, `docs/product-tour.html` | the links whose **text promises the app** — *open the app*, *Open CRM Builder*, *Open the demo* — now point at `/app` |
| `privacy.html`, `terms.html`, `guide.html` | *"← CRM Builder"* and *"Back to CRM Builder"* stay on `/`, deliberately: a reader sent a legal URL wants the front door, and it carries two routes onward. A link whose text names the product is not a link that promises the app |
| `welcome.html` | its own call to action, and `og:url` / `og:image` made **absolute** — §1.2's deferred item, whose stated condition was the host being settled. It is now the one file outside the documents naming `nimbleclerk.com` |
| `CLAUDE.md`, `DEPLOYMENT.md`, `docs/BETA.md` | the live URL, the smoke example, and `BACKUP_URL` — which §17 records as failing *silently* when stale |
| `.github/workflows/test.yml` | the `LIVE_URL` fallback, ×2 |
| `README.md`, `USER-GUIDE.md`, `manual.html`, `ONBOARDING.md`, `DEMO-SCRIPT.md`, `BETA.md`'s tester note | **nothing** — checked. None of them names a URL for the app; they say "open the app" and describe what is in it. Padding them to look thorough is its own inaccuracy (§40, §41) |
| `docs/API.md` | **a line, and no route.** §46's trap again: the count is unchanged and the file reads correctly, while `/` moved from the shell to the landing page, `/app` appeared, and six `Location` headers out of the OAuth callback changed value |

### The live smoke then failed on its own override, two faults deep

The cutover's CI run came back `51 passed · 0 warnings · 3 failed` — the three
checks this commit *added*:

```
✗ `/` is the landing page, not the app — / served the app shell
✗ an unknown path serves the landing page, never the shell — served the shell
✗ an invite link on `/` still reaches the app — HTTP 200, expected 302
```

Nothing was wrong with the cutover. **The smoke was auditing the old host**,
which is §46's exact failure arrived at from a new direction — and the job log
proves both faults in its own first six lines.

**Fault 1: a `LIVE_URL` repository variable outlives the fallback it was meant
to override.** The commit moved the committed default to `nimbleclerk.com`, and
the step reads `inputs.live_url || vars.LIVE_URL || '…'` — so a repo variable
still set to `https://crmbuilder-v1.onrender.com/` wins, silently, for ever.
Changing a default in the repository cannot dislodge a variable set in the
settings UI, which is §40's rule in its original words: *a mechanism that hangs
off a URL configured somewhere else has a failure mode no test in this
repository can see.*

**Fault 2 is the one worth keeping: that variable has a TRAILING SLASH, and it
turned the §46 wait loop into a no-op.**

```
BASE_URL: https://crmbuilder-v1.onrender.com/     <- from the log's env block
…
The deployment does not report a commit — smoke testing it as-is.
…
· deployed build  68ab0c49854c                    <- read by the smoke, four lines later
```

`"$BASE_URL/healthz"` becomes `…onrender.com//healthz`. **Measured against the
real server rather than reasoned about**, which is what makes it certain:
`curl` does not collapse a double slash in a path (that needs `--path-as-is` to
*prevent*, and only for `/./` and `/../`), Express does not match `//healthz`
against `/healthz`, and the catch-all answers **200 with 32 KB of HTML**. So
`curl -sf` succeeded, `JSON.parse` threw, the `catch {}` swallowed it, and the
loop concluded the deployment *does not report a commit* → `state=unknown` →
smoke the wrong build.

**The two readings of that line are opposite and it could not tell them
apart.** §46 chose to omit `commit` rather than send a placeholder precisely so
that *behind* and *does not say* stayed distinguishable — and a malformed URL
manufactures the second one. The empty `catch {}` is where the information
died.

`tests/smoke.mjs` normalises its own base, which is why **its** `/healthz` read
worked and printed the live commit four lines after the wait had given up on
it. Two consumers of one variable, one of them tolerant, and the tolerant one
is the one whose output you read.

### What changed, and the first draft inverted the feature

Trailing slashes are stripped, and the parse answers **three** things instead of
two: the commit, `""` for valid JSON carrying no `commit`, and a `!notjson`
sentinel for a body that is not JSON at all. The sentinel skips loudly and
names `LIVE_URL`, because a push run that cannot establish which build is live
must not audit it.

**My first draft raised the sentinel on an empty body, which breaks the wait
entirely.** `curl -sf` drops any non-2xx, so a deployment mid-restart answers
with *nothing* — the ordinary case the loop exists to sit through. Parsing `""`
throws, so the sentinel would have fired on the **first poll of every push**,
abandoning the wait and reverting §46 to the behaviour it was written to
replace. Found by reading the edit back, before running it. **No body is not a
malformed body**, and the parse is now inside `if [ -n "$body" ]`.

**Abandoned on the first non-JSON answer rather than retried**, deliberately:
Render serves 502/503 while restarting, which `curl -sf` already drops, so a
200 carrying HTML is a configuration fault and waiting cannot fix one.

### Verified by extracting the loop from the YAML, per §46's own standard

*"A copy that drifts from the workflow proves nothing about the workflow"* — so
the step's `run:` block is pulled out of `.github/workflows/test.yml` by its
indentation and driven as a script, against **the real `server.js`** with
`APP_COMMIT` set, on a port outside every test block.

| `BASE_URL` | Want | Outcome |
|---|---|---|
| `http://…:8250/` | the live commit | `current` — **the failing run, now correct** |
| `http://…:8250` | the live commit | `current` |
| `http://…:8250///` | the live commit | `current` |
| `http://…:8250` | an unrelated commit | `stale`, "still running … after 25s" |
| `http://…:8250/nope` (so `/healthz` is HTML) | — | `stale`, warning names `LIVE_URL` |
| a port with nothing listening | — | waits, then `stale`, "did not answer" |

The last two are the pair that must not be collapsed, and the last one is what
the first draft broke.

**And the pre-fix loop was extracted the same way and driven against the same
server**, which is what makes this a §9 check rather than a plausible story:

| Pre-fix loop | Result |
|---|---|
| trailing slash | `The deployment does not report a commit — smoke testing it as-is.` → `state=unknown` — **the log's line, verbatim** |
| no trailing slash | `state=current` |

So the trailing slash is the whole cause, and nothing else about the loop was
wrong.

**Trap while doing it:** `git stash push -q .github/workflows/test.yml` to
extract the old loop, in an `&&` chain that then failed on an unexported
variable — so the pop never ran and the fixed file was sitting in a stash. §28
records the same shape with `pkill` killing the shell that mentioned
`server.js`. A stash in a compound command needs its pop checked, not assumed.

**The fix is in the repository; the variable is not.** Deleting the `LIVE_URL`
repository variable is what makes the committed `https://nimbleclerk.com`
fallback take effect, and it is step 7 of
[`docs/LAUNCH-CHECKLIST.md`](docs/LAUNCH-CHECKLIST.md) §1.6. The normalisation
is what stops the *next* trailing slash being silent, wherever it is typed.

### And the second consumer of that variable had the one-slash version

`tests/smoke.mjs` did `.replace(/\/$/, '')` — **one** trailing slash. That is
what made it tolerant of the variable that defeated the wait loop, and it is
the same bug one character short: `https://host//` leaves a double slash on
every path.

Driven rather than reasoned about, with a double-slash base against the real
server: **47 passed, 2 failed.** Not a clean break — most checks pass, because
the catch-all answers 200 with the landing page and several assertions are
satisfied by that, while `storage backend` and the two `docs/` pages fail. So
the report reads *"Deployment is NOT healthy"* with two plausible-looking
failures, and the actual fault is in the URL. §36's shape again, in the one
tool whose job is to tell you whether the deployment is fine.

`/\/+$/` now, with the reason in the file. Checked both ways: multi-slash
passes 49/49 after the fix and fails before it.

**Two consumers of one variable, each tolerant to a different degree, is the
general trap.** The wait loop tolerated nothing and reported absence; the smoke
tolerated one slash and reported ill health. Neither reported a bad URL, which
is what it was.


---

## 64. Taking payment: the rail is decided by a regulation, not by a preference

Asked for a payment plan — chargeback protection, UK/EU customers, an Indian
seller, and a proposed **$29 per seat per month**. Research only; no code, and
nothing scheduled. The plan is [`docs/PAYMENTS.md`](docs/PAYMENTS.md) and this
section is the findings, because three of them change assumptions that were
already written down here.

### Stripe cannot be the collection rail, and that decides the architecture

**Stripe India holds a domestic payment-aggregator licence (January 2024) and
does NOT hold PA-CB authorisation.** RBI's *Regulation of Payment Aggregator –
Cross Border* circular (31 October 2023) brought cross-border collection under
direct authorisation and a domestic PA **may not handle inward foreign
remittance at all**. Razorpay, Cashfree and Xflow are among the ~19 authorised;
Stripe is not, which is also why Indian Stripe signups went invite-only.

So the choice is a PA-CB-E aggregator, or **not making a cross-border
collection in the first place** — which is what a merchant of record is. Under
an MoR we sell to one UK company and it pays us by bank transfer: one foreign
customer, one export invoice per payout, and the framework never engages.

**The VAT half is what makes it one-sided rather than merely easier**, and the
numbers are not the ones usually quoted: **there is no UK registration
threshold for a non-established business** (the £90,000 figure is for
UK-established ones; HMRC excludes NETPs explicitly), and the EU's €10,000
distance-selling threshold is likewise for EU-established sellers — a non-EU
seller registers for **non-Union OSS from the first euro**. Selling direct
means two foreign VAT registrations and quarterly filings before the first
£1,000 of revenue.

### "Chargeback protection" is two different things and only one is real

What an MoR genuinely buys is that **you hold no merchant account, so your MID
cannot be terminated and you cannot be MATCH-listed.** That is worth a lot
right now: **Visa VAMP's excessive threshold dropped from 2.2% to 1.5% on 1
April 2026** across US, Canada, EU and APAC, at **$8 per disputed item with no
warning tier**; Mastercard ECM triggers at 1.5% plus 100 chargebacks in a
month.

What it does **not** buy is the cash: reporting is consistent that Paddle
deducts the disputed amount **plus a ~£20 fee** from the seller's balance and
keeps the fee even when it wins. **That claim is unverified from a primary
source** — `paddle.com` is blocked by this session's egress proxy (§8) — and it
is flagged as such in the document rather than smoothed over, with the MSA
named as the thing to read. §21's treatment.

And **3DS shifts liability only for fraud-coded disputes.** The ones this
product will actually get — *not as described*, *subscription cancelled*, *I
don't recognise this charge* — are a product and billing-design problem.
`PAYMENTS.md` §3 ranks the five levers that are ours, and the first is annual
invoicing, because **a bank transfer has no chargeback mechanism at all**.

### Per-seat was rejected for a reason that is in this file already

The proposal was per-seat, and three facts argued against it:

- **`MARKETING.md` promises *"No per-seat pricing"* in bold** and opens by
  attacking other CRMs for being *"rented back to you at $25 per seat per
  month"*. §48 put the check for that at publish time in the checklist rather
  than on §27's walk list, and this is the first time that gate has been
  reached — it worked.
- **The architecture has no seat concept.** A workspace is org-owned and every
  member sees every module (§5, §14); there is no metering and §17 records that
  *"nothing is enforced"* deliberately. Per-seat means seat counting, an
  invite-blocked-at-limit screen that explains itself (§36), and a downgrade
  path. **Per-workspace needs one check at invite time.**
- At $29 it would have sat between Capsule's and Pipedrive's *mid* tiers while
  §2's *Not built yet* list is integrations, email sending, per-module
  permissions, undo, and a mobile app.

Decided: **per-workspace tiers, GBP primary.** The prices in `PAYMENTS.md` §5
are a starting point sized against a measured comparison table, explicitly not
a decision.

**`DEFAULT_SETTINGS.currency` is a different thing and must not be conflated.**
§42 recorded `'USD'` as wrong for this market and deliberately left it: that is
the *workspace's* display currency for its own records, and §23 is why changing
it is not free. What we bill in is unrelated.

### The engineering constraints exist before the code, which is the point

`PAYMENTS.md` §6, and they are all restatements of rules this file already
carries, which is why they were cheap to write and would have been expensive to
discover:

- **The API key is env-only.** §17's *NEVER PUT A CREDENTIAL IN `platform`* has
  teeth here. It is also **not** a `settings` field and **not** a meta-doc
  sibling — §38 and §52 both record why a credential cannot live where sync can
  reach it, and this one has no per-tenant variation at all, so it has no
  business being stored anywhere.
- **The inbound webhook is §30 Phase 4 from scratch.** `lib/safe-fetch.js`
  guards *outbound* and does nothing for a request arriving at us (§38, and §57
  makes the same point for inbound mail). Own body limit, own rate-limit
  bucket, **signature verification** — the sender carries no session — and
  §61 R2's ordering: authenticate, authorize, *then* meter.
- **Non-payment must never reach `deleteAccount()`** (§15, §24 stage B), and
  **export stays open on suspension** (§36). A customer who stops paying and
  cannot get their data out is both the worst version of this product and the
  fastest route to a dispute.
- **The MoR must be replaceable in a week.** The FTC fined Paddle **$5 million
  in June 2025** for facilitating deceptive tech-support schemes — inadequate
  KYC, and using Ethoca/Verifi to refund flagged transactions before they
  became reportable chargebacks, which *masked the real fraud rate*. That is
  not a reason to avoid them; it is the reason the integration must be thin.

### Why a document and not an answer in the conversation

§48's correction and §57's precedent: the question to ask is *when* a thing can
hurt you, and put the check there. A payment plan's moment is when somebody
decides to charge, so it sits beside the checklist, is routed from
`docs/README.md`, and **404s in production by construction** — measured, not
assumed: `/docs/PAYMENTS.md` answers 404 on a real server while
`/docs/manual.html` and `/docs/product-tour.html` still answer 200 (§28's
`PUBLIC_DOCS` is those two and nothing else). That is what lets it say plainly
what it does not know.

Its §8 is that list, and the last entry is §40's rule arriving at the largest
such mechanism this deployment could ever have: **a payment provider's
dashboard, webhook endpoint, dunning schedule and tax settings all live in
somebody else's account**, so whatever monitoring is built for it has to be
checked against the provider's own screens rather than against the code.

### Blast radius

**None.** No code, no served file, no route, no wire change — `CACHE_VERSION`
stays `crmbuilder-v57` and smoke stays 49 local / 54 live, checked rather than
assumed (§41's rule for a docs-only change). `docs/API.md` needed nothing: no
route and no response shape moved, which is the check §46 and §54 both say to
run instead of reading the route count. §27's user-facing documents needed
nothing — no capability changed, and the files whose text goes false
when we *do* charge are already enumerated in the checklist's §2.1 rather than
edited now.


---

## 65. Render deploys from a MIRROR, and nothing here said so

Asked a one-line question — *"where is the variable `LIVE_URL`, on Render or
GitHub?"* — and answering it properly turned up the deployment topology, which
this file had never recorded and which `docs/LAUNCH-CHECKLIST.md` §1.0b had
stated backwards in bold.

**Render builds from a mirror of this repository, not from this one.** The
commits are the same — it is a mirror, confirmed by the owner — so the SHAs
match and §46's commit gate is sound. What is *not* true is that a push here
deploys.

### The answer to the question, and the rule behind it

**`LIVE_URL` is a GitHub Actions repository variable, and it has to live on the
repo that RUNS the workflow** — `Mohamed-AH/crmbuilder`. `${{ vars.LIVE_URL }}`
is resolved at job time in the repository the workflow file is in. Render never
sees it; it configures nothing about the running app. Setting it on the
mirror does nothing for the audit unless the mirror carries its own copy of
`test.yml`, which is then a *second* audit with its own answer.

That is §40's rule with a second axis: the ping was on the wrong *URL*, and
this is the same class of failure on the wrong **repository**. A variable set
in a settings UI is invisible to every grep in here, and now there are two
settings UIs it could be invisible in.

### What the logs proved, each line measured rather than inferred

| | Evidence |
|---|---|
| the variable is still the old host | push run's env block: `BASE_URL: https://crmbuilder-v1.onrender.com/` — trailing slash intact, so step 7 was never done on *this* repo |
| a push here does **not** deploy | `2cf6277` pushed 12:48, `94424a4` 13:41; at 14:11 the deployment reported `9625987` |
| §46's gate works | 22 polls of `Live deployment is running 9625987c11f9, waiting for 94424a4758a7…`, then the named warning |
| the skip fired for real, green | the push run's *Smoke test the live deployment* step: **skipped**, job success |
| the live figure is 54 | the scheduled run: `54 passed · 0 warnings · 0 failed` |

**The skip is §46 working exactly as designed and it is still the thing to
watch.** Seven minutes of CI burned per push, the live smoke not run, and a
green tick. That is tolerable while the mirror lags by minutes and intolerable
if it lags by days, because the only signal is a warning on a passing job.

### Two corrections this produces

- **§1.0b's *"pushing it IS deploying it"* is struck through.** §46 inferred it
  from one observation — the live smoke watching production catch up to a
  pushed commit — and "the mirror had just been synced" explains that equally
  well. The weaker explanation was taken as established, which is this file's
  standing failure shape applied to its own reasoning rather than to code.
  **The ordering constraint survives and improves**: the mirror sync is a
  separate action, so the swap lands when the operator chooses rather than
  when CI finishes.
- **§46's backstop claim is narrowed.** *"The daily run cannot skip, so a
  deploy that never lands is red within 24 hours"* — it cannot skip, but it
  only **fails** when the undeployed commit moved a served asset. Both
  undeployed commits here were docs, the workflow and `tests/smoke.mjs`, so
  the scheduled run passed 54/54 over a two-commit-stale deployment. The
  `deployed build` line is what carries the truth, and §46 made it INFO
  deliberately — correct, and it means nobody is obliged to read it.

### What a mirror makes safe, and the one thing it does not

Safe: the SHAs are shared, so the gate's prefix comparison (§46) matches when
the mirror is current and reports *behind* when it is not. That is the right
answer in both states and needs no change.

**Not safe, and worth stating before it happens:** if the mirror is ever
rebuilt by squashing, rebasing or filtering, `github.sha` can never match what
`/healthz` reports and **every push run skips the live smoke, green, for
ever.** That is the silent-permanent-skip failure §46 wrote two separate guards
against — the omitted-vs-placeholder decision and the prefix comparison —
reached from a third direction neither anticipated. The fix, if it happens,
is to stop comparing git SHAs and compare a stamp both sides can produce:
`APP_COMMIT` set explicitly on Render to something CI also computes. Not built,
because a mirror with shared history does not need it.

### Blast radius

Documentation only. No code, no served file, no route, no wire change —
`CACHE_VERSION` stays `crmbuilder-v57` and smoke stays 49 local / 54 live,
checked rather than assumed (§41's rule for a docs-only change).

`DEPLOYMENT.md` gains the mirror in §3, because *"Push this repository to
GitHub"* followed by *"pick the repo"* describes a one-repo setup and that is
the step where somebody would otherwise wire Render to the wrong one.
§27's user-facing documents need nothing and `docs/API.md` needs nothing — no
capability and no contract moved.

### Still open, on the operator's side

1. **Delete `LIVE_URL`** on `Mohamed-AH/crmbuilder`
   (*Settings → Secrets and variables → Actions → Variables*). The committed
   fallback is already `https://nimbleclerk.com`, so deleting leaves one place
   naming the host rather than two.
2. **Sync the mirror** so the deployment catches up and push runs stop
   skipping. Nothing user-visible is missing in the meantime — the two
   undeployed commits touch no served file.

---

## 66. Calculated fields, and a picker that had to be rebuilt from the draft

Part 1 of [`docs/CALCULATIONS.md`](docs/CALCULATIONS.md), built after the
reporter fixed their columns per that document's §2. `js/calc.js` is the
arithmetic; the wiring is in `js/app.js`.

**Nine of the plan's decisions held unchanged.** What follows is what building
it added, and the three places the plan was wrong or silent.

### The plan said four callers. There are three, and one is `compareBy`.

Resolving a derived value means every reader has to compute rather than read
`record.data[key]`. The plan listed the table cell, the kanban card, the record
read view and the exporter.

- **The kanban card is not one.** It renders the record name and *one* currency
  field found by `fields.find(f => f.type === 'currency')` — not the column
  list — so a formula is simply never reached there. Nothing to wire, and a
  calculated total is therefore **not** available on a board card. Left alone
  deliberately: making it one is a decision about what a card shows, not a
  consequence of this.
- **`compareBy` is**, and the plan named it as a trap rather than a caller. It
  took `(field, dir)` and read `a.data[field.key]` directly, so it now takes
  the **module** too — the signature change is the visible cost of the
  never-store decision, exactly as predicted, just in a function the caller
  list omitted.

`cellHTML` / `cellValue` are the one pair every reader goes through, so a new
reader cannot forget the branch.

### The builder picker could not have worked as specified

The plan's UI is an operation dropdown plus a checklist of eligible fields.
Built literally, **it offers nothing on a new module**: a checkbox needs a
field *key* to carry, and `slug()` runs at **save** (`js/app.js`'s builder,
§4's rename rule). So an owner building three number columns and a total in one
sitting would get an empty picker and no explanation.

Two changes, and the second is the one worth remembering:

- **A draft row gets its key as soon as it has a label**, via an `input`
  listener. The save already prefers an existing `data-key` over a fresh slug,
  so this changes nothing about renaming — a relabelled field keeps its key,
  which is what saved fields have always done.
- **The picker is rebuilt from the DOM on every change**, not rendered once.
  Which means the ticks cannot live in the checkboxes, because a rebuild
  destroys them: they live in `data-inputs` on the container, and the save
  reads that. A checklist that forgets itself when you rename a column is the
  kind of thing that reads as a broken screen.

### The removal prompt was not needed, and the refusal is better

The plan said to follow `askAboutRemovedFields` (§22) and ask before writing
when a formula's input is being removed. **No prompt was built**, and the
reasoning is the one §22 itself turns on: that prompt exists because *data is
about to be destroyed*. Here nothing is destroyed on either branch — the
question is only which of two wrong screens you get. So the save is **refused**,
naming the formula and the column, with the builder still open and Cancel in
reach. One rule, no second modal, and neither silent answer (drop the input and
move every total; keep it and show a column of em dashes) is reachable.

**And the refusal named the wrong thing on its first run.** It looked the label
up in the *surviving* field set — and a field being removed is by definition
absent from it, so the toast said `down_time_l2_hours` rather than *Down time
L2 (hours)*. Correct refusal, naming something nobody can see. The label is
read from the module as it was. **Found by the E2E, not by reading**: the
status, the behaviour and the test's own intent were all right, and only the
assertion on the *wording* caught it — §53's finding, in a new place.

### The form readout had to recalculate, and that is not polish

The readout renders from the stored row. Without a live recalculation a Total
sits on the old figure while somebody edits the three columns it sums — a
number that is correct, adjacent to the inputs that contradict it, and reads as
broken. §33's adjacent-and-wrong figure, arriving in a form.

One delegated listener, and it reads the form through **`readFormData`** — a
function extracted from the submit handler for this, so the live figure and the
figure Save will store cannot disagree. Two readers of one form is the second
copy §29 is about, and the drift would have shown up as a total that was right
while you typed and wrong once you saved.

**The readout is found by `dataset`, never by building `#f-${key}`.** A key
normally comes from `slug()`, but a restored backup carries whatever the file
held (§3) — interpolating one into a selector is §30 Phase 3's finding wearing
a new hat.

### What makes "nothing is stored" structural rather than careful

The calculated input carries **no `name`**. The submit handler reads
`form.elements[f.key]` and returns early when there is no control, so a formula
contributes nothing to `data` **without a branch anybody could forget**. The
E2E asserts the stored shape directly — `keysHoldingTheResult` is 0 — and the
mutation that writes it back fails there rather than on anything visual.

`askAboutRemovedFields` needed no change for the same reason: it filters to
fields with `n > 0` stored values, and a formula has none, so removing one
raises no prompt. Checked rather than assumed.

### A consequence that is not fixed, and is pre-existing

**Converting a Number column to a Calculated one leaves its old values as
ghost data** — §22's shape, since a type change has never purged anything. They
are invisible (the cell now shows the computed figure) and no longer exported
under that key, but they are still in the stored document. Not fixed here
because it is a property of every type change rather than of this one, and
fixing it for one type would be the inconsistency.

### Traps

- **§27's invented-class trap, caught by grepping rather than by rendering.**
  `--surface-sunk` and `--radius-sm` are not tokens in this stylesheet; the
  only hits for either were my own two lines. `--surface-2` and `--radius` are
  the real ones. An invented token is not even an unstyled box — it is
  `background: ;`, which renders as transparent and looks deliberate.
- **`.bf-inputs` wraps and `.bf-options` does not**, and that difference is
  load-bearing: a module with six number columns needs two rows of checkboxes,
  and a non-wrapping flex row crushes each label to a few characters. §4's
  layout trap, which §50 hit in `.dsar-search`.
- **The `·2/3` suffix is shown only when a blank was skipped.** On every row it
  is noise that teaches the eye to skip the cell — §33's silent-below-10% rule
  — and the case it exists for is the one where a blank-as-zero bug and correct
  behaviour produce the *same figure*, so the suffix is the only thing that
  tells them apart. The E2E asserts both its presence and its absence.
- **A mixed set of inputs gives a plain number, not a currency**, because the
  sum of £5 and 3 is not £8. A count and a ratio never inherit a currency
  either.
- **`diff` and `ratio` need BOTH halves.** `a − blank` is not `a`, it is
  unknown; reading the blank as zero turns a missing figure into a confident
  one. Unit-tested in both directions, because the wrong answer is a plausible
  number rather than an error.

### Verification

Nine mutations, each failing the test that names it (§9) and **no other**:

| Mutation | Fails |
|---|---|
| blanks counted as zero | 7 unit tests, including *an average ignores blank values rather than dragging the result down* |
| drop the divide-by-zero refusal | *a zero divisor is an em dash, never Infinity* |
| compute over what is left when an input was removed | *an input whose field was removed refuses*, and its retyped sibling |
| let a formula reference a formula | *a formula may not reference another formula…* |
| store the result on the record | *…and stores nothing*, on `keysHoldingTheResult` |
| exporter reads `r.data[f.key]` | the same test, on the CSV body |
| drop the live recalculation | *…recalculates as you type*, with `2 ·1/3` where 7 was wanted |
| offer formulas as CSV import targets | *refuses the three things that would break it* |
| drop the broken-input refusal at save | the same test, on the toast |

Counts: Node **506 → 535**, Playwright **134 → 137**, smoke **49 → 50**
locally — and that last number moving is what proves `js/calc.js` is actually
served (§9). `CACHE_VERSION` → **`crmbuilder-v58`**, and §3's four places all
agree: `index.html`, `sw.js` `APP_SHELL`, `tests/smoke.mjs` `ASSETS`.

**One pre-existing failure on the full run**, and it is not from this work:
*signing out hides the workspace, and signing back in restores it*. Established
rather than assumed — **it fails identically with this change stashed**, and it
is **1 in 3 in isolation** (3 runs: pass, fail, pass). §54 recorded it as
"passing in isolation" at 8.1s; that is now disproven and the passing runs here
are 8.3s, so the figure was right and the conclusion drawn from it was not. A
direct probe of the same journey — onboard, sign in, sign out, navigate — paints
onboarding correctly every time, so the mechanism is a race rather than a broken
path. Not chased inside this commit (§30's rule about not muddling two things);
the artifact to start from is the page snapshot showing **Settings still
rendered after `goto('/app#/')`**, which is what §3's "a view that throws leaves
the previous screen up" looks like from outside.

### Docs walked (§27)

A user can do something new, so this was a real walk.

| | Needed |
|---|---|
| `README.md` | `js/calc.js` in the file map, the field-type list, and its own feature bullet |
| `guide.html` | a paragraph in the week-shaped section — a capability and its limit in one breath |
| `USER-GUIDE.md`, `docs/manual.html` | a row in the field-type table and a *Columns that work something out for you* section, with the text-versus-number fix as a Careful note |
| `docs/product-tour.html` | its own tile, and **"Eleven field types" → "Twelve"** — a count in a second place, caught by grepping for it rather than by remembering |
| `docs/ONBOARDING.md` | a week-1 step: watch for the spreadsheet beside the CRM, and check the column types *with* them rather than mentioning it |
| `docs/DEMO-SCRIPT.md` | thirty seconds inside *Build a module live*, because almost everybody in the room totals something by hand |
| `docs/BETA.md` tester note | what to try to break, plus the no-formula-box limit in the rough-edge list |
| `docs/API.md` | **nothing** — checked, not skipped. `operation` and `inputs` are ordinary `doc` contents the server never inspects, exactly like `options` on a dropdown. §54 earned a section because `doc.chases` is merged specially; this is not |
| `privacy.html`, `terms.html` | nothing — no new data, no new recipient |


---

## 67. A total under a column, and a test two unrelated mutations could fail

Part C of [`docs/CALCULATIONS.md`](docs/CALCULATIONS.md), and the third of its
three categories to be answered: §66 was arithmetic **across** one record's
fields, this is a total **down** a column of the rows on screen. A `<tfoot>`
under every `number`, `currency` and `formula` column, defaulting to **Sum**,
with the operation chosen per column from a menu in the cell.

Most of the spec held. What follows is what building it added, and the two
places the plan was wrong.

### Not the operation list minus two

The obvious implementation is `Calc.operations()` without `diff` and `ratio`,
and it is wrong twice over:

- **`count` means something else here.** For a formula it is *how many of the
  chosen fields have a value*; down a column it is *how many rows do*. Same
  word, different denominator, and the suffix below depends on which.
- **The coverage note cannot survive the move.** §66 shows `·2/3` whenever a
  blank was skipped, which is right for a formula because any of the five
  operations is one cell wide. Down a column only **average** can be moved by a
  blank — a blank contributes nothing to a sum and cannot shift a minimum or a
  maximum — so showing it on all four puts a suffix on every numeric column of
  every table with one gap in it. That is §33's silent-below-10% rule broken at
  scale, and the cell it teaches you to skip is the one the 50% case needs.

So `AGGREGATES` is its own list carrying a `coverage` flag, and it is
**declarative rather than a branch in the renderer**: the alternative was
`if (agg.key === 'avg')` in the cell builder, which is the same fact written
where nobody looking at the list would find it. A unit test asserts the flag is
true on exactly one of the six.

`reduceNumbers` is shared with §66's `value()`, because the two lists overlap on
four operations and the rule that overlaps is *a blank is absent, never zero* —
which is precisely the thing that would end up fixed in one copy and not the
other (§29). **Proven shared rather than asserted**: one edit to that function
fails three tests, two of them §66's and one §67's, so a second copy really
would have let the two features diverge on the one rule they both rest on.

### It totals what is on screen, and says so only when that differs

It reads whatever `visibleRecords()` handed the table, so the search box and the
due-date filter apply for free — that is the one line of the spec that bought
the most.

**The note is derived from the filter STATE, not from a second read of the
store**, and that was a deliberate narrowing. Naming the denominator —
*"4 of 12 rows"* — needs the unfiltered count, which means either changing
`visibleRecords`' return shape (five call sites; §66 already paid that bill for
`compareBy`) or stashing a figure on the view state that can go stale. And it
would put **two adjacent numbers in the footer to fix a problem about two
adjacent numbers**. *"Totals over 4 filtered rows, not every shift"* does the
whole job with one.

**Silent on an unfiltered table**, because the count badge in the page head
already says how many rows there are, and a line that is always present is
furniture. Same discipline as §66's suffix, one feature over.

**Its own spanning row, not the first cell.** On a phone the table stacks into
cards and every cell is prefixed by its column name from `data-label`, so a note
in the first cell reads *"SHIFT over 4 filtered rows"* — labelled as a value of
a column it has nothing to do with. A spanning row needs
`::before { display: none }`, because `attr(data-label)` on a **missing**
attribute is the empty string rather than nothing, so the pseudo-element still
reserves its 40% and indents the note.

### Why the choice is on the module and not on the device

§60 put the theme in `localStorage` and wrote down why a preference must never
go in `settings`. This goes the other way for the opposite reason: a total is
not a preference, it is **what a column means**. Two people reading the same
table and getting a sum and an average from it is worse than either, so it
lives on the field, syncs with the module, and is therefore **owner-only** —
exactly the rule `applyPush` already enforces on module writes (§14), which is
why a non-owner gets the figure with the operation named in plain text rather
than a dropdown whose effect would be reverted a second later (§36 rule 2).

No server change, no wire change: `aggregate` is ordinary `doc` content the
server never inspects, like `options` on a dropdown.

**A column nobody has touched carries no key at all**, so the overwhelming
majority of fields cost nothing — §26's rule for `fieldsAt`, asserted, because
"costs nothing" is the kind of claim that quietly stops holding.

### The plan's re-render instruction was over-specified

§9 of the spec says to run a full `renderModule` rather than
`renderModuleBodyOnly`, on the grounds that §37's count-badge reasoning would
apply if the footer ever moved into the page head. It has not, and more to the
point **an aggregate change moves no row**, so the badge cannot go stale — which
is the condition that rule attaches to. Body-only, and the handler re-resolves
the module by id afterwards because `loadModules()` replaces the array and the
captured object is stale from that line onward (§3's rule for `openRecord`).

### Traps

- **`count` must not inherit a currency.** A tally of two deals rendered
  `$2` — a plausible-looking wrong answer rather than an error, which is this
  file's standing failure shape. The same rule `Calc.resultType` applies to a
  formula's own count, in the one place a unit test cannot see it: the
  formatting. It needed a module with a currency column to be observable at
  all, so it has a test of its own on Deals.
- **"None" is a third silence.** A column switched off and a column that is on
  and empty both end at `null`; one em dash for both is the state that reads as
  breakage on a table that is fine. `summarise` returns `off` against `nodata`,
  and a non-owner's cell for an off column is **empty rather than "None —"** —
  a reading of a choice they cannot make.
- **A stored `aggregate` is coerced twice.** The change handler checks
  `sel.value` against the list before writing, and `columnAggregate` falls back
  to the default on read — because the value arrives in a restored backup and a
  hand-written push exactly like a record value does (§3), and a footer cell
  that silently vanished for one column would read as the feature being broken.
- **The field key goes through `find`, never into a selector or a template.**
  §30 Phase 3 found ids reaching HTML attributes, and this is a second
  client-chosen key on the same surface.
- **Measured, not judged** (§4's cascade trap, which has now cost time five
  times). Driven at 1440/900/390/320: no horizontal page overflow at any of
  them, empty footer cells correctly hidden once stacked, and the desktop
  `.records-table tfoot td` rule is **more specific than the media query's
  `.records-table td`**, so its padding and top border had to be undone inside
  the query or every stacked summary cell carried a rule across it.
- **Contrast measured rather than inherited.** The footer labels mirror the
  table header's style, and the header uses `--text-faint`, which §60 measured
  at **2.58:1** and left deliberately. Copying it would have put the word that
  makes the number mean anything under AA. `--text-soft`: **6.98:1** light,
  **6.45** dark, with the values at 16.11 and 14.02.

### The verification found a defect in its own test

Five mutations, each failing the test that names it:

| Mutation | Fails |
|---|---|
| the filtered note is dropped | *a column total covers the rows on screen, and says so when a filter narrows them* |
| only the search half of "is a filter narrowing this" | *a currency column totals as money…*, which is the only test with a date column |
| the choice is kept in view state instead of on the module | *the choice is a team setting on the module…* |
| the dropdown is rendered for everybody | *a view-only account reads the totals and cannot change what they mean* |
| the "nothing to total" guard is removed | *a module with nothing to total grows no summary row* |
| a tally is formatted as money | *a currency column totals as money, and counting its rows does not* |
| a blank row counted as zero | **five** of `tests/calc.test.mjs`'s summary tests |
| `coverage: true` on sum, or a `none` default, or a stored value trusted as sent | one `columnAggregate` test each |
| `off` collapsed into `nodata` | *"none" is off, and says so rather than reporting no data* |

**The due-filter branch was a shipped path no test had driven**, which the
plan's own mutation table named and my first pass missed: the downtime module
has no date column, so `st.due !== null` was unreachable from any of the four
journeys. The Deals test carries a dated deal now, which is also where the
money-versus-tally rule is observable — §60's finding, in a condition one
character wide.

**Two of those also failed a test their mutation cannot touch**, and that is
the finding. `expect(await totals(page)).toEqual(…)` does not auto-retry, so it
sampled the render *before* the change handler's
`DB.put` → `loadModules` → `renderModuleBodyOnly` landed — §4's async
re-render race, which the spec's own §9 predicted and I then walked into. A
test that fails for a reason unrelated to the mutation is not verification; it
is noise that would have been read as "this mutation breaks something else".
Converted to `await expect(locator).toHaveText([...])`, which retries, and the
baseline then ran 5/5 twice and each mutation failed only its own test.

**The viewer journey asserts the server, not the buttons.** An absent dropdown
tests the client's manners; the viewer who matters is the one who pushes the
module change through `Cloud.sync()` directly. That lands in the same
`applyPush` seam `canEditSchema` governs, and the assertion is that the owner's
value is still `undefined` on the server afterwards.

### Blast radius

`js/app.js`, `js/calc.js` and `css/style.css` are all in `APP_SHELL`, so
`CACHE_VERSION` → **`crmbuilder-v59`**. No new served file, so the smoke count
stays **50 local / 55 live** — and running it is what proves that (§9).

`buildDowntimeModule` was hoisted from inside §66's describe to file scope so
both features' journeys can use it: a function declared inside a describe
callback is scoped to it, which is the same reason `inviteLink` was hoisted.

Counts: Node **535 → 550** (550 pass, 0 fail), Playwright **137 → 142** (142
pass — the §66 intermittent did not fire, which is not the same as it being
fixed), smoke **50** locally, measured by running it rather than reasoned
about.

**A trap hit while measuring, now in §4**: `pkill -f "[s]erver\.js"` to stop
the smoke server also killed the `server.js` children eight test files spawn,
and the symptom was not an error — the suite **hung**, silently, waiting on
sockets that would never answer.

### Docs walked (§27)

A user can do something new, so this was a real walk.

| | Needed |
|---|---|
| `README.md` | its own feature bullet, and `js/calc.js`'s line, which described one of the two things it now does |
| `guide.html` | a paragraph in the week-shaped section, with the owner-only limit in the same breath as the capability |
| `USER-GUIDE.md`, `docs/manual.html` | a *Totals under a column* section in §4 beside the board's column totals — not in the field-types section, because this is not a field |
| `docs/product-tour.html` | a paragraph on the existing calculated-columns tile rather than a tile of its own: it is the same question asked the other way round, and a second tile would read as a second feature |
| `docs/ONBOARDING.md` | *point at the footer* appended to the existing totalling-by-hand step, because the type check has to come first either way |
| `docs/DEMO-SCRIPT.md` | the thirty seconds after the calculated column, where searching and watching the totals follow is the part that lands |
| `docs/BETA.md` tester note | what to try to break, including the colleague-with-no-menu case |
| `docs/API.md` | **nothing** — checked, not skipped. No route moved and no wire shape moved; `aggregate` is `doc` content the server never reads, exactly like `options`. §54 earned a section because `doc.chases` merges by union; this does not |
| `privacy.html`, `terms.html` | nothing — no new data, no new recipient |


---

## 68. Grouping by period, and a label assertion that only means something from New York

Part C+ of [`docs/CALCULATIONS.md`](docs/CALCULATIONS.md), and the last of its
three categories: §66 totals **across** a record's own fields, §67 **down** a
column of visible rows, this one down a column **per period**. Any module with
a date column gains a **Group by** control — Week or Month — and the rows
gather into periods, each carrying its own totals with the overall total still
underneath.

**It was cheap because §67 built the expensive half.** A group's summary row is
`summaryFigure` over that group's rows with the column's own aggregate, which
is what the spec meant by *"grouping plus the same footer rather than a
separate summary screen"*. The whole feature is bucketing plus two selects.

### The arithmetic has no clock in it, which retires §5's own warning

§5 flagged §44's `setMonth(m - n)` overflow — 31 August minus six months
landing on 2 March — and said week and month boundaries would need unit tests
across timezones because of it.

**The overflow cannot happen here**, and not because it was clamped. Every
function takes and returns a **day coordinate**, the UTC-midnight number
`parseDay` already produces, so `monthStartDay` *truncates to the 1st* and
`weekStartDay` subtracts whole days. Nothing steps a month at all. A
`monthsAgo`-shaped implementation would have needed the clamp; this shape
removes the question. Recorded because the honest finding is "the warning does
not apply", not "the trap was dodged".

**The timezone tests still earn their place, and the mutation proves it.**
Swapping `getUTCDay()`/`getUTCMonth()` for the local getters fails
`TZ=Pacific/Midway` and `TZ=America/New_York` and **passes all 71 in-process
tests**, because this container is UTC. So the child-process probe is the only
thing that can see it — §37's signature exactly, correct for whoever wrote it
in London and wrong for the Americas.

### Which day a week starts on, and why that is not a fourth control

Monday in most of the world, Sunday in the US, and the answer changes which
group a row lands in — so it is a real number, not a cosmetic choice.

`firstDayOfWeek()` reads it from **`Intl.Locale`'s own week info**, with ISO
8601's Monday as the fallback where the runtime does not carry it. Not a
locale → first-day table: that is the second source §29 is about, and §42
declined a locale → currency table for exactly this reason.

**And the label is what makes a derived answer honest.** The week heading names
the whole range — *"5 Oct – 11 Oct 2026"* — rather than a week number, so
somebody who expects Monday and sees a Sunday date knows immediately which
convention they got. Measured in two locales rather than reasoned about: the
same record renders `Oct 11 – Oct 17, 2026` under en-US and `12 Oct – 18 Oct
2026` under en-GB. That is §37's rule — *name the field you watched* — applied
to a convention instead of a field, and it is what buys the right to derive
rather than ask (§45's bar).

### View state, which is the opposite of §67's call and has to be

§67 put the aggregate **on the module**, synced and owner-only, because *a
total is what a column means* and two people reading a sum and an average off
one table is worse than either.

Grouping goes the other way, for the complementary reason: it is **what this
reader is looking at right now**, like the search box and the due filter either
side of it. So it lives in `viewState`, syncs nowhere, needs no owner gate, and
every role can do it. Those two decisions look inconsistent side by side and
are the same rule applied honestly to two different things — which is why both
are written down rather than one being inferred from the other.

The consequence is stated rather than discovered: **grouping resets on
reload**, and the user docs say so in the same breath as the capability.

### It arranges rows; it never selects them

That one sentence settles three design questions at once:

- **`renderModuleBodyOnly`, not `renderModule`** — the count badge in the page
  head cannot go stale, which is the condition §37's rule attaches to. §67
  reached the same answer from the same test.
- **`visibleRecords`' own sort stays the order WITHIN each group**, so a column
  sort still works while grouped rather than being overridden.
- **The footer stays the overall total.** Asserted, because a footer that
  silently became the last group's total is a plausible-looking wrong number —
  this file's standing failure shape.

**Newest period first, which departs from §5's mock.** Ascending buries the
current week under a year of history, and the app's own default row order is
already most-recently-edited first, so the mock would also have been
inconsistent with every other list here. The test asserts the *order*, not the
set, so the departure cannot be undone silently.

**Rows with that date empty get their own group, last, named after the
column.** Dropping them would make the group totals not add up to the footer;
folding them into a period would date a row nobody dated. §44's rule for rows
with no clock, and §34's kanban precedent for the "No ⟨field⟩" column.

### The field is named, and that is two separate rules meeting

§50 established that a report aged on a column the reader cannot see is
indistinguishable from a wrong one, and §49 established why `watchedDateField`
cannot be the answer: it returns **exactly one** date field per module, so a
module with two gets the same one handed to the filter, the digest and this.

So the field is **preselected** from `watchedDateField` and **named on screen**
— and it becomes a `<select>` only when there are two or more date columns to
choose between. With one, a dropdown holding a single option is a question with
one answer, which §45 calls noise. Both shapes name the field, which is the
property that matters.

### Traps

- **A day coordinate formatted with a local getter reads the day before.**
  `localDay()` round-trips through the ISO string exactly as `fmtDate` does,
  and it is the only place a coordinate is allowed to become a date again.
  §50's `fmtWhen` trap, in the one place a group says a date out loud.
- **The E2E pins `timezoneId: 'America/New_York'` and that pin is the test.**
  In a UTC container the mutation above is **invisible** — the label reads 5
  Oct either way — so an unpinned assertion would have been vacuous exactly as
  §55 records for the workspace zone. The locale pin is load-bearing for the
  same class of reason: without it the Monday/Sunday assertions pass or fail on
  the container's own locale.
- **`<td colspan>`, not `<th scope="rowgroup">`.** The semantics would be
  better and `.records-table th` carries sticky positioning, uppercase,
  letter-spacing and a faint colour that would all need undoing — seven
  declarations of override, which is §4's cascade trap volunteering. Table
  semantics belong in the roadmap's axe-core pass, measured rather than
  guessed.
- **§37's `.input { width: 100% }` trap, third feature running.** A bare
  `.group-select { width: auto }` loses and the select fills the row.
  `.group-bar .group-select`, and measured at 1440/900/390/320: 98px on the
  desktop, no horizontal page overflow at any width, and the bar 30px tall.
- **The group header's tint is 1.10:1 against the rows** — §59's finding, where
  a fill that low is invisible while the text on it stays perfectly legible. No
  border token reaches WCAG's 3.0 for non-text either (`--border-strong` is
  **1.47** on white), so it takes §59's own answer: a 3px `--accent` left edge,
  measuring **4.57** light and **5.70** dark. Left padding drops 16 → 13, and
  the group label was then measured to land at the same x as the row text.
- **The group summary's bottom rule went 2px → 1px** once the next group had an
  accent edge: two adjacent rules read as one thick one, which is why §59
  removed a border rather than adding one.
- **`.summary-value` now matches group rows AND the footer.** Scope every
  assertion — `tfoot .summary-value` against `.group-sum .summary-value` — or a
  footer test passes on a group's figure.
- **A group header must not open a record.** It carries no `data-record`, so
  the existing handler ignores it; `cursor` and `:hover` are reset so it does
  not *look* clickable either. Asserted, because the hover state is the half a
  reader notices.

### Verification

Eight app mutations and one arithmetic mutation, each failing the test that
names it:

| Mutation | Fails |
|---|---|
| groups ascending (the mock's order) | *weeks group newest first…* — **only that one**, which is what shows the order is asserted rather than the set |
| undated rows dropped rather than grouped | **both** grouping journeys |
| the label formatted with a local getter | **both** — and only because of the New York pin |
| group summaries dropped, footer only | **both** |
| the footer totals a group instead of everything | **both** |
| grouping written to the module | *grouping is this reader's view…*, which survives a reload |
| the field select shown with one date column | *months name the column they aged on…* |
| the bar rendered with no date column | *a module with nothing to group by has no grouping control* |
| local getters in `weekStartDay` / `monthStartDay` | two of the five timezone probes, and **none** of the 71 in-process tests |

Four of the eight fail **both** grouping journeys rather than one, because both
assert group structure and both labels — written down because I predicted one
apiece and the run said otherwise, which is §49's lesson about reasoning about
a mutation instead of running it.

**One test's expectation was written from intent rather than from the probe.**
The search assertion wanted two rows and got three: the undated record was
named *"Undated"*, which contains the letter the search was for. The probe had
already printed `3 filtered rows` and I read past it. Renamed, with the reason
in the fixture — a test whose fixture collides with its own query is not a
finding about the product.

### Blast radius

`js/app.js`, `js/date-rules.js` and `css/style.css` are all in `APP_SHELL`, so
`CACHE_VERSION` → **`crmbuilder-v60`**. No new served file, so the smoke count
stays **50 local / 55 live** — and running it is what proves that (§9).

**`server.js` requires `js/date-rules.js`** (§39), so all six additions have a
second consumer no browser test covers. They are pure, the server calls none of
them, and the shared-surface test covers the export list either way — including
its rule that **every key on `DateRules` must be callable**, which is why
`dayOrders()` is a function and these are too (§45).

Counts: Node **550 → 570** (570 pass, 0 fail), Playwright **142 → 146** (146
pass; §66's intermittent did not fire, which is still not the same as it being
fixed), smoke **50** locally — measured by running each of them, and the smoke
server stopped by recorded PID rather than `pkill`, per the trap §67 added
to §4.

### Docs walked (§27)

A user can do something new, so this was a real walk.

| | Needed |
|---|---|
| `README.md` | its own feature bullet, and `js/date-rules.js`'s line, which named two of the four things it now does |
| `guide.html` | a paragraph in the week-shaped section, with the resets-on-reload limit in the same breath as the capability |
| `USER-GUIDE.md`, `docs/manual.html` | a *Grouping by week or by month* section in §4 beside §67's totals, because it is the same table rather than a new screen |
| `docs/product-tour.html` | a paragraph on the existing calculated-columns tile — a third tile for the third face of one question would read as three features |
| `docs/ONBOARDING.md` | *ask what period they report on*, after the type check and the footer, because it is the step that replaces a weekly spreadsheet |
| `docs/DEMO-SCRIPT.md` | the thirty seconds after the footer, where the room recognises the Monday spreadsheet |
| `docs/BETA.md` tester note | what to try to break, including that the group totals must add up to the footer |
| `docs/API.md` | **nothing** — checked, not skipped. No route, no wire shape, and nothing is stored at all: grouping is view state, so there is not even a `doc` key for a caller to see |
| `privacy.html`, `terms.html` | nothing — no new data, no new recipient, and nothing leaves the device |


---

## 69. The inbound signature check, built before the route that needs it

The payment rail is **Dodo Payments**, signed up for as an **individual**
rather than a company, which is what makes it startable without a commercial
setup. This commit is the one piece of that integration that must not be
wrong: `lib/webhook-verify.js`, its signing fixture, and the tests. **No route
receives a webhook yet, and nothing takes money.**

That order is §52's, for its reasons: the mail work built the storage, the
redaction and the adapter before any send route, because the alternative is
writing the part that handles a credential under pressure with the feature
already half-built. Here it is one step stronger — an inbound webhook carries
**no session**. There is no cookie, no `req.user`, no `workspaceIdFor()`. The
signature *is* the authentication, so this function is the entire gate in front
of anything a payment event is allowed to change.

### `docs/PAYMENTS.md` rejected this vendor, and that table was wrong

Its §2 table — *"every source for them is their own marketing page… a vendor
with no independent operating history is the wrong trade"* — was written before
the account existed. (This section first cited it as §7, which was itself
wrong; the table was always in §2.) The decision went the other way, that is
the user's call and it is reaffirmed, but the document then contradicted the
account, which is exactly the drift §27 and §29 are about.

**Rewritten in §72**, around the rail actually chosen. What that rewrite
established, because it is the part worth carrying: the objection has **only
partly** moved — the engineering surface is read and verified, and the
*economics* are still unread, so none of the Paddle-specific halves (§3's
0.65%-by-value threshold, §5's net-rate table, §6's *"replaceable in a week"*
resting on the FTC action) transfer as facts. They are kept as a **prior for
what to ask the MSA**, which is a different and smaller claim.

### Neither of the provider's CLI tools can test verification

This is the finding that shaped the work, and it is in their own
documentation:

| | What it does | What it can produce |
|---|---|---|
| `dodo wh trigger <event> <url>` | sends a mock payload **with no `webhook-id`, no signature and no timestamp** — their docs tell you to parse it with `unsafeUnwrap` | a **false pass** |
| `dodo wh listen <url>` | forwards real headers, but *"the relay and the CLI parse the JSON body and serialize it again before forwarding. If the forwarded body differs byte for byte… signature verification fails even though the headers are intact"* | a **false failure** |

Of the two the false pass is the dangerous one: it is how a verification
function ends up looking right and verifying nothing. So the only things that
settle it are the dashboard's **Webhooks → Testing → Send example**, which they
state is *"signed the same way"* as a real event, against a deployment — and,
for CI, a local signer with no network in it.

### Three implementations agree, and the frozen one is not Node

`tests/sign-webhook.mjs` is the signer: one file, shared, the
`tests/fake-telegram.mjs` precedent, because a second copy of a provider's wire
format goes stale in the direction that matters (§29).

**It deliberately does not import `expectedSignature`.** If it did, a bug in
that function would be reproduced identically here and *every test would pass*
— the verifier and the fixture would agree, wrongly, and the suite would be
measuring agreement rather than correctness. §34's shape, a test passing
against its own broken fixture.

And the frozen vector in the test file was computed with **openssl**, not with
Node:

```sh
printf '%s' 'whk_frozen.1760000000.{"type":"payment.succeeded"}' \
  | openssl dgst -sha256 -hmac 'crmbuilder-test-webhook-signing-key' -binary | base64
# sPOQm3nfGeqW2rpojNYr8L/kFTM4xetKuoTenVFj/3A=
```

A value produced by Node would come from the same runtime as the code under
test. Three independent implementations — openssl, the helper, the fixture —
produce that string, which is the strongest evidence available from in here.

### Not their SDK, and the reason is a version floor

**The Dodo Node SDK requires Node 20 or later; `package.json` is
`engines: ">=18"`.** §38 records what that class of mismatch costs in this
repository: an `.mjs` under `lib/` ran locally on 22 and threw
`ERR_REQUIRE_ESM` on a deployment pinned to 18 — *at require time*, so the
whole server failed to boot rather than one feature failing. It would also be a
fifth production dependency against the four §30 calls an asset on a shared
free tier, to replace thirty lines. `jsonwebtoken` is already a dependency, so
HMAC verification is not new ground here.

### Decisions inside the helper, each with a mutation behind it

- **`Buffer.concat`, never `${id}.${ts}.${body}`.** Interpolating a Buffer
  calls `toString()`, which replaces any non-UTF-8 byte with U+FFFD — so the
  bytes signed differ from the bytes that arrived and a perfectly good request
  fails. **This is the provider's own relay bug reached from inside our code**,
  which is why it has a test with a lone `0x80` in the body and an assertion
  that the naive construction really does differ on that input.
- **Hash both sides before `timingSafeEqual`.** It throws on a length
  mismatch and the throw would leak the length — the trap `tokenMatches()`
  already carries for `BACKUP_TOKEN` (§17). The mutation showed the failure is
  worse than a wrong answer: an attacker sends `v1,x`, the function **throws**,
  and it throws in the one place that has no session to report to, which in an
  async handler was §55's entire finding.
- **`badsecret` is a different answer from `mismatch`**, because the action is
  different — fix the environment, versus refuse the request and perhaps look
  at who sent it. Collapsing them is how somebody hunts an attacker who does
  not exist. **The honest limit is stated in the file**: this catches a secret
  that cannot be base64 at all; one truncated mid-paste usually stays in
  charset, still decodes, and is indistinguishable from a wrong one.
- **A parsed body is REFUSED, never re-serialised.** `JSON.stringify` of a
  parsed payload preserves key order but not whitespace, so re-serialising
  makes verification pass or fail for a reason unconnected to the signature —
  worse than either outcome. `parsedbody` says what is actually wrong: the body
  parser is mounted in the wrong order.
- **The timestamp must be a run of digits.** `Number('')` is 0 and
  `parseInt('12abc')` is 12, either of which turns a junk header into a
  plausible epoch — §10's `Number(x) || now` trap, which once wiped a
  workspace's settings, in a new place.
- **The replay window is five minutes in BOTH directions**, and the detail
  carries the skew in seconds, because the likeliest cause of either sign is a
  drifting server clock rather than an attack.
- **The scheme must be exactly `v1`.** `startsWith('v1')` would accept a future
  `v1a` as though we understood it, which is the one way a version check is
  worse than none.
- **Nothing is short-circuited on match**, so the time taken does not depend on
  which of several signatures matched — a rotation legitimately carries two,
  since the old secret stays valid for 24 hours.
- **It never throws**, following `sendGuarded` and `telegramChats` (§38) and
  `resolveZone` (§39), and returns a `code` so the route can make §38's
  refuse/warn split.

### The empty-body finding, which the tests produced

A test expectation and the code disagreed, and **the code was wrong**: a
zero-length body fell through to `mismatch`. That is the real shape rather than
an edge case — `express.raw()` hands over an empty Buffer for a request with
`Content-Length: 0`, which is a health probe or a misconfigured endpoint
pointed at the path. Nothing empty could match a signature over a real payload,
so calling it a mismatch is not incorrect, it is **useless**: it sends whoever
reads the log after the secret. `nobody` now, for an empty Buffer, an empty
string and an absent body alike.

### Two leak tests, and they search the whole result

The secret must never reach a `detail`, a log line or a stored field (§61's
rule, §52's `redactKey`), and neither must the body — a webhook payload holds a
customer's name, email and billing address, so §18's rule about the feedback
notifier applies: the diagnostic must not become the disclosure.

Both assertions serialise the **entire** result and search it, rather than
checking named fields — §38's rule, because a field-by-field check only covers
the fields somebody thought of. The secret test looks for the prefixed form,
the bare base64 **and the decoded key**, which is the thing an attacker
actually wants.

### Verified

Ten mutations, each failing the test that names it, and eight of ten failing
**exactly one** test — which is what shows the tests cover different things
rather than one thing ten times.

| Mutation | Fails |
|---|---|
| body interpolated instead of `Buffer.concat` | *a body that is not valid UTF-8 is signed over its bytes* |
| `startsWith('v1')` instead of `=== 'v1'` | *a signature header with no v1 entry says so* |
| a parsed body re-serialised | *an already-parsed body is refused, never re-serialised* |
| no base64 check on the secret | *a secret that is not base64 is badsecret, distinct from mismatch* |
| `parseInt` instead of the digits pattern | *a timestamp that is not a run of digits is refused* |
| skew checked one way | *the replay window is five minutes, in both directions* |
| `timingSafeEqual` without hashing first | *a signature of the wrong length is refused, and does not throw* |
| the secret put into a detail | *no result carries the secret, in any form* |
| an empty body falling through | *an empty body is nobody, not a signature mismatch* |
| `lib` added to `ASSET_DIRS` | the three smoke assertions, with byte counts |

**One of those tests had to be written because of a mutation, not before it.**
Hashing-removed originally failed only the two leak tests — it throws, and the
leak tests happen to call the function with a short signature — so a mutation
was being caught by tests whose names describe something else entirely. §67's
lesson, and the fix is a test that names the trap.

**And the `ASSET_DIRS` check was nearly proved against the wrong binary.** The
first attempt reported `51 passed` while `lib/` was being served, because the
old server was still listening — see §4's new `$!` note. The real run fails
three assertions with byte counts, which is §28's own shape.

### Blast radius

`lib/webhook-verify.js` is new and is **not** under `js/` — server-side code,
and `tests/smoke.mjs` asserts it 404s, the allow-list check run backwards
beside its two neighbours. That is what moves smoke **50 → 51 local**
(56 live predicted, not observed — §8).

`tests/webhook-verify.test.mjs` is **pure**: no servers, no sockets, no
network. So it claims no port block from §9's table and cannot collide with
one.

**No `CACHE_VERSION` bump**, checked rather than assumed: nothing under `js/`,
`css/` or the app shell changed, so `crmbuilder-v60` stands. **No
`docs/API.md` change** — no route exists yet, so no wire contract moved, which
is the check §46 and §54 both say to run instead of reading the route count.
§27's user-facing documents need nothing: no capability moved, and padding them
to look thorough is its own inaccuracy (§40, §41).

Counts: Node **570 → 592**, Playwright **146** unchanged, smoke **51** locally.

### What is still not built

The webhook route itself, the checkout link, and where subscription state
lives. **§70 and §71 built all three; this list is what was pinned before
them, and two of its entries turned out to name variables nothing reads** —
corrected in place below rather than deleted, because what the prediction got
wrong is the useful part.

- **`https://test.dodopayments.com` / `https://live.dodopayments.com`** are
  separate hosts, and a key authenticates against one mode only. Products, API
  keys and webhook endpoints each belong to the mode they were made in. That is
  the `GOOGLE_TOKEN_URL` / `TELEGRAM_API_BASE` / `MAIL_API_BASE` test seam for
  free (§30, §38, §52) — ~~`DODO_API_BASE`, one variable, no flag of its own.~~
  **No such variable exists.** Nothing here calls their API, so there is no API
  host to point anywhere. The seam that was actually needed is
  `DODO_CHECKOUT_BASE` (§71), which points the *checkout link* at a stand-in so
  a test can assert the URL — the same shape, on the only outbound thing there
  turned out to be.
- ~~**Env-only, all three** (`DODO_API_KEY`, `DODO_WEBHOOK_SECRET`,
  `DODO_API_BASE`).~~ **There is ONE credential, and it is
  `DODO_WEBHOOK_SECRET`.** `DODO_API_KEY` is read by no line of `server.js` —
  a **static payment link** (§71) plus **signature verification** (§69) uses
  the provider's API not at all and holds no bearer token for it, so the two
  pieces that looked like they would need one each need none. Env-only, never
  `platform`, which is in every nightly artifact (§17); not `settings`, which
  syncs whole to viewers and would then be destroyed by the masking (§38); not
  a meta-doc sibling either, unlike the mail key — that varies per tenant and
  this does not. The rule stands for the day an API call is wanted; the
  correction is that **today's credential surface is one signing secret.**
  `DODO_PRODUCT_ID` is not a credential — it appears in a URL the customer
  visits.
- **The route needs a raw parser mounted BEFORE the global `express.json()`**.
  Their docs warn about it and §38 already records the mechanism here: `bigJson`
  wins on `/api/sync` only because of mount order, since body-parser sets
  `req._body` and later parsers bail. Then its own small body limit, its own
  rate bucket, and §61 R2's ordering — verify, then authorize, then meter.
- **Idempotency on `webhook-id`, recorded only after the handler succeeds**, or
  a failed attempt is skipped on retry. 8 retries — immediate, 5s, 5min, 30min,
  2h, 5h, 10h, 10h — 30-second timeout, and any non-2xx counts as a failure.
  Events may arrive out of order; the payload carries a `timestamp` to order by.
- **Deselecting every event subscribes you to all of them**, per their docs. A
  footgun worth knowing before the dashboard is configured.
- **Payment links carry `metadata_*` query parameters** —
  `https://checkout.dodopayments.com/buy/{product_id}?metadata_wsId=…&redirect_url=…`
  — which is how a payment ties back to a workspace with **no third-party
  JavaScript**, keeping `script-src 'self'` intact (§30 Phase 4). An overlay or
  inline checkout would mean opening that header up, so it is ruled out by a
  constraint rather than a preference.
- **Non-payment behaviour is already specified** and must not be improvised:
  §24 stage B's suspension — read-only sync, reversible, nothing deleted, never
  reaching `deleteAccount()` (§15, §5) — with export open to every role (§36).
- **A subscription product must be at least $1.00 USD**, which is a floor under
  the pricing decision.
- **Test mode sends REAL customer email** to the real address with a
  `[TEST MODE]` subject, capped at 100/week; off in Settings → Communication →
  Email. And **test subscriptions keep renewing**, delivering webhooks weeks
  after testing stops, so each one wants cancelling via
  `PATCH /subscriptions/{id}` with `status: cancelled`.

`privacy.html` gains Dodo as a recipient of personal data **when the first
payment actually runs**, not when the account is approved — §52 deferred the
mail paragraph on exactly that condition and §41 published the backup-encryption
sentence only once an encrypted artifact had been restored end to end. §40's
*"that is the complete list"* has already been false twice, both times caught by
looking at what the deployment does rather than at what the code could do.


---

## 70. The webhook route, and the clock that is the correctness mechanism

`POST /api/payments/dodo` receives a verified payment event and records the
workspace's subscription state. §69 built the gate; this is the thing behind
it. **Still nothing takes money** — there is no checkout link, no price and no
enforcement, and the deliberate reason for the last of those is below.

### Two routes, and the second is not decoration

`GET /api/org/billing` is owner-only and returns `{ enabled, billing }`.
`enabled` is the half that earns its place: without it, *a workspace nobody
has paid for* and *a deployment with no `DODO_WEBHOOK_SECRET`* are
byte-identical from this route — the exact pair of states §39 had to name
separately on the digest card, and §38's restore finding one more time. State
nobody can look at is state that breaks silently.

It has its own `requireBillingOwner` rather than reusing
`requireSettingsOwner`, for the **wording alone**: that one answers *"Only an
owner can change workspace notifications"*, which is the wrong rule named at
the wrong moment — §53's 403 finding in miniature. Generalising the three
near-identical guards would touch six routes for a message (§9), so a fourth
small one is the cheaper correct answer.

### Ordering is the correctness mechanism, not the `webhook-id`

The provider states plainly that its events **"are neither terminal nor
strictly ordered"** and that each payload carries the latest state at delivery
time. So a retried `subscription.active` can legitimately arrive *after*
`subscription.cancelled` — and without a clock comparison it would bring a
cancelled subscription back to life, handing somebody access they stopped
paying for. Silent, and visible only as a billing discrepancy weeks later.

So the event's own `timestamp` is compared against the stored one and anything
**strictly older** is discarded. That is the same last-write-wins rule, for
the same reason, that §10 already applies to record edits.

**It dedupes retries for free**, which is why there is no `webhook-id` store:
a redelivery carries the same timestamp and the same body, so re-applying it
is a write of identical data. That is only safe because the payload is a
**state snapshot rather than an increment** — the moment anything here counts
instead of sets, this needs the id.

**And `webhook-id` dedup alone would not have been sufficient anyway.** It
prevents double-processing and says nothing about order, which is the failure
that actually costs money. Worth stating, because their docs recommend the id
and a reader could conclude the clock is the optional half.

### Two clocks, not one, and the test is what pins it

`subscriptionAt` and `paymentAt` are separate. One shared clock would let a
`payment.failed` stamped a second later decide a subscription's staleness —
and worse, would make the two kinds of fact compete: a subscription event
arriving between two payments would be discarded as stale while being
genuinely newer than the subscription state it describes.

That is §26's field-level reasoning without §26's machinery, and it has its
own test precisely because the tidier single-clock version looks correct.

### The same-timestamp choice, and its cost

Their timestamps are second-precision, so two distinct events in one second
are possible. The comparison is **"apply unless strictly older"**, so the
second one is not silently dropped.

The cost, stated rather than discovered: a redelivery of the *first* arriving
after the *second* would regress. It is narrow (needs same-second distinct
events **and** a retry landing out of order), it self-corrects on the next
event, and closing it means the `webhook-id` store this section just declined.
Pinned by a test, because the opposite choice reads as the safer one.

### Processed BEFORE the 200, which departs from their own advice

Their docs say respond immediately and handle the event asynchronously. That
advice protects a 30-second delivery timeout from slow work. **The work here
is one small idempotent write** — milliseconds on Mongo, a whole-file rewrite
on the file store, both far inside the budget.

In exchange, a failed write becomes a **500**, which this provider retries on
its own schedule, so the event survives. Answer 200 first and a failed write
is lost in silence, and a lost event means a customer paid and nothing
recorded it.

**THE CONDITION, which is what makes this a decision rather than a
preference:** it holds only while the handler is one small write. The moment
it grows — provisioning, sending mail, calling anything outward — it has to
move behind the response, and then it needs a **durable queue** rather than a
floating promise, because an unawaited rejection in an async route was §55's
entire finding. §18's "respond immediately, notify after" is the opposite
case: that is an *outbound* notification where slowness would make reporting a
bug feel like a bug.

### Every verified answer is a 2xx, including the ones that do nothing

A non-2xx is a delivery **failure** to this provider: eight retries across
twenty-eight hours and then a red mark on the one dashboard screen that
reports real failures, which is §25's alert-fatigue lesson arriving in
somebody else's console. So an unsubscribed event type, an unparseable body, a
missing or unknown workspace and an unusable timestamp are all acknowledged
and logged.

It matters more than it looks, because **their docs state that deselecting
every event subscribes you to all of them** — an endpoint receiving the whole
catalogue is one misconfigured checkbox away.

The two that are *not* 2xx:

| | Why |
|---|---|
| **401** on a failed check | and the body says nothing about *which* check. The code and the detail go to the log; telling an unauthenticated prober "the timestamp is 400s from now" confirms the endpoint is real and the secret is set |
| **503** when unconfigured | **deliberately not** the 404 `/api/admin/export` uses for a missing token. That hides whether a deployment has backups (§17); this needs to be a *visible* failure in the sender's dashboard, which is the only signal an operator gets when they have registered a URL against a deployment with no secret. What it must never be is a 2xx |

### What the record holds, and the two opposite calls about it

`billing` is a **sibling of `settings`** on the meta doc — the same structural
rule as `hook` (§38) and `mail` (§52), for the same reason: `pullChanges`
sends `meta.settings` whole to every role including viewers, and
last-write-wins would then let a client's copy overwrite it. Driven through
the real sync path by a test, because that is the only way to see it.

**No customer identity, even though the payload carries it.** No email, no
name, no billing address. `workspaces[].meta` **is** the `data` collection
(§17), so everything on that document is in every nightly artifact,
downloadable by anyone with read access to the private repo. The provider is
the system of record for the customer; we need ids and statuses to decide what
a workspace may do, and nothing else.

**And it is NOT redacted on export, unlike the two credentials beside it.**
That is the opposite call and the pattern invites the wrong one: redacting it
would make a restore silently un-subscribe every paying customer — §38's
webhook finding with money attached, where the recovery looks clean and the
breakage surfaces weeks later as people losing access they paid for. **A
subscription state must survive a restore. A secret must not.** Said in
`redactMeta` itself, where somebody would otherwise add it by pattern.

**The field inventory is deliberately thin**, and the honest reason is §69's:
nothing here has seen a real delivery, so it stores only fields the provider's
own documentation names — `subscription_id`, `status`, `next_billing_date`,
`past_due_ends_at`, `payment_id`. Widening it is the first thing to do once a
real payload has been read, not before.

### The limiter sits in FRONT of the authentication here

Which looks like §61's R2 finding reversed, and is not. There, a limiter ran
ahead of an **authorization** check on an authenticated route, so a caller
about to be refused could spend a slot belonging to a colleague on the same
office IP. Here there is no authenticated caller to protect: the bucket is
keyed on `req.ip`, an attacker cannot send from the provider's delivery
addresses, and the only thing a flood exhausts is its own bucket. Putting the
bound first means an unsigned flood costs no HMAC work.

### Traps

- **A block comment cannot contain the wildcard content-type.** Its own
  slash-star closes the comment, and `node --check` then reports
  `Unexpected token '*'`. §60 records the same shape with a backtick inside an
  HTML comment inside a template literal — a syntax error pointing at the
  wrong thing.
- **`putData` merges TOP-LEVEL keys only**, so `{ billing }` replaces the
  whole object. Merging onto the prior value by hand is what stops a payment
  event blanking the subscription fields beside it, and it is exactly the
  mistake the two-clock split would otherwise hide.
- **`Date.parse` → `null`, never `Date.now()`.** §10's `Number(x) || now`
  trap, and here it is worse than a wrong number: an event stamped "now"
  always wins the staleness test, so one malformed timestamp could overwrite
  good state for ever.
- **`wsId` is the ownership key and `orgId` is a separate field that happens
  to equal it** (§5). The existence check says so rather than silently
  assuming, because it is one of the places that must change if they diverge —
  and it logs loudly rather than dropping quietly, since the symptom otherwise
  is every webhook being acknowledged and discarded.

### Verified: eleven mutations, and the one that passed was the finding

Ten failed the test that names them. The eleventh **passed**, and that was the
useful result:

| Mutation | Fails |
|---|---|
| the raw parser does not cover the route | **12 tests** — the mount-order check, and it is the happy-path test that carries it |
| no staleness check | *a cancellation sticks, and a retried older event cannot undo it* |
| strictly-newer only | *two events sharing a timestamp are applied in arrival order* |
| `billing` rebuilt without the prior object | *a payment event does not blank the subscription beside it* |
| one shared clock | *the two clocks are independent, not one shared clock* |
| the clock falls back to now | *an event with an unusable timestamp is dropped rather than stamped with now* |
| the refusal borrows the notifications wording | *a viewer cannot read the billing status* |
| 503 becomes a 200 | *an unconfigured deployment answers 503, never a 2xx* |
| `billing` written inside `settings` | **8 tests**, including the currency one |
| no workspace-existence check | *an event naming a workspace that does not exist…* |
| **`billing` redacted on export** | **nothing — see below** |

**`redactMeta` returns early when a workspace has no hook and no mail key**,
so the redaction branch was never entered and the export test could not have
detected a `billing` redaction. It was passing, and it was passing for the
wrong reason. The test now configures a mail key first — `PUT /api/org/mail`
makes no outbound call (§52), so this needs no capture server — and asserts
the **contrast**: `mail` must be `{ redacted: true }` and `billing` must not.
Found by the mutation, not by reading, which is the whole argument for §9's
rule.

**Two other things the tests produced rather than confirmed.** My
`subscriptionEvent()` helper spread `type` into `data` instead of onto the
envelope, so every event was delivered as `subscription.active` whatever the
test asked for — four failures all pointing at ordering code that was correct
the whole time. And an assertion I added about the status in the export test
was simply wrong about the sequence; it is gone rather than pinned, because
which event happened to land last is an artifact of the order of the tests
above (§33's rule about asserting what you mean).

### Blast radius

`server.js` only — no client file, no served file, so **no `CACHE_VERSION`
bump** (checked, not assumed) and smoke stays **51 local / 56 live predicted**.

**`docs/API.md` gains a seventh section and the count moves 58 → 60**,
counted with
`grep -cE "^app\.(get|post|put|patch|delete)\(" server.js` rather than
incremented by hand. `DEPLOYMENT.md`'s environment matrix gains
`DODO_WEBHOOK_SECRET`, `PAYMENT_BODY_LIMIT` and `RATE_DODO_WEBHOOK_MAX`.

`tests/payments.test.mjs` takes **9960–9990**, two app servers, and §9's table
says so.

§27's six user-facing documents need **nothing**, and that is checked rather
than skipped: no capability moved for any user, there is no screen, and
nothing can be bought. They get walked when there is a checkout.
`privacy.html` likewise — Dodo becomes a named recipient of personal data when
the **first payment actually runs**, not when a route exists (§52's condition,
§41's precedent, and §40's *"that is the complete list"* having already been
false twice).

Counts: Node **592 → 613**, Playwright **146** unchanged, smoke **51** locally.

### What is deliberately still not built

- **Enforcement.** Nothing reads `billing` to decide what a workspace may do.
  That is a *pricing* decision before it is code, and §17's "nothing is
  enforced" still stands. When it lands it is §24 stage B's suspension —
  read-only sync, reversible, nothing deleted, never reaching
  `deleteAccount()` (§15, §5) — with **export open to every role** (§36).
- **The checkout link.** `metadata_wsId` on
  `https://checkout.dodopayments.com/buy/{product_id}` is what ties a payment
  to a workspace, and it needs no third-party JavaScript, which is what keeps
  `script-src 'self'` intact (§30 Phase 4).
- **A `webhook-id` store**, costed above and declined: the clock already
  dedupes and also orders, which the id does not.
- **Any UI.** `GET /api/org/billing` exists so the state is *visible*, not so
  it is pretty.


---

## 71. The checkout link, and a return URL that cannot carry a hash

The third of §69/§70's three pieces: a Settings card with a **Subscribe**
button that opens the provider's hosted checkout, and the handling of the
customer coming back from it. **Still nothing is actually on sale** —
`DODO_PRODUCT_ID` is unset on every deployment, which makes the card absent
rather than broken, and a price is still the undecided half (§64).

### A static link, and the CSP is what decided that

Their integration guide offers four paths. **Overlay and inline checkout both
mean loading the provider's JavaScript**, which `script-src 'self'` refuses
(§30 Phase 4) — so they are ruled out by a constraint rather than a
preference, and taking either would mean punching a third-party origin into
the one header that has never had one.

A **static payment link** over the Checkout Sessions API for a smaller reason:
a session is created, expires in 24 hours and is single-use, so it needs a
round trip and an error path. A link is a string. If a session is ever wanted —
to pass a quantity, or to pre-apply a discount — the shape here is the place
it goes.

### The price is not in this repository, and that is a decision

The provider's product carries it and the checkout page states it. A figure in
this file would be a **second copy of the number actually being charged**,
which is §29's thesis with money attached and the one kind of drift a customer
notices in the same second they see it.

So the card links out and says nothing about cost, and an E2E assertion pins
that: `not.toContainText(/[£$€]\s?\d/)`. That makes putting a price on the
card a decision somebody takes again rather than a helpful line that slips in.

### `redirect_url` cannot carry a fragment, and this was measured first

The provider **appends** `?payment_id=…&status=…&email=…` to whatever return
URL it is given. So a `redirect_url` of `…/app#/settings` produces:

```
https://nimbleclerk.com/app#/settings?payment_id=pay_x&status=succeeded
  location.search → ""          ← the query is inside the FRAGMENT
  location.hash   → "#/settings?payment_id=pay_x&status=succeeded"
```

`location.search` is empty, so the code that has to read **and strip** that
query never sees it. Measured with `new URL()` before a line was written, not
discovered afterwards — and the app is hash-routed, so pointing the return at
Settings directly is exactly the thing somebody would reach for.

It points at the bare app and `captureCheckoutReturn()` sets the hash itself,
which is also the only place that knows where the card lives.

### The return is not proof of payment, and the gap it leaves is named

A query parameter is something anybody can type. Only the signed webhook
records anything (§70), and it is still in flight when the customer lands —
so for a second or two the server honestly has nothing, and a card reading
*"No subscription on this workspace yet"* to somebody who has just paid is the
worst sentence on the screen.

`crmb:checkoutPending` in **sessionStorage**, set on a `succeeded` return and
cleared the moment the server has a record. Three things about that:

- **sessionStorage rather than a poll**, and the reload is the reason: somebody
  who refreshes while waiting keeps the explanation, where a timer would have
  died with the page.
- **Cleared by the server having an answer**, not by elapsed time — what ends
  the wait is the only thing that actually answers the question it asks.
- **Per-tab and transient**, so it cannot outlive the question. It is not a
  workspace setting and never goes near `settings` (§60's rule, §38's reason).

### The email is stripped, and that is the half that matters

The provider appends the **customer's email address** to the return URL. An
address left in the bar goes into browser history and into the `Referer` of
whatever the page loads next — §17 refuses a *correct* `?token=` for exactly
that reason, and the fact that this one is the person's own address makes it
less bad rather than fine.

`captureCheckoutReturn` strips `payment_id`, `status`, `email`,
`subscription_id` and `license_key`, the same way `captureInvite` and
`captureBetaCode` strip a credential. Asserted on the URL afterwards, in both
the encoded and plain spellings.

### No customer prefill, deliberately

The provider accepts `email`, `fullName` and a full address as query
parameters, and the signed-in address is right there. **Not sent**: a billing
address is not necessarily a sign-in address, and this is the one screen where
guessing wrong costs somebody money — §45's rule, and the provider's own form
is where that question belongs.

Asserted field by field, so "helpfully" adding one is a decision rather than a
line that slips in.

### Four card states, and two of them are absences

§39's `digestStatusHTML` is the precedent and the reason — a card whose only
line needs an event to have happened says nothing in exactly the state
somebody is reading it.

| Card | State |
|---|---|
| *Payments are not finished being set up here* | `enabled: false` — a payment would be taken and **never recorded**. An operator fault that looks identical to "nobody has paid" from outside |
| *Confirming your payment* | paid seconds ago, webhook not landed |
| *No subscription on this workspace yet* | nothing recorded, nothing pending |
| a read view of status, next payment, access-until | a record exists |

The card is **absent entirely** when there is nothing to sell and nothing
recorded (§36 rule 1) — which is where every deployment is today. The
condition asks for a checkout link **or** an existing record rather than for
`enabled`, so a workspace that already subscribed still sees its state if the
product id is later unset.

### Traps

- **`credit-card` is not in `LUCIDE`.** Checked rather than rendered, because
  an unknown name falls back to a **box** that looks deliberate (§53).
  `external-link` is both present and the more honest glyph: this hands off to
  somebody else's site, which is what §53 chose it for on the mail draft.
- **§60's backtick trap, twice in one commit.** A backtick inside an HTML
  comment inside a template literal closes the string, and `node --check`
  reported `Unexpected identifier 'enabled'` and then `'credit'` — pointing at
  my own comment prose rather than at anything structural. The comment now
  says so in itself.
- **`fmtWhen` is wrong for a date the provider stated as a DAY.** It runs
  `toLocaleDateString` on the instant, so a UTC midnight renders as the
  previous day west of Greenwich — §50's trap, in the one place this card says
  a date out loud. `dayISOFromMs` → `fmtDate`.
- **The billing fetch is owner-only and its 403 is swallowed**, like the
  invite list and the webhook beside it: asking as a member is expected, not
  an error worth surfacing.

### Verified: ten mutations, and two found gaps rather than confirming cover

Each fails the test that names it:

| Mutation | Fails |
|---|---|
| `redirect_url` carries the settings hash | *the checkout link carries this workspace, and nothing else* |
| the product id interpolated, not encoded | the same test — the id in the fixture holds a space and a slash, so an unencoded one changes the **path** |
| `wsId` read from the query | *the workspace on the link is the session, never a parameter* |
| the customer email prefilled | the same link test, field by field |
| checkout offered when nothing can record it | *a deployment that cannot record a payment says so…* |
| the return query read but not stripped | **both** return journeys |
| any return status treated as a payment | *a cancelled checkout says nothing was charged…* |
| the pending note never set | *a payment return strips the query…* |
| **the pending note never cleared** | **nothing, at first — see below** |
| **a local getter on the stored day stamp** | **nothing, at first — see below** |

**Two passed, and both were coverage gaps rather than safe code.**

*The note never cleared* passed because no test had ever set the note and then
loaded a card with a record — so the clear had nothing to clear. The defect it
would have shipped is two contradicting lines on one card: a live subscription
with *"confirming your payment"* above it, per tab, for ever. The
existing-subscription journey now seeds `crmb:checkoutPending` first.

*A local getter on the date* passed because **this container is UTC**, where
`toISOString` and `getFullYear/getMonth/getDate` agree. §55 and §68 record the
same vacuity; the describe pins `timezoneId: 'America/New_York'` and
`locale: 'en-GB'` now, and the assertion names the exact day — `13 Nov 2026`,
where a local read renders the 12th.

**And a failure that was my selector, not the product.** Both return journeys
failed on `.sidebar`, which this app does not call it — `#sidebar`. The
artifact showed the page rendered correctly and already on Settings, so the
capture code had worked the whole time. §9's *read the trace first* earning
its keep: re-running would have reproduced it forever.

### Blast radius

`js/app.js` and `js/cloud.js` are in `APP_SHELL`, so `CACHE_VERSION` →
**`crmbuilder-v61`**. No new served file, so smoke stays **51 local /
56 live predicted** — and running it is what proves that (§9).

**`docs/API.md` gains no route and the count stays 60**, because this extended
`GET /api/org/billing` rather than adding a sibling. §46's trap for the fourth
time: the number is right and the file read correctly while a **response
shape** moved underneath it.

`DEPLOYMENT.md` gains `DODO_PRODUCT_ID` and `DODO_CHECKOUT_BASE`.

Counts: Node **613 → 616**, Playwright **146 → 151**, smoke **51** locally.

**One failure on the full Playwright run**, and it is §66's intermittent
rather than anything here: *signing out hides the workspace* with §66's exact
recorded signature — the artifact shows **Settings still rendered** after the
navigation. 6/6 in isolation afterwards, which neither retires it nor
re-measures its rate: six passes against a 1-in-3 rate happens about 9% of the
time, so the honest claim is only that the signature matches and nothing in
this commit sits on that path.

### §27's walk is deferred, with the condition named

No user-facing document is touched, and that is a checked omission rather than
a skipped step: **the card is absent on every deployment**, because no
`DODO_PRODUCT_ID` is set anywhere. Nobody can subscribe, so nobody has gained
a capability to document — §52's precedent exactly, where the mail adapter
shipped with no docs walk because no client could reach it.

They get walked **when a price is set**, which is the same moment
`docs/LAUNCH-CHECKLIST.md` §2.1's list fires and
`MARKETING.md`'s *"No per-seat pricing. Free. No ads."* has to be dealt with
(§48, §64).

`privacy.html` likewise: Dodo becomes a named recipient of personal data when
the **first payment actually runs**, not when a button exists. §41 published
the backup-encryption sentence only once an encrypted artifact had been
restored end to end, and §40's *"that is the complete list"* has already been
false twice — both times caught by looking at what the deployment does rather
than at what the code could do.

### What is still not built

- **Enforcement**, unchanged from §70: nothing reads `billing` to decide what
  a workspace may do. A pricing decision before it is code, and when it lands
  it is §24 stage B's suspension with export open to every role (§36).
- **Tiers.** One product id, because §64 settled per-workspace pricing and the
  tiers themselves are undecided. This becomes a map, not a redesign.
- **A customer portal link.** The provider hosts one for changing a card or
  cancelling; the button currently reads *Manage payment* and goes to the same
  checkout. That is the next small thing, and it wants the portal URL shape
  confirmed against a real account rather than guessed (§69's standing rule
  that nothing here has seen a real delivery).


---

## 72. The payments document rewritten, and a credential that was never needed

Documentation only, and it closes §69's own outstanding item: *"`docs/PAYMENTS.md`
rejected this vendor, and that table was wrong."* Two deliverables — the
document rewritten around the rail actually chosen, and
[`docs/PAYMENTS.md`](docs/PAYMENTS.md) §7, an operator step-by-step for
standing up and testing **test-mode** payments on the provider's dashboard.

### What survived the rail change, and the split is the whole point

Rewriting a research document after its recommendation is overturned invites
throwing the lot away. Most of it is structural rather than about the vendor:

| | |
|---|---|
| **§1** RBI PA-CB, Stripe's absence from the authorised list, the UK/EU zero-threshold VAT arithmetic | **unchanged.** It is the reason an MoR was chosen *at all*, so it survives choosing a different one |
| **§3's thresholds** Visa VAMP at 1.5%, Mastercard ECM, the 3DS analysis | **unchanged** — card-scheme rules |
| **§3's five levers** annual invoicing, descriptor, pre-renewal mail, two-click cancel, 14-day refunds | **unchanged, and that is now the point**: none of them depends on which provider was picked, which is why this was the only section needing no edit |
| **§4** the tax split, LUT, the one-year FX window, the intermediary opinion | **unchanged** — a property of the structure |
| **§5** per-workspace tiers, GBP primary, the CRM comparison | **unchanged** |
| **§2** the recommendation | **rewritten** |
| **§3's numbers** 0.65% by value, £20 kept win-or-lose, no evidence accepted, the pre-chargeback refund path | **demoted from facts to a prior** — see below |
| **§5's net-rate table** | **deleted, not converted** |
| **§6, §7, §8** | rewritten |

### A rejection is not deleted when it is overruled

The old §2 table said Dodo was *"the wrong trade"* for having no independent
operating history. The decision went the other way for a reason that table did
not weigh — **it accepts an individual**, and every alternative wanted a
company, so the comparison was never between two rails but between a rail now
and a rail after an incorporation.

**What the rewrite had to be careful about is that the objection only PARTLY
moved**, and saying "chosen" would have overstated it:

- **answered** — the engineering surface, read first-party and verified:
  Standard Webhooks signing, the two-mode separation, the retry schedule, the
  event catalogue, the payload shape, the test cards, the static-link
  parameters. Drivable end to end before a customer exists, which is §7.
- **not answered** — the economics. Fee, payout into INR, FX spread,
  chargeback set-off, per-seller threshold, and **whether the provider is
  contractually the seller of record.**

So the document states it as *the integration is verified and the commercial
terms are unread*, which is better than the table assumed and worse than
settled.

**And `js/app.js` already prints the claim that needs the MSA.** The
Subscription card says *"Dodo Payments, who are the seller of record"* — a
contractual claim, in front of customers, that §1's entire VAT escape rests
on. If they are a gateway wearing MoR language, §1 is Option A in disguise:
UK VAT and EU OSS owed from the first sale, and §4's split wrong on every row.
That is now the first row of §8 rather than a line in a table.

### Paddle's policy is kept, as a question rather than as a figure

The temptation was to convert the chargeback section to Dodo. **Converting a
number nobody has read is the error §17 names** — records-times-a-constant, in
the one place it would be quoted back. So §5's net table is **blank with the
four columns it needs**, and §3 says *assume the worst of all three* instead.

What the Paddle research becomes is three questions for the MSA, which is a
smaller and far more useful claim: is the threshold measured **by value or by
count**, does a **won** dispute still count, and may you **submit evidence**?
Those three answers decide whether §3's levers are preventive-only or whether
there is an appeal stage worth being good at — and no provider puts them on a
pricing page. Written down because the alternative is re-deriving it at the
moment the first dispute arrives.

**The volume arithmetic is kept too, and it is the strongest argument in that
file**: a rate measured by value is a **binary** while the denominator is
small. One disputed £49 subscription stays under 0.65% only above £7,538 of
monthly volume; £99 needs £15,231. Below that a single dispute breaches it
alone, and if won disputes count, winning does not help. The job is keeping
the count at zero, not shaving a percentage.

### The correction: there is one credential, not three

§69 pinned **`DODO_API_KEY`, `DODO_WEBHOOK_SECRET`, `DODO_API_BASE`** as
"env-only, all three". Checked rather than carried forward, because a list of
credentials is exactly the thing to verify:

```
server.js: DODO_WEBHOOK_SECRET  DODO_PRODUCT_ID  DODO_CHECKOUT_BASE
           PAYMENT_BODY_LIMIT   RATE_DODO_WEBHOOK_MAX
CLAUDE.md: DODO_API_KEY         ← and nowhere else
```

**`DODO_API_KEY` is read by no line of code, and that is a property of the
design rather than an omission.** A **static payment link** (§71) plus
**signature verification** (§69) uses the provider's API not at all: the link
is a string, and the verification is HMAC over bytes we were sent. The two
pieces that each looked like they would need a bearer token need none between
them. `DODO_API_BASE` went the same way — there is no API host to point
anywhere, and the seam that was actually needed is `DODO_CHECKOUT_BASE`, on
the only outbound thing there turned out to be.

So the credential surface is **one signing secret**, and §17's rule still
governs it. Corrected in §69 **in place with the strike-through**, per §46's
treatment: the hedge was right when it was written and what it got wrong is
the reusable part — *a credential you plan for and a credential you need are
different lists, and the second one is shorter when the integration is thin.*

### §7, and the step it opens with

The runbook is eighteen steps plus a before-live list, and three of them exist
because of failures already recorded in this file:

- **Step 0 is "sync the Render mirror".** §65: a push here does not deploy, so
  `POST /api/payments/dodo` on a stale build is a **404** — which from the
  provider's dashboard is indistinguishable from a wrong URL. The repository
  cannot see which build is live, so the first instruction is to go and look
  (`curl -s https://nimbleclerk.com/healthz`). §40's rule, at its smallest.
- **Step 3 turns off test-mode customer email BEFORE the first payment.** Test
  mode sends **real** email to **real** addresses with a `[TEST MODE]`
  subject, capped at 100/week. Doing it afterwards means a receipt has already
  gone somewhere.
- **Step 9's pass looks like a failure, and the runbook says so first.**
  *Webhooks → Testing → Send example* is the only thing that proves
  verification — their `wh trigger` sends unsigned payloads (a **false pass**)
  and `wh listen` re-serialises the body (a **false failure**). But the example
  payload carries no `metadata.wsId`, so the correct outcome is **200 with the
  card unchanged**. A reader expecting the screen to move would conclude it had
  failed, which is this file's standing shape — a state that renders as
  nothing — reached through a success.

Two more worth having in writing: **step 16 replays an older event after a
cancellation** and requires the card to still say cancelled, which is the one
behaviour the provider's tools cannot produce on their own and the one that
costs money if §70's clock comparison is wrong. And **step 17 cancels every
test subscription**, because they keep renewing and keep delivering webhooks
for weeks after testing stops.

### Blast radius

**Documentation only.** No code, no served file, no route, no wire change —
`CACHE_VERSION` stays `crmbuilder-v61` and smoke stays 51 local / 56 live
predicted, checked rather than assumed (§41's rule for a docs-only change).

`docs/API.md` needs nothing: no route and no response shape moved, which is
the check §46 and §54 both say to run instead of reading the route count.
**§27's six user-facing documents need nothing, and that is the same checked
omission as §70's and §71's** — no `DODO_PRODUCT_ID` is set on any
deployment, so the Subscription card is absent and nobody has gained a
capability to document. They get walked when a price is set, which is the same
moment [`docs/LAUNCH-CHECKLIST.md`](docs/LAUNCH-CHECKLIST.md) §2.1's
list fires. `privacy.html` likewise: the provider becomes a named
recipient of personal data when the **first payment actually runs** — §52's
condition, §41's precedent, and §40's *"that is the complete list"* having
already been false twice, both times caught by looking at what the deployment
does rather than at what the code could do.

One formatting repair while in there: §8's table had rows stranded **after** a
blockquote, so two of them rendered as prose and *"Payout fee and FX spread
into INR"* appeared twice. Markdown does not resume a table across a block
element — the kind of thing that reads fine in a diff and wrong on a page.


---

## 73. Driving the real dashboard, and five things only a real payment found

§69 through §72 built the inbound gate, the webhook route, the checkout link and
the document, and every one of them says the same thing in its own words:
**nothing here has seen a real delivery.** This is what happened when ten
arrived. Two of the five landed in `fee243d` and `245a0cd` without a section —
this is that section, written after the fourth, and extended after both cards
finally paid.

**Not one of the five is a defect in the code those four sections shipped.**
Three are documentation that was wrong or short, one is a card that did not read
a field it already had, and one is the provider's own hop failing. That is the
useful shape of the result: the parts that were built against a written spec
held, and everything that broke was a thing nobody could check without an
account.

### 1 · The repository told the operator not to set the variable test mode needs

§71 introduced `DODO_CHECKOUT_BASE` as *"a pure test seam"*, and
`DEPLOYMENT.md`'s matrix and `docs/PAYMENTS.md` §7 both said **do not set it on
a real deployment.** The provider serves checkout on **two hosts** —
`checkout.dodopayments.com` live, `test.checkout.dodopayments.com` test — and a
product created in test mode exists on the second only. So the one deployment
state the variable is *required* for was the state our own documentation
forbade.

The symptom is **not** an error that names the cause: both hosts 307 an id they
do not know to their own `/error/not-found`, which renders *"This link isn't
available"*. A wrong host and a wrong product id are therefore
indistinguishable from the screen, which is why the runbook now carries the
five-second separator:

```sh
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' \
  "https://test.checkout.dodopayments.com/buy/<product id>"
```

A `200` is the id being real on that host; a `307` to `/error/not-found` is the
id, not the host, once the host is known good.

**It is a mode selector, not a seam**, and all four places say so now. The
seam/selector framing is the whole defect: a variable described by *why it was
added* rather than by *what it decides* gets a warning attached to it that is
correct for the author and wrong for every operator.

### 2 · The event list in the runbook was short, and it cost a real event

§7 step 5 named **seven** subscription events. `BILLING_SUBSCRIPTION_EVENTS` in
`server.js` handles **eleven**: `updated`, `paused`, `unpaused` and — the
expensive omission — **`failed`** were missing.

A declined first payment emits three events: `payment.failed`,
`subscription.failed` and `subscription.updated`. Only the first was
subscribed, so the provider's *Activity* tab read **Succeeded 1** while its
*Logs* tab listed **three** — two generated and never delivered. Both screens
were telling the truth about different things, which is §40's pair of monitors
in somebody else's console.

The list is exhaustive now, and it is **derived rather than retyped**:

```sh
grep -A 14 'const BILLING_SUBSCRIPTION_EVENTS' server.js | grep -oE "'[a-z_.]+'"
```

§29's thesis, in the one place it is checkable: a list of events written in a
second place is a list that goes stale, and the dashboard is a third place it
cannot be checked against from in here at all.

**And deselecting every event subscribes you to all of them**, per their docs —
so the failure mode of getting this wrong is an endpoint receiving either too
few events or the entire catalogue, with nothing in between. §70's rule that
every verified answer is a 2xx is what makes the second survivable.

### 3 · The card said `Status: unknown`, and the answer was sitting unread

With only `payment.failed` delivered, the stored `billing` carries
`paymentEvent` and `paymentStatus` and **no `status` and no
`subscriptionEvent`** — `billingFieldsFor` writes one set or the other, never
both. §71's card read:

```js
['Status', esc(b.status || b.subscriptionEvent || 'unknown')],
```

So the owner saw **Status: unknown** on a workspace whose payment had just been
refused. The information was in the record; the card simply did not look at it.
Indistinguishable from a broken deployment, which is the one reading that sends
somebody to the service log instead of to their bank.

A fifth branch above `rows`, and the placeholder is **deleted rather than
reworded** — the whole point is that there is no state in which `unknown` is
the best available answer:

| Record | Card |
|---|---|
| `paymentEvent: 'payment.failed'`, no subscription | *your last payment attempt did not go through… nothing has been charged* |
| a payment, no subscription, not failed | *a payment was recorded, and your subscription has not been confirmed yet* |

The second is the gap §71's pending note covers for the tab that did the
paying; this is the same gap seen from **another device**, or after that tab
has gone, where `sessionStorage` cannot help. *"Last heard from your provider
⟨when⟩"* carries `updatedAt`, because the difference between *waiting* and
*stuck* is how long it has been.

**Guarded by *"a declined first payment says the card was refused, never
'unknown'"***, in §71's `subscribing` describe so it inherits
`timezoneId: 'America/New_York'` and `locale: 'en-GB'`. It asserts
`.read-label` count is **0** as well as the wording: a build that kept the rows
*and* added the note would pass a text assertion while still printing
`Status: unknown` underneath it. Checked against the broken state per §9 —
restoring the placeholder fails it by name.

### 4 · A US test card on an INR checkout is refused, and reads as a decline

The fourth, and the one that cost a failed payment. The checkout rendered
**₹6,429.04/Month** with **GST ₹1,157.23** itemised, and refused
`4242 4242 4242 4242` with *"This payment method can't be used here. Please use
a different payment method."*

**The payment methods offered depend on the CURRENCY, not on test mode.** An
INR checkout offers India-issued cards and UPI; a foreign-issued card is not
among them, and their own FAQ records the same mismatch surfacing as a 500. So
the refusal is about the card's *region* and says nothing about the card — a
message that is accurate and points away from the cause, which is this file's
standing failure shape arriving in somebody else's UI.

> **"US card" is wrong, and the failure payload is what says so.** The
> `payment.failed` body reports `card_issuing_country: "GB"` for
> `4242 4242 4242 4242` — so the refused card is **GB**-issued, not US. The
> mechanism is unchanged and is the point: *issuing country against checkout
> currency*, not one named country against another. Left corrected rather than
> rewritten, because the heading is what a reader searches for and the wrong
> label is the reusable warning — a card's region is a property the provider
> reports, not one you infer from where the number came from. What the other
> published test cards report is **unknown**: only this one has been seen in a
> payload.

§7 step 10 now reads the currency **first** and groups the cards by region
(India Visa `4576 2389 1277 1450`, India Mastercard `5409 1626 6938 1034`,
with their declines), rather than listing the US ones first with India third —
which is the ordering that produced the failure.

Two consequences carried into the runbook rather than left to be rediscovered:

- **The renewal-failure card `4000 0000 0000 0341` is US-only** and the docs
  publish no India equivalent, so step 14 — the only way to exercise
  `subscription.past_due` — is probably unreachable on an INR checkout.
  **Recorded as unverified**, with two ways round it, because claiming either
  outcome without driving it is what §69 already refuses to do.
- **An India card subscription is not instant.** RBI mandate rules apply, so
  `subscription.active` can lag the payment and a card still saying
  *"Confirming your payment"* is not yet evidence of a webhook fault.

### 5 · `redirect_url` is not navigated to directly, and their hop 429'd

Both cards then paid successfully, and the US one broke the **navigation**
rather than the payment.

The success page does not send the customer to our `redirect_url`. It
auto-forwards to an **undocumented hop of theirs** —
`test.dodopayments.com/return/<id>` — **and that hop is what appends
`payment_id`, `status` and `email`.** So §71's `captureCheckoutReturn()` runs
only if it completes. It returned **HTTP 429** after three test payments in
half an hour, rendering Chrome's *"This page isn't working"* with no mention of
the provider on it. A reload got through to `/app`.

**The obvious conclusion from a browser error page on a URL we supplied is
that our redirect is wrong, and it is the wrong conclusion** — which is why
§7 step 11 now names the two things that distinguish it: the address bar says
`dodopayments.com` rather than `nimbleclerk.com`, and `/api/org/billing`
already holds the subscription.

**The design held, and it held for a stated reason rather than by luck.** §70
made the webhook the only thing that records anything, and it does not travel
through that hop — the delivery log shows all four events in the same minute as
the payment, and the Settings card read `active` / *Next payment Nov 14* on the
reload. §71 built the pending note as reassurance for the tab that paid, never
as the record, so losing the hop costs the note and nothing else.

What it leaves is a **narrow worse case, recorded rather than fixed**: a
customer whose return hop fails *and* whose webhook has not landed yet sees
*"No subscription on this workspace yet"* — the wrong sentence for somebody who
has just paid, and the §72 branch above cannot help because nothing told the
client a payment was in flight. The window is seconds and **nothing can close
it from our side**, because knowing a payment is in flight is exactly what the
return URL was for. Not worth a poll: it would run on every Settings render for
every workspace to cover a few seconds of one.

**And four events landed inside one minute**, which exercises §70's
same-timestamp note in production for the first time: `subscription.active`,
`subscription.updated`, `subscription.renewed` and `payment.succeeded`, with
*renewed* arriving on a **first** payment. The final state is right because all
four carried the same status, which is the condition that section already
states — *"apply unless strictly older"* resolves a tie by arrival order, so
the tie being harmless is a property of the payloads rather than of the rule.

### Four findings for `docs/PAYMENTS.md`, read off real screens

- **A hard pricing CEILING at ₹15,000 per debit**, and this one is the reason
  to read a mandate screen rather than a regulation. The India authorization
  page — served by **Cashfree**, which is their India acquirer — reads *Max.
  Amount INR 15,000.00*, *Frequency: As and when presented*. That figure is the
  RBI additional-factor-of-authentication threshold for recurring e-mandates
  (₹5,000 → ₹15,000 by a June 2022 circular, consolidated April 2026), so the
  provider pins the mandate at exactly the ceiling. Below it a renewal debits
  silently; **above it the customer authenticates every charge**, which for a
  subscription is a dead subscription rather than a friction cost. It binds
  nothing in §5's table (~$150/month) and it binds **annual invoicing** — §3's
  strongest chargeback lever — which multiplies the debit by twelve and puts
  any tier above about £10/month into AFA territory for an Indian card. So the
  lever and the ceiling interact, and an annual plan needs a non-mandate path
  for India. In §5 rather than §4, because it constrains the price and not the
  tax.
- **The test product's base currency is USD**, measured: `$65.00` to a US card
  and `₹6,429.04` to an India one, ratio ~98.9 — a conversion, not two
  configured prices. That **answers half of §8's currency row** (localised
  presentment works) and leaves GBP specifically unread, while saying §5's
  *GBP primary* decision has not been applied to the product.
- **Destination tax is computed per jurisdiction** — 18% GST itemised on the
  INR checkout, `$0.00` sales tax on the USD one. It points the right way on
  §8's first row, and it is still **evidence about their implementation rather
  than about who the contract says sold the thing.** Behaviour cannot answer a
  contractual question; the MSA can.
- **The mandate screen says *"Click here to go to Business Name website"*** —
  a literal placeholder, on the one screen where a customer grants a standing
  debit. Their configuration, not ours, so it is a support question rather than
  a setting, and it is in §8 as a before-live item because the screen it is on
  is the one that loses mandates.

### The sign-off matrix, and a derivation that was wrong the same way

Asked for **every possible scenario on the test gateway before going live**.
Building the matrix found that most of it should not be hand-driven at all,
and that the fix §73 had just shipped for a stale list was producing a wrong
list of its own.

**`tests/payments.test.mjs` already proves the state machine** — 24 tests
posting real signed payloads at the real route, including the cancellation
ordering guard that is the one costing money if it is wrong. So the dashboard's
job is not the mechanism; it is the three things no synthetic payload can
answer: *is the real payload shaped the way the code reads it*, *do the real
sequences match what was assumed*, and *does the provider's screen agree with
ours*. [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §9 is the matrix.

**Three events had never been driven by a test AND cannot be produced in test
mode**: `plan_changed` needs a second product, `on_hold` needs a dunning
sequence to exhaust, `expired` needs a billing period to end. Production would
have been their first sighting of *any* kind, and two of the three are the ones
that take access **away** — the direction that generates a support ticket. A
derived, table-driven test covers all eleven now.

**And the derivation reproduced the bug it was written to fix.** §73's own
command, and §7 step 5's beside it:

```sh
grep -A 14 'const BILLING_SUBSCRIPTION_EVENTS' server.js | grep -oE "'[a-z.]+'"
```

`[a-z.]+` has **no underscore**, so for `'subscription.plan_changed'` the class
stops at the `_` and finds no closing quote — the match is skipped entirely
rather than truncated. It derived **eight of eleven**, dropping
`plan_changed`, `past_due` and `on_hold`: **two of the four events §73 records
the runbook having missed in the first place.** A typed list that goes stale at
least looks like a typed list; a derivation that is wrong in the same direction
looks authoritative. This file's standing failure shape, in the tool built to
prevent it.

Found by the new test's own floor assertion (`events.length >= 11`), which
exists precisely because a regex that silently matches nothing makes every
assertion below it vacuous — §34's shape. Without that floor the test would
have passed over eight events and reported full coverage. Fixed in all three
places; the test comment carries the reason, because the next person to widen
that class will be looking at the regex rather than at this section.

**Checked against the broken state** (§9), both failing by name: dropping an
event from the server's Set, and restoring `[a-z.]+` in the test. The **floor**
is what catches a removal or a broken derivation; the **per-event loop** is
what catches a handling failure, and that is narrower than it looks because
`applyBillingEvent` has no per-event branch — so the loop proves the round trip
rather than eleven distinct behaviours. Said plainly rather than counted as
eleven tests.

**One asymmetry noted and deliberately not changed.** `publicBilling` returns
`subscriptionId` and **not** `paymentId`, though both are stored. My test
asserted on the one the route does not return — a test error, not a product
one — and the assertion is removed with the reason, because changing a response
shape is a §46 decision rather than a test fix. The payment id is the useful
one in a support conversation, so it is worth a decision rather than a drift.

### Both real payloads, read at last, and the inventory needed nothing

§70's own comment set the condition — *"nothing here has yet seen a real
delivery, so it stores only fields the provider's own documentation names…
widening it is the first thing to do once a real payload has been read, not
before"* — and a real `subscription.active` body has now been read out of the
delivery log. **All seven reads land**: the envelope's `type` and `timestamp`,
`data.metadata.wsId` (which passes `WSID_PATTERN` and resolves to a real org),
`subscription_id`, `status`, and `next_billing_date`.

**The useful row is `past_due_ends_at`, which arrives present-and-NULL.** A key
the provider had named differently would read `null` through `isoOrNull` and
render as a missing row rather than an error — so present-and-null is what
distinguishes *nothing has filled it yet* from *we are looking in the wrong
place*, and those two are indistinguishable from the card. That is the whole
argument for comparing against a payload rather than against a screen.

So the answer to the condition is **no widening**, which is a result rather
than an absence of one. The comment says so now, because a comment naming a
task that has been done reads as an outstanding one.

**And the body confirms §70's exclusion was worth making** rather than
cautious: it carries `customer.email`, `customer.name` and a full billing
address — street, city, state, postcode, country. `workspaces[].meta` **is**
the `data` collection (§17), so a generous `billingFieldsFor` would have put
all of it into every nightly artifact.

**And then the PAYMENT envelope was read, which completes the inventory.**
`payload_type: "Payment"` is a different shape and all three payment-branch
reads land on it — `payment_id`, `status`, and the envelope's `type` and
`timestamp`.

**`metadata.wsId` riding on it is the finding, not a formality.**
`metadata_wsId` is set on the *checkout link*, so it is a property of the
subscription that link created, and nothing guaranteed the provider would copy
it onto each payment. Had it not, every payment event would have been
discarded as `ignored: 'no workspace'` — logged loudly per §70, and discarded
all the same — while subscription events worked perfectly. A half-working
integration whose failing half is the one carrying money, and it would have
read as fine from the Settings card.

**Both bodies justify §70's no-customer-identity rule, and the payment one
more loudly.** Each carries `customer.email`, `customer.name` and a full
billing address; the payment body adds **`card_holder_name`,
`card_last_four`, `card_network`, `card_type` and `card_issuing_country`**. A
generous `billingFieldsFor` would have put card details into every nightly
artifact.

Three money findings off it, none of them a field worth storing:

- **There is no fee field anywhere** — no `platform_fee`, no `net_amount`, no
  deduction. `settlement_amount` is **gross of tax**: `(7671 − 1170)/100` is
  `$65.01`, the $65.00 base to within the conversion's own rounding. So
  [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §5's net-rate table **cannot be
  filled from payment webhooks at all** — the fee is taken at payout, and a
  payout record or statement is the only place to read it. That changes where
  to look, which is the actionable part.
- **`currency: "INR"` against `settlement_currency: "USD"`** — ₹7,587.26
  charged (₹1,157.38 GST), $76.71 settled ($11.70 tax), an implied 98.91
  INR/USD. §8's open row assumed **one** conversion into INR; this shows a USD
  settlement leg, so there may be **two** with a spread on each. The payload
  cannot say whether the second exists. The row is widened, not answered.
- **`card_issuing_country: "IN"`** confirms item 4 above from the payment side
  rather than from the refusal.

**Two fields that would improve the product and are deliberately not taken:**

- **`error_code` / `error_message`**, null on success. A `payment.failed` body
  almost certainly names why a card was refused — exactly what item 3's card
  cannot say. But **a failure body has still never been read**: §73 saw that
  event arrive, not its contents. A candidate, not a change, and §53's rule
  applies when it becomes one.
- **`invoice_url`**, a per-payment receipt on the provider's host. Our screen
  offers none, which is a real gap. **Not linked or stored until its access
  control is known** — the payment id is in the path and we hold payment ids,
  so an ungated URL would mean anyone with an id can fetch somebody else's
  invoice, and we would have shipped the thing that hands it to them.

`disputes: []` and `refunds: []` ride on the payment body as well, so a
replayed payment event would carry dispute state without the dispute events
being subscribed. Not a mechanism to rely on — nothing re-delivers a payment
event on your schedule — but recorded beside the unhandled-families decision.

Three more facts off the same body, each with a consequence, all in
[`docs/PAYMENTS.md`](docs/PAYMENTS.md) §9:

- **`currency: "USD"`, `recurring_pre_tax_amount: 6500`** — confirms the
  measured USD base above, from the payload rather than from two screens.
- **`subscription_period_count: 20` / `"Year"`, `expires_at: "2046-10-14"`** —
  the test subscription runs **twenty years**, so `subscription.expired` is not
  slow to produce, it is unreachable by waiting. It needs a purpose-built
  short-period product, which is the same second product `plan_changed` needs.
- **`cancel_at_next_billing_date: false`, `scheduled_change: null`** — the
  provider models *cancel now* and *cancel at period end* separately, and a
  deferred cancellation arrives as `subscription.updated` carrying
  `status: "active"`. This route records that faithfully and the card is then
  **correct** — access does run to the period end — but it leaves nothing
  cancelled, so replaying an older `active` over it proves nothing. §34's
  shape, so the matrix now says to read the delivery log between the cancel and
  the replay.

**Sixteen events are ticked on the endpoint and thirteen are handled.**
`payment.processing`, `payment.cancelled` and
`subscription.update_payment_method` arrive and are discarded with
`200 {received:true, ignored:'unsubscribed event'}` and no log line — §70's
rule working as designed. They stay ticked: their docs state that deselecting
*every* event subscribes you to all of them, and a ticked-but-ignored event
costs one 2xx while an unticked one has to be remembered later. The first and
third are worth a decision beside enforcement — a mandate debit sitting in
`processing`, and the provider asking for a new card, are both states the
Settings card currently renders as nothing (§39's recurring shape).

### And the FAILURE body, which answers the deferred candidate against itself

The subsection above left one thing open: *"a `payment.failed` body almost
certainly names why a card was refused… but a failure body has still never
been read. A candidate, not a change."* It has been read now, and the
prediction was right about the data and **wrong about what to do with it.**

All the reads land — `payment.failed` is in `BILLING_PAYMENT_EVENTS`,
`payment_id` and `status: "failed"` are there, `metadata.wsId` rides on a
failure exactly as it does on a success. And the two fields are populated:

```
error_code:    "PAYMENT_METHOD_UNSUPPORTED"
error_message: "This payment method isn't supported for this transaction.
                Ask the customer to use a supported method."
```

**Read that second line again: it is addressed to the MERCHANT.** *"Ask the
customer"* — the provider is talking to whoever sells the thing. §53's rule
says the provider's own words are what the reader has to act on, and that rule
**inverts here**, because the audiences are not the same two parties. On the
mail chaser the owner *is* the account holder at Resend, so Resend's words
reach the person who can fix the DNS record. Under an MoR the merchant is
**Dodo and us**, and the Settings card is read by **our customer** — the payer.
Showing this verbatim would tell a customer to ask themselves to use a
different method.

So the finding is not "now we can show it". It is that a provider message is
written for a position in the transaction, and copying it across a boundary
where that position changes produces text that is accurate and addressed to
nobody present.

**And the raw `error_code` is not the safe half either.** Card issuers
deliberately return vague declines to payers — a precise reason is an oracle
for whoever is testing stolen numbers — so a field that can carry a real
decline reason is a field whose *disclosure* is a decision, not a UX
improvement. `PAYMENT_METHOD_UNSUPPORTED` is harmless; nothing says the next
one is.

**Still not taken, then, and now for three better reasons than "unread":** the
message has the wrong audience, the code may carry what an issuer withholds on
purpose, and **one sample is not a vocabulary** — a map built from a single
observed code ships with one correct entry and a fallback that fires on
everything real (§45's rule about a guess presented as an answer). The card's
existing wording stands.

Two more facts off the same body, and the first is a trap:

- **`settlement_amount`, `settlement_tax` and `settlement_currency` are
  IDENTICAL on the failure and on the success** — `7671` / `1170` / `USD`,
  byte for byte, on a payment where **nothing settled**. So those fields are a
  *quotation* rather than a settlement record. That sharpens the no-fee finding
  above into something stronger: you cannot read revenue off payment webhooks
  at all, because summing `settlement_amount` counts the payments that failed.
  A payout record is not merely the better source, it is the only one.
- **A failed first payment mints a subscription that never activates.** The
  failure carries `sub_0NpgzTEZbXlEAgR4zJU6P` and the successful retry carries
  `sub_0Nph212BlsXmVQEUgSYxV` — different ids. `applyBillingEvent` resolves
  that correctly by clock, so nothing is wrong; what is worth knowing is that
  **a subscription id is not stable across a retried first payment**, so it is
  not an identifier to key anything else on. `payment_method_id` is `null` on
  the failure and `service_periods` is `[]`, both consistent with a
  subscription that never began.

### Blast radius

`js/app.js` was the only served file and it is in `APP_SHELL`, so
`CACHE_VERSION` → **`crmbuilder-v62`**, which `245a0cd` carried. No new served
file, so smoke stays **51 local / 56 live predicted** — §8, this session
reaches neither host.

**`docs/API.md` needs nothing** — no route, and no response shape moved:
`publicBilling` already returned `paymentEvent`, and what changed is that the
client finally reads it. The check §46 and §54 both say to run, run rather than
the route count read.

**§27's six user-facing documents still need nothing — but the REASON has
expired, and that is a finding rather than a footnote.** §70, §71 and §72 each
deferred the walk on one stated condition: *no `DODO_PRODUCT_ID` is set on any
deployment the public can reach, so the card is absent for every user.*

**It is set on production now**, because that is what testing against a real
deployment requires. So `nimbleclerk.com` is currently showing **every
workspace owner** — the card is gated on `canEditSettings()`, which every owner
of every workspace passes — a **Subscribe** button pointing at a **test-mode**
checkout that cannot take their money. A control that looks like it works and
cannot is this file's standing failure shape, arrived at from configuration
rather than from code.

Nothing is at risk: test mode charges nothing, and a tester who pressed it
would get a refusal rather than a debit. What is spent is the deferral. Three
sections rested on a condition that an operator legitimately had to break to do
the thing those same sections asked for, and **none of them said that setting
the variable makes the card live for everybody.** The two honest states are
unset between test sessions, or the walk done — and the second cannot happen
until there is a price, which is §64's open decision. §7's *before live mode*
list is where that now sits.

`privacy.html` still names the provider as a recipient of personal data when
the **first real payment** runs, not when a test one does — unchanged, because
no customer's data has reached them.

Counts: Playwright **151 → 152**, Node **616** — *carried forward from §72
rather than measured, and §74 found it had been 618 by then*, smoke **51**
locally. The later
findings are documentation only, so `crmbuilder-v62` stands and the counts do
not move — checked by diffing the touched paths, per §41. **The payload read
touched `server.js`, and only a comment block**, which is why the bump still
does not move: `server.js` is not in `APP_SHELL` and nothing executable
changed. `node --check` plus `tests/payments.test.mjs` **26/26** rather than a
full run, because a comment has no blast radius (§9).


---

## 74. The duplicate gate, and a portal that is one string

Phases 0 and 1 of [`docs/SUBSCRIPTION-UX.md`](docs/SUBSCRIPTION-UX.md), which
§73's real test-mode run is what produced: six subscriptions existed on the
test account across two workspaces, and the card contradicted itself on both
`paused` and `cancelled`. Four changes plus one found while making them, one
`CACHE_VERSION` bump, no new route.

**None of it is a defect in §69–§73's code.** The money-*in* path held through
every real payload; everything here is the money-*management* half, which did
not exist.

### The gate: the key is `wsId`, and the provider has none

Pressing **Subscribe** twice bought two subscriptions, because nothing stopped
it. The obvious key is the email, and **their own blocklist documentation is
what rules it out**: *"Checkout can create a new customer record for a
returning email, so a block on a single customer ID could be bypassed."* So
the address is not a reliable identity even to them — and §73 had already
produced four emails across two workspaces by using a different one per
attempt, exactly because the checkout form asked.

`hasLiveSubscription(billing)` on the server, and `checkout` is `null` while it
is true. Three decisions inside it:

- **The TERMINAL set is what is written down** — `cancelled`, `expired`,
  `failed` — and everything else is live. A `live` list fails the other way and
  sells somebody a subscription they already hold, so an unrecognised future
  status blocks.
- **That default points the opposite way from the card's next-payment row**,
  which lists the statuses that *do* bill and suppresses anything else. Both
  are chosen the same way — the unrecognised case has to err toward not
  misleading anybody — and that is a different direction in each place. Written
  into both files, because the two read as inconsistent side by side and a
  later edit "tidying" them into one direction would break whichever it moved.
- **A record holding only a payment outcome is not a subscription.** §73's
  declined-first-payment state stores `payment.failed` with no subscription
  behind it; blocking it would leave somebody whose card was refused unable to
  try again, on the one screen where that is the entire point. Its own test,
  on a fresh workspace, because the shared one has held a subscription since
  the second test in the file.

**On the server, not in the card**, because this is entitlement rather than
presentation: a client-side hide is a client-side hide, and the link is a
plain URL anybody can keep.

**NOT ATOMIC, and accepted on instruction rather than overlooked.** It is a
read followed by a render, so two tabs can both see no subscription in the
seconds before a first webhook lands. Closing it properly needs a lock this
architecture has nowhere to put, and at this volume one duplicate to refund is
cheaper than a lock to maintain for ever. Recorded in the route, in
`docs/API.md` and in the plan as a known limit; Phase 3's reconciliation is
what catches what slips through.

**A terminal subscription gets BOTH links**, which departs from the plan's own
*"never both"*. That rule is right about the case it was written for — a live
subscriber must never see *Subscribe* — and wrong about this one: resubscribing
after cancelling is allowed, and the invoices are still in the portal, so the
alternative is a dead end for a receipt.

### The email is prefilled and locked, which reverses what was written there

`checkoutUrl` carried a comment saying *"NO CUSTOMER PREFILL, deliberately"* on
§45's rule — where an answer is not provable, ask rather than preselect.

**That holds for the address and not for the email**, and the distinction is
the whole of it: a billing address genuinely is not a sign-in address, and this
is the screen where guessing wrong costs money. An email is not a *preference*
at all here — it is the key the provider identifies a customer by. So
`email=<verified>&disableEmail=true`, from the session only and never a
parameter (§5), and nothing touches an address or a name.

**Both or neither, and the guard is not defensive tidiness.** Their docs: *"A
disable flag takes effect only when it's true and the matching field has a
value."* So `disableEmail` beside an empty `email` **silently does nothing**,
leaving a field this code appears to have locked fully editable — this file's
standing failure shape, in one query parameter. No account can have an empty
email (`upsertUser` requires one), so the guard has no reachable failure and
therefore no test; it is the same status as §52's `redactKey` and §30's
`UNSAFE_KEYS`. The *pair* is asserted, because an assertion on `disableEmail`
alone would pass against a link that locks nothing.

Parameter names read out of `docs.dodopayments.com/llms-full.txt` rather than
recalled, against their own worked example — a wrong parameter name here is
accepted by the URL and ignored by the page, which is the silent half.

### The portal is one whole URL in the environment

`DODO_PORTAL_URL`, pasted from the dashboard's *Sales → Customers → Share
Invite → Static Link*. One link closes six rows of the audit — cancel, pause,
resume, change the card, reactivate after dunning, invoices — and **none of it
is code here.**

- **Not composed from a business id.** The static link is
  `https://{test.}customer.dodopayments.com/login/{business_id}`, so building
  it means deriving a host from the mode — and §73 records exactly that class
  of derivation costing a blocked test-mode run, when `DODO_CHECKOUT_BASE` was
  described by *why it was added* rather than by *what it decides*. Pasting the
  whole thing means nothing here has to know which mode it is in.
- **The STATIC link, not the dynamic one**, because the dynamic one needs a
  `customer_id` and §70 deliberately stores no customer identity. Taken on
  instruction, and the price is one email step for the subscriber.
- **Not a credential** — customers visit it, like `DODO_PRODUCT_ID` — and it
  discloses nothing either: their note is that the sign-in page *"always shows
  the same confirmation… so the page doesn't reveal who your customers are"*,
  which is the identical-rejection discipline §13 and §16 already use here.
- **Offered only once there is a billing record.** A workspace that has never
  paid has no customer record at the provider, so the link leads to a sign-in
  page that will never email them anything — a control that looks like it works
  and cannot (§36).
- **A value that is not `https` is refused at boot and said out loud.** A
  property of the URL rather than of the moment (§38's split), and the
  alternative renders as a button that goes nowhere, which a subscriber cannot
  tell from the provider being down. **Asserted on the server's own output**,
  because the response is `null` either way: no portal and a broken portal both
  answer `portal: null`, and only the log distinguishes them — §40's
  refused-413 finding in a new place.

**Sign-in emails are NOT SENT IN TEST MODE**, so this cannot be driven end to
end on a test deployment. What is testable is that the right link reaches the
right person, which is what the tests claim and all they claim.

### The next-payment row, and the field that is not the condition

The provider keeps `next_billing_date` on the payload for `paused` and for
`cancelled` alike, so *"Status: cancelled"* sat directly above *"Next payment:
14 Nov 2026"* — read off a real subscription, not reasoned about.

`BILLING_STATUSES` is `active` and `past_due`, and everything else suppresses
the row. **Keyed on `status`, never on `paused_at`:** that field *survives* a
cancellation, which is the correction the plan had to make to its own first
reading of it — it looked like a usable "is paused" condition and the next real
payload disproved it.

**The absence is explained rather than silently dropped**, and only where there
was a date to drop: *"No payment is currently scheduled."* A row somebody saw
yesterday simply vanishing is §36's shape; a qualifier shown in every state is
§33's, where the eye learns to skip the cell the one case needs.

### A comment that had promised an assertion nobody wrote

Found while editing the card, and it is §46's trap rather than part of either
phase. The E2E test for `enabled: false` says in its own comment that the card
*"must NOT offer checkout"* — and the button block was gated on the link alone,
so the card said *"this is not the moment to subscribe"* and put a **Subscribe**
button underneath it. Nothing implemented it and nothing asserted it.

Closed in the **card** rather than on the server, and the split is deliberate:
the gate above is entitlement, so it belongs to the server; this is one line
contradicting the line above it, which is presentation. §14's rule — the client
avoids offering a button whose effect would be wrong, and the server decides.

The same change creates one new operator state: a subscriber with no portal
configured now has **no control at all**, since the checkout link is correctly
withheld from them. Said out loud, like the `enabled` warning beside it, rather
than rendered as a status with no way to act on it.

### Verified

Eleven mutations, each failing the test that names it and — for ten of the
eleven — **no other** (§9):

| Mutation | Fails |
|---|---|
| the gate removed | *a workspace already holding a live subscription is offered no checkout link* |
| nothing is terminal | the same test, **and the three link tests** — see below |
| a payment-only record counted as live | *a declined first payment is not mistaken for a live subscription* |
| no email prefill | *the checkout link carries this workspace…* and *the prefilled email is the session…* |
| the email read from the query | *the prefilled email is the session, never a parameter* |
| the portal offered regardless of a record | *the portal is offered only once there is something to manage* |
| a non-https portal URL passed through | *a portal URL that is not https is refused at boot, and says so* |
| the next-payment row never suppressed | *a paused subscription shows no next payment…* |
| the absence not explained | the same test, on the second half |
| the button block ignores `enabled` | *a deployment that cannot record a payment says so…* |
| the no-portal dead end left silent | *a subscriber with no portal is told self-service is not set up…* |

**The empty-terminal-set mutation fails four tests, and that is the documented
dependency rather than noise.** Every test that reads the checkout link has a
*precondition* now — the gate makes it null while a live subscription exists —
so each one drives a cancellation first through a `cancelNow()` helper. Stating
it is what stops a reorder of `BILLING_SUBSCRIPTION_EVENTS` turning them into a
null dereference several tests away from the change.

**And the first version of that helper failed `applied: false, reason:
'stale'`.** It picked a December date beside two other hand-picked December
dates in the new gate test. Staleness is the mechanism this entire file tests,
so hand-picking a timestamp next to another hand-picked one is the one thing not
to do in it; there is one monotonic `laterClock()` counter now.

**§60's backtick trap, again, and caught by `node --check`:** a backtick inside
an HTML comment inside a template literal closes the string, and the error named
`Unexpected identifier 'enabled'` — my own comment prose, not anything
structural.

### Blast radius

`js/app.js` is in `APP_SHELL`, so `CACHE_VERSION` → **`crmbuilder-v63`**. No
new served file, so smoke stays **51 local / 56 live predicted** — §8, this
session reaches neither host.

**`docs/API.md` gains no route and the count stays 60**, which is §46's trap for
the fifth time: the number is right and the file read correctly while a
**response shape** moved underneath it. `portal` is new, and `checkout` is now
conditional on something other than configuration — so a caller that used to
receive a link receives `null` for a reason that is not *"nothing is set up"*.
`DEPLOYMENT.md` gains `DODO_PORTAL_URL`.

**§27's six user-facing documents are deferred, and the CONDITION is restated
rather than inherited.** §73 recorded that §70–§72's reason for deferring had
expired — the product id is set on production, so the card is no longer absent
for every owner. The surviving reason is narrower and still holds: **there is
no price**, so nobody can subscribe, so no user has gained a capability to
document. The walk happens when a price is set, which is the same moment
[`docs/LAUNCH-CHECKLIST.md`](docs/LAUNCH-CHECKLIST.md) §2.1's list
fires and `MARKETING.md`'s *"No per-seat pricing. Free. No ads."* has to be
dealt with (§48, §64). `privacy.html` likewise: the provider is named as a
recipient of personal data when the **first real payment** runs.

Counts: Node **618 → 623**, Playwright **152 → 154**, smoke **51** locally —
all three run, and the first is a correction: §2 said **616** and the real
figure before this commit was 618, because §73 reprinted §72's measured 616 on
a Counts line while saying it had not run the full suite. The five tests added
here are confirmed by the static `test(` declarations across `tests/` moving
by exactly five between the two commits, so the shortfall predates this work.
**Predicting 621 from a stale number and then measuring 623 is the whole
argument for §9's *"state what was actually run"*** — the prediction went into
the commit message *marked as a prediction*, which is the only reason it reads
as a correction here rather than as a count nobody will question.

**Playwright 154 of 154 does not retire §66's intermittent.** It did not fire;
§71's occurrence stands and nothing here touches that path.


---

## 75. The verdict now names what it audited

One line of output, and it is here because of what its absence cost: a live
audit was read as a local one, the count was taken for a regression, and the
fix proposed from that reading was to a line of workflow YAML that was correct.

### One run prints the sentence twice, and the misleading one comes last

`tests/smoke.mjs` ended with the bare `Deployment is healthy.` A dispatch run
executes **both** smoke steps, and the local one finishes *later* because the
E2E suite runs ahead of it:

| Step | Finished | Printed |
|---|---|---|
| Smoke test the live deployment | 15:55:05 | `56 passed` |
| Smoke test the local build | 16:01:25 | `51 passed` |

So scrolling to the bottom of a green run lands on **51**, under a sentence
that reads as the deployment's verdict. The header does print `target: <BASE>`
— dimmed, five hundred lines up, which is not where anybody looks after a
seven-minute run.

That is §33's two-adjacent-unlabelled-numbers failure in the one tool whose
entire job is telling you whether the deployment is fine, and §46 had already
written the figures down without noticing that nothing on screen distinguishes
them.

### What changed, and what deliberately did not

The base goes on the summary **and** on the verdict, undimmed, with
`— local build, not a deployment` appended when `isLocal`. Nothing else moves:
no check is added or removed, and the local count is still 51.

**The phrases `is healthy` and `is NOT healthy` survive as substrings**, which
is why the base is a prefix rather than a rewording. This file quotes both when
recording past runs — §38's smoke-budget finding and §63's double-slash finding
among them — so a grep for either still lands on them and on this.

**The workflow was NOT touched**, and that is the finding rather than the
omission. The reported cause was `${{ inputs.live_url || vars.LIVE_URL ||
'https://nimbleclerk.com' }}` resolving a blank dispatch input to something
empty. It does not: GitHub Actions `||` returns the first **truthy** operand and
the empty string is falsy, so a blank input coalesces to the variable and, with
that deleted, to the literal. Proven rather than argued — run #225's live job
reported `storage backend mongodb`, `HTTPS yes` and `HSTS in production`, none
of which a localhost file-store run can produce.

**So the fix was to the reporting, not to the resolution.** Editing that
expression would have been §30's category: changing correct code because a
reading of a symptom named the wrong mechanism.

### Verified by driving all three branches

§9, and the third one is the one that matters at 2am:

| `BASE_URL` | Prints |
|---|---|
| `http://localhost:8321` | `target http://localhost:8321 — local build, not a deployment` · `… is healthy.` |
| `http://0.0.0.0:8321` (same server, non-local base) | `target http://0.0.0.0:8321`, no suffix |
| a port with nothing listening | `http://127.0.0.2:8399 is NOT healthy.` |

**And the middle one re-derived §46's arithmetic from the other side**, which
was not the point of the run and is the most useful thing in it. Auditing the
*same* local server through a non-local base turns exactly five checks from
absent-or-informational into real ones — `HSTS in production`, `storage
backend`, `sign-in method`, `dev login is off in production`, `HTTPS` — and
they come back as five warnings beside the unchanged 51. That is 51 + 5 = 56,
measured, against a figure §46 arrived at by diffing two runs. The five are the
five it named.

### Blast radius

`tests/smoke.mjs` only — not a served file, not in `APP_SHELL`, so
`CACHE_VERSION` stays **`crmbuilder-v63`** (checked, not assumed). No route, no
wire shape, so `docs/API.md` needs nothing by §46's own check. §27's six
user-facing documents need nothing: no capability moved, and `ONBOARDING.md`'s
*"Deployment is live and healthy"* line is its own prose rather than a quote of
this output — checked rather than skipped.

Counts: smoke **51 local / 56 live**, both run. Node and Playwright untouched
and not re-run, because a `console.log` in a file nothing imports has no blast
radius (§9) — `node --check` plus the three runs above is the coverage this
earns.


---

## 76. The card said what was wrong and never what to do, and a guarantee had stopped being testable

Phase 1.5 of [`docs/SUBSCRIPTION-UX.md`](docs/SUBSCRIPTION-UX.md) — a phase
that document did not contain, and which is the tail of its own §1 transparency
row rather than a new idea. §1 graded transparency **poor** for two reasons:
the card contradicted itself, and there were no invoices. §74 fixed the first
and delegated the second to the portal. Neither touched the third thing §1 did
not separate out: **the card was honest about state and silent about action**,
and it printed the provider's own `past_due` and `on_hold` at a customer.

**Done now because §74 is what made it possible.** Advice is only worth giving
if there is somewhere to act on it, and until the portal link existed a
customer told their payment had failed had nowhere to go. In this order the
dependency is visible; the other way round it would have been wording on a
dead end.

### The status row carries a label, and the unrecognised case is the test

`STATUS_LABELS` maps the provider's vocabulary to words somebody can act on —
`past_due` → *Payment overdue*, `on_hold` → *On hold*, and `failed` →
**Never started** rather than "Failed", because that status is a first payment
having been declined, so the subscription never existed.

**An unrecognised status falls through to the raw word and gets no advice**,
which is the same direction every other default in this area points (§74): the
unrecognised case errs toward not misleading anybody.

§73 is the standing warning here, and it is worth saying why it does not
apply. That section refused to map `error_code` to customer-facing text because
**one sample is not a vocabulary** — a map built from one observed value ships
with one correct entry and a fallback that fires on everything real. These are
different: they are the **tails of `BILLING_SUBSCRIPTION_EVENTS`**, read from
the provider's own documentation, plus `pending`, which §73 read off the
dashboard. An enumeration, not a sighting.

The risk is therefore not today's words but tomorrow's, so that is what has a
test. *"a status we do not recognise shows the provider word, and invents no
advice"* drives `grace_period_extended` and requires the raw string, no advice,
and — the half worth having — **`#portal-go` visible with `#checkout-go`
absent**, which is the server's opposite default (§74) observed from the client
for the first time. A `|| 'Unknown'` fallback fails it by name, which is the
placeholder §73 deleted from this very card once already.

### A request is not a state, and it needed no new field

`subscription.update_payment_method` was **ticked on the endpoint and discarded
by the route** — answered `{received:true, ignored:'unsubscribed event'}` — and
it is the warning *before* a `past_due`. So the first a customer knew about a
card the provider could not charge was losing access.

**The subscription stays `active` while it is pending**, which is the whole
point of handling it: the notice has to sit *beside* a healthy status rather
than replace it. That is why it is not in `STATUS_LABELS` and reads off
`subscriptionEvent` instead.

**NO STORED FLAG, and that is the design rather than a shortcut.** A
`needsPaymentMethod` has to be cleared by something, and the only honest
clearer is a later *payment* succeeding — which lives on the **other clock**,
so clearing across the two would reintroduce exactly the competition §70's
two-clock split exists to prevent. Deriving the notice from `subscriptionEvent`
gets it for free: that field is already newest-wins, so any later subscription
event retires the notice through machinery that already exists and is already
tested.

**The cost is stated rather than discovered.** If the provider emits nothing
when a card is updated, the notice outlives the fix until the next subscription
event. So it is worded as a request carrying §51's disregard clause — *"if you
have already done it, you can ignore this"* — which is the same sentence that
section put on a payment chaser, for the same reason: a notice that might be
stale has to say so, or it reads as a demand somebody has already met.

**The second half of its test is the test.** Without a later delivery, an
implementation that stored the request and never let go of it would pass just
as happily. There is no single-line mutation that breaks only that half — it is
guarded by the same write every other event uses — and that is said plainly
rather than counted as a mutation that was run.

### A third reading of a payment-only record

`payment.processing` is a debit in flight. The card had two readings — refused,
or recorded — so an in-flight one fell to the catch-all, *"a payment was
recorded"*, which overstates what has happened on the one screen where the
difference is the customer's money.

Not a millisecond edge: **an India-issued card on an RBI mandate sits there for
real time** (§73), which is also why the wording says mandates take a few
minutes rather than implying something is wrong.

**For a workspace that already has a live subscription it changes nothing
visible, and that is correct** — an in-flight renewal on an active subscription
is not news. Said out loud in the code, because *"I subscribed to an event and
nothing appeared"* reads as a mistake later (§46's rule about a check that adds
coverage without moving a number).

### The advice line sits after the absence it explains

`nothingDue` says why the next-payment row is gone; the advice says what to do
about why. On an `on_hold` record the pair reads as a sequence rather than a
contradiction — nothing is scheduled, and here is what restarts it.

**Only where there is something to do and the owner might not know it** —
`past_due`, `on_hold`, `failed`, `pending`, and the request above. `active`,
`paused`, `cancelled` and `expired` say nothing, because nothing is wrong or
the Subscribe button beside it already says the only thing there is to say.
§33's rule: a line shown in every state teaches the eye to skip the one case
that needed it, and the existing-subscription test now asserts its **absence**
for exactly that reason.

**The advice points at the button already on the card** rather than minting a
second link to the same place, and the pointer is gated on `state.portal` — a
deployment with no `DODO_PORTAL_URL` must not be told to press a button that is
not there, and §74's no-portal notice already covers that case.

### The finding: a guarantee that had stopped being testable, twice over

Worth more than the feature. *"no customer identity is stored, even when the
payload carries it"* guards §70's rule, which exists because
`workspaces[].meta` **is** the `data` collection (§17) and therefore lands in
every nightly artifact, downloadable by anyone with read access to the private
repo. It was passing and could not fail:

1. **It delivered a hand-picked October date**, and §73's derived-events loop
   had already landed November ones — so the delivery was dropped as **stale**
   and the record was never written at all. The dump had nothing to find.
2. **It then searched `GET /api/org/billing`**, which is `publicBilling()` — a
   **whitelist**. A leaked field cannot appear in that response by
   construction, so the assertion could never have failed however much identity
   the server stored.

**Measured, not reasoned about, and the second fault only surfaced because the
first fix did not help.** With `customerEmail` and `customerName` added to
`billingFieldsFor`, it passed; after giving it a fresh clock, it *still*
passed — which is what named the projection problem. Only then did it fail.

**The admin export is the instrument now**, because it is literally the
artifact the rule is about rather than a projection of it, and the assertion
searches the whole serialised record rather than named fields (§38's rule). The
delivery asserts `applied: true` **first**, so a future reordering that makes
it stale again fails there and says so instead of going quietly green.

The general shape, and it is this file's standing one from a new angle: **a
test that reads a whitelisted projection cannot see a leak into the thing
behind it.** Both of §30's and §38's leak assertions search a whole response
for that reason; this one searched a whole response that had been filtered
first.

### `laterClock()` moved up, because two sections share it

§74 declared it inside the gate section. It is hoisted, so calling it from
earlier worked — and a helper used 150 lines above its declaration is the kind
of thing that gets duplicated by the next reader, which is how §74's own
stale-clock failure happened. One counter, declared before its first use, with
the December reasoning kept on it.

### Verified

Six mutations, each failing the test that names it (§9):

| Mutation | Fails |
|---|---|
| `subscription.update_payment_method` out of the set | *a request for a new payment method is recorded…*, and the derived-event floor |
| `payment.processing` out of the set | *a payment in flight is recorded as its own event…* |
| the advice line dropped | *an overdue payment says what to do about it…* and *a request for a new card is shown beside a live subscription…*, and **no others** |
| the raw provider word back in the status row | **five** — the label is shared surface |
| `|| 'Unknown'` for an unrecognised status | *a status we do not recognise…* |
| the in-flight arm collapsed into the catch-all | *a first payment still in flight is not reported as money received* |
| **identity stored by `billingFieldsFor`** | *no customer identity is stored…* — **and it did not, before this commit repaired it** |

### Blast radius

`js/app.js` is in `APP_SHELL`, so `CACHE_VERSION` → **`crmbuilder-v64`**. No
new served file, so smoke stays **51 local / 56 live** — and running it is what
proves that (§9).

Full runs, because `js/app.js` and `CACHE_VERSION` are shared surface: Node
**623 → 625** (three consecutive clean runs), Playwright **154 → 158**, smoke
**51** locally. **One run of five had a single failure whose name was not
captured** — only the tail was kept — and three subsequent full runs were
clean. Recorded rather than dismissed and rather than inflated: §66's
intermittent is the standing candidate, and the honest claim is that it is
unidentified.

`docs/API.md` gains a line and **no route** — §46's trap for the sixth time:
the count is right and the file reads correctly while two **value domains**
widened, so a caller switching on `subscriptionEvent` or `paymentEvent` sees a
value it has not seen before.

**§27's six user-facing documents are still deferred, on the condition §74
restated rather than the one §70–§72 used.** Checked rather than skipped: not
one of them mentions subscriptions at all, because **there is no price**, so
nobody can subscribe and no user has gained a capability to document. The walk
happens when a price is set, which is the same moment
[`docs/LAUNCH-CHECKLIST.md`](docs/LAUNCH-CHECKLIST.md) §2.1's list
fires. `privacy.html` likewise.

### The production test-mode button, decided rather than left

§73 and §74 both record `DODO_PRODUCT_ID` being set on production in **test
mode**, so every workspace owner sees a Subscribe button that cannot take their
money — and §73 named two honest states: unset it between sessions, or do the
doc walk, which needs a price.

**Left as it is, on instruction, and the reason is what makes it defensible
rather than the shrug it would otherwise be:** signups are closed and will not
open until the controls are in place, so the only accounts that can reach the
card are ones the operator controls. That is a third honest state, and it is
bounded by a decision rather than by nobody having looked. It stops being
defensible the moment signups open, which is where
[`docs/PAYMENTS.md`](docs/PAYMENTS.md) §7's *before live mode* list already has
it.


---

## 77. The product is Nimble Clerk, and three identifiers that must NOT follow it

§58 left this open — *"renaming is a real decision that touches the manifest,
`terms.html`, `TERMS_VERSION` (§41), every document and the app itself"* — and
it was right that it is a decision rather than a find-and-replace. **84
occurrences, not the 29 I first reported**: `grep -c` counts matching *lines*,
and `server.js:2735` carries two on one line. A count that reads as an
occurrence count and is a line count is §33's shape in a measuring tool.

### The three that stay `crmbuilder`, and each would fail silently

This is the whole reason a blanket replace was wrong.

| Identifier | What a rename would do |
|---|---|
| **`payload.app === 'crmbuilder'`** (`js/app.js`, `scripts/restore.mjs`) | a **format sentinel written inside every backup file anybody already holds**. Renaming it stops every existing export importing — completely, and during a recovery, which is the one moment that cannot absorb it |
| **`MONGODB_DB \|\| 'crmbuilder'`** (`server.js` ×2, `restore.mjs`) | the **database name**. A deployment that does not set `MONGODB_DB` — the documented default — comes up against an empty database: a working app over no data, nothing in the log. §34 records that exact trap costing an afternoon on the seed fixture |
| **`CACHE_VERSION = 'crmbuilder-vNN'`** (`sw.js`) | a cache key nobody sees but devtools. `activate` evicts every key that is not the current one, so renaming the prefix evicts exactly what bumping the number already evicts — while making every `crmbuilder-vNN` reference in this file read as a different scheme |

The shared property is worth naming: **an internal identifier that happens to
contain the old product name is not a product-name occurrence.** The first two
are load-bearing on data that already exists outside the repository; the third
is pure churn. All three carry a comment at the site saying so, because the
next reader tidying for consistency is exactly who breaks them.

The *messages* beside the first two are renamed, which is why those two words
now sit on **opposite sides of one comparison** — `payload.app !== 'crmbuilder'`
raising *"not a Nimble Clerk backup"*. That reads like a bug and is the fix.

### The pair that had to move together, proven rather than assumed

`docs/manual.html`'s `<title>` is asserted as **live page content** by
`tests/smoke.mjs:492` (§47's reachability check) and again by
`tests/e2e.spec.js:4050`. Move the page without the assertions and the live
audit goes red; move the assertions without the page and they pass on a title
nobody serves.

Driven rather than reasoned about: renaming the title alone gives
**`50 passed · 1 failed`** and `✗ the shareable pages are reachable —
/docs/manual.html (served something else)`. The check names the page, which is
what makes it survivable.

### A grep that reports "binary file matches" and prints no line

`scripts/inspect.mjs` contains **one NUL byte** — deliberate, a composite
`Map`-key separator (`` `${orgId}\x00${dead|live}` ``), so two orgs cannot
collide on a concatenation. Not corruption, and it is left alone.

The consequence is for the *verification* step, not the code: `file` calls that
script `data`, and **`grep -rn` prints `Binary file … matches` with no line
number** — so a post-rename sweep can report a match it cannot locate, or a
careless `grep -l` sweep can be read as clean. The rename ran through Python on
**bytes** for that reason, and the final sweep used `grep -ran`. §73's lesson
in a new place: a derivation that is wrong in the same direction as the thing
it replaced looks authoritative.

### What was left saying the old name, on purpose

Five occurrences survive and every one is a record rather than a reference:

- **`CLAUDE.md:5816`** quotes what a poisoned page *actually rendered*
  (`"CRM Builder Dashboard"`) during §47's probe. Renaming an observation
  falsifies it.
- **§58's own paragraph**, struck through in place with the resolution beside
  it (§46's treatment) rather than rewritten — its *list* was the useful part,
  and it was incomplete in one way worth knowing: the wordmark is in **four**
  places in `welcome.html`, not one.
- **§63's docs-walk table** (×2) records the link text *as §63 left it*.
  Rewriting it would claim §63 renamed something it did not.
- **`docs/archive/UK-LAUNCH.md`** — the frozen tier (§29). Not touched.

### One product decision I made and am flagging rather than burying

`js/app.js:1488` and `index.html:24,29` are **not the product name**: they are
the fallback for `SETTINGS.businessName`, so the sidebar shows the
*customer's* business and ours appears only when they have not named one. It
now reads **Nimble Clerk**, which is the consistent reading of "fix the stale
name" — but putting our brand where their business name goes is a different
choice from a page title, and **"My workspace" is arguably the better
fallback.** ~~Changing it is one string in two files.~~

> **Decided: "My workspace" (2026-10-17), and it was FOUR strings in two
> files, not one in two.** `index.html` ships the fallback twice as the
> pre-paint value and `js/app.js` applies it twice on render, so all four move
> together or the sidebar flickers from one to the other on a cold load — which
> §3's paint-first invariant makes a visible frame rather than a theoretical
> one. Same undercount as the rename's own "29 occurrences" (above): a count
> taken from where the decision *is* rather than from where the string is.
>
> **And the path was untested on 158 tests**, which is why this was worth more
> than a string swap. `onboard()` always fills a business name, so every test
> saw a named workspace and the fallback was unguarded — on two ordinary
> paths: the onboarding name field can simply be left blank (it is `.trim()`ed
> to `''`), and discarding sample data resets the seeded name to `''`. §60's
> finding in a new place: **an untested path does not have to be new to be
> wrong.**
>
> **The first version of the regression test passed on half the bug.** It read
> the pre-paint value off the *rendered page*, and `toHaveText` auto-retries —
> so it polled after `app.js` had already overwritten the static string and was
> asserting the same render as the assertion at the foot. Measured, not
> reasoned: reverting `index.html` alone left it **green**. It reads the served
> markup over HTTP now (`page.request.get('/app')`), and each file's mutation
> fails on its own half. §9's rule, earned again — and §34's shape, a test
> agreeing with itself.
>
> **Verified**: Playwright **159/159 in 7.9m**, which is the full run
> `CACHE_VERSION` earns as shared surface (§9) and which also measures the
> suite's new total; the `boot` describe 6/6; both mutations failing by name;
> smoke **51 local**. Node not re-run and not claimed — nothing server-side
> moved. **The clean run retires none of the three intermittents** (§2):
> none fired, which is the same non-result §71 recorded.

### Verified

Node **625/625**, smoke **51 local** — both unchanged, which is the point: a
rename should move no count. Playwright is the one that needs stating
honestly.

**Two full runs, and a different test failed in each:**

| Run | Failed |
|---|---|
| 1 (8.5m) | *an owner invites, and the colleague joins* · *the reminder count is the number the due-date filter shows* |
| 2 (7.6m) | *signing out hides the workspace* — and **both of run 1's passed** |

**A different test each run, all passing in isolation, is §32's signature** —
and §32's cause is not available: `data/e2e` is cleared per run (120K before,
596K after), and the timings are not monotonic (8.5 then 7.6, against §76's
6.3). Two of the three are already recorded intermittents — §66's sign-out at
1-in-3 and §54's invite journey at 2-in-4. The **reminder parity** test is a
*new* member of that family and is recorded as one here; §55 had it failing
only for a real bug, since fixed and pinned.

**What can be said about causation, and what cannot.** The rename substitutes
strings in titles, copy and comments and touches no control flow; every
failure was *element not found* on a record row or a filter control, with no
product string in any assertion; and the one behavioural change — the
`businessName` fallback — was not even in play, since the failing snapshot
showed the workspace's own name, *Lumen Studio*. Isolation runs with and
without the rename both pass, so **isolation does not discriminate here and
proving innocence would take many more full runs than this change is worth.**
That is the honest state rather than a clean bill.

The suite is slower than §76 measured (7.6–8.5m against 6.3m) with no tests
added. Not monotonic, so not §32, and string substitution cannot cause it —
container load is the likely reading and it is recorded rather than
investigated.

### Blast radius

`index.html`, `js/app.js`, `css/style.css`, `manifest.webmanifest` and `sw.js`
are all in `APP_SHELL`, so `CACHE_VERSION` → **`crmbuilder-v65`** (prefix
deliberately unchanged, above). No new served file, so smoke stays **51 local /
56 live**.

**`manifest.webmanifest`'s `name` and `short_name` label the INSTALLED app**,
and an existing install keeps the old label until it is reinstalled — free
today because there are no users, which is §63's argument for doing structural
work now rather than at the announcement.

**§27's walk is the one thing this does NOT complete.** `terms.html` and
`privacy.html` have the product renamed in their titles, back links and
footers — but `terms.html` still scopes itself to *"the free beta at this
address"* and still says data loss is possible, which is **pricing** prose and
belongs to the commit that sets a price, together with the `TERMS_VERSION`
bump that re-prompts everybody (§41). Renaming that framing now would be two
half-changes to one paragraph. `docs/API.md` needs nothing: no route, no wire
shape.


---

## 78. The billing lever, and a 30-second cache that has now eaten three buttons

Phase 2 item 1 of [`docs/SUBSCRIPTION-UX.md`](docs/SUBSCRIPTION-UX.md): the
third operator lever, beside `signupMode` and `orgCreation`. **Nothing is
enforced and nothing charges** — flipping to `paid` changes no behaviour at
all, because the checks that will read it are items 2–5. That is the point of
building it first: every later item needs the switch *and* the date it was
flipped, and neither existed.

**The legal premise is verified rather than assumed, which is what unblocked
this.** The MSA (dated 2026-02-26, read 2026-10-17) appoints the provider
reseller and Merchant of Record and puts global VAT/Sales Tax on them —
[`docs/PAYMENTS.md`](docs/PAYMENTS.md) §2 has the sections, and §8's row is the
only one in that table that has ever closed. **One row, not the table**: the
fee, the chargeback set-off and the FX into INR are still unread, so nothing
here can be sized against a margin.

### Two departures from the template, both forced by a consumer it does not have

`signupMode()` and `orgCreation()` (`server.js:108–175`) are the pattern, and
copying them exactly would have been wrong twice:

- **It returns `{ mode, setAt }`, not a string.** Those two readers discard the
  provenance because nothing asks when the decision was taken. The
  grandfathering cutoff asks on **every enforcement check** — *"was this
  workspace already here when the switch was flipped"* is a comparison against
  `billingModeSetAt` — so the alternative is a second read of the same document
  on a per-request path.
- **The cache guard tests the entry's own timestamp**, not the truthiness of
  what it holds. Both existing readers do `if (cache.value && …)`, which is
  correct for a non-empty string and wrong for an object whose interesting
  field may legitimately be `0`.

  **That one has no failing test, and saying so is the point.** An object is
  always truthy once set, so the two guards behave identically *today* —
  measured, not assumed. It is the same status as §52's `redactKey` and §30's
  `UNSAFE_KEYS`: a guarantee made local rather than emergent, so the next
  person who makes `value` a bare string again does not get a cache that
  silently never caches.

### The default is load-bearing in the opposite direction from its sibling

`signupMode()`'s `catch` carries the rule in its own words — *"a settings read
must never be what stops people signing in"* — and the mirror image is what
decides this one: **a settings read must never be what starts a charge.** So
the catch returns the deployment default, and the default cannot be `paid`.

An unrecognised value falls to `free` from **both** directions — a stored one
and `BILLING_MODE` alike — so this lever can never report a mode nobody chose.
`signupMode` defaults to `code` because a wrong guess there refuses a signup,
which is visible and recoverable; a wrong guess here either charges people who
were promised free or silently stops charging people who agreed to pay, and
both are invisible from inside the deployment.

### The defect the test found, and it is the third time

The panel body is cached 30s because `usageByOrg()` scans (§24, §33), and it
carries this value — so `setBillingMode` invalidating its *own* cache was not
enough. An operator flips the switch, re-reads the panel, sees the old mode and
concludes the button did nothing.

**§24 records this for suspend/resume and §40 for dismissing the restore
notice.** Both say it in almost these words — §40's is *"or the panel goes on
showing the line for another 30 seconds and the button reads as having done
nothing"* — and I walked into it anyway, which is worth recording as a property
of the cache rather than of the reader: **anything written that the panel also
displays needs `platformCache` invalidated at the write site**, and nothing
structural enforces it.

What caught it is the shape of the assertion rather than diligence: the test
reads the live value back **through `/api/admin/platform`** instead of
asserting the writer returned 200. A test that checked the response would have
passed on the bug, which is §9's rule and §71's `pending`-note gap in a new
place.

### `OPERATOR_DECISIONS`, and the money going both ways

One string in `scripts/restore.mjs` (§17's list, which is **not** in
`server.js`). The failure it prevents is worse than the signup one it sits
beside: a restore that dropped `billingMode` reverts a paying deployment to
`free`, where every enforcement check reads the default — so **nobody is
suspended, nobody is billed, nothing errors, and the only symptom is that
revenue stopped.** §17's no-op-that-reports-success with money attached.

And `billingModeSetAt` is not merely provenance here. The grandfather cutoff is
computed against it, so keeping the value and losing the stamp would **re-date
every workspace's free window to whenever the recovery happened** — every
tenant newly grandfathered, silently. That is asserted on its own rather than
folded into the existing provenance loop, because it is a different failure
with a different blast radius.

**The same reasoning applies to a restart**, which is why the persistence test
asserts the stamp is the *same* one rather than merely present: a reader that
re-stamped on read would push every window forward by the uptime, so on a free
tier that spins down daily the window would never expire at all. The mutation
for that fails by name.

### §29's lesson arriving in the fixture rather than the code

`tests/backup.test.mjs` had `['signupMode', 'orgCreation']` **typed by hand in
two assertions** and the three keys of each seeded by hand in a third place —
while `restore.mjs` beside it derives its allow-list from one array precisely
so *"a third lever added later is one string here, not three"*. The code had
learned the lesson and the test had not, which is the direction that hurts:
the copy that goes stale is the assertion, and a stale assertion passes.

One `LEVERS` constant, with `LEVER_KEYS` derived from it. **Deliberately not
imported from `restore.mjs`** — §69's rule for the signing fixture: a test that
shares its list with the thing it tests cannot disagree with it, so the two
would agree wrongly and every assertion in the file would pass.

### Verified

Five mutations, each failing the test that names it (§9):

| Mutation | Fails |
|---|---|
| default `'paid'` | **3 of 4** — the default, the env-follow and the guard test all read it |
| the env var wins over the stored decision | *a billing decision survives a restart…* |
| `setAt` re-stamped on read | the same test, on the stamp rather than the mode |
| `platformCache` not invalidated | *a deployment that has never set one is free…* — **this is how the defect above was found** |
| `billingMode` out of `OPERATOR_DECISIONS` | **2** backup tests, by name |

A sixth is honest about itself: the cache-guard change has **no** failing test,
for the reason given above.

**Counts:** Node **638/638, 0 skipped** (625 → 630 on item 1, → 633 on item 2,
→ 638 on item 3), Playwright **161/161 in 8.2m** (159 → 161 on item 3), smoke
**51 local** — all three run on `c9efdf4`, which is the commit item 3's own
message declined to claim them for. §9's rule working as written: the message
said the run was in flight and did not print a number, and the number arrived
afterwards.

**Playwright was measured on item 1 and not re-run for item 2**, which changed
`server.js` and one test file and **no client or served file** — so no E2E
assertion can see it, and the one that reads `/api/admin/platform` (§33) reads
keys that were added rather than moved. Stated rather than implied, because an
unchanged count is otherwise indistinguishable from an unchanged claim (§73).
Item 3 touched `js/app.js` and `css/style.css`, so it earned the full run.

**And that run is what breaks the "structurally unrelated" claim above for
item 3 only.** Items 1 and 2 contained no client or served file, so §66's
intermittent had no path to them — stronger than §77, which had to concede
that isolation does not discriminate. Item 3 adds an admin card and CSS, so it
does not get that exoneration. What it gets instead is the ordinary one: 161 of
161 passed, including the sign-out journey.

**The one failure is §66's intermittent and the exoneration here is stronger
than §77's.** Same test — *signing out hides the workspace* — and the artifact
carries §66's own recorded signature: `heading "Settings"` still rendered after
the navigation, with `No modules yet` and `Sign in to sync` beneath it.
Measured afterwards at **1 fail then 4 passes in isolation**, so it is not
newly deterministic.

§77 had to admit that *"isolation does not discriminate here"*, because a
rename touches strings the app renders. This commit cannot be the cause at
all: **neither of its two commits contains a client or served file** — checked
with `git diff --name-only`, not asserted — so a client-side sign-out race has
no path to it. That is the difference between *probably unrelated* and
*structurally unrelated*, and it is worth the sentence because the next clean
run will not retire the test either (§2).

### Blast radius

`server.js`, `scripts/restore.mjs` and two test files. **No client file, no
served file**, so `CACHE_VERSION` stays `crmbuilder-v66` and smoke stays
**51 local / 56 live** — checked against the diff rather than assumed (§41).

`docs/API.md` gains the route and the count moves **60 → 61**, counted with
`grep -cE "^app\.(get|post|put|patch|delete)\(" server.js` rather than
incremented by hand. It also gains the `billing: { mode, setAt }` shape on
`/api/admin/platform`, including the rule that `setAt` is **`0` rather than
absent** on a deployment that never flipped the switch — §10's
`Number(x) || now` trap, which a caller comparing an absent value against a
timestamp would hit as NaN-shaped silence. `DEPLOYMENT.md` gains `BILLING_MODE`
with the precedence note, because the variable is the *default* and not the
live value, and a reader looking there for what the deployment is doing is
looking in the wrong place.

**§27's six user-facing documents need nothing, and the condition is finally a
clean one.** Not *"there is no price"* — there is one — but **nothing is
enforced and nothing can be bought**: the lever changes no behaviour, and
`billingMode` is `free` on every deployment. The walk happens when enforcement
lands, which is the same commit that makes
[`docs/LAUNCH-CHECKLIST.md`](docs/LAUNCH-CHECKLIST.md) §2.1's list
fire and bumps `TERMS_VERSION`.

### Item 2: two holds, because one field fails silently

The conflation §24 stage B left open: `suspendedAt` is an **operator** lever
with a typed reason, and billing needs the same read-only behaviour. Settled as
**a separate field** — `billingSuspendedAt` — on instruction, and the reason
the two options are not equivalent is that **they fail in different
directions**:

| | Cost |
|---|---|
| separate field | an operator reads two values to know why a workspace is read-only. A mistake is **visible** |
| a reason tag on the one field | one field, but a billing resume clears a storage pause **silently** unless every caller checks the tag |

§24's own rule is that suspension is *reversible and customer-visible*, and a
tag makes the reversal depend on a check somebody can forget. The write sites
each touch only their own keys, so the independence is structural rather than
remembered.

**The operator reason wins when both are set, and that was not obvious going
in.** A billing hold has an action the customer can take; an operator hold does
not. So naming the billing cause while a storage pause is also in force tells
somebody to pay and leaves them read-only afterwards — **money taken, nothing
restored**, which is the worst outcome available here and a dispute that is
entirely ours (§3). Lifting the operator hold then reveals the billing one,
which is correct: they were always two reasons, and the customer now sees the
one they can act on.

**One `readOnlyState(org)`**, so the sync seam and the panel cannot disagree.
It returns `null` for a writable workspace rather than a flag, so a caller
reads a hold rather than comparing two timestamps itself — which is what stops
the next reader checking one field and not the other.

**The billing message is ours to word once**, unlike the operator's typed
string: nobody types it per workspace, and it is the only read-only message
that has to say what is still *possible*. It names the cause, that nothing is
deleted, and that local use and export continue (§5, §36) — a message naming
only what stopped would be accurate and would read as data loss. The test
asserts all three clauses, because the wording **is** the behaviour on this
one.

**The panel reports two fields and two counts.** An operator reading *"3
paused"* needs to know how many they did, because that is the number they can
act on and the other resolves itself when somebody pays. One total would be
§33's conflated figure — correct, adjacent, and useless for deciding anything.
The counts **can overlap** and deliberately do not sum.

**Nothing writes `billingSuspendedAt` yet.** Item 3's cutoff is what will, so
this landed with no behaviour change — same as item 1, and the same reason:
the read path is what the later items depend on, and the decision is in the
precedence rather than in the plumbing.

**Planted directly in the test, which needed a new helper.** `editStore()` on
the boot harness stops the server, edits `store.json` and starts it again —
FileStore keeps the whole store in memory and rewrites the file on every save,
so an edit under a running server is clobbered by its next write (§12), which
is exactly what `moveToOrg()` in `api.test.mjs` already does.

#### Verified

Four mutations, each failing by name (§9):

| Mutation | Fails |
|---|---|
| the billing hold is not read at all | **2** — *a billing hold pauses writes on its own* and the conflation test |
| billing checked **first**, so its reason wins | the conflation test, on the with-both-holds assertion |
| the operator resume also clears `billingSuspendedAt` | the conflation test, on the after-resume assertion |
| one conflated `suspendedOrgs` count | *the panel reports the two holds separately* |

The middle two both fail the same test, which is **expected rather than
sloppy**: that test asserts both halves of the conflation — which reason shows
while both hold, and that lifting one does not lift the other — so a mutation
to either half fails it on its own assertion. A reader checking the mutation
table should expect one failure per *assertion*, not one per test.

### Item 3: the cutoff, and a column that would have been empty where it matters

12 months and 30 days, decided on instruction, and **operator settings rather
than constants** — restored with their provenance (§17), because the figures
are a commercial choice and changing one must not need a deploy. The two
defaults are in the code and are what an unset or unreadable value falls back
to; a NaN would otherwise land every window on the epoch.

**No new date helper was needed, and that was measured rather than assumed.**
`DateRules.monthsAgo(now, -12)` is twelve months **forward**: the clamp that
stops 31 August minus six months landing on 2 March (§44) is
direction-agnostic. Driven both ways before it was relied on — 31 Jan +1 → 28
Feb, 29 Feb +12 → 28 Feb, 31 Aug +6 → 28 Feb. The name reads oddly at the call
site, which is why the comment says so rather than leaving a reader to wonder
whether it is a bug.

### The dry run, which is the whole reason the screen is worth having

**The honest version of this feature nearly shipped blank.**
`billingGraceUntil` returns `null` when `billingMode` has never been
flipped — correct, and it is what makes the computation safe to ship before
enforcement — so a column fed straight from it is **empty on every deployment
that has not started charging, which is every deployment.** The screen whose
entire job is *look before you flip* would have had nothing on it until after
the flip.

So the panel computes against `now` when there is no switch date, and carries
**`graceIsPreview`** beside it. That answers the question an operator actually
has — *if I flipped it today, who would be affected and when* — and the flag
is what stops a date reading as a commitment. Two fields rather than one
nullable date, because a date with no idea whether it is real is §33's figure
that is correct, adjacent and undecidable.

**`pastGrace` is the number to look at, and zero is what the floor buys.** A
non-zero means somebody would lose sync with less than the promised notice,
which is the one outcome the floor exists to prevent — so the card says it in
words and the *Switch to Paid* confirmation repeats the count, because §21's
rule is that a destructive control names its cost first.

### Traps

- **§27's invented-class trap, caught by grepping rather than by rendering.**
  `.note.warn` was what I reached for; `css/style.css` has **no `.note` base
  class at all** and the only amber box is `.note-restore`. An undefined class
  renders as an unstyled paragraph that looks deliberate — which is how
  `.note.warn` shipped meaning nothing in the first place, as that file's own
  comment records. The restore notice and this warning are the same thing
  visually, so they share one rule rather than getting a second copy of six
  declarations (§29).
- **`DAY_MS` was already declared**, 220 lines up. `node --check` caught it,
  which is the good case; the bad one is a second constant with a different
  value.
- **`DateRules` is required further down the file than the function that uses
  it.** Safe, because a `const`'s dead zone ends when the declaration runs and
  every caller here is a request handler — the same shape `platformCache`
  already has, and it reads as a bug both times, so it is now written down.
- **`.records-table thead` matches two tables** — Organisations and Accounts.
  §14's `.toast` trap in a new place, and it fails strict mode rather than
  asserting the wrong thing, which is the better of the two failures and still
  not an assertion. Scope to the card.
- **The exemption is stored as the END of the named day.** A field meaning a
  day less than it says would be wrong on every screen it appears on.

### The assertion that could not see its own mutation

Worth more than the feature, and it is §76's shape arriving three sections
later in the same work.

The exemption test asserted the stored value by formatting it:

```js
assert.equal(new Date(row.graceUntil).toISOString().slice(0, 10), '2030-06-30');
```

**That reads `2030-06-30` for both the start and the end of that day**, so it
passed against a mutation storing midnight instead — which silently loses the
last day of every exemption an operator sets. The test was named for exactly
the behaviour it could not see.

It asserts **coverage** now — still in force at `23:59:59Z` on the named day,
and not into the next one — which is the property, rather than a rendering of
it. Found by running the mutation, not by reading the test: four mutations were
driven and this was the one that came back green.

### ~~What is deliberately NOT built~~ — built in §83, and differently

**~~Nothing writes `billingSuspendedAt`.~~** The computation and the controls
landed first so an operator can look at who would be affected *before* the
switch can take sync from anybody — which is what the preview is for, and it
would be pointless if the same commit also wired enforcement. The sync seam
reading `billingGraceUntil` is the next step, and it needs one more input the
others did not: the workspace's **subscription state** from its meta doc (§70),
because a workspace past its grace date that is *paying* must obviously not be
held.

> **§83 built the seam check and the subscription read exactly as predicted,
> and NOTHING writes `billingSuspendedAt` after all.** The hold is derived per
> request: §40's `/health` ping having never fired for weeks makes a stored
> hold one that is never *lifted* for a customer who has paid, which is this
> section's own "money taken, nothing restored" from the other end. So this
> section's other claim — that the field is *"set by enforcement"*, which it
> also says at `readOnlyState` — is the one that did not survive. The field
> keeps its place as the operator's manual billing hold and as what the panel
> counts. Left standing because the prediction about the *inputs* was right
> and only the storage was wrong.

### Verified

Four mutations, each failing the test that names it (§9):

| Mutation | Fails |
|---|---|
| `graceUntil` fed from the real `setAt`, so no preview | *the billing card previews who would be affected…* |
| the notice floor dropped | *a workspace older than the window still gets the notice floor* |
| the per-org override ignored | *a per-org exemption overrides the derived window…* |
| the exemption stored at the START of the day | the same test — **after** the vacuous assertion above was fixed; it passed before |

### The admin screen is built now, which §78 said it would be

That subsection declined a `billingMode` switch on the grounds that *"a switch
an operator can press before enforcement exists is a control that looks like
it does something and does not"*, and that *"the card wants building with the
thing it switches, so the copy can say what flipping it will actually do."*

Both held. The card exists now because there is something to say: it names the
window, the floor, how many workspaces would be past grace, and — in the
confirmation — what switching would cost today. **The control it does not have
is the one that would still be empty talk**: there is no "suspend the unpaid
ones" button, because nothing is enforced yet and a button whose effect is
nothing is the thing that subsection refused.

### ~~The admin screen is deliberately not built yet~~ — built in item 3

**Left standing because the condition it set was met rather than dropped.** The
route exists and the value is on `/api/admin/platform`; at item 1 there was no
third `.mode-switch` row on the Deployment card. Two reasons, and the second is
the one that decided it:

- A switch an operator can press before enforcement exists is a control that
  **looks like it does something and does not** — §36's shape, on the one
  screen where the operator needs to trust what they see.
- It is one `curl` away for the person who needs it now (`PUT
  /api/admin/billing-mode`), and the card wants building **with** the thing it
  switches, so the copy can say what flipping it will actually do. Writing that
  copy now means writing it twice.


---

## 79. The vendor had already published most of what we were waiting to be told

[`docs/PAYMENTS.md`](docs/PAYMENTS.md) §8 was a ten-row table of things that
document *"does not know"*, and its own preamble said **"every one of them is
answered by the same read — the dashboard and the MSA."** That sentence was
wrong, and the way it was wrong is the reusable part.

**Six rows closed in one afternoon from `docs.dodopayments.com`** — no account,
no lawyer, no dashboard login. The dispute set-off, the evidence procedure and
its deadline, the payout schedule and fee, the minimum payout, the
conversion-fee tiers, the refund-fee treatment, the supported currencies and the
individual-seller verification requirements are all **published**. They had been
filed as commercial, commercial had been read as contractual, and contractual
meant *wait for the MSA*.

> **A question filed under "ask the vendor" is worth one pass of "did the vendor
> already say" first.** The categories that route a question — commercial,
> legal, operational — describe who *owns* the answer, not where it is written
> down.

### Reachability measured, because it decided the shape of the result

```
www.dodopayments.com/pricing   301 -> https://dodopayments.com/pricing
dodopayments.com               curl: (56) CONNECT tunnel failed, response 403
docs.dodopayments.com          reachable
```

The marketing apex is **proxy-blocked**, which is §64's shape (`paddle.com`, the
same way) — and `WebFetch` reported it as `ENOTFOUND dodopayments.com` for a
request to `www`, because www 301s to the apex and the tool names the host it
failed on rather than the one asked for. Reading that as DNS would have been
reasonable and wrong; `curl` through the same proxy is what named the mechanism.

**So exactly one thing is still unknown and it is the fee percentage**, which
that vendor publishes only on the blocked page. §8 is no longer a table of
unknowns; it is four rows, one of them a single number.

### Three grades for one figure, because a fee is what gets multiplied

§72 established evidence grading for the seller-of-record row. It applies harder
to a rate, so §5 now carries **A** (read on the docs host, quoted), **B** (the
vendor's own blog plus one third-party review, agreeing) and **C** (a
third-party index alone) — and says plainly that grade B is for sizing and never
for a commitment.

The grade-B rate is **4% + $0.40, +1.5% international, +0.5% subscription**, and
**every sale this product makes is both of those**, so the figure to size
against is **6% + $0.40** — about **8.7%** at $15/month against **6.3%** at
$150/year. That is ~2.4 points, where §5 had guessed *"roughly a point"*,
because at $15 the fixed $0.40 is 2.7% on its own.

One grade-C figure **corroborates a grade-A one** ($5 per payout under $1,000,
which the docs state outright), and that is worth noticing without
over-reading: it raises confidence in that source, not in its other two numbers.

### The payout fee is the largest line at this volume, and the obvious move doubles it

Grade A throughout, so no estimate is involved:

| Payout | $5 as a share |
|---|---|
| $50 — the lowest settable threshold | **10%** |
| $100 — the default | **5%** |
| $1,000 — where the fee stops | 0.5% |

**Lowering the threshold to get paid sooner doubles the worst fee in the
stack.** The instinct and the arithmetic point opposite ways, which is the only
reason this is worth writing down.

### Visa RDR is on by default, and it divides the two prices

*"Visa RDR is enabled by default on all Dodo Payments accounts with a $100 USD
threshold"*, and a dispute it resolves *"appears as a lost dispute"*.

| | vs the $100 threshold | A dispute is |
|---|---|---|
| **$15 monthly** | under | **auto-refunded, auto-lost — no defence stage exists** |
| **$150 annual** | over | contestable: 10 days, evidence, a decision |

So the evidence rules that closed **in our favour** the same afternoon — 10
days, PDF/JPG/PNG/ZIP under 5 MB — **do not apply to the monthly price at all.**
That is the strongest argument for annual billing in that document, and §3 had
ranked annual first without knowing it existed.

It is also **worse than the worst case §3 assumed**: §3 braced for a threshold
that punishes losing, and what is actually configured is a mechanism that loses
on your behalf before you are asked.

### Two answers, pointing opposite ways, and both were assumed

- *"The dispute fee is not refunded, even if you win"* — **against us**, and §3
  had assumed exactly this, so the assumption is now a fact.
- *"You decide whether to accept or counter each dispute, and you supply the
  evidence"* — **for us**, and §3 had assumed this away.

A posture of assuming the worst was right as a posture and wrong as a fact in
one of the two places it was applied. Recorded because *"we assumed the worst"*
reads as safe and is still a guess.

### A correction to §5's own arithmetic, and it was hiding in a ratio

§73 measured a USD-based product presenting `$65.00` and `₹6,429.04` — a ratio
of ~98.9 — and §5 read that as *"a conversion from a USD base"* with an implied
FX rate. **The adaptive-currency fee is 4% under $500, *"added on top of your
displayed price and borne by the customer"***, so the ratio is **rate × 1.04**
and was never an exchange rate. The fee was inside the number.

Two consequences beyond the correction. A **$15 USD** product charges a UK
customer **$15 plus 4%** on every renewal, as a converted foreign-currency line
— which is §3's lever 2 working against us, and a cost §5's reversal from GBP to
USD took without knowing it existed. And **GBP turns out to be both a supported
presentment currency and one of three payout wallet currencies**, so a
GBP-priced product with a linked GBP wallet would have **no provider conversion
at either end**. That does not reverse the price decision — it was taken on
instruction with its cost stated — but it is a cost that was not on the list.

### INR payouts are discontinued, so the FX column changed counterparty

*"Scheduled payouts do not include an INR balance, and an INR balance does not
count toward your threshold."* Payouts consolidate through **USD, GBP and EUR**
wallets only, and a wallet linked as a settlement currency is *"paid out in its
own currency… Dodo Payments does not convert it and charges no conversion fee."*

**So there is no provider FX spread into INR to go and find.** The conversion
happens at the seller's Indian bank *"at its own exchange rate"*, plus that
bank's charges and any SWIFT intermediary and beneficiary fees, none of which
appear on the payout invoice. §5's blank column is still blank and **it is now a
question for the bank** — which is a different question, asked of a different
party, and it is the same for both price rows so it does not affect the monthly
versus annual comparison the table exists for.

**And §73's measured INR presentment is now a known hazard rather than a
curiosity:** an India-issued card produces an INR balance that is excluded from
scheduled payouts and from the threshold, and has to be moved to USD by hand
less a conversion fee. A stranded balance that looks like a missing payout.

### Verification found three site requirements, and one is a live defect

The individual path is 1–3 business days — Product Information, KYC with a
government photo ID plus a selfie liveness check, then Bank Verification whose
*"account holder's name must match your Identity Verification document."* Live
payments and payouts turn on **separately**.

The half that is ours: the live site *"must be publicly reachable and show
pricing, Terms of Service, Privacy Policy, a refund and cancellation policy, and
a contact route."* Measured against `nimbleclerk.com`:

| Required | Have |
|---|---|
| Terms of Service | ✅ `/terms` |
| Privacy Policy | ✅ `/privacy` |
| **pricing** | ❌ — nothing in this repository names a price, deliberately (§71) |
| **refund and cancellation policy** | ❌ — the word *refund* is in **no** legal page, though §3's lever 5 is a 14-day promise |
| **a contact route** | ❌ — `privacy.html` says *"contact us at the address below"* and **there is no address below** |

**That last one is a live defect on a legal page, and it is bigger than a
payment prerequisite.** Measured across all five public pages — `privacy.html`,
`terms.html`, `guide.html`, `welcome.html`, `index.html` — there is **no
`mailto:` and no email address of any kind**, so *"the address below"* is a
promise nothing anywhere keeps.

A privacy notice that tells a data subject to get in touch and then gives them
no way to **is a compliance defect in the document that exists for
compliance**, not merely an untidy sentence. The same page offers *"Ask us"* as
the route for somebody who cannot delete their own account — the stranded last
owner of a team (§15's `wouldStrandTeam`) — which is the one case where
self-service genuinely cannot work, so the people it strands are exactly the
ones with nowhere to go.

**Not fixed here, and that is a deferral rather than an omission:** which
address goes on a public page is the owner's decision, and the only address
this session knows is their personal one. Flagged in §7's before-live list with
the payment items, and worth doing on its own merits whatever happens to
payments.

It was found by grepping for a **payment** prerequisite rather than by reading
the page — §40's shape, where a page promises something the deployment does not
deliver and nothing contradicts it. §27's walk list has `privacy.html` on it
and the walk is about what a *change* makes stale; nothing had made this stale,
because it was wrong from the day it was written.

The other two are the pricing commit's work anyway, which produces a scheduling
fact worth knowing early: **verification is gated on the same commit as the
price**, so its 1–3 days cannot be got out of the way in advance.

### An Ethoca-deflected chargeback is invisible to this deployment

*"Ethoca alerts and deflections never create a dispute"*, so they emit no
`dispute.*` event at all: an alert refund fires **`refund.succeeded`** and any
linked cancellation fires *"the usual subscription event"*, while a deflection
fires **nothing**.

The product behaves correctly — §70's route records the cancellation like any
other — so this is not a bug. What it means is that **any count of disputes
taken from our own data is structurally blind to them**, which matters for
whatever reconciliation gets built. Recorded neutrally: it is ordinary industry
practice, and
[`docs/PAYMENTS.md`](docs/PAYMENTS.md) §2's note about the FTC action against a
comparable MoR was about using the mechanism to *mask* a fraud rate while
onboarding bad actors, not about the mechanism.

Separately, **seven `dispute.*` events exist and this deployment subscribes to
none of them.** Not wired here — nothing reads billing state yet — but
`dispute.lost` on a live subscription means money clawed back, so it belongs
with enforcement rather than after it.

### Blast radius

**Documentation only.** No code, no served file, no route, no wire change — so
`CACHE_VERSION` stays `crmbuilder-v67` and the counts do not move, checked
against the diff rather than assumed (§41's rule for a docs-only change).
`docs/API.md` needs nothing: no route and no response shape moved, which is the
check §46 and §54 both say to run instead of reading the route count.

**§27's six user-facing documents need nothing**, and the condition is §78's
unchanged: nothing is enforced and nothing can be bought, so no user has gained
a capability. The walk fires with enforcement — except for the **contact route**
and the **refund policy**, which are now on §7's before-live list as items that
have to exist before an account can be verified, and the first of which is a
defect rather than a feature.


---

## 80. The free-mode card, and the state that rendered as nothing was the card itself

Item 4 of [`docs/SUBSCRIPTION-UX.md`](docs/SUBSCRIPTION-UX.md) Phase 2. In
`billingMode: 'free'` — which is every deployment, because §78 shipped the lever
defaulting to free and nothing has flipped it — the Subscription card offers no
checkout and says three things instead:

> **Nimble Clerk is free while it is in early access.**
> · We will tell you before anything changes.
> · You will not be charged without being asked.

**The wording is settled in [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §5 and it is
load-bearing rather than copy.** *"Free for early users"* with no qualifier is
read as **permanent**, and the grandfathering decision is explicitly not a
permanent tier — so that phrasing would make, in the one place a customer quotes
back, the promise the decision declines to make. These three stay true whatever
the window turns out to be, which is why they promise **notice, not duration**.
An E2E assertion names the bad phrasing in a `not.toContainText`, so it cannot
drift back in.

### This retires a state three sections had to apologise for

§73, §74 and §76 each recorded that `DODO_PRODUCT_ID` is set on production in
**test mode**, so every workspace owner sees a **Subscribe** button that cannot
take their money. §73 named two honest states (unset the variable between
sessions, or do the doc walk, which needs a price) and §76 added a third
(signups are closed, so only the operator can reach the card).

**Free mode is the fourth and it is the one that is actually true**: nothing is
on sale, so there is no button, and the card says what *is* the case rather than
explaining an inconsistency. That is better than all three, and it needed no
decision about the variable at all.

### The gate is on the server, and the portal deliberately is not

Two opposite calls about the same mode, and the pair is the substance:

| | Gated on `mode === 'free'` | Why |
|---|---|---|
| `checkout` | **yes** | §74's reason exactly — *a client-side hide is a client-side hide, and the link is a plain URL anybody can keep.* A workspace holding yesterday's link must not be able to buy through it in the one mode whose promise is that nobody is charged without being asked |
| `portal` | **no** | flipping back to `free` does **not** stop the provider charging a live subscription. Only cancelling does, and the portal is the only control that can — so withholding it would strand a paying customer with a recurring debit and no way to stop it, which is a dispute that would be entirely ours |

The second one is the half that would cost money, and it is not reachable by
accident: it needs the mode flipped from `paid` back to `free` while somebody is
subscribed, which is a legitimate operator action — pausing charging while
something is wrong is exactly what a reversible lever is for (§24 stage B's
rule).

### A boolean, because two nulls wanted opposite copy

`checkout: null` now means **either** free mode **or** a live subscription, and
those want opposite things on screen: the promise in one case, the status and
the way out of it in the other. That conflation is the shape this file keeps
finding — §78's two read-only holds, §39's four digest states, §73's
`Status: unknown` — so it is closed the same way, with the fact made explicit
rather than inferred.

**`live` is the one field the card cannot derive.** `hasLiveSubscription` keys on
the **terminal** set (`cancelled`, `expired`, `failed`), which §74 put on the
server deliberately so an unrecognised future status *blocks* a second purchase
rather than selling one. A card that re-derived it would carry a second copy of
that set, and the copy that goes stale is the one deciding what a customer is
told (§29).

**And the promise must not be shown to a live subscriber**, which is the same
fact from the customer's side: *you will not be charged* is false to somebody
actively being charged. A **cancelled or expired** record does fall through to
the promise, and that is correct — they are not being charged, the statement is
true, and the portal below still reaches their invoices.

### The card's own condition was the defect

```js
org.billing && (org.billing.checkout || org.billing.billing)
```

A checkout link **or** an existing record — and free mode has **neither**. So
before this the card did not merely say the wrong thing in free mode, it
**vanished**: §39's state that renders as nothing, on the one question people
signing up today are entitled to have answered, in a condition written when free
mode did not exist.

That is why the fix is three places rather than one: the server's gate, the
status branch, and the condition that decides whether there is a card at all.
The third is the one no amount of wording would have fixed.

### The free branch comes FIRST, ahead of the enabled warning

§71's *"Payments are not finished being set up here"* exists to stop somebody
paying into a deployment that cannot record it. In free mode there is no
checkout to pay through, so that warning cannot apply — and an operator warning
on a customer's screen, in a state where it is meaningless, is the line that
teaches people to skip the card (§25's alert fatigue, §33's cell nobody reads).

### Verified

**Five mutations, each failing exactly one test — its own**, which is what says
the five cover different things rather than one thing five times (§9):

| Mutation | Fails |
|---|---|
| drop `mode === 'free'` from the checkout gate | *free mode sends no checkout link, and the gate is on the server* |
| gate the portal on the mode too | *free mode still reaches the portal of somebody already subscribed* |
| remove the free branch from `billingStatusHTML` | *free mode promises notice rather than a duration…* |
| revert the card's condition | the same test — the card is absent entirely |
| drop `&& !state.live` from the free branch | *free mode does not tell a live subscriber they will not be charged* |

**The blast radius was measured rather than predicted, and it was seven tests.**
`tests/payments.test.mjs` set no `BILLING_MODE`, so its server ran on the
**free** default — and adding the gate made every checkout-link assertion in the
file test the free gate instead of the thing it names. `BILLING_MODE: 'paid'` is
pinned on both of that file's servers now, with the count in a comment, and the
free-mode tests flip the **stored** mode over it and restore it in a `finally`
— §16's precedence used as a test seam, and §16's own rule that a stored mode
left flipped leaks into everything after it.

**One whole-body `deepEqual` failed and it was the right one to break.** *"with
nothing to sell there is no checkout link"* asserts the entire response and
failed naming both new keys — which is what §46 says that assertion is for: a
key added to a response without a decision is drift no route count can see.

**And a precondition guard caught a wrong assumption of mine.** *"free mode
still reaches the portal"* was written assuming the owner held a live
subscription from earlier in the file; the tests above it drive §74's
`cancelNow()` so they can read a checkout link past the duplicate gate, so by
that point the owner is **cancelled**. Without the guard every assertion would
have passed — a cancelled workspace gets `portal` too — so the test would have
been green and would have proved nothing about the state it names. §9's rule,
and the reason to assert the precondition rather than the outcome alone.

### Blast radius

`js/app.js` is in `APP_SHELL`, so `CACHE_VERSION` → **`crmbuilder-v68`**. No new
served file, so smoke stays **51 local / 56 live** — running it is what proves
that (§9).

**`docs/API.md` gains no route and the count stays 61**, which is §46's trap for
the seventh time: the number is right and the file read correctly while a
**response shape** moved underneath it. `mode` and `live` are new, and
`checkout` is now `null` for a third reason that is not *"nothing is
configured"*.

**§27's six user-facing documents need nothing, and the condition has finally
changed rather than been restated.** §78's was *nothing is enforced and nothing
can be bought*. The second half still holds — free mode offers no checkout, so
nobody can buy — but this commit **does** put a new sentence in front of every
owner. It needs no document because it is the whole of what there is to say:
there is no price to describe, no flow to walk through, and no control to
explain. The walk still fires with enforcement.


---

## 81. The seat cap, and "one member count" was the half that does not work

Item 5 of [`docs/SUBSCRIPTION-UX.md`](docs/SUBSCRIPTION-UX.md) Phase 2, which
specified it in eight words: *"one member count in `/api/org/invite`, plus a
refusal screen that explains itself."* The refusal screen is that. The count is
not, and the reason is this section.

**`SEAT_CAP`, default 5**, from [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §5's price
table: one workspace, up to five people. Counted, never metered — there is no
per-seat charge to meter.

### Counting members alone is bypassable, and it needs no bad intent

An owner one seat short mints a link. The check passes: four members against a
cap of five. They mint another, for the colleague who might also want in. That
passes too — still four members. Both are redeemed, and the team is at six.

**Every mint was refused correctly and the cap was never exceeded at the moment
it was checked.** A guard that reports success, which is the shape this file
keeps collecting.

So the count is **members plus invites nobody has used yet**:

```
taken = members + pending        (pending = invites whose state is 'valid')
```

That makes `taken` an invariant a join cannot raise — redeeming an invite moves
a seat from `pending` to `members` and leaves the total alone — so `members <=
cap` holds always. Revoking or expiring an invite releases a seat; so does
removing a member. Neither direction leaks.

**Disabled accounts still hold their seat**, and that is a decision rather than
an artifact of `listUsers` including them: a paused member is still on the Team
screen and is re-enabled with one click, so excluding them would make the cap
something an owner walks around by disabling somebody — a bypass dressed as an
administrative action.

### It is two checks, and the second one is NOT the first repeated

| | Checked against | Why it exists |
|---|---|---|
| `POST /api/org/invites` | `taken >= cap` | so the owner is told **before** they send a link to a colleague |
| `POST /api/org/join` | `members >= cap` | every invite in flight when this shipped was minted with no cap check, and this is the only place the member count actually changes |

The join check counts **members alone**, not `taken`: the caller is holding one
of the pending invites, so counting pending would make them collide with their
own seat. The mint is what keeps the total honest.

### The wording is the finding: one rule, two audiences

The mint's message tells the owner to revoke an invite or remove somebody.
**The joiner can do neither** — they cannot see the team, let alone administer
it — so the same sentence shown at the join is instructions addressed to the
wrong person. §53 records exactly this where a provider's refusal, written for
the merchant, would have reached a customer.

| | Says |
|---|---|
| owner | *"This workspace is full: 3 of 5 places are taken, and 2 more are held by invites nobody has used yet. Revoke one of those below, or remove someone…"* |
| joiner | *"That team is full, so you cannot be added to it yet. Ask whoever invited you to make room — your link still works once they have."* |

**`pending` is named separately on purpose.** *"5 of 5 taken"* to an owner who
can see three colleagues reads as a miscount; the other two are links they sent
and forgot, and revoking one is the cheapest fix available to them.

**The joiner's message names no count**, because the size of somebody else's
team is not their business — and it promises the link still works, which is
true only because of the ordering below.

### The refusal must not spend the code, and that is one line's position

The join check sits **above** the `updateInvite` that marks the code used. So a
refusal costs the joiner nothing: `usedAt` stays null, the link stays valid, and
it works the moment room is made. Refusing *after* the spend would burn a
bearer credential (§13) on a failure and strand them permanently, while the
message promised the opposite.

Asserted directly — the test re-previews the invite after the refusal and then
redeems it once a member is removed.

### 409, and not 403

An owner **may** invite. This is a state of the workspace they can change, not
a permission they lack — the same reading `wouldStrandTeam` already uses on the
join route beside it. The distinction is what makes the message actionable
rather than a wall, and it is why both messages end with what to do.

### Not gated on `billingMode`, unlike items 1–3

Those three changed no behaviour until an operator flips the switch, so a reader
would expect this to follow. It does not: **the cap is part of the product's
shape rather than part of charging for it.** "Up to 5 users" is true of the free
period and the paid one alike, and gating it would mean flipping to `paid`
silently withdraws invites an owner could send the day before. **A limit that
arrives with a bill is the worse surprise.**

Env rather than an operator setting in `platform`, which is the other place it
could live: §78 put the grandfather window and notice days there because an
operator reads them off a dry-run screen before flipping something
irreversible, and a seat number has no such screen. §16's case for a stored
lever is about **incidents** — opening or pausing signups without a redeploy —
which a seat cap is not.

**A per-org override is deliberately not built.** It is the obvious next thing
the moment somebody negotiates a sixth seat, and it is §78's
`billingExemptUntil` shape exactly: a nullable number on the org, never a
boolean. Not invented ahead of a customer asking.

### The client declines to offer; the server decides

§14's split. The Team card **withholds** the button when the team is full and
says where it stands instead — §36's rule 1, because a control whose effect is
refused a second later reads as unfinished software, and rule 2's *render it as
a value* is why there is a line rather than a greyed-out button.

A stale page whose button is still there therefore fails **safely**, with the
server's own wording: `openInvite` already renders `err.message` into the modal
body, and `api()` in `js/cloud.js` already lifts `body.error` onto the error. So
the refusal reaches the reader unchanged with no client change at all — which
is the half that would otherwise have been written and untested.

### The invariant makes the join refusal unreachable, and that is a testing problem

Worth more than the feature. Because `taken <= cap` holds at every mint and a
join does not change the total, **`members == cap` implies `pending == 0`**: a
full team cannot be holding a live invite. So the join refusal **cannot be
reached through the API at all** for links minted under this cap.

Which means it is only reachable the way it will actually happen in
production — an invite issued **before** the cap existed. The test plants one
directly in the store (`editStore`, stop–edit–start, because FileStore rewrites
the whole file on save, §12) and that is a faithful reproduction rather than a
contrivance: a pre-cap invite *is* a row with no mint-time check behind it.

**The first version of that test passed for the wrong reason**, which is how the
invariant was found. It tried to construct a full team with a live invite
through the API, could not, drifted into asserting a `404` on a spent code, and
went green — testing the ordinary rejection while claiming to test the cap. The
invariant is now its own test, stated as an assertion, so the next person does
not spend an hour discovering it the same way.

### Verified

**Seven mutations, each failing by name** (§9):

| Mutation | Fails |
|---|---|
| count members only, ignore `pending` | **3** — the hole test, the revoke test, and the invariant test |
| drop the join-time check | *a PLANTED invite … is refused at the join* |
| give the joiner the owner's wording | the same test, on the wording |
| spend the invite before the cap check | the same test, on *the refused invite was spent* |
| exclude disabled members | *a disabled member still holds their seat* |
| render the invite button regardless | *a full team is told so…* |
| drop the "room for N more" line | the same test |

**The blast radius was measured and it was six tests.** `tests/api.test.mjs`
mints **seventeen** invites, many into one long-lived org, so the production cap
refused the seventh and everything after — surfacing as
`Cannot read properties of undefined (reading 'code')` on a mint that returned
no invite. That file now runs at `SEAT_CAP: 200` with the count and the reason
in a comment, because what it covers is the invite **lifecycle**. §38's rule
that *"the tests made the limit looser"* should be visible rather than inferred.

**And a precondition guard caught a wrong assumption for the second commit
running.** The planted invite did not exist: `invites` is an **array** in the
file store and `getInvite` is a `.find()` over it, so `raw.invites[CODE] = …`
set a named property that `.find()` never visits. The plant succeeded, the file
looked right, and the row was invisible. Caught by the *"the planted invite is
not valid, so this tests the wrong refusal"* assertion rather than by reading —
without it, the join refusal would have been asserted against an invalid code
and passed as the ordinary 404.

### Blast radius

`js/app.js` is in `APP_SHELL`, so `CACHE_VERSION` → **`crmbuilder-v69`**. No new
served file, so smoke stays **51 local / 56 live** — running it is what proves
that (§9).

`tests/seats.test.mjs` is new and takes **9991–9999** (§9's table), with a
**fresh port per boot** because it restarts to plant a store row and §4 records
that rebinding a port that was listening a millisecond ago races.

**`docs/API.md` gains no route and the count stays 61** — §46's trap for the
eighth time: `GET /api/org/members` grew a `seats` object, and two routes gained
a `409` they did not have. Both are contract changes a route count cannot see.
`DEPLOYMENT.md`'s environment matrix gains `SEAT_CAP`.

**§27's six user-facing documents DO need walking, and this is the first Phase 2
item where that is true** — a user can now be refused something they could do
yesterday, which is a capability change rather than a new screen. Not done in
this commit: items 1–4 deferred the walk to "when enforcement lands", and
folding one item's worth into that walk now would mean walking the same eight
files twice. **The cap is the one thing on that list that is already live**, so
it goes in the walk's first paragraph rather than being discovered during it.


---

## 82. The trial was a dashboard field, and one of its three predictions held

Item 6 of [`docs/SUBSCRIPTION-UX.md`](docs/SUBSCRIPTION-UX.md) Phase 2, which
that document called *"a dependency path, not a task"* — the only Phase 2 item
whose cost was unknown, because §71's static payment link is the one
integration shape `script-src 'self'` leaves us (§30 Phase 4) and nobody had
read whether a trial reaches it.

**It is branch A: the trial is a field on the product's price, and there is
nothing to build.** `Trial Period Days` on their pricing form, 0 to disable,
with an optional `Trial Amount` beside it — *"Paid trials are configured on the
product's price, not per subscription or per checkout session."* So §5's switch
deferred a dependency that was a dashboard setting all along, and the price
table's *7 days* is deliverable.

**§79's lesson again, one item later.** That section's finding was that *a
question filed under "ask the vendor" is worth one pass of "did the vendor
already say" first*. This one was filed under "unread, and §69's rule is not to
guess" — correct about the guessing, and the reading took four pages.

### The one half that is inference, and it is the half that would reverse this

**The static link's documented query-parameter list contains no trial entry.**
That is what makes the product field the *only* mechanism that can reach a
`/buy/{id}` link — and it is also why the link honouring it is not quotable.
The single first-party sentence tying the two together is about a **paid**
trial's amount: *"The trial amount is taxed and included in checkout
calculations and payment link pricing."* Every trial example on all four pages
is a **checkout session**.

So whether a *free* trial's period renders on a static link is a sixty-second
test-mode check, which this session cannot run (§8) and which is item 13 of
[`docs/PAYMENTS.md`](docs/PAYMENTS.md) §7's before-live list with both outcomes
named. **If it does not render, this is branch B** — a Checkout Session, which
brings `DODO_API_KEY` and §17's credential rules with it and reverses §72's
measured *"today's credential surface is one signing secret"*.

Recorded as inference rather than smoothed over, because the difference between
*documented* and *very likely* is the difference between shipping a price and
discovering at the checkout that nobody gets a trial.

### Two of the three data predictions were wrong, and the third's premise was

The item named three things to expect. **One held.** Worth keeping as a set,
because a prediction that is wrong in a *useful* direction is the argument for
writing predictions down at all.

- **"A status that is not in the map" — NO, and there was never going to be
  one.** *"The subscription object has no trial status field"*, and the
  documented list is `pending · active · past_due · on_hold · paused ·
  cancelled · failed · expired` — every one of which `STATUS_LABELS` already
  carries, because §76 took them from the tails of
  `BILLING_SUBSCRIPTION_EVENTS` rather than from sightings. So §76's
  unrecognised-status path **does not fire**, and §73's refusal to add a
  `trialing` label before seeing a real value was right for a better reason
  than caution: there is no such value to see.

  **The consequence is the finding: a trial is indistinguishable from an
  ordinary subscription in everything we store.** Their own detection method
  is *"exactly one payment with a `total_amount` of 0"* — a read of the
  subscription's **payments**, which is an API call we do not make and do not
  hold a credential for. The alternative they offer, *"check whether
  `next_billing_date` is still within the trial window"*, needs the trial
  length, which lives in their dashboard and would be a second copy of it here
  (§29). So the card cannot say *"your trial ends on X"*, and that is a limit
  with a named cost rather than an omission.

- **"A live subscription with no payment event" — probably not, and the
  conclusion survives anyway.** The detection method above means a free trial
  **does** produce a payment record, of zero; whether it is *delivered* as a
  webhook is unstated. Either way the card is coherent, for exactly the reason
  the prediction gave — §70's two clocks are independent, so a subscription
  state needs no payment behind it. A premise that was wrong and a conclusion
  that was right, which is worth distinguishing rather than scoring as a hit.

- **"A trial must never be offered to a grandfathered workspace" — not
  implementable on branch A, and the framing was the problem rather than the
  offer.** The trial lives on the product and the link carries no trial
  parameter, so it is **all-or-nothing per product**: withholding it from one
  workspace needs a second product and a second `DODO_PRODUCT_ID`.

  And functionally the trial is *better* for them — seven days before the first
  charge rather than none — so it is not the downgrade that item called it.
  What reads badly is *"start your 7-day free trial"* shown to somebody with
  eleven months of free left. **The copy is ours and the trial is not**, and
  there is no trial copy anywhere today, so this becomes a constraint on
  whatever the pricing commit writes rather than a check to code.

### The hazard is a checkbox, and it is §2's one-click class again

*Start the trial without a card* (`trial_payment_method_optional`) sits on the
same pricing screen. Ticking it means a subscription starts with **no payment
method** and the trial ends with nothing to charge — and nothing in this
repository would know, because nothing here knows the trial exists at all.

That is the class [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §2 already records for
the BYOP switch: **a one-click setting in somebody else's dashboard that
inverts a decision taken in a document.** The price table says *card up front*,
so the box stays off — and a `Trial Amount` would keep the card requirement on
regardless, since *"A paid trial always requires a card."* It is on §7's
before-live list beside the live-product steps, because the trial is a product
field and therefore **does not survive copying the product to live mode.**

### A per-product trial lock keyed on email, next to a seat cap that refused one

Their misuse control records a redemption *"at trial activation, so a customer
who cancels the same day has still consumed their trial"*, and *"Existing
customers are backfilled from historical trials by email."*

**§74 established that email is not an identity even to them** — *"Checkout can
create a new customer record for a returning email"* is their own sentence, and
it is why the duplicate-subscription gate keys on `wsId`. So this control is
weaker than it sounds, by the vendor's own admission one page over. It does not
matter here: it is their control over their product, it runs independently of
our gate, and neither needs the other. Recorded because §81 made the opposite
call about the same identifier for the same stated reason, and the symmetry is
what makes the trade legible.

### The contingency this leaves, and why nothing is written for it

If a trialing subscription reports **`pending`** rather than `active`, the card
is wrong in three places at once: `BILLING_STATUSES` is `active` + `past_due`,
so the next-payment row is suppressed, *"No payment is currently scheduled"*
appears in its place, and §76's advice line adds *"Waiting for your provider to
confirm this"* — to somebody on day two of a trial whose end date is sitting in
the record. Status reads *Awaiting confirmation*.

**Nothing is changed for it.** `pending` legitimately means two different
things and the card cannot tell them apart from what we store, so which fix is
right depends on which value arrives — and §73's rule is that one sample is not
a vocabulary. This is **zero** samples. It is the second row of §7's item 13,
so the one test that resolves branch A/B resolves this in the same run.

### Blast radius

**Documentation only.** No code, no served file, no route, no wire change, no
new environment variable — so `CACHE_VERSION` stays `crmbuilder-v69`, the
counts do not move, and `DEPLOYMENT.md` needs nothing. Checked against the diff
rather than assumed (§41's rule for a docs-only change).

`docs/API.md` needs nothing: no route and no response shape moved, which is the
check §46 and §54 both say to run instead of reading the route count.

**§27's six user-facing documents need nothing from this commit**, and the
condition is §81's rather than §80's: nothing can be bought, so no user has
gained a capability. §81's walk is still owed and still deferred to the
enforcement commit, and **the trial now has a line waiting in it** — a trial is
the first thing a user reads on a pricing page, and it is a sentence rather than
a section because there is no screen for it on our side.


---

## 83. Enforcement, and a hold that is derived rather than scheduled

The thing [`docs/SUBSCRIPTION-UX.md`](docs/SUBSCRIPTION-UX.md) Phase 2 never had
an item for, and §78 ended by naming: items 1–5 built the lever, the two holds,
the cutoff, the free-mode card and the seat cap, and **nothing wrote
`billingSuspendedAt`.** `POST /api/sync` now refuses the push of a workspace
that is past its grace window with no live subscription.

**Nothing changes on any deployment today.** It is gated on `billingMode` being
`paid`, and every deployment is `free` (§80) — so this landed the way items 1–5
did, with the mechanism in place and no behaviour moved.

### The open question was where it runs, and the code answered it

§78 left two candidates: a scheduled pass on the `/health` ping, beside §25's
alerts and §39's digest, or a check at the sync seam. Reading the seam settled
it, because `readOnlyState(org)` is **already called there**, with the org in
hand and the refusal path built and tested (§24 stage B).

**So the hold is DERIVED at the point of use and `billingSuspendedAt` is not
written at all.** Two reasons, and the second is the one that decided it:

- **§40 records the `/health` ping having never once fired for weeks**,
  invisibly to every test in this repository. A digest that does not arrive is
  a missed nudge. A hold that is never *placed* means somebody keeps sync they
  stopped paying for — and a hold that is never *lifted* means a customer who
  has **paid** stays read-only until a pass that may be dead runs again. That
  is §78's own *"money taken, nothing restored"*, arrived at from the other
  end, and it is the worse half by a distance.
- **A derived answer cannot be stale.** Paying releases the workspace on its
  very next push, with nothing scheduled in between to go wrong. That has its
  own test, because it is the whole argument for the shape.

**§78's claim that `billingSuspendedAt` is "set by enforcement" is therefore
corrected rather than implemented.** The field keeps its place as the
*operator's* own per-workspace billing hold and as what the panel counts; the
automatic hold is a function, every time. Both reach the same branch of
`readOnlyState`, so the customer-facing message and the precedence are written
once and cannot drift apart.

**The cost is stated rather than discovered:** a workspace nobody syncs is
never evaluated, so this is not a report. §78's `graceUntil` / `pastGrace`
preview is what answers *who would be affected*, and it reads the same two
helpers this does.

### Free mode costs nothing, and that is why the seam can afford it

This is the hottest authenticated route in the app, so the ordering matters.
`billingMode()` is cached in-process on the same TTL as the signup lever, so a
deployment that is not charging pays **one map lookup** and reads neither the
platform document nor the meta doc.

In paid mode it is two extra reads on the push path. `pullChanges` reads the
meta doc again a few lines down, so the second one is **genuinely an extra read
rather than a shared one** — said plainly instead of implying it is free,
because the honest figure is what a later reader needs.

### The finding: an environment variable must never take somebody's sync away

`billingMode()` returns `setAt: 0` for the **env** path (§78), and
`billingGraceUntil` needs that date to compute any window at all — so with
`BILLING_MODE=paid` set and no panel flip behind it, every workspace falls to
the no-window branch and would be held **the instant the variable was set**. No
notice, nothing on screen beforehand, and §80's free-mode card promising
exactly the opposite.

So an env-only `paid` enforces nothing, and says so in the code. §78's rule is
that *a settings read must never be what starts a charge*; this is its sibling,
and it is the same asymmetry one step further on.

### A workspace created AFTER the flip, which the plan did not cover

`billingGraceUntil` returns `null` there — no grandfather window, by design,
because they signed up knowing. It is tempting to read `null` as *no free
period, hold immediately*, and that would make a fresh signup read-only
**before they had reached a checkout button**, since nothing in this product
gates signup on payment.

They get the notice floor counted from their own `createdAt` instead: the same
number of days everybody else is promised, from when they arrived.
Conservative in the direction every other decision in this area chose, and it
means **no reachable path holds a workspace with no notice at all.**

### Two of the eight tests were vacuous, and the mutations are what said so

Both of the guards above — the ones that are findings rather than plumbing —
had tests that passed with the guard removed. §9's rule earning its keep twice
in one file, and the second is §78's shape exactly: an assertion that cannot
see its own mutation.

| | Why it passed on the bug |
|---|---|
| *an environment-only paid mode holds nobody* | the workspace was seconds old, so with the guard gone it fell to the no-window branch and was **saved by the notice floor** — thirty days in the future, so not held, so green. It plants a two-year-old `createdAt` and zero windows now, which leaves the guard as the only thing between that push and a refusal |
| *a workspace created after the switch gets the notice floor* | ageing `createdAt` carried the org **out** of the branch under test: `billingGraceUntil` keys on `createdAt < setAt`, so an aged workspace becomes *grandfathered*, where a zero-month window plus a thirty-day floor puts its grace date a month in the future. Correctly not held, by a path the test does not name. The plant moves `setAt` back too, and **asserts the ordering it depends on** |

### The mode is checked twice, and neither check alone is load-bearing

Measured rather than reasoned: dropping the seam's `billing.mode === 'paid'`
fails **nothing**, because `billingHoldApplies` guards itself; dropping the
function's guard fails **nothing**, because the seam short-circuits. Dropping
**both** fails *free mode holds nobody*.

That is §61's `Content-Length` finding in a new place — safety that holds for
two independent reasons, where a mutation of either half proves nothing. Kept
rather than tidied into one, because they are there for different jobs: the
seam's is the cost (no reads in free mode) and the function's is correctness
standing alone. Written down because a reader running one mutation would
conclude the check was dead code.

### Verified

Nine mutations. Each of the seven below fails the test that names it, and the
two mode-check halves are the pair above.

| Mutation | Fails |
|---|---|
| both mode checks dropped | *free mode holds nobody, however old the workspace and however unpaid* |
| the `!billing.setAt` guard dropped | *an environment-only paid mode holds nobody…* |
| `hasLiveSubscription` ignored | *a live subscription is never held…* and *paying releases the hold…* |
| the no-window branch returns true | *a workspace created after the switch…* |
| `readOnlyState` does not read the derived hold | **5** of the 8 |
| the billing reason wins over the operator's | *the operator hold wins…, and lifting it reveals the billing one* |
| `billingExemptUntil` ignored | *a per-org exemption holds the workspace writable past the window* |

**Counts:** Node **648 → 656** (656/656, 0 skipped — exactly the eight added,
which is what says none was lost), Playwright **163 of 164**, smoke **51
local**. All three run.

**The one Playwright failure is §66's intermittent, and the exoneration is as
strong as §78's by a different route.** Same test — *signing out hides the
workspace* — and the artifact carries §66's recorded signature: `heading
"Settings"` still rendered after `goto('/app#/')`, with `No modules yet` and
`Sign in to sync` in the sidebar. 3 of 3 in isolation afterwards at 7.9s each,
against §66's recorded 8.3s passing runs, so it is not newly deterministic.

§78 could claim structural innocence because it contained no client file. This
commit contains none either — but it does touch the sync route, so that is not
the argument. The argument is that **`playwright.config.js` sets no
`BILLING_MODE`**, so the E2E server runs in free mode and the seam's
`billing.mode === 'paid'` is false on every push in the entire suite:
`billingHoldApplies` is never called, and the only added line that executes is
`readOnlyState(org, false)`, whose branch is byte-identical to before. Checked
rather than asserted.

### Blast radius

`server.js` only — no client file, no served file, no new environment
variable. So `CACHE_VERSION` stays `crmbuilder-v69` and smoke stays **51 local
/ 56 live**, checked against the diff rather than assumed (§41).

`tests/enforcement.test.mjs` is new and takes **9000–9099** (§9's table), one
app server with a fresh port per boot because it restarts to plant store rows
(§4). The block is carved from the unclaimed 8961–9299 gap with margin on both
sides, since §9's own rule is that widening a block means checking the
neighbours and this one touches none.

**`docs/API.md` gains a line and no route** — §46's trap for the ninth time:
the count stays **63** and the file reads correctly, while `POST /api/sync` can
now answer `readOnly` for a reason that is **computed per request** rather than
stored on the organisation. A caller that was treating that flag as "an
operator did something" is now wrong about why.

**And 63 is worth stating because I reached for 61.** §78's and §81's blast-radius
notes say 60 → 61 and "stays 61", which were true when written; the live figure
is 63 and `docs/API.md` already carries it, so the document is right and the
recollection was wrong. §29's rule in the direction that is easy to miss —
counted with
`grep -cE "^app\.(get|post|put|patch|delete)\(" server.js` rather than read off
an earlier section, which is the whole reason that command is written down.

**§27's six user-facing documents still need nothing from this commit**, and
the condition is unchanged from §81's: nothing can be bought and no deployment
is in paid mode, so no user has gained or lost a capability. **That walk now
owes two items rather than one** — §81's seat cap, which is live, and this,
which is not — and it fires with the pricing commit.

### What is still not built

- ~~**Refund and dispute events.**~~ **Built in §84, and the hole is narrowed
  rather than closed.** §79 records that seven `dispute.*` families exist and
  this deployment subscribes to none, so a customer can dispute a charge, win,
  and keep sync with the card reading `active`. Nine events are handled now and
  **a lost dispute still does not hold anybody**, deliberately — §84 has the
  three reasons and the test that pins the choice. What that section also found
  is the reason this was not the one-line change it reads as: **a dispute
  payload carries no `metadata.wsId`**, so §70's whole attribution path does
  not apply to it.
- **Anything on screen for the held customer beyond the sync toast.** The
  read-only reason reaches them through the latched toast and the chip (§24,
  §55), and §76's Subscription card already says what to do about an overdue
  payment. What is missing is the two meeting: a workspace held for
  non-payment does not say so on the card, because the card reads the
  provider's status and the hold is derived from it plus a date.


---

## 84. A dispute names no workspace, so the payment id is the only way back

§83's own *What is still not built* opened with this and called it **the
hole**: seven `dispute.*` families existed, this deployment subscribed to none,
and enforcement reads a status that a lost dispute does not move — so a
customer could dispute a charge, win it back, and keep sync with the card
reading `active`. Nine events are handled now, and the hole is **narrowed and
made visible rather than closed**, which is the decision in this section.

### The mechanism: there is no `metadata.wsId` on a dispute

§70 made `data.metadata.wsId` the attribution path, and it is *as trustworthy
as the signature* because it rides out on the payment link we built. **A
dispute payload does not carry it.** The provider documents that object as
amount, business_id, created_at, currency, dispute_id, payment_id, remarks and
`is_resolved_by_rdr` — and nothing that names a workspace.

So the only link back is `payment_id`, which means a **reverse lookup**: given
a payment, which workspace made it. Nothing stored a payment id in a way that
could answer that — `billingFieldsFor` kept `paymentId`, the latest one, and
overwrote it on every renewal.

**And matching the latest id is wrong in the ORDINARY case, not an edge one.**
A chargeback window runs to 120 days, so a monthly subscriber disputing their
first payment has had three or four since. An implementation that stored one
id passes a test disputing the most recent payment and fails every real
dispute — which is why the test disputes the **first of three**.

`billing.paymentIds`: newest first, deduplicated, capped at **12**. Twelve is a
year of monthly payments, so it covers the window with room; deduplication is
what makes it twelve *payments* rather than twelve deliveries, since a retry
carries the same id and this provider retries eight times (§54's cap is the
precedent, and §17 and §33 are why an unbounded list on a meta doc is not
free).

**Metadata is still tried first, for every type including disputes.** Cheap,
and §30's rule: a field the documentation does not list is not the same as a
field that is stated absent. If a real dispute body turns out to carry one,
this already uses it and the lookup never runs.

### The reverse lookup, and the index that is deliberately not there

`findWorkspaceByPaymentId` on both stores. FileStore walks `this.s.data` in
memory — one entry per workspace, nothing worth measuring. MongoStore does
`findOne({ 'billing.paymentIds': paymentId })` and is **unindexed on purpose**:
the `data` collection holds one document per workspace, so this scans as many
documents as there are tenants, which at M0 is nothing — the Organisations
panel already scans every one of them every 30 seconds (§24) — and it runs once
per dispute event, which is rare by construction.

Written down because the obvious tidy is to add the index, and §4's TTL notes
are the warning about doing it casually: Mongo accepts index options it then
silently ignores, and refuses to change an existing index in place. The
condition for adding one is a tenant count that makes the scan matter, not a
preference.

### An unattributable dispute is a real state and gets its own log line

A payment older than the window, or one belonging to another deployment, gives
`200 { received: true, ignored: 'no workspace' }` and writes nothing. **2xx for
§70's reason** — a non-2xx is a delivery failure to this provider, so refusing
an event we deliberately ignore buys eight retries and a red mark on the one
screen that reports real ones.

It is logged **separately from the no-metadata line**, naming both the payment
and the dispute id, and that split is the substance rather than tidiness:

| Line | Means | Fix |
|---|---|---|
| *carries no usable metadata.wsId* | a payment link was built without `metadata_wsId` | ours, at the other end, and the money has already been taken |
| *could not be attributed … payment X, dispute Y* | nothing is wrong at the other end | nobody's — the operator looks it up in the provider dashboard |

One wording for both would send whoever reads it to the wrong place. The ids
are logged because they are the only thing tying the line to the provider's own
screen, and neither is a credential.

### A fourth clock, and the test that could not see it

`subscriptionAt`, `paymentAt`, `disputeAt`, `refundAt` — each kind newest-wins
against its own kind and invisible to the others. **A dispute is the case that
makes §70's split unavoidable rather than tidy**, and the reason is the lateness
above: under one shared clock a payment landing after a chargeback moves the
watermark past it, and the **next** dispute event — a stage change, or the
outcome — is refused as stale. A chargeback that silently never resolves, on
the one record somebody acts on.

**The first test for it was named for the split and could not see it.** It
delivered a dispute, then a **renewal** stamped later, then a stale dispute —
and a subscription event has its own clock under *either* design, so the
mutation merging disputes into `paymentAt` failed nothing. The comment in
`server.js` named the wrong event class too, and was corrected with it.

The arrangement that discriminates is three stamps delivered out of order:

```
t1  dispute.opened       delivered first
t3  payment.succeeded    delivered second — the latest stamp
t2  dispute.lost         delivered last, and it sits BETWEEN them
```

Shared clock: the third is stale against `t3` and dropped. Separate clocks: it
is newer than `t1` and lands. The old test is kept, renamed for what it
actually covers — the field partition (`putData` merges top-level keys only, so
a subscription write must not blank the dispute keys beside it) and the dispute
clock's own staleness guard.

### A lost dispute does NOT suspend anybody, and that is the decision

The obvious move is to add the losing outcomes to
`TERMINAL_SUBSCRIPTION_STATUSES`, or make `hasLiveSubscription` false while one
is outstanding, and §83's enforcement would then take sync away on a
chargeback. Three reasons not to:

- **A dispute is not a decision.** `dispute.opened` holds funds and can still
  be won; `dispute.won` returns them. Suspending on `opened` and restoring on
  `won` is a workspace flickering read-only on the network's timetable, and
  §24's rule is that a hold is reversible **and customer-visible** — this would
  be reversible and unexplainable.
- **The provider may already do it.** §79 records that a linked cancellation
  *"fires the usual subscription event"*, so where they cancel,
  `subscription.cancelled` arrives and §83's enforcement already works. Adding
  a second mechanism on top means two things racing to hold one workspace.
  **Whether they cancel on every chargeback is UNREAD**, and that is the
  question to settle before any of this is automated.
- **§21's rule.** Acting destructively on a guess is worse than reporting, and
  the report is what nobody had: §79's finding was that a dispute this
  deployment cannot see is a dispute nobody acts on.

**Pinned by a test rather than left implicit** — *a lost dispute does NOT hold
the workspace by itself, and that is the decision*. A later commit deciding the
other way has to rewrite it on purpose, which is the point of it existing. It
also asserts the dispute **is** on the record, because *not enforced* and *not
recorded* are the two things this most needs to be told apart: the first is a
choice and the second would be §79's finding all over again.

That test attributes its dispute the way a real one has to be — a payment
first, then a dispute carrying `payment_id` and **no** metadata. Handing it a
`metadata.wsId` would have been two lines shorter and would have driven a path
no real dispute takes, which is the trap `disputeEvent()` in
`tests/payments.test.mjs` exists to avoid.

### `disputeByRdr`, and why it is always a boolean

§79 found **Visa RDR enabled by default at a $100 threshold**, auto-refunding
and *appearing as a lost dispute* — which puts a $15 monthly price entirely
inside it and means a dispute there has **no defence stage at all**. So the
flag separates a chargeback that was never contestable from one that went to
the network and lost, which is the difference between an operator having
something to do and not.

`billing.disputeByRdr === true` rather than a passthrough, so the reader gets
`false` and not `undefined` for a dispute that predates the field — an absence
read as "not RDR" is the wrong default on the price that is entirely RDR.

`disputeOpen` and `disputeLost` are **derived, never stored**, for §76's
reason: a stored flag has to be cleared by something, and the only honest
clearer is a later dispute event, which already replaces this one newest-wins
on its own clock. So the derivation is free and cannot go stale.

### Eleven mutations, and two of them found the tests rather than the code

| Mutation | Fails |
|---|---|
| dispute events not in the handled set | **9**, across both files |
| refund events not in the handled set | *every dispute and refund event the server claims to handle is handled* |
| metadata only, no payment-id fallback | **6** |
| **disputes on `paymentAt`** | *a payment landing between two dispute events does not discard the later one* — **and nothing at all before that test existed** |
| the window keeps only the latest id | **4**, including the old-payment attribution |
| the window unbounded | *the payment-id window is bounded and deduplicated* |
| the RDR flag hard-coded false | **4** |
| every dispute reads as open | **4** |
| **every dispute reads as lost** | *a dispute that is still running, and one that was WON, are neither of them lost* — **and nothing at all before that test existed** |

**Both gaps are the same shape and it is this file's standing one.** Every
other test in the file drives `dispute.lost`, where a correct implementation
and a `!!billing.disputeEvent` one give the same answer — so `disputeLost:
true` on a dispute that was **won** passed forty-two tests. A confidently
wrong claim, in the field that says *the money has gone*, on the one screen an
operator acts from. The lifecycle test walks opened → challenged → won and
then each of the three losing outcomes separately, because `accepted` (us
conceding) and `expired` (us not answering in time) are the money gone too and
only one of the three has the word in its name.

§9's rule earning its keep twice in one pass: **a mutation that fails nothing
is a finding about the tests**, and reading the tests would not have produced
either of these — running the mutations did.

**Counts:** Node **656 → 664** (664/664, 0 skipped — exactly the eight added,
seven in `payments.test.mjs` and one in `enforcement.test.mjs`, which is what
says none was lost), Playwright **164/164 in 6.6m**, smoke **51 local · 0
warnings · 0 failed**. All three run.

**The clean Playwright run retires none of the three intermittents** (§2, §77),
and the reason is the standing non-result: none of them fired. It carries no
information about this commit either way, because **no client file changed at
all** and `playwright.config.js` sets no `BILLING_MODE`, so the E2E server
never delivers a dispute and never reaches any line added here. The run is
worth having because `server.js` moved; it is not evidence about disputes.

### Blast radius

`server.js` only — no client file, no served file, no new environment
variable. So `CACHE_VERSION` stays `crmbuilder-v69` and smoke stays **51 local
/ 56 live**, checked against the diff rather than assumed (§41).

**`docs/API.md` gains no route and the count stays 63** — the tenth time §46's
trap applies, and the largest widening yet: nine event types that previously
answered `{ received: true, ignored: 'unsubscribed event' }` now populate seven
new fields on `GET /api/org/billing`, and the attribution contract itself moved
(a second resolution path, with a window on the meta doc behind it). Counted
with `grep -cE "^app\.(get|post|put|patch|delete)\(" server.js`.

**`payout.*` is still unhandled, deliberately**, and it is the family worth
knowing about: §73 found a payment payload carries **no fee field at all** and
§79 found `settlement_amount` is byte-identical on a failed payment and a
successful one — so **revenue cannot be read off payment webhooks**, and a
payout record is the only place the provider's fee appears. That is a reporting
feature rather than an entitlement one, which is why it is not in this commit,
and it is what would fill
[`docs/PAYMENTS.md`](docs/PAYMENTS.md) §5's blank net-rate table.

**§27's six user-facing documents still need nothing**, and the condition is
§81's unchanged: nothing can be bought and no deployment is in paid mode. The
walk still owes two items — §81's seat cap, which is live, and §83's
enforcement, which is not — and it fires with the pricing commit.

### What is still not built

- **Any screen for a dispute.** The fields are on `GET /api/org/billing` and
  the Subscription card does not read them. Deliberate for this commit — §76's
  rule is that a provider's vocabulary needs a decision before it reaches a
  customer, and the audience question is sharper here than anywhere: a dispute
  is between the customer and *their bank*, so there is a real argument that
  the right reader is the operator rather than the owner. That is a decision,
  not a line of markup.
- **Whether the provider cancels on a chargeback.** The one unread fact that
  the enforcement decision above turns on, and a test-mode dispute cannot
  produce it — which puts it beside [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §9's
  events that production would see first.
- **`payout.*`**, above.


---

## 85. A page that says to contact us, and three promises with nothing behind them

`contact@nimbleclerk.com`, on `/privacy` twice and `/terms` once. §79 found the
defect by grepping the five public pages for a **payment** prerequisite and
getting no `mailto:` and no address of any kind, while `privacy.html` said
*"contact us at the address below"* with nothing below it. It flagged rather
than fixed, because **which address goes on a public page is the owner's
decision** — that was the right call and the address is now chosen.

### It was three promises, and the measurement found one

§79 measured the pointer with nothing under it. Walking the pages to fix it
found two more, both in the document §79 did not look at:

| Promise | Where | Had |
|---|---|---|
| *"contact us at the address below"* | `privacy.html`, the rights list | nothing below it — §79's finding |
| *"ask, and we will talk about what that would take"* | `terms.html`, the closing callout | **no contact section at all** |
| *"on request: we will help you answer an access, correction or deletion request"* | `terms.html`, the DSAR clause | the same nothing |

So the contractual document promised a route **twice** and named no way to
reach the other party. Fixing only the measured half would have been this
file's standing shape — the half somebody looked at, closed, with the half
nobody looked at left open beside it.

### The route it DID offer was worse than absent

`privacy.html`'s Contact section read *"use **Report a problem** in the app, or
contact the person who invited you to the beta."*

**`/api/feedback` is `requireAuth`** — checked, not assumed — so the first route
is unavailable to exactly the people who need one:

- somebody whose access request was **declined**. §20 stores their address, so
  we hold personal data about them, and they have no app to report a problem
  in;
- somebody whose account is **already deleted** and wants it confirmed;
- the **stranded last owner** (§15's `wouldStrandTeam`), which the *"Ask us"*
  bullet names as its own reason for existing — the one case where
  self-service genuinely cannot work, so the people it strands are the ones
  with nowhere else to go.

And *"contact the person who invited you"* was never a route to the controller
at all. It is gone rather than demoted: a data subject exercising a right
against us cannot discharge it by emailing another customer.

The in-app route is **kept and re-aimed** rather than dropped, because for the
one thing it is good at it is genuinely better: a bug report carries the
version and the recent console errors (§18), which an email cannot, and §18's
whitelist is why the page can still say we see only the address and the message.
So the ordering is the fix — the address first, for everybody, and *Report a
problem* named for the signed-in reader with something broken.

### Publishing an address created a recipient, which §40's sentence excluded

`privacy.html` closed with **"That is the complete list."** — the exact
sentence §40 records as having been false twice, first omitting GitHub and then
Telegram, both caught by looking at what the deployment does rather than at
what the code could do.

An address is a **third** such recipient: whoever hosts the mailbox holds
whatever somebody writes to it, and they were not on the list. This time the
commit publishing the address would have been the one making the sentence
false, which is the first chance anybody has had to get in front of it rather
than behind it.

**Scoped rather than padded.** The claim is now *"the complete list of what the
app sends anywhere"*, with the mailbox disclosed beside it — because it is
true: nothing in the app sends anything there, and a reader who emails us chose
that route. Listing a mail host among the sub-processors the *app* uses would
imply the app feeds it, which is §40's own objection to putting UptimeRobot
beside Telegram.

**And the host is deliberately not named.** I do not know which provider hosts
mail for the domain, and §69's rule is not to guess a provider; §38 records a
first draft asserting backups *"are encrypted"* before they were, caught before
the commit. A wrong provider named in a privacy notice is that failure in the
one document where it is least affordable. The sentence is true without it, and
**naming it is the owner's one outstanding item here** — ~~on §7's before-live
list~~, because a roster that names Render, Atlas, Google, GitHub, Telegram,
Resend and Postmark and then says "whoever hosts our mail" is honest but
visibly unfinished.

> **It is ImprovMX, answered 2026-10-19 — and naming it alone would have
> rebuilt §40's omission.** ImprovMX is a **forwarder**: it holds no mailbox,
> it relays mail for the domain into an inbox somewhere else. So *"held by
> ImprovMX"* would have named the one party in the chain that does **not** hold
> the message and left the one that does unmentioned — which is precisely
> §40's failure (GitHub, then Telegram), rebuilt by the commit closing it. The
> page names **both hops**, and the destination provider is still unnamed
> because that one genuinely is unknown here and §69's rule has not moved.
>
> **A disclosure can be incomplete in two different ways**, and this section
> only had the first in view: a recipient *missing* from the list, and a
> recipient *listed in the wrong role*. The second reads better than the
> first, which is what makes it worse.
>
> **And the before-live item this pointed at was never written.** `§7`'s list
> has item 2's contact-route row ticked and item 9 is about adding *Dodo* to
> the roster; no item anywhere says "name the mail host". So the sentence above
> deferred a task to a place that did not carry it — §29's thesis in the one
> direction it is hardest to notice, since a pointer to a second place reads as
> having filed the thing. Closing it now is what makes the gap moot rather than
> a dangling reference; the strike-through is there so the next reader does not
> go looking for a list entry that never existed.
>
> **The guard's wording assertion had to move with the page, and it was right
> to break.** The completeness test asserted `/hosts our mail/i`, which is the
> sentence this replaced — §46's trap, except the usual version is a line that
> still *reads* correctly while what it describes has moved. Here the test
> failed loudly, which is the better failure, and it is why the replacement
> asserts on the **paragraph** and on **both hops** rather than on the body
> and one name: `toContainText('ImprovMX')` against the whole body is the
> count-says-nothing shape this section already records, since the name would
> satisfy it from inside a sentence that had dropped the forwarding. It now
> goes stale if the provider changes, which is the point.

### The version pair moved, and that re-prompts everybody

§41's rule is that `TERMS_VERSION` and `terms.html`'s `Last updated` line are
**one fact in two places**, compared with `!==` so any change re-asks. Editing
the page without the constant leaves a reader seeing 19 October while the
server asks about 9 September.

So both moved to `2026-10-19`, and **every account is re-prompted** — which
§41's own framing says is the mechanism working rather than a cost: a change to
the terms is meant to be announced rather than slipped in, and §53 bumped for
one sentence about sub-processors.

**The pricing commit will bump again**, and that is accepted rather than
avoided: §77 records `terms.html` still scoping itself to *"the free beta at
this address"*, which is pricing prose belonging to that commit. Two prompts
for two changes is correct; batching this one into a commit that has not
happened yet would mean a page whose own date disagrees with the server in the
meantime. It costs nothing today because signups are closed (§76), so the only
accounts are the operator's.

`privacy.html`'s date moved on its own — that page is **not** versioned by
`TERMS_VERSION` and deliberately does not prompt (§41), because a privacy
notice is information rather than a contract to accept.

### The guard passed on half its own mutation

Worth more than the fix, and it is §9's rule catching me rather than the code.

The first version asserted that each page carried **at least one** `mailto:`.
`privacy.html` carries **two** — the rights bullet and the Contact section — so
removing the address from the bullet left the count at one and the test
**green**. That is §79's exact defect, surviving the guard written for it,
because a count says nothing about which of them it counted. §50's button-count
finding and §33's two-right-numbers finding are the same shape; this is the
third.

`CONTACT_PROMISES` names each promise and the block it lives in, and the
address has to be reachable **from inside that block**. Two things follow:
removing either address fails, and a page that *stops* promising fails too —
with a message saying to delete its row, because a guard that silently covers
nothing is the no-op-that-reports-success §17 is emphatic about.

Four mutations, each failing exactly one test (§9):

| Mutation | Fails |
|---|---|
| the rights bullet loses its address | *`/privacy` offers a contact route it can actually keep* — **and passed before the per-promise rewrite** |
| `terms.html`'s paragraph loses its address | *`/terms` offers a contact route…* |
| a placeholder (`you@example.com`) | *`/privacy` offers a contact route…*, on the host pattern |
| the unqualified *"That is the complete list."* returns | *the privacy page does not claim a completeness that email breaks* |

**Counts:** Node **664/664, 0 skipped** — unchanged, and that is the useful
figure rather than a null one: it says the `TERMS_VERSION` bump broke nothing,
which in turn says §41's tests are **version-agnostic** (they intercept
`/api/me` rather than pinning a date, exactly as that section claims).
Playwright **167** (164 + the three here), **166 passed**. Smoke **51 local ·
0 warnings · 0 failed**. All three run.

### The one failure, and why a terms bump is the first suspect

*an owner invites, and the colleague joins* — §54's recorded intermittent at
2-in-4. **Naming it is not enough here**, and this is the one commit where that
matters: §41 records a terms change costing **13** failures, ten of them in
journeys that mention terms nowhere and **four of them team-workspace ones**,
because nothing was recorded so the modal came back and sat over a page the
test was clicking. A `TERMS_VERSION` bump re-prompts everybody. So this is
precisely the failure mode this commit could produce, on precisely the family
it produced them in.

**Read before re-running** (§9), and the artifact says it is not that:

- **no `modal`, `backdrop`, `terms`, `agree` or `dialog` anywhere in the page
  snapshot** — §41's signature is a `.modal-backdrop` intercepting a click, and
  there is none;
- the owner's Team screen shows the join **succeeded** — *"2 people"*, the
  colleague listed with a role picker and a Remove button;
- the hard failure, pulled out of the trace rather than the line reporter, is
  `locator('tr:has-text("Added By Colleague")')` not found after 25s. The
  colleague's record never synced back. That is the **sync round trip**, which
  is what §54 records this test being about, on the **owner's** page, which is
  what §54 records both of its own occurrences being on.

**Then discriminated by measurement rather than left at that**, because the
snapshot rules out §41's mechanism and not the whole hypothesis:

| | Result |
|---|---|
| 4 isolation runs, bump in place | **4 pass** |
| 4 isolation runs, `TERMS_VERSION` reverted to `2026-09-09` | **1 FAIL**, 3 pass |

**It fails on the pre-bump code too**, which is §66's standard for this
exoneration (*"it fails identically with this change stashed"*) and is stronger
than §77 could manage. 1-in-4 reverted against 0-in-4 bumped is noise either
side of §54's recorded 2-in-4; the claim is only that the failure exists on
both sides, not that a rate was measured.

The artifact is kept rather than discarded, because Playwright wipes
`test-results/` at the start of every run (§30, recorded as a mistake made
twice) and the eight runs above would have destroyed it.

### Blast radius

`privacy.html` and `terms.html` are in `sw.js`'s `STANDALONE_PAGES` and go
straight to the network, never precached (§19) — **checked rather than
assumed**, which is §41's own rule for these two files. So `CACHE_VERSION`
stays `crmbuilder-v69`. `server.js` is not in `APP_SHELL`, so the constant
needs no bump either. No new served file, so smoke stays **51 local / 56
live**.

`docs/API.md` needs nothing: no route, and no response shape moved —
`termsVersion` on `/api/me` carries a different *value*, which is what that
field is for. §46's check run rather than the route count read.

**§27's walk needs nothing, and that is checked rather than skipped.** Grepped
for the stale wording a contact route could create — *"the person who invited
you"*, *"contact us"*, *"get in touch"* — across `README.md`, `guide.html`,
`USER-GUIDE.md`, `manual.html`, `BETA.md` and `ONBOARDING.md`: **no hits**, and
none of them describes the stranded last owner or pins the terms date. No other
public page promises contact either, so by this commit's own class rule none
needs an address, and adding one to `guide.html` would be the padding §40 and
§41 both name as its own inaccuracy.

### What this closes on §79's list, and what it does not

One of the three site requirements an account verification needs. **Pricing and
a refund/cancellation policy are still missing**, and both belong to the
pricing commit rather than here — a refund policy published now would promise a
refund on something nobody can buy. So **verification is still gated on the
same commit as the price** and its 1–3 days still cannot be got out of the way
early, which was §79's scheduling finding and is unchanged.

### The dispute and refund events are ticked now

§84 shipped the route for seven `dispute.*` and two `refund.*`; §7's before-live
item 14 was the dashboard half, and it was done on 2026-10-19. The endpoint
carries **25** events and the route handles **24** — derived from the four Sets
rather than added up, per §73's lesson about a list written in a second place,
and `payment.cancelled` remains the one that is ticked and deliberately
ignored.

**This closes nothing in §84.** Handling an event and *receiving* one are
different, and the two reads that section is waiting on both need a real
dispute body: whether it carries `metadata` after all (§84 tries it first for
§30's reason), and **whether the provider cancels the subscription on a
chargeback** — the unread fact the decision to surface rather than enforce a
lost dispute rests on. Ticking the boxes is what makes either reachable; §9's
matrix records that test mode may not be able to raise a dispute at all, which
is the next thing to find out.


---

## 86. A price on a page, and the gate it turned out not to be behind

The first commit of the pricing work, and it is two pages: **`/pricing`** and
**`/refunds`**. Nothing charges, `billingMode` is still `free` on every
deployment (§78, §80), and **not one word of
[`docs/LAUNCH-CHECKLIST.md`](docs/LAUNCH-CHECKLIST.md) §2.1's twelve files
changed.**

### The finding: naming a price is not charging one, and that is a schedule

§79 measured three site requirements the payment provider's account
verification needs and found two missing — a page showing pricing, and a refund
and cancellation policy. [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §7 item 2 then
concluded that both *"are the pricing commit's work anyway (§2.1's twelve
files), which means **verification is gated on the same commit as the
price**"*, so its 1–3 days could not be got out of the way early.

**That was wrong, and the two pages shipping without any of the twelve is the
proof.** What it conflated was *naming* a price with *charging* one. §2.1 fires
on the second: the twelve files say the service is free and that there is no
payment, and **all of that is still true**, because `/pricing` states the price
*and* that early access is free. `terms.html`'s *"There is no payment, no
subscription, and no contract term"* stands, `welcome.html`'s beta box stands,
`guide.html`'s opening callout stands. A reader meets one coherent claim rather
than two.

So nothing here needs the `TERMS_VERSION` bump (§41) or §27's walk — and
**verification, the longest-running item on that list, can now run in parallel
with the biggest one** instead of behind it. That is the whole value of having
been wrong about it.

### The two promises are §80's sentences, and the three absences are the substance

`/pricing` carries [`docs/PAYMENTS.md`](docs/PAYMENTS.md) §5's wording
verbatim — *we will tell you before anything changes*, *you will not be charged
without being asked* — because §80 established that **"free for early users"
with no qualifier is read as PERMANENT**, which is the one thing §2.4's
grandfathering decision explicitly declines to promise. Notice, not duration.
Those are the same sentences the app's own Subscription card uses in free mode,
so the page and the product make one claim; §80 pinned the card and nothing
pinned the page, which is the half a prospect reads first.

**What the page does NOT say is where the work went.** Each is a sentence it
would be natural to add and that cannot currently be kept:

| Not said | Why |
|---|---|
| *free for ever* / *always free* | §2.4 decided there is **no permanent free tier**. The shorter wording makes the one promise the decision refuses |
| the **7-day trial** | decided, and it is a field on the provider's product rather than code — but §82 could not verify that a **static** payment link honours it, and that read is still open (§7 item 13). If it does not, the trial needs a Checkout Session, which reverses §72's measured *"one signing secret"* credential surface. §38's rule: a page is the last place to state an intention as a fact, and this one would be quoted back at the checkout that broke it |
| a **pre-renewal notice** | §3's lever 3, and it is **not built**. What stands in for it is `/refunds` covering a renewal explicitly |

All three are asserted as `not.toContainText`, so adding any of them is a
decision rather than a line that slips in — §80's own technique, where the bad
phrasing is named in the guard.

### The refund covers a renewal, and that is the deliberate half

§3's lever 5 is a 14-day refund, and the obvious wording — *your first
payment* — excludes precisely the dangerous case: **a renewal somebody had
forgotten**, which leaves a chargeback as their only route. §79 found Visa RDR
enabled by default at a $100 threshold, which auto-refunds and **auto-loses**,
so at $15 a disputed charge *cannot be contested at all*. There is no appeal
stage to be good at, so the only lever left is making sure nobody needs one.
The policy therefore covers **any payment, including a renewal**, and says so
in those words.

Lever 4's two-click cancel names the real controls — the card is headed
**Subscription** and the button reads **Manage subscription** (§74) — checked
against `js/app.js` rather than written from memory, which is §53's lesson
about naming UI that does not exist.

### One fact in two places, noted at both ends

`/refunds`' data section publishes the same three facts `readOnlyState()` tells
a held workspace: **cloud sync pauses, nothing is deleted, local use and export
continue** (§24 stage B for the behaviour, §36 for export surviving every
role). That is the `TERMS_VERSION` shape (§41), so both ends carry a note
saying the other exists — and the published half is read *before* anybody pays,
which makes a disagreement a **broken promise** rather than a wording drift.

Asserted as the three **facts** rather than as the sentence: pinning
`server.js`'s exact string would make a wording improvement in the app fail a
test about a web page.

**This commit creates a SECOND unavoidable duplication, and it is handled
differently because the failure is worse.** §71 kept the price out of this
repository entirely — *"nothing in this repository names a price"* — which
avoided §29's drift by having only one copy, in the provider's product. A
pricing page cannot do that: it has to state a figure. So the price now lives
in two places, and unlike the three data facts **the provider's copy is the one
a customer is actually charged** — so a disagreement is not a stale document,
it is a published figure that does not match the debit. The rule is therefore
tighter than §27's walk: change the product and the page in the same sitting.
Written into §27's list rather than only here, because the walk is what gets
read.

### The currency cost is named rather than hidden

[`docs/PAYMENTS.md`](docs/PAYMENTS.md) §5 reversed its own *"GBP primary"*
decision to `$15` on instruction, and §3's lever 2 is that **a
foreign-currency line on a card statement is itself a dispute trigger**. So the
page says prices are in US dollars and that a non-USD card will see a
converted figure that moves with the rate. It deliberately claims **no
mechanism**: the provider's own conversion fee is documented (§79) and has
never been seen on one of our charges, and §38's rule applies.

The **statement descriptor** — lever 2's other half, and still an open support
question (§8) — is not mentioned, because nothing is charged yet so there is no
statement line to recognise. It belongs in the before-live list, not here.

### No infrastructure on either page, on instruction

Neither page names a host, a provider, a sub-processor or a mailbox. The
payment provider is disclosed on `privacy.html` as a recipient of personal data
**when the first real payment runs** (§2.3, and §52's condition with §41's
precedent), which is a different question from who the customer buys from.
`privacy.html`'s roster is untouched.

### A mutation that fails nothing, and §63's path gate is why

Both pages went into `sw.js`'s `STANDALONE_PAGES` per that list's own rule —
*anything served that is not the app belongs here*. **Removing them again
fails no test at all**, measured rather than reasoned.

§63 replaced the navigation branch's list check with a **path gate**
(`if (url.pathname !== '/app') return`), so every navigation that is not the
app already returns early. The list is no longer what protects a navigation.
Same shape as §61's `Content-Length` and §83's doubled mode check: two guards
where neither half alone is load-bearing, so a reader who mutates one concludes
it is dead code.

What the entries still do is the **non-navigation** case — a `fetch()` or a
prefetch would otherwise fall through to the cache-first branch and be kept,
which is exactly how `legal.css` shipped stale for a whole cache version (§47).
Nothing fetches these pages as subresources, so there is no reachable failure
and therefore **no test**, which is the status of §30's `UNSAFE_KEYS` and §52's
`redactKey` and is worth saying rather than implying.

**And it settles the `CACHE_VERSION` question from the other direction:** a
worker that predates these pages cannot answer them with the shell, because it
already has the gate. §58 bumped for `welcome.html` and had to, before the gate
existed. **No bump here** — measured, not assumed (§41's rule).

### A test that failed on whitespace, against a page that was right

The first run of the pricing guard failed on
`toContainText(/tell you before anything changes/i)` — and the artifact showed
the sentence present. The source **wraps** that phrase across lines, so the
element's text carries a newline a regex with a plain space cannot cross. A
failure with nothing to do with the claim being asserted, which is §4's
async-render trap in a different instrument: read the artifact first (§9), not
the second run. `\s+` now, which also survives re-wrapping the paragraph —
and prose gets re-wrapped.

### `/welcome` was missing from the link guard

§48 built that guard after `docs/product-tour.html` shipped a *"Read the
manual"* button pointing at a build-artifact URL, and its list was
`/guide`, the two doc pages, `/privacy`, `/terms`. **Not the landing page** —
the one page a stranger meets first, carrying **15 anchors across 8 distinct
paths** — counted rather than estimated, because a figure in a note is a figure
somebody later quotes. Found while
adding the two new pages, both of which link out to each other and to the legal
pages. Named rather than quietly closed, because the gap is the interesting
part: the guard was built from the page the defect was *found* on.

### Verified

Eight mutations. Seven fail the test that names them; the eighth is the
path-gate finding above.

| Mutation | Fails |
|---|---|
| the notice promise dropped from the callout | *the pricing page promises notice rather than duration…* |
| *always free* in place of *free while in early access* | the same test, on the permanence assertion |
| a *7-day free trial* sentence added | the same test, on the trial assertion |
| *Nothing is deleted* removed | *the refund page states what a lapsed subscription does to your data* |
| *we will email you before each renewal* added | the same test, on the notice assertion |
| the refund route's address removed | */refunds offers a contact route it can actually keep* |
| `pricing.html` / `refunds.html` out of `PUBLIC_ROOT_FILES` | **6 E2E tests**, and smoke's *the shareable pages are reachable* — which reports **"served something else"** rather than a 404, because the catch-all answers with the landing page. §28's content-not-status rule doing exactly its job |
| both pages out of `STANDALONE_PAGES` | **nothing** — see above |

Each content mutation fails **only** its own test, which is what says the two
new tests cover different things rather than one twice.

**Measured rather than judged**, driving all three touched pages at
1440×900 / 390×844 / 320×568 in both colour schemes: **no horizontal page
overflow at any width**, the pricing table never exceeds its `.table-wrap` (so
it never needs to scroll, the same result §47 measured for the roles table),
`welcome.html`'s topbar stays **48px** with a fourth nav link — §58's finding
was a page head going 39px → 130px when something wrapped — and both pages
theme correctly in light and dark, which the three-branch pattern (§60) gives
and the dark-mode loop now asserts.

No new CSS and no new class: both pages are built entirely from what
`legal.css` already defines, checked by listing its selectors rather than
assuming — §27's invented-class trap has now cost time five times, and
`.table-wrap` / `table` exist only because §47 added them for `/guide`'s role
ladder.

**Counts:** smoke **51 local · 0 warnings · 0 failed** — *unchanged, and the
check reports `6 pages` where it said 4*, because the reachability check is a
loop and both new pages went into it. An unchanged count beside added coverage
reads as a mistake later unless it is written down (§46, §58).

Playwright **167 → 176**, run: **176 of 176 in 6.8m, clean.** The total is
**counted rather than derived** (`playwright test --list`), which is the only
reason it can be accounted for exactly: **2** new tests, **+2** in the
standalone-pages loop, **+3** in the link guard (`/welcome` as well as the two
new pages), **+2** in `CONTACT_PROMISES`. The dark-mode loop adds **none** —
its page array is inside a single test, which is the sort of thing a derivation
gets wrong in the plausible direction. §73 and §74 both record what carrying a
figure forward costs; this one was listed.

**A full run was warranted rather than habitual**: §9 names adding a served
file as blast radius, because production 404s unless four places agree. And the
clean run **retires none of the three intermittents** (§2, §77) — none of them
fired, which is the standing non-result rather than evidence.

Node **664**, untouched and not re-run: no server behaviour moved — one
allow-list entry and two comments — so there is nothing a Node test could see.
Said plainly rather than implied, because an unchanged count and an unrun suite
look identical in a commit message (§9).

### Blast radius

`pricing.html` and `refunds.html` are new served files, so §3's four places had
to agree: `PUBLIC_ROOT_FILES` in `server.js` (the extensionless alias is
generated, so `/pricing` and `/refunds` come free), `STANDALONE_PAGES` in
`sw.js`, `tests/smoke.mjs`, and `CACHE_VERSION` — which **does not move**, for
the measured reason above. Both are deliberately **absent** from `index.html`
and `APP_SHELL`: they are not part of the app, the same call §47 made for
`js/manual-toc.js` and §58 for `welcome.html`.

`docs/API.md` needs nothing: no route and no response shape moved, and it does
not list public pages — §46's check run rather than the route count read.

**§27's six user-facing documents need nothing from this commit, and the
condition is the same one §81, §83 and §84 carried: nothing can be bought.**
No capability moved. The walk still owes **two** items — §81's seat cap, live
since it shipped, and §83's enforcement, built and not live — and it fires with
the commit that flips `billingMode` to `paid`.


---

## 87. The billing card's gap was the write, and a probe that healed what it looked for

One E2E test, and three of the four findings are in the test rather than in the
product — which is what §9's *check it against the broken state* is for.

### The gap was narrower than it was reported

I said in conversation that **no E2E test drove the billing card**. Wrong:
§78 shipped two — *the billing card previews who would be affected before
anything is flipped* and *changing the window moves every grace date*. Both
read the card while `billingMode` is still `free`, which is the state that card
exists for (§78's dry run, whose whole point is being lookable at before the
switch can affect anybody).

**What neither does is press the button.** So the gap was the *write* — the
confirmation, the flip, and the re-render that follows — not the screen. The
claim never reached this file, so there is nothing to correct in place; it is
recorded because *"nothing tests this"* and *"nothing tests this half"* are a
long way apart when deciding what to write.

### The coupling is in the data, and it is permanent

`setBillingMode` stamps `billingModeSetAt`, and **no route ever clears it** —
switching back to Free rewrites the stamp rather than removing it. So the
**first flip retires the preview wording for the whole life of the store**, and
the two tests above assert exactly that wording.

Measured rather than predicted: placed earlier in the file, the new test failed
both of them. It sits after them now, and `playwright.config.js` is
`fullyParallel: false, workers: 1`, so file order *is* the ordering.

**Named at both ends**, which is the half that makes it survivable: the preview
assertion carries *"must run BEFORE the flip test — billingModeSetAt is
permanent"*, and the flip test's own comment says why it must run last. A
reorder then fails with a reason rather than as a mystery about dates.

The alternative — restoring `setAt` to 0 — needs a store edit, which is
`editStore`'s stop-edit-start (§12) and is a Node-test facility. No route
exposes it, and inventing one to serve a test would be a route a deployment
could call.

### The read-back I wrote to catch a cache bug healed it instead

The one worth keeping. `renderAdmin()` re-fetches the panel **without**
`fresh=1`, so a missing `platformCache` invalidation redraws the pre-flip card —
§78's own bug, and §40's and §24's before it, which have now eaten three
buttons between them.

My test polled `/api/admin/platform?fresh=1` to confirm the write, **above** the
card assertions, with a comment claiming that poll was what would catch it. It
is not: **`?fresh=1` REWRITES the cache rather than bypassing it** (§33), so the
probe handed the stale render a fresh body. Measured — the `nocacheclear`
mutation **passed**.

That is §47's self-healing probe in a new place: there, a sweep for cache
poisoning ended on a path whose response *is* the app shell, which put the real
shell back and healed the finding before the dump. Here one line of
confirmation repaired the defect the next line was asserting on.

The card assertions come first now and the read-back goes below, so
`nocacheclear` fails on `12 × … unexpected value "enabled"` — and the comment
says which assertion carries the weight rather than claiming it for the poll.

### A failure with no name on it, from a `finally`

`norerender` first failed as a bare **45-second test timeout**. The card never
redraws, so `[data-billmode="free"]` is still *disabled* — and the `finally`
clicked it, hanging until the test budget ran out and burying the real
assertion. `.catch(() => {})` does not help: the click is still awaited.

The restore goes through `PUT /api/admin/billing-mode` now. **The cleanup must
survive a broken screen**, because the screen is what the test is about; the
sibling signup test (§16) restores through the UI and carries the same latent
hazard, left alone rather than widened into this commit.

### Verified

Five mutations, each failing by name (§9):

| Mutation | Fails |
|---|---|
| the confirm is shown and its answer ignored | *dismissing the confirmation must leave the mode alone* |
| no `renderAdmin()` after the flip | *the flipped mode is the one you cannot press* |
| `platformCache` not invalidated | the same assertion — **and nothing at all before the reordering above** |
| `data-billmode` renamed | the plans row never appears |
| the preview wording dropped | *§78: unflipped dates are a preview and must say so* |

**Two mutations failing one assertion is expected rather than sloppy** — they
are two mechanisms that both leave the card un-redrawn, so a reader should
expect one failure per *assertion* rather than per test (§78's own note, and
§83's doubled mode check from the other side).

**A sixth was written and dropped.** An anchor on the `platformCache` line
alone matches **seven** sites in `server.js`; it is anchored on the log line
below it, which is unique to this route. A mutation script that silently
mutates the wrong site is worse than one that fails to apply.

### Blast radius

`tests/e2e.spec.js` only — no product file, no served file, no route. So
`CACHE_VERSION` stays `crmbuilder-v69`, smoke stays **51 local / 56 live**, and
`docs/API.md` and §27's six user-facing documents need nothing. Checked against
the diff rather than assumed (§41).

**A full run was warranted rather than habitual**: the test flips a stored
operator lever, which §16 names as leaking into everything after it, and the
suite is sequential so the `finally` is what bounds that.

### The retry hazard, closed after the first run was already launched

`playwright.config.js` is `retries: process.env.CI ? 1 : 0`. So **on CI this
test can run twice** — and the second attempt starts with `billingModeSetAt`
already stamped by the first, because the `finally` restores the *mode* and
nothing can restore the *stamp*.

The first version asserted the preview wording before flipping. That is true
the first time through and false on every retry, so a retry would have failed
on the wording rather than on whatever actually went wrong — a failure
reported in the wrong place, which is the shape this file keeps collecting and
which the `finally` above had just produced in its own way.

Dropped: the positive preview claim belongs to *the billing card previews…*,
which runs first and only once. **Everything this test asserts now survives a
retry unchanged** — in free mode the card still says nothing is enforced, the
current mode is still the one that cannot be pressed, and after the flip there
is still no preview to find. Checked rather than argued, by walking the
pre-flip state a retry would actually see.

### The run that cost an hour, and it was my own command

The first full run came back with **41 failures across eight describes**, every
one of them anonymous onboarding with `signIn()` hanging on `.user-chip`. It
reads as an auth regression and it was nothing of the sort: `POST /auth/dev`
was answering **500**, because `data/e2e` **did not exist** — the server had no
store directory, so §55's router wrap was correctly turning a failed
`FileStore.save()` into a status.

**`npx playwright test --list`, run for a test count while the suite was in
flight, is what deleted it.** The full write-up is in §4; the part that belongs
here is the diagnosis path, because it is §9's artifact rule earning its keep
against a strong temptation to re-run: the trace gave the 500, the 500 gave the
missing directory, and the missing directory named the command. Nothing in any
artifact points at it, and re-running would have "fixed" it while leaving the
cause in place to happen again.

**What was observed at commit time, and §9's rule is why it is written this
way:** the three billing tests pass in file order, each of the five mutations
fails the test that names it, and the clean re-run was **still in flight** —
59 of 177 with zero failures. So the total was measured and the pass was not,
and a figure that has not been observed does not go in a commit message.

### One period with two names, and §86 is what gave it the second

Raised as *"terms still says free beta"* — and `terms.html` is **true**, which
is the first thing to establish rather than the last: nothing charges,
`billingMode` is `free` on every deployment, so *"There is no payment, no
subscription, and no contract term"* is a statement of fact. §86's finding was
that §2.1 fires on **charging**, not on naming a price, and `pricing.html`
carries that reasoning in its own header comment. Rewriting the terms now would
publish an intention as a fact, which §38 and §40 both record as the one thing
a legal page must not do.

**What is genuinely wrong is the vocabulary, and I introduced it.** Measured:
**beta** 20 (`welcome.html` 8, `terms.html` 9, `privacy.html` 2,
`guide.html` 1) against **early access** 6 (`pricing.html` 4, `refunds.html` 1,
and §80's free-mode card). §86 took the phrasing from
[`docs/PAYMENTS.md`](docs/PAYMENTS.md) §5, whose argument was against *"free
for early users"* — read as permanent — and **not** in favour of one of these
two over the other. So §5 does not choose between them and the split is an
accident of which file was open.

**Not renamed here**, and the reasoning is in
[`docs/LAUNCH-CHECKLIST.md`](docs/LAUNCH-CHECKLIST.md) §2.1 where the charging
commit will meet it: the words are not synonyms — *beta* carries **unfinished,
data may be lost**, which §19's recorded acknowledgement rests on, and *early
access* carries **free for now, with a price published**. Each page says "it is
free and nothing is charged", so a reader reconciles them; renaming either
direction touches legal text and therefore that list and `TERMS_VERSION`
anyway. Settle it there, in one direction, across all twenty-six.

**And §2.1's own count was written in seven places.** Adding `pricing.html` and
`refunds.html` to that table takes it to **thirteen** distinct files, so every
*"§2.1's twelve files"* in this file went stale at once — §29's thesis, in the
number §29 exists to warn about. Re-synced in the checklist and **removed** from
this file's live pointers rather than corrected in them: the table is the
authority, and a reference that carries no number cannot go stale. §86's
narrative keeps its figure, because one of those is a verbatim quotation of
what [`docs/PAYMENTS.md`](docs/PAYMENTS.md) said at the time.

### The run finished clean

**`177 passed (9.0m)`** — and that is in §2.
Recorded in the next commit rather than amended into the pushed one, which is
the same distinction: a message that was honest when written stays as written,
and the figure it declined to claim arrives where figures live. **The clean run
retires none of the three intermittents** (§2, §77): none of them fired, which
is the standing non-result rather than evidence.

**And one list was deliberately left short.** §47's *the files those pages load
are not cached either* walks `/guide`, `/privacy`, `/terms` and the manual;
§86 added `/pricing` and `/refunds` to the other three page arrays and not to
that one. Checked rather than missed — both new pages load **exactly**
`/legal.css` and `/js/boot-theme.js`, which is byte-for-byte what `/guide`
already loads, so an entry there would cover nothing. §40 and §41's rule:
padding a roster is its own kind of inaccuracy, and a list that grows by
no-ops stops being read.
