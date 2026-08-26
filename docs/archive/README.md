# Archive — frozen, not maintained

> **Status: FROZEN.** Nothing in this directory is kept true. Every document
> here is a plan or a decision as it stood on the day it was written, and some
> of it is now wrong. **Do not edit these to bring them up to date** — that
> destroys the thing that makes them worth keeping.
>
> For what is true today: **`CLAUDE.md`** (engineering) and **`docs/`**
> (everything else).

## Why keep them at all

A plan records *why* something was shaped the way it was — the options that
were rejected, the constraints in force at the time, the cost that made an
item not worth building. None of that survives in the finished code, and it is
exactly what the next person needs before changing a decision.

Status belongs somewhere that is maintained. These point at `CLAUDE.md` for it.

## What is here

| Document | Was | Live status |
|---|---|---|
| [SCALING-OPTIONS.md](SCALING-OPTIONS.md) | The multi-tenancy analysis: Options A–E, capacity limits, pooled vs dedicated. Option E was chosen and shipped. | `CLAUDE.md` §5, §10 |
| [OPERATOR-CONTROLS.md](OPERATOR-CONTROLS.md) | The plan for the admin dashboard's usage, quota, signup and suspension controls. Stages A, B and C all shipped. | `CLAUDE.md` §24, §25 |
| [TIER-2.md](TIER-2.md) | Field-level merge, roles that cannot delete, and the costing of undoable deletes. 2c and 2a shipped; 2b deliberately not built. | `CLAUDE.md` §26 |

## Known-false statements, so nobody is caught by them

`SCALING-OPTIONS.md` is the one to be careful with. It was called
`ARCHITECTURE.md` until this reorganisation, which is a name that promises
current reference and delivered a frozen options analysis — the rename is the
point. Its §1, *"Where we are today"*, is now wrong on four counts:

- Rows are shown keyed `{ userId, orgId, … }`. They are keyed `wsId`.
- Roles are given as three. There are five.
- *"Workspaces are still per-account, deliberately"* — shared team workspaces
  shipped four stages later.
- The 16 MB document ceiling and the "~62,000 records" table describe the
  pre-per-record-sync snapshot model. That ceiling is gone.

It is also internally inconsistent, and instructively so: an earlier
documentation pass patched its *proposal* sections (Option B lists all five
roles correctly) while leaving *"where we are today"* untouched. The document
now describes the future more accurately than the present. That is what
patching a historical document in place does, and it is why these are frozen
instead.

## The rule

Adding a document here means it has stopped being maintained. Say so in its own
header too — a file that is opened directly should not depend on someone having
read this page first.
