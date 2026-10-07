# Launch checklist — own domain, and pricing

> **Status: live, and kept current.** This sits in `docs/`, which `CLAUDE.md`
> §29 defines as the tier that is maintained — not `docs/archive/`, which is
> frozen. If you change something this file names, change this file.
>
> **The domain is decided: `nimbleclerk.com`.** No price is set, no date is
> fixed, and this document does not argue for either. It is the reference to
> open **when** those decisions are made — a list of what would have to change,
> so that nothing is remembered late. Where a choice is unavoidable it is
> written as a question with the prior reasoning attached (§2.4), never as an
> answer.
>
> **A chosen name is not a move.** Part 1 is in progress rather than
> outstanding; §1.1's four silent failures are unaffected by knowing the name.
>
> **Part 1's two gating decisions are now taken** (§1.0, §1.0b), so the steps
> below are written for them rather than offering both ways:
>
> | Decision | Taken | Where |
> |---|---|---|
> | canonical host | **apex `nimbleclerk.com`**; `www` 301s to it | §1.0 |
> | the landing page | **swap at the switch** — `/` serves `welcome.html`, the app moves to `/app` | §1.0b |
>
> **Where it actually stands**, established rather than recalled: the domain is
> registered at Namecheap and **parked** — the apex answers Namecheap
> infrastructure and `www` resolves to `parkingpage.namecheap.com`. So nothing
> is pointed at Render yet, and §1.6 steps 0–3 are the live frontier. Nothing
> in this repository names the new host yet, by design — see §1.6's note on why
> that is a sequencing requirement rather than an omission.
>
> **The DNS pre-flight is done and clears the way (§1.0c).** No CAA record, so
> nothing refuses Let's Encrypt; nameservers are Namecheap's own, so the
> records are editable where you expect and an apex `ALIAS` is available — the
> one fact that could have forced §1.0 to be re-decided. It also found **live
> mail forwarding on the domain**, which the DNS step must not take out, and
> **one unimplemented decision**: nothing anywhere 301s `www` to the apex.

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

# Part 1 — moving to `nimbleclerk.com`

## 1.0 The two things the name itself decides

Small, and both are the kind of thing that is annoying to change afterwards.

**Apex or `www`, and pick one.** Whichever is not canonical must 301 to the one
that is. Two hosts answering the same app is two origins, and §1.1's first row
is what that costs: IndexedDB, the service worker cache and the session cookie
are all per-origin, so a user who reaches `www.nimbleclerk.com` on Monday and
`nimbleclerk.com` on Tuesday is a user with two empty workspaces and no
explanation. `server.js` sets no cookie `domain`, deliberately, so nothing in
the code papers over it.

**The OAuth consent screen may need the domain verified**, not just the URLs
updated — Google asks for proof of ownership of the domain a published consent
screen names. That is a Search Console step outside this repository, it can
take a day, and §19 is the reminder of what an unpublished consent screen
costs: every tester added by hand. Start it early; it does not block anything
else.

## 1.0b The landing page is waiting to become `/`, and this is the moment

`welcome.html` is served at `/welcome` and is written to be the front door.
It is not `/` yet **on purpose**: making it so today means changing
`manifest.webmanifest`'s `start_url` and `scope`, moving the app to `/app`,
rewriting the E2E navigations and the smoke test, and — the part that cannot be
undone — leaving every installed PWA launching into a page that is no longer
the app until its owner reinstalls.

**The navigation count was wrong: it is 57, not 104.** Measured —
`grep -c "goto('/')" tests/e2e.spec.js` is 57 against 132 `goto(` calls in
total, so the original figure was most likely the latter misread. Recorded
because this is a maintained document (§29) and because the number is what the
sizing rests on: the swap is about half the mechanical work it was costed at.

**§1.1 is why the move is the cheap moment to do it.** All four of those silent
failures happen anyway when the origin changes: the installed apps are stranded
regardless, the caches are on an origin you no longer serve, and everyone is
signed out. Restructuring paths while that is already true costs nothing extra.
Doing it on the old origin costs all of it twice.

So, at the switch:

1. `/` serves `welcome.html`; the app moves to `/app`.
2. `manifest.webmanifest` — `start_url` and `scope` become `/app`. Both are
   relative today (`"./"`), which is why §1.2 records the manifest as needing
   nothing for the *domain* alone; this is a separate change to the same file.
3. `sw.js` — the app shell is precached as `/app`, and `/` joins
   `STANDALONE_PAGES` while `/welcome` stays as an alias so anything already
   sent out keeps working.
