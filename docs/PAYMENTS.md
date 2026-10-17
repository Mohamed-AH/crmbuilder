# Taking payment — the rail, the price, and the chargeback plan

> **Current reference.** This sits in `docs/`, the tier `CLAUDE.md` §29 defines
> as maintained — not `docs/archive/`, which is frozen. Researched 2026-10-07,
> **rewritten 2026-10-13 around the rail actually chosen.** If you change
> something it names, change it here too.
>
> **The rail is decided: [Dodo Payments](https://dodopayments.com) as merchant
> of record, and the account exists.** Signed up as an **individual**, which is
> what made it startable without a company formation — and which is the whole
> reason this moved off the recommendation below. §2 records the decision and
> the objection it overrides, honestly rather than quietly.
>
> **Shape and currency are also decided:** per-workspace tiers rather than
> per-seat, and **GBP as the primary currency** — both chosen by the owner,
> recorded here rather than argued for. **The price itself is not decided**, and
> it gates more than it looks: `CLAUDE.md` §27's doc walk,
> [`LAUNCH-CHECKLIST.md`](LAUNCH-CHECKLIST.md) §2.1's twelve files, and
> `MARKETING.md`'s *"No per-seat pricing. Free. No ads."*
>
> **Three pieces of code are built and nothing takes money.** `CLAUDE.md` §69
> (signature verification), §70 (the webhook route) and §71 (the checkout link).
> No deployment sets `DODO_PRODUCT_ID`, so the Subscription card is **absent**
> rather than broken, and nothing anywhere reads subscription state to decide
> what a workspace may do. §6 is what is built; §7 is how to set up and test it.
>
> **This file is deliberately unserved.** `PUBLIC_DOCS` in `server.js` is
> `['manual.html', 'product-tour.html']` and nothing else under `docs/` is
> reachable (§28) — checked, not assumed. That is what lets this document be
> blunt about what is unfinished and about what it does not know.
>
> **Scope.** This is the *commercial* half: how money reaches an Indian bank
> account from a UK customer, what a chargeback costs and who bears it, and what
> to charge. The *consequences* of charging — the twelve files whose text goes
> false, `TERMS_VERSION`, the privacy roster, and the six product decisions
> pricing forces — are [`LAUNCH-CHECKLIST.md`](LAUNCH-CHECKLIST.md) **Part 2**,
> and are not restated here. Read both.

---

## 0. Where this sits, and what it is not

| | |
|---|---|
| **Part 2 of the checklist** | what charging *breaks*: text, terms, privacy, enforcement, suspension, the signup gate |
| **This document** | what charging *needs*: a payment rail that works from India, a tax position, a price |
| **Neither** | the CA engagement, the ICO registration and the solicitor-drafted DPA — all still outstanding |

**One disclaimer, once.** The India half of §4 below needs a chartered
accountant who has done SaaS service exports. That is a few hours of somebody's
time and it closes the only part of this plan that cannot be settled from
inside the repository. Everything in §4 is written so that conversation is
short rather than exploratory.

---

## 1. The structural fact: Stripe cannot be the collection rail

This is the finding that decides the architecture, and it is not a preference.
**It is unchanged by the move to Dodo** — it is the reason an MoR was chosen at
all, so it survives the choice of *which* one.

**RBI's *Regulation of Payment Aggregator – Cross Border* circular (31 October
2023)** brought every entity facilitating cross-border payment collection under
direct authorisation, in three categories — `PA-CB-E` (export only, which is
us), `PA-CB-I` (import), `PA-CB-E&I`. **A domestic payment aggregator may not
handle inward foreign remittance at all.**

**Stripe India holds a domestic PA licence (granted 15 January 2024) and does
not hold PA-CB authorisation.** It is absent from the ~19 entities RBI has
authorised; Razorpay, Cashfree and Xflow are on that list. This is also the
documented reason Indian Stripe signups have been invite-only since May 2024.

So collecting card payments from UK/EU customers into an Indian entity means
using a PA-CB-E-authorised aggregator — or not making a cross-border collection
in the first place.

### The two shapes, and why one of them is not close

| | You collect | Seller of record | Who owes UK/EU VAT | Whose chargeback ratio |
|---|---|---|---|---|
| **A. Direct** — PA-CB aggregator | hundreds of consumer card payments, cross-border | you | **you** | **you** |
| **B. Merchant of Record** | one B2B payout from one foreign company | the MoR | the MoR | the MoR |

**Option B is what was chosen.** Under an MoR there is no cross-border
collection to regulate: you sell to the MoR, it resells to the end customer,
and it pays you. One foreign customer, one export invoice per payout, settled
through your AD bank in the ordinary way. The PA-CB framework never engages,
because nobody is aggregating anything on your behalf.

> **Everything in this table rests on the MoR genuinely being the seller of
> record, which is a contractual fact and not a marketing one.** §8 records it
> as the single most important thing to confirm from the MSA — because if Dodo
> is a *gateway* rather than a seller of record for our sales, then §1 is
> Option A wearing Option B's clothes: we would owe UK VAT and EU OSS from the
> first sale, and §4's split would be wrong on every row. `js/app.js` already
> prints the claim on the Subscription card (*"Dodo Payments, who are the
> seller of record"*), so the sentence is in front of customers and the MSA is
> what has to support it.
>
> **CONFIRMED 2026-10-17, from the MSA dated 2026-02-26** — §2.1 and §4.3
> appoint Dodo Payments as reseller and Merchant of Record, and §3.1(iv) with
> §5 put global Sales Tax / VAT collection, reporting and remittance on them.
> So this table is the shape we are in, as a contractual fact. §2 records the
> sections, what they do **not** cover, and the one-click switch on the
> provider's own settings screen that would put us back in Option A.

### What Option A would cost on day one, measured rather than assumed

The VAT half is the reason, and the numbers are not the ones most people
quote:

- **UK: there is no registration threshold for a non-established business.**
  The £90,000 figure applies only to UK-established businesses; HMRC
  specifically excludes non-established taxable persons from it. One digital
  service to one UK consumer and you must register and charge 20% **from that
  first sale**.
- **EU: no threshold either.** The €10,000 distance-selling threshold is for
  EU-established sellers. A non-EU seller registers for the **non-Union OSS**
  scheme from the first euro, picks one member state to register in, charges
  each customer *their own country's* rate, and files quarterly.
- **B2B is reverse charge**, which sounds like relief and is not: you then have
  to validate VAT numbers, store the evidence, and fall back to B2C treatment
  when one does not validate.
- Plus evidence-of-customer-location retention, and a rate table that is
  somebody's full-time job to keep current.

Two foreign VAT registrations and quarterly filings, before the first £1,000 of
revenue. That is the thing the MoR fee buys.

---

## 2. The rail: Dodo Payments, and the objection it overrides

### This document rejected it, and that is recorded rather than deleted

The 2026-10-07 version of this file put Dodo in a *rejected options* table:

> | **Dodo Payments · Playto · Creem** | India-friendly and cheaper on paper, and **every source for them is their own marketing page**. For the rail that holds all the revenue, a vendor with no independent operating history is the wrong trade |

**The decision went the other way, and the reason is the one thing that table
did not weigh: Dodo accepts an individual.** Every alternative wanted a
company, and a company formation is weeks and money ahead of the first pound of
revenue — so the comparison was never between two rails, it was between a rail
now and a rail after an incorporation.

**What has changed about the objection, precisely, because it has only partly
moved.** It was *"every source is their own marketing page"*. After reading
their documentation end to end (2026-10-13, `docs.dodopayments.com`):

| | |
|---|---|
| **Answered** | the *engineering* surface. Standard Webhooks signing, the two-mode separation, the retry schedule, the event list, the payload shape, the test cards, the static-link parameters. All first-party, specific, and — the half that matters — **drivable end to end in test mode before a customer exists**, which §7 is |
| **Not answered** | the *economics*. Fee, payout into INR, FX spread, chargeback set-off, per-seller chargeback threshold, and — **narrowed since, see below** — MoR contractual status. **None of these is in this document as a number**, deliberately, and §8 lists each one |

So the honest statement of where this stands is: **the integration is verified
and the commercial terms are unread.** That is a materially better position
than the table assumed and a materially worse one than "chosen". The MSA read
in §7's *before live mode* list is what closes it, and it is not optional.

### The account IS in MoR mode, and the dashboard says so in those words

Read off the provider's own *Settings → Payment providers* tab (2026-10-17,
test mode) — a screen this document had never seen:

> **Billing + Payments (Merchant of Record)** — **Active**
> *"Dodo Payments becomes the legal seller of record — we handle global taxes,
> compliance, fraud, and payouts."*
> VAT/GST collected & remitted for you · chargeback liability & PCI handled by
> Dodo · 40+ payment methods · built-in fraud protection

**This is materially stronger than the behavioural evidence §8's row already
carries**, and the difference is worth stating rather than quietly upgrading
that row. What was observed there was 18% GST itemised on an INR checkout and
`$0.00` sales tax on a USD one — correct behaviour, and behaviour a
well-implemented *gateway* could produce just as easily. What this is instead:
a **named account mode**,
reported **Active**, described in the provider's own words as *the legal seller
of record*, on a screen whose entire product boundary is drawn by **who the
merchant of record is**. A gateway does not offer that as a mode; it is the
thing being switched between.

**It did not close the row — the MSA read below did**, and the standard was
the row's own: *behaviour cannot answer a contractual question; the MSA can.* A
settings page is still the provider describing its own service — it can
describe it accurately while the agreement defines the term more narrowly, or
carves out a jurisdiction, or makes it conditional on something. So §8's row
moved from
**unknown** to **strongly indicated, contract text still unread**, and §7's
step 1 is unchanged.

### And the same screen carries a one-click switch that would invert §1

Beside the Active row sits **Bring Your Own Processor** (Beta), with a
**Configure** button and the description *"Full control — you remain the
merchant of record."*

Read that last clause against §1's table: **you remain the merchant of record**
is **Option A**, the shape this entire document exists to avoid. Enabling it
would mean UK VAT from the first sale, non-Union OSS from the first euro, two
foreign registrations and quarterly filings — §4's split wrong on every row,
and the sentence `js/app.js` prints to customers false.

Three things make it worth a subsection rather than a mention:

- **The affordance points at the dangerous one.** The safe mode is already
  Active and has no button. The mode that breaks §1 is the only thing on that
  screen you can press.
- **It is account-level, so nothing here would change and no test here could
  see it.** §40's rule arriving at a toggle rather than a URL: the webhook
  would keep verifying, the card would keep rendering, the suite would stay
  green, and the first symptom would be a tax position discovered months later.
- **It is labelled a feature, and *"full control"* reads as the grown-up
  option.** For a seller who cannot register for UK VAT without wanting to, it
  is the exact opposite — and that framing is the reason to write the warning
  down rather than assume nobody would click it.

**Nothing to build.** It is a *do not touch* item, which is why it is recorded
where the rail is chosen rather than left on somebody else's screen — and it is
step 12 of §7's *before live mode* list, because the one time somebody will be
clicking around that tab is while switching modes.

**And the MSA below makes the reason stronger than the tax analysis above.**
The paragraph says enabling BYOP would make §4's split wrong *by our own
reading*. What the agreement adds is that the shield is **conditional on the
reseller appointment** — Dodo collects and remits because §2.1/§4.3 appoint it
the seller of record for these sales. A mode whose own description is *you
remain the merchant of record* is, on its face, outside that appointment. So
the risk is not that our analysis changes; it is that the contractual
protection stops applying, and nothing in the product would say so.

### The MSA is read, and the seller-of-record row is CLOSED

**MSA dated 2026-02-26, read 2026-10-17 by the account holder.** Both dates are
recorded because terms get amended and a later reader needs to know *which
version* was checked, not merely that somebody checked. The sections, as
reported:

| Section | What it establishes |
|---|---|
| **2.1 & 4.3** | Dodo Payments is appointed **reseller** and operates as the **Merchant of Record** |
| **3.1(iv) & 5** | Dodo is responsible for **all** Sales Tax / VAT collection, reporting and remittance, **globally** — which is the thing that keeps §1's foreign-registration thresholds (UK VAT, EU non-Union OSS) off our side |
| **7.1** | Dodo provides **first-tier support**: buyer-facing invoicing, payment reconciliation and refund requests, handled directly |

