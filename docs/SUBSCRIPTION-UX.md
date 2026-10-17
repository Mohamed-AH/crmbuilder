# Subscription lifecycle and customer experience — the plan

> **Status: a plan, and PHASES 0, 1 AND 1.5 ARE NOW BUILT** — `CLAUDE.md` §74
> is the record of what shipped for the first two and of the three places this
> document was wrong or over-specified; §76 is Phase 1.5, which this document
> did not contain and which is argued for in its own section below.
> **Phase 2 is UNBLOCKED as of 2026-10-17** — the price is decided
> ([`PAYMENTS.md`](PAYMENTS.md) §5) and most of the enforcement turned out to
> be shipped already, so that section is rewritten; Phase 3 is untouched.
>
> It was written before any code so the decisions were visible and arguable,
> which is §48's and §64's precedent: the question to ask is *when* a thing can
> hurt you, and put the check there. This lives in `docs/` (the maintained
> tier, §29) and 404s in production by construction (§28), which is what lets
> it be blunt. **The audit in §1 is kept as it was taken** — it is what sized
> the work, and editing a plan's premises after the fact loses the reason the
> plan was shaped that way (§29).
>
> **Research date 2026-10-14.** The provider half is first-party
> (`docs.dodopayments.com/llms-full.txt`); the industry half is marked where it
> is secondary.

[`PAYMENTS.md`](PAYMENTS.md) is the rail, the price and the tax. This is what
happens to a customer *after* they pay, which is a different problem and is the
one almost entirely unbuilt.

---

## 1. The honest audit

The shape of it in one line: **the money-in path is well built and the
money-management path does not exist.**

Everything §69–§73 shipped is about receiving and recording a payment —
signature verification, ordering, idempotence, the clock that keeps a
cancellation cancelled. That half is proven, including against the provider's
own replay machinery. What a subscriber can *do* afterwards, inside the
product, is: read four rows on a card, and press a button that takes them to a
checkout page.

### Against the expectations list, row by row

| Expectation | Where we are | Honest grade |
|---|---|---|
| **Value for money** | a product question, not a billing one — out of scope here | n/a |
| **Transparency** — next charge, invoices, history | next charge date is shown; **no invoices, no payment history, no receipts**, and the card **contradicts itself** on `paused` and `cancelled` (§9) | **poor** |
| **Flexibility** — upgrade, downgrade, pause, cancel | **none.** No plan change (one product), no pause, no cancel, no payment-method update. Every one of these is "contact us" | **absent** |
| **Self-service** | **none.** There is no portal link | **absent** |
| **Reliability** — predictable billing, failure recovery | the webhook path is the strongest thing here. Recovery from a failed payment is the provider's dunning, **and nobody has confirmed it is switched on** | **good / unverified** |
| **Support & proactive comms** — renewal reminders, card expiry | **none from us.** And §53's BYOK mail cannot be used for this (below) | **absent** |
| **Fair treatment** — proration, grace periods | nothing to prorate (one product); no grace logic because **nothing is enforced at all** | **n/a / absent** |

### What that means in practice

**A paying customer today cannot cancel without emailing you.** §3 names that
exactly: *"a cancel flow that requires an email is a dispute generator"*, and
§64 records the threshold it feeds — Visa VAMP at 1.5% with **$8 per disputed
item and no warning tier**. One disputed £49 subscription breaches 0.65% by
value until monthly volume passes about £7,500. **The cancel flow is not a
UX nicety at this volume; it is the chargeback control.**

**And the one control the card does offer is actively harmful.**
`GET /api/org/billing` returns `checkout: checkoutUrl(wsId)` unconditionally,
and the card labels it *Manage payment* once a record exists. A subscriber
pressing it gets a **checkout page for the product they already own** —
reachable on production right now by every workspace owner.

---

## 2. Duplicate subscriptions: email is the wrong key

### What actually happened

Six subscriptions, four customer emails, two workspaces. The mechanism is not
mysterious: we authenticate with Google and know a **verified** address, then
hand the customer a checkout that asks for an email again, and whatever they
type becomes the provider's customer record. Nothing connects the two.

### Three things the provider's own docs settle

1. **There is no provider-side duplicate guard.** `idempotency_key` exists for
   usage-meter events and credit-ledger entries only — **not for subscription
   creation**. Nothing refuses a second subscription for the same product.