4. `tests/e2e.spec.js` and `tests/smoke.mjs` — every `goto('/')`.
5. The moved-notice page (§1.5) points at `/`, which is now the landing page
   rather than a cold app shell. That is a better arrival for somebody whose
   installed app has just told them the service moved.

**Decide before you announce**, because the announcement names the URL people
will type.

### The swap silently breaks invite and beta links, and nothing would say so

Not in the file list above, and the worst kind of miss: it is the §36 shape —
a defect that renders as *nothing happening*.

`server.js` builds both link types from `APP_URL` **at the root**:

```js
url: `${APP_URL}/?invite=${invite.code}`      // POST /api/org/invites
url: `${APP_URL}/?beta=${entry.code}`         // the beta-code mint
```

and the codes are captured by `captureInvite()` / `captureBetaCode()` in
`js/app.js`, which read `location.search` and store the code before stripping it
from the address bar (§13, §16). **`welcome.html` loads no app JS** (§58) — only
`js/boot-theme.js`. So the moment `/` is the splash, an invite link lands on a
page that cannot see the code: nothing is stored, nothing is stripped, and the
colleague who clicked it gets a landing page and no team. The owner has no way
to tell, because sending the link is the last thing they do.

Two halves, and the second is what makes it safe for links already sent:

1. **Generate them at `/app`** — `${APP_URL}/app?invite=…`, same for `?beta=`.
2. **`/` forwards those two parameters to `/app`**, preserving the query, so
   every link already in somebody's inbox keeps working. Do it as a **302 in
   `server.js`**, not in the page: `welcome.html` has no JS to do it with, and
   giving it some would undo the reason it is a standalone page at all (§58).

The same reasoning as `/welcome` surviving as an alias — anything already sent
out keeps working — applied to the thing people were sent rather than the page.

Covered by a test that asserts the *stored* code rather than the redirect, per
§54's lesson that asserting the symptom passes on the bug.

### This commit cannot be pushed early, and that is a hard constraint

`render.yaml` carries `autoDeploy: true`, and §46 records the live smoke
watching production catch up to a commit pushed to the working branch — so
**production deploys from the branch, within minutes of a push.** The swap is
therefore not a change that can sit in the repository waiting for the switch:
pushing it *is* deploying it, to the host people are still using.

What that would do to the **old** origin, which is the thing to be clear about:

- an installed PWA has `start_url: "./"` cached from install, resolving to `/` —
  which would now be the splash. One tap to `/app` and they are back, so it is
  degraded rather than dead;
- **but `/` would be in `STANDALONE_PAGES`, which is network-only** (§19, §47).
  So an installed app launching offline gets nothing at all, on the one origin
  whose users have not been told anything yet.

So it is the **last** commit, pushed when DNS has moved — not step 8's doc
tranche but its own, after it. A flag defaulting off was considered (§16's
precedent: a lever beats a redeploy at a moment that matters) and **rejected**:
`manifest.webmanifest` and `sw.js` are static files, so an env-driven swap means
templating both, which is a new class of bug introduced to manage a single
discrete event. The event is the right unit here.

## 1.0c What the domain's DNS says today, measured — and the record that must survive

Run before step 1, because two of the three classic failures in steps 1–2 are
answerable in advance and both would otherwise bite halfway through: a **CAA
record** that refuses Let's Encrypt, so Render's certificate never issues; and
**nameservers that are not where you think**, so the records you edit are not
the records being served.

**`dig`, `nslookup` and `host` are none of them installed in this container** —
the first attempt at this returned "(dig unavailable)" six times and
established nothing. Node's resolver is always present:

```sh
node -e "const d=require('dns').promises;(async()=>{for(const t of ['NS','CAA','TXT','MX','A'])
  try{console.log(t,JSON.stringify(await d.resolve('nimbleclerk.com',t)))}catch(e){console.log(t,'ERR',e.code)}
  console.log('CNAME www',JSON.stringify(await d.resolve('www.nimbleclerk.com','CNAME')))})()"
```

