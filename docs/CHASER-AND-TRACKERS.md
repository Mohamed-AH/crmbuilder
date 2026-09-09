# Chaser and trackers — three features, five decisions

> **Status: live, and kept current.** This sits in `docs/`, which `CLAUDE.md`
> §29 defines as the maintained tier — not `docs/archive/`, which is frozen.
> If you change something this file names, change this file.
>
> **All three parts are built.** Renewals (`CLAUDE.md` §49), dormancy (§50),
> the `mailto:` chaser (§51), BYOK storage and the provider adapter (§52), and
> the send route, the button and the disclosure (§53). **Automated escalation
> remains rejected**, and the reason is unchanged: the scheduler, not the
> email. This
> was the spec agreed before any code, written so that the decisions are
> recorded with their reasoning rather than reconstructed from a diff. Where a
> choice was taken, the alternatives are kept beside it — a decision without
> its rejected options is a decision nobody can safely reverse. The plan is
> kept accurate as each part lands rather than frozen: this is `docs/`, not
> `docs/archive/`.
>
> Internal: not served (`CLAUDE.md` §28), which is what lets it be blunt about
> what is unfinished.

Three features, asked for as five: an overdue invoice chaser, a call-to-CRM
logger, a compliance renewal tracker, dormant customer reactivation, and a
warranty/claims intake. Two of the five are not here. **The call logger and
the claims intake both need capabilities this codebase deliberately does not
have** — inbound mail, file attachments, object storage, transcription — and
each is a subsystem rather than a feature. They are recorded as *not planned*
at the foot of this document, with what they would actually cost.

The other three are planned here.

---

## The five decisions

| # | Decision | Taken | Rejected |
|---|---|---|---|
| 1 | Renewal reminder window | **Single workspace `remind.days`** — shipped | per-module windows |
| 2 | Dormancy clock | **A date field the user picks**, falling back to `updatedAt` — shipped | a mandatory schema field · a full activity model |
| 3 | Chaser dispatch | **BYOK manual send**, with `mailto:` as the built-in fallback — both shipped | `mailto:` only · automated escalation |
| 4 | Who may send | **Owner + member** | owner only · every role |
| 5 | Message content | **Invoice number and balance** | counts only |

Each is expanded below with the reasoning, because the reasoning is the half
that does not survive in the code.

---

# Part 1 — Compliance renewal tracker

> **BUILT.** Shipped as the `renewals` template in `js/templates.js`. What it
> cost, what the mutation check actually found, and the docs it touched are in
> `CLAUDE.md` §49 — including one thing this plan did not anticipate: a module
> whose watched date field is **empty** does not miscount, it **disappears from
> the digest**. The rest of this part is left as written, because the reasoning
> is what shaped it.

## What already works

`remindersDue()` (`server.js`) scans a workspace's modules, picks each one's
watched date field, counts what is overdue or falling due inside
`remind.days`, and sends per-module counts to the workspace webhook. The
window clamps to 0–365, so **30 days out is already a supported setting**.

So an owner could build this today by hand. The gap is that nobody knows to,
and that the fields they would invent are not the ones an inspection asks for.

## What gets built

**A seventh module template, `renewals`.** `CLAUDE.md` §42's `consent`
template is the precedent, and its reasoning transfers whole: opt-in, changes
no existing default, costs nothing to a workspace that never picks it, and
reaches nobody who does not need it.

| Field | Type | In list |
|---|---|---|
| `holder` | text, required | ✅ |
| `kind` | select — COI · trade licence · safety certificate · background check · vehicle inspection · professional registration · other | ✅ |
| `reference` | text — policy or licence number | |
| `expires` | **date, required** | ✅ |
| `issuer` | text | |
| `status` | select — current · renewal requested · renewed · lapsed | |
| `notes` | textarea | |

### The trap that has to be written into the template itself

`watchedDateField()` (`js/date-rules.js`) is:

```js
dates.find((f) => f.showInList) || dates[0]
```

**One date field per module.** Add an `issuedOn` later with `showInList: true`
and whichever sits first in the array becomes what the digest counts — with no
error, and a plausible number in the message. So `expires` must be the only
listed date field, and **the reason belongs in a comment in `js/templates.js`**
or the next person to add a field breaks it silently.

