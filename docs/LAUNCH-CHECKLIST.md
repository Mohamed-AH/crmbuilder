# Launch checklist — own domain, and pricing

> **Status: live, and kept current.** This sits in `docs/`, which `CLAUDE.md`
> §29 defines as the tier that is maintained — not `docs/archive/`, which is
> frozen. If you change something this file names, change this file.

Two launches that are not yet done, each of which touches code, configuration
we do not control, legal text and a dozen documents. They are written together
because **they overlap**: `terms.html` currently scopes itself to *"the free
beta **at this address**"*, so one sentence is wrong after either one.

The failure this exists to prevent is not a broken deployment — that announces
itself. It is the half-moved state: a page that still names the old host, a
"free beta" line under a payment form, a manual whose URL nobody updated. Each
is individually small and reads as carelessness in aggregate, which is exactly
what a prospect evaluating a one-person product is watching for.

**How to use it.** Work top to bottom within a part; the ordering inside
*Sequence* is load-bearing and the reasons are given. Tick nothing you have not
seen with your own eyes — this codebase's standing lesson is that a defect
which renders as plausible is invisible until something forces it to render
differently (`CLAUDE.md` §36, §38, §39).

---

# Part 1 — moving to our own domain

## 1.1 The four things that break silently, and they are the whole risk

Everything in §1.2 onward is a string to change and will announce itself if
missed. These four will not.

| | What happens | What to do about it |
|---|---|---|
| **Local workspaces do not move** | IndexedDB is scoped **per origin**. Every device holding a `u:<id>` replica (`CLAUDE.md` §11) sees an empty app on the new domain. Rows already synced come back on first sign-in; **anything unsynced is stranded on the old origin** | Announce a date. Ask everybody to open the app and confirm the status chip reads *Synced* **before** the switch. §31 is the precedent for how quietly a row can fail to reach the server |
| **Installed PWAs keep working on the old domain** | An installed app has its own origin, its own service worker and its own cache. It will go on serving the old deployment happily and **never learn about the move** | The old host has to keep answering, and has to *tell* them. See §1.5 |
| **Everyone is signed out** | Cookies are host-scoped — `server.js` sets no `domain`, deliberately — so no session survives the move | Expected, not a bug. Say so in the announcement, or it reads as data loss |
| **The old origin's cache is not yours to clear** | `CACHE_VERSION` only evicts caches on the origin doing the asking (§47) | The old host must serve something that redirects rather than an app shell |

**None of these is fixed by a redirect alone**, which is the trap: a 301 from
the old host makes the *website* work and does nothing for the installed app or
the local database. Say that out loud when planning the cutover.

## 1.2 Code and configuration in this repository

Every occurrence, found by `grep -rn "onrender\.com"` rather than from memory.
Re-run that grep at the end; the count is the check.

| File | What is there | Action |
|---|---|---|
| `.github/workflows/test.yml` ×2 (lines ~153, ~215) | `vars.LIVE_URL \|\| 'https://crmbuilder-v1.onrender.com'` — the built-in default | **Set the `LIVE_URL` repo variable first**, then change the fallback. Doing it in that order means CI is never pointed at a dead host. §46: `LIVE_URL` *overrides*, it does not *enable* |
| `render.yaml`, `render.dedicated.yaml` | `name:` only — **no host is pinned** | Nothing. Verified, so it is not left as an open question |
| `manifest.webmanifest` | `start_url` and `scope` are `"./"`, icons relative | Nothing. Verified — a domain move does not touch it |
| `sw.js` | no absolute URLs; `STANDALONE_PAGES` / `STANDALONE_ASSETS` are paths | Nothing |
| `docs/product-tour.html` | **was** an absolute link to the deployment; now `/` | Already done — made root-relative when this file was written, so the sales page cannot point at the old home |
| `tests/smoke.mjs` | a comment showing the `BASE_URL=…` invocation | Update the example |
| `README.md`, `DEPLOYMENT.md`, `docs/BETA.md`, `CLAUDE.md`, `.claude/skills/verify/SKILL.md` | the same `BASE_URL=…` command, plus DEPLOYMENT.md's verification URLs | Update. `docs/archive/SECURITY-AUDIT.md` is **frozen** — leave it (§29) |

## 1.3 Configuration you cannot grep, which is where §40 got caught

