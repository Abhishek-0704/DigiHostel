# ADR-017: Leave Escalation State-Machine & Race Resolution

- **ADR ID:** ADR-017
- **Title:** Leave Escalation State-Machine & Race Resolution (Leave Approval Service)
- **Status:** ACCEPTED
- **Date:** 2026-09-02
- **Accepted:** 2026-09-02, in the "Resolve Leave Escalation Decisions — Final Governance Gate" task, which finalized the items this ADR had left open (generation/attempt identity, `manual_verification`/`expired` resolution, the full race-condition scenario set) and renamed it from its original title ("Leave Escalation Orchestration Model") to reflect its narrowed scope. Per this repository's ADR governance (`docs/adr/README.md`), this refinement happened *before* acceptance, which is explicitly permitted ("An ADR that is still PROPOSED may be refined before acceptance"); the escalation-interval numeric value remains outside this ADR's scope (a product decision, not an architectural one — see §1 and `docs/leave-escalation-notification-design.md` Decision Area 4) and does not block this ADR's acceptance.
- **Related ADRs:** ADR-009 (Realtime Architecture — Postgres Changes on `leave_requests` already covers broadcasting this ADR's state transitions, unchanged), ADR-010 (Notification Architecture — this ADR fills in mechanics ADR-010 left unspecified for the *leave* side), ADR-011 (Background Job Architecture — pg-boss selection this ADR builds on, not changes), ADR-015 (Approval Workflow Data Model), ADR-016 (Leave Escalation Approval-Authority Model — accepted, a prerequisite this ADR depends on), ADR-018 (Notification Delivery Reliability & Idempotency — the Notification Service's complementary ADR, split from an earlier draft of this one; neither supersedes the other), **ADR-019 (Leave Escalation State-Sequencing Correction — partially supersedes §9 of this ADR; see the notice below)**.
- **Related design record:** `docs/leave-escalation-notification-design.md` (Decision Matrix rows 2, 4–5, 11–17, 23–24, 26)
- **⚠️ Superseded-in-part notice**: [ADR-019](ADR-019-leave-escalation-state-sequencing-correction.md) (ACCEPTED) supersedes **§9 below**'s transition-sequencing claims (the `guardian_notified`→`manual_verification` direct-transition statement, which incorrectly omits the intervening `in_app_call` stage, and the unevidenced "absolute lifecycle bound" claim for `expired`), and the one restating sentence in the "pg-boss Job Design" section below. §9's original text is preserved unedited below, exactly as accepted, per this repository's ADR immutability rule — **read ADR-019 for the corrected sequencing before relying on §9's transition claims.** §9's separate claim that `manual_verification` requires explicit staff action (not an automatic timer) is unaffected and remains authoritative. §1–§8 below are entirely unaffected by ADR-019.

## Scope Note (history preserved)

An earlier draft of this ADR bundled two decisions the SDD itself keeps separate (Ch.11 §11.3: Leave Approval Service vs. Notification Service). A design-correction pass narrowed this ADR to the **Leave Approval Service's** concern and extracted the Notification Service's concern into the new ADR-018. That narrowing is preserved here, not re-litigated. This finalization pass additionally resolved three items the narrowed draft had explicitly left open: escalation deadline derivation (§3) and generation/attempt identity (§5), the exact `manual_verification`/`expired` relationship (§9), and the full seven-scenario race enumeration (§4). Nothing about the narrowing itself, or about the previously-resolved items (§1, §2, §6, §7, §8 below), was changed in this finalization — only the previously-open items were completed. **A subsequent consistency review found §9's transition-sequencing claims to be factually wrong (omitting `in_app_call`) and partly unevidenced (the "absolute lifecycle bound" phrase for `expired`) — see the superseded-in-part notice above and [ADR-019](ADR-019-leave-escalation-state-sequencing-correction.md) for the correction. §9's text below is left exactly as originally accepted, per the ADR immutability rule, not edited to fix the error.**

## Context

ADR-010 selected Expo Push with backend-owned orchestration; ADR-011 selected pg-boss for per-request escalation timers and notification retries; ADR-016 (accepted) established that escalation stage does not gate decision authority. None of these specify the *mechanics* an implementation needs: how a stage's timeout is computed, what happens when a decision and a scheduled escalation race, how duplicate/stale job execution is prevented from corrupting state, how the system recovers from a mid-operation crash, whether escalation-scheduling and leave-state mutation share a transaction boundary, how the currently-active escalation attempt is identified, and what `manual_verification`/`expired` actually mean operationally. This ADR resolves all of them for the Leave Approval Service's side of the problem.