### Demo and sample constraints, both already enforced

- **`DEMO_SKIPS`.** The template seeds no demo records, for §42's reason: a
  register covering six of the demo's forty contacts reads as compliance
  half-done, which is worse than absent. `tests/demo.test.mjs` requires that
  exception to be *named*, not inferred.
- **The template's own `samples` are still checked.** §42 added a test that
  sample rows use only real option values, only real field keys, and no
  `{ __rel }` / `{ __ref }` placeholders — those are resolved by
  `loadDemoData` and by nothing else, so one written out of habit stores a raw
  object and renders `[object Object]`.
- **`TEMPLATE_KEYS` and the `.template-card` count are derived** from
  `js/templates.js` now (§42), so an eighth template should not break them.
  Verify rather than assume — both were literals until they went stale.

## Decision 1 — one window, not per-module

`remind.days` is a single number for the whole workspace. Renewals want 30
days; a sales pipeline wants 7. **Shipping one window is the decision.**

The alternative, `remind.perModule: { <moduleId>: days }`, would touch
`remindSettings()`'s clamping, the `n > remind.days` comparison in
`remindersDue()`, the preview, the settings screen and the message. It does
**not** touch the sync seam — settings already sync whole and are already
owner-only (§14) — so it is contained. It is still the bulk of the work, for a
problem nobody has reported.

> **Review condition.** Revisit the first time a workspace wants two different
> windows. **That will not appear in telemetry** — it arrives as a support
> message, so it has to be recognised rather than measured. Written down here
> for that reason.

## The word "overdue"

For a certificate the right word is *expired*. The message builder is shared
across every module and cannot tell a due date from an expiry date; deriving
it from the field label ("starts with Expir") is a locale-bound heuristic on a
string the user typed.

**Left as "overdue", deliberately**, and said plainly in the user docs. The
price of the better word is a shared code path, and the word is understood.

## Verification

An E2E that creates the module from the template, adds one row expiring in ten
days and one already expired, and asserts the **preview** — `/api/org/reminders`
returns the exact string an owner would read (§39) — names both.

**Checked against the broken state** (§9): add a second date field ahead of
`expires` with `showInList: true`. The count must go wrong. That mutation is
what pins the `watchedDateField` trap, and without it the test passes on a
template that is one edit from being silently incorrect.

## Blast radius

`js/templates.js` is in `APP_SHELL` → bump `CACHE_VERSION`. No new served
file, so the smoke count stays **45 local / 50 live** — and running
`npm run test:smoke` is what proves that, per §9. `docs/API.md` needs nothing:
no route moves.

---

# Part 2 — Dormant customer reactivation (report only)

> **BUILT.** Shipped in the existing retention card as a second mode, with
> `DateRules.monthsAgoDay` added for the clock. `CLAUDE.md` §50 has what it
> cost — including the part this plan named as the fix and my own default then
> rebuilt: preferring *the first module with any date field* opened the report
> on Deals, aged on `Expected close`. Found by measuring the layout, not by
> reading the code. The rest of this part is left as written.

## What already works, and the word that changes everything

`staleReport()` (`js/app.js`) already groups untouched records by module,
oldest first, counts rows it could not age, and downloads the list with its
own limits carried inside the file (§44). The scan is right. **The clock is
not**, and the difference is the entire feature:

| Question | Right clock |
|---|---|
| What have we stopped **touching**? | `updatedAt` — correct today |
| Who have we stopped **talking to**? | **not `updatedAt`** |

A customer whose address you corrected last month reads as active. One you
emailed last week without logging reads as dormant. Shipping dormancy on
`updatedAt` produces a confidently wrong list — the failure shape this
codebase keeps meeting: **a defect that renders as plausible.**

## Decision 2 — the user picks the field

The obvious move is to reuse `watchedDateField()`, the same convention §37's
filter and §39's digest already use. **It does not work here, and the reason
is worth keeping.**

