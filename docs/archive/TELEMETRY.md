# Telemetry — what the three meters are, and what removing one costs

> **FROZEN — a decision record, written 2026-08-27.** Not maintained. It
> describes the telemetry as it stood on that day, and the reasoning behind
> keeping it, at the point where removing the egress half was first proposed
> and declined.
>
> **Live status: `CLAUDE.md` §24 (the meters), §25 (the alerts), §4 (the
> Windows SIGTERM trap).** If this document and those disagree, those are
> right.

Written because the removal was proposed for a good reason and declined for a
narrower one, and neither survives in the code. The next person to propose it
should start from what is here rather than rediscovering it.

---

## When removing telemetry or egress, remember these details

The short version, before the reasoning. Each is expanded below.

1. **A failing shutdown test on Windows is not evidence the telemetry is
   useless.** Windows cannot deliver SIGTERM to a child process, so the flush
   never runs and the persisted total is short. The server is behaving. This
   is what prompted the proposal, and it was a platform artifact.
2. **The counter's real job is the alert, not the panel.** Render's dashboard
   reports bandwidth and memory perfectly well — but it is *pull*. The in-app
   figure is what fires a Telegram message at 60% and 85%. Removing it trades
   a notification for a page somebody has to remember to open.
3. **If you are shedding one meter, RSS is the weaker one.** It is a point
   sample taken when `/health` is hit, so it catches slow growth and never the
   burst that would actually OOM-kill the container. Egress is a true
   accumulator and measures exactly what it claims to.
4. **The counter never writes per request**, and that is load-bearing. It
   accumulates in memory and flushes on an interval or a 256 KB burst. A
   per-response write would generate more storage traffic than the thing it
   measures, on the same 512 MB the customers use.
5. **It counts response bodies only.** No TLS framing, no headers. The figure
   Render bills is *higher*, and every surface that shows it says so. Do not
   quietly drop that qualifier — a bandwidth number presented as exact, that
   is not, is worse than none.
6. **`EGRESS_LIMIT_BYTES` is a guess about someone else's pricing.** It
   defaults to 5 GB because that was Render's free monthly allowance. A limit
   that no longer matches the plan makes every percentage wrong, so it is
   checked against the plan, not assumed.
7. **Removing it is not a one-file change.** The inventory is at the bottom of
   this page — eight files, including two test suites, the env matrix and the
   API contract.

---

## What the three meters are

All three are measured from inside the process, and the set was chosen by
elimination as much as by design.

| Meter | Source | Limit | Alert steps |
|---|---|---|---|
| Storage | Mongo `dataSize + indexSize` | `STORAGE_LIMIT_BYTES`, 512 MB | 60 / 85 / 95 % |
| Memory | `process.memoryUsage().rss` | `RAM_LIMIT_BYTES`, 512 MB | 70 / 85 % |
| Bandwidth | counted response bodies | `EGRESS_LIMIT_BYTES`, 5 GB | 60 / 85 % |

**Uptime hours are deliberately not a fourth.** Render does not publish
free-tier instance-hour consumption through any API, and a number that cannot
be checked is worse than none. An earlier draft proposed accumulating our own
uptime instead; it was dropped rather than shipped as an estimate wearing the
clothes of a measurement.

That decision is the shape of this whole area: **measure, or say nothing.**

---

## 1. The Windows failure that started this

Reported from a local `npm test`:

```
✖ egress is counted, persisted, and still there after a restart
  AssertionError: the month's total must not reset on a restart: 297 < 2829
```

The test creates traffic, restarts the server against the same data directory,
and requires the month's total not to have gone backwards.

**The mechanism.** The tail is written by the server's `SIGTERM` handler.
Windows has no POSIX signals: libuv maps `child.kill()` to
`TerminateProcess()`, which ends the child unconditionally and never runs its
JS signal listeners. So the pending bytes never reach disk.

The numbers say exactly that and nothing else: **297** had already been
flushed by the ordinary interval; **2,532** were still buffered in memory when
the process was killed. Nothing leaked. The same test passes on Linux, which
is what CI runs and what Render runs.

**It is skipped on `win32` now, not deleted.** It is the only guard on that
handler, and the handler exists for a measured reason — see §3 below.

**Do not "fix" it by flushing through an endpoint before the kill.** That
variant would pass against a server with no `SIGTERM` handler at all, which is
a test worth nothing. The guarantee under test *is* signal delivery.

**The general form of the trap**, which is why it is also in `CLAUDE.md` §4:
anything guarded by a graceful-shutdown path fails on Windows while the code is
behaving correctly, and the symptom is always a persisted value short by
whatever was still buffered.

---

## 2. Why the counter exists at all, given that Render has a dashboard

This is the strongest argument for removal and it is half right.

Render's dashboard **does** report bandwidth and memory. As an observability
surface it is better than ours: it measures what Render bills, we measure
response bodies.