**That answers §1's blockquote rather than merely supporting it.** §1 says
plainly that its two-shape table *"rests on the MoR genuinely being the seller
of record, which is a contractual fact and not a marketing one"* — and the
contract is now the source. Option B is the shape we are in, so §4's split
stands as written and the sentence `js/app.js` prints to customers (*"Dodo
Payments, who are the seller of record"*) is supported by the agreement rather
than by a vendor's settings page.

**What it does NOT do, and this is the half most likely to be misread.**
"The MSA is verified" is one row of §8, not §8. §72 listed **four** MSA
questions and this answers the first; the fee, the chargeback set-off and
per-dispute fee, the per-seller threshold, and the payout-plus-FX into INR are
all still unread, so §3 still *"assumes the worst of all three"* and §5's net
table is still blank. A reader who takes "legally verified" as a general
clearance would fill that table from nothing, which is §17's
records-times-a-constant in the one place it gets quoted back.

**§7.1 has three consequences nobody asked for, and two of them narrow claims
this document already makes:**

- **§73's `invoice_url` gap is smaller than recorded.** That section calls our
  screen offering no receipt *"a real gap"*. The provider does buyer-facing
  invoicing under 7.1, so the customer does get one — from Dodo, reachable
  through §74's portal link. The gap is that *our* card does not point at it,
  which is a sentence rather than a feature.
- **§3's lever 5 is not ours to operate.** That lever is *"14-day no-questions
  refunds"*, written as a control we hold. Under 7.1 refund requests go to Dodo
  directly, so the policy may be ours to set and the execution is theirs. Worth
  correcting rather than leaving, because a dispute plan that counts a lever
  somebody else pulls is a plan that over-reports its own coverage.
- **First-tier support means a customer asks Dodo before asking us**, so the
  Settings card's advice (§76) is the *second* thing they read. It must not
  contradict what Dodo tells them — which is an argument for the advice staying
  as general as it is (*use the portal*) rather than naming a remedy the
  provider might handle differently.

### What makes this reversible, and why it matters MORE than it did

§6's constraint — one module, one webhook handler, no provider object reaching
the client — was written for Paddle, where the reason was the FTC action
against them. **For Dodo the reason is stronger, not weaker**: a thinner
operating history is precisely the case where the integration has to be a
week's work to replace. The constraint is identical; its justification got
better.

Measured against what is built: `lib/webhook-verify.js` is **Standard
Webhooks**, not a Dodo format — the same scheme Svix, Resend and others emit —
so the verification half is portable as it stands. What is provider-specific is
one function (`applyBillingEvent`'s event-name mapping) and one URL builder.

### The other options, and what the research on them is worth keeping

§29's rule: a plan records the cost that made something not worth building, and
none of that survives in the code. These rows are what you need before
reversing the decision above.

| | Where it stands |
|---|---|
| **Paddle** | the 2026-10-07 recommendation, and the research on it is the best available **prior** for what an MoR's chargeback policy looks like — see the note below, because the numbers are specific and they are *not* Dodo's |
| **Lemon Squeezy** | acquired by **Stripe** (July 2024); new seller signups reported waitlist-gated through 2026. Building the revenue rail on a product whose owner also sells the competing product is a dependency not worth taking |
| **Playto · Creem** | same class as Dodo was in: India-friendly, thin independent history. No reason to move to one |
| **FastSpring** | credible MoR, materially more expensive, aimed higher up market |
| **PA-CB aggregator direct** | Option A in §1 — the VAT position, not the fee, is what rules it out |

> **What Paddle's policy actually said, kept as a prior and not as a fact about
> Dodo.** Read from their help centre on 2026-10-07, and it is the most
> informative thing in this document about how MoR chargeback terms are
> *shaped*:
>
> - **0.65% of transaction volume**, measured **by value** rather than by
>   count, against the card networks' 1.5%.
> - **Won disputes still count** toward that rate.
> - **Sellers may not submit dispute evidence at all** — *"the system is fully
>   automated, and additional evidence submitted by sellers is not required or
>   accepted."*
> - **£20 per dispute, kept whether they win or lose**, plus the transaction
>   amount while the case runs.
> - A **pre-chargeback refund path**: they buy ~48-hour alerts and refund
>   before the chargeback finalises, *"a chargeback fee is still applied"* — so
>   a disputed sale can cost the full amount plus £20 and never appear as a
>   chargeback. The FTC fined them **$5 million in June 2025** partly for using
>   exactly that mechanism to mask fraud rates.
>
> **Three things to take from it when reading Dodo's MSA**, which is the only
> reason it is still here: ask whether the threshold is measured by **value or
> count**, whether a **won** dispute counts, and whether you may **submit
> evidence**. Those three answers decide whether §3's levers are preventive-only
> or whether there is an appeal stage worth being good at — and no provider puts
> them on a pricing page.

---

## 3. Chargebacks: what an MoR protects you from, precisely

"Chargeback protection" is the most oversold phrase in this market, so this
section separates what is structural from what is a vendor's policy. **The
structural half is known; Dodo's policy half is not** (§8).

### What is structural, and it holds for any MoR

**The dispute is raised against the MoR, not you.** You hold no merchant
account, so **your MID cannot be terminated and you cannot be MATCH-listed, and
no scheme fine is billed to you.** That is the protection worth having, and the
thresholds say why:

| | Trigger, 2026 |
|---|---|
| **Visa VAMP** | excessive at a **1.5%** ratio — cut from 2.2% on **1 April 2026** across US, Canada, EU and APAC. **$8 per disputed or fraudulent item, and no warning tier.** The ratio is TC40 fraud reports + TC15 chargebacks over settled card-not-present transactions |
| **Mastercard ECM** | 1.5%–2.99% **and** 100+ chargebacks in a month, fines escalating monthly, possible MATCH listing |
| **Mastercard HECM** | 3%+ and 300+ chargebacks |

A one-person Indian merchant selling direct to UK/EU consumers is exposed to
all of that. Under an MoR it is the MoR's merchant account and the MoR's scheme
relationship.

### What does NOT follow, and the 2026-10-07 version of this file got it wrong

The earlier draft said *"it is the MoR's ratio and the MoR's problem."* Reading
a real MoR's published policy disproved it: an MoR keeps a **per-seller**
chargeback rate and enforces it at a threshold of its own, which can be
**tighter than either card network's**. So:

- **Assume a per-seller rate exists and is stricter than 1.5%** until the MSA
  says otherwise.
- **Assume you bear the cash cost of every dispute** — the amount plus a fee,
  whoever wins.
- **Assume the consequence is a risk review**, not a termination. That is the
  real difference the MoR makes, and it is worth having; it is just not what
  the phrase implies.

**And at our volumes the threshold behaves backwards, whatever its exact
number.** A rate measured by value is a *binary* while the denominator is
small: one disputed £49 subscription stays under 0.65% only above **£7,538** of
monthly volume, and one at £99 needs **£15,231**. Below that, a single dispute
breaches it on its own — and if won disputes count, winning does not help.

That is the strongest argument in this document for the levers below, and
especially for annual invoicing: **the job is keeping the count at zero while
the denominator is too small to absorb anything**, not shaving a percentage.

### The liability shift that is yours to earn

3DS2 is mandatory under PSD2/SCA for UK and EU cards regardless. When a
transaction is **issuer-authenticated** through 3DS, liability for
**fraud-coded** chargebacks shifts to the issuing bank.

**It does nothing for the disputes you will actually get** — *service not as
described*, *not received*, *subscription cancelled*, *I don't recognise this
charge*. Those are a product and billing-design problem, not a payments
problem. The shift also depends on correct 3DS2 flow and cryptogram
pass-through plus issuer confirmation, not on a switch being on — which is the
MoR's job here, not ours.

### The levers that are actually ours, ranked

**None of these depends on which provider was chosen**, which is exactly why
they are the part of this section that did not have to be rewritten. The first
is worth more than the rest combined.

1. **Annual billing, invoiced, for anything above a single seat.** A bank
   transfer has **no chargeback mechanism at all**. It also removes 11
   transaction fees per year and pulls cash forward, so this points the same
   way as the margin. **And it is worth more than this list knew — see the RDR
   finding below, which makes annual the only one of the two prices that can be
   defended at all.**
2. **A statement descriptor the customer recognises** — `NIMBLECLERK`, never
   the processor's name. *"I don't recognise this charge"* is the most common
   consumer dispute and it is entirely self-inflicted. **Check where this is
   configured on the provider's side**; on an MoR it is usually their name plus
   a seller string, and the seller string is the lever. **Searched, 2026-10-17:
   the documentation does not cover statement text anywhere** — its branding
   pages are the checkout, the payment link and the invoice, which are three
   places that are not a card statement (§8). So this lever is a support
   question, and it is the one to ask first because it is the cheapest.
3. **A pre-renewal email, 7 days out, naming the amount and carrying the cancel
   link.** For an annual renewal this is the difference between a renewal and a
   dispute. **Note what this deployment cannot do:** it has no outbound email of
   its own — §51's chaser drafts into the reader's own mail client, and
   §52/§53's send uses the *tenant's* own provider key. So this must come from
   the provider's own dunning and receipts. **Do not build a mail sender for
   it**, and do check in §7 that the provider's dunning emails are actually
   switched on, because in test mode they are the thing you deliberately turn
   off.
4. **Self-serve cancellation that works in two clicks.** A cancel flow that
   requires an email is a dispute generator. Today the Subscription card's
   button is the same checkout link for a subscriber as for a new one (§71's
   open item) — a **customer-portal link** is the fix and it is small.
5. **Refund on request inside 14 days, without argument.** UK and EU consumers
   have statutory cancellation rights for digital services anyway; a refund
   costs the fee and a chargeback costs the amount, the fee, and a mark against
   a threshold you cannot see. **Confirmed implementable, 2026-10-17:** the
   merchant refund window is *"30 days from the payment date (default)"* and
   after 30 days refunds are not allowed, so 14 days sits inside it with room.
   Note it is **more generous than the provider's own customer-facing 7 days**,
   which is the right direction and is a promise we make rather than one they
   make for us. The cost is not symmetric with a chargeback and the asymmetry
   is the argument: a refund reverses the tax and charges a **refund fee**,
   while *"the Payment Fees entry has no reversal"* — so the original
   transaction fee is kept either way, and the chargeback additionally takes
   the amount and a dispute fee that is **not** returned on a win.

**Items 2–5 are product decisions, not payment configuration.** They belong in
whatever ships enforcement, and they are cheaper to build in than to retrofit.

### The RDR finding, which reshapes this whole section

**Visa Rapid Dispute Resolution is enabled by default on every account, with a
$100 USD threshold**, and a dispute it resolves *"appears as a lost dispute"*
with an RDR fee in place of the dispute fee. Read against §5's decided prices
that is not a detail, it is a dividing line:

| | Against the $100 RDR threshold | What a dispute is |
|---|---|---|
| **$15 monthly** | under it | **auto-refunded, auto-lost. There is no defence stage** |
| **$150 annual** | over it | a real dispute: 10 days, evidence, a decision |

So the 10-day window and the evidence rules §8 just closed — the answer that
came back *in our favour* — **do not apply to the monthly price at all.** For
monthly, every one of items 2–5 is the entire strategy, because item 1's
alternative of arguing does not exist. And item 1 gains a second reason on top
of the eleven removed transaction fees and the removed chargeback mechanism:
**an annual price is the only one that is above the line where arguing is
possible.**

**This also fixes the shape of this section's old self-criticism.** The
2026-10-07 version assumed the worst of a threshold it could not read, and the
correction below says that was right as a posture and wrong as a fact. The RDR
default is the opposite case: it is **worse than the worst case that was
assumed**, because what was assumed was a threshold that punishes you for
losing, and what is actually configured is a mechanism that loses for you
before you are asked.

**What it does not do is change the ranking.** Items 2–5 are preventive and
prevention is what both rows of that table reward. It changes how much item 1
is worth, and it removes any temptation to build an evidence workflow for a
$15 subscription.

---

## 4. Tax, split into what goes away and what stays ours

**Unchanged by the choice of MoR** — the split is a property of the structure,
not of the vendor. It does depend on §1's blockquote being true.

| | Who |
|---|---|
| UK VAT, EU non-Union OSS, US sales tax, 40+ other jurisdictions | **the MoR.** This is what the fee buys |
| Invoicing the MoR for each payout | us |
| **GST on export of services** — zero-rated under §16 IGST | us, and only if all five §2(6) conditions hold |
| **LUT (Form GST RFD-11)**, re-filed every financial year | us |
| eBRC / FIRC from the AD bank per remittance | us |
| Indian income tax on the receipts | us |

### The three that go wrong quietly

- **The LUT is annual and easy to forget.** Without a current one you must pay
  IGST upfront and claim it back — a cash-flow problem invented by a missed
  form.
- **Payment must be received in convertible foreign exchange within one year of
  the invoice.** Miss that window and the zero-rating on *that invoice*
  collapses: you owe the IGST that was never charged, plus interest, with
  roughly 15 days to pay once the deadline passes. Monthly payouts make this a
  non-risk in practice — which is exactly why the invoice-to-payout matching
  has to stay clean enough to prove.
- **The "not an intermediary" condition** is the one to get an opinion on. We
  sell our own software to the MoR rather than arranging a supply between two
  other parties, so we are not an intermediary — but a reseller structure is
  precisely the shape that invites the question. **Get it in writing once.**

### For the CA conversation, so it is short

1. Entity: sole proprietorship or private limited, and what that changes. **The
   account is an individual one**, so this is now a live question rather than a
   theoretical one.
2. The intermediary opinion above, in writing.
3. Whether Softex / STPI reporting touches a SaaS service export at our scale.
4. Whether anything about the MoR structure disturbs the five §2(6) conditions.
5. Presumptive taxation versus books, at the expected revenue.

---

## 5. The price

### Shape: per-workspace tiers. Decided, and it is not only a preference.

Per-seat was considered and rejected for three reasons, in increasing order of
how much they cost:

- **It contradicts our own positioning.** `MARKETING.md` promises
  *"**No per-seat pricing. No lock-in**"* in bold, and opens by attacking other
  CRMs for being *"rented back to you at $25 per seat per month"*. Charging
  $29/seat while that stands is the worst version of the inconsistency
  [`LAUNCH-CHECKLIST.md`](LAUNCH-CHECKLIST.md) §2.1 exists to prevent — and
  §2.1's own note is that the honest form of that argument was always
  *per-module rather than per-seat*, which **survives a price**.
- **The architecture does not support it.** A workspace is org-owned and every
  member sees every module (§5, §14). There is no seat metering, no per-seat
  entitlement check, and §17 records that *"nothing is enforced"* as a
  deliberate decision. Per-seat means building seat counting, an
  invite-blocked-at-limit path with a screen that explains itself (§36), and a
  downgrade path that decides what happens to the sixth person.
- **It prices against what the buyer wants to do**, which is put their whole
  small team on it.

**Per-workspace needs one enforcement point: a member count at invite time.**
That is one check in `/api/org/invite`, not a metering system — and §2.4
already records that plan state belongs **on the org**, beside `suspendedAt`,
because the workspace belongs to the org. What is built stores it on the
workspace meta document instead (§6); that is a difference to settle when
enforcement lands, not a bug.

### ~~Currency: GBP primary. Decided.~~ — REVERSED 2026-10-17, to USD

> **The price below is `$15`, so this section's own decision no longer holds.**
> Left standing rather than rewritten, because the reasoning is what a reader
> needs in order to reverse it back: the dispute-trigger argument is still
> true, it is simply being paid rather than avoided. The reversal and its cost
> are recorded with the price.

The market is UK and Europe. `£19` reads as a price; `$22.80` reads as a
conversion, and a foreign-currency line on a card statement is itself a dispute
trigger (§3, lever 2). An MoR does localised pricing, so this is configuration
rather than code — **confirm GBP presentment is available on the account before
treating it as settled** (§8).

**The test product is priced in USD and the decision has not been applied.**
Measured rather than assumed: the same subscription presented **$65.00** to a
US card and **₹6,429.04** to an India one, a ratio of ~98.9, which is a
conversion from a USD base rather than two configured prices. So localised
presentment **works** — that half of §8's question is answered — and the base
currency is the thing to change. Doing it in the provider's product is the
whole job; nothing in this repository names a price (§71).

`DEFAULT_SETTINGS.currency` is `'USD'` in the app (§42 recorded that as wrong
for this market and deliberately did not change it) — **that is the
workspace's display currency for their own records and is a separate thing
from what we bill in.** Do not conflate them.

### A hard floor that is now known

**A subscription product must be at least $1.00 USD**, or the equivalent value
in another currency. Zero-cost subscriptions are allowed, which is a possible
shape for a free tier, but anything paid is above that line. None of the tiers
below is near it; it matters only if a £1–2 "keep my data" tier is ever
considered.

### And a hard CEILING, observed on a real mandate

**₹15,000 per debit**, which is the RBI additional-factor-of-authentication
threshold for recurring e-mandates — raised from ₹5,000 by a June 2022
circular, consolidated in April 2026, and unchanged at that figure. Below it a
renewal debits silently; **above it the customer has to authenticate every
single charge**, which for a CRM subscription is a dead subscription rather
than a friction cost.

Not inferred from the regulation — **read off the authorization screen**: the
India mandate registered on a test subscription says *Max. Amount
INR 15,000.00*, *Frequency: As and when presented*. The provider pins the
mandate at exactly the AFA ceiling, so the ceiling is theirs as well as the
regulator's.

At the test product's own rate that is roughly **$150/month**, so nothing in
the table below is near it. It binds on two things that are not in the table:
a future per-workspace tier for a larger team, and **annual invoicing** —
§3's first and strongest chargeback lever, which multiplies the debit by
twelve and lands any tier above about £10/month straight into AFA territory
for an Indian card. So the lever and the ceiling interact, and an annual plan
needs a non-mandate path (invoice plus bank transfer) for India rather than
the same checkout.

Only India has this shape. It is here rather than in §4 because it constrains
the **price**, not the tax.

### A starting point, not a decision

Measured against what a UK small business is actually choosing between, in
2026:

| | Entry, per seat / month |
|---|---|
| Zoho CRM Standard | $14 |
| Pipedrive Lite | ~$14 |
| Less Annoying CRM | $15 (one plan) |
| HubSpot Sales Starter | $15–20 |
| Capsule Starter | $21 |
| **Pipedrive Growth** | **~$39** |

So a proposed **$29/seat** would have landed between the *mid* tiers of Capsule
and Pipedrive — while §2's *Not built yet* list is: no third-party
integrations, no email sending of our own, **no per-module permissions**
(everyone sees every module), no undo on a delete, no mobile app. `guide.html`
states each of those limits in the same breath as the capability, which is the
right instinct and also means a prospect comparing at that price is comparing
against products that have all of them.

Per-workspace, the same revenue arrives at a number that reads as generous:

| Tier | Monthly | Annual (2 months free) | Seats |
|---|---|---|---|
| **Solo** | £19 | £190 | 1 |
| **Team** | £49 | £490 | up to 5 |
| **Business** | £99 | £990 | up to 20 |

Two of the three beat the per-seat incumbents on total cost for a real team,
which is the argument `MARKETING.md` was always making, with a price attached.

**That three-tier table is NOT what was chosen, and it is left standing because
the comparison above is what sized it.** The decision is below, it is a single
tier, and it is materially cheaper than any row here.

### Decided, 2026-10-17

| | |
|---|---|
| **Price** | **$15 / month per workspace**, up to **5 users** |
| **Annual** | **$150** — two months free |
| **Trial** | 7 days, **card up front**, and not live yet — see the switch below |
| **Tiers** | one. Premium tiers deferred until there is a user base to segment |
| **Non-payment** | cloud sync pauses. Local use and export continue |

**$15 reverses this section's own "GBP primary. Decided."** Taken on
instruction with the cost stated first, so it reads as a reversal rather than
as drift: £15 would be ≈$19, so a dollar price is ~27% less revenue per
workspace, and §3's lever 2 is that a **foreign-currency line on a card
statement is itself a dispute trigger** — which is the half that is not about
revenue. A UK customer sees a converted figure. That is accepted; the lever it
spends is preventive, and the levers that remain (descriptor, pre-renewal
notice, two-click cancel, 14-day refunds) are untouched.

**Against the table above it is not a small undercut.** Five users on Zoho
Standard is $70/month and on Capsule Starter $105; the same team here is $15.
That is the argument `MARKETING.md` was always making, and it is now also the
risk in the other direction — §5's own warning about **Solo at £19** ("competes
with free alternatives and is the hardest cohort to support per pound") applies
*more* at $15 with five people on it, not less. Raising a price is harder than
starting high, so this is a deliberate land-grab rather than a sized margin,
and the margin cannot be computed at all until the fee table below is filled.

**The seat cap is 5, and it is one check at invite time** — not metering. §5
above already records the shape: a member count in `/api/org/invite`, plus a
refusal screen that explains itself (§36's rule 1, not a control that looks
like it works). It is free to add **now** because no workspace can be over it
yet; it stops being free the moment one is.

### What the MSA settles about the price, and the one line it requires on screen

**$15 is tax-inclusive from the customer's side and tax-free from ours**, and
that is contractual rather than observed as of 2026-10-17: §3.1(iv) and §5 of
the MSA put global Sales Tax / VAT collection, reporting and remittance on the
provider (§2 has the sections). So the destination tax §73 measured on a real
checkout — 18% GST itemised on the INR one, `$0.00` on the USD one — is not a
behaviour that might change; it is the thing they are obliged to do.

**The price therefore depends on BYOP staying disabled.** Not as a tax
analysis, which §2 already recorded, but as a term: the shield is the reseller
appointment, and a mode described as *you remain the merchant of record* is on
its face outside it. §7's step 12.

**And one line of copy is now required, because the currency decision spends a
chargeback lever.** §5's own reversal paragraph accepts the cost in a sentence:
*"a foreign-currency line on a card statement is itself a dispute trigger"*
(§3, lever 2). The mitigation for a lever you have decided to spend is to say
so before the charge rather than after it:

> Billed in US dollars. If your card is in another currency, your bank
> converts at their rate and may add a fee.

Three decisions inside that:

- **Shown to everybody, never only to a guessed non-US customer.** We do not
  know what currency the card is in — `SETTINGS.currency` is the *workspace's*
  display currency for its own records and §5 above says plainly not to
  conflate the two. Guessing wrong and hiding it from the UK customer is the
  failure that matters; showing it to a US customer is a redundant sentence.
  §45's rule: where the answer is not provable, do not preselect one.
- **On OUR card, beside the Subscribe button**, because the provider's checkout
  is not ours to edit and the statement is read a month later. The whole value
  is that it arrives *before* the click.
- **It names the bank's fee, not just the conversion.** The dispute is rarely
  *"this is in dollars"*; it is *"this is £11.73 and I agreed to $15"* plus an
  unexplained FX charge on the same statement line. Naming both is what makes
  the figure recognisable, which is the one job §3's lever 2 has.

### The annual plan is over the India ceiling, and monthly is not

The ₹15,000 mandate ceiling above binds annual and nothing else, and the
arithmetic is worth having written down rather than re-derived:

| | USD | INR at the measured 98.91 | + 18% GST | vs ₹15,000 |
|---|---|---|---|---|
| monthly | $15 | ₹1,484 | **₹1,751** | fine, 8.6× under |
| **annual** | **$150** | ₹14,837 | **₹17,507** | **over by ₹2,507** |

**The GST is the half that tips it.** ₹14,837 alone would fit; the debit is
base + destination tax, which §73 measured on a real checkout ($65 base →
₹6,429.04 presented → ₹7,586 debited). So the usable ceiling is ≈**$128 per
debit**, not the ≈$150 the pre-tax rate suggests.

**Only an India-issued card is affected** — the ceiling is an RBI rule about
mandates, not about us, and a UK or EU card has no equivalent. So annual works
for the market this is aimed at and needs §5's **non-mandate path (invoice plus
bank transfer)** for an Indian customer, who is plausible precisely because the
seller is Indian. Two ways out if that ever matters: price annual at **$120**
(₹14,006 inc. GST, which fits), or invoice it.

**Decided 2026-10-17: invoice it.** The annual price stays **$150** and an
India-issued card over the ceiling takes a **non-mandate path — invoice plus
bank transfer** — rather than the same checkout. Re-pricing annual to $120 was
the alternative and is declined: it would cut the annual price by 20% for
**every** market to accommodate a mandate rule that applies in one, and it
would move the two-months-free arithmetic the table above rests on.

Two things make the invoice path cheap rather than a feature:

- **It is the branch §3 already wants.** Lever 1 is annual invoicing precisely
  because **a bank transfer has no chargeback mechanism at all**. So the
  customer the ceiling forces off the card rail is the customer whose payment
  carries the least dispute risk — the constraint and the control point the
  same way, which is rare enough to write down.
- **There is nothing to build until somebody asks.** No code reads it: it is an
  invoice raised by hand and a payment reconciled by hand, against a workspace
  an operator marks by the same `billingExemptUntil` field grandfathering uses
  ([`SUBSCRIPTION-UX.md`](SUBSCRIPTION-UX.md) Phase 2, item 3) — a paid-by-other-means
  workspace and a grandfathered one are the same state to the enforcement
  check, which is *do not suspend this one until that date*. Noted because the
  alternative reading is that annual-for-India needs a second payment
  integration, and it does not.

### Free now, paid when a switch is flipped

**Nothing is charged yet, and that is a stored operator decision rather than
an unset variable.** `billingMode: 'free' | 'paid'` sits in the `platform`
document beside `signupMode` and `orgCreation`, with their precedence rule
(§16): **a panel decision beats the environment and survives a redeploy.**

Why this shape rather than simply not setting a price yet:

- **It defers the one unresearched dependency.** Whether the provider supports
  a trial on a **static payment link** at all — §71 chose that link because the
  CSP forbids their JavaScript — is unread, and §69's rule is not to guess. In
  `free` mode nothing about the trial has to be settled to ship.
- **It retires a state three sections had to apologise for.** §73, §74 and §76
  each recorded that `DODO_PRODUCT_ID` is set on production in **test mode**,
  so every workspace owner sees a Subscribe button that cannot take their
  money. In `free` mode the card offers **no checkout** — which is true, and is
  a better answer than any of the three honest states §76 listed. Its exact
  wording is settled below and is not incidental: it promises **notice, not
  duration**.
- **It is reversible and it is visible**, which is the same pair §24 stage B
  insists on for suspension.

**Telling who was here first needs no new field, and the key that makes it work
is one §17 already forces you to store.** An operator decision is **three**
keys, not one — the value plus `<name>SetAt` and `<name>SetBy` — and §17
records the first version of that list missing the provenance pair. So
`billingModeSetAt` exists for the audit trail, and `orgs.createdAt` already
exists on every org (`server.js:1124`, and it is already published on
`/api/org`). An org whose `createdAt` precedes `billingModeSetAt` **was already
here when the switch was flipped**, and that comparison needs nothing added.

### Grandfathering: decided 2026-10-17, and it is NOT "for ever"

> **No permanent free tier. Possibly around a year. Per org, decided when the
> switch is flipped.**

**The recommendation that stood here was *for ever, and say so out loud*, and
it is overruled.** Left visible rather than deleted, per §21's treatment,
because the *reasoning* against it is the half worth keeping: a promise that
cannot be withdrawn should be made deliberately or not at all — and the
decision is not to make it. The cohort being small is an argument for being
generous, not an argument for being permanent, and the first version of this
section conflated the two.

**The engineering consequence is the substance, and it reverses the heading
above.** *"Needs no new field"* was true of a **rule** — one blanket policy,
derived from two timestamps that already exist. A **case-by-case** answer is
per-org state, and per-org state has to be **stored**: nothing derivable can
say *this* org got eighteen months and *that* one got three.

**So there is a field, and it must be a nullable DATE, never a boolean.** This
is the part to get right, because the obvious shape is wrong in a way that is
invisible:

| | |
|---|---|
| `billingExempt: true` | **re-creates "free for ever" by accident.** Nothing expires it, nothing reports it, and the decision just taken is unexpressible — there is no way to say *a year*. §70's *a field that survives the state it names* |
| `billingExemptUntil: <day> \| null` | an answer with an end on it. `null` means **the ordinary rules apply**, not *exempt* — §74's rule about which way an unrecognised value should default, and here the safe direction is "bills like everybody else" |

**And the default at switch time is a WINDOW, not a per-row write.** The check
reads: a stored date wins; otherwise, if `createdAt < billingModeSetAt`, apply
a grandfather window held in `platform` beside the mode itself. Three things
fall out of that and each is worth having:

- **No migration.** §12's rule is that a boot migration is idempotent and never
  deletes, and writing a date onto every pre-existing org would be a legitimate
  one — but it would also bake the window in, so changing *one year* to *six
  months* would mean a second migration over rows an operator had since edited
  by hand.
- **The uniform answer is changeable without touching a row**, which is what
  makes "we will decide later" affordable: the window is a number set at the
  moment there is information to set it from.
- **"For ever" is not expressible**, which is now a property of the design
  rather than a thing somebody has to remember. The default is a *length* and
  the override is a *date*; neither has an infinite value.

**The one thing that CANNOT be deferred is what we say now.** People are
signing up today, and a card reading *free for early users* is read as
permanent — so it would make the promise the decision above declines to make,
in the one place a customer would quote back. The free-mode card has to promise
**notice, not duration**:

> free while Nimble Clerk is in early access · we will tell you before anything
> changes · you will not be charged without being asked

All three are true and stay true whatever the window turns out to be. The third
is free: card-up-front applies to signups **after** the switch, so nobody
already here can be charged by it. And notice-before-change is the promise that
actually decides whether somebody puts their business's data in — which is the
same trade §47's rule describes for `guide.html`, a capability and its limit in
one breath.

**When it becomes visible to customers is already fixed**: flipping the switch
bumps `TERMS_VERSION`, which re-prompts everybody (§41, and §7's step 10). That
prompt is the moment each existing workspace learns its answer, so the
per-org dates want setting **before** it rather than after.

**The trap when this is built, and it is §17's exact failure.**
`OPERATOR_DECISIONS` is in **`scripts/restore.mjs`, not in `server.js`** —
checked, not recalled. So `billingMode` has to be added in *two* files: its
own `setBillingMode` beside `setSignupMode` (`server.js:167`, three keys plus
the cache invalidation §16 needs for a multi-instance deployment), **and** one
string in that list. Miss the second and a restore silently drops the mode and
reverts to the default — which is precisely *"a restore silently reopened
signups the operator had shut"*, with money attached in whichever direction the
default points.

### What the fee leaves — THREE of the four columns are now known

The 2026-10-07 version carried a net-rate table computed from Paddle's
5% + $0.50. **That table was deleted rather than converted**, because converting
it would have meant putting a Dodo fee in this document that nothing here had
read — the same class of error as §17's records-times-a-constant estimate, in
the one place it would be quoted back. That discipline stands, and it is why the
figures below carry a **grade** each:

| Grade | Means | Used for |
|---|---|---|
| **A** | read on `docs.dodopayments.com` on 2026-10-17, quoted in §8 | arithmetic, and decisions |
| **B** | the vendor's own blog and one third-party review, agreeing | sizing, never a commitment |
| **C** | a third-party index only | a prompt to go and check |

#### Column 2, the payout fee: grade A, and at this volume it is the big one

No estimate is needed for this and the result is counter-intuitive. **$5 per
payout below $1,000, with a default $100 minimum that can be lowered to $50.**

| Payout size | $5 as a share |
|---|---|
| $50 (the lowest settable threshold) | **10%** |
| $100 (the default) | **5%** |
| $1,000 (where the fee stops) | 0.5% |

So **the instinct to lower the threshold to get paid sooner doubles the worst
fee in the stack**, and the correct early-stage move is to leave it at $100 or
raise it. At $15 per workspace that is about seven workspace-months per payout,
and a bi-monthly cycle that mostly carries forward — *"if your payable balance
does not meet the threshold, it carries forward"* — which is the right outcome
rather than a problem to solve.

#### Column 3, FX into INR: grade A, and the column belongs to a different party

**There is no Dodo FX spread to put here.** A wallet linked as a settlement
currency is *"paid out in its own currency… Dodo Payments does not convert it
and charges no conversion fee"*, and **INR payouts are discontinued** anyway.
What remains is the seller's Indian bank converting an inbound USD wire *"at its
own exchange rate"*, plus that bank's charges and any SWIFT intermediary and
beneficiary fees — none of which appear on the payout invoice. **So this column
is a question for the bank** (§4's FIRC and one-year-window territory), and the
answer is the same for both rows, which means it does not affect the monthly
versus annual comparison the table exists for.

**One live consequence of the INR discontinuation.** §73 proved an India-issued
card gets INR presentment, and an INR balance *"does not count toward your
threshold"* and is not included in scheduled payouts — it has to be moved to USD
by hand, less a conversion fee. So **an Indian customer creates a stranded
balance.** Rare for a USD product sold to the UK and EU, and worth knowing
before it looks like a missing payout.

#### Column 1, the provider fee: grade B, and it is the one blocker left

| | |
|---|---|
| Base | **4% + $0.40** per transaction |
| International | **+1.5%** |
| Subscription | **+0.5%** |

**Every sale this product makes is both**, so the rate to size against is
**6% + $0.40**:

| | Gross | Fee (grade B) | Share |
|---|---|---|---|
| **monthly** | $15 | $0.90 + $0.40 = **$1.30** | **~8.7%** |
| **annual** | $150 | $9.00 + $0.40 = **$9.40** | **~6.3%** |

**Annual is worth about 2.4 points on fees alone**, which is more than §5's
earlier guess of *"roughly a point"* — because at $15 the fixed $0.40 is 2.7% by
itself. That is before the eleven removed dispute opportunities and before §3's
RDR finding, which is the larger argument.

**Do not quote these.** Grade B is Dodo's own blog plus one third-party review
agreeing; the pricing page is unreachable from this session (§8). One grade-C
index additionally lists **$1 per refund**, **$30 per dispute** and **$5 per
payout under $1,000** — and the third of those **matches grade A exactly**,
which is corroboration of that source and not of the other two figures. If $30
is near right, **a single dispute costs twice what a monthly subscription
earns**, and §3's RDR finding says that dispute cannot be contested. That is the
sizing that matters, and it is the reason to read the pricing page rather than a
reason to believe this paragraph.

#### Column 4, which is new and is not ours to keep

The **adaptive-currency fee** — 4% under $500 — is *"added on top of your
displayed price and borne by the customer"*. It does not reduce the net, so it
is not in the table; it raises what a UK customer is charged for a USD-priced
subscription, which is §3's lever 2 working against us on every renewal. §8 has
it in full, including that it is inside the ratio this section previously read
as an FX rate.

---

## 6. What is built, and the constraints it was built under

Three commits, and **none of them takes money**: `CLAUDE.md` §69, §70, §71.

| | |
|---|---|
| `lib/webhook-verify.js` | **Standard Webhooks** signature verification. CommonJS, `.js` not `.mjs` (§38's Node-version trap), not under `js/` — `tests/smoke.mjs` asserts it 404s. Never throws; returns a `code` so a route can tell a wrong secret from a replay from a mismatch |
| `POST /api/payments/dodo` | the one route in the application with **no session behind it**, so the signature *is* the authentication. Raw parser mounted **before** the global JSON one, own body limit, own rate bucket |
| `GET /api/org/billing` | owner-only, returns `{ enabled, checkout, billing }`. `enabled` exists so *"nobody has paid"* and *"this deployment cannot receive a confirmation"* are not the same answer |
| the Subscription card | four states, a static checkout link, and a return handler that strips the provider's appended query |

### The constraints, each a restatement of a rule this codebase already had

- **The integration is replaceable in a week.** One module, one webhook
  handler, one URL builder. No provider object reaches `js/app.js`. §2 records
  why this matters *more* for a thinner vendor, not less.
- **~~The API key is env-only.~~ There is no API key.** This is a **correction
  to `CLAUDE.md` §69**, which pinned `DODO_API_KEY` and `DODO_API_BASE` in its
  list of what the integration would need. Neither is read by any line of
  `server.js` — a **static payment link** plus **signature verification** uses
  the provider's API not at all, and holds no bearer token for it. The rule
  stands for the day one is needed (§17: *NEVER PUT A CREDENTIAL IN
  `platform`*, and §38/§52 on why a credential cannot live where sync can reach
  it); the point is that today the credential surface is **one signing secret**
  and nothing else.
- **`DODO_WEBHOOK_SECRET` is the only credential**, and it is env-only. Never
  logged, never exported, never in `platform`. `DODO_PRODUCT_ID` is *not* a
  credential — it appears in a URL the customer visits.
- **Ordering, not a `webhook-id` store, is what keeps a cancellation
  cancelled.** The provider states its events are *"neither terminal nor
  strictly ordered"*, so a retried `subscription.active` can arrive after
  `subscription.cancelled`. Last-write-wins on the event's own timestamp
  handles that **and** dedupes retries for free — only because the payload is a
  state snapshot rather than an increment. §70 has the full reasoning and the
  condition under which it stops holding.
- **Card data never reaches this deployment.** Hosted checkout only, and the
  checkout is a **static link** because an overlay or inline checkout means
  loading the provider's JavaScript, which `script-src 'self'` refuses (§30
  Phase 4). A constraint, not a preference.
- **Subscription state survives a restore; the two credentials beside it do
  not.** `billing` sits next to `hook` and `mail` on the workspace meta
  document and is deliberately **not** redacted on export — redacting it would
  silently un-subscribe every paying customer on a recovery, which is §38's
  webhook finding with money attached.
- **Non-payment must never reach `deleteAccount()`.** §24 stage B's suspension
  is read-only sync, reversible, destroys nothing; §15 records that the two are
  *"one word from deletion and a decade of data apart"*.
- **Export stays open on suspension.** §36 keeps export available to every role
  deliberately — *"reading the workspace and taking a copy of it is the job"*.
  A customer who stops paying and cannot get their data out is the worst
  version of this product, and the fastest route to a dispute.

### Not built, and listed so the gaps read as checked

- **Enforcement.** Nothing reads `billing` to decide what a workspace may do.
  That is a pricing decision before it is code, and §17's *"nothing is
  enforced"* still stands.
- **Tiers.** One `DODO_PRODUCT_ID`. This becomes a map, not a redesign.
- **A customer-portal link.** The card's button is the same checkout URL for a
  subscriber as for a new customer. §3's lever 4 is why this is next.
- **A `webhook-id` store.** Costed and declined — the clock already dedupes
  *and* orders, which the id does not.

---

## 7. Setting it up and testing it — the dashboard steps, in order

**For test mode, end to end.** The ordering is load-bearing in three places and
each is called out. Nothing here charges a real card, and step 3 is what stops
it emailing real people.

### Why the provider's own CLI cannot replace step 9

Worth knowing before starting, because it is the thing that would otherwise
waste an afternoon. Their documentation says so itself:

| | What it does | What it produces |
|---|---|---|
| `dodo wh trigger <event> <url>` | sends a mock payload **with no `webhook-id`, no signature and no timestamp** — their docs tell you to parse it with `unsafeUnwrap` | a **false pass** |
| `dodo wh listen <url>` | forwards real headers, but *"the relay and the CLI parse the JSON body and serialize it again before forwarding… signature verification fails even though the headers are intact"* | a **false failure** |

Of the two, the false pass is the dangerous one: it is how a verification
function ends up looking right and verifying nothing. **The dashboard's
Webhooks → Testing → Send example is signed the same way as a real event**, so
that is the only thing that settles it.

### Step 0 — sync the Render mirror, or everything below tests an old build

**Render deploys from a mirror of this repository, so a push here does not
deploy** (`CLAUDE.md` §65). None of §69/§70/§71 is live until the mirror is
synced, and `POST /api/payments/dodo` on a stale build is a **404** — which
reads exactly like a wrong URL in the dashboard.

Check which commit is actually serving:

```sh
curl -s https://nimbleclerk.com/healthz
# {"ok":true,"storage":"mongodb","commit":"<sha>"}
```

Compare that `commit` against the head of
`claude/pwa-modular-crm-builder-xcwgzv`. If it is behind, sync the mirror and
wait for the redeploy before step 7.

### On the dashboard, in test mode

**The dashboard is <https://app.dodopayments.com>.** Worth stating because the
two hosts that look like they should be it are not: `test.dodopayments.com` and
`live.dodopayments.com` are the **API** hosts, and a browser gets **403** from
both whether or not you have an account — so they read as a sign-in wall rather
than as the wrong address. `dashboard.dodopayments.com` does not resolve.
Verified by probing all four, after this section was written assuming the
reader already had it open and a reader did not.

**Test mode is a toggle inside the dashboard, not a second URL.** One sign-in,
both modes.

**Everything below belongs to the mode it was created in.** Products, API keys
and webhook endpoints do not cross between test and live, and a test-mode
signing secret does not verify a live delivery. Confirm the mode toggle before
each step rather than once at the start.

**Subscriptions live at Sales → Subscriptions**, which is where steps 14a, 15
and 17 all act. Not under *Transactions* — that is a sibling section, and
guessing it is where this runbook sent a reader once already.

**1 · Create the subscription product.**
A recurring product, **at least $1.00 USD** or equivalent. The price on it is
the price the customer sees — this repository deliberately holds no copy of it
(§71), so whatever is set here is the only figure. Copy the **product id**.

**2 · Check the currency you can actually present in.**
§5 decided GBP primary. If the product cannot be priced in GBP on this account,
that is a finding for §8 rather than something to work around.

**3 · Turn off test-mode customer email — BEFORE the first test payment.**
*Settings → Communication → Email.* In test mode the provider sends **real
email to real addresses**, with `[TEST MODE]` in the subject, capped at 100 a
week. Doing this after the first payment means a receipt has already gone
somewhere.

**4 · Add the webhook endpoint.**
*Developer → Webhooks → Add endpoint*, URL:

```
https://nimbleclerk.com/api/payments/dodo
```

**5 · Select the events explicitly.**
**Deselecting everything subscribes you to every event type** — per their docs,
not a guess. The route answers 2xx for anything it does not handle, so nothing
breaks either way; the reason to be explicit is the log. The ones that matter:

```
subscription.active      subscription.renewed     subscription.updated
subscription.plan_changed subscription.past_due   subscription.on_hold
subscription.paused      subscription.unpaused    subscription.cancelled
subscription.expired     subscription.failed
payment.succeeded        payment.failed
```

**This list was WRONG the first time and the omission is instructive.** It
named seven subscription events where the server handles eleven, leaving out
`updated`, `paused`, `unpaused` and — the expensive one — **`failed`**. A real
test-mode decline then emitted `payment.failed`, `subscription.failed` and
`subscription.updated`; only the first was subscribed, so the workspace stored
a payment outcome with no subscription state behind it and the Subscription
card read **"Status: unknown"**. The provider's dashboard showed *3 events
logged, 1 delivery succeeded*, which is the pair of numbers that names it.

**The authority is the code, not this list** — keep them in step by reading
`BILLING_SUBSCRIPTION_EVENTS` and `BILLING_PAYMENT_EVENTS` in `server.js`:

```sh
# `[a-z_.]+` — NOT `[a-z.]+`, which silently drops plan_changed,
# past_due and on_hold, and looks authoritative doing it (§9)
grep -A 14 'const BILLING_SUBSCRIPTION_EVENTS' server.js | grep -oE "'[a-z_.]+'"
```

Selecting **more** than this costs nothing — every verified event the server
does not handle is acknowledged with a 2xx and logged (§70) — so if their UI
offers a select-all for `subscription.*` and `payment.*`, take it. Selecting
**fewer** is what produces a card that is confidently wrong.

**6 · Copy the signing secret.**
On the endpoint's **Overview** tab, `whsec_…`. **It is a bearer credential** —
it is the entire authentication on that route. Do not paste it into a file in
this repository, a commit message, or a chat.

### On Render

**7 · Set three environment variables.**

| | |
|---|---|
| `DODO_WEBHOOK_SECRET` | the `whsec_…` from step 6 |
| `DODO_PRODUCT_ID` | the product id from step 1 |
| `DODO_CHECKOUT_BASE` | `https://test.checkout.dodopayments.com` |

**The third one is the step this runbook originally got wrong**, and it cost a
blocked run. It said *"do not set `DODO_CHECKOUT_BASE` — it is a test seam"*,
which was true of why the variable was added and false about what it does.
**Checkout is served on two hosts**: `checkout.dodopayments.com` for live and
`test.checkout.dodopayments.com` for test. Products do not cross modes (step
1), so a test-mode product id on the live host redirects to
*"This link isn't available"* — **the same page an id that does not exist at
all produces**, so the failure names nothing and reads as a broken build.

Measured rather than looked up, because their published payment-link format
names only the live host: both hosts serve `/buy/{id}` and both 307 an unknown
id to `/error/not-found`, and `test-checkout.dodopayments.com` does not
resolve at all.

**Before the redeploy, check the id itself** — five seconds, and it separates
the two causes:

```sh
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' \
  "https://test.checkout.dodopayments.com/buy/<product id>"
```

| | |
|---|---|
| `200`, or a redirect that is **not** `/error/not-found` | the id is good; the host was the whole problem |
| `307` → `/error/not-found` | the id is wrong on **both** hosts. Most likely **Save as Draft** was pressed instead of **Add product** — both buttons sit together on that form — so the product exists and is not purchasable. Otherwise it was mis-copied; theirs look like `pdt_…` |

Saving these redeploys the service. Wait for it.

**Unset `DODO_CHECKOUT_BASE` when moving to live mode**, with the product and
webhook endpoint (§7's *before live mode*, step 5). A live product id on the
test host fails exactly the same way, in the other direction.

**8 · Confirm the card appeared.**
Sign in as an **owner** and open Settings. The **Subscription** card should now
be present and read *"No subscription on this workspace yet"* with a
**Subscribe** button.

| What it says instead | What it means |
|---|---|
| *"Payments are not finished being set up here"* | `DODO_WEBHOOK_SECRET` is not set on the deployment, or the redeploy has not landed |
| the card is **absent entirely** | `DODO_PRODUCT_ID` is not set *and* nothing is recorded — which is also the correct state for every other deployment |
| nothing, as a member | it is owner-only, by design |

### Prove the signature check — the step that actually matters

**9 · Webhooks → your endpoint → Testing → Send example.**
Pick `subscription.active`. **Expect HTTP 200.**

**What success looks like is counter-intuitive, so read this before concluding
it failed.** The example payload carries no `metadata.wsId`, so the server
verifies the signature, finds no workspace named, logs that, and answers 200
**without changing the card**. That is the correct result: the thing under test
is the signature, and a 200 is the only way it can pass.

| Response | Cause |
|---|---|
| **200** | verification passed — this is the pass |
| **401** | the secret does not match this endpoint, or a live-mode secret was pasted into a test-mode deployment. The body deliberately does not say *which* check failed; the reason is in the service log |
| **503** | `DODO_WEBHOOK_SECRET` is unset on the deployment. Deliberately not a 2xx, which would discard real events in silence |
| **404** | the deployed build predates the route — step 0 |
| **429** | more than 120 deliveries in a window from one IP. Raise `RATE_DODO_WEBHOOK_MAX` if a bulk replay needs it |

### Pay end to end

**10 · Settings → Subscribe**, and pay with a test card. CVV `123` and expiry
`06/32` on all of them, any address.

**Read the currency on the checkout page BEFORE picking a card, and take the
card from the same region.** The provider offers a different set of payment
methods per currency — an INR checkout offers India-issued cards and UPI, and
a US card is simply not among them. The refusal is
*"This payment method can't be used here. Please use a different payment
method."*, which reads as a declined card rather than as the wrong card, and
their own FAQ records the same mismatch surfacing as a 500 in test mode. The
first attempt here was `4242…` on a `₹` checkout and cost a failed payment plus
the time to work out why.

An unpriced-currency product resolves to the **buyer's** region, so if you are
in India you get `₹` and these are the four that work:

| | |
|---|---|
| `4576 2389 1277 1450` | India Visa, succeeds |
| `5409 1626 6938 1034` | India Mastercard, succeeds |
| `4706 1312 1121 2123` | India Visa, generic decline |
| `5105 1051 0510 5100` | India Mastercard, generic decline |

On a `$` checkout:

| | |
|---|---|
| `4242 4242 4242 4242` | US Visa, succeeds |
| `5555 5555 5555 4444` | US Mastercard, succeeds |
| `4000 0000 0000 0002` | generic decline |
| `4000 0000 0000 9995` | insufficient funds |

**And an India card subscription is not instant.** RBI mandate rules apply, so
`subscription.active` can lag the payment — do not read a card still saying
*"Confirming your payment"* as a webhook failure until the delivery log says so
(step 12).

**11 · Watch the return.** You land back on `/app`, the client moves you to
Settings, and the provider's appended `payment_id`, `status` and **`email`**
are stripped from the address bar. The card reads *"Confirming your payment"*
until the webhook lands, then shows **Status** and **Next payment**.

The pending note is per-tab and survives a reload, and it is cleared by the
server having an answer rather than by a timer — so if it persists, the webhook
has not arrived and the delivery log is where to look.

**`redirect_url` is not navigated to directly, and this matters when it
fails.** The success page auto-forwards to an undocumented hop of theirs —
`test.dodopayments.com/return/<id>` — **and that hop is what appends the query
parameters**, so our `captureCheckoutReturn()` only ever runs if it completes.
Observed failing with **HTTP 429** after three test payments in half an hour,
on the customer-facing path, with Chrome's *"This page isn't working"* and no
mention of the provider. A reload got through.

**Do not read that as our redirect being wrong**, which is the obvious
conclusion from a browser error page on a URL we supplied. Two things to check
instead: the address bar says `dodopayments.com` rather than `nimbleclerk.com`,
and `GET /api/org/billing` already holds the subscription (step 12) — because
**the webhook is the only thing that records anything** (§70) and it does not
travel through that hop. It arrived in the same minute here.

So the hop failing costs the pending note and nothing else, which is the design
holding rather than luck: §71 built the note as reassurance for the tab that
paid, never as the record. What it leaves is a **narrow worse case** — a
customer whose return hop fails *and* whose webhook has not landed yet sees
*"No subscription on this workspace yet"*, which is the wrong sentence for
somebody who has just paid. The window is seconds and nothing can close it from
our side, because knowing a payment is in flight is exactly what the return URL
was for.

**12 · Verify from the server, not from the screen.** Either the dashboard's
delivery log (a 200 and the attempt count), or:

```sh
# as the signed-in owner, in the browser console on /app
await (await fetch('/api/org/billing')).json()
```

### The unhappy paths, which are the ones worth testing

**13 · A cancelled or declined checkout.** Use the decline card **for the
checkout's own currency** (step 10), or abandon the page. The return carries a
`status` other than `succeeded`, and the card must say nothing was charged —
**not** show a pending note.

A declined first payment also emits `payment.failed` *and*
`subscription.failed` *and* `subscription.updated`, which is why step 5
subscribes to all three. With only `payment.failed` delivered, the record holds
a payment and no subscription — the state §72 added the fifth card branch for.

**14 · A renewal failure.** `4000 0000 0000 0341` exp `12/34` — this card
**succeeds the first charge and fails the renewal**, which is the only way to
exercise `subscription.past_due` and the *Access until* row that
`past_due_ends_at` drives.

**It is a US card and the docs publish no India equivalent**, so on an INR
checkout step 10's method rule probably refuses it. Unverified. If it does,
either price the product in USD for this one test or drive `past_due` by
replaying a hand-edited event from the delivery log instead.

**14a · Pause, then resume.** *Dodo's* dashboard → **Sales → Subscriptions** →
the active subscription → **Pause**, read the Settings card, then **Resume** and
read it again. Two events, two card states.

**There is no control for this in our app, and that is why this step names the
provider.** Every word in this section means *Dodo's* dashboard — §7 is headed
"the dashboard steps" and says so — but this one step is the one a reader meets
out of context, from §9's table or from a hand-off, and **this project calls its
own operator panel the dashboard too** (§24: Admin → Deployment). A bare
"dashboard → pause" therefore sends an owner into Settings looking for a
control that was never built, which is exactly what happened. §6 lists the
customer-portal link under *Not built*; until it exists, pausing is the
provider's screen and nowhere else.

**15 · Cancel from Dodo's dashboard.** Expect `subscription.cancelled` and a
card that reflects it.

**16 · Replay an older event after the cancellation.** **The card must still
say cancelled.** This is the one that costs money if it is wrong, and the whole
reason §70 compares timestamps rather than storing `webhook-id`s.

The control is called **Replay**, and it is worth naming because *Resend* — the
word this runbook used until a reader could not find it — is the provider's
**email** control on a different screen entirely. Their steps, from their own
documentation:

1. **Developer → Webhooks** → the **Logs** tab. The table carries *Event type*,
   *Message ID*, *Event ID*, *Sent at*, *Attempted at*, *Response code* and
   *Duration*, searchable by id or event type and filterable by status.
2. **Click the row** for the earlier `subscription.active`. The message detail
   page shows the full payload, every delivery attempt with its response code
   and duration, and any error the endpoint returned.
3. **Replay** on the attempt — *"each attempt carries a Replay action to
   re-drive that one message without leaving the page"*.
4. Reload Settings on that workspace. The row must not move.

**Do NOT use the bulk modes for this.** *More actions* offers *Recover failed
messages*, *Replay missing messages* and *Bulk replay messages*; the last
re-drives successful messages too, which would re-deliver the cancellation and
destroy the ordering the step exists to test. One attempt, one Replay.

> **Then read the replayed delivery's envelope `timestamp`, because the whole
> test turns on it.** §70 discards anything strictly older, so a Replay that
> preserves the original `03:12:14` is correctly discarded — and a Replay that
> re-stamps it to replay time is genuinely **newer**, is accepted, and brings a
> cancelled subscription back to life. **Their documentation does not say
> which**, and it must not be assumed: their *email* docs state a resend "keeps
> the date of the original event", but that is a different subsystem. If the
> card flips back to active, that is a finding about the limits of the ordering
> guard before it is a defect in it.

### Clean up — not optional

**17 · Cancel every test subscription.** Test subscriptions **keep renewing**
and keep delivering webhooks for weeks after testing stops. Cancel each one
from the dashboard, or with the test-mode key:

```
PATCH https://test.dodopayments.com/subscriptions/{id}
{ "status": "cancelled" }
```

**18 · Decide whether to turn test-mode email back on.** Step 3 turned it off.
If a dunning or receipt email is ever going to be tested, it has to go back on
first — and §3's lever 3 depends on those emails existing in **live** mode, so
check the live-mode setting separately.

**19 · Unset `DODO_PRODUCT_ID` on the deployment when the session ends**, or
decide not to — but decide. Setting it is what makes the Subscription card
appear, and the card is gated on `canEditSettings()`, so **every owner of every
workspace on that deployment** gets a *Subscribe* button pointing at a
test-mode checkout that cannot take their money. Nothing is at risk — test mode
charges nothing and a real card is refused — but a control that looks like it
works and cannot is the one thing this product tries hardest not to ship.

It is also the condition §70, §71 and §72 each deferred §27's documentation
walk on (*"the card is absent for every user"*), so leaving it set means that
walk is owed rather than deferred, and the walk needs a price first (§5). Two
honest states, and the third is the one to avoid: **unset between test
sessions**, or **set with the price decided and the documents walked**.

### Before live mode — and most of this is not code

1. **~~Read the MSA~~ — mostly DONE, and the documentation did more of it than
   the contract.** The seller-of-record row closed from the MSA on 2026-10-17
   (§2.1/§4.3 appoint it reseller and MoR, §3.1(iv)/§5 put global VAT/Sales Tax
   on them). The three that were still wanted then: **chargeback set-off and the
   evidence questions are closed** from the provider's own docs, not the
   contract (§8 — set-off confirmed, the fee kept on a win, evidence allowed
   with a 10-day deadline), **payout mechanics are closed and the FX column
   moved to the seller's bank** (§5), and **only the fee percentage is left** —
   published on a pricing page this session cannot reach, so it is one browser
   visit rather than a contract read. **Ask for the per-seller dispute rate at
   the same time**, since that is the one commercial question no page answered.
2. **Account Verification — 1–3 business days, and THREE of its requirements
   are things this site does not have.** Live mode exists at signup; live
   payments and payouts turn on separately, and payouts additionally need the
   bank form approved plus a Monitoring Review plus compliance review. The
   individual path is Product Information → **KYC** (government photo ID from an
   accepted country, plus a selfie liveness check) → **Bank Verification**, whose
   *"account holder's name must match your Identity Verification document."*

   And the part that is **ours**: the live site *"must be publicly reachable and
   show pricing, Terms of Service, Privacy Policy, a refund and cancellation
   policy, and a contact route."* Measured against `nimbleclerk.com` on
   2026-10-17:

   | Required | Have |
   |---|---|
   | Terms of Service | ✅ `/terms` |
   | Privacy Policy | ✅ `/privacy` |
   | **pricing** | ❌ — nothing in this repository names a price, deliberately (§71), and `/guide` asserts in a test that it shows no currency figure |
   | **refund and cancellation policy** | ❌ — the word *refund* appears in **no** legal page. §3's lever 5 is the 14-day promise and it has never been written down anywhere a customer can read it |
   | **a contact route** | ❌ — and worse than absent: `privacy.html` says *"contact us at the address below"* and **there is no address below** |

   The last one is a **live defect on a legal page**, found here by grepping for
   a payment prerequisite rather than by reading the page — §40's shape, where a
   page promises something the deployment does not deliver and nothing
   contradicts it. It is worth fixing on its own merits whatever happens to
   payments. The other two are the pricing commit's work anyway (§2.1's twelve
   files), which means **verification is gated on the same commit as the price**
   and cannot be started early to get the 1–3 days out of the way.
3. **One CA session** — §4's five questions, with question 1 now live because
   the account is an individual one. Get the intermediary point in writing.
4. **File the LUT** for the current financial year if it is not filed.
5. **Re-create the product in live mode** (copying keeps the details and gives
   a **new id**), **add a second webhook endpoint** in live mode with **its own
   secret**, re-point both environment variables, **unset
   `DODO_CHECKOUT_BASE`** so the link goes back to the live host, and
   **re-point `DODO_PORTAL_URL`** at the live portal — it carries a host that
   differs by a `test.` prefix, so a test-mode link left in place sends paying
   customers to a portal where they have no account. All four move together: a
   live product id left pointing at the test host fails exactly as step 7
   describes, in the other direction, and says nothing.
6. **Answer §2.4's six product decisions** — quotas, non-payment, export when
   suspended, the signup gate, where plan state lives, and what happens to
   everybody currently on the free beta. **Grandfathering is settled in
   principle** (§5: no permanent tier, possibly around a year, per org) and
   what is left here is two numbers and a list — the default window, and which
   workspaces get longer. Set the per-org dates **before** step 10's
   `TERMS_VERSION` bump, since that prompt is where each one learns its answer.
7. **Build enforcement** (§6) under §24 stage B's suspension rules. ~~and the
   customer-portal link (§3 lever 4)~~ — **the portal link is built**
   (`CLAUDE.md` §74), so what is left here is enforcement, and the
   two-click cancel §3 lever 4 asks for is now the provider's hosted flow
   rather than anything to write.
8. **Rewrite `MARKETING.md`** (§2.1), and **list where that copy has already
   been published** — rewriting a source does nothing about a post written from
   it months ago. If the answer is "nowhere yet", write that down; it is the
   cheapest state this will ever be in.
9. **Walk §2.1's twelve files** and §2.5's doc list, and add the provider to
   `privacy.html`'s recipient roster — §40's *"that is the complete list"* has
   already been false twice, both times caught by looking at what the
   deployment does rather than at what the code could do.
10. **Bump `TERMS_VERSION`** — everybody re-prompted, which is the mechanism
    working (§41, §2.2). The billing prompt goes **after** the terms modal, or
    it asks for money before agreement.
11. **Decide how a stopped webhook endpoint gets noticed.** Their documentation
    states plainly that **the webhooks dashboard offers no email alerts for
    failing deliveries** — monitoring is the **Logs** and **Activity** tabs,
    which are *pull*. That is §40's rule arriving at the one mechanism in this
    deployment that carries money: a dead endpoint means payments taken and
    never recorded, and the only thing that would say so is a screen nobody is
    obliged to open. §39's push-versus-pull split is the shape of the answer —
    the *Error rate (24h)* column is the pull half and exists; the push half
    does not, and nothing in this repository can see the failure either.
12. **Do NOT enable Bring Your Own Processor**, and confirm *Settings → Payment
    providers* still reports **Billing + Payments (Merchant of Record)** as
    **Active** after the live-mode switch. §2 has the reasoning: BYOP's own
    description is *"you remain the merchant of record"*, which is §1's Option
    A — so one click there owes UK VAT from the first sale, and nothing in this
    repository would change or notice. It is on this list because the one
    occasion somebody will be clicking around that tab is while doing step 5.

---

## 8. What this document does not know

Recorded so the gaps read as checked rather than missed. **The 2026-10-07
version's open items were all about Paddle and are moot**; these replace them.

**Six of them closed on 2026-10-17 from the provider's own documentation**, and
the sentence above them — *"every one of them is answered by the same read — the
dashboard and the MSA"* — was **wrong**, which is the reusable part. It assumed
the open questions were commercial and therefore contractual, so the only
instruments were a dashboard login and a signed agreement. Most of them were
**published**: `docs.dodopayments.com` states the dispute set-off, the evidence
procedure, the payout schedule and fee, the minimum payout, the conversion-fee
tiers, the refund-fee treatment and the verification requirements outright. The
read that closed them needed no account and no lawyer. A question filed under
*"ask the vendor"* is worth one pass of *"did the vendor already say"* first.

**What is still open is narrower and differently shaped: it is the ONE figure
the vendor publishes only on a page this session cannot reach.** The marketing
apex is proxy-blocked here — measured, not assumed:

```
www.dodopayments.com/pricing   301 -> https://dodopayments.com/pricing
dodopayments.com               curl: (56) CONNECT tunnel failed, response 403
```

Which is §64's shape exactly (`paddle.com` is blocked the same way), and it is
why the headline rate below is recorded **by grade of evidence** rather than as
a figure. §72 established that discipline for the seller-of-record row and it
applies harder here, because a fee is the number that gets multiplied.

| | Why it is open |
|---|---|
| ~~**Whether the provider is contractually the seller of record for our sales**~~ | **CLOSED 2026-10-17 — the first row here to close, and the most important line in this document.** (It was *"the only row here that has ever closed"* for a few hours, and six more closed the same day — a superlative with a short shelf life, corrected rather than deleted because the claim's own staleness is §29's thesis.) The MSA (dated 2026-02-26) appoints Dodo reseller and Merchant of Record at §2.1/§4.3 and puts global Sales Tax/VAT collection, reporting and remittance on them at §3.1(iv)/§5. §2 carries the sections and the consequences. The two weaker kinds of evidence are left recorded there rather than deleted, because the *order* is the lesson: behaviour (itemised destination tax) could have come from a well-built gateway, a named **Active** account mode was much stronger and still the vendor describing itself, and only the agreement settled it. **Conditional on BYOP staying disabled** — a mode whose own description is *you remain the merchant of record* is on its face outside the appointment that provides the shield |
| **The fee — the percentage** | **STILL OPEN, and it is the only row that blocks §5's table.** Stated nowhere in the documentation: the payouts page, the payout-structure page and the FAQ each describe the transaction fee and then say *"Refer to the pricing page"*. That page is unreachable from here (above). §5 carries what the weaker sources say, graded |
| ~~**Payout mechanics into INR, and the FX spread**~~ | **CLOSED as to mechanics, and the FX question MOVED to a different counterparty.** Payouts consolidate through **USD, GBP and EUR wallets only**; **INR native payouts are discontinued** — *"Scheduled payouts do not include an INR balance, and an INR balance does not count toward your threshold."* Default cycle **bi-monthly**, initiated on the **18th and the 4th**; minimum **$100**, lowest settable **$50**, carried forward below it; **payout fee $5 for payouts below $1,000**. A wallet **linked as a settlement currency** is *"paid out in its own currency… Dodo Payments does not convert it and charges no conversion fee."* So **there is no Dodo FX spread into INR to find** — on a linked USD wallet the conversion happens at the seller's Indian bank, *"at its own exchange rate"*, plus that bank's charges and any SWIFT intermediary and beneficiary fees, none of which appear on the payout invoice. The column is still unfillable and **it is now a question for the bank, not the provider** (§4's FIRC/one-year-window territory). §5 has what this does to the net rate, and it is larger than the fee at low volume |
| ~~**Chargeback set-off, the per-dispute fee, and whether a per-seller rate exists**~~ | **Set-off CLOSED, two of §2's three questions CLOSED, the per-seller rate still open.** *"When a dispute opens, the disputed amount and a dispute fee are deducted from your balance"* — set-off confirmed, and §3 was right to assume it. *"The dispute fee is not refunded, even if you win"* — question 2 answered, and against us. *"You decide whether to accept or counter each dispute, and you supply the evidence"*, **10 days** to respond, PDF/JPG/PNG/ZIP under 5 MB, no links — question 3 answered, and **in our favour**, which §3 had assumed away. Question 1 (by value or by count) **narrows without closing**: the *scheme* thresholds are published with **count floors** a small seller cannot reach — VAMP global at a 1.5% ratio **and ≥1,500** disputes and fraud reports in a month, CEMEA at 2.2% **and ≥150** worth **≥$75,000** — but those are what the provider manages at its own level, not a rate it imposes on one seller. Whether a tighter per-seller rate exists is unread. **The per-dispute fee amount is on the pricing page**, so it shares the row above |
| ~~**Whether GBP presentment is available on this account**~~ | **CLOSED — yes.** The supported-currency table lists **GBP** for the United Kingdom with a **0.30 GBP** minimum, among ~80 codes. It is also one of the three **payout wallet** currencies, which is the half that matters more and which §5's reversal to USD did not know: a GBP-priced product with a linked GBP wallet has **no conversion at the provider's end at either side of the transaction**. And the mechanism carries a price §5 did not know either — see the next row |
| **What the India acquirer's merchant name is on the mandate screen** | the authorization page is served by **Cashfree** and reads *"Click here to go to **Business Name** website"* — a literal placeholder, on the one screen where a customer is granting a standing debit. It is the provider's configuration, not ours, so it is a support question rather than a setting; raise it before live mode, because the screen it is on is the one that loses mandates |
| **NEW — the adaptive-currency fee, which nothing here had costed** | **4% under $500, 3% from $500 to $1,500, 2% above**, applied when the customer's currency differs from the product's base currency. *"Added on top of your displayed price and borne by the customer"* by default; a **Fees Inclusive** setting moves it onto the seller, deducted from settlement; *"Fees are not refunded."* So a **$15 USD** product shows a UK customer **$15 plus 4%**, as a recurring surcharge on a converted line — and §3's lever 2 says a foreign-currency line is itself a dispute trigger. This is the cost §5's reversal to USD took without knowing it existed, and it also **corrects §5's own arithmetic**: the `₹6,429.04` against `$65.00` is a ratio of ~98.9 that §5 read as an implied FX rate, and it is **rate × 1.04** — the fee is inside the number |
| ~~**Account-verification requirements for an individual seller**~~ | **CLOSED, and it found three blockers nobody had connected to payments.** An individual is a *"creator or sole proprietor"* with no company registration; three forms in order — Product Information, **Identity Verification (KYC)** with a government photo ID from an accepted country plus a selfie liveness check, and **Bank Verification** whose *"account holder's name must match your Identity Verification document."* **Typical 1–3 business days**, the ID check *"completes within minutes"*. Live payments and payouts **turn on separately**: payouts additionally need the bank form approved **and** a Monitoring Review **and** compliance review. And the requirement that is ours to fix — see §7 |
| ~~**Whether the statement descriptor is configurable**~~ | **Still open, but now open WITH evidence rather than unread.** Searched: the supported-currency, payouts, payout-structure, disputes, refunds, verification and FAQ pages carry nothing about statement text. The FAQ's branding entries cover the **checkout page**, **payment links** (logo, brand name, support email) and **invoices** — three places that are not a card statement. So the documentation does not address §3's lever 2 at all, which makes it a support question with a specific wording rather than a page to go and find |
| **NEW — Visa RDR is ON BY DEFAULT at a $100 threshold, and that reshapes §3** | *"Visa RDR is enabled by default on all Dodo Payments accounts with a $100 USD threshold"*, and *"A Visa RDR fee replaces the dispute fee for these disputes"*; an RDR-resolved dispute *"appears as a lost dispute"*. **So at the $15 monthly price every dispute is auto-refunded and auto-lost with no defence stage**, while the **$150 annual** price is above the threshold and is the only one of the two that can be contested at all. §3 has the consequence; it is the strongest argument for annual billing in this document and §3 reached it without knowing this existed. The RDR and Ethoca fee amounts are on the pricing page |
| **NEW — an Ethoca-deflected chargeback is INVISIBLE to this deployment** | *"Ethoca alerts and deflections never create a dispute"*, so they emit no `dispute.*` event: an alert refund fires **`refund.succeeded`** and any linked cancellation fires *"the usual subscription event"*, and a deflection fires **no event at all**. The product therefore behaves correctly — §70's route records the cancellation — while **any count of disputes taken from our own data is structurally blind to them.** Recorded neutrally: this is ordinary industry practice and §2's note about the FTC's action against a comparable MoR was about using it to *mask* a fraud rate while onboarding bad actors, not about the tool. What it means here is only that the dispute count visible to us is not the dispute count the schemes see, by design |
| **Where `MARKETING.md`'s copy has already been published** | §2.1's own open item, and only the owner can answer it |
| **Softex / STPI applicability** | §4's CA question 3 |

**What is NOT open, and is worth saying because this document used to be mostly
unknowns:** the engineering surface is read and verified — Standard Webhooks
signing against a frozen vector computed three independent ways (§69), the
two-mode separation, the retry schedule, the event list, the payload shape, the
test cards, the static-link parameters, and the two CLI tools that cannot test
verification. **§7 is not merely drivable — it has been driven**, in test mode,
end to end: a declined payment and a successful one on each of two regions, the
signature check passing, ten events delivered, and the Settings card reading
`active` with the next billing date.

**What that leaves is four rows, and they are no longer all commercial.** One is
a single published figure behind a blocked page (the fee, and the dispute, RDR
and Ethoca fee amounts with it); one is a scheme-level question the vendor may
not impose at all (a per-seller dispute rate); one is a question with no
documentation and therefore a support ticket (the statement descriptor); and two
are the owner's alone (`MARKETING.md`'s published copy, and Softex/STPI). **The
operational mechanics are now known** — set-off, evidence, deadlines, payout
cycle, payout fee, minimum, conversion tiers, refund treatment, verification —
and knowing them changed §3 and §5 rather than merely filling a gap.

**And the thing no document here can establish.** §40's rule: *a mechanism that
hangs off a URL configured somewhere else has a failure mode no test in this
repository can see.* A payment provider is the largest such mechanism this
deployment will ever have — the dashboard, the webhook endpoint, the dunning
schedule and the tax settings all live in somebody else's account. Whatever
monitoring is built for it has to be checked against **the provider's own
screens**, not against the code, which is the lesson §40 paid for with weeks of
a reminder engine that had never once run. §7's step 0 is that rule's smallest
instance: the repository cannot see which build is deployed, so the first step
is to go and look.

---

## 9. Before live: the test-mode sign-off matrix

§7 is *do these in order*. This is *nothing goes live until every row is
accounted for* — and the first thing it does is stop you re-driving by hand
what is already proven.

### What `tests/payments.test.mjs` already proves — do NOT hand-drive these

Twenty-four tests post **real signed payloads** at the real route and read the
state back. The whole ordering mechanism is covered synthetically, which is
cheaper, deterministic, and runs on every push:

| Already proven | Test |
|---|---|
| unsigned, wrong-secret, and altered-body deliveries refused | 3 tests |
| the refusal says nothing about *which* check failed | 1 |
| **a cancellation sticks, and a retried older event cannot undo it** | 1 — the one that costs money |
| a newer event applied over an older one | 1 |
| a redelivery changes nothing | 1 |
| two events sharing a timestamp applied in arrival order | 1 |
| a payment event does not blank the subscription beside it | 1 |
| the two clocks are independent | 1 |
| unknown event type / no wsId / unknown wsId / unusable timestamp → 2xx, dropped | 4 |
| no customer identity stored | 1 |
| `billing` never reaches a colleague through sync; a viewer cannot read it | 2 |
| a currency change does not erase it; the export carries it | 2 |
| unconfigured answers 503, never a 2xx | 1 |
| nothing to sell is not the same as not configured | 1 |

**So the dashboard's job is not the state machine.** It is the three things no
synthetic payload can answer: *is the real payload shaped the way the code
reads it*, *do the real sequences match what was assumed*, and *does the
provider's own screen agree with ours*.

### Step 1, and it closes an open item this document already names

§70 wrote the field inventory from the provider's **documentation** and said
so: *"nothing here has yet seen a real delivery, so it stores only fields the
provider's own documentation names… widening it is the first thing to do once
a real payload has been read, not before."*

**Done. A real `subscription.active` body was read out of the delivery log and
every read lands — the inventory needs no widening**, which is the answer §70
asked for and could not give itself:

| Code reads | Real payload carries | |
|---|---|---|
| `event.type` | `"subscription.active"` | ✅ in the handled set |
| `event.timestamp` | `"2026-10-14T03:12:14.162928Z"` | ✅ on the **envelope**, ISO, parses |
| `data.metadata.wsId` | `"916160ba-…-08bfb4f19a11"` | ✅ passes `WSID_PATTERN`, org resolves |
| `data.subscription_id` | `"sub_0Nph212BlsXmVQEUgSYxV"` | ✅ |
| `data.status` | `"active"` | ✅ |
| `data.next_billing_date` | `"2026-11-14T03:12:14.213422Z"` | ✅ → *Nov 14, 2026* on the card |
| `data.past_due_ends_at` | `null` | ✅ **the key is present** — the name is right, nothing has filled it |

That last row is the useful one. A key the provider **named differently**
would read `null` and render as a missing row rather than an error — this
document's standing failure shape — so seeing `past_due_ends_at` present-and-null
is what distinguishes *not filled yet* from *looking in the wrong place*.

**And the PAYMENT envelope has now been read too, so the inventory is
complete.** `payload_type: "Payment"` is a genuinely different shape, and all
three payment-branch reads plus all three envelope reads land:

| Code reads | Real payload carries | |
|---|---|---|
| `event.type` | `"payment.succeeded"` | ✅ in the handled set |
| `event.timestamp` | `"2026-10-14T03:12:14.162928Z"` | ✅ envelope, parses |
| `data.metadata.wsId` | `"916160ba-…"` | ✅ **see below — this was not guaranteed** |
| `data.payment_id` | `"pay_0Nph210m6qtzcC3OX8IQ1"` | ✅ |
| `data.status` | `"succeeded"` | ✅ |

**`metadata` riding on the payment envelope is the finding, not a formality.**
`metadata_wsId` is set on the *checkout link*, so it is a property of the
subscription the link created — there was no guarantee the provider would copy
it onto each payment. Had it not, every payment event would have been
discarded as `ignored: 'no workspace'` (logged loudly, per §70, and discarded
all the same) while subscription events worked perfectly. A half-working
integration, and the half that fails is the one that carries money.

**And BOTH payloads confirm §70's exclusion was worth making — the payment one
more than the subscription one.** Each carries `customer.email`,
`customer.name` and a full billing address (city, state, street, postcode,
country); the payment body adds **`card_holder_name`, `card_last_four`,
`card_network`, `card_type` and `card_issuing_country`**. A generous
`billingFieldsFor` would have put all of it on the meta doc, which **is** the
`data` collection (§17), and therefore into every nightly backup artifact —
card details included.

### The payment body answers one of §8's rows and moves another

Three money findings, and none of them is a field worth storing:

- **There is NO fee field. Anywhere.** No `platform_fee`, no `net_amount`, no
  deduction of any kind. `settlement_amount: 7671` is **gross of tax** —
  `(7671 − 1170) / 100 = $65.01`, which is the $65.00 base to within the
  conversion's own rounding. So **§5's net-rate table cannot be filled from
  payment webhooks at all**: the fee is taken at payout, not at payment, and a
  payout record or a statement is the only place it can be read. That changes
  *where to look*, which is why it is worth a line.

  **And it is worse than "no fee field", because the FAILURE body carries the
  same three numbers.** `settlement_amount`, `settlement_tax` and
  `settlement_currency` are byte-identical on the refused payment and on the
  successful one, so they are a **quotation** and not a settlement record.
  Summing them would count the payments that failed. A payout record is not
  the better source here — it is the only one.
- **`currency: "INR"` while `settlement_currency: "USD"`** — charged
  ₹7,587.26 (₹1,157.38 GST), settled $76.71 ($11.70 tax), an implied 98.91
  INR/USD. §8's open row reads *"payout fee and FX spread into INR"* and
  assumed **one** conversion. This payload shows a settlement leg in USD, so
  there may be **two**: INR charged → USD settled → INR paid out, with a
  spread available on each. The payload cannot say whether the second leg
  exists; the payout screen and the MSA can. The row is widened rather than
  answered.
- **`card_issuing_country: "IN"`, `card_network: "visa"`,
  `card_last_four: "1450"`** — the India Visa test card from step 10,
  confirming §73's card-region finding from the payment side rather than from
  the refusal.

**Two fields exist that would improve the product and are NOT being taken**,
recorded so the decision reads as taken rather than missed:

- **`error_code` and `error_message`**, `null` on success and **populated on a
  failure, which has now been read** — so this is no longer a candidate
  awaiting data. It is **declined on the data**, for three reasons:
  `error_message` reads *"Ask the customer to use a supported method"*, which
  is addressed to the **merchant**; under an MoR that is Dodo and us, while the
  Settings card is read by the **payer**, so §53's "the provider's own words"
  rule inverts and the text reaches nobody present. A raw `error_code` is not
  the safe half either — issuers return vague declines to payers on purpose,
  so a field that *can* carry a real decline reason makes its disclosure a
  decision rather than a UX win. And **one observed code is not a
  vocabulary**. Full reasoning in §73.
- **`invoice_url`**, a per-payment receipt on the provider's host. Our screen
  offers no receipt link, which is a real gap for anyone asking where theirs
  is. **Do not link or store it until its access control is known:** the
  payment id is in the path and we already hold the payment id, so if that URL
  is not gated then anyone holding a payment id can fetch somebody else's
  invoice — and we would have built the thing that hands it to them.

`disputes: []` and `refunds: []` ride on the payment body too, which is
relevant to the unhandled-families note below: a replayed payment event would
carry dispute state without subscribing to the dispute events. Not a mechanism
to rely on — nothing re-delivers a payment event on your schedule — but worth
knowing it is there.

Three more facts read off the **subscription** body, each with a consequence:

- **`currency: "USD"`, `recurring_pre_tax_amount: 6500`** — confirms §5's
  measured finding that the product's base is USD and the INR figure is a
  conversion.
- **`subscription_period_count: 20`, `subscription_period_interval: "Year"`,
  `expires_at: "2046-10-14"`** — the test subscription is configured to run
  **twenty years**. So `subscription.expired` is not merely slow to produce,
  it is unreachable by waiting; see the table below.
- **`cancel_at_next_billing_date: false`, `scheduled_change: null`** — which
  is what makes the cancellation step below need a check before the replay.

### The PAUSE body: all reads land, and two findings that are not reads

A real `subscription.paused` has been read. Every read lands again — the type
is in the handled set, `status: "paused"`, `subscription_id` present,
`metadata.wsId` rides on a pause as it does on a payment, the envelope
`timestamp` parses, and `past_due_ends_at` is **present-and-null for the third
time**, which is now a pattern rather than a single observation.

**`paused_at` is the first new field any real payload has offered that is
worth taking**, and the reason is the defect below rather than completeness.

**The card contradicts itself on a paused subscription — OBSERVED, not
derived.** `next_billing_date` survives the pause **unchanged** — still
`2026-11-14T03:07:44` on a subscription paused at `09:33:09` — and
`billingStatusHTML` renders that row whenever it is truthy. A screenshot of
the live card reads exactly:

```
Status        paused
Next payment  Nov 14, 2026
```

A paused subscription has no next payment. Two adjacent rows, one contradicting
the other, and the wrong one looks like a fact — §33's shape on the one card
whose job is to say where the money stands. **The fix is `paused_at`**: store
it, say *Paused since 14 Oct*, and suppress the next-payment row while a
subscription is paused. Not done in the same sitting as the matrix, because
`js/app.js` means a `CACHE_VERSION` bump and a mirror sync, which changes the
deployment under a half-finished test run.

**`paused_at` resets to `null` on resume**, read off a real
`subscription.unpaused`.

> **It is NOT a usable "is paused" condition, and this document said it was.**
> The `subscription.cancelled` body carries
> `paused_at: "2026-10-14T09:33:09.666207Z"` with `status: "cancelled"` —
> resume clears it, cancel does not. So present means *was paused and never
> resumed*, not *is paused*. **The condition is `status`.** Left corrected in
> place rather than rewritten, because the wrong half is the reusable warning:
> a field that reads like a state flag on the two payloads you have seen is
> still a timestamp, and the third payload is where that costs you.

**And the defect is broader than pause — `cancelled` keeps the row too.**
`next_billing_date` is still `2026-11-14T03:07:44` on the cancelled
subscription, so the card reads *Status cancelled / Next payment Nov 14, 2026*.
That is the worse of the two cases: it tells somebody who has just cancelled
that they are being charged next month. **So the fix keys on any status that
will not bill** — `cancelled`, `paused`, `expired` — and not on `paused_at`.

### The UNPAUSE body, and the pair that was never actually driven

Every read lands on `subscription.unpaused` too (`status: "active"`,
`subscription_id`, `metadata.wsId`, envelope timestamp, `past_due_ends_at`
present-and-null a fourth time). **But it is a different subscription on a
different workspace than the pause**, which means the *transition* was never
observed — only the two shapes, separately:

| | the pause | the unpause |
|---|---|---|
| `metadata.wsId` | `916160ba-5a85-…` | **`4e7a2b1b-625e-…`** |
| `subscription_id` | `sub_0Nph1H0sBfHPI2Qw3Gi4y` | **`sub_0NpiDYUvqFDCW61KztGPJ`** |
| `created_at` | 03:07:23 | **09:37:57** — four minutes *after* the 09:33 pause |
| customer | `mac@docnald.com`, US address | `adwasd@asd.com`, Gangtok IN |

A subscription created at 09:37 cannot be the one paused at 09:33, so
`sub_0Nph1H0sBfHPI2Qw3Gi4y` **remains paused**. Worth distinguishing because
the valuable half — the payload inventory — is closed either way, and the
cheap half is closed by resuming *that* subscription and watching *that*
workspace's card go `paused` → `active`.

**And `recurring_pre_tax_amount` is not stable per product**: `6500` on the
paused subscription against `6499` on this one, same
`product_id: pdt_0NpgrNlojLxbnMOoISbcr`, both `currency: "USD"`. Almost
certainly a conversion round-trip against the India billing address. Nothing in
`billingFieldsFor` reads it, so it costs nothing today — recorded because the
moment anything *does* read it, a per-product constant is the wrong assumption.

### The CANCEL body: the immediate kind, and a new identity class

Read off a real `subscription.cancelled`, and it is the **immediate** cancel
rather than the deferred one — `status: "cancelled"`,
`cancel_at_next_billing_date: false`, `scheduled_change: null`. That is the
state §7 step 16's replay needs to mean anything, so the check below it is
meaningful rather than vacuous.

Every read lands. Three new fields arrive and none is read:

| Field | Why it is not stored |
|---|---|
| `cancelled_at` | the envelope `timestamp` already carries it, and §70 stores one clock per fact |
| `cancellation_feedback` | `"other"` — a dropdown the merchant picked; decides nothing about what a workspace may do |
| **`cancelled_by`** | **operator identity — a class nothing anticipated** |

```json
"cancelled_by": { "actor_type": "merchant_user",
                  "email": "emah84@gmail.com", "name": "Mohamed A Hameed" }
```

**§70's rule is about *customer* identity; this is the operator's.** Storing it
would put the deployment operator's name and address on **every tenant's** meta
doc and therefore into every nightly artifact (§17) — a wider leak than the one
that rule was written to prevent, since it is the same person on every row.
`billingFieldsFor` reads five fields and this is not one of them, verified
rather than assumed, so it is already excluded. Recorded so a future widening
knows there are now two identity classes to refuse, not one.

### SIX subscriptions, three distinct amounts, and a status we never see

The dashboard lists six against the four the payloads had revealed:

| id | Status | Amount |
|---|---|---|
| `sub_0Nph212BlsXmVQEUgSYxV` | **Active** | $65.00 |
| `sub_0NpiDYUvqFDCW61KztGPJ` | Cancelled | $64.99 |
| `sub_0Nph1H0sBfHPI2Qw3Gi4y` | Cancelled | $65.00 |
| `sub_0NpgzTEZbXlEAgR4zJU6P` | Failed | $65.00 |
| `sub_0NpgvabPhQqhHLju8mxiE` | Failed | $65.00 |
| `sub_0Npi6jaStnWZkK1zu0TRe` | **Pending** | $64.98 |

**`Pending` is what an abandoned checkout leaves behind.** It never reaches
this endpoint — there is no `subscription.pending` in the handled set and no
event arrived — which is correct, and is why §7 step 13 passes as a purely
client-side check. Worth knowing it leaves a row on their side, because
somebody reconciling the two screens will otherwise count it as a subscription.

**Three amounts on one `product_id`** — $65.00, $64.99, $64.98 — which
sharpens the note above from *not stable* to *drifting a cent per attempt*,
consistent with a conversion round-trip. Still read by nothing.

### THREE live subscriptions across TWO workspaces, and a card can only show one

| id | Workspace | Priced | State |
|---|---|---|---|
| `sub_0NpgzTEZbXlEAgR4zJU6P` | `916160ba` | INR | failed, never activated |
| `sub_0Nph1H0sBfHPI2Qw3Gi4y` | `916160ba` | USD 6500, US address | **paused** 09:33 |
| `sub_0Nph212BlsXmVQEUgSYxV` | `916160ba` | INR charged / USD settled | **active**, next 14 Nov |
| `sub_0NpiDYUvqFDCW61KztGPJ` | **`4e7a2b1b`** | USD 6499, IN address | **active**, resumed 09:40 |

**Workspace `916160ba` alone carries three**, two of them live. The US card and
the India card each created a subscription and **both went live**. Nothing is
wrong with the code: `applyBillingEvent` resolves by clock
exactly as §70 designed, so the card reflects *the most recent event* rather
than *the workspace's billing*. It currently says `paused` while a renewal is
scheduled on a subscription it is not describing.

**This is §71's duplicate-subscription hazard, arrived at legitimately.** The
Settings card hands an existing subscriber the same checkout URL labelled
*Manage payment* (§6, *Not built*), so a customer can reach this state by
pressing the only control on the card. Here it came from testing two regions,
which is the same end state by a different road — and it proves the hazard is
reachable rather than theoretical.

**It also confounds the cancel-then-replay step.** If the surviving
subscription emits anything mid-test, that event is genuinely newer, it
legitimately overwrites the cancelled state, and it is indistinguishable from
the ordering guard failing. §34's shape. **Cancel down to one subscription
before running step 15/16.**

### The eleven subscription events, and which can be produced at all

The route handles eleven. Test mode can produce six of them on demand; the
other five need a billing cycle to pass or a dunning sequence to run out.

| Event | How to produce in test mode | Status |
|---|---|---|
| `subscription.active` | a successful checkout | ✅ **done** — both regions |
| `subscription.failed` | the region's decline card | ✅ **done** — India |
| `subscription.updated` | arrives alongside the others | ✅ **done** |
| `subscription.renewed` | arrived on a *first* payment, which was not expected | ✅ **done** — see below |
| `subscription.cancelled` | **Dodo's** dashboard → cancel the subscription | ✅ **done — and it was the IMMEDIATE cancel**, so the replay is meaningful |
| `subscription.paused` | **Dodo's** dashboard → Sales → Subscriptions → Pause | ✅ **done** — every read lands; see above |
| `subscription.unpaused` | the same screen → Resume | ✅ **shape done** — but on a *different* subscription, so the paused→active transition is unobserved; see above |
| `subscription.plan_changed` | needs a **second product** and a plan change | ☐ — see below |
| `subscription.past_due` | a renewal that fails — the US-only card, §7 step 14 | ☐ **probably unreachable on INR** |
| `subscription.on_hold` | dunning exhausting its retries after `past_due` | ☐ **days, not minutes** |
| `subscription.expired` | the subscription reaching its period end | ☐ **2046 — see below** |

**`expired` is worse than "a month", and the payload is what says so.** The
test product carries `subscription_period_count: 20` /
`subscription_period_interval: "Year"` and `expires_at: "2046-10-14"`, so
waiting for it is not an option at any timescale. Producing it means a
**purpose-built second product with a short subscription period**, which is
the same second product `plan_changed` needs — so if that product is ever
created, configure it to expire and close two rows at once.

**Cancelling has two meanings and only one of them is testable.** The payload
carries `cancel_at_next_billing_date: false` and `scheduled_change: null`, so
the provider models *cancel now* and *cancel at period end* as different
states. A deferred cancellation arrives as `subscription.updated` carrying
`status: "active"` — which this route records faithfully, and which is the
**correct** card (the customer still has access until the period ends). But it
leaves nothing cancelled, so replaying an older `active` over it proves
nothing: it is §34's shape, a check passing against its own fixture state.

So after cancelling, **read the delivery log before doing the replay.** A
`subscription.cancelled` carrying `status: "cancelled"` is the state the
ordering guard is about. A `subscription.updated` carrying `status: "active"`
means the cancel was deferred, and the replay has to wait for an immediate
one.

**`renewed` arriving on a first payment is a real finding and not noise.** The
name says renewal; it fired on initial activation. Nothing broke — it is in
`BILLING_SUBSCRIPTION_EVENTS` and carries the same status — but any logic that
ever treats `renewed` as *"money arrived again"* would double-count the first
payment. Worth confirming against a second real cycle before anything reads it
that way.

**The last three cannot be honestly signed off in test mode**, and saying so is
better than a tick. `past_due` → `on_hold` → `expired` is a sequence measured
in days to a month, and the renewal-failure card the provider publishes is
US-only with no India equivalent. The code path is covered by the suite; **the
payload shape is not, and `past_due_ends_at` is the one field in the inventory
that nothing has ever filled.** Two ways to close it, neither free: price the
product in USD for one test so the renewal-failure card is usable, or accept
that the first real `past_due` in production is the first one anybody sees —
in which case the Settings card's *Access until* row is the thing to watch.

### What the dashboard's two facilities each prove, and what neither does

They are not interchangeable and §7 step 9's pass already depends on knowing
which is which:

| | Proves | Does **not** prove |
|---|---|---|
| **Webhooks → Testing → Send example** | the signature check, end to end, against a real signed payload | any state transition — the example carries **no `metadata.wsId`**, so the correct outcome is *200 and the card unchanged* |
| **Delivery log → replay** | ordering and re-delivery, because a replayed event is a **real** one and does carry `wsId` | anything about an event type you have never received — there is nothing to replay |

So for the five events test mode cannot trigger, **neither facility helps**:
Send example proves only the signature, and there is no real delivery to
replay. That is the gap, stated once rather than discovered later.

### The checkout and return paths

| | Status |
|---|---|
| success return → query stripped, Settings reached | ✅ |
| **cancelled / abandoned checkout** → *"nothing was charged"*, no pending note | ☐ **§7 step 13** |
| declined → the fifth card branch, never `unknown` | ✅ |
| their `/return/<id>` hop failing | ✅ observed — 429, recovered on reload |
| a second workspace paying, each seeing only its own | ☐ — the suite proves isolation; the dashboard has never had two |

### Events we do NOT handle, and two of them are a decision

Their catalog carries **refund, dispute, licence key, payout, credit,
abandoned checkout, dunning and entitlement grant** families beside the
thirteen the route knows. All are acknowledged with a 2xx and logged, which is
§70's deliberate rule and the right default — an endpoint that 404s an
unexpected type earns eight retries and a red mark on somebody else's
dashboard.

**But refund and dispute are not decoration here.** §3 is an entire section
about chargebacks, and today a customer can dispute a charge, win, and keep
full access with the Settings card still reading `active` — because nothing
reads those events. That is **not a bug** while nothing is enforced (§6: no
code reads `billing` to decide anything), and it becomes one the moment
enforcement lands. So it is a row on *before live mode* rather than a fix now,
and it needs the same question asked of it as everything else in §8: does the
provider even send them to this endpoint, or only show them on the dashboard?

**ONE event is now subscribed on the endpoint and not handled by the route**,
down from three — a different and safer state than the families above, because
these actually arrive. Sixteen are ticked on the dashboard; **fifteen** are in
`BILLING_SUBSCRIPTION_EVENTS` plus `BILLING_PAYMENT_EVENTS`:

| | What it means | Where it stands |
|---|---|---|
| `subscription.update_payment_method` | the provider wants a new card | ✅ **handled** (`CLAUDE.md` §76). It was the warning before a `past_due`, so silence meant the first a customer knew was losing access — and Phase 1's portal is what made it actionable |
| `payment.processing` | a debit is in flight, not yet settled | ✅ **handled** (§76). The India case was the reason: a mandate debit sits here for real time, and a first payment in flight was being reported as one that had been recorded |
| `payment.cancelled` | a payment attempt was cancelled | ☐ **still ignored, and deliberately** — the customer cancelled it themselves, so there is nothing to tell them. The only reading worth having would be an abandoned-checkout metric, which is §3's territory and not the card's |

The remaining one answers `200 {received:true, ignored:'unsubscribed event'}`
with no log line, so nothing is retried and nothing is noisy. **Leave it
ticked.** Unticking is the worse move in both directions: the provider's docs
state that deselecting *every* event subscribes you to all of them, and a
ticked-but-ignored event costs one 2xx while an unticked one has to be
remembered later.

### Order to run it in

Nothing here needs a fresh payment except the plan change, so the whole
remainder is one sitting:

1. ~~**Read a real payload**~~ — **done, both shapes.** Every read lands on the
   subscription body *and* on the payment body, so the inventory is complete
   and needs no widening.
2. **Abandon a checkout** (§7 step 13) — the one return branch never driven.
   Entirely client-side: no `abandoned_checkout` event is involved or needed.
3. ~~**Pause, then resume**~~ — **both shapes read, every read lands.** It also
   found the next-payment row contradicting a paused status, and that
   `paused_at` resets to null on resume. **The transition itself is
   unobserved** — the two events came from different subscriptions on
   different workspaces — so resume `sub_0Nph1H0sBfHPI2Qw3Gi4y` and watch that
   workspace's card if the pair is wanted on one subscription.
4. ~~**Cancel down to ONE subscription**~~ — **done.** 1 Active, 0 On Hold,
   2 Cancelled, plus two Failed and one Pending that were never live.
5. ~~**Cancel, then read the log**~~ — **done, and it was the IMMEDIATE cancel**
   (`status: "cancelled"`, `cancel_at_next_billing_date: false`,
   `scheduled_change: null`), so the replay below is not vacuous. **Now replay
   an earlier `active`** (§7 step 16) and require the card to still read
   cancelled. This is the one that costs money if the clock comparison is
   wrong, and the only part of the matrix the suite proves solely
   synthetically. Safe to run now: the surviving Active emits nothing until
   14 Nov, so nothing newer can land mid-test.
6. **Decide `past_due`** — a USD-priced test, or accept production as the first
   sighting and watch the *Access until* row. A short-period second product
   closes `plan_changed` and `expired` with it.
7. **Cancel every test subscription** (§7 step 17), because they keep renewing
   and keep delivering for weeks.
8. ~~**Then fix the two card defects this sitting found**~~ — **done, and both
   fixes plus two more are in `CLAUDE.md` §74.** The next-payment row now
   suppresses on any status that will not bill, and the *Manage payment*
   button is gone: a live subscriber is sent no checkout link at all, and
   gets the hosted customer portal instead. The two extras found while doing
   it were the email arriving unlocked — which is what let one person create
   four customer records — and a card that warned against subscribing while
   offering the button.

   **It needs `DODO_PORTAL_URL` set on the deployment**, pasted from
   *Sales → Customers → Share Invite → **Static Link***. Until it is, a
   subscriber is told self-service is not set up rather than being shown a
   button to nowhere — correct, and not the state to leave it in. Note before
   testing it: **the provider sends no portal sign-in emails in test mode**,
   so the link can be checked and not driven.

   Both are `js/app.js` and `server.js`, so they want a `CACHE_VERSION` bump
   and a mirror sync, which is why they waited until no test was running
   against the deployed build.

Then §7's *before live mode* list, which is mostly not code.

---

## Sources

The regulatory, VAT and card-scheme research was done 2026-10-07 and is
**unaffected by the change of rail** — §1, §3's thresholds and §4 all rest on
it. The provider research was redone 2026-10-13.

Primary and professional sources first; the secondary ones are marked, because
§21's treatment is that a claim from outside gets checked rather than accepted,
and knowing which tier a number came from is part of checking it.

**The provider (2026-10-13)**

- Everything in §6 and §7 is from **first-party documentation**, read as
  `docs.dodopayments.com/llms-full.txt` — webhook signing and headers, the
  retry schedule and timeout, the event catalogue and payload shape, the
  test/live separation, the test card list, the static-payment-link parameters
  and return query, the Checkout Sessions shape, the $1.00 subscription
  minimum, the test-mode email behaviour, and the two CLI tools' limitations.
  **No fee, payout or chargeback figure was found there**, which is §8.
- The signature scheme is **[Standard Webhooks](https://www.standardwebhooks.com/)**,
  which is what makes `lib/webhook-verify.js` portable.

**Regulatory and professional**

- RBI PA-CB circular, analysed — [Trilegal](https://trilegal.com/wp-content/uploads/2023/12/RBIs-circular-on-cross-border-payment-aggregators.pdf)
- Stripe's own RBI e-mandate documentation — [support.stripe.com](https://support.stripe.com/questions/rbi-e-mandate-regulations-faqs?locale=en-GB) (relevant only to India-issued cards, so not to our market — recorded so nobody re-derives it)
- GST export of services, zero-rating and LUT — [PayGlocal](https://payglocal.in/blog/gst-on-export-of-services-impact) · [TaxGuru on LUT filing](https://taxguru.in/goods-and-service-tax/guide-lut-filing-zero-rated-export-supply-compliance.html)

**VAT**

- UK, non-established taxable persons and the zero threshold — [Anrok](https://www.anrok.com/vat-software-digital-services/united-kingdom) · [AVASK](https://avask.com/blog/uk-vat-threshold-2026/)
- EU non-Union OSS for third-country sellers — [AVASK](https://avask.com/blog/vat-for-digital-services/)

**Card scheme rules**

- Visa VAMP and Mastercard ECM thresholds, 2026 — [Chargeflow](https://www.chargeflow.io/blog/chargeback-thresholds)
- 3DS liability shift and what it does not cover — [DashDevs](https://dashdevs.com/blog/3ds-liability-shift-explained/)

**The rejected option, kept as §2's prior**

- Paddle's chargeback policy — [their help centre](https://www.paddle.com/help/manage/risk-prevention/understanding-chargebacks-with-paddle), read server-side 2026-10-07. This is where §2's blockquote and §3's "assume the worst" come from
- FTC v. Paddle — [Morrison Foerster](https://www.mofo.com/resources/insights/250707-the-ftc-gives-the-merchant-of-record-model-a-paddling) · [Frankfurt Kurnit](https://advertisinglaw.fkks.com/post/102kgk1/ftc-settles-with-paddle-for-5-million-over-alleged-role-in-deceptive-tech-suppor) · [BleepingComputer](https://www.bleepingcomputer.com/news/security/paddle-settles-for-5-million-over-facilitating-tech-support-scams/)

**Secondary — vendor and comparison content, treat as directional**

- PA-CB authorisation list and Stripe's absence from it — [Winvesta](https://www.winvesta.in/blog/businesses/19-firms-got-rbis-pa-cb-license-who-won-and-why) · [Xflow](https://www.xflowpay.com/blog/international-payment-gateways) (Xflow is a PA-CB holder writing about its own market)
- CRM price comparison — [Axis Consulting](https://axisconsulting.io/pipedrive-pricing-plans/)

> **One access note worth keeping, because it is this repository's own rule
> arriving from outside.** During the 2026-10-07 research, `paddle.com` was
> allow-listed and answered — with a **301 to `www.paddle.com`**, a *different
> host* and not on the list, giving `CONNECT tunnel failed, response 403` one
> hop later. `CLAUDE.md` §57 and
> [`LAUNCH-CHECKLIST.md`](LAUNCH-CHECKLIST.md) §1.0 both state that **apex and
> `www` are two origins**; an allow-list is a third place that is true, and the
> failure looked like the entry had been applied because the apex *did* answer.
> **Add hosts, not brands** — and the same held for this provider, where
> `docs.` and `app.` are each separate from the apex again.