That helper returns one date field per module. On an Invoices module carrying
both `dueDate` and `lastContacted` it hands the *same* field to the digest and
to this report — so the report would age `dueDate` and call the result
dormancy. Falling back to `updatedAt` does not rescue it either: the fallback
only fires when there is *no* date field, and here there is one. It is just
the wrong one.

**So the field becomes an input, which is §45's answer to exactly this
shape.** A guess is wrong for somebody; the CSV date order became a control
rather than a better heuristic, and this is the same problem.

- A **selector** listing the module's date fields.
- **Preselected** where a key or label contains *contact*.
- **`updatedAt` as the fallback**, and only when the module has no date field
  at all — labelled on screen as what it is, *last changed*, not last
  contacted.
- **The chosen field is named on screen and in the download.** §37's filter
  already names the field it watches, for the same reason: filtering on a date
  the reader cannot see is indistinguishable from rows going missing.

### Rejected, and why

- **A `lastContacted` field on the Contacts template, plus a "log a touch"
  button.** Better data — and it changes the default template for every
  workspace, which is §42's exact objection: it lands in front of a sole
  trader who will never use it, and it reaches only *new* workspaces while
  every existing one stays untouched. The worst of both.
- **A full activity model.** The right answer, and a new collection, new sync
  rows and a new permission surface. Out of scope for a report.

### The clock trap inside the fix

A stored day is `YYYY-MM-DD`; `updatedAt` is a millisecond stamp.
`DateRules.monthsAgo` returns an **instant**, and comparing it to a day string
via `Number(...)` is §37's UTC trap arriving in a new place. Aging a date
field goes through `parseDay` / `daysUntil`, not through `Number`.

## Where it lives, and what it outputs

**One card, two questions — not two cards.** The existing retention card gains
a toggle: *records nobody has changed* / *customers nobody has contacted*.
Same scan, different clock, different copy. Two near-identical scanners on one
screen is §33's adjacent-and-unlabelled-numbers problem waiting to happen, and
they genuinely are the same query asked twice.

**Segmentation** is a filter to one module — you want dormant customers, not
dormant invoices — and optionally by a select field's value (`tags`, `stage`).
Client-side over rows already in memory, the same shape as §37.

**CSV as well as JSON.** This is the one report whose output gets pasted into
a mail tool, and `js/csv.js` already writes RFC 4180. Small, and it is the
difference between a report and something usable.

**Its own note inside the file**, per §43 and §44's rule that the limits
travel with the download because whoever opens it did not run it:

> "Last contacted" is the field named above. It is only as good as your habit
> of updating it.

That sentence is the honesty of the whole feature.

## It still sends nothing, and still deletes nothing

§44's E2E pins this **structurally**, not by wording:

```js
await expect(page.locator('#stale-results button')).toHaveCount(1);
```

One button, and it is the download — so a "delete these" cannot slip in
later. **Adding a CSV button makes that count 2**, which would weaken the
guard to nothing if it were simply bumped. Change it to an explicit allow-list
of the two button ids instead, so a third button fails by name.

## Blast radius

`js/app.js`, and `js/date-rules.js` if a helper lands there — both in
`APP_SHELL`, so `CACHE_VERSION`. **`server.js` requires `js/date-rules.js`**
(§39), so anything added there has a second consumer no browser test covers;
the shared-surface test in `tests/dateRules.test.mjs` covers the export list
either way.

---

# Part 3 — Overdue invoice chaser

## Decision 3 — BYOK manual send, with `mailto:` as the fallback

### What bring-your-own-key buys

The tenant supplies their own Resend or Postmark key. That moves four hard
problems off this deployment entirely:

| | Whose problem it becomes |
|---|---|
| sending domain, SPF, DKIM | theirs — we never touch DNS |
| deliverability reputation | theirs — one spammer cannot burn a shared domain |
| billing and volume | theirs — nothing to meter, nothing to enforce (§17) |
| the from-address | theirs, **and this is the one that makes it work** |

A payment reminder from `noreply@…` is ignored. From
`accounts@theirbusiness.co.uk` it gets paid.

### What it does not buy — stated, not glossed

- **Personal data still leaves.** It is *their* processor contract, which is
  genuinely better on the controller/processor split — but `privacy.html`
  currently ends its roster with *"That is the complete list"*, and §40 has
  been caught by that sentence twice. It needs a paragraph naming what leaves,
  when, and that the recipient is the owner's choice. §40's treatment of the
  workspace digest is the model.