**But it is pull, and the alert is push.** `CLAUDE.md` §25 is built on one
sentence — *tell me before I look* — and the whole reason the alert loop hangs
off the keep-warm ping is that nobody was going to open a dashboard on a
schedule. Free-tier bandwidth exhaustion is exactly the failure you want to
hear about at 60%, not discover at 100% when the service stops answering.

So the trade is not "custom code versus Render's dashboard". It is **a
notification versus a page somebody has to remember to open.** Anyone
proposing the removal should be making that trade knowingly; it is a
defensible one on a deployment with real external monitoring in front of it,
and a bad one on a free tier with none.

**If external monitoring does cover it, remove the meter *and* the alert rule
together.** A panel tile with no alert behind it is the worst of both: the
maintenance cost of the counter, none of the benefit.

---

## 3. The design constraints, which are not obvious from the code

**It must never write per request.** A counter that persisted on every
response would generate more storage traffic than the thing it is measuring,
against the same 512 MB the customers share. So:

- bytes accumulate in `egressPending`, in memory;
- a flush happens on an interval (`EGRESS_FLUSH_MS`, 60s) **or** once a burst
  passes `EGRESS_FLUSH_BYTES` (256 KB), so a single large download is not
  sitting only in memory;
- a crash costs at most one interval's worth, which is the right trade;
- a failed write **puts the bytes back** rather than losing them to a
  transient database error.

**And therefore it must flush on shutdown.** Render's free tier spins down
after ~15 minutes idle and signals to do it. With only an interval flush, every
sleep loses whatever was counted since the last write — on a quiet service,
most of it. The month's figure would read far too low to be worth having. The
flush is bounded by a 2-second race so a slow database cannot stop the process
exiting.

That is the entire reason the `SIGTERM` handler exists, and the reason its test
was skipped rather than deleted.

**The month rolls forward, it does not accumulate history.** A flush landing in
a new month starts that month from this flush rather than from zero-plus-
whatever was there.

**It counts response bodies only.** `res.write` and `res.end` are wrapped;
headers and TLS framing are not counted. Every surface that displays the figure
says so — the panel tile, the alert text, and the API docs. That qualifier is
part of the measurement, not decoration.

---

## 4. Why RSS is the weaker meter, if you are shedding one

Stated because the instinct is to treat the two as equivalent, and they are not.

**RSS is a point sample taken when `/health` is hit.** It catches a leak —
slow growth over hours — and it will never see the sudden allocation that
OOM-kills the container, because that happens between pings. A high-water mark
is stored alongside so the panel shows the worst observed rather than the last
glance, but that does not change what it can detect. It must not be presented
as protection against an OOM kill, and the alert text says "slow growth rather
than a spike" for that reason.

**Egress is a true accumulator.** Every response body passes through it. Its
only inaccuracy is a known, stated, one-directional undercount.

So the ranking, for anyone deciding what to keep: **storage first** (it is the
one that actually fills and the one with a hard 512 MB wall), **egress
second**, **RSS last**.

---

## 5. Inventory — what a full removal touches

Written out because the change looks like a one-file change and is not.

| File | What goes |
|---|---|
| `server.js` | `EGRESS_LIMIT_BYTES` / `_FLUSH_MS` / `_FLUSH_BYTES`, `egressPending`, `egressFlushAt`, `monthKey`, `flushEgress`, the `res.write` / `res.end` wrapper middleware, `egressReport`, the `SIGTERM`/`SIGINT` handler, the `egress` alert rule, `meters.egress` |
| `js/app.js` | the Bandwidth meter tile |
| `tests/signup.test.mjs` | *"the three meters are present, and each knows its own limit"* (asserts `meters.egress`), *"egress is counted, persisted, and still there after a restart"* |
| `tests/e2e.spec.js` | the `Bandwidth` assertions in *"the deployment card shows the three meters and who is heaviest"*, and its preamble comment |
| `docs/API.md` | `meters.egress` in the `/api/admin/platform` body, the alert-threshold table row |
| `DEPLOYMENT.md` | `EGRESS_LIMIT_BYTES` and `EGRESS_FLUSH_MS` / `EGRESS_FLUSH_BYTES` env rows |
| `README.md` | "monthly bandwidth" in the operator-controls bullet |
| `CLAUDE.md` | §24 (three meters, the SIGTERM finding), §25 (the alert rule) |

**Two things that are easy to miss.** The `SIGTERM` handler is *only* there for
the egress flush — removing egress makes it dead code, and leaving it behind is
a handler nobody can explain. And the E2E test asserts **three** meters by
count, so dropping one fails a test that does not mention egress by name.

---

## What was actually decided, 2026-08-27

The removal was proposed, the Windows failure was diagnosed as a platform
artifact, and the scope was narrowed to **skipping the test on `win32`**. The
meter, its alert rule and the Bandwidth tile were left in place.

That is a decision about this deployment at this moment — a free tier with no
external monitoring in front of it. It is not a permanent argument, and §2
above is the part that would change if that changes.