> **`CLAUDE.md` §40:** *a mechanism that hangs off a URL configured somewhere
> else has a failure mode no test in this repository can see.* The keep-warm
> ping sat on the wrong URL for weeks while six documents said otherwise,
> because every one of them was written by reading `server.js` and none by
> opening the monitor.

Open each of these and look. Do not infer them from this table.

| Where | Item | Note |
|---|---|---|
| Google Cloud Console | **Authorised redirect URI** → `https://<new>/auth/google/callback` | Sign-in is dead without it. Add the new one **before** the switch; both can be listed at once |
| Google Cloud Console | **OAuth consent screen**: privacy policy and terms URLs | These point at `/privacy` and `/terms` on the old host. §19: an unpublished consent screen means adding every tester by hand |
| Render | custom domain + TLS certificate | Certificate issuance is not instant; do it before, not during |
| Render | env vars — check nothing carries a host | `REMINDER_HEALTHCHECK_URL` and `FEEDBACK_WEBHOOK_URL` are third-party and unaffected |
| UptimeRobot | the keep-warm monitor — **and confirm it is on `/health`, not `/healthz`** | §40 in full. Moving the monitor is the moment to re-check which path it hits, because only `/health` runs the alert rules and the digest |
| healthchecks.io | nothing to change (it receives pings, it does not call us) | Recorded so it is not "checked" pointlessly |
| Private repo `Mohamed-AH/crmback` | the `BACKUP_URL` secret | **The nightly backup silently stops** otherwise. §17: a job with bad configuration can report success while producing nothing |
| DNS | old host must keep resolving | See §1.5 |

## 1.4 The legal text is domain-scoped, and this is easy to miss

`terms.html` line 7: *"applies to the free beta **at this address**"*.

That sentence makes the terms specific to the current host, so a move either
changes it or leaves a contract pointing somewhere the product no longer is.
Two options and they are not equivalent:

- **Preferred: drop "at this address"** and let the terms be about the service.
  A version bump is then *not* required for the move alone — but read §1.6.
- Keep it and update the address, which **is** a text change to a versioned
  document, which re-prompts every user (§41). Doing that for a hostname is a
  poor use of the one mechanism you have for getting people to read something.

`privacy.html` names Render, Atlas, Google, GitHub and Telegram and closes with
*"That is the complete list."* A domain move adds no processor — **but §40's
rule is that a page claiming completeness gets re-checked against what the
deployment is actually doing**, not against what changed. Re-read it at the
same time.

## 1.5 What the old host must do, and for how long

Not a footnote. Someone with the PWA installed has no other way to find out.

1. **Do not delete the old deployment.** Point it at a small page that says the
   service has moved, names the new address, and says to sign in there. An
   installed app will render it inside the app frame — which is the only
   channel that reaches that person.
2. **Serve it as HTML from the app's own path**, so the service worker's
   navigation handler treats it as the shell (§47's content-type rule means an
   HTML response is the one thing that legitimately replaces a cached shell —
   here that is what you want).
3. **Keep it up for at least one full sync cycle of your least active user.**
   There is no telemetry that tells you when the last device has moved; pick a
   date, say it in the notice, and accept the estimate rather than pretending
   it is measured.
4. **Keep `/privacy` and `/terms` answering** on the old host until Google's
   consent screen has been re-reviewed against the new URLs.

## 1.6 Sequence

Order matters at three points and the reasons are given; the rest is
preference.

1. Set the `LIVE_URL` repo variable → **before** editing the workflow fallback.
2. Add the new redirect URI in Google → **before** the domain switch, so
   sign-in works the moment DNS moves.
3. Provision the domain and certificate on Render.
4. Announce the date. Ask everyone to confirm *Synced* (§1.1).
5. Switch DNS. Update `BACKUP_URL` in the private repo **the same day**.
6. Move the UptimeRobot monitor, on `/health`.
7. Repoint the old host at the moved-notice page.
8. Update docs and the workflow fallback; re-run the grep.
9. Update the Google consent screen URLs; re-submit if required.
10. Verification, below.

## 1.7 Verification

```sh
BASE_URL=https://<new-domain> npm run test:smoke     # expect 50 passed
grep -rn "onrender\.com" --include="*.md" --include="*.html" --include="*.yml" . \
  | grep -v docs/archive                             # expect: nothing
```

Then, by hand, because none of it is greppable:

- Sign in with Google on the new domain — the redirect URI is the one thing
  that fails completely and silently in configuration rather than in code.
- `https://<new>/privacy` and `/terms` render (the consent-screen URLs).
- The **deployed build** line in the smoke output names the commit you pushed
  (§46) — it is what proves you are auditing the new deployment.
- Wait for one UptimeRobot interval and check the `reminders` healthcheck goes
  green. §40: the cadence in the ping log is the only thing that proves a
  scheduled monitor is hitting `/health`, and a green tick straight after a
  deploy is meaningless because CI's own smoke run produces one.
- Confirm the nightly backup ran, the morning after.

---

# Part 2 — introducing pricing

## 2.1 The claims that become false the moment you charge

Every one of these is live text, found by grep. This is the list that makes the
product read as inconsistent if it is worked partially.

| File | What it says today |
|---|---|
| `terms.html` | *"This is a free beta"* · *"offered free of charge during the beta"* · **"There is no payment, no subscription, and no contract term."** |
| `terms.html` | *"applies to the free beta at this address"* — §1.4 again |
| `guide.html` | the opening callout: *"The first one: this is a free beta."* (§47 added it precisely so the framing is not discovered later on the legal page — the same reasoning applies in reverse) |
| `privacy.html` | the processor roster, and *"That is the complete list."* |
| `docs/product-tour.html` | *"Nothing to install, nothing to sign up for"* and the comparison framing |
| `docs/manual.html`, `docs/USER-GUIDE.md` | beta framing in the intro and the limits sections |
| `docs/ONBOARDING.md`, `docs/DEMO-SCRIPT.md` | the cost objection, answered as "it's free" |
| `docs/BETA.md` | the whole tester note |
| `README.md` | the front page |

### `MARKETING.md` is the dangerous one, and no rule covers it

Found while writing this file, by following `docs/README.md`'s own *"sell it"*
row. It is prepared copy for posts and landing pages, and **it is on no walk
list at all** — `CLAUDE.md` mentioned it zero times before today. Exactly the
shape §46 found in `README.md` and §47 found for `guide.html`: a
customer-facing document that every rule happened to miss.

What is in it:

| | |
|---|---|
| *"**No per-seat pricing. No lock-in.**"* | a promise, in bold |
| *"Free. No ads. Your data stays yours"* · *"Free and open"* · *"$0/month"* (×3) | stated as the product's identity, not as a beta condition |
| *"most CRMs are … rented back to you at **$25 per seat per month**"* | the opening argument |
| *"Small businesses pay **$300+/year per seat**"* | the first line of a thread |

**Charging while that copy stands is the worst version of the inconsistency
this file exists to prevent** — a product whose own marketing attacks other
products for doing the thing it has started doing. It is worse than a stale
feature list because somebody can quote it back.

Two separate jobs, and doing only the first is how it recurs:

1. Rewrite the copy. The competitor-price attack has to go regardless of what
   we charge; the honest version of the argument was always *per-module rather
   than per-seat*, not *free rather than paid*.
2. **`MARKETING.md` is on §27's walk list now.** That is the actual fix —
   §47's words: bringing one file up to date does nothing about the next
   feature.