2. **The static payment link cannot bind to a known customer.**
   `AttachExistingCustomer` / `customer_id` is available on the API paths
   (Dynamic Checkout `POST`, Checkout Sessions `POST`) and **not** as a static
   link query parameter.
3. **Locking the email still does not guarantee one customer record.** From
   their blocklist documentation: *"Checkout can create a new customer record
   for a returning email, so a block on a single customer ID could be
   bypassed."* So email is not a reliable key **even when we control it**.

### What the industry does

Stripe Checkout does not block duplicate subscriptions either — this is a
**merchant responsibility everywhere**, not a gap in this provider. The
recurring pattern across real implementations (secondary; these are open-source
fixes rather than vendor guidance — sources at the foot):

- **Gate the checkout server-side** when a live subscription exists, and route
  to upgrade or portal instead. Several return **409** rather than a link.
- **Check every non-terminal status, not just `active`** — `past_due`,
  `paused`, `trialing`, `incomplete`, `on_hold` are all evidence of a paying
  customer. Filtering on `active` alone is the common bug.
- **Serialise the check-and-create.** A plain preflight read is non-atomic, so
  two concurrent presses both pass it.
- **Do not rely on webhooks alone** — reconcile, because a missed delivery
  leaves the gate open.

### The decision

**The key is `wsId`, and the only reliable gate is ours.** Three layers, and
only the second one actually closes it:

| Layer | Buys | Does not buy |
|---|---|---|
| **Prefill + lock the email** (`email=…&disableEmail=true`) | the provider's customer email becomes the Google-verified one, so the portal's email-based sign-in is usable and support can match a payer to an account | **does not prevent duplicates** — their docs say a returning email can still mint a new record |
| **Gate the checkout link on `wsId`** — no link when a non-terminal subscription exists | **this is the fix** | nothing, if the gate reads only `active` |
| **Reconcile** — compare what we hold against the provider | catches what a missed webhook let through | is a backstop, not a control |

**This reverses §71's no-prefill decision for the email field only.** That
section declined prefill because *"a billing address is not necessarily a
sign-in address, and this is the one screen where guessing wrong costs somebody
money"* — right about the **address**, wrong about the **email**. An address is
a billing fact we do not know; the email is an **identity** fact we have had
Google verify. The address fields stay untouched.

---

## 3. The plan, in the order it should be built

### Phase 0 — stop the bleeding · ✅ **BUILT** (`CLAUDE.md` §74)

All three are ours, need no provider feature, and are small. They are grouped
because they share a `CACHE_VERSION` bump and a mirror sync (§65), which is the
thing that should happen once rather than three times.

1. **Gate the checkout link.** `checkoutUrl(wsId)` returns `null` when the
   workspace holds a subscription in any **non-terminal** status. The status
   list is the decision, not the gate: `active`, `paused`, `past_due`,
   `on_hold` are non-terminal; `cancelled`, `expired`, `failed` are not.
   Writing it as an explicit **terminal** set and treating everything else as
   live is the safer default — an unrecognised future status should block a
   second purchase rather than permit one.