**On the "1.5 minute" escalation interval**: no SDD chapter or accepted ADR specifies this or any other numeric duration (verified twice by full-text search across every SDD chapter and every repository document). This remains true after this finalization pass. This ADR resolves the *mechanism* for timing (§1: configurable); the numeric default is explicitly and permanently out of this ADR's scope — it is `docs/leave-escalation-notification-design.md`'s Decision Area 4, classified `PROPOSED — PRODUCT DECISION REQUIRED`, unresolved by this or any ADR, and does not block this ADR's acceptance (an architecture can correctly state "the timeout shall be configurable" without yet knowing the configured value).

## Decision

**ACCEPTED.** The mechanics below are the final, accepted design for the Leave Approval Service's escalation state machine.

### 1. `leave_requests.status` — what it represents, precisely

`status` is one physical column, a Postgres enum, encoding a **flattened composite of two conceptually distinct dimensions**, confirmed against SDD Ch.5 §5.3's literal text and the already-implemented `DECIDABLE_STATUSES`/`TERMINAL_STATUSES` split in `apps/api/src/domain/leave/types.ts`:

1. **Leave lifecycle state** — open (a decision may still be applied) vs. resolved (`approved`/`rejected`/`expired`).
2. **Escalation stage** — while open, which contact is current (`pending`→`father_notified`→`mother_notified`→`guardian_notified`→`in_app_call`→`manual_verification`).

`status` does **not**, and is not proposed to, represent a third dimension: **escalation execution state** — when the current stage began, how many delivery attempts have occurred, which records belong to the active attempt vs. a stale one. That third dimension is resolved separately in §4 below. **No schema change is made to `status` or `leave_requests` by this decision** — splitting the enum into two physical columns was evaluated (`docs/leave-escalation-notification-design.md` row 2) and rejected: it would require a migration and introduce a new two-column consistency risk under concurrent writes for no correctness benefit, since the real gap was never the lifecycle/stage split (already handled correctly in code) but the execution-state dimension (resolved below without touching `status` at all).

### 2. Escalation timing (stage duration) — mechanism only

**Configurable, not hard-coded.** Each stage's timeout is a named configuration value, not a literal constant in scheduling code, and not assumed identical across all stages unless operational evidence later says it should be. This mirrors ADR-011's own per-row-scheduling rationale (a tunable, not fixed, per-request window). **The numeric default is not decided here** — see Context above.

### 3. Escalation deadline derivation — resolved

**Authoritative timestamp: `leave_requests.updated_at`.** A stage's deadline is computed as `updated_at + <configured interval for that stage, per §2>`. This retracts and replaces the earlier design record's original proposal ("derive from the latest `leave_approval_events` row with `event_type = 'notified'`"), which was found unsafe on re-verification: `leave_approval_events` has no column identifying which recipient a `notified` event was for (its only actor-identifying columns, `actor_parent_id`/`actor_staff_id`, are documented as `null` for system-generated events, which a `notified` event is), so that row cannot be reliably correlated to "the current stage's notification" at all.

`updated_at` is correct and deterministic because: (a) it already exists — no schema change; (b) it is already updated on every status transition by the existing `decide()` write path, and the escalation-advance write (§4 below) updates it symmetrically, so it always reflects "when the request entered its current stage," by construction, not by inference; (c) a worker can reconstruct the correct deadline after a crash or restart purely by reading `leave_requests.status` and `updated_at` for the row — no correlation against any other table, no ambiguity, no possibility of picking the wrong event among several candidates. This closes Q4 and Q5 from the design record's prior open-questions list.

### 4. Approval-vs-escalation race resolution — the invariant and every required scenario

