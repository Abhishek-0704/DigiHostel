# ADR-025: Parent Decision Authority Excludes `pending` (Reception-Initiated Parent Approval Correction)

- **ADR ID:** ADR-025
- **Title:** Parent Decision Authority Excludes `pending` (Reception-Initiated Parent Approval Correction)
- **Status:** ACCEPTED
- **Date:** 2026-09-16
- **Accepted:** 2026-09-16, as part of the "Reception-Initiated Parent Approval correction" task, which found that a student-created leave request beginning the parent-approval/escalation lifecycle automatically (no Reception review step) was a genuine product/architecture defect and corrected it. That correction's backend implementation directly contradicts [ADR-016](ADR-016-leave-escalation-approval-authority.md)'s own accepted Decision text (see Context below) — this ADR performs the required supersession before ratifying the already-implemented change, per `docs/adr/README.md`'s Implementation Rule ("If a contradiction exists, STOP implementation... perform supersession impact analysis... create the new ADR... mark the old ADR superseded... only then implement"). The code change was made in the same task that authored this ADR; this ADR is being added to bring governance into alignment with that implementation, not merely as a paper exercise after the fact went unnoticed — see §"Sequencing Note" below for the honest account of that ordering.
- **Related ADRs:** [ADR-016](ADR-016-leave-escalation-approval-authority.md) (Leave Escalation Approval-Authority Model — **partially superseded by this ADR**, see below), [ADR-017](ADR-017-leave-escalation-orchestration-model.md) (Leave Escalation State-Machine — its own Implementation Note added by the same correction task cross-references this ADR), [ADR-018](ADR-018-notification-delivery-reliability.md) (Notification Delivery Reliability — same cross-reference), [ADR-019](ADR-019-leave-escalation-state-sequencing-correction.md) (State-Sequencing Correction — same cross-reference), ADR-015 (Approval Workflow Data Model — `leave_requests.status`/`leave_approval_events` architecture reused unchanged by this correction).
- **Related design record:** none new — see `docs/current-state.md`'s "Reception-Initiated Parent Approval correction" entry and `apps/reception-dashboard/docs/parent-approval-session.md` §0/§16 for the full implementation account this ADR ratifies.

## Sequencing Note (recorded honestly, not glossed over)

The backend implementation of this correction (`PARENT_DECIDABLE_STATUSES` in `apps/api/src/domain/leave/types.ts`, excluding `pending` from what `decide()` accepts) was written before this ADR was authored, in the same task. On discovering, during documentation cleanup, that ADR-016's own accepted text explicitly lists `pending` as a "decidable status" any linked parent may act on (`ADR-016` §Context, §Decision), this was recognized as a real governance-process gap: the correct order per `docs/adr/README.md` is impact-analysis → new ADR → mark old ADR superseded → *then* implement, and that order was not followed for this one specific consequence of the correction. This ADR is added to close that gap immediately upon discovery, following the exact content/process ADR-016's own "Consequences If Rejected"/"Rollback" sections already anticipated for "a future stakeholder requirement" reopening this area. Every other part of the Reception-Initiated Parent Approval correction (the `send-for-parent-approval` endpoint, the trigger-point change itself, the frontend corrections) was independently confirmed to contradict no accepted ADR's Decision text (see ADR-017/018/019's own Implementation Notes) and needed no supersession.

## Context

[ADR-016](ADR-016-leave-escalation-approval-authority.md) (ACCEPTED, "Model C") decided that **decision authority is relationship-based, not escalation-stage-restricted**: any parent/guardian linked to the student via `parent_student_relationships` may approve or reject a leave request while it is in "any decidable status," which ADR-016's own Context section (§Context, first paragraph) explicitly enumerates as `pending, father_notified, mother_notified, guardian_notified, in_app_call, manual_verification` — a list that **includes `pending`**.

The Reception-Initiated Parent Approval correction (this same task) found that a student-created leave request automatically entering the parent-approval/escalation lifecycle at creation — with no Reception review step — was a genuine product defect: a parent should never be able to act on a request Reception has not yet reviewed and explicitly sent for parent approval, even though (under the old, now-corrected behavior) `pending` already technically permitted a parent decision because escalation started immediately anyway. Once escalation no longer starts automatically at creation, `pending` stops meaning "the escalation chain's first stage, already in flight" and starts meaning "not yet sent for parent approval by Reception at all" — a materially different state that must not be decidable by anyone, regardless of `relationship_type`.

