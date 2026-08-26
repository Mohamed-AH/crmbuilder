# Security audit — the plan

> **FROZEN — the plan and its reconnaissance as they stood at the start.**
> Not maintained. **Live status is `CLAUDE.md` §30**, which is the checklist.

A full-application audit: auth boundaries, parameter tampering, injection,
XSS/CSRF, rate limiting and workspace isolation. Scoped against a checklist
supplied from outside, **checked against the code rather than accepted** — the
same treatment the Tier 1 audit got (`CLAUDE.md` §21), where six of eight claims
held and two did not.

---

## Reconnaissance: what this application actually is

The checklist assumes a stack this project does not use. That matters, because
several items cannot be "ticked" — they have to be re-framed or dismissed with a
reason, and a tick against a mitigation that was never applicable is worse than
no tick at all.

| Checklist assumed | Reality |
|---|---|
| Mongoose | Raw `mongodb` driver. No schemas, no `Model.findByIdAndUpdate`, so *Mongoose* mass assignment does not exist — a different form does. |
| `express-mongo-sanitize` | Not installed. Filters are built as `{ email }`, `{ code }`, `{ id }` shorthand, so coercion at the call site is the control. |
| `google-auth-library`, ID tokens | **Authorization-code flow.** The server exchanges the code with Google's token endpoint and calls `/oauth2/v2/userinfo` **server-to-server over TLS**. No client-supplied ID token is ever accepted, so there is no signature to verify. |
| DOMPurify / a template engine | No template engine. `js/app.js` builds HTML with template literals and an `esc()` helper. |
| `axios` and SSRF | No `axios`. Outbound `fetch` goes to two fixed Google endpoints and one operator-configured webhook URL. |
| `NEXT_PUBLIC_` / `VITE_` | No build step and no frontend env vars. Nothing is inlined into client bundles because there are no bundles. |
| JWT with a static fallback secret | `SESSION_SECRET` falls back to `crypto.randomBytes(32)` — **random, not static**. Restarting without it signs everyone out, which is the correct trade. |

Full dependency list: `express`, `cookie-parser`, `jsonwebtoken`, `mongodb`.
Four production dependencies, `npm audit` clean.

## What the reconnaissance found already correct

Recorded so a later reader does not "fix" them, and so the audit's value is not
overstated:

- **OAuth state** — `crypto.randomBytes(16)` (128 bits), httpOnly, `sameSite=lax`,
  `secure` in production, 10-minute lifetime, compared on return and cleared.
- **Redirect URI** — built as `${APP_URL}/auth/google/callback`, exact, from the
  environment. No wildcard or regex. Console registration is external config and
  belongs in the deployment checklist, not the code.
- **Cookie attributes** — every one of the five cookies (`session`, oauth state,
  beta, invite, ask) carries `httpOnly` + `sameSite=lax` + `secure` in production.
- **CORS** — no CORS middleware is installed at all, so no
  `Access-Control-Allow-Origin` header is ever emitted and cross-origin reads are
  blocked by the browser default. **Absence is the mitigation here**; installing
  a permissive `cors()` would be the regression.
- **CSRF** — `sameSite=lax` plus a JSON-only API (no form-encoded body parser,
  no `<form>` posts) covers the state-changing routes. The OAuth flow has its own
  state nonce.
- **Tenancy / BOLA** — the core invariant already: `req.scopeOrgId` and
  `workspaceIdFor(user)` resolve from the session, never a parameter, and a
  cross-boundary read answers **404 not 403**. Eight isolation tests assert the
  attack rather than the happy path (`CLAUDE.md` §5).
- **NoSQL injection on live paths** — spot-checked and closed: `/api/org/join`
  does `String(req.body.code || '')`, invite preview uses `req.params.code`
  (Express route params are always strings), and the access-request listing
  passes no query parameter into a filter.
