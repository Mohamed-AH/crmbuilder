# Tier 2 — the plan

The two items held back from the outside audit (`CLAUDE.md` §21), plus a third
the audit implied but did not name.

**Live status is in `CLAUDE.md` §26**, not here — this document is the
reasoning; that one is the checklist.

---

## What was actually asked, and what the code says

> *No read-only role — every member may delete every record. Record-level
> last-write-wins loses a concurrent field edit.*

Both hold. But checking them turned up a third fact that changes the first:

**A tombstone discards the record body.** `js/db.js` writes
`{ id, moduleId, deletedAt, updatedAt }` and `server.js` writes `doc: null`.
So a deleted record is not "recoverable for 180 days" — the retention window
governs how long the *gravestone* survives so offline devices learn about the
delete, not the row. The moment a delete syncs, the contents are gone
everywhere.

That matters because "members can wipe the database" has two possible answers —
**stop them**, or **make it undoable** — and the second is currently impossible
rather than merely unbuilt.

---

## 2a — Roles that cannot delete

A ladder, rather than a second axis to reason about:

| | owner | member | contributor | viewer |
|---|---|---|---|---|
| read | ✅ | ✅ | ✅ | ✅ |
| create / edit records | ✅ | ✅ | ✅ | ❌ |
| delete records | ✅ | ✅ | ❌ | ❌ |
| module fields, add/delete modules | ✅ | ❌ | ❌ | ❌ |
| invite, roles, remove members | ✅ | ❌ | ❌ | ❌ |

**The enforcement seam already exists and is proven.** `applyPush` refuses a
member's module write and returns the server's own copy in `rejected`; the
client overwrites its local row and the edit un-happens (§14). This is the same
mechanism widened from modules to records — including the case that mechanism
was built for: someone who was a member offline, demoted to viewer, and
reconnects. Their work legitimately vanishes and the named toast is the
difference between a rule and a bug report.

**Traps this inherits, all already recorded in §14:**

- A rejection cannot be merged by last-write-wins — `applyRejections` overwrites
  unconditionally and takes the server's clock.
- A refused *deletion* must restore the row; a refused *creation* must be
  purged, not tombstoned, or it is re-pushed and reverted forever.
- The client-side check only avoids offering a button whose effect the server
  would undo a second later. The server decides.

**Cost:** small. One more value in `ROLES`, a `canEditRecords`/`canDeleteRecords`
pair beside `canEditSchema`, the Team screen's role picker, and the record
buttons hidden for a viewer.

## 2b — Undo, and what it costs

Roles stop the wrong person. They do nothing about the right person making a
mistake, which is the more common way data disappears.

Making a delete undoable means **keeping the body**, and that is a storage
decision on a 512 MB shared tier — the one Stage A just built meters for. Two
consequences worth stating before anyone commits:

- A workspace that deletes to free space **would not free any**, until the
  retention window passed. That directly contradicts the lever the operator now
  has.
- A mass delete temporarily *doubles* that tenant's footprint, which is exactly
  the failure mode the quota alerting exists to catch.

So if this is wanted, it needs to be bounded on both axes — a short window
(30 days, not the tombstone's 180) **and** a per-workspace cap on retained
bodies, whichever bites first. And the module-delete path already tombstones
every record in the module, so "undo" has to restore a set, not a row.

**Recommendation: not now.** It is a real feature with a real bill, it fights
the quota work, and 2a covers the stated risk. Worth revisiting when a tester
actually loses something.

## 2c — Field-level merge

The one that loses data in **ordinary** use, with no bad actor involved: A
edits a phone number, B edits the email on the same record, and whoever syncs
second overwrites the whole row.

There is no test for it today. `two devices editing different records both keep
their work` covers the case per-record sync was built to fix; the same-record
case is untested and currently silently lossy. **The first deliverable is a
failing test that demonstrates the loss**, before anything is changed.

**Shape.** A clock per field, `fieldsAt: { [key]: ts }`, carried inside `doc`
so the server needs no schema change:

- Set on save, **only for keys whose value actually changed**. A record created
  and never edited carries none, so the common row does not grow.
- On merge, each key takes the side with the newer `fieldsAt[key]`, falling
  back to the row's `updatedAt` when a key has no clock.
- A row with no `fieldsAt` at all behaves exactly as today, so a client on
  cached older JS keeps working through a deploy — the same rule §10 already
  applies to `/api/data`.

**The part that makes this the riskiest change so far:** the merge has to
happen **on the server**, not just the client. `applyPush` currently *skips* an
incoming row that is not newer (`prior.updatedAt >= updatedAt → continue`), so
a client-side merge would still be overwritten by whoever pushed last. That is
a change to the heart of the sync engine, which already carries six recorded
traps (§10).

**Traps to expect, on top of those:**

- **Tombstones stay whole-row.** Deleting a record is not a field edit and must
  not be merged field-by-field.
- **Removing a field's values (§22) deletes keys.** An absent key currently has
  no clock, so a purge could be silently undone by a stale copy. Purge has to
  be a clocked change, not a deletion, or the two features fight.
- **Storage.** `fieldsAt` is bounded by the fields a record has actually had
  edited. Worth measuring against a real workspace before shipping, not after —
  §17's rule about measuring rather than estimating.
- **`updatedAt` still governs selection and the cursor.** Only the *contents*
  merge per field; the row clock keeps its existing job, or the delta protocol
  breaks (§3).

---

## Suggested order

1. **2c first.** It fixes loss that happens with no bad actor, on a two-person
   team, today. Highest value, highest risk — which is an argument for doing it
   while the suite is green and attention is on it.
2. **2a next.** Contained, and the mechanism is already proven by §14.
3. **2b only on evidence.** Named, costed, and deliberately not built.

## Verification

- **2c:** a failing test first, then two devices editing *different fields of
  the same record* both keep their edits — and the existing concurrent tests,
  including *"the same record edited twice resolves to the later clock"*, stay
  green. A row without `fieldsAt` still resolves whole-row.
- **2a:** a viewer's write is refused and reverted with a reason; a
  contributor's delete is refused and the row restored; a refused creation is
  purged rather than tombstoned; the demoted-while-offline case still works.
- Both: the 8 isolation tests stay green, and the suite does not shrink —
  164/71 at the time this was written; `CLAUDE.md` §2 carries the current
  figure.