| | Answer, 2026-10-07 | What it means |
|---|---|---|
| **NS** | `dns1` / `dns2.registrar-servers.com` | Namecheap BasicDNS. The records are editable in the Namecheap dashboard, and BasicDNS does `ALIAS` — so **§1.0's apex decision stands and step 2 has no blocker.** That was the one fact that would have forced reconsidering it |
| **CAA** | `ENODATA` — none, on apex and `www` both | Nothing refuses Let's Encrypt, so step 1's certificate has no obstacle. Worth knowing the failure mode anyway: adding a CAA later that omits Let's Encrypt stops the **renewal**, months after anyone connects the two |
| **AAAA** | none, on either host | Render's add-domain screen warns about AAAA and CAA specifically. Neither applies here — checked rather than assumed, because the warning reads as something to act on |
| **A** (apex) | `192.64.119.158` | Namecheap parking. One of the two records that change |
| **CNAME** `www` | `parkingpage.namecheap.com` | The other. Parking, and it has to go |
| **MX** | `eforward1`–`eforward5.registrar-servers.com` | **Email forwarding is live on this domain.** See below — and note that these are *generated by a mail setting*, not host records you can see in the records table (§1.6 step 2.2) |
| **TXT** | a Namecheap `v=spf1` forwarding record, **and** a `google-site-verification=` token | Both load-bearing. The SPF one is generated with the `MX` records; only the verification token is a host record. See below |

**The MX and TXT records must survive step 2, and nothing in the product would
tell you if they did not.** Pointing a domain at a host is two records — the
apex `A`/`ALIAS` and the `www` `CNAME` — and the tempting move is to clear out
"the old parking records" as a set. The MX quintet and the SPF `TXT` are in
that set and are not parking: they are mail forwarding for the domain, so
taking them out stops mail at `nimbleclerk.com` arriving anywhere. There is no
check in this repository that can see it, and the first symptom is a reply that
never came.

**Leave the `google-site-verification` token alone too**, whatever else
happens. It may already be step 0's proof of ownership — I cannot tell from
outside whose token it is, so confirm it in Search Console rather than assuming
either way — and deleting a verification token un-verifies the domain, which is
exactly the step §1.0 says can take a day and blocks the consent screen.

So step 2 is **two records changed and nothing deleted but the apex parking
itself** — see §1.6 step 2.2, where opening the panel corrected two details of
this: the apex parking is a `URL Redirect Record` rather than the `A` record
the resolver implies, and the `MX`/SPF pair are not host records at all.

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
| `.github/workflows/test.yml` ×2 (lines 168, 230) | `vars.LIVE_URL \|\| 'https://crmbuilder-v1.onrender.com'` — the built-in default | Set the `LIVE_URL` repo variable **at the switch, not before** (corrected — see below), then change the fallback once it is proven. §46: `LIVE_URL` *overrides*, it does not *enable* |

> **§1.6 step 1 was wrong, and it would have turned CI red for days.** It read
> *"set the `LIVE_URL` repo variable first → before editing the workflow
> fallback"*, which is correct as far as it goes — the variable is the
> reversible half, so it should move before the commit does. But it is listed
> **before step 5 (switch DNS)**, and pointing it at a parked domain is the
> problem it was trying to avoid, arrived at from the other side.
>
> Read out of the workflow rather than guessed. The live job curls
> `$BASE_URL/healthz` and branches on what comes back, so a parked host lands in
> one of two states and **both are bad**:
>
> | The parking page | `state` | Result |
> |---|---|---|
> | answers 200 with HTML (no `commit` field) | `unknown` — *"does not report a commit — smoke testing it as-is"* | the smoke **runs** against a parking page and fails every asset check: red on every push |
> | does not answer at all | `stale` | push runs **skip and pass** — §17's no-op reporting success — and the daily run fails |
>
> Which one it is could not be established from here: the egress proxy refuses
> the new host too (§8), so this is stated as "either way" rather than resolved.
> It does not need resolving — neither outcome is one to run for days.
>
> So: **the variable moves on cutover day**, in the same window as DNS. Until
> then CI keeps auditing the host that is actually serving, which is the whole
> point of the live job.
| `render.yaml`, `render.dedicated.yaml` | `name:` only — **no host is pinned** | Nothing. Verified, so it is not left as an open question |
| `manifest.webmanifest` | `start_url` and `scope` are `"./"`, icons relative | Nothing. Verified — a domain move does not touch it |
| `sw.js` | no absolute URLs; `STANDALONE_PAGES` / `STANDALONE_ASSETS` are paths | Nothing |
| `docs/product-tour.html` | **was** an absolute link to the deployment; now `/` | Already done — made root-relative when this file was written, so the sales page cannot point at the old home |
| `welcome.html` | `og:image` is **root-relative** (`/icons/icon-512.png`), and `og:title` / `og:description` name no host | Make `og:image` absolute. The spec wants an absolute URL and some scrapers will not resolve a relative one, so link previews are the thing that silently looks broken. It is relative today only because hardcoding the old host is what this section exists to prevent |
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
| Google Cloud Console | **Authorised redirect URI** → `https://nimbleclerk.com/auth/google/callback` | Sign-in is dead without it. Add the new one **before** the switch; both can be listed at once. Add the `www` form too if `www` is the canonical host (§1.0) |
| Google Cloud Console | **OAuth consent screen**: privacy policy and terms URLs | These point at `/privacy` and `/terms` on the old host. §19: an unpublished consent screen means adding every tester by hand |
| Render | custom domain `nimbleclerk.com` (+ `www`) and TLS certificate | Certificate issuance is not instant; do it before, not during |
| Render | **`APP_URL` — and it is the one that breaks sign-in** | See below. This row used to read *"env vars — check nothing carries a host"*, which understated the single most breaking variable on the list |
| Render | the other env vars | `REMINDER_HEALTHCHECK_URL` and `FEEDBACK_WEBHOOK_URL` are third-party and unaffected. Checked, so it is not left as an open question |