**Invariant**: every state-mutating operation on a `leave_requests` row — a parent's decision, or the scheduler's escalation-stage-advance — is a single conditional `UPDATE leave_requests SET status = <new> WHERE id = <id> AND status = <expected-current> [AND, for a decision, the relationship-existence check already used by `decide()`]`, inside one transaction that also performs that operation's required side-effect inserts (`leave_approval_events`, `audit_logs`). The whole transaction commits or rolls back together. Because Postgres locks the row for the UPDATE's duration and re-evaluates the `WHERE` clause under that lock, at most one such UPDATE can ever match and commit against a given `(id, expected-current)` pair — this is exactly the mechanism already proven correct for decision-vs-decision races in the hardening task's real-Postgres concurrency tests, now formally extended, symmetrically, to escalation-advance operations.

**Every scenario this ADR is required to define**, resolved by the same invariant:

- **Parent approves immediately before escalation timer fires**: whichever transaction's `UPDATE` commits first wins. If the decision wins, the escalation-advance job's own conditional `UPDATE` (`WHERE status = 'mother_notified'`, say) matches zero rows when it runs (status is now `approved`) and must no-op cleanly — no side-effect writes, no error, no retry.
- **Parent approves while an escalation worker is executing**: not inherently a conflict — escalation-advance transitions between two *decidable* stages (e.g. `mother_notified` → `guardian_notified`) do not block a subsequent decision, because the decision's own conditional `UPDATE` still matches (its `WHERE` checks "any decidable status," not one specific stage). A genuine conflict only arises if the escalation-advance is *to a terminal status* (`expired`) or if it races against a *second* decision — both already covered by the invariant.
- **Escalation worker commits while a parent's approval transaction is in flight**: same as above — the decision either still matches (stage-to-stage escalation) or gets a clean `409 Conflict` (escalation-to-terminal).
- **Reject and approve race**: identical mechanism to decision-vs-decision — exactly one commits (already proven).
- **Two escalation workers race** (e.g. both attempting to advance the same stage): only one's `UPDATE` matches and commits; the other's `WHERE status = <the pre-advance stage>` fails to match once the first has committed, and it must no-op cleanly, mirroring pg-boss's own `singletonKey` protection at the queue layer (§6 below) as a second, independent safety net.
- **Stale escalation job executes after the request is already approved/rejected/expired**: its conditional `UPDATE`'s `WHERE` clause (checking the stage it was scheduled against) does not match the current (terminal) status, so it no-ops — no duplicate `leave_approval_events` row, no duplicate notification trigger (assuming the notification-send step, per ADR-018, gates on the same up-to-date state before acting, not merely on having been scheduled).
- **A worker retries after the request has become terminal** (e.g. pg-boss redelivers a job after a crash): identical to the stale-job case — the retried job's conditional `UPDATE` matches nothing; the job implementation must treat "zero rows updated" as "nothing to do, exit cleanly, do not raise an error and do not retry further," not as a failure.

**State validation occurs before any side effect in every scenario above** — a job never sends a notification or writes an audit row before its own conditional `UPDATE` has actually committed against the *current* database state, per pg-boss's own documented guidance that `singletonKey`/uniqueness features are a scheduling aid, not a substitute for this application-level check.

### 5. Escalation generation/attempt identity — resolved

**Minimum-viable resolution, chosen over three alternatives evaluated for deterministic correctness (not rejected merely to avoid a migration):**

