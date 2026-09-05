# Documentation map

> **Current reference.** Verified 2026-08-27. Start here.

Three places, and the difference is the whole point of this page:

| Where | What it is | Kept true? |
|---|---|---|
| **`CLAUDE.md`** (repo root) | Engineering working notes — how it works, why, and the traps | **Yes**, a section per change |
| **`docs/`** | Everything else that is current | **Yes** |
| **`docs/archive/`** | Plans and decisions, frozen at the moment they were written | **No, deliberately** |

Every file carries a status banner in its first lines, so opening one directly
tells you the same thing this table does. **The dates differ between files, and
that is the point** — each says when *that* document was last checked against
the code, so a doc nothing has invalidated keeps its older date rather than
being re-stamped for tidiness.

**Git dates will not help you.** A documentation pass touched every file on the
same day; last-modified says nothing about whether a document is current. That
is why status is declared, not inferred.

---

## I want to…

| … | Read |
|---|---|
| **use the CRM** | [USER-GUIDE.md](USER-GUIDE.md) · or [manual.html](manual.html), the same thing as a web page |
| **evaluate it / show it to someone** | [product-tour.html](product-tour.html) for them, [DEMO-SCRIPT.md](DEMO-SCRIPT.md) for you |
| **roll it out to a business** | [ONBOARDING.md](ONBOARDING.md) |
| **deploy or host it** | [../DEPLOYMENT.md](../DEPLOYMENT.md) |
| **run it as an operator** | [BETA.md](BETA.md) — signups, quotas, alerts, backups, the tester note |
| **change the code** | [../CLAUDE.md](../CLAUDE.md) — read §3 *Invariants* and §4 *Traps* first |
| **call or extend the API** | [API.md](API.md) — every route, auth, sync, roles, alerts, reminders |
| **understand why a decision was made** | [archive/](archive/) |
| **sell it** | [../MARKETING.md](../MARKETING.md) |

---

## Current — maintained

| Document | Audience | Covers |
|---|---|---|
| [USER-GUIDE.md](USER-GUIDE.md) | end users | Every feature in the order you need it. 14 sections. |
| [manual.html](manual.html) | end users | The guide as a standalone web page. **Publicly served** — path is frozen. |
| [product-tour.html](product-tour.html) | prospects | Customer-facing overview, third person. **Publicly served** — path is frozen. |
| [DEMO-SCRIPT.md](DEMO-SCRIPT.md) | presenter | Timed 10-minute demo, imperative, with the expected questions. |
| [ONBOARDING.md](ONBOARDING.md) | rollout | Getting a business *using* it inside a week. |
| [BETA.md](BETA.md) | operator | Runbook: consent screen, codes, usage, alerts, access requests, plus the note to send testers. |
| [API.md](API.md) | developers | The HTTP contract and the rules behind it. Carries the route count; nothing else should. |
| [../DEPLOYMENT.md](../DEPLOYMENT.md) | operator | Render + Atlas + OAuth, the env matrix, backups, what the deployment publishes. |
| [../CLAUDE.md](../CLAUDE.md) | developers | **The densest document here.** Architecture, invariants, and every trap that has cost time. |
| [../MARKETING.md](../MARKETING.md) | go-to-market | B2B/B2C copy and launch threads. |
| [../README.md](../README.md) | everyone | What it is, quick start, project layout. |

## Frozen — [archive/](archive/)

Not maintained, and some of it is now false. Kept because a plan records *why* a
decision was shaped that way, which does not survive in the finished code.
[archive/README.md](archive/README.md) lists the known-false statements.

| Document | Live status |
|---|---|
| [archive/SCALING-OPTIONS.md](archive/SCALING-OPTIONS.md) | `CLAUDE.md` §5, §10 |
| [archive/OPERATOR-CONTROLS.md](archive/OPERATOR-CONTROLS.md) | `CLAUDE.md` §24, §25 |
| [archive/TIER-2.md](archive/TIER-2.md) | `CLAUDE.md` §26 |
| [archive/SECURITY-AUDIT.md](archive/SECURITY-AUDIT.md) | `CLAUDE.md` §30 — complete |
| [archive/TELEMETRY.md](archive/TELEMETRY.md) | `CLAUDE.md` §24, §25 — all three meters shipped |

---

## Two rules worth knowing before you edit anything

**A change to what a user can do has to be walked through all of them.**
`USER-GUIDE.md`, `manual.html`, `product-tour.html`, `ONBOARDING.md`,
`DEMO-SCRIPT.md` and `BETA.md`'s tester note — not just `CLAUDE.md` and the
README. The HTML two are the easiest to forget because nothing greps them by
habit, and they drifted for months as a result. `CLAUDE.md` §27.

**A change to the wire contract has to be walked through [API.md](API.md).**
It went stale one commit after it was written: the security audit's network
hardening added per-route body limits, rate limits and a non-leaking error
handler, all of which change a status code a caller sees. A contract document
rots faster than a feature document, because the contract moves more often.

**Route, don't restate.** `manual.html` mirrors `USER-GUIDE.md` section for
section and drifted silently behind a matching table of contents — the headings
looked in sync while the prose was a year apart. Where a fact has a home, link
to it. `API.md` points at `CLAUDE.md` sections rather than re-explaining them,
on purpose.

## What is deliberately not written down

Not gaps to fill without deciding they are worth it:

- **No `SECURITY.md`.** The model is real but lives across `CLAUDE.md` §5, §13,
  §16, §17, §20, §21, §28 and §30, plus §3's invariants. A consolidated copy
  would be a second source that disagrees within a quarter — the exact failure
  above. If it is ever written it should be a **map** into those, not a
  re-explanation. §30 is the closest thing: the audit's findings, including the
  ones that were **false**, which is what stops someone "fixing" them later.
- **No changelog.** Git history and `CLAUDE.md`'s sections carry it.
- **No architecture document.** `CLAUDE.md` §1, §3, §10 and §11 are it.
  `archive/SCALING-OPTIONS.md` was named `ARCHITECTURE.md` and was never one.