> **`APP_URL` is not a display string.** It is read once at boot
> (`server.js:28`) and drives, in rough order of how badly each fails:
>
> | What it builds | What a stale value does |
> |---|---|
> | the OAuth **`redirect_uri`**, in both the auth request and the token exchange | sign-in sends people to the **old host** after they authenticate. The single thing that fails completely |
> | invite links (`/?invite=`) and beta-code links (`/?beta=`) | an owner copies a link naming a host that is being wound down |
> | the approval message — *"open \<APP_URL\> and sign in"* | the same, to somebody who has never used the product |
> | the daily digest's tail link (§39) | every digest points at the old host |
> | `POST /api/admin/alerts/test`'s message | cosmetic |
>
> **The ordering is forced, and it is the one place in Part 1 where getting it
> wrong takes sign-in down rather than degrading something.** The `redirect_uri`
> Google receives must exactly match one registered in the console:
>
> - `APP_URL` updated **before** the new redirect URI is registered →
>   `redirect_uri_mismatch`, nobody can sign in.
> - DNS moved but `APP_URL` **not** updated → people land back on the old host
>   after authenticating, which looks like the move failed.
>
> So: **register the new redirect URI first (§1.6 step 3, both hosts listed at
> once), and move `APP_URL` in the same window as DNS.** Both-listed is what
> makes it non-breaking in either direction while the change propagates.
>
> `server.js:3374` already carries the related rule and it is worth not
> undoing: the invite URL is built from `APP_URL` **and not from a request
> header**, because a `Host` header is attacker-controlled (§61 R1 is the same
> lesson one layer down). Reaching for `req.headers.host` to make this
> self-configuring is the obvious bad fix.
| UptimeRobot | the keep-warm monitor — **and confirm it is on `/health`, not `/healthz`** | §40 in full. Moving the monitor is the moment to re-check which path it hits, because only `/health` runs the alert rules and the digest |
| healthchecks.io | nothing to change (it receives pings, it does not call us) | Recorded so it is not "checked" pointlessly |
| Private repo `Mohamed-AH/crmback` | the `BACKUP_URL` secret | **The nightly backup silently stops** otherwise. §17: a job with bad configuration can report success while producing nothing |
| DNS | old host must keep resolving | See §1.5 |

## 1.4 The legal text is domain-scoped — **done**, and it was two files

~~`terms.html` line 7~~ — **line 25, and `privacy.html` line 21 carries the
identical sentence.** This section named one file and there were two, which is
§27's drift inside the document written to prevent it: the clause was found by
grepping for it rather than by going to the line this said it was on.

That sentence made the terms specific to the current host, so the move to
`nimbleclerk.com` would either change it or leave a contract pointing somewhere
the product no longer is. Two options, not equivalent:

- **Preferred, and taken: drop "at this address"** and let the terms be about
  the service, which is true on either host.
- Keep it and update the address, which **is** a text change to a versioned
  document and re-prompts every user (§41). Doing that for a hostname is a poor
  use of the one mechanism you have for getting people to read something.

**No version bump, and the reason is mechanical rather than a judgement call.**
§41 ties `TERMS_VERSION` to this line's **date**, and the two are in step —
`server.js` holds `2026-09-09` against *"Last updated 9 September 2026"*.
Only the clause after the `·` moved, so the date and the constant still agree
and nobody is re-prompted. Removing a scope phrase changes no obligation.

**Safe to ship before the switch**, which is why it is not in step 6: the new
sentence is true on the old host too, so it carries no sequencing risk and is
one fewer thing competing for attention on cutover day.

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

Rewritten against the two decisions in the banner, and with the ordering
corrections above folded in. **Nothing in this repository may name
`nimbleclerk.com` until step 6**, and that is a requirement rather than
tidiness: `autoDeploy: true` means a push deploys to the host people are still
using, so a repo that points at the new domain early points the *live* service
at a parked one.

