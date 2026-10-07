# Taking payment — the rail, the price, and the chargeback plan

> **Current reference, and nothing here is scheduled.** This sits in `docs/`,
> the tier `CLAUDE.md` §29 defines as maintained — not `docs/archive/`, which
> is frozen. Researched 2026-10-07. **No charging is planned yet**; this is the
> document to open *when* that decision is made, so that nothing has to be
> worked out under time pressure. If you change something it names, change it
> here too.
>
> **Two decisions are taken and the rest are questions.** Per-workspace tiers
> rather than per-seat, and **GBP as the primary currency** — both chosen by
> the owner, recorded here rather than argued for. Everything else is written
> as a question with the reasoning attached (§2.4's style), never as an answer.
>
> **This file is deliberately unserved.** `PUBLIC_DOCS` in `server.js` is
> `['manual.html', 'product-tour.html']` and nothing else under `docs/` is
> reachable (§28) — checked, not assumed. That is what lets this document be
> blunt about what is unfinished and about what it does not know.
>
> **Scope.** This is the *commercial* half: how money reaches an Indian bank
> account from a UK customer, what a chargeback costs and who bears it, and
> what to charge. The *consequences* of charging — the twelve files whose text
> goes false, `TERMS_VERSION`, the privacy roster, and the six product
> decisions pricing forces — are [`LAUNCH-CHECKLIST.md`](LAUNCH-CHECKLIST.md)
> **Part 2**, and are not restated here. Read both.

---

## 0. Where this sits, and what it is not

| | |
|---|---|
| **Part 2 of the checklist** | what charging *breaks*: text, terms, privacy, enforcement, suspension, the signup gate |
| **This document** | what charging *needs*: a payment rail that works from India, a tax position, a price |
| **Neither** | company formation, the CA engagement, the ICO registration and the solicitor-drafted DPA — all still outstanding |

**One disclaimer, once.** The India half of §4 below needs a chartered
accountant who has done SaaS service exports. That is a few hours of somebody's
time and it closes the only part of this plan that cannot be settled from
inside the repository. Everything in §4 is written so that conversation is
short rather than exploratory.

---

## 1. The structural fact: Stripe cannot be the collection rail

This is the finding that decides the architecture, and it is not a preference.

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

**Option B is the recommendation.** Under an MoR there is no cross-border
collection to regulate: you sell to a UK company, that company resells to the
end customer, and it pays you by bank transfer. One foreign customer, one
export invoice per payout, settled through your AD bank in the ordinary way.
The PA-CB framework never engages, because nobody is aggregating anything on
your behalf.

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
revenue. That is the thing 5% buys.

---

## 2. The recommendation: Paddle as Merchant of Record

**5% + $0.50 per transaction**, no monthly fee, falling to 4% + $0.50 above
$100k/month and 3% + $0.50 above $1M/month. No Indian entity required; payout
to an Indian business by bank transfer or Wise.

### Why Paddle and not the others

| | Why not |
|---|---|
| **Lemon Squeezy** | acquired by **Stripe** (July 2024); new seller signups reported waitlist-gated through 2026. Building the revenue rail on a product whose owner also sells the competing product is a dependency not worth taking at launch |
| **Dodo Payments · Playto · Creem** | India-friendly and cheaper on paper, and **every source for them is their own marketing page**. For the rail that holds all the revenue, a vendor with no independent operating history is the wrong trade |
| **FastSpring** | credible MoR, materially more expensive, aimed higher up market |
| **PA-CB aggregator direct** | Option A above — the VAT position, not the fee, is what rules it out |

Paddle has the longest track record on the edge cases that actually bite:
Canadian provincial tax, Indian GST, Brazilian DST.

### The vendor risk, stated rather than glossed

**The FTC fined Paddle $5 million in June 2025** for facilitating deceptive
tech-support schemes — inadequate KYC (merchants charging US consumers before
KYC completed, in one case past $500,000 with no identification), and using
Ethoca/Verifi to refund flagged transactions before they became reportable
chargebacks, which **masked the real fraud rate**. The settlement permanently
bans it from processing for tech-support telemarketers and imposes tighter
client screening and transaction monitoring.

Two consequences, and neither is a reason to avoid them:

- **Onboarding will be stricter than the marketing implies.** Expect real KYC,
  and start it early because it can block everything downstream.
- **The MoR model as a category now has regulatory attention.** So the
  constraint that matters is not *which* MoR — it is that the integration must
  stay thin enough that a second one is a week's work. See §6.

---

## 3. Chargebacks: what an MoR protects you from, precisely

"Chargeback protection" is the most oversold phrase in this market, so this
section separates what is real from what is advertising.

### What is real, and it is the larger half

**The dispute is raised against Paddle, not you.** You hold no merchant
account, so **your MID cannot be terminated and you cannot be MATCH-listed.**
That is the protection worth having, and the thresholds say why:

| | Trigger, 2026 |
|---|---|
| **Visa VAMP** | excessive at a **1.5%** ratio — cut from 2.2% on **1 April 2026** across US, Canada, EU and APAC. **$8 per disputed or fraudulent item, and no warning tier.** The ratio is TC40 fraud reports + TC15 chargebacks over settled card-not-present transactions |
| **Mastercard ECM** | 1.5%–2.99% **and** 100+ chargebacks in a month, fines escalating monthly, possible MATCH listing |
| **Mastercard HECM** | 3%+ and 300+ chargebacks |

A one-person Indian merchant selling to UK/EU consumers is directly exposed to
that. Under an MoR, it is Paddle's ratio and Paddle's problem.

Paddle also runs the dispute defence automatically, and **bears fraud
liability**.

### What is not real, and must be planned around

Reporting is consistent that **Paddle deducts the disputed transaction amount
plus a chargeback fee (~$20 / £20 / €20) from your balance**, and does not
refund the fee even when it wins the dispute. If it wins, the transaction
amount comes back; the fee does not.

> **This is the one claim in this document that is not from a primary source.**
> `paddle.com` is blocked by this session's egress proxy (§8's standing limit),
> so the wording above is from secondary reporting of their help centre.
> **Read the Master Services Agreement's liability and set-off clauses before
> signing**, and correct this section from what it actually says. §21's
> treatment: a claim from outside gets checked against the source, not
> accepted.