2. **Suppress the next-payment row** for any status that will not bill. §9
   found it contradicting both `paused` and `cancelled`. Key on `status`, **not
   on `paused_at`** — that field survives a cancellation (§9's correction).
3. **Prefill and lock the email** — `email=<verified>&disableEmail=true`, from
   the session only, never a parameter (§5).

**Not atomic, and say so rather than implying otherwise.** The gate is a read
followed by a render; two tabs can both see no subscription. The window is the
seconds between a first checkout and its webhook, and closing it properly needs
a lock this architecture has nowhere to put. **Accepted** at this volume, and
recorded so it is a known limit rather than a surprise — the reconciliation
in Phase 3 is what catches what slips through.

### Phase 1 — give them control · ✅ **BUILT** (`CLAUDE.md` §74)

> **Three corrections §74 records, so this section is not read as the record.**
> The *"never both"* rule below is right for a live subscriber and wrong for a
> cancelled one, who gets checkout *and* the portal — the alternative is a dead
> end for a receipt. The portal URL is held **whole** in `DODO_PORTAL_URL`
> rather than composed from a business id, because composing means deriving a
> host from the mode and §73 records what that already cost. And storing
> `customer_id` was **declined** on instruction: the static link stays, which
> keeps §70's no-customer-identity rule intact at the price of one email step.

**The static Customer Portal link is a string containing only `business_id`:**

```
test   https://test.customer.dodopayments.com/login/{business_id}
live   https://customer.dodopayments.com/login/{business_id}
```

No API key, no customer lookup, no round trip. §71 deferred the portal because
it *"wants the portal URL shape confirmed against a real account rather than
guessed"* — **that condition is now met**, and the shape needs nothing we do
not already have.

One link closes six rows of the audit above: **cancel** (immediately or at
period end), **pause and resume**, **update the payment method**, **reactivate
an on-hold subscription**, **download invoices**, and **billing history**. It
is the single highest-leverage item in this document by a wide margin.

Three things to know before building it:

- **It replaces the checkout button for a subscriber**, which is how Phase 0's
  gate stops being a dead end. *Manage subscription* → portal; *Subscribe* →
  checkout; never both.
- **Test mode does not send portal sign-in emails.** So the static link cannot
  be driven end to end in test mode — that needs the dynamic link or an API
  session, which needs `customer_id`, which §70 deliberately does not store.
  **This is a real decision to take**, not a detail: storing
  `customer.customer_id` (the opaque id alone — never the email, name or
  address) would buy one-click portal access with no email step. It is the
  narrowest possible widening of §70's inventory and it should be argued on
  its own rather than assumed either way.
- **Portal cancellation defaults to the next billing date**, not immediately,
  and *Cancel Now* is hidden for on-demand subscriptions. That is the right
  default and §9 already records that a deferred cancel arrives as
  `subscription.updated` carrying `status: "active"` — so the card must not
  read that as "nothing happened".

### Phase 1.5 — say what to do about it · ✅ **BUILT** (`CLAUDE.md` §76)

**This phase was not in the plan, and it is the tail of Phase 0's own
transparency row rather than a new idea.** §1 graded transparency **poor** for
two reasons: the card contradicted itself, and there were no invoices or
receipts. Phase 0 fixed the first and Phase 1 answered the second by delegating
it. Neither touched a third thing §1 did not separate out — **the card was
honest about state and silent about action**, and it printed the provider's own
`past_due` and `on_hold` at a customer.

It is here rather than folded into Phase 0 because **Phase 1 is what made it
possible**: advice is only worth giving if there is somewhere to act on it, and
until the portal link existed a customer told their payment had failed had
nowhere to go. Built in this order, the dependency is visible; built the other
way round it would have been a dead end with wording on it.

Three pieces:

1. **The status row carries a label**, and the provider's snake_case appears
   nowhere. An unrecognised status falls through to the raw word and gets **no
   advice** — §73's warning about a vocabulary built from one sample, and the
   reason it does not apply is that these are the tails of an enumerated event
   list rather than observed values.
2. **`subscription.update_payment_method` is handled.** It was ticked on the
   endpoint and discarded, and it is the warning *before* a `past_due` — so the
   first a customer knew was losing access. It is a **request, not a state**:
   the status stays `active`, so the notice sits beside a healthy status. There
   is **no stored flag**; the card derives it from `subscriptionEvent`, so the
   next subscription event retires it through machinery that already exists.
3. **`payment.processing` is handled**, for the India case: a mandate debit
   sits there for real time, and a first payment in flight was being reported
   as one that had been recorded.

**The audit, re-graded — and §1 is deliberately left as it was taken** (§29):

| | §1 | After Phases 0, 1 and 1.5 |
|---|---|---|
| Transparency | poor | **good** — no contradiction, no jargon, and the states that need action say so. Still no in-product receipts; the portal has them |
| Flexibility | absent | **delegated** — cancel, pause, resume and card update are hosted. Plan change is still impossible (one product) |
| Self-service | absent | **done** |
| Reliability | good / unverified | **unchanged** — dunning unconfirmed, and nothing can see a dead endpoint (Phase 3) |
| Proactive comms | absent | **unchanged, and cannot be ours** |
| Fair treatment | n/a / absent | **unchanged** — nothing is enforced (Phase 2) |

**What it did NOT do**, so the omissions read as decided: `payment.cancelled`
is still ignored on purpose (the customer cancelled it themselves), and refund
and dispute events are still unhandled — see Phase 2, where they belong.

### Phase 2 — enforcement · **UNBLOCKED 2026-10-17**, and smaller than it looked

The price is decided ([`PAYMENTS.md`](PAYMENTS.md) §5): **$15/month per
workspace, up to 5 users, $150 annual, 7-day trial with a card up front** —
behind a `billingMode` switch that is **`free` until an operator flips it**, so
nothing is charged on the day this is built.

**And the legal premise is verified rather than assumed, which is the other
thing that was blocking.** The MSA (dated 2026-02-26, read 2026-10-17) appoints
Dodo reseller and Merchant of Record and puts global VAT/Sales Tax on them —
[`PAYMENTS.md`](PAYMENTS.md) §2 has the sections. That matters here because the
*price* this enforces is tax-inclusive on the customer's side and tax-free on
ours only while that holds, so **`billingMode: 'paid'` and BYOP being disabled
are one state, not two** (§7 step 12). It does **not** mean the commercial
terms are known: the fee, the chargeback set-off and the FX into INR are still
unread, so nothing here can be sized against a margin.

**The headline finding is that most of this is already shipped.** Verified in
the source rather than recalled:

| What non-payment has to do | Where it already is |
|---|---|
| pause cloud sync | `server.js:3130` — refuses the **push** on a suspended org |
| still let them read | the same branch still serves the **pull** |
| say why, on screen | `readOnlyReason`, surfaced by `js/app.js:1317` and latched so a debounced push cannot repeat it |
| not lose what they typed while paused | `js/cloud.js:213` — the push watermark advances **only** when the push was accepted. §24 stage B records this as the bug that would have silently discarded everything typed during a pause |
| keep local use working | nothing to do — the app is offline-first (§3) |
| keep export open | nothing to do — §36 keeps it open to every role, deliberately |
| never delete anything | `deleteAccount()` is unreachable from here (§5, §15) |

So Phase 2 is **wiring, a trigger and some wording** — not building a
suspension system. What actually has to be decided and written:

1. **`billingMode` as an operator lever**, beside `signupMode` and
   `orgCreation` in the `platform` document, with §16's precedence rule (a
   panel decision beats the environment and survives a redeploy). Three keys,
   not one, and **one string added to `OPERATOR_DECISIONS` in
   `scripts/restore.mjs`** — which is where that list lives, not in
   `server.js`. Missing it means a restore silently reverts the mode, which is
   §17's own recorded failure with money attached.

   **The logic, written out because the two existing levers are the template
   and one of them is not quite enough** (`server.js:108–175`):

   | | |
   |---|---|
   | values | `'free'` · `'paid'` — and `BILLING_MODES` is the allow-list a stored value is checked against, so an unrecognised one falls to the default rather than being trusted |
   | **default** | **`'free'`**, and this is load-bearing rather than tidy: a deployment that has never set the key must not start charging, and neither must one whose settings read *fails*. `signupMode()`'s `catch` already has exactly this shape — *"a settings read must never be what stops people signing in"* — and here the equivalent is that it must never be what starts a charge |
   | precedence | stored → `BILLING_MODE` env → `'free'`. §16's rule, so a redeploy cannot undo an operator and the env var only decides for a deployment that never set one |
   | cache | in-process, invalidate on write, **30s TTL** — the same `SIGNUP_MODE_TTL_MS` constant, because the reason is the same: a multi-instance deployment converges rather than staying wrong |
   | writer | `setBillingMode(mode, userId)` beside `setSignupMode`, writing `billingMode` + `billingModeSetAt` + `billingModeSetBy` and re-seeding the cache |
   | route | a `mode-switch` row on the existing Admin → Deployment card, platform-admin only, like the two beside it. `.mode-switch` already matches two rows, so the third needs `:has([data-mode])`-style addressing in any test (§24) |

   **It has a consumer the other two levers do not, and that changes the
   reader's shape.** `signupMode()` and `orgCreation()` return a *string* and
   throw the provenance away — nothing asks when the decision was taken. Item 3
   below needs `billingModeSetAt` on every enforcement check, so either this
   reader returns `{ mode, setAt }` or there is a second read of the same
   document on a path that runs per request. One read, returning both.

   **And the cache guard cannot be copied verbatim.** Both existing readers
   test `if (cache.value && …)`, which is fine for two non-empty strings and
   wrong the moment the cached thing is an object carrying a `setAt` that may
   legitimately be `0` or absent. Guard on the *timestamp* of the cache entry,
   not on the truthiness of what it holds.