The split is worth stating once, because it is what makes this a two-person
job: **steps 0–5 and 7–9 are in services outside this repository** and only you
can do them. Steps 6 and 10 are commits.

### Before the switch — nothing user-visible changes

0. Start Google's **domain verification** for `nimbleclerk.com` (§1.0). The
   only step that waits on somebody else; it blocks nothing, so it goes first
   whatever else slips.
0b. **The DNS pre-flight (§1.0c).** Two minutes, and it is what says step 1 has
   no obstacle. Already run: no CAA, nameservers at Namecheap, apex ALIAS
   available.

1. **Render → the deployment's custom domains.** Both hosts, and read the
   targets off that screen rather than from here.

   1. Add **`nimbleclerk.com`** and **`www.nimbleclerk.com`** as two separate
      entries on the *same* service — the one `render.yaml` names. Both, even
      though only the apex is canonical: `www` has to resolve and present a
      valid certificate *in order to* 301, and a redirect from a host with no
      certificate is a browser warning rather than a redirect.
   2. Render shows a **DNS target per entry**, and they are not the same shape.
      The `www` entry gets a hostname to `CNAME` at. The apex entry gets either
      an IP address to `A`, or an instruction to point an `ALIAS`/`ANAME` at
      the service hostname. **Copy both out of that screen**; this document
      deliberately does not state Render's apex IP, because it changes and a
      stale one here is a day of looking in the wrong place.

      > **Do not resolve the service hostname and use what comes back.** That
      > is the obvious clever move and it is wrong: `crmbuilder-v1.onrender.com`
      > answers per-service load-balancer addresses which Render reshuffles,
      > while the apex `A` target on the screen is a stable one. Measured on
      > the day: they differed by the last octet, which is exactly close
      > enough to look like a transcription slip rather than two different
      > things.
      >
      > And **`@` cannot take a literal `CNAME`**, however the screen phrases
      > it — the spec forbids one at a zone apex, which is what Render's
      > ANAME/ALIAS/A footnote is about. Namecheap does `ALIAS` (§1.0c), so
      > the good option is available and the `A` fallback pins an IP.
   3. **Expect both to show as unverified, and expect no certificate yet.**
      Render proves ownership by resolving the name to itself, so nothing can
      issue until step 2 has moved the records. A pending state here is the
      normal state, not a fault — which is worth knowing before step 2 rather
      than after, because the obvious reading is that step 1 failed.
   4. Leave this screen open. Step 2 is entered from it.