**So budget as if you bear the cash cost of every dispute.** What you are
buying is that disputes cannot end your ability to take payment at all.

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

None of these needs a vendor, and the first one is worth more than the rest
combined.

1. **Annual billing, invoiced, for anything above a single seat.** A bank
   transfer has **no chargeback mechanism at all**. It also removes 11
   transaction fees per year and pulls cash forward, so this points the same
   way as the margin.
2. **A statement descriptor the customer recognises** — `NIMBLECLERK`, never
   the processor's name. *"I don't recognise this charge"* is the most common
   consumer dispute and it is entirely self-inflicted.
3. **A pre-renewal email, 7 days out, naming the amount and carrying the cancel
   link.** For an annual renewal this is the difference between a renewal and a
   dispute. **Note what this deployment cannot do:** it has no outbound email
   of its own — §51's chaser drafts into the reader's own mail client, and
   §52/§53's send uses the *tenant's* own provider key. So this must come from
   the MoR's own dunning and receipts. Do not build a mail sender for it.
4. **Self-serve cancellation that works in two clicks.** A cancel flow that
   requires an email is a dispute generator.
5. **Refund on request inside 14 days, without argument.** UK and EU consumers
   have statutory cancellation rights for digital services anyway; a refund
   costs 5% and a chargeback costs the amount, the fee, and a mark against a
   1.5% ceiling.

**Items 2–5 are product decisions, not payment configuration.** They belong in
whatever ships the billing screen, and they are cheaper to build in than to
retrofit.

---

## 4. Tax, split into what goes away and what stays ours

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
  roughly 15 days to pay once the deadline passes. Monthly MoR payouts make
  this a non-risk in practice — which is exactly why the invoice-to-payout
  matching has to stay clean enough to prove.
- **The "not an intermediary" condition** is the one to get an opinion on. We
  sell our own software to the MoR rather than arranging a supply between two
  other parties, so we are not an intermediary — but a reseller structure is
  precisely the shape that invites the question. **Get it in writing once.**

### For the CA conversation, so it is short

1. Entity: sole proprietorship or private limited, and what that changes.
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
because the workspace belongs to the org.

### Currency: GBP primary. Decided.