2. **The conflation — settled 2026-10-17: a SEPARATE FIELD.** ✅ **BUILT**
   (`CLAUDE.md` §78). `suspendedAt` stays the **operator** lever with its typed
   reason; `billingSuspendedAt` is the enforcement hold. The alternative was a
   reason tag on the one field, and the two fail differently: with a separate
   field an operator reads two values to know why a workspace is read-only,
   which is a **visible** cost, while a tag makes a billing resume clear a
   storage pause **silently** unless every caller remembers to check it. §24's
   rule is that suspension is reversible and customer-visible, and a tag makes
   the reversal depend on a check somebody can forget.

   **The operator reason wins when both are set**, which is the part that was
   not obvious going in: a billing hold has an action the customer can take and
   an operator hold does not, so naming the billing cause while a storage pause
   is also in force tells somebody to pay and leaves them read-only afterwards
   — money taken, nothing restored, and a dispute that is entirely ours (§3).
   Lifting the operator hold then reveals the billing one, which is correct.

   One `readOnlyState(org)` makes the decision, so the sync seam and the panel
   cannot disagree about it, and the panel reports the two holds as two fields
   and two counts (§33: one total would be correct, adjacent and useless).
   **Nothing writes `billingSuspendedAt` yet** — that is item 3's cutoff
   feeding it, so this landed with no behaviour change, like item 1.