- **Static file exposure** — closed in `CLAUDE.md` §28.
- **Secrets** — `.env` gitignored; a history scan for Google, Mongo, Telegram and
  OpenAI credential shapes returns only documentation placeholders.
- **Dependencies** — `npm audit` reports zero vulnerabilities; `package-lock.json`
  is committed.

## Preliminary findings to work

Severity is *for this deployment* — a single-instance beta on a free tier with a
handful of tenants — not in the abstract.

| # | Finding | Severity | Phase |
|---|---|---|---|
| 1 | `verified_email` from Google's userinfo response is **never checked** | Medium | 1 |
| 2 | `/auth/dev` passes `req.body.beta` / `req.body.invite` **uncoerced** into a Mongo filter | Low (dev-only route, 404 in prod) | 1 |
| 3 | No auth-failure logging — a state mismatch or refused signup leaves no trace | Low | 1 |
| 4 | Prototype pollution unassessed: record `doc`, CSV import and `importState` all accept arbitrary JSON keys | **Unknown — assess** | 2 |
| 5 | Mass assignment unassessed across `PATCH`/`PUT` routes | **Unknown — assess** | 2 |
| 6 | XSS: ~23 `innerHTML` sinks in `js/app.js`; `esc()` coverage not yet proven exhaustive | **Unknown — assess** | 3 |
| 7 | No security headers at all — no CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` | Medium | 4 |
| 8 | No rate limiting on auth, sync or admin routes (feedback has its own 10/hour) | Medium | 4 |
| 9 | `express.json({ limit: '8mb' })` applied **globally**; only `/api/sync` needs it | Low | 4 |
| 10 | `FEEDBACK_WEBHOOK_URL` is unbounded — a compromised admin could point it at `169.254.169.254` or a private range | Low | 4 |
| 11 | Error responses not audited for stack traces / internal paths | Low | 4 |

Items 4, 5 and 6 are marked *unknown* deliberately. Guessing a severity before
looking is how an audit ends up reporting its own assumptions.

## Method

Per `CLAUDE.md` §9, and it is the part that makes this worth doing:

1. **Every finding gets a test, and the test is run against the unfixed code.**
   A test that passes on the vulnerability proves nothing. The §28 work is the
   model: seven failures with byte counts before the fix.
2. **Findings that turn out to be false are recorded as false**, with why.
   §21 found two of eight claims backwards, and recording that stopped them being
   "fixed" later by someone reading the report rather than the source.
3. **One phase, one commit.** Independently reviewable and revertible.
4. **No new production dependency unless it earns its place.** Four dependencies
   is an asset on a free tier and a supply-chain surface not taken.

## Phases

Each ends with: tests green, `CLAUDE.md` §30 updated, one commit.

- **Phase 1 — Auth and session.** Findings 1–3.
- **Phase 2 — Injection and data integrity.** Findings 4–5, plus an exhaustive
  sweep of every store call site for filter coercion, and confirmation that no
  `$where` / `mapReduce` / string-evaluated query exists anywhere.
- **Phase 3 — XSS.** Finding 6: every interpolation reaching an `innerHTML`
  sink, traced to whether its value can carry user input. Then CSP as defence in
  depth — *after* the sweep, so it is a second layer rather than a substitute for
  escaping.
- **Phase 4 — Network hardening.** Findings 7–11.
- **Phase 5 — Supply chain and operational.** `npm audit` and secret scanning as
  CI gates; documentation as a **map** into the relevant sections, never a second
  source (`docs/README.md` records why there is no `SECURITY.md`).

## Explicitly out of scope

- **Penetration testing against the live host.** This session cannot reach
  `*.onrender.com` (`CLAUDE.md` §8). Everything is verified against a local
  server running the same code, and anything needing the live host is handed
  over as a named check.
- **Google Cloud Console configuration.** Redirect-URI registration and consent
  screen state are external; they belong in `DEPLOYMENT.md`'s checklist.
- **Infrastructure** — Render's TLS termination, Atlas network rules.