The market is UK and Europe. `£19` reads as a price; `$22.80` reads as a
conversion, and a foreign-currency line on a card statement is itself a dispute
trigger (§3, lever 2). An MoR does localised pricing, so this is configuration
rather than code. `DEFAULT_SETTINGS.currency` is `'USD'` in the app (§42
recorded that as wrong for this market and deliberately did not change it) —
**that is the workspace's display currency for their own records and is a
separate thing from what we bill in.** Do not conflate them.

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

**None of these numbers is decided.** They are a starting point sized against
the comparison table above, and the thing to revisit first is whether **Solo**
should exist at all — a one-person tier at £19 competes with free alternatives
and is the hardest cohort to support per pound.

### What the fee actually leaves

| | Gross | MoR fee | Net | Kept |
|---|---|---|---|---|
| Team, monthly | £49 | £2.45 + £0.50 | **£46.05** | 94.0% |
| Team, annual | £490 | £24.50 + £0.50 | **£465.00** | 94.9% |

Annual is worth ~0.9 points on fees alone, before the 11 removed dispute
opportunities. **And this is not the final net** — a payout fee and the FX
spread into INR sit underneath it. Confirm both from the MSA and record them
here; a net rate that ignores FX is the same class of error as §17's
records-times-a-constant estimate.

---

## 6. The engineering constraints, decided before any code

These exist so that the first integration does not become the only possible
integration.

- **The MoR is replaceable in a week.** One module, one webhook handler, and
  plan state on the org. No provider object reaches `js/app.js`, and no
  provider-specific field is stored on a record or a workspace. The FTC action
  in §2 is why this is a constraint rather than an aspiration.
- **The API key is env-only.** §17's rule has teeth here: *NEVER PUT A
  CREDENTIAL IN `platform`* — it is in every nightly artifact, downloadable by
  anyone with repo read access. Same class as `BACKUP_TOKEN`. It is also not a
  `settings` field and not a meta-doc sibling: §38 and §52 both record why a
  credential cannot live where sync can reach it, and **this one has no
  per-tenant variation at all**, so it has no business being stored.
- **The inbound webhook is §30 Phase 4 from scratch.** `lib/safe-fetch.js`
  guards *outbound* and does nothing whatever for a request arriving at us
  (§38, and §57 records the same point for inbound mail). It needs its own body
  limit, its own rate-limit bucket, and **signature verification** — the sender
  carries no session, so the signature is the only thing that authenticates it.
  And §61 R2's ordering: authenticate, then authorize, then meter.
- **Card data never reaches this deployment.** Hosted checkout only. §2.3 notes
  that being able to write that sentence truthfully is worth something.
- **Plan state on the org**, beside `suspendedAt` (§2.4). The workspace belongs
  to the org (§5), so the thing being paid for is the org.
- **Non-payment must never reach `deleteAccount()`.** §24 stage B's suspension
  is read-only sync, reversible, destroys nothing; §15 records that the two are
  *"one word from deletion and a decade of data apart"*.
- **Export stays open on suspension.** §36 keeps export available to every role
  deliberately — *"reading the workspace and taking a copy of it is the job"*.
  A customer who stops paying and cannot get their data out is the worst
  version of this product, and it is also the fastest route to a dispute.

---

## 7. Sequence, when the decision is taken

Nothing below is started yet. The ordering is load-bearing: steps 1–3 can block
everything and none of them is code.

1. **One CA session** — §4's five questions. Get the intermediary point in
   writing.
2. **File the LUT** for the current financial year if it is not filed.
3. **Apply to Paddle.** Post-FTC onboarding is stricter; this is the step with
   an unknown duration and somebody else's timeline.
4. **Read the MSA** — chargeback set-off, payout fees, FX spread. Correct §3
   and §5 here from what it says.
5. **Rewrite `MARKETING.md`** (§2.1), and **list where that copy has already
   been published** — rewriting a source does nothing about a post written from
   it months ago. If the answer is "nowhere yet", write that down; it is the
   cheapest state this will ever be in.
6. **Answer §2.4's six product decisions** — quotas, non-payment, export when
   suspended, the signup gate, where plan state lives, and what happens to
   everybody currently on the free beta. Grandfathering is a decision; making
   it silently is not.
7. **Walk §2.1's twelve files** and §2.5's doc list.
8. **Bump `TERMS_VERSION`** — everybody re-prompted, which is the mechanism
   working (§41, §2.2). The billing prompt goes **after** the terms modal, or
   it asks for money before agreement.