This directly contradicts ADR-016's literal accepted text (`pending` is named as decidable), even though it does **not** reopen or reverse ADR-016's actual Model A/B/C authority question — no `relationship_type`- or `escalation_order`-based restriction is introduced here. The new rule is orthogonal to that question: it narrows the set of *statuses* in which *any* linked parent (under Model C's still-unchanged relationship-based rule) may act, for a reason ADR-016 never considered because ADR-016 was decided before the "does escalation start automatically at creation" question was itself revisited.

## Decision

**ACCEPTED: `pending` is removed from the parent-decidable status set, uniformly for every relationship type — Model C's relationship-based authority rule is otherwise unchanged and is not reopened by this ADR.**

Concretely: `PARENT_DECIDABLE_STATUSES` (`apps/api/src/domain/leave/types.ts`) is `DECIDABLE_STATUSES` (the escalation-chain-ordering vocabulary ADR-017 still owns, unchanged) minus `"pending"`. `LeaveRepository.decide()` now checks membership in `PARENT_DECIDABLE_STATUSES`, not `DECIDABLE_STATUSES`. Any parent/guardian linked to the student may still decide a request in `father_notified`/`mother_notified`/`guardian_notified`/`in_app_call`/`manual_verification` — identically to before, with zero `relationship_type`/`escalation_order` distinction, exactly as Model C requires. The only change is that `pending` is no longer in that set for **any** caller.

This is not Model B (stage-restricted authority to a single currently-active contact) — every linked parent remains equally authorized the instant the request leaves `pending`. It is better understood as narrowing the *domain* of decidable statuses Model C's rule applies over, in response to a fact about when escalation begins that did not exist at the time ADR-016 was decided (escalation used to begin at `pending` itself; it now begins only when Reception explicitly starts it, one stage later, at `father_notified`).

## Alternatives Considered

- **Leave `pending` in `PARENT_DECIDABLE_STATUSES`, rely only on `LeaveRepository.create()` no longer scheduling an escalation job to make `pending` practically unreachable-by-parent.** Rejected: a `pending` request is still fully readable and identifiable by a linked parent (`findAccessibleLeaveRequest`, unchanged), and nothing prevented a parent from independently constructing a valid `biometricAssertion`/`decide()` call against a `pending` request's real id before Reception ever reviewed it — relying on "no notification was sent, so no parent would think to try" is not an authorization boundary. Removing `pending` from the checked set closes this at the same layer (`decide()`'s own conditional `WHERE` clause) every other status-based authorization decision in this codebase already uses, rather than depending on an absence of notification as an implicit access control.
- **Introduce a new, separate `leave_requests.status` value (e.g. a `not_sent`/`draft` status distinct from `pending`) instead of reinterpreting `pending`'s own meaning.** Rejected per this task's own explicit constraint against inventing new schema/status complexity where the existing vocabulary already suffices, and per ADR-015's established principle that `leave_requests.status` is the single source of truth for lifecycle state — `pending` already existed, was never previously defined narrowly enough to preclude this reinterpretation, and reusing it avoids a schema migration, a new enum value every consumer (Parent App, Reception Dashboard, RLS policies, pgTAP) would need to learn, and a second "is this really pending" ambiguity.
- **Revisit ADR-016's Model A/B/C question itself (e.g. adopt Model B) instead of narrowing the decidable-status domain.** Rejected: the underlying reason `pending` must now be excluded (Reception hasn't reviewed the request yet) has nothing to do with *which linked parent* should be authorized once the request is actually sent for parent approval — that question remains correctly answered by Model C, unchanged. Conflating the two would have reopened a settled, well-reasoned decision (ADR-016's Rationale/Security Impact sections, both still fully valid) to solve an unrelated problem.

## Rationale

Reuses ADR-016's own established reasoning (relationship-based, not stage-restricted, authority) unchanged for the reduced status domain that now applies — the only new argument this ADR contributes is that `pending`'s real-world meaning changed as a direct, deliberate consequence of the Reception-Initiated Parent Approval correction, and ADR-016's literal text (written before that correction existed) did not anticipate it. Closing the gap at the database-query layer (`decide()`'s own `WHERE` clause), rather than relying on the absence of a notification/escalation job as an implicit access control, matches this codebase's consistent pattern of treating `leave_requests.status` itself as the authorization boundary, not a side effect of whether a job happened to run.

## Security Impact

Closes a genuine, if narrow, authorization gap: before this ADR (and its implementation), a parent who somehow learned a `pending` leave request's id (e.g. via the same device/account as the student, log access, or simple guessing against a small id space) could have called `decide()` against it directly, bypassing Reception's review entirely — the biometric/device-trust/relationship gates ADR-016's Security Impact section describes were never in question, but the *status* gate was absent for `pending`. No new attack surface is introduced; this is strictly a narrowing of what `decide()` accepts.

## Data/Privacy Impact

None. No new field, no new exposure — identical to ADR-016's own "None" here.

## Migration Impact