3. **Grandfathering — decided, and it DOES need a field.** The policy
   (2026-10-17): **no permanent free tier, possibly around a year, per org,
   decided when the switch is flipped.** *"Needs no new field"* stood here and
   was true of a blanket rule — `orgs.createdAt` (`server.js:1124`) against
   `billingModeSetAt` says who was already here, and both already exist. A
   **case-by-case** answer is per-org state and has to be stored. So:
   `billingExemptUntil: <day> | null` on the org — **a nullable date, never a
   boolean**, because an `exempt: true` re-creates *free for ever* by accident
   and cannot express *a year* — plus a default **window length** in `platform`
   beside the mode, applied when the date is null and `createdAt` precedes the
   switch. No migration, and the uniform answer stays changeable without
   touching a row. [`docs/PAYMENTS.md`](PAYMENTS.md) §5 has the reasoning and
   the wording the free-mode card must use, which promises **notice, not
   duration**.

   **The cutoff rule, decided 2026-10-17:**

   ```
   grandfatheredUntil = org.billingExemptUntil            // stored override, if any
                     ?? orgs.createdAt + GRANDFATHER_WINDOW   // default, derived
   ```

   …applied only where `orgs.createdAt < billingModeSetAt`, which is what
   *"was already here when the switch was flipped"* means. A workspace created
   afterwards is not grandfathered at all — it gets the trial.

   **The two layers are complementary rather than competing**, and that is
   worth saying because the formula and the field read like two answers to one
   question. The formula is the **default**, derived from two timestamps that
   already exist, so it needs no field and no migration. `billingExemptUntil`
   is the **override**, which exists because the policy is case-by-case and
   nothing derivable can say *this* org got eighteen months and *that* one got
   three. `GRANDFATHER_WINDOW` lives in `platform` beside the mode, so the
   uniform answer is a number an operator sets at the moment there is
   information to set it from.

   > **The base is `createdAt`, and that inverts the incentive — flagged, not
   > silently implemented.** The window runs from each workspace's own signup,
   > so **the earliest users get the least remaining free time at the switch**:
   > with a 12-month window and a switch eleven months after launch, the first
   > signups have one month and somebody who joined yesterday has twelve. The
   > stated purpose of grandfathering is that *"the people in the free period
   > are the ones giving feedback"* ([`PAYMENTS.md`](PAYMENTS.md) §5), and this
   > ordering rewards them last. The alternative is one expression —
   > `billingModeSetAt + GRANDFATHER_WINDOW`, a uniform window of notice from
   > the day charging starts — and the per-org override is the mitigation that
   > makes the chosen base defensible rather than wrong: the inversion is
   > correctable one workspace at a time, by hand, which is what *case by case*
   > already means.

   **The sharp edge, and it is a defect rather than a preference.**
   `createdAt + window` can already be **in the past** on the day the switch is
   flipped — an org created eighteen months ago, against a twelve-month window,
   is expired before anybody presses anything. So flipping `billingMode` would
   **suspend the oldest workspaces instantly, with no notice at all**, which
   contradicts the one promise the free-mode card makes in item 4: *we will
   tell you before anything changes*. That is this file's standing failure
   shape — a state that renders as a working feature right up to the moment it
   costs somebody their sync.

   So the computed date is **floored**, and the floor is the promise rather
   than a safety margin:

   ```
   effectiveUntil = max(grandfatheredUntil, billingModeSetAt + NOTICE_DAYS)
   ```

   `NOTICE_DAYS` is its own figure in `platform`, not a reuse of the window:
   they answer different questions (*how long were you free* against *how much
   warning does anybody get*), and conflating them means shortening the window
   also shortens the notice. **Nobody loses cloud sync within `NOTICE_DAYS` of
   the switch, whatever the formula says** — and the enforcement test for that
   is the one to write first, because it is the only one whose failure is
   invisible until a real customer is on the wrong side of it.