- **Bounces are invisible.** A chaser that cannot see a bounce keeps chasing a
  dead address. Both providers webhook bounces back — but there is **no
  inbound surface in this product**: the only unauthenticated POST is
  `/api/access-request`, and it reads its address from a cookie specifically
  so that it is not a form (§20). Accepting a provider webhook means the first
  public inbound endpoint, with HMAC verification.
- **Opt-out.** A payment reminder to an existing customer is
  legitimate-interest. *Escalating* follow-ups drift toward marketing quickly,
  and Part 2's reactivation is unambiguously marketing. In the UK that is
  PECR — a different regulator from the one the rest of the launch work
  targets.

### Rejected: automated escalation

**The scheduler is the problem, not the email.** The digest pass runs once per
workspace per local day off the `/health` ping, and §40 records that ping
having never once fired the engine for weeks because a monitor pointed at
`/healthz` — a failure **no test in this repository could see**. That is an
acceptable foundation for a message nobody loses money over. It is not one for
money collection.

And idempotency is where it gets genuinely hard. §39 marks the day *before*
the send, correctly, because spamming a channel beats missing a day. For an
invoice chaser the same rule means a silent failure is never retried; the
opposite rule means a slow provider sends the customer three copies. Neither
is acceptable, so it needs a per-record send log with an idempotency key — a
new collection and new sync rows — on top of the inbound endpoint.

**If escalation is ever wanted, the scheduler question gets answered on its
own, first, with §40 in front of you.**

## Where the key goes — already decided, by §38

The webhook URL asked this exact question and every word transfers.

- **Not in `settings`.** `pullChanges` sends `meta.settings` **whole** to
  anyone whose cursor is behind — member, contributor, **viewer** — so the key
  would land in every colleague's IndexedDB, offline, permanently.
- **And masking would then destroy it.** The client merges the pulled document
  into local settings and pushes the whole thing back, where last-write-wins
  accepts it: `re_•••••` overwrites the real key the first time an owner
  changes the currency. **Redaction and last-write-wins cannot both apply to
  one document.**
- **So it is a sibling on the meta doc**, like `hook`. Call it `mail`.
  `putData` merges on both stores, and `pullChanges` names `meta.settings`
  specifically, so sync **structurally** cannot reach it — a guarantee that
  holds for somebody who never reads the comment.
- **No read-back, anywhere.** An owner who loses the key re-enters it. The
  screen shows the provider and the verified from-address, never the key.
- **Redacted on export, and the marker is not stripped.**
  `workspaces[].meta` *is* the `data` collection, so anything there is in
  every nightly artifact. The export writes `{ redacted: true }`;
  `restore.mjs` turns that into `{ needsReentry: true }` **rather than
  deleting it**, because §38 found that stripping the marker silently
  disabled the feature for every tenant at once with nothing anywhere saying
  so. Same treatment, same reason.
- **Never in `platform`** (§17's standing rule — it is in every artifact from
  version 2 onward), and never interpolated into a log line.

## The outbound path

**This is not a new SSRF sink**, which is what makes it affordable. The host
is fixed and ours to choose (`api.resend.com`, `api.postmarkapp.com`) —
exactly the Telegram case in §38. Only the key varies, and it varies in a
header. It still goes through `sendGuarded`, so the block list, the DNS pin
and refuse-redirects all still apply.

**One real signature change.** `sendGuarded(rawUrl, payload, opts)` has no
headers parameter — `opts` is `blockList`, `lookup`, `timeoutMs`, `allowHttp`,
`maxBytes`. Both providers authenticate with a header (Resend: `Authorization:
Bearer re_…`; Postmark: `X-Postmark-Server-Token`), so `headers` has to be
added. **§9's shared-helper rule applies**: `sendGuarded` is on the feedback,
alert, digest and Telegram paths, so this wants a full run before it is
trusted.

**Read the response, and raise `maxBytes` to do it.** §38 records that the
default 2048 is right for a notification, where the far end has nothing to
say — and that raising it is what exposed a hang that had been live since the
webhook shipped. A provider error body needs reading; a caller that means to
read the answer says how much it expects.

