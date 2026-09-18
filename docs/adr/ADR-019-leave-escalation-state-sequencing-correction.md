# ADR-019: Leave Escalation State-Sequencing Correction (Partial Supersession of ADR-017 §9)

- **ADR ID:** ADR-019
- **Title:** Leave Escalation State-Sequencing Correction (Partial Supersession of ADR-017 §9)
- **Status:** ACCEPTED
- **Date:** 2026-09-02
- **Supersedes:** [ADR-017](ADR-017-leave-escalation-orchestration-model.md) — **§9 only** (the `manual_verification`/`expired` transition-sequencing claims, and the one sentence in the "pg-boss Job Design" section that restates them). ADR-017 §1–§8, and §9's separate claim that `manual_verification` requires explicit staff action, are **not** superseded and remain in force, unchanged. This follows the same partial-supersession pattern already used in this repository for ADR-006 → ADR-014 (auth-strategy clause only, data-platform selection unaffected) — see `docs/adr/README.md`.
- **Related ADRs:** ADR-015 (Approval Workflow Data Model — `leave_request_status` enum, unaffected), ADR-016 (Approval Authority — unaffected), ADR-017 (partially superseded, as above), ADR-018 (Notification Delivery Reliability — depends on `stage` values including `in_app_call`, unaffected in substance; its stray cross-references to ADR-017's old section numbers are corrected as a typographical fix, not by this ADR).
- **Related design record:** `docs/leave-escalation-notification-design.md` (Decision Matrix row 17)

## Context

A final consistency review of the accepted ADR-017 found its §9 ("`manual_verification` and `expired` — resolved relationship") to be factually wrong on one point and unevidenced on another, despite being marked `ACCEPTED`:

1. **Factual sequencing error**: §9's "resolved design" states "when `guardian_notified`'s timeout elapses, the scheduler's conditional-update logic transitions the request to `manual_verification`" — this skips `in_app_call` entirely. Both the accepted schema enum (`packages/db/src/schema/enums.ts`, `leave_request_status`) and the already-implemented `DECIDABLE_STATUSES` array (`apps/api/src/domain/leave/types.ts`, in force since the Parent Leave Approval task) list `in_app_call` **between** `guardian_notified` and `manual_verification`. FR-007 (SDD Ch.2) states the chain explicitly: *"Escalation: Father → Mother → Guardian → In-app call → Manual process."* — `in_app_call` is a distinct, named, ordered step, not skippable. This is a direct contradiction between ADR-017 §9's stated transition and the same evidence ADR-017 §1 and §3 already cite as authoritative — a factual error, not a difference of interpretation.
2. **Unevidenced claim**: §9 states `expired` "is reserved for a request that reaches its absolute lifecycle bound without ever being picked up by any resolution path" — no SDD chapter, FR, or ADR defines an "absolute lifecycle bound" concept, anywhere. This phrase was introduced without citation in the original ADR-017 §9 text and does not describe any mechanism this repository has ever specified. Per this repository's explicit governance (`docs/implementation-baseline.md`, every prior task in this project's history), an unevidenced claim must not be treated as a resolved decision.