None — no schema/migration change. `PARENT_DECIDABLE_STATUSES` is a pure application-code (TypeScript) derivation from the existing `leave_request_status` enum; no RLS policy references a "decidable status" list at all (RLS scopes by relationship/hostel, not by status), so no database-layer change was needed to enforce this.

## Rollback

Trivial: reverting `PARENT_DECIDABLE_STATUSES` to include `"pending"` (i.e. reverting to `DECIDABLE_STATUSES`) restores the prior behavior exactly, with no data migration, as long as the Reception-Initiated Parent Approval correction's own trigger-point change (`LeaveRepository.create()` no longer auto-scheduling escalation) is also reverted in the same rollback — reverting only this ADR's clause while keeping the corrected trigger point would reintroduce a request stuck `pending` that a parent could nonetheless decide, which is exactly the gap this ADR closes.

## Consequences

- `decide()`'s authorization boundary now correctly reflects `pending`'s corrected meaning ("not yet sent for parent approval") — a parent cannot decide a request Reception has not yet reviewed, closing the gap identified in Context.
- ADR-016's Model C decision (relationship-based, not stage-restricted, authority) is otherwise completely unaffected and remains this repository's authoritative answer to "which linked parent may decide" — this ADR narrows *when* (by status), never *who*.
- Existing tests asserting "any linked parent, regardless of relationship_type, may decide" (`repository.integration.test.ts`'s guardian tests, `service.test.ts`'s relationship tests) remain valid and passing unchanged, since they exercise decidable (non-`pending`) statuses — only tests that previously seeded `pending` and expected an immediate successful decision needed updating (done in the same task; see the leave domain test suites).
- If a future requirement needs `pending` reachable by parents again (e.g. a product decision to let a parent "pre-approve" before Reception review), that would require its own supersession-impact analysis against *this* ADR, not a casual code revert.

## Consequences If Rejected

- `PARENT_DECIDABLE_STATUSES` would not exist; `decide()` would continue checking `DECIDABLE_STATUSES` (including `pending`), and a parent could decide a request Reception has not yet reviewed the moment `LeaveRepository.create()` returns — reopening exactly the gap the Reception-Initiated Parent Approval correction set out to close, since blocking automatic escalation alone (the trigger-point change) would not, by itself, prevent a parent-initiated decision against a still-`pending` request.

## Rejected Alternatives

Covered above under "Alternatives Considered" — no option was rejected as a full alternative decision (all three considered a narrower implementation detail, not a different authority model).

## Supersedes / Superseded by

**Supersedes [ADR-016](ADR-016-leave-escalation-approval-authority.md) — narrowly, only the specific claim that `pending` is a status any linked parent may decide** (the one clause in ADR-016's Context and Decision sections listing `pending` inside "any decidable status"). ADR-016's actual Decision — Model C, relationship-based authority, no escalation-stage restriction — is **not** superseded and remains this repository's accepted answer to that question; ADR-016's Alternatives/Rationale/Security Impact sections evaluating Model A/B/C remain fully valid and are preserved unedited, per the ADR immutability rule (see the superseded-in-part notice added to ADR-016 itself, mirroring the exact pattern ADR-019 already established for its own partial supersession of ADR-017 §9).

Not superseded by anything.

## Supersession Impact Analysis (required before acceptance, `docs/adr/README.md`)

- **Specification impact**: none — the SDD never specified whether `pending` is parent-decidable; this was always an implementation/ADR-level detail (ADR-016 itself, §Context).
- **Documentation impact**: ADR-016 (superseded-in-part notice added below, unedited otherwise); `docs/current-state.md`'s "Reception-Initiated Parent Approval correction" entry already documents this; `apps/reception-dashboard/docs/parent-approval-session.md` §16.2 already describes `PARENT_DECIDABLE_STATUSES` as the corrected boundary.
- **Code impact**: `apps/api/src/domain/leave/types.ts` (`PARENT_DECIDABLE_STATUSES`, already added), `apps/api/src/domain/leave/repository.ts` (`decide()`'s `WHERE` clause, already updated), `apps/api/src/domain/leave/__fixtures__/fake-repository.ts` (mirrored, already updated) — all implemented in the same task this ADR ratifies; no further code change is required by this ADR.
- **Database impact**: none (see Migration Impact above).
- **API impact**: `POST /leave-requests/{id}/approve|reject` now return `409 conflict` (with `currentStatus: "pending"`) instead of succeeding, for a `pending` request — a behavior change already reflected in `packages/api-spec/openapi.yaml`'s description text for these operations and in the generated client/Zod artifacts (already regenerated in this task).
- **Security impact**: covered above under Security Impact — strictly closes a gap, introduces no new surface.
- **Deployment impact**: none — no infrastructure, environment, or CI/CD change.
- **Migration impact**: none (see above).
- **Rollback impact**: covered above under Rollback — safe, but must be paired with reverting the trigger-point change too, as explained there.