**Provider is detected from the key, not chosen from a dropdown.** Resend keys
carry an `re_` prefix; Postmark uses a server token in its own header. §18's
Discord/Slack/Telegram precedent — one payload builder, two shapes, no setting
for an owner to get wrong.

> **Postmark is the better fit if only one ships.** It separates transactional
> from broadcast streams and is strict about not letting marketing leak into
> transactional — which is exactly the line an invoice chaser must not cross —
> and its bounce webhooks are first-class. Resend is easier to start with and
> cheaper at low volume, with a looser abuse posture.

## Decision 4 — owner + member, enforced on the route

**A new predicate, not the existing seam.** `canEditRecords` and
`canDeleteRecords` are enforced inside `applyPush`, because they gate *sync*.
Sending is a route call and never passes through that seam, so it needs its
own `canSendMail()` checked **on the endpoint**. A client-side hide is only a
courtesy — §14's standing rule, that the client avoids offering a button whose
effect would be undone a second later, and the server is what decides.

Hiding the button for contributor and viewer is correct here specifically
because it does **not** open a read view — §36's rule is to check that first,
and the case that broke it was `#edit-module-btn`, whose builder already
rendered read-only.

Sending on the business's behalf is a different act from reading, so §36's
reasoning for keeping **export** available to every role does not extend to
it.

## Decision 5 — the message carries the invoice number and balance

§39's counts-only rule exists because a webhook destination may be a shared
client channel the owner did not think about while pasting a URL. **Here the
recipient is the customer themselves**, so that reasoning does not apply — and
a reminder that does not say what is owed cannot do its job.

Three consequences follow, and each is work:

**The real risk is accuracy, not privacy.** A wrong balance is a demand sent
to somebody who has already paid — worse than a vague nudge. The mitigation is
not to drop the amount. It is the preview, plus the line every real dunning
email carries:

> If you have already paid, please disregard this message.

**The send log becomes financial data.** Whatever records what was sent now
holds an amount owed by the tenant's customer. That is fine inside their own
workspace — and it must never reach the digest, an alert, or the feedback
webhook, all three of which already refuse record *names* for weaker reasons
(§18, §39). Keep it on the workspace's own rows, and add nothing to any
outbound payload builder.

**Merge fields, and there is no template engine.** §30 records that as a fact
about this stack — no Mongoose, no `axios`, no template engine, no build step.
So the message template stays `{{name}}`-style substitution over a
**whitelist** of the module's field keys, escaped, with no expressions and no
nesting. Anything more is a second thing to secure.

## The `mailto:` fallback is not a throwaway

> **BUILT** — `CLAUDE.md` §51. The two things this section asked for and that
> the build had to prove: the subject cap is what makes the 2 000-character
> budget reachable at all (without it the body trims to an ellipsis and the
> href is still 2 690), and the escape rule is a bug in *both* directions, so
> both are asserted. Roles: every role, and §51 says why that does not
> contradict decision 4.

It is what a workspace with no key gets, permanently, and it is what makes the
feature useful to a sole trader — the audience `guide.html` is written for. It
also removes the awkwardness the request actually named, because the mail
leaves from the owner's own client where their signature and reply-to already
live.

Three rules, all of them from carrying decision 5 into a URL:

- **`encodeURIComponent`, not `esc()`.** `esc()` is for HTML; this is a URL.
  Newlines are `%0D%0A`. `safeHref` (§3) already permits `mailto:`, so the
  invariant is satisfied — the encoding is the part that is not automatic.
- **A 2 000-character body budget.** Several mail clients truncate around
  there, and a truncated demand is worse than a short one.
- **Truncation is visible, never silent.** If the body is trimmed, say so
  before the link is pressed. A silent trim is this codebase's recurring
  failure shape in a new place.

---

# Sequencing, and why this order

Ordered by risk of rework, not by size:

1. **Renewals template** — isolated, hours, unblocks nothing else.
2. **`mailto:` chaser** — isolated, and permanent, so it is not throwaway work.
3. **Dormancy report** — touches `js/date-rules.js`, which `server.js` also
   requires (§39).