Both errors affect the *substance* of what ADR-017 §9 decided (a real behavioral difference: which stage follows `guardian_notified`'s timeout, and what — if anything — automatically triggers `expired`), not merely its wording. Per this repository's ADR governance (`docs/adr/README.md`), an ACCEPTED ADR's decision text must not be silently rewritten to change its meaning — even to fix an error. This ADR performs the correction through the sanctioned mechanism: a new ADR, explicitly and narrowly superseding only the affected clauses, with ADR-017's original (now-known-incorrect) text preserved as the historical record it is.

## Decision

**ACCEPTED.**

### 1. Corrected transition: `guardian_notified` → `in_app_call` → `manual_verification`

On `guardian_notified`'s timeout (no decision received within its configured window, ADR-017 §2), the request transitions to `in_app_call` — not directly to `manual_verification`. On `in_app_call`'s own timeout (no decision received, and/or the in-app call attempt itself is unanswered — this design does not distinguish "call attempted and unanswered" from "call not attempted," since no SDD chapter defines a separate detection mechanism for the latter; both fall under the same timeout path), the request transitions to `manual_verification`. This restores the FR-007-literal, schema-literal ordering with no other change: `pending` → `father_notified` → `mother_notified` → `guardian_notified` → `in_app_call` → `manual_verification`, a parent/guardian decision remaining possible from *any* of these stages per ADR-016 (unaffected).

### 2. Corrected resolution: `expired` is staff-triggered only, from `manual_verification`, never by an automatic timer

**No automatic escalation-timer job ever transitions a request to `expired`.** The escalation chain's fully automated portion ends at `manual_verification` — consistent with FR-007's chain literally ending at "Manual process" with no further automated step named anywhere in the SDD. From `manual_verification`, resolution is exclusively staff-driven: reception may resolve the request via a decision (approved/rejected, recorded as a `manual_override` `leave_approval_events.event_type`, per ADR-015 — unaffected) or may explicitly mark it `expired`. This is evidenced by, not inferred from naming: `leave_requests_all_reception`'s RLS policy (`packages/db/src/schema/leave.ts`, re-verified for this ADR) already grants reception broad (`for: "all"`) access to any `leave_requests` row for students in their own hostel, un-gated by the row's current `status` at the SQL level — technically permitting a reception actor to transition a row to `expired` from `manual_verification`, consistent with `manual_verification` needing an explicit human resolution path (ADR-017 §9's still-valid claim) and SDD Ch.7 §7.2's dedicated **"Manual Verification Queue"** dashboard module (a queue implies a worked-through backlog, not a self-resolving timer). SDD Ch.5 §5.3's `"Guardian Notified -> Approved / Rejected / In-App Call / Manual Verification / Expired"` text is read, per ADR-017 §9's still-valid framing, as a compact summary of every state reachable from that point in the tree (not a claim that each is one automatic hop from `Guardian Notified` specifically) — `expired` being one such eventual, staff-triggered outcome is consistent with, not contradicted by, that reading.

**What this ADR does not claim**: no calendar-date-based expiry (e.g., a leave request's own `start_date`/`end_date` passing while still undecided) is evidenced anywhere in the SDD text available to this repository. This document does not invent one. If a future requirement needs date-based mootness handling independent of the escalation chain, that is a new, separate decision requiring its own ADR — not silently folded into this correction.

### 3. Corrected canonical state-transition diagram

```text
pending
  ├── decision (approve/reject, any linked parent/guardian, ADR-016) ──> approved / rejected (terminal)
  └── timeout ─────────────────────────────────────────────────────> father_notified
                                                                          ├── decision ──> approved / rejected
                                                                          └── timeout ──> mother_notified
                                                                                            ├── decision ──> approved / rejected
                                                                                            └── timeout ──> guardian_notified
                                                                                                              ├── decision ──> approved / rejected
                                                                                                              └── timeout ──> in_app_call
                                                                                                                                ├── decision ──> approved / rejected
                                                                                                                                └── timeout ──> manual_verification
                                                                                                                                                  ├── decision (any linked parent/guardian, ADR-016 — unaffected) ──> approved / rejected
                                                                                                                                                  ├── staff resolution (manual_override) ──> approved / rejected
                                                                                                                                                  └── staff marks expired ──> expired (terminal)
```

No automatic (timer-driven) edge leads to `expired` anywhere in this diagram. `expired` has exactly one path: explicit staff action from `manual_verification`.

### 4. Correction to ADR-017's "pg-boss Job Design" section

That section's sentence — *"Conditionally advances `leave_requests.status` per §4's invariant — to the next escalation stage, or (from `guardian_notified`) to `manual_verification` per §9"* — restates the same error corrected in §1 above and is superseded identically: the escalation-stage-evaluate job type transitions `guardian_notified` → `in_app_call` → `manual_verification` (two stage-advance hops, not one), and never transitions any stage to `expired` automatically — an `expired` transition is exclusively a staff-initiated write (through the existing `leave_requests_all_reception` RLS grant, or an equivalent Fastify-mediated reception action once one exists), never a scheduled job's own conditional update.

## Alternatives Considered

- **Leave ADR-017 §9 as originally written, treat the `in_app_call` omission as a harmless simplification** — rejected: it is not harmless. `in_app_call` is a real, named, evidenced stage in both FR-007 and the accepted schema; silently skipping it in the state machine would mean the eventual scheduler implementation either matches the (wrong) ADR text and genuinely skips a required stage, or matches the (right) schema/FR-007 and silently diverges from its own governing ADR — exactly the kind of undetected drift this repository's entire ADR-governance discipline exists to prevent.
- **Invent a concrete "absolute lifecycle bound" duration to make ADR-017 §9's original claim true** — rejected: this would manufacture a requirement with no source, the same failure mode this and every preceding design task in this domain has explicitly avoided (e.g., the escalation-interval and retry-policy values, correctly left as external product decisions rather than invented).
- **A date-based (`start_date`/`end_date`) expiry mechanism, independent of the escalation chain** — considered as a plausible real-world motivation for a state named "Expired," but rejected as this ADR's resolution: not evidenced by any SDD chapter read for this or any prior task in this domain. Recorded as a considered-but-not-adopted alternative, not silently folded in.
- **Silently edit ADR-017 §9's already-accepted text to fix the error** — rejected: violates this repository's ADR immutability rule for ACCEPTED decisions. This ADR's entire existence is the alternative to that shortcut.

## Rationale

The correction is derived from the exact same evidence ADR-017 §1, §2, and §9 already cited as authoritative (FR-007, the accepted schema enum, `DECIDABLE_STATUSES`) — this is not new evidence contradicting old evidence, but a case where the original ADR's own reasoning failed to apply its own cited sources consistently. Resolving `expired` as staff-only (not timer-triggered) is the reading that requires inventing nothing beyond what FR-007, SDD Ch.5 §5.3, SDD Ch.7 §7.2, and the existing RLS grant already establish, consistent with every other decision in this domain's preference for the minimum-invention resolution supported by direct evidence.

## Security Impact

None beyond ADR-016/ADR-017 (authorization unaffected). Slightly *narrows* the automated system's own write authority in practice (no scheduler job may ever write `expired`), which is a strictly more conservative posture than the original (under-specified) claim, not a weaker one.

## Data/Privacy Impact

None. No new field, table, or exposure.

## Migration Impact

None. This ADR changes no schema — it corrects which `leave_request_status` enum values a scheduler job may write to, using values that already exist.

## Rollback

No migration to roll back. If a future amendment finds a genuine, evidenced need for an automatic `expired` trigger (e.g., a later-added date-based mootness requirement), that is a new decision requiring its own ADR, following the same supersession discipline used here — not a reason to revert this correction.

## Consequences

- ADR-017 §9's original text remains in place, unedited, as the historical record — readers of ADR-017 must now cross-reference this ADR for the corrected sequencing, per the pointer added to ADR-017's Scope Note (a permitted addition, not a rewrite of Decision text).
- The eventual escalation-scheduler implementation has one fewer stage-transition to get wrong: the job design must implement `guardian_notified → in_app_call → manual_verification` as two distinct conditional-update hops, and must never include `expired` as a possible target of the timer-driven `leave-escalation-stage-evaluate` job type.
- `docs/leave-escalation-notification-design.md`'s Decision Matrix row 17 is updated to cite this ADR alongside ADR-017.

## Rejected Alternatives

All detailed above under "Alternatives Considered."

## Supersedes / Superseded by

**Supersedes ADR-017 §9's transition-sequencing claims only** (the `guardian_notified`→`manual_verification` direct-transition statement, and the unevidenced "absolute lifecycle bound" claim for `expired`) and the one restating sentence in ADR-017's "pg-boss Job Design" section. Does **not** supersede ADR-017 §1–§8, nor §9's separate, still-valid claim that `manual_verification` requires explicit staff action and is not auto-expiring on a per-stage timer. Not superseded by anything.

## Implementation Note (Reception-Initiated Parent Approval correction, added 2026-09-15/16)

This ADR corrects the stage-sequencing chain once escalation is underway — it says nothing about what triggers the first stage. That trigger point (previously: automatically at student leave-request creation) was separately corrected to an explicit Reception action; see [ADR-017](ADR-017-leave-escalation-orchestration-model.md)'s own Implementation Note and `docs/current-state.md`'s "Reception-Initiated Parent Approval correction" entry for the full account. This ADR's corrected `father_notified → mother_notified → guardian_notified → in_app_call → manual_verification` sequencing is unchanged and applies identically once escalation is started, however it is started. No contradiction of this ADR's Decision/Context/Consequences exists, so no further supersession was required. Added per `docs/adr/README.md`'s explicit allowance for "adding implementation references" to an accepted ADR.
