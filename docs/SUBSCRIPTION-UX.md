# Subscription lifecycle and customer experience — the plan

> **Status: a plan, not a record.** Nothing here is built. It is written before
> any code so the decisions are visible and arguable, which is §48's and §64's
> precedent: the question to ask is *when* a thing can hurt you, and put the
> check there. This lives in `docs/` (the maintained tier, §29) and 404s in
> production by construction (§28), which is what lets it be blunt.
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

### Phase 0 — stop the bleeding · *now, before any more test payments*

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

### Phase 1 — give them control · *same sitting, one link*

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

### Phase 2 — enforcement · *blocked on pricing (§64)*

Nothing reads `billing` to decide what a workspace may do. This cannot be
built before a price exists, and when it lands it is §24 stage B's suspension
rules: read-only sync, reversible, nothing deleted, **never** reaching
`deleteAccount()` (§5, §15), with **export open to every role** (§36).

Two things that belong here and are easy to miss:

- **Refund and dispute events are not handled**, so today a customer can
  dispute a charge, win, and keep full access with the card reading `active`.
  Harmless while nothing is enforced; a hole the moment it is not.
- **A grace period is a product decision**, and `past_due_ends_at` is the field
  for it — the one field in the inventory nothing has ever filled (§9).

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