4. **BYOK** — and inside it, `meta.mail` plus the export redaction and the
   restore marker **before any send UI**. §38 shows that half is where the
   bugs were, and it is independent of the button.

## Documents to walk (§27)

A change to what a user can do goes through `README.md`, `guide.html`,
`USER-GUIDE.md`, `manual.html`, `product-tour.html`, `ONBOARDING.md`,
`DEMO-SCRIPT.md` and `BETA.md`'s tester note. `docs/API.md` as well, for any
wire change — and it goes stale faster than the rest, because a contract moves
more often than a feature.

**Steps 1–3 need no privacy change. Step 4 does**, and it has to describe
**both** dispatch states, because `mailto:` remains the fallback inside the
same feature. §40's lesson: a page claiming a complete list has to be
re-checked against what the deployment actually does, not against what the
code could do.

## The `privacy.html` paragraph — drafted here, deliberately not published

**Written now, published when the first send actually runs**, and the deferral
is the point rather than caution about wording. §52 built the storage, the
redaction and the adapter; nothing calls the adapter, so **no personal data
leaves the deployment through it today.** A privacy page saying otherwise
would be an intention written as a fact — which is exactly what §38 caught
before a commit (backups *"are encrypted"* when they were not), what §40
records as the standing rule, and what §41 finally published only once an
encrypted artifact had been downloaded and restored end to end.

Drafting it here rather than leaving it to the send commit is the other half:
the sentence gets written while the design is in front of somebody, not at the
end of a feature when the temptation is to summarise.

The paragraph, ready to move into `privacy.html`'s roster section:

> **Sending reminders by email.** A workspace owner may connect their own
> email account with Resend or Postmark. When they do, and when somebody on
> that team sends an overdue reminder, the customer's email address and the
> text of that reminder go to whichever of those two services the owner chose.
> That is their account and their contract with that provider, not ours — we
> hold the key only so the reminder can be sent, we never show it back to
> anybody, and it is removed from our nightly backup. **Nothing is sent
> automatically.** If no provider is connected, reminders are written into the
> sender's own email program instead and never reach us or anybody else at
> all.

Four things in it that are load-bearing, so a later edit does not smooth them
away:

- **It names the two providers.** §40 was caught twice by a roster that closed
  with *"That is the complete list"* and omitted first GitHub and then
  Telegram — both found by looking at what the deployment was doing rather
  than at the code. This is a third recipient of personal data and it goes on
  the list.
- **It is scoped to the owner's choice**, like §40's treatment of the
  workspace digest. The provider is the tenant's, on the tenant's contract, so
  it is disclosed without being claimed as one of our own processors.
- **"Nothing is sent automatically"** is a real property, not reassurance:
  automated escalation is rejected above, and the reason is the scheduler
  rather than the email.
- **The `mailto:` fallback is described in the same paragraph**, because it
  remains the permanent behaviour for every workspace that never connects a
  key. Describing only the send would leave the majority of users reading
  about something that does not happen to them.

`terms.html` needs nothing: the provider relationship is the controller's, and
the retention sentence there is unchanged.

## Not planned, and what they would cost

Recorded so the omission reads as a decision rather than an oversight.

**Call-to-CRM logger.** Needs audio or transcript ingestion, transcription,
and a write path. None of the three exist: there is no upload path anywhere
(no multipart, no object storage), no file type in `FIELD_TYPES`, and no AI
dependency — production dependencies are `express`, `cookie-parser`,
`jsonwebtoken`, `mongodb`. It also changes the data-protection posture more
than anything else on the list: call recordings mean consent from both parties
and a new category of content being processed. §18 currently refuses to put a
record *name* on a chat service; this is several steps past that.

**Warranty and claims intake.** Needs inbound mail **and** attachments. Photos
would be the single biggest change to the cost model in this product's
history: §17's ceiling is Atlas M0's 512 MB shared across all tenants,
measured rather than estimated, and §33 already shows tombstones alone taking
54% of one workspace. "Routable" also implies assignment and per-module
visibility, which §2 records as considered and set aside — everyone on a team
sees every module.