2. **Namecheap → the domain's host records.** **Two records changed, two
   deleted, and nothing else touched** — §1.0c is the measured list of what is
   there and why most of it must stay.

   1. Make sure you are editing the records for the nameservers that are
      actually serving the domain. §1.0c confirmed the `registrar-servers.com`
      pair, so that is Namecheap's own DNS and this is the right place.
   2. **The panel holds three records, and neither of the two that go is what
      the resolver suggested.** Corrected by opening it rather than by
      inferring from §1.0c's lookups:

      | Type | Host | Value | |
      |---|---|---|---|
      | `CNAME` | `www` | `parkingpage.namecheap.com.` | **edit the value**, step 3 |
      | `TXT` | `@` | `google-site-verification=…` | **leave** |
      | **`URL Redirect`** | `@` | `http://www.nimbleclerk.com` | **delete** |

      The apex `A` answer of `192.64.119.158` has no record behind it: it is
      **generated by the URL Redirect Record**, so the thing to delete is a
      redirect and not an address. That redirect also runs apex → `www`, which
      is the opposite of §1.0's decision — it is not something to repurpose.

      **And the `MX` quintet and the SPF `TXT` are not in this table at all.**
      They are generated by the panel's separate **mail setting**, which is on
      *Email Forwarding*. So the rule §1.0c states is stricter and simpler in
      practice: **do not touch the mail setting.** There is nothing to preserve
      among the host records except the verification `TXT`.

   3. **Edit the `www` `CNAME` in place** to the hostname Render gave —
      value and TTL only, not delete-and-re-add, which leaves a window with no
      `www` at all.
   4. **Delete the `URL Redirect Record` on `@`.** That is the entire apex
      parking.
   5. **Add** the apex record from step 1.2 — an `ALIAS` to Render's service
      hostname if the type is offered (preferred: it survives Render changing
      its IP), otherwise the `A` record to the address Render gave.
   6. TTL 5 minutes on both while cutting over, so a mistake is minutes to
      undo rather than hours. **Leave DNSSEC off** until the move has settled;
      enabling it mid-cutover breaks resolution for everybody at once, and it
      is a separate decision rather than part of this one.
   7. Save, then scroll and confirm the `eforward1`–`5` `MX` rows are still
      listed. §1.0c: nothing in the product can see mail forwarding break.

   8. **Check the result against the zone's own nameservers, not a public
      resolver**, and this is the step that cost time here. Resolve the `NS`
      names to addresses and query those; a true authoritative answer carries
      the record's configured TTL, a cached one carries whatever is left of it:

      ```sh
      node -e "const d=require('dns').promises;(async()=>{for(const h of
        ['dns1.registrar-servers.com','dns2.registrar-servers.com']){
        const [ip]=await d.resolve4(h);const {Resolver}=require('dns').promises;
        const r=new Resolver();r.setServers([ip]);
        console.log(h,JSON.stringify(await r.resolve4('nimbleclerk.com',{ttl:true})))}})()"
      ```

      > **A resolver I had labelled authoritative was not, and it lied in both
      > directions within three minutes.** One run had the public resolvers on
      > the old parking address and the "authoritative" one on Render; the next
      > had them exactly reversed. Neither was propagation — both were caches,
      > and the TTL was the tell: `300` is the record as configured, `1054` is
      > a 30-minute parking record partway through expiring. Reading the second
      > as the zone's answer produced a confident, wrong conclusion that the
      > apex had not moved, and sent the operator back to the panel to fix
      > something that was already right. §9's rule with the measurement itself
      > as the defect: *measure rather than assert* only helps if you know what
      > the instrument is reporting.

      > **Decline the obvious shortcut, which only becomes visible here.** A
      > `URL Redirect Record` on `www` → `https://nimbleclerk.com` looks like
      > the `www` 301 solved with no code and no Render feature. It is not:
      > that service has no certificate for `www.nimbleclerk.com`, so anybody
      > typing `https://www.…` gets a browser warning instead of a redirect —
      > which is step 1.1's reason for adding `www` to Render in the first
      > place, arrived at from the other end.

      > **An `ALIAS` and a leftover `URL Redirect Record` can both sit on `@`,
      > and the `ALIAS` wins.** Observed: Namecheap's panel refused to delete
      > the redirect — *"Failed to retrieve the record!"* — while the zone it
      > was serving had already moved to Render on both nameservers. The panel
      > error is not the zone, so **check the zone before acting on the error**.
      > Clear the stray record anyway when it will let you (the row checkbox
      > and the bulk action, rather than the per-row bin that failed); two
      > entries claiming the apex is an ambiguity on their side rather than a
      > state to rely on. Do not reach for the *DNS Templates* control to force
      > it — that rewrites the whole zone, including the records §1.0c says
      > must survive.
   7. Then **go back to step 1's screen and wait for the certificate.** Minutes
      to an hour. Verify with
      `node -e "require('dns').promises.resolve('nimbleclerk.com','A').then(console.log)"`
      first — a certificate cannot issue before that answers Render.

      > **Verified and no certificate is a third state, and it announces
      > itself as a server fault.** Between the two, the browser says
      > `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` — *"nimbleclerk.com uses an
      > unsupported protocol"* — which reads as a misconfigured server and is
      > nothing of the kind: the request reached Render, and Render had no
      > certificate for that SNI name to answer the handshake with. It is in
      > fact the good outcome, because a DNS fault fails earlier and
      > differently.
      >
      > Tell the two apart with **plain `http://`**: if Render answers that at
      > all, routing is right and only issuance is outstanding. And retry the
      > `https` URL in a **fresh tab** — browsers cache a failed handshake, so
      > reloading the error page can keep showing it after the certificate
      > lands.
      >
      > Step 3 (the Google redirect URIs) does not depend on the certificate,
      > so it is the useful thing to do while it issues.

   **What is true between here and step 6b, so it does not read as a failure:**
   `nimbleclerk.com` now serves the app, `/` is still the app rather than the
   landing page, and **signing in from the new host lands you back on the old
   one** — because the `redirect_uri` is built from `APP_URL`, which has not
   moved yet (§1.3). Expected, and exactly what steps 3 and 6b close. Do not
   announce the address until step 5.

   > **The `www` 301 has no implementer, and §1.0 decided it without assigning
   > one.** Both entries point at the same service, so after this step Render
   > serves the app on **both** hosts and nothing redirects — which is §1.1's
   > first row exactly: two origins, two IndexedDB stores, two session cookies,
   > and a user who reaches each on different days has two empty workspaces.
   >
   > Two places it can live, and **check Render first**, because a redirect at
   > the edge never reaches the app and so cannot be broken by a deploy: if the
   > custom-domain screen offers a redirect-to-another-domain option for the
   > `www` entry, use it and nothing in this repository changes. I cannot
   > confirm from here whether it does (§8), which is why this is "check"
   > rather than "do".
   >
   > Otherwise it is four lines in `server.js`, and it belongs in **step 6's
   > commit** rather than here — `app.use` early, `301` to
   > `` `https://nimbleclerk.com${req.originalUrl}` `` when
   > `req.headers.host` starts `www.`. **Reading `req.headers.host` is safe for
   > this and only this**: the destination is a hardcoded constant and the
   > header only decides *whether* to redirect, so a forged one can at worst
   > send its own sender to the real host. That is not a contradiction of
   > §1.3's rule against `req.headers.host` — there the header would have
   > *become* the URL handed to somebody else.