9. *Then* integrate, under §6's constraints, and verify per §2.6 — on a **test**
   payment account driven end to end, because §36's lesson is that driving the
   product is a different instrument from reading it.

---

## 8. What this document does not know

Recorded so the gaps read as checked rather than missed.

| | Why |
|---|---|
| **Paddle's exact chargeback set-off and fee wording** | `paddle.com` is blocked by this session's egress proxy (§8). Secondary sources only — §3 flags it inline |
| **Payout fee and FX spread into INR** | not published; from the MSA or from their support, and it changes the net rate in §5 |
| **Whether Paddle's current onboarding accepts an Indian sole proprietorship** | sources say no Indian entity is *required*; none of them is Paddle's own KYC policy |
| **Softex / STPI applicability** | §4's CA question 3 |
| **Where `MARKETING.md`'s copy has already been published** | §2.1's own open item, and only the owner can answer it |

**And the thing no document here can establish.** §40's rule: *a mechanism that
hangs off a URL configured somewhere else has a failure mode no test in this
repository can see.* A payment provider is the largest such mechanism this
deployment would ever have — the dashboard, the webhook endpoint, the dunning
schedule and the tax settings all live in somebody else's account. Whatever
monitoring is built for it has to be checked against **the provider's own
screens**, not against the code, which is the lesson §40 paid for with weeks of
a reminder engine that had never once run.

---

## Sources

Researched 2026-10-07. Primary and professional sources first; the secondary
ones are marked, because §21's treatment is that a claim from outside gets
checked rather than accepted, and knowing which tier a number came from is part
of checking it.

**Regulatory and professional**

- RBI PA-CB circular, analysed — [Trilegal](https://trilegal.com/wp-content/uploads/2023/12/RBIs-circular-on-cross-border-payment-aggregators.pdf)
- FTC v. Paddle — [Morrison Foerster](https://www.mofo.com/resources/insights/250707-the-ftc-gives-the-merchant-of-record-model-a-paddling) · [Frankfurt Kurnit](https://advertisinglaw.fkks.com/post/102kgk1/ftc-settles-with-paddle-for-5-million-over-alleged-role-in-deceptive-tech-suppor) · [BleepingComputer](https://www.bleepingcomputer.com/news/security/paddle-settles-for-5-million-over-facilitating-tech-support-scams/)
- Stripe's own RBI e-mandate documentation — [support.stripe.com](https://support.stripe.com/questions/rbi-e-mandate-regulations-faqs?locale=en-GB) (relevant only to India-issued cards, so not to our market — recorded so nobody re-derives it)
- GST export of services, zero-rating and LUT — [PayGlocal](https://payglocal.in/blog/gst-on-export-of-services-impact) · [TaxGuru on LUT filing](https://taxguru.in/goods-and-service-tax/guide-lut-filing-zero-rated-export-supply-compliance.html)

**VAT**

- UK, non-established taxable persons and the zero threshold — [Anrok](https://www.anrok.com/vat-software-digital-services/united-kingdom) · [AVASK](https://avask.com/blog/uk-vat-threshold-2026/)
- EU non-Union OSS for third-country sellers — [AVASK](https://avask.com/blog/vat-for-digital-services/)

**Card scheme rules**

- Visa VAMP and Mastercard ECM thresholds, 2026 — [Chargeflow](https://www.chargeflow.io/blog/chargeback-thresholds)
- 3DS liability shift and what it does not cover — [DashDevs](https://dashdevs.com/blog/3ds-liability-shift-explained/)

**Secondary — vendor and comparison content, treat as directional**

- PA-CB authorisation list and Stripe's absence from it — [Winvesta](https://www.winvesta.in/blog/businesses/19-firms-got-rbis-pa-cb-license-who-won-and-why) · [Xflow](https://www.xflowpay.com/blog/international-payment-gateways) (Xflow is a PA-CB holder writing about its own market)
- Paddle pricing tiers — [Comparedge](https://comparedge.com/tools/paddle/pricing)
- Paddle chargeback handling — [Paddle help centre, via search](https://www.paddle.com/help/manage/risk-prevention/understanding-chargebacks-with-paddle) (**unverified — see §8**)
- CRM price comparison — [Axis Consulting](https://axisconsulting.io/pipedrive-pricing-plans/)