- For the **state mutation itself** (advancing `leave_requests.status`), **no generation/attempt identifier is needed** — the invariant in §4 is already fully deterministic using `status` alone as the implicit version check. This part requires no schema change and is final.
- For **notification-send-level deduplication** (ADR-018's concern, but the identifying key originates here since it must be the same value both ADRs rely on), `status`/`updated_at` alone is **not sufficient for deterministic correctness** — re-verified explicitly for this finalization: `notifications` has a `recipient_id` but no column tying a row to a specific escalation stage, so two rows for different stages of the same request cannot be distinguished except by fragile timing inference. The resolved design: **the escalation stage value itself (the `leave_request_status` enum value at the time a notification is scheduled) is the generation/attempt disambiguator — not a new abstract counter.** Concretely: `notifications` gains a `stage` column (mirroring `leave_request_status`) and a uniqueness constraint on `(related_leave_request_id, recipient_id, stage)`, so "the notification row for this stage/recipient" becomes a well-defined, queryable, race-safe identity, and pg-boss singleton keys (ADR-018 §Job Design) can reference the same stage value rather than inventing a separate generation-number concept the SDD never mentions.
- **This is a genuine, accepted architectural decision — the migration itself is explicitly not created by this task** (out of scope per this task's governance instructions) and must be one of the first concrete steps of the eventual implementation task, before any ADR-018-dependent component (notification worker, Expo Push integration) can be built. This is a **decision resolved, implementation deferred** state, not an open question.
- **Rejected alternative**: a separate abstract `escalation_generation` integer/UUID column on `leave_requests`, incremented on every stage advance. Rejected because the escalation *stage* value already serves the same disambiguating purpose and already exists in the domain vocabulary (SDD Ch.5 §5.3) — introducing a second, parallel "generation" concept alongside "stage" would be redundant complexity with no correctness benefit the stage-tagging approach doesn't already provide.
- **Rejected alternative**: using pg-boss's own internal job ID as the de facto generation marker, never persisted to application tables. Rejected because it would couple `LeaveRepository`'s domain layer to pg-boss's internal implementation details, inconsistent with this codebase's established port/interface pattern (`AuthDbPort`, `LeaveRepository` — neither has ever depended on a specific infrastructure library's internals), and would make the domain layer untestable with fakes for this specific concern, unlike everything else in `LeaveRepository`.

### 6. Duplicate/stale scheduler jobs (escalation-timer jobs specifically)

**Both queue-level and database-level protection, non-optionally.** pg-boss's native `singletonKey` (`leave-request:{leaveRequestId}:stage:{expectedStage}` — see the Job Design section below) prevents scheduling two active escalation-stage-evaluate timer jobs for the same request/stage pair in the common case. Independently, every such job's actual database write is the conditional `UPDATE` from §4 — this makes even a duplicate *execution* (not just duplicate *scheduling*) safe without a separate version column, since `status` already serves that role for the state-mutation write.

### 7. Scheduler transaction boundary

**Leave-state mutation and the *next* escalation-timer job's scheduling occur within the same database transaction where practical**, extending `decide()`'s own established pattern (status UPDATE + `leave_approval_events` INSERT + `audit_logs` INSERT, one `db.transaction()`) by one more write. Because pg-boss persists its job queue in the same Postgres instance (ADR-011), scheduling a job inside an existing transaction is mechanically available via pg-boss's documented API, not merely theoretical. This prevents both failure modes of a non-transactional approach: a state change committing with no corresponding timer (a permanently stuck request), and a timer existing for a state change that never actually committed.

### 8. Crash / restart recovery (state-advancement path)

**Rely on pg-boss's native retry/expiration handling first; do not build a bespoke reconciliation worker or outbox table preemptively.** This matches ADR-011's own "operational simplicity"/"minimum dependency set" rationale. If pg-boss's native mechanism, combined with §4's conditional-update safety net, is later found insufficient in practice, that is a capacity/reliability signal warranting a follow-up ADR — not a default assumption made here.

### 9. `manual_verification` and `expired` — resolved relationship

> **⚠️ Partially superseded by [ADR-019](ADR-019-leave-escalation-state-sequencing-correction.md).** The transition-sequencing text below is preserved exactly as originally accepted (ADR immutability rule) but is **factually wrong** on one point (it omits `in_app_call`) and **unevidenced** on another (the "absolute lifecycle bound" phrase). Read ADR-019 for the corrected transitions before relying on anything below except the still-valid claim that `manual_verification` requires explicit staff action.

**Resolved, from the convergence of three independent, already-accepted sources — not inferred from naming alone:**

1. **FR-007** (SDD Ch.2): "Escalation: Father → Mother → Guardian → In-app call → **Manual process**." The FR text's chain ends at manual process; it does not mention a further "expires" step at all.
2. **SDD Ch.5 §5.3**'s state-machine text lists `Approved / Rejected / In-App Call / Manual Verification / Expired` as **five parallel branches from `Guardian Notified`**, not a further sequential chain — nothing in that text states `Expired` follows `Manual Verification`.
3. **Already-accepted RLS** (`leave_requests_all_reception`, `docs/rls-policy-matrix.md`) already grants reception an update path scoped to the `manual_verification` stage — a design choice that only makes sense if `manual_verification` is meant to be resolved by explicit staff action, and SDD Ch.7 §7.2's dedicated **"Manual Verification Queue"** reception-dashboard module corroborates this: a dashboard queue exists for operators to work through, not for a state that resolves itself on a timer.

**Resolved design**: `manual_verification` is **not** auto-expiring — it is resolved by an explicit reception/staff action (approve, reject, or another disposition already representable via the existing `manual_override` `leave_approval_events.event_type`, per ADR-015). `expired` is reached as a **direct, parallel outcome of the `guardian_notified` stage's own timeout** (the chain's final automated step, per FR-007 ending at "Manual process" with `Expired` appearing as an alternative branch in Ch.5 §5.3, not a `manual_verification`-only failure), not as a consequence of `manual_verification` itself timing out. Concretely: when `guardian_notified`'s timeout elapses, the scheduler's conditional-update logic transitions the request to `manual_verification` (routing it to reception, matching FR-007's literal final chain step) — `expired` is reserved for a request that reaches its absolute lifecycle bound without ever being picked up by any resolution path (decision or manual disposition), not for `manual_verification`'s own internal timing, which this design treats as unbounded pending explicit staff action. **`manual_verification` and `expired` therefore both remain terminal-adjacent/terminal per the existing `DECIDABLE_STATUSES`/`TERMINAL_STATUSES` split — no change to that split is made or needed**, since `manual_verification` was already correctly classified as decidable (staff/parent action still possible) and `expired` as terminal.

## pg-boss Job Design (documentation only — nothing implemented)

> **⚠️ The "Job type" paragraph immediately below restates §9's superseded claim (see the notice above §9). Preserved unedited; read [ADR-019](ADR-019-leave-escalation-state-sequencing-correction.md) §4 for the corrected job behavior (two stage-advance hops through `in_app_call`, and no automatic transition to `expired`).**

**Job type**: `leave-escalation-stage-evaluate`. Fired at a stage's configured deadline (§2/§3). Conditionally advances `leave_requests.status` per §4's invariant — to the next escalation stage, or (from `guardian_notified`) to `manual_verification` per §9. On a successful advance to a non-terminal stage, enqueues the next stage's `leave-escalation-stage-evaluate` job and the corresponding `leave-notification-deliver` job (ADR-018).

**Payload**: `{ leaveRequestId, expectedStage }` only — no student/parent name, phone number, or other personal data; the job looks up whatever it needs from the database at execution time, consistent with never placing sensitive data unnecessarily inside a queue payload.

**Singleton key**: `leave-request:{leaveRequestId}:stage:{expectedStage}` — evaluated, not assumed correct as given in the task prompt's example. Rejected the prompt's suggested `generation`-based key in favor of the already-existing, already-unambiguous `stage` enum value (§5) — introducing a numeric "generation" concept would duplicate what `stage` already expresses.

**Stale-job protection**: exactly §4's invariant — the job's own conditional `UPDATE` is the safety mechanism; pg-boss's `singletonKey` reduces how often a stale job is even scheduled, but the job's code must never assume the singleton key alone is sufficient (per this task's own governing note that pg-boss mechanisms "must not be treated as a substitute for application-level state validation").

**Crash recovery**: per §8 — pg-boss native retry; a crash before the DB mutation simply means the job never ran (pg-boss's own visibility timeout re-delivers it); a crash after the DB mutation but before the follow-on jobs are enqueued is why §7 places both in one transaction — if the transaction didn't commit, nothing happened; if it did commit, the follow-on jobs were enqueued in the same transaction and did happen.

## Alternatives Considered

- **Fixed, hard-coded per-stage timeout** — rejected: no source specifies a value; hard-coding one would manufacture a requirement.
- **Escalation-always-wins or decision-always-wins race priority** — rejected: neither is deterministic without a commit-order tiebreak, which the conditional-update mechanism already provides without a hand-rolled priority rule.
- **Queue-only deduplication (no DB-level conditional update)** — rejected: doesn't protect against a job that re-executes after a partial crash.
- **Database-only protection (no queue-level dedup)** — rejected: unnecessarily allows avoidable duplicate scheduling when `singletonKey` prevents it for free.
- **Outbox pattern / reconciliation worker for crash recovery** — rejected for now: adds operational surface pg-boss's native Postgres-backed job table + the conditional-update pattern already covers; revisit only on concrete evidence of insufficiency.
- **Separate `escalation_generation` counter column** — rejected in favor of reusing the existing `stage` enum value (§5).
- **`manual_verification` auto-expires on its own timer** — rejected: contradicted by the convergence of FR-007, SDD Ch.5 §5.3, SDD Ch.7 §7.2, and already-accepted RLS (§9).

## Rationale

Every mechanic finalized here either directly follows from an already-accepted ADR's stated requirement (ADR-011's idempotency mandate; ADR-016's authority model) or extends an already-implemented, already-tested pattern in this exact codebase (`decide()`'s conditional-update transaction) to a symmetric new use. The one genuinely new schema implication (§5's `notifications.stage` column) was arrived at by evaluating, not reflexively avoiding, a schema addition — chosen as the minimum addition that makes send-level correctness deterministic rather than heuristic.

## Security Impact

None beyond ADR-016 (authorization, unaffected — this ADR concerns reliability/correctness, not who may decide). The conditional-update invariant closes a genuine class of race-condition bug (double-advance, lost-update) that would otherwise be a reliability *and* audit-integrity risk (duplicate/inconsistent `leave_approval_events` rows).

## Data/Privacy Impact

None from this ADR's leave-side content. The one schema implication (`notifications.stage`) is not privacy-sensitive — it stores an already-non-sensitive enum value, not personal data.

## Migration Impact

**One migration is required before ADR-018-dependent components can be built, not before this ADR's own state-machine logic can be built**: add a `stage` column (type: the existing `leave_request_status` enum, or a narrower subset) to `notifications`, plus a uniqueness constraint on `(related_leave_request_id, recipient_id, stage)`. **Not created in this task** — this is a decision record, not an implementation step; the actual migration is implementation-task work, gated on this ADR's acceptance (now satisfied).

## Rollback

No migration to roll back today, since none was created. The recommended `notifications.stage` migration, once created, would be rolled back by a standard down-migration (drop the column/constraint) — no data-loss risk since it stores no data not already reconstructable from `leave_requests.status` history at the time each row was written.

## Consequences

- The eventual escalation-scheduler implementation task has a complete, concrete, cited mechanical design to build against — every previously-open item (race scenarios, generation identity, `manual_verification` semantics) is now resolved.
- A `notifications.stage` migration is a known prerequisite for ADR-018-dependent work, tracked here rather than discovered mid-implementation.
- The exact escalation-interval value (Decision Area 4) remains the one genuinely external blocker to actually scheduling a job — an architecture decision being accepted does not require its tunable parameters to be known yet.

## Rejected Alternatives

All detailed above under "Alternatives Considered."

## Supersedes / Superseded by

**Supersedes**: none — refines and completes the ADR's own previously-`PROPOSED` content before acceptance (explicitly permitted, `docs/adr/README.md`); does not supersede any other ADR's accepted text.

**Superseded by**: [ADR-019](ADR-019-leave-escalation-state-sequencing-correction.md) — **§9 only** (transition-sequencing claims), plus the one restating sentence in "pg-boss Job Design." §1–§8, and §9's `manual_verification`-requires-staff-action claim, are not superseded and remain this ADR's authoritative, accepted content. This metadata addition was made per this repository's ADR governance's explicit allowance for "adding supersession metadata" to an accepted ADR.

## Implementation Note (Reception-Initiated Parent Approval correction, added 2026-09-15/16)

This ADR's own text never specifies *what triggers* the first escalation stage — it specifies the state machine's mechanics once escalation is underway (race resolution, deadline derivation, generation identity). An implementation detail outside this ADR's own scope (`LeaveRepository.create()` originally scheduling the first escalation job automatically at student leave-request creation) was later found to be a genuine product/architecture defect and corrected: a leave request now stays `pending` with no escalation job scheduled until a Reception Warden/Hostel Admin/Super Admin explicitly calls a new endpoint (`POST /leave-requests/{id}/send-for-parent-approval`) to start it. This is a correction to the *trigger point* only — every mechanic this ADR actually decides (the state machine itself, conditional-UPDATE race resolution, deadline derivation, generation identity, the transaction boundary) is unchanged and still governs the escalation lifecycle from the moment it is started. No contradiction of this ADR's Decision/Context/Consequences exists, so no supersession was required. See `docs/current-state.md`'s "Reception-Initiated Parent Approval correction" entry and `apps/reception-dashboard/docs/parent-approval-session.md` §0/§16 for the full account. Added per `docs/adr/README.md`'s explicit allowance for "adding implementation references" to an accepted ADR.
