# UK launch — the plan

> **FROZEN — the plan as it stood before the work began.** Not maintained.
> Nothing here had shipped when this was written.
> Live status: `CLAUDE.md`.

What a UK launch needs, once the product is sold to UK small businesses through
an accounting practice. Written after an outside advisory note proposed a
GDPR feature list; **most of that list belonged to the wrong party**, and
correcting that is what this document is mostly about.

**Not legal advice.** The engineering claims are checked against the code. The
DPA wording, the residency disclosures and the transfer mechanism need a
solicitor, and that is cheap next to getting them wrong.

---

## The reframe: two roles, and the advisory note mixed them up

**A tenant storing their customers in CRM Builder is the data controller.**
Lawful basis, consent, answering a DSAR, choosing a retention period — those
duties are theirs. Our job is to give them tools, not to carry the obligation.

**We, hosting it, are their processor.** The duties are narrower and mostly
contractual: act on instructions only, keep it secure, name sub-processors,
notify breaches, assist with DSARs, delete or return on exit, and handle
international transfers.

The advisory note led with **lawful-basis fields** — controller-side, and
already buildable today with the module builder — and buried **data
residency**, which is processor-side and genuinely blocking. That ordering
optimises for what shows in a demo rather than what stops a customer signing.
The roadmap below is in the other order on purpose.

---

## Two decisions, and what follows from them

### Direct referral, not reseller

The accountant introduces clients; **each tenant contracts with us directly**.
The practice does not become a controller for its clients' data and takes on no
liability for it. Rejected: the reseller model, which makes the practice the
controller for every client workspace and needs sub-processor delegation plus
master-account billing.

Three consequences:

- **The DPA must be click-accepted, not signed.** Chasing a signature per
  £12/month sole trader does not scale, so processor terms are incorporated
  into `terms.html` and accepted in-app.
- **`betaAcceptedAt` cannot be reused as-is, and this is the whole reason
  Phase 2 exists.** §19 built exactly this machinery — a stamp on the user,
  re-shown if the write failed — but it is a **bare timestamp**. It cannot
  answer *"did this tenant accept v2?"*, and terms change the moment a
  sub-processor is added. A version has to ride alongside the stamp.
- **The accountant-as-viewer already works, and it promotes per-module
  visibility.** He joins each client's org as `viewer`, which is what §36 was
  built for — no new feature. But §2's honest limit is that *everyone on a team
  sees every module*, so an accountant sitting in twenty workspaces sees every
  module in each. Not a compliance failure — the client invited him — but it is
  the objection to expect, and it is the most expensive item on the list.

### Managed UK hosting by default, self-host retained

Managed London/Frankfurt is the out-of-the-box answer for a non-technical small
business. **Self-host stays**, and is the stronger answer for a privacy-anxious
firm: in that mode we are not a processor at all, and the residency question
belongs entirely to them. `render.dedicated.yaml` and `DEPLOYMENT.md` already
carry that path.

**The trap this walks into.** §17: UptimeRobot pinging `/health` every 14
minutes consumes ~744 of Render's 750 free monthly instance-hours, and works
*"only while this is the only free service on the account."* A parallel US/EU
run during migration breaks that. Hence a single-window cutover rather than a
dual-active period — and if a second managed deployment is ever wanted, the
free tier stops being the plan and that lands in pricing.

**Verified before committing to this:** Frankfurt is selectable on Render's
free tier for web services without a paid upgrade, so Phase 0 keeps a £0
compute footprint.

---

## Roadmap

Sizes are in stages, where a stage is a unit of work with its tests and docs —
the same unit the §37–§39 phases used.

### Phase 0 — infrastructure and paperwork · *no code, and the actual blocker*

- Provision MongoDB Atlas in London (`eu-west-2`) and a Render web service in
  Frankfurt (`frankfurt`).
- **Single-window cutover** using `scripts/restore.mjs` — already drilled on
  every push (§17), so the tool is not the risk; the window is.
- Update `privacy.html`'s residency paragraph, which currently states US
  regions truthfully and would become false the moment the move lands.
- DPA drafted by a solicitor · sub-processor roster published · ICO
  registration.