3. **Google Cloud Console**: add
   `https://nimbleclerk.com/auth/google/callback` to the authorised redirect
   URIs, and the `www` form too. **Add, do not replace** — both hosts listed at
   once is what makes the switch non-breaking in either direction.
4. Confirm the legal pages still answer on the **old** host (§1.5 item 4) —
   Google's consent screen is still pointing at them.
5. **Announce the date.** Ask everyone to open the app and confirm the status
   chip reads *Synced* (§1.1 row 1 — unsynced rows are stranded on the old
   origin, and §31 is how quietly that happens). Say that everyone will be
   signed out, or it reads as data loss.

### The switch

6. **The cutover commit**, pushed when DNS has propagated — see §1.0b on why it
   cannot go earlier. Contents:
   - the `/` → `/app` swap: server route, `manifest.webmanifest`, `sw.js`,
     57 E2E navigations, the smoke test;
   - **the invite/beta link fix and the `/` forward** (§1.0b) — without it
     every invite link is silently dead;
   - **the `www` → apex 301**, unless Render is doing it at the edge (step 2's
     note) — without it §1.0's canonical-host decision is unimplemented and
     §1.1's two-origin failure is live;
   - `og:image` absolute in `welcome.html`;
   - the workflow fallback, and the live URLs in `CLAUDE.md` /
     `DEPLOYMENT.md` / `docs/BETA.md` / the smoke example.
6b. **Set `APP_URL` on Render to `https://nimbleclerk.com`** — same window, and
    only after step 3 registered the new redirect URI. §1.3: this is the one
    that takes sign-in down rather than degrading something.
7. Set the `LIVE_URL` repo variable to `https://nimbleclerk.com` — **this
   window, not before** (§1.2's correction). It is the reversible half: delete
   the variable and CI falls back to the committed value.
8. **Update `BACKUP_URL` in `Mohamed-AH/crmback` the same day.** §17: a job
   with bad configuration reports success while producing nothing, so this one
   fails silently and you find out when you need the backup.
9. **Move the UptimeRobot monitor** — and confirm it is on `/health`, not
   `/healthz`. §40 in full: only `/health` runs the alert rules and the digest,
   and a monitor on `/healthz` is green, warm and silent.
10. Repoint the old host at the moved-notice page (§1.5), and update the Google
    consent-screen privacy/terms URLs.

### After

11. Verification, below. The parts that matter are the ones no grep can reach.

## 1.7 Verification

```sh
BASE_URL=https://nimbleclerk.com npm run test:smoke   # expect 52 passed

# The old host by NAME. Expect exactly two survivors, both deliberate:
#   CLAUDE.md §58's record of what product-tour.html used to carry
#   this file's own §1.2 row, which quotes the fallback it tells you to change
grep -rn "crmbuilder-v1\.onrender\.com" \
  --include="*.md" --include="*.html" --include="*.yml" --include="*.mjs" . \
  | grep -v docs/archive
```

**Two corrections to what that used to say**, both found by running it:

- **`expect 51 passed` was stale.** §61 put the live count at **52** —
  `js/boot-theme.js` (§60) added one asset check. §46's two-number rule: 47
  local, 52 live, and the five-check gap is fixed.
- **`grep "onrender\.com"` → `expect: nothing` cannot ever pass**, so it was a
  check that would have been read as a failure and waved through. Two reasons,
  and neither is something to fix:
  - **four files carry `your-app.onrender.com` as a generic placeholder** —
    `README.md`, `tests/smoke.mjs`, `docs/BETA.md` and
    `.claude/skills/verify/SKILL.md`, all in a *"audit any deployment"*
    command where substitute-your-own-host is the correct thing to write.
    `DEPLOYMENT.md` uses `<your-app>.onrender.com` throughout for the same
    reason, and it is **Render** deployment instructions, so Render examples
    belong there whatever this deployment runs on.
  - **`CLAUDE.md` is a record**, and §29 freezes records rather than editing
    them. Its live-URL lines move; its history does not.

  Hence the narrower grep above, which names the host rather than the platform.

Then, by hand, because none of it is greppable:

- Sign in with Google on `nimbleclerk.com` — the redirect URI is the one thing
  that fails completely and silently in configuration rather than in code.
- **Mint an invite and open the link in a fresh profile**, and confirm the
  joiner actually lands in the team. §1.0b: the swap breaks this in a way that
  renders as a landing page and nothing else, and it is the one check here that
  a stale `APP_URL` *and* a missing `/` forward both fail.
- **Mint a beta code and open its link**, same reason, different capture path.
- The non-canonical host redirects to the canonical one (§1.0), including on a
  deep link such as `/guide`:
  `curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://www.nimbleclerk.com/guide`
  — expect `301 https://nimbleclerk.com/guide`. A `200` means the redirect has
  no implementer and §1.1's two-origin failure is live (step 2's note).
