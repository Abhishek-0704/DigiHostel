# ADR-018: Notification Delivery Reliability & Idempotency

- **ADR ID:** ADR-018
- **Title:** Notification Delivery Reliability & Idempotency
- **Status:** ACCEPTED
- **Date:** 2026-09-02
- **Accepted:** 2026-09-02, in the "Resolve Leave Escalation Decisions — Final Governance Gate" task, which finalized the items originally left open (recording-failure recovery, invalid/expired token handling, multi-device fan-out, push content/privacy) and confirmed the dependency on ADR-017 §5 (notification identity — `notifications.stage`) is now satisfied by ADR-017's own acceptance. Per `docs/adr/README.md`, pre-acceptance refinement of a still-`PROPOSED` ADR is explicitly permitted; the exact retry-count/backoff numeric values remain outside this ADR's scope (a product/operational decision, not architectural) and do not block acceptance. A later consistency-correction task tightened this ADR's notification-identity wording, fixed stale cross-references to ADR-017's section numbers (left over from a prior renumbering), and explicitly distinguished the three provider-outcome cases in §5 — none of these changed this ADR's substance or required reopening its `ACCEPTED` status.
- **Related ADRs:** ADR-010 (Notification Architecture — this ADR fills in delivery-reliability mechanics ADR-010 left unspecified), ADR-011 (Background Job Architecture — pg-boss selection this ADR builds on, not changes), ADR-016 (Leave Escalation Approval-Authority Model — accepted, unaffected by this ADR), ADR-017 (Leave Escalation State-Machine — accepted, §9 partially superseded by ADR-019 (unrelated to this ADR's own dependency); the Leave Approval Service's complementary ADR, split from an earlier, broader draft of ADR-017; this ADR depends on ADR-017 §5's `notifications.stage` decision; neither supersedes the other), ADR-019 (Leave Escalation State-Sequencing Correction — corrects ADR-017 §9 only, does not affect this ADR).
- **Related design record:** `docs/leave-escalation-notification-design.md` (Decision Matrix rows 9, 10, 12–13, 15, 24)

## Context

SDD Ch.11 §11.3 assigns "Push delivery, retries, escalation timers" to the **Notification Service**, distinct from the Leave Approval Service (ADR-017). ADR-010 already decided Expo Push with backend-owned orchestration and retry-with-backoff-then-escalate; ADR-011 already decided pg-boss and mandated idempotent, must-not-double-notify job processing. Neither specifies the retry schedule, duplicate-send prevention, recording-failure recovery, invalid-token handling, or multi-device behavior. This ADR resolves all of them.

## Decision

**ACCEPTED.**

### 1. Notification identity

**A logical notification is uniquely identified by `(leave_request_id, stage, recipient_id)`** — one logical notification per escalation stage per intended recipient, using ADR-017 §5's already-accepted `notifications.stage` column (mirroring the `leave_request_status` enum value) plus the existing `related_leave_request_id`/`recipient_id` columns, with a uniqueness constraint on the triple. This is deliberately **not** `(leave_request_id, escalation_generation, recipient_id, notification_type)` as the task prompt's own example suggested — no separate `generation`/`notification_type` concept is introduced, since `stage` already disambiguates unambiguously (ADR-017 §5's rationale for rejecting a parallel generation counter) and this domain has exactly one notification *type* (a leave-approval push) today, so a `notification_type` field would be a speculative field with a single possible value. **`stage` identifies the logical escalation notification (which stage's contact this notification is for) — it does not, and is not intended to, identify an individual provider delivery attempt; delivery attempts within one logical notification are distinguished by `retry_count`, not by a separate identity (see §2).**

### 2. Delivery attempts, retries, failure, success — defined, not conflated

- **Logical notification**: one row in `notifications`, identified per §1. Created once, when a stage begins.
- **Delivery attempt**: one execution of "call the Expo Push API for this logical notification's recipient." A logical notification may have many delivery attempts (tracked via the existing `notifications.retry_count`, incremented per attempt, not via additional rows).
- **Retry**: a subsequent delivery attempt for the same logical notification (same row, `retry_count` incremented), scheduled after a failed attempt, up to the retry policy in §3.
- **Failed delivery**: the push provider rejects the attempt, or returns an error, or the attempt exhausts its retries (§3) — the row transitions to `notifications.status = 'failed'` (existing enum value).
- **Successful delivery**: the push provider accepts the attempt for the recipient — the row transitions to `notifications.status = 'sent'`, then to `'delivered'` if/when a delivery receipt is separately available (existing enum value, already accommodates this).

### 3. Retry policy — mechanism resolved, numeric values explicitly not

**Mechanism**: configurable retry count and backoff (fixed or exponential — not decided which, since no source specifies one and both are equally simple to implement; left as an implementation-time choice within "configurable," not a distinct open architectural question). **A delivery failure that exhausts its configured retries causes escalation to proceed** (ADR-010's already-accepted "retry then escalate" behavior — this ADR does not change that outcome, only names the mechanism producing it: the `notifications` row reaching `status = 'failed'` after exhausting retries is treated identically to a stage timing out with no response, feeding into ADR-017's already-resolved stage-advance path). **Permanent failure condition**: retries exhausted, or the push token is confirmed invalid (§4) — either causes immediate `'failed'` status without waiting for further retries. **The exact retry count and backoff schedule/window are explicitly not decided by this ADR** — `docs/leave-escalation-notification-design.md` Decision Area 9, classified `PROPOSED — PRODUCT DECISION REQUIRED` (operational tuning, not architecture), does not block this ADR's acceptance for the same reason ADR-017's interval value doesn't block ADR-017's acceptance.

### 4. Send-level idempotency and deduplication

At-least-once delivery with mandatory idempotent processing (ADR-011, restated for the send operation specifically). Before calling Expo Push for a given logical notification, a worker performs a conditional write against that `notifications` row (e.g., only proceed if `status` is still `queued`/`failed`-with-retries-remaining, transitioning it as part of the same operation) — the same conditional-update discipline as ADR-017 §4, now possible because §1's `(leave_request_id, stage, recipient_id)` identity is well-defined. Two workers racing to send the same logical notification: only one's conditional write commits; the other must no-op and must not call the push provider — resolves the "two workers, same notification" scenario deterministically, symmetric to ADR-017 §4's decision-vs-escalation resolution.

### 5. Provider-outcome handling — three cases, explicitly distinguished

Every delivery attempt's outcome falls into exactly one of three cases, resolved identically by the same at-least-once/idempotent model (no case requires a different mechanism, only a different resulting `notifications.status`):

- **Case 1 — provider definitely rejected** (Expo Push returns an explicit error, e.g. invalid token — see §6): the attempt is a definite failure. The row's retry/permanent-failure handling (§3) applies immediately — no ambiguity, no uncertain state.
- **Case 2 — provider definitely accepted, but the worker crashes before recording it**: the push was genuinely sent; only the local bookkeeping (`status = 'sent'`) is missing. The `notifications` row remains at its prior status (`queued`, or mid-retry), and pg-boss's native redelivery (ADR-017 §8's crash-recovery reasoning) causes another delivery attempt for the same logical notification. This produces a duplicate *push* (the recipient may see two notifications for the same stage) but never a duplicate *state* mutation — an accepted, disclosed trade-off under the already-established at-least-once model (ADR-011), not a correctness bug.
- **Case 3 — provider outcome is unknown** (e.g. a network timeout mid-request, where the worker cannot determine whether Expo Push received and processed the call before the connection failed): **resolved identically to Case 2, not as a separate mechanism.** The system does not attempt to distinguish "definitely accepted, recording lost" from "outcome genuinely unknown" — both are treated as "assume not yet delivered, retry" under the same at-least-once model, and a retry under genuine uncertainty is explicitly **potentially duplicative**, tolerated for the same reason a Case 2 retry is tolerated. **This is the specific reason this design never claims exactly-once external push delivery** (§ Data/Privacy Impact, and the design record's Decision Area 10): an unknown-outcome case can only be resolved into "retry (risking a duplicate)" or "give up (risking a missed notification)," and this design chooses retry, bounded by the same retry-count/backoff policy as any other failure (§3) — after which it escalates via the ordinary retries-exhausted path, exactly as any other permanent failure would.

**No additional reconciliation mechanism is used for any of the three cases.** Immediate reconciliation against Expo Push's delivery-receipt API on every send was evaluated and rejected as the default (Alternatives Considered) — an unconditional extra network dependency for cases the existing model already tolerates by design.

### 6. Invalid/expired push tokens

**Resolved**: an invalid or expired push token, discovered at send time, causes that delivery attempt to fail and the `notifications` row to move toward `'failed'` per §3's retry/permanent-failure rules — treated as an ordinary delivery failure (ADR-010's retry-then-escalate), not a special case. **A push-token failure does NOT automatically revoke the associated `trusted_devices` row.** Device revocation (`trusted_devices.revoked_at`) is, per the existing accepted model (ADR-014, `docs/auth-database-security-model.md` §6), an explicit security action (user-initiated device removal, or admin/incident-driven revocation) — a token going stale is a routine technical/operational event (app reinstall, OS-level token rotation), not evidence of device compromise or loss of trust, and conflating the two would incorrectly treat a benign event as a security incident.

### 7. Multi-device fan-out

**Resolved: simultaneous fan-out to every currently-trusted (non-revoked) device, not sequential, and not treated as separate logical notifications.** `trusted_devices` already supports multiple devices per parent (SDD Ch.4 §4.3, implemented). Per §1, one logical notification exists per `(leave_request_id, stage, recipient_id)` regardless of how many devices that recipient has — **fan-out to multiple devices is a property of one delivery attempt** (a single Expo Push call may address multiple tokens for the same recipient in one batch), not a reason to create additional `notifications` rows or add a device-identifying column to that table. A delivery attempt is considered successful if the provider accepts the push for **at least one** of the recipient's currently-trusted devices — matching the escalation chain's own "reach someone quickly" purpose (the same reasoning ADR-016 already applied to justify relationship-based, not stage-restricted, approval authority): the goal is reaching the parent, not exhaustively confirming every device. Sequential per-device attempts were considered and rejected — added latency for no stated benefit, when Expo Push already supports batched multi-token sends.

### 8. Push notification content — privacy

**Resolved.** Consistent with Privacy by Design (SDD Ch.17.4.7) and DPDP purpose-limitation (Ch.17.4.6), and extending the same reasoning already applied to escalation-state visibility (`docs/leave-escalation-notification-design.md` row 20): a lock-screen-visible notification (title + body) **may** reference the student (name or roll number — already-accepted, non-sensitive per the existing data classification in `docs/database-schema-design.md`) and a call to action ("has a pending leave request awaiting your response"). It **must not** name, describe, or otherwise reveal any other parent/guardian (who else was or will be contacted, their relationship type, whether they responded, or any contact detail), must not describe internal escalation-stage/scheduler state, and must not include any token, credential, or biometric-adjacent content. An in-app notification (once opened) may show the request's own `status`/dates/reason — data the recipient is already authorized to see per existing RLS — but still never another parent's identity.

## Alternatives Considered

- **Fixed, hard-coded retry count/backoff** — rejected: no source specifies a value; hard-coding one would manufacture a requirement.
- **No send-level conditional write (rely solely on pg-boss `singletonKey`)** — rejected: doesn't protect against a job that re-executes after a partial crash mid-send.
- **Immediate reconciliation against Expo Push's delivery-receipt API for every send** — rejected as the default (§5); the at-least-once model already tolerates the failure case this would catch, at the cost of an unconditional extra dependency.
- **Automatically revoking a device on push-token failure** — rejected (§6): conflates a routine technical event with a security-relevant action, contradicting the existing device-trust model's own distinction (ADR-014).
- **Sequential per-device notification attempts** — rejected (§7): unjustified latency versus simultaneous fan-out, given Expo Push's native multi-token batch support.
- **A composite `(leave_request_id, generation, recipient_id, notification_type)` identity, as suggested in the task prompt's own example** — evaluated and rejected in favor of `(leave_request_id, stage, recipient_id)` (§1): no `generation` concept exists elsewhere in this design (ADR-017 §5 deliberately avoided introducing one), and `notification_type` has exactly one value in the current domain, so including it would be a speculative field.

## Rationale

Every mechanism resolved here either directly extends an already-accepted ADR's stated requirement (ADR-010's retry-then-escalate, ADR-011's idempotency mandate) or mirrors the now-accepted ADR-017 pattern (conditional-write correctness, reach-someone-quickly reasoning from ADR-016) applied to the send-operation side, per the SDD's own service boundary (Ch.11 §11.3).

## Security Impact

None beyond ADR-016 (authorization, unaffected). §6's device-revocation-is-a-distinct-action decision is itself a security-relevant clarification: it prevents an attacker from being able to trigger device revocation merely by interfering with push delivery (e.g., causing tokens to appear invalid), since token failure alone never revokes trust.

## Data/Privacy Impact

§8 resolves the previously-flagged, genuinely open push-content question — no other parent's identity/contact may appear in any notification. No new column stores additional personal data beyond what §1's identity tuple already requires (`recipient_id`, already an existing column).

## Migration Impact

**None beyond what ADR-017 §5 already specifies** (the `notifications.stage` column and its uniqueness constraint) — this ADR adds no further schema requirement (no device-identifying column, per §7's resolution that fan-out is a delivery-attempt detail, not a schema-level concern).

## Rollback

No migration created by this ADR itself (inherits ADR-017 §5's, not yet created). If the retry/idempotency mechanism proves insufficient in practice, that is an amendment to this ADR, not a rollback.

## Consequences

- The eventual notification-worker implementation has a complete, concrete mechanical design for the send-reliability half of the problem, resolved symmetrically to ADR-017's state-mutation half.
- This ADR's §4 conditional-write mechanism is implementable as soon as ADR-017 §5's `notifications.stage` migration exists — that dependency is explicit and tracked (ADR-017's Migration Impact section), not hidden.
- Push-token handling, multi-device fan-out, and content privacy — previously flagged as open gaps — are now fully resolved; only the retry-count/backoff numeric values remain external to this ADR.

## Rejected Alternatives

All detailed above under "Alternatives Considered."

## Supersedes / Superseded by

None — refines and completes this ADR's own previously-`PROPOSED` content before acceptance (explicitly permitted); does not supersede ADR-017 (whose state-mutation content is unchanged) or any other ADR.

## Implementation Note (Reception-Initiated Parent Approval correction, added 2026-09-15/16)

This ADR governs notification delivery/retry/idempotency mechanics once a notification job is enqueued — it does not decide when the first one is enqueued. That trigger point (previously: automatically at student leave-request creation) was corrected to an explicit Reception action (`POST /leave-requests/{id}/send-for-parent-approval`) for reasons unrelated to this ADR's own concerns — see [ADR-017](ADR-017-leave-escalation-orchestration-model.md)'s own Implementation Note and `docs/current-state.md`'s "Reception-Initiated Parent Approval correction" entry for the full account. This ADR's retry policy, idempotency mechanism, and delivery-outcome handling are unchanged and apply identically to every notification job scheduled after this correction. No contradiction of this ADR's Decision/Context/Consequences exists, so no supersession was required. Added per `docs/adr/README.md`'s explicit allowance for "adding implementation references" to an accepted ADR.