4. **The free-mode card**, and its wording is now load-bearing rather than
   incidental. It offers no checkout — which is what retires the test-mode
   Subscribe button §73, §74 and §76 each had to write a paragraph about — and
   it says three things: free while in early access, **we will tell you before
   anything changes**, and you will not be charged without being asked. It must
   **not** say *free for early users* with no qualifier, because item 3's
   decision is explicitly not a permanent tier and that phrasing promises one
   in the place a customer would quote back. §39's standing rule still applies
   underneath: a state that renders as nothing is invisible.
5. **The seat cap: one member count in `/api/org/invite`**, plus a refusal
   screen that explains itself (§36 rule 1). Free while no workspace is over
   it.
6. **The 7-day trial — a dependency path, not a task.** It is in the decided
   price table and it is the one item here whose cost is **unknown**, because
   §5's switch was shaped specifically to defer it: *"whether the provider
   supports a trial on a **static payment link** at all… is unread, and §69's
   rule is not to guess."* §71 chose that link because `script-src 'self'`
   forbids the provider's JavaScript (§30 Phase 4), so the question is not
   whether they offer trials — it is whether they offer them on the one
   integration shape the CSP leaves us.

   **The path, in the order it resolves:**

   | | |
   |---|---|
   | **A — trial configurable on the product** | nothing to build. The static link inherits it, `DODO_PRODUCT_ID` does not change, and the work is a field on their dashboard |
   | **B — trial needs a Checkout Session** | a server-side API call, so the CSP is not the obstacle — but §71 declined Sessions for a different reason that still holds: a session is created, expires in 24 hours and is single-use, so it needs a round trip and an error path on a screen that currently has neither |
   | **C — no trial on either** | the price table's *7 days* is not deliverable and the decision moves, which is a pricing question rather than a code one |

   **Branch B reverses §72's own finding, and that is the consequence worth
   knowing before anybody turns a trial on.** That section established, by
   grep rather than recall, that **`DODO_API_KEY` is read by no line of
   `server.js`** — a static link plus HMAC verification uses the provider's API
   not at all, so the credential surface is one signing secret. A Checkout
   Session is an authenticated API call. So *"today's credential surface is one
   signing secret"* is true **until the trial lands on branch B**, at which
   point §17's rules arrive with it: env-only, never `platform` (it is in every
   nightly artifact), never `settings` (syncs whole to viewers), and not a
   meta-doc sibling either, because it does not vary per tenant.

   **Two things to expect in the data whichever branch wins**, because a trial
   produces states this integration has never seen:

   - **A status that is not in the map.** `STATUS_LABELS` (§76) has no
     `trialing`, so §76's unrecognised-status path fires — the raw provider
     word, no advice, and the portal link still offered. That is *safe and
     ugly*, which is the right failure, and the shape is already proven by the
     `grace_period_extended` test. Adding the label is one line once the real
     value is observed; **adding it before is §73's refusal** — one sample is
     not a vocabulary, and nobody has seen a trial payload.
   - **A live subscription with no payment event.** Card-up-front means
     `subscription.active` (or the trial status) arrives with a future
     `next_billing_date` and **no `payment.succeeded` behind it**. The card
     renders that correctly today — §70's two clocks are independent precisely
     so a subscription state does not need a payment to be coherent — so this
     is a case the existing code already handles rather than one to add.

   **And a trial must never be offered to a grandfathered workspace.** They
   are already free, so seven days of free is a *downgrade* presented as an
   offer. The check is the same `effectiveUntil` from item 3, which is why
   grandfathering is built before the trial rather than beside it.

Two things that belong here and were easy to miss — both still true:

- **Refund and dispute events are not handled**, so today a customer can
  dispute a charge, win, and keep full access with the card reading `active`.
  Harmless while nothing is enforced; **a hole the moment the switch is
  flipped**, which is now a date rather than a hypothetical. And it needs the
  §8 question asked first: does the provider even deliver those families to an
  endpoint, or only show them on the dashboard?
- **A grace period is a product decision**, and `past_due_ends_at` is the field
  for it — the one field in the inventory nothing has ever filled (§9), though
  §76's fixture populated it for the first time. **Use the provider's window
  rather than adding ours**: their dunning already sets that date and the
  card's *Access until* row already renders it, so a second window on top
  means two dates that disagree. Reminders are theirs too — §52/§53's mail is
  BYOK on the **tenant's** credential, so billing notices on it would send on
  their domain and their reputation.

### Phase 3 — reconcile and communicate · *after live*

- **Reconciliation.** A periodic compare of what we hold against the provider,
  which is the only thing that catches a missed webhook and the Phase 0 race.
  **It is also the answer to a monitoring gap their docs make explicit: the
  webhooks dashboard offers no email alerts for failing deliveries** (§7's
  before-live item 11). A dead endpoint means payments taken and never
  recorded, and nothing in this repository can currently see it.
- **Renewal and card-expiry notices — and these cannot be ours.** §52/§53's
  mail is **bring-your-own-key**: a tenant's own Resend or Postmark account,
  for mailing *their* customers. Using it to mail *our* customers would send
  our billing notices on their credential and their reputation. So this is the
  provider's dunning and receipts, which is §3 lever 3's conclusion — and
  **step 3 of §7 deliberately turned test-mode customer email OFF**, so
  somebody has to turn the live equivalent *on* and confirm it.

### Deliberately not doing, and why

Recorded so the omissions read as decided rather than missed.

| | Why not |
|---|---|
| **Proration** | one product — there is nothing to prorate until tiers exist |
| **Usage dashboards, health scores, NRR** | no usage model, and one customer. Metrics over n=1 are theatre |
| **Save offers, win-back flows** | premature, and the honest version of "reduce churn" here is *build the product* |
| **An in-app cancellation flow** | the portal does it, hosted, in 21 languages, with the dunning and invoice history attached. Rebuilding it would be worse and would need a second cancel path to keep in step |
| **Annual plans** | §5's ₹15,000 mandate ceiling: twelve months at any tier above about £10/month pushes an India-issued card into per-charge authentication, which for a subscription is a dead subscription. The lever and the ceiling interact, and annual needs a non-mandate path for India first |

---

## Sources

**Provider — first-party**, `docs.dodopayments.com/llms-full.txt`, read
2026-10-14: the Customer Portal (static and dynamic links, what customers can
do, the test-mode email limitation, read-only under a block), the static
checkout query parameters including the `disable*` flags, `AttachExistingCustomer`
on the API paths only, idempotency scoped to usage events and credit ledger,
the webhook **Logs**/**Activity**/**Testing** tabs and the **Replay** action,
and the absence of email alerts for failing deliveries.

**Industry — secondary.** No vendor guidance was found on preventing duplicate
subscriptions; what exists is implementation experience, and it is consistent.
Treat as directional:

- [coolify #11666](https://github.com/coollabsio/coolify/pull/11666) — serialising check-and-create; recovering after missed webhooks
- [viva-ai-systems #39](https://github.com/cabicci/viva-ai-systems-55d35820/pull/39) — blocking checkout when a managed subscription exists; reusing open sessions; stable idempotency keys
- [recoverage #2019](https://github.com/jeremybanka/recoverage/pull/2019) — routing every non-terminal status to billing management rather than checkout
- [jetstream #2067](https://github.com/jetstreamapp/jetstream/pull/2067) — duplicate customer records, and counting the wrong statuses as evidence
- [postiz #2061](https://github.com/gitroomhq/postiz-app/pull/2061) — per-customer duplicate guard
- [scroll-wisdom-weave #112](https://github.com/stanleymay20/scroll-wisdom-weave-d69aa349/pull/112) — the non-atomic-preflight warning
- [KrakenKey #155](https://github.com/KrakenKey/app/issues/155) — 409 plus a pointer to the portal
- [zrotext #137](https://github.com/pboachie/zrotext/issues/137) — Stripe Checkout does not block duplicates; the merchant must