- **Send one mail to an address at `nimbleclerk.com` and confirm it arrives.**
  §1.0c: forwarding is live on this domain and the DNS edit is the one chance
  to break it. Nothing in the product can see this, and the first symptom is a
  reply that never came. `node -e "require('dns').promises.resolve('nimbleclerk.com','MX').then(console.log)"`
  checks the records survived; only a real message checks the forwarding does.
- `https://nimbleclerk.com/privacy` and `/terms` render (the consent-screen
  URLs).
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
| `welcome.html` | the amber **beta box** in the splash, and the `FREE BETA` kicker above the headline. A review proposed swapping the box for a positive trust badge at the *domain* move — **do not**: the domain move is not the end of the beta, `terms.html` still says data loss is possible, and §47's rule exists because *"a prospect read four confident minutes and then discovered the framing on the legal page"*. The trust badge is the right thing to put there when the **beta actually ends**, which is a terms change with its own re-prompt (§2.2) |
| `guide.html` | the opening callout: *"The first one: this is a free beta."* (§47 added it precisely so the framing is not discovered later on the legal page — the same reasoning applies in reverse) |
| `privacy.html` | the processor roster, and *"That is the complete list."* |
| `docs/product-tour.html` | *"Nothing to install, nothing to sign up for"* and the comparison framing |
| `docs/manual.html`, `docs/USER-GUIDE.md` | beta framing in the intro and the limits sections |
| `docs/ONBOARDING.md`, `docs/DEMO-SCRIPT.md` | the cost objection, answered as "it's free" |
| `docs/BETA.md` | the whole tester note |
| `README.md` | the front page |

### `MARKETING.md` — internal, and the one to check before you publish

Found while writing this file, by following `docs/README.md`'s own *"sell it"*
row. **It is an internal document** — it 404s in production, and nobody reads
it as a document. It is prepared copy: it becomes public one paragraph at a
time, when a person copies text out of it into a post or a landing page.

That is why it is **here and not on `CLAUDE.md` §27's walk list**, where it was
briefly put and then taken off again (§48). Its failure is deferred to the
moment of publishing, so the check belongs at that moment — which is this
document — rather than on a list walked at every feature change, where it would
almost always be a no-op and would teach the eye to skip the list.

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

**Rewrite it before anything is published from it, not after.** The
competitor-price attack has to go regardless of what we charge; the honest
version of that argument was always *per-module rather than per-seat*, not
*free rather than paid*, so it survives a price in a way the current wording
cannot.

**And check what has already gone out.** The file is a source, so the thing
that can embarrass us is the copy that has left it — a post, a profile, a
landing page written from these paragraphs months ago. Rewriting the source
does nothing about those. List where this copy has been published and go and
look; if the answer is "nowhere yet", write that down, because it is the
cheapest state this will ever be in.

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

- It decides nothing except what it is told. `nimbleclerk.com` is recorded here
  because the owner chose it, not argued for here; every row in §2.4 is still a
  question with the prior reasoning attached, not an answer.
- It does not cover company formation, VAT registration, or the ICO
  registration and solicitor-drafted DPA already outstanding from the UK
  launch. Those are real and they are not this repository's business.
- It is **not served**. Only `docs/manual.html` and `docs/product-tour.html`
  are public (§28); this file 404s in production by construction, which is
  what lets it be blunt about what is not finished.
