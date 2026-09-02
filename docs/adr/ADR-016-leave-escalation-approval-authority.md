# ADR-016: Leave Escalation Approval-Authority Model

- **ADR ID:** ADR-016
- **Title:** Leave Escalation Approval-Authority Model
- **Status:** ACCEPTED
- **Date:** 2026-09-02
- **Accepted:** 2026-09-02, in the "Resolve Leave Escalation Decisions — Final Governance Gate" task. No new evidence emerged that contradicts the analysis below; the Decision, Alternatives, Rationale, and Consequences sections are preserved exactly as originally proposed, per this repository's ADR governance (`docs/adr/README.md` — "An ADR that is still PROPOSED may be refined before acceptance"; nothing below was rewritten at acceptance, only this metadata block was updated).
- **Related ADRs:** ADR-002 (Database Domain Model), ADR-010 (Notification Architecture), ADR-011 (Background Job Architecture), ADR-014 (Supabase Auth), ADR-015 (Approval Workflow Data Model), ADR-017 (Leave Escalation State-Machine — depends on this ADR's decision), ADR-018 (Notification Delivery Reliability). Does not supersede any of these — it resolves a question none of them decided.
- **Related design record:** `docs/leave-escalation-notification-design.md` (full Decision Matrix, Decision Area 1)

## Context

The Parent Leave Approval workflow (`docs/leave-approval-workflow.md`) was implemented and hardened before an escalation scheduler existed. During that work, `LeaveService.decide()`/`DrizzleLeaveRepository.decide()` was deliberately built so that **any parent/guardian with a `parent_student_relationships` link to the request's student may decide it while it is in a decidable status** (`pending`, `father_notified`, `mother_notified`, `guardian_notified`, `in_app_call`, `manual_verification`), regardless of `relationship_type` or `escalation_order`. This was tested and verified, including a dedicated proof that a `relationship_type: "guardian"` row decides identically to `"father"`/`"mother"`.

Separately, two earlier design documents — `docs/rls-policy-matrix.md` and `docs/database-schema-design.md` — stated (in text written during the database-schema-design task, before the leave-approval workflow was actually built) that Fastify would restrict a decision to "the party matching the current escalation step." This was never implemented, was never the subject of an ADR, and the hardening task's own verification pass discovered the contradiction and corrected the two documents' text to describe reality — while explicitly declining to change code, since resolving *which* behavior is correct is an architectural decision, not a documentation fix.

No accepted ADR, and no SDD chapter, states which of these two behaviors is actually required. SDD Ch.5 (Parent Leave Approval Module) and SDD Ch.10 (Parent Mobile Application) both describe the approval action generically ("Parent selects Approve or Reject... Backend records decision") without ever saying "only the currently-notified parent" or "any linked parent." FR-007 and ADR-010/ADR-011 describe the escalation chain purely as a **notification-ordering** mechanism ("Father notified... Timeout -> Mother -> Guardian"), not as an authorization gate.

This decision must be made before an escalation scheduler is built, because the scheduler's own correctness depends on it: if authority should be stage-restricted, the scheduler's job design must include an authority-enforcement mechanism the current `decide()` path doesn't have; if authority should remain relationship-based (as currently built), the scheduler can be added with **zero change** to `decide()`.

## Decision

**ACCEPTED: Model C — escalation controls notification priority/ordering only; approval authority remains relationship-based.** Any parent/guardian linked to the student via `parent_student_relationships` may approve or reject a leave request in any decidable status, exactly as already implemented. The escalation chain determines **who gets contacted, and in what order/urgency**, not **who is permitted to decide**.

This decision requires no code change — it ratifies the behavior already built, tested, and verified in the prior two tasks.

## Alternatives Considered

- **Model A — any authorized linked parent/guardian may decide while pending** (as literally stated in this ADR's title option list): functionally identical to Model C for the purposes of this decision, since "while pending" in Model A's framing and "in any decidable status" in the actual implementation both mean "not yet terminal." Model A is effectively the same behavior as Model C described from the caller's perspective rather than the escalation-chain's perspective. Not rejected — folded into the Model C decision above, since the distinction is one of framing, not behavior.
- **Model B — escalation-stage authority: only the currently active escalation contact may decide.** Rejected for this proposal. Reasons:
  1. **No source support.** Neither the SDD nor any accepted ADR states this restriction; it appears only in two design documents whose text predates (and was never reconciled with) the actual leave-approval implementation task.
  2. **Introduces an unresolved sub-problem.** The schema's `parent_student_relationships` has no uniqueness constraint on `(student_id, relationship_type)` — nothing prevents a student having two rows with `relationship_type = 'father'` (e.g. a data-entry correction, or a genuinely unusual family structure). Model B would require deciding "which specific row is *the* current-stage contact," a question this repository's data model does not currently answer, and building that answer would be new, unreviewed schema/authorization design layered on top of an already-uncertain product requirement.
  3. **New reliability failure mode.** If "the current contact" is ever computed incorrectly (a real risk given point 2), a legitimate parent's decision would be wrongly rejected — a regression against the currently-verified, currently-passing behavior with no compensating security benefit (see Security Impact below).
  4. **Contradicts the escalation chain's own stated purpose.** The whole point of "Father → Mother → Guardian → In-app call → Manual" (FR-007) is to keep trying until *someone* responds. Restricting decision authority to only the currently-buzzing contact directly works against that goal: if the Father is mid-response when the system escalates to Mother, Model B would reject his decision and force a second round-trip through Mother or Guardian, actively delaying the safety-relevant outcome the feature exists to produce.

## Rationale

Model C is recommended because it is (a) the only option with any existing implementation and test coverage, (b) not contradicted by any accepted source, (c) strictly more permissive/available without being less secure (the same device-trust + biometric-freshness + relationship-check gates apply regardless of which linked parent acts), and (d) avoids inventing new schema/authorization complexity (the `(student_id, relationship_type)` uniqueness problem) to solve a restriction nothing in the product specification actually asked for.

## Security Impact

No material change from today's already-hardened, already-security-reviewed behavior. Relationship authorization is still enforced live against PostgreSQL (`parent_student_relationships`), device trust is still required (`requireActiveTrustedDevice`), biometric-freshness confirmation is still required, and the anti-enumeration/relationship-not-role authorization pattern is unchanged. Model B's narrower authority window was evaluated and found to add no compensating security benefit (a stage-restricted attacker still needs to pass the same device/biometric gates as an unrestricted one) while introducing a new, unresolved multi-contact-per-relationship-type ambiguity.

## Data/Privacy Impact

None. No new field, no new exposure. Escalation stage (`leave_requests.status`) remains visible only to the same parties who can already see it today.

## Migration Impact

None — this ADR, if accepted as proposed, requires zero schema migration and zero code change, since it ratifies already-built, already-tested behavior.

## Rollback

Trivial in principle (no migration to roll back), but note: if this ADR is later superseded to adopt Model B instead, that would be a genuine behavior change to an already-shipped, already-tested API and would need its own supersession-impact analysis (per `docs/adr/README.md`) covering the `(student_id, relationship_type)` uniqueness question raised above before implementation.

## Consequences

- The escalation scheduler (ADR-017) can be built without adding any authority-enforcement mechanism beyond what `decide()` already has.
- `docs/rls-policy-matrix.md` and `docs/database-schema-design.md`'s already-corrected text (from the hardening task) is now the accepted design, not merely a "verified stale claim, corrected" footnote — both documents' correction notes have been updated (in the task that accepted this ADR) to state the current implementation matches accepted design, rather than describing an unresolved discrepancy.
- If a future stakeholder requirement genuinely demands stage-restricted authority (Model B), that is a new, separate decision requiring a superseding ADR with full supersession-impact analysis (`docs/adr/README.md`) — not a casual rewrite of this ADR's text.

## Consequences If Rejected (Model B adopted instead)

- `decide()`/`DrizzleLeaveRepository.decide()` would need a new authorization check comparing the acting parent's `relationship_type`/`escalation_order` against the request's current `status`.
- The `(student_id, relationship_type)` uniqueness question would need to be resolved first (likely via a new unique constraint or an explicit "primary contact per type" concept — out of scope for this ADR).
- Existing passing tests that verify "any linked parent, regardless of relationship_type, may decide" (`repository.integration.test.ts`'s guardian tests, `service.test.ts`'s relationship tests) would need to be rewritten to assert the opposite behavior — a deliberate, reviewed change, not an incidental one.

## Rejected Alternatives

Model B, as detailed above.

## Supersedes / Superseded by

None — this is a new decision, not a change to any existing accepted ADR's text.