**The sub-processor roster as it stands:** Google (OAuth), Render, MongoDB
Atlas, GitHub (backup artifacts), healthchecks.io, UptimeRobot, and whatever
`FEEDBACK_WEBHOOK_URL` points at. A tenant's *own* workspace webhook is their
choice and not ours to declare.

### Phase 1 — backup hardening · *1 stage, mostly `crmback`*

Encrypt the nightly artifact at rest; omit `accessRequests` from the routine
build.

**§17 already flagged this before there was a launch to block.** The artifact
holds every customer's records **and** `accessRequests` — including addresses of
people who were *declined* and never became users — and it is downloadable by
anyone with read access to the private repo. Three problems in one object: an
undeclared US sub-processor, an international transfer, and access control by
repo permission rather than by intent.

### Phase 2 — versioned terms acceptance · *~1 stage*

Processor terms into `terms.html`; `termsAcceptedAt` **and** `termsVersion` on
the user; re-prompt when the version increments. §19's rules carry over intact
— in particular that a failed write leaves the flag unset so the notice
returns, because *recorded-but-never-sent is a false record*.

### Phase 3 — UK templates and defaults · *hours*

A module template seeding lawful basis, consent date and source. This is the
advisory note's "highest priority" item and it is also the cheapest thing on
either list: `TEMPLATES` already seeds the builder, and a tenant could build it
by hand today.

GBP is already in `CURRENCIES`. Dates store `YYYY-MM-DD` and
`<input type="date">` renders in the **browser's** locale, so a UK user already
sees DD/MM/YYYY — check `fmtDate` and move on.

### Phase 4 — DSAR bundle and self-serve deletion · *2 stages*

**The DSAR export is client-only**, the same shape as §37's due filter: an
in-memory pass over rows already loaded, no endpoint, nothing the server can
refuse. The subtlety is that this data model has **no concept of a data
subject** — a person is a record in Contacts, but their name may also sit in a
Notes body, a relation, or a custom field. So it is a search across every field
of every record, not a lookup.

**Self-serve deletion** is a route over `deleteAccount()` and its existing
guards. §21 anticipated it: `wouldStrandDeployment()` lives inside that function
rather than at the call site precisely so the next route added is covered, and
records that no current path reaches it.

### Phase 5 — retention report · *1 stage*

Count and list records untouched for over 24 months; the owner presses the
button. A **report, not a purge** — see out-of-scope.

**Total: roughly 5–6 stages of code.** Small, and the reason is that tenancy
isolation, the role ladder, export, tombstones and write attribution are
already built and tested.

---

## Out of scope, with the reason

**Automated retention deletion.** The most dangerous thing proposed. §12: *"deleting
data during a migration is not a decision to make automatically."* §34 records
`--clean` matching orgs by name and removing a real customer's workspace and its
174 rows while reporting success. A report the owner acts on gets the compliance
story at a fraction of the risk.

**Per-record access logging.** The advisory note asked for "audit logs for
access/changes". Changes are already attributed — `createdBy` / `updatedBy` on
every row (§10). *Access* logging means a write per read, which is the
write-amplification problem §24 already refuses for the egress counter, and the
log would outgrow the data it describes. State what exists; decline the rest.

**Per-module visibility.** Deferred, not declined — §2 costs it as needing
per-module filtering in sync, or members receive rows they cannot see. Answer
the accountant objection with "build sensitive things in a separate workspace"
until there is demand.

**Rebuilding erasure.** A tombstone **discards the body** (§26), so a delete
already erases the contents everywhere the moment it syncs; the 180-day marker
carries `{ id, deletedAt }`, which is not personal data. Nothing to build —
but **two honest limits have to be stated rather than dropped**, because
without them this reads as "erasure is complete" and it is not:

- **A colleague's device that never comes online again** keeps its replica.
  §15's exact wording, and it is narrower than "we cannot erase it" — say that
  version, and never imply a remote wipe.
- **Backups lag.** The data is gone from the live store immediately and from
  the artifacts when they roll off. The ICO accepts backup lag where it is
  documented and the data is put beyond use — which is an argument for the
  encryption in Phase 1 and for a short retention window.

---

## Ordering, in one line

Phases 0 and 1 are the launch blockers and are almost entirely not code.
Phases 3–5 are what make it sellable into an accountant's client base. Phase 2
sits between them because the DPA has nowhere to land until it exists.