Also note it sells a **self-hosted** story (*"Deploy it yourself in an
afternoon"*, *"your own infra"*), which a hosted paid product does not
contradict but does complicate: decide whether self-hosting stays free and say
so, or the two halves of the pitch argue with each other.

**`guide.html` is the one to get right.** §47's rule for that page is that every
capability states its limit in the same breath, and the beta callout exists
because *"a prospect read four confident minutes and then discovered the framing
on the legal page"*. A price discovered on a billing screen is that same failure
with a bigger bill.

## 2.2 A price is a terms change, so `TERMS_VERSION` moves

`server.js:993` holds `TERMS_VERSION`; `terms.html` carries the matching
`Last updated` line. §41: **they are the same fact in two places and must move
together**, both ends carry a comment naming the other, and the comparison is
`!==` so any change re-asks everybody.

That is correct and it is also the mechanism you want here — nobody should be
charged under terms they agreed to when the product was free. Consequences to
plan for rather than discover:

- Every existing user gets the modal on their next load.
- **Declining is signing out** (§41), and it must stay that way. A price change
  is exactly the moment somebody legitimately says no.
- The modal sequence is Terms → invite → beta notice, each awaited. §41's
  reusable rule: *a prompt added ahead of the terms will sit in front of them*.
  A billing prompt goes **after**, or it asks for money before agreement.

## 2.3 Taking payment adds a processor, and `privacy.html` declares itself complete

§40 records this page being wrong twice, in the same paragraph, both times by
omission — GitHub the first time, Telegram the second — and both were found by
looking at a live artifact rather than at the code.

A payment provider receives name, email, billing address and card metadata. It
is a recipient of personal data and belongs on that roster **before the first
payment**, not after. Also:

- Card data itself should never reach this deployment. Hosted checkout keeps it
  that way, and that is a sentence worth being able to write truthfully.
- **The rule that already exists and now has teeth:** *NEVER PUT A CREDENTIAL IN
  `platform`* (§17) — it is in every nightly artifact. An API key for the
  payment provider is env-only, like `BACKUP_TOKEN`.
- A webhook from the payment provider is an **inbound** route, so it needs the
  §30 Phase 4 treatment: its own body limit, its own rate-limit bucket, and
  signature verification. It is not covered by anything `lib/safe-fetch.js`
  does — that guards *outbound* (§38).
- `terms.html` gains refunds, cancellation, and what happens to data when
  somebody stops paying.

## 2.4 The product decisions pricing forces, which are not text

These are the ones that will take real work. Each is a decision the codebase
has deliberately deferred, with the reasoning already written down — read it
before re-deciding.

| Decision | Where the existing reasoning is |
|---|---|
| **Do quotas start being enforced?** Today *"nothing is enforced — a cap firing mid-beta looks like the bug the tester was chasing"* | §17. Enforcement means a customer hits a wall; that wall has to explain itself and say what to do, or it is §36's "broken product" feeling |
| **What does non-payment do?** Org suspension already exists — read-only sync, reversible, destroys nothing | §24 stage B. It is *"one word from deletion and a decade of data apart"* (§15). Non-payment must never reach `deleteAccount()` |
| **Can they still get their data out when suspended?** | §36: export stays for every role, deliberately — *"reading the workspace and taking a copy of it is the job"*. A customer who stops paying and cannot export is the worst version of this product |
| **Does the signup gate change?** `SIGNUP_MODE` / beta codes / access requests | §16, §20. A paid signup is a fourth path through `canCreateAccount()`, and §16's bypass **order** is a security property |
| **Where does plan state live?** | On the **org**, beside `suspendedAt` — not on the user. The workspace belongs to the org (§5), so the thing being paid for is the org |
| **What about the free tier that exists today?** | Everyone currently using it agreed to terms saying there is no payment. Grandfathering is a decision; making it silently is not |

## 2.5 Docs to walk (§27's list, in full)

A change to *what a user can do* — and paying is one — walks all of these.
`manual.html` and `product-tour.html` are named as the easiest to forget
because they are HTML and nothing greps them by habit.

`README.md` · `guide.html` · `docs/USER-GUIDE.md` · `docs/manual.html` ·
`docs/product-tour.html` · `docs/ONBOARDING.md` · `docs/DEMO-SCRIPT.md` ·
`docs/BETA.md` tester note — plus **`docs/API.md`** for any new route, whose
count is checked with
`grep -cE "^app\.(get|post|put|patch|delete)\(" server.js` rather than
incremented by hand.

## 2.6 Verification

- Drive a real signup end to end on a **test** payment account, not a mocked
  one. §36's lesson: driving the product as each kind of user is a different
  instrument from reading the code, and it is the one that found the hole.
- Sign in as a suspended org and confirm the screen says what is wrong, what it
  did not do, and how to fix it.
- Export as a suspended org.
- Confirm no page still says "free beta" —
  `grep -rniE "free beta|no payment|no subscription" *.html docs/` returns
  nothing but deliberate history.
- Confirm the terms modal appears once, records, and that **Sign out** beside
  *I agree* still works (§41's race — the button that exists so declining is
  possible once did nothing at all).

---

## What this document does not do

- It does not decide anything. Every row in §2.4 is a question with the prior
  reasoning attached, not an answer.
- It does not cover company formation, VAT registration, or the ICO
  registration and solicitor-drafted DPA already outstanding from the UK
  launch. Those are real and they are not this repository's business.
- It is **not served**. Only `docs/manual.html` and `docs/product-tour.html`
  are public (§28); this file 404s in production by construction, which is
  what lets it be blunt about what is not finished.
