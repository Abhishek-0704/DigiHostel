# Leave Escalation & Notification Domain Design

**Status: FINALIZED DESIGN — ADR-016, ADR-017, ADR-018, and ADR-019 are all ACCEPTED.** No code, schema, dependency, or production behavior has changed. This document is the design record those ADRs formally reference. It is referenced by [ADR-016](adr/ADR-016-leave-escalation-approval-authority.md), [ADR-017](adr/ADR-017-leave-escalation-orchestration-model.md), [ADR-018](adr/ADR-018-notification-delivery-reliability.md), [ADR-019](adr/ADR-019-leave-escalation-state-sequencing-correction.md), and `docs/leave-approval-workflow.md`.

**Two genuinely external blockers remain and are not resolved by any ADR**: (1) the exact escalation-interval duration, and (2) the exact notification retry-count/backoff schedule. Both are product/operational parameters, not architectural questions — see §7 row 4 and row 9, and the Implementation Gate (§9).

**Revision history**: v1 proposed ADR-016/017 (PROPOSED). v2 corrected two unverified assumptions in v1 (lifecycle/escalation-state conflation, unsafe deadline-derivation proposal) and split ADR-017 into ADR-017 (leave-side) + ADR-018 (notification-side, new), per SDD Ch.11 §11.3's own service boundary. v3 finalized every architectural decision within evidence and accepted ADR-016/017/018. v4 found ADR-017 §9 to be factually wrong (it omitted the `in_app_call` stage between `guardian_notified` and `manual_verification`) and partly unevidenced (an invented "absolute lifecycle bound" for `expired`) — corrected via a new, narrowly-scoped superseding ADR ([ADR-019](adr/ADR-019-leave-escalation-state-sequencing-correction.md), ACCEPTED, superseding only ADR-017 §9's transition claims, not its §1–§8 or the rest of §9) — and tightened ADR-018's notification-identity/provider-outcome wording. **v5 (this revision)** is a pure documentation-terminology pass — no ADR was reopened, created, or reworded; it adds the single canonical state diagram (§4a), explicitly separates the three idempotency layers that were previously implicit across two ADRs (§11), and adds a consolidated "authoritative state validation before external side effects" implementation contract (§12, documentation only — nothing implemented). ADR-016/017/018/019 remain exactly as they were left after v4.

## 1. Source material

Every SDD chapter was extracted to plain text and searched directly, not assumed from filenames — Ch.1–20 all checked; Ch.2, 3, 5, 7, 9, 10, 11, 12, 13, 17.1–17.4 contain material content, cited throughout. ADR-002, 006, 009, 010, 011, 014, 015, 016, 017, 018 were read in full for this revision, along with `docs/realtime-security-model.md` (newly consulted — it already names a specific `escalation.timeout` Broadcast event and recipient list, cited in §7 row 20) and the full column-by-column schema for `leave_requests`, `leave_approval_events`, and `notifications`.

**Standing negative finding, verified three times across three tasks**: no SDD chapter, ADR, or any other repository document contains a numeric escalation-timing value anywhere. "1.5 minutes" is not sourced from this repository under any search.

## 2. Canonical terminology (final)

| Term | Schema representation | Meaning |
|---|---|---|
| **Leave lifecycle state** | `leave_requests.status`, `TERMINAL_STATUSES` subset | Open vs. resolved (`approved`/`rejected`/`expired`). |
| **Escalation stage** | `leave_requests.status`, non-terminal (`DECIDABLE_STATUSES`) subset | Which contact/step is current. Same physical column as lifecycle state — ADR-017 §1, confirmed correct, no schema change. |
| **Escalation execution state** | `leave_requests.updated_at` (deadline timestamp, ADR-017 §3) + `notifications.stage` (generation/attempt identity, ADR-017 §5, migration not yet created) | When the current stage began; which notification/delivery records belong to the active attempt. Fully resolved, not fully implemented (one migration pending). |
| **Escalation order** | `parent_student_relationships.escalation_order` (exists) | Which contact comes first. |
| **Logical notification** | `notifications` row, identity `(leave_request_id, stage, recipient_id)` per ADR-018 §1 | One per escalation stage per intended recipient — multi-device fan-out (ADR-018 §7) is a delivery-attempt detail, not a separate logical notification. |
| **Approval event** | `leave_approval_events.event_type` (`notified`, `responded`, `escalated`, `expired`, `manual_override` — all exist) | Immutable business-workflow timeline. |

## 3. Approval authority — ADR-016, ACCEPTED

**Model C**: escalation controls notification priority/ordering only; any parent/guardian linked via `parent_student_relationships` may decide a request in any decidable status, exactly as already implemented and tested. Model B (stage-restricted authority) was evaluated and rejected — no source supports it, it introduces an unresolved `(student_id, relationship_type)` uniqueness question, and it works against the escalation chain's own reach-someone-quickly purpose. Full reasoning: [ADR-016](adr/ADR-016-leave-escalation-approval-authority.md).

## 4. Leave-side escalation state machine — ADR-017 (ACCEPTED) as corrected by ADR-019 (ACCEPTED)

Resolved: `status` representation (§1), timing mechanism (§2, value external), deadline derivation via `updated_at` (§3), the complete race-resolution invariant covering all seven required scenarios (§4), generation/attempt identity via a `notifications.stage` column (§5, migration specified but not created), duplicate/stale-job protection (§6), transaction boundary (§7), crash recovery (§8) — all still fully authoritative from ADR-017, unaffected by ADR-019.

**§9's transition-sequencing claims were found factually wrong** (omitting the `in_app_call` stage between `guardian_notified` and `manual_verification`, contradicting FR-007 and the schema's own `DECIDABLE_STATUSES` ordering) **and partly unevidenced** (an "absolute lifecycle bound" for `expired` with no citation) **— corrected by [ADR-019](adr/ADR-019-leave-escalation-state-sequencing-correction.md)**, which formally supersedes only that portion of §9. The corrected, authoritative transitions: `guardian_notified` → (timeout) → `in_app_call` → (timeout) → `manual_verification`; `expired` is reached **only** by explicit staff/reception action from `manual_verification` — never by an automatic timer. §9's separate, still-valid claim (`manual_verification` requires explicit staff action, does not auto-expire on a per-stage timer) is unaffected by ADR-019 and remains part of ADR-017's authoritative content.

Full reasoning, including the complete pg-boss job-type/payload/singleton-key design: [ADR-017](adr/ADR-017-leave-escalation-orchestration-model.md) (read alongside [ADR-019](adr/ADR-019-leave-escalation-state-sequencing-correction.md) for §9).

### 4a. Canonical state machine (single authoritative diagram)

This is the one canonical diagram for the leave-request state machine — the same decision already accepted in ADR-017 (§1–§8) and ADR-019 (§1–§3), reproduced here for readability, not a new or restated decision:

```text
pending
  │
  ├── decision ───────────────> approved / rejected
  │
  └── automatic escalation
        │
        ├── father_notified
        │      ├── decision ──> approved / rejected
        │      └── timeout ──> mother_notified
        │
        ├── mother_notified
        │      ├── decision ──> approved / rejected
        │      └── timeout ──> guardian_notified
        │
        ├── guardian_notified
        │      ├── decision ──> approved / rejected
        │      └── timeout ──> in_app_call
        │
        ├── in_app_call
        │      ├── decision ──> approved / rejected
        │      └── timeout ──> manual_verification
        │
        └── manual_verification
               ├── authorised decision ─> approved / rejected
               └── staff marks expired ─> expired
```

**`manual_verification`**: not terminal — it is a decidable workflow state (`DECIDABLE_STATUSES`, unchanged). Automatic escalation ends when this state is entered — no further automatic contact escalation occurs beyond it. From here: an authorised parent/guardian decision (ADR-016) may still resolve it; staff may resolve it through the existing `manual_override` action; staff may mark it `expired`. Never described as "terminal," "terminal-adjacent," or "final" anywhere in this document.

**`expired`**: terminal (`TERMINAL_STATUSES`, unchanged). Not automatically entered by any timeout, including `guardian_notified`'s. Reached exclusively through the explicit staff action from `manual_verification` described above (ADR-019). No further leave-decision transition is permitted once a request is `expired`.

```text
automatic escalation
        ↓
manual_verification
        ↓
manual resolution
        ↓
approved / rejected / expired
```

`manual_verification` and `expired` are not the same thing and are never described interchangeably in this document: the former is where automatic escalation hands off to people; the latter is one of three possible outcomes people (parent/guardian decision, or staff) can produce from that hand-off point.

## 5. Notification-side delivery reliability — ADR-018, ACCEPTED

Resolved: notification identity (§1: `(leave_request_id, stage, recipient_id)` — `stage` identifies the logical escalation notification, explicitly **not** an individual provider delivery attempt; delivery attempts within one logical notification are distinguished only by `retry_count`, never a separate identity), the attempt/retry/failure/success vocabulary (§2), retry-policy mechanism (§3, numeric values external), send-level idempotency (§4), the three provider-outcome cases — definitely rejected, definitely accepted, and genuinely unknown — resolved identically under the same at-least-once model, with an explicit statement that a Case 3 (unknown-outcome) retry is potentially duplicative and this design never claims exactly-once external delivery (§5), invalid/expired push tokens (§6: ordinary delivery failure, never auto-revokes device trust), multi-device fan-out (§7: simultaneous, one logical notification, not per-device rows), and push-content privacy (§8: never name another parent, never describe internal escalation state). Full reasoning: [ADR-018](adr/ADR-018-notification-delivery-reliability.md).

## 6. Realtime — ADR-009 (already accepted, unchanged), refined visibility

ADR-009 already established Postgres Changes for `leave_requests`/`notifications` row updates and Broadcast for transient escalation alerts — this design changes nothing about that mechanism. `docs/realtime-security-model.md` (pre-existing, re-verified for this task) already names the specific event (`escalation.timeout`), its recipients ("the *next* party in the escalation chain, plus reception"), and requires a private, RLS-gated Broadcast channel scoped to the `leave_request_id` — this was already resolved before this task and is unaffected by ADR-016/017/018's acceptance, except that the underlying state to broadcast about (an actual stage advance) does not exist until the ADR-017-based scheduler is implemented.

## 7. Final Decision Matrix

Status values used: `SOURCE-SUPPORTED`, `ACCEPTED`, `PROPOSED — PRODUCT DECISION REQUIRED`, `PROPOSED — ADR REQUIRED`, `DEFERRED`, `NOT APPLICABLE`. No row uses an unqualified "TBD."

| ID | Decision Area | Source/Evidence | Options | Security Impact | Reliability Impact | Privacy Impact | Complexity | Recommendation | Status | Implementation Blocking? |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Approval authority | No source restricts decisions to a stage; existing implementation is Model C; ADR-016 | A: any linked parent decides / B: current-stage only / C: escalation = priority only | B introduces no compensating benefit over C | C avoids a new "wrong current contact" failure mode | No difference | C: zero (built); B: new uniqueness question | C | **ACCEPTED** (ADR-016) | No — resolved |
| 2 | Leave lifecycle vs. escalation stage | SDD Ch.5 §5.3; `DECIDABLE_STATUSES`/`TERMINAL_STATUSES` already in code; ADR-017 §1 | One flattened column (current) / two physical columns / one column, documented precisely | No difference | One column avoids a new two-column consistency risk | No difference | One column: zero; two columns: migration + retest | One column, documented precisely | **ACCEPTED** (ADR-017 §1) | No — resolved, no schema change |
| 3 | Escalation contact ordering | FR-007, SDD Ch.5, ADR-010, ADR-011, schema enum, `escalation_order` | Fixed father→mother→guardian / configurable / other | No impact | Simple, predictable | Matches every chapter | Zero — already represented | Fixed | **SOURCE-SUPPORTED** | No |
| 4 | Escalation interval (exact duration) | **No source anywhere states a value** | 1.5 min / configurable / other | Too-short = false-escalation risk | Configurable is retunable | Too-short alarms parents unnecessarily | Mechanism: zero (ADR-017 §2); value: none set | Mechanism: configurable (ACCEPTED, ADR-017 §2). **Value: not decided.** | **PROPOSED — PRODUCT DECISION REQUIRED** | **Yes — scheduler cannot compute a deadline without a value** |
| 5 | Current escalation actor | No source defines a distinct identified entity; no `(student_id, relationship_type)` uniqueness | Track explicitly / infer at query time / not needed | N/A under Model C | Moot under Model C | N/A | Zero under Model C | Not applicable under ADR-016's Model C | **NOT APPLICABLE** (moot given ADR-016) | No |
| 6 | Timeout behaviour | SDD Ch.5 §5.2 step 6 | Auto-escalate / retry same contact / terminate | No difference | Matches literal SDD text | Matches expectation | None | Auto-escalate | **SOURCE-SUPPORTED** | No |
| 7 | Offline contact | No distinct SDD concept | Immediate escalate / retry window / manual fallback | No difference | New mechanism adds complexity with no signal source | N/A | Avoiding a new mechanism is simplest | Subsumed into rows 6 and 8 | **DEFERRED** | No |
| 8 | Notification delivery failure | ADR-010 verbatim: retry then escalate | Retry-then-escalate / escalate immediately / mark and wait | No difference | Tolerates transient failures | Fewer false escalations | Already accepted | Retry-then-escalate | **SOURCE-SUPPORTED** (ADR-010) | No |
| 9 | Notification retry policy (count/backoff) | `notifications.retry_count` exists; ADR-010 mandates backoff without a schedule; ADR-018 §3 | Fixed count/backoff / configurable / no retries | No difference | Configurable is tunable without redeploy | None | Column exists; policy value undecided | Mechanism: configurable (ACCEPTED, ADR-018 §3). **Values: not decided.** | **PROPOSED — PRODUCT DECISION REQUIRED** | **Yes — for the actual retry loop** |
| 10 | Notification send-level idempotency | ADR-011 mandate; ADR-018 §4 mechanism | At-most-once / at-least-once+idempotent / exactly-once | Duplicate send cannot mutate state twice | Matches pg-boss's native model | Rare duplicate push is disclosed trade-off | Reuses conditional-write pattern | At-least-once + idempotent | **ACCEPTED** (ADR-011 outcome, ADR-018 §4 mechanism) | No — resolved |
| 11 | Approval-vs-escalation race (all 7 scenarios) | Precedent: `decide()`'s conditional UPDATE, proven under real concurrency; fully enumerated in ADR-017 §4 | Decision always wins / escalation always wins / conditional-update determines winner | Deterministic winner prevents lost-update bugs | Extends an already-proven pattern | Parent gets 200 or 409, same as today | Low — no new locking primitive | Conditional-update determines winner | **ACCEPTED** (ADR-017 §4) | No — resolved |
| 12 | Duplicate scheduler jobs | ADR-011 outcome mandate; ADR-017 §6 (escalation-timer) + ADR-018 §4 (notification-send) mechanisms | DB-only / queue-only / both | Two layers > one | DB layer protects even duplicate execution | N/A | Low — `singletonKey` native, DB layer reuses existing pattern | Both, split by concern | **ACCEPTED** (ADR-017 §6, ADR-018 §4) | No — resolved (migration for the send-side identity still pending, see row 24) |
| 13 | Stale scheduler jobs | Same precedent; ADR-017 §4/§6 | Check state before acting / version token / conditional update | Prevents double-advance | Reuses proven pattern | N/A | Lowest — no new column for state-mutation | Conditional check, combined with the update itself | **ACCEPTED** (ADR-017 §4/§6) | No — resolved |
| 14 | Scheduler transaction boundary | Precedent: `decide()`'s single transaction; pg-boss shares the Postgres instance (ADR-011); ADR-017 §7 | One transaction / async reconciliation / outbox | Prevents "advanced but no timer" bugs | Same atomicity guarantee, one more write | N/A | Low — pg-boss accepts an existing DB client | One transaction | **ACCEPTED** (ADR-017 §7) | No — resolved |
| 15 | Crash/restart recovery | ADR-011 rationale; ADR-017 §8 (state) + ADR-018 §5/§7 (send) | pg-boss native / reconciliation worker / outbox | pg-boss native covers common cases | Fewer moving parts | N/A | Lowest — no new component | pg-boss native, revisit only if a gap is found | **ACCEPTED** (ADR-017 §8, ADR-018 §5/§7) | No — resolved |
| 16 | Approval expiry — existence | SDD Ch.5 §5.3; schema `TERMINAL_STATUSES` | Expires after final window / remains pending / other | Indefinite pending is a liability | Bounded lifetime needed for Ch.7's panel | Silent indefinite pending is worse UX | Zero — already accepted | Exists | **SOURCE-SUPPORTED** | No |
| 17 | `manual_verification`/`expired` transitions | FR-007 (chain: Father→Mother→Guardian→**In-app call**→Manual process) + SDD Ch.5 §5.3 (parallel branches) + SDD Ch.7 §7.2 ("Manual Verification Queue") + existing reception RLS + schema `DECIDABLE_STATUSES` ordering (`guardian_notified`→`in_app_call`→`manual_verification`) | Auto-expires / requires staff action / other; direct `guardian_notified`→`manual_verification` hop / via `in_app_call` | Auto-expire needs a new, unevidenced timer; staff-action needs none | Staff-action model reuses existing RLS path; corrected sequencing needs two conditional-update hops, not one | N/A | Zero new mechanism either way | `manual_verification` requires explicit staff action; `expired` reached only by staff action from `manual_verification`, never a timer; `guardian_notified`→`in_app_call`→`manual_verification` (not a direct hop) | **ACCEPTED** — ADR-017 §9 for the staff-action claim; **ADR-019 (supersedes ADR-017 §9's transition-sequencing claim only)** for the `in_app_call` sequencing and the `expired`-is-staff-only resolution | No — resolved |
| 18 | Relationship changes during pending | The Critical Rule (`docs/auth-database-security-model.md`), applied consistently everywhere else | Live evaluation / snapshot at creation / other | Live revokes a for-cause-removed parent immediately | No new staleness logic | Negligible — rare event | Live: zero; snapshot: new storage | Live evaluation | **SOURCE-SUPPORTED / already implied by existing design** | No |
| 19 | Device revocation during escalation | Implemented (`requireActiveTrustedDevice`, RLS) and documented (`docs/auth-database-security-model.md` §12) | Immediate loss of authority / notification remains actionable / other | Strictest available option | No change needed — same guard applies | Already-tested 403 behavior | Zero — nothing to build | Immediate loss, with the documented residual-token caveat | **ACCEPTED / already implemented** | No |
| 20 | Escalation-state visibility (all roles) | SDD Ch.9 ("Leave Status"), Ch.10 ("Pending Leave Approvals"), Ch.7 §7.4 ("Pending approvals"); `docs/realtime-security-model.md`'s pre-existing `escalation.timeout` row (recipients: next party + reception, private RLS-gated Broadcast) | Full state to all / user-relevant state only / fully private | Minimal exposure avoids revealing another parent's existence/contact | No difference | Minimizes exposure per Privacy by Design | Zero — `status` already returned; realtime shape already specified | User-relevant state; realtime escalation alert already scoped per `docs/realtime-security-model.md` | **SOURCE-SUPPORTED** (SDD naming + pre-existing realtime-security-model.md row) | No |
| 21 | Audit representation | `leave_approval_events.event_type` already includes `notified`/`escalated` (ADR-015) | Extend `leave_approval_events` / use `audit_logs` / new model | Reuses existing tamper-evidence guarantee | No new table/RLS surface | N/A | Zero — enum values exist | Use existing vocabulary as-is | **SOURCE-SUPPORTED** (ADR-015) | No |
| 22 | Notification-state persistence | `notifications` table exists (ADR-002, SDD Ch.12 §12.3) | No state / persistent records / existing table | Already reviewed, no new exposure | Required for ADR-010's 99% KPI | Already RLS-scoped | Zero — exists | Existing table | **SOURCE-SUPPORTED** | No |
| 23 | Deadline derivation | Retracted-and-corrected: `leave_approval_events` has no recipient column; ADR-017 §3 | Latest `notified` event (retracted) / `updated_at` / new column | No difference | `updated_at`: deterministic, reconstructable after crash | N/A | `updated_at`: zero schema change | `leave_requests.updated_at` | **ACCEPTED** (ADR-017 §3) | No — resolved |
| 24 | Escalation generation/attempt identity | New gap, this design's re-verification; ADR-017 §5 | No identifier / explicit generation column / stage-tagging on `notifications` | No difference | Stage-tagging makes send-dedup deterministic, not heuristic | N/A | Minimum viable — reuses existing `stage` vocabulary, one new column + one uniqueness constraint | `notifications.stage` column, decision accepted, **migration not yet created** | **ACCEPTED (decision); migration pending** (ADR-017 §5, ADR-018 depends on it) | **Yes, for ADR-018-dependent components specifically — not for the leave-side state machine** |
| 25 | API exposure | SDD Ch.9/10/13 name only existing endpoints; no escalation-internals endpoint anywhere | New escalation-detail endpoint / reuse existing `status` field / notifications-list endpoint | No new exposure surface if no change made | No difference | No new data exposed | Zero — no change | No API change | **SOURCE-SUPPORTED (no change required)** | No |
| 26 | RLS implications | Existing RLS on `leave_requests`/`leave_approval_events`/`notifications` already covers every actor this design touches | Modify existing policies / add new policies / no change | No RLS change = no new attack surface | No difference | No difference | Zero — nothing proposed adds a table/column requiring new RLS | No RLS change | **SOURCE-SUPPORTED (no change required)** | No |

## 8. ADR Mapping

| Decision | ADR | Status | Depends On | Blocks Implementation? |
|---|---|---|---|---|
| Approval authority | ADR-016 | **ACCEPTED** | — | No |
| Escalation ordering | ADR-017 §1 note / FR-007 / ADR-010 / ADR-011 | SOURCE-SUPPORTED, no ADR needed | — | No |
| Escalation interval value | *(none — product decision, no ADR mechanism applies)* | PROPOSED — PRODUCT DECISION REQUIRED | — | **Yes** |
| Leave-side escalation state machine (race, deadline, generation identity, transaction boundary, crash recovery, `manual_verification`) | ADR-017 | **ACCEPTED** | ADR-016 (authority model) | No, except the pending `notifications.stage` migration blocks ADR-018-dependent work specifically |
| Notification delivery reliability (identity, retry mechanism, idempotency, invalid token, multi-device, privacy) | ADR-018 | **ACCEPTED** | ADR-017 §5 (`notifications.stage` migration, not yet created) | No for the architecture; **Yes** in practice until that migration exists |
| Notification retry-policy values | *(none — product/ops decision, no ADR mechanism applies)* | PROPOSED — PRODUCT DECISION REQUIRED | ADR-018 §3 (mechanism, accepted) | **Yes** |
| Realtime escalation events | ADR-009 (mechanism, already accepted, unchanged) + `docs/realtime-security-model.md` (visibility, pre-existing) | SOURCE-SUPPORTED / ACCEPTED | ADR-016, ADR-017, ADR-019 (the state to broadcast must exist and be correctly sequenced) | No decision-blocker; implementation-sequencing blocker only (scheduler must exist first) |
| `manual_verification`/`expired` sequencing correction | ADR-019 | **ACCEPTED** | ADR-017 (partially superseded — §9 transition claims only) | No — resolved |

**One genuine supersession now exists**: [ADR-019](adr/ADR-019-leave-escalation-state-sequencing-correction.md) (ACCEPTED) partially supersedes ADR-017 §9's transition-sequencing claims (only — not ADR-017 §1–§8, nor §9's separate staff-action claim), following the same partial-supersession pattern already established by ADR-006→ADR-014 in this repository's history. ADR-017's own narrowing (splitting out ADR-018) and its finalization (accepting §1–§8 and the staff-action portion of §9) remain pre-acceptance refinements, not supersessions, exactly as before — only the §9 transition-sequencing correction is a true supersession, because it corrects an already-`ACCEPTED` decision's substance rather than refining a still-`PROPOSED` one.

## 9. Implementation Gate

| Component | Required Decisions | Ready? | Blocking Decisions |
|---|---|---|---|
| Approval authority | ADR-016 | **YES** | — |
| Leave escalation state machine | ADR-016 + ADR-017 + ADR-019 | **YES** for the state-mutation mechanics themselves (no migration needed for this component specifically; the corrected `in_app_call` sequencing and staff-only `expired` resolution are both decided) | Escalation-interval *value* still needed before a scheduler can actually be scheduled (Decision Area 4) — a sequencing dependency, not an architectural one |
| pg-boss scheduler | ADR-017 + ADR-019 + escalation-interval value | **NO** | Escalation-interval value (Decision Area 4) — product decision |
| Notification worker | ADR-018 + `notifications.stage` migration | **NO** | Migration not yet created (Decision Area 24); retry-policy values not yet set (Decision Area 9) |
| Expo Push integration | ADR-018 + `notifications.stage` migration | **NO** | Same as Notification worker |
| Realtime escalation events | ADR-016 + ADR-017 + ADR-019 + underlying escalation state existing | **NO** | Not an ADR/decision blocker (ADR-009 + `docs/realtime-security-model.md` already specify the mechanism and visibility) — blocked only on the scheduler/worker above actually being built first |
| Multi-device notification | ADR-018 | **YES** for the decision (simultaneous fan-out, one logical notification) | Practically gated by the same migration/retry-value blockers as Notification worker |

A component is `READY` only when every **decision** required by that component is formally resolved — note that "Leave escalation state machine" and "Multi-device notification" are decision-ready (`YES`) even though the surrounding components that would actually exercise them in production are not yet buildable, because a specific external parameter or a not-yet-created migration remains outstanding. This distinction — decision-readiness vs. practical buildability — is deliberate and should not be collapsed when this table is read.

## 10. Explicit Semantics Table (per the "Finalize ADR-017/018 Notification Semantics" correction task)

| Decision | Final Meaning | Status |
|---|---|---|
| `manual_verification` transition | Entered from `in_app_call`'s timeout (not directly from `guardian_notified`). Requires explicit staff action to leave — never auto-expires on a per-stage timer. A parent/guardian decision remains possible throughout, per ADR-016. | ACCEPTED |
| `expired` transition | Entered **only** by explicit staff/reception action from `manual_verification`. No escalation-timer job ever transitions any stage to `expired` automatically. | ACCEPTED |
| Logical notification identity | `(leave_request_id, stage, recipient_id)`, unique-constrained. `stage` identifies the logical escalation stage. `stage` does **not** identify a delivery attempt. | ACCEPTED |
| Delivery attempt | One execution of calling the push provider for a logical notification; distinguished from other attempts of the same logical notification only by `notifications.retry_count`, never a separate identity/row. | ACCEPTED |
| Provider uncertainty | An outcome the worker cannot determine (e.g. a network timeout) is treated identically to "provider accepted, recording lost" — retried under the at-least-once model. The retry is explicitly acknowledged as potentially duplicative, not assumed safe. | ACCEPTED |
| Retry | A subsequent delivery attempt for the same logical notification (same row, `retry_count` incremented) after any of the three provider-outcome cases resolves to "not yet confirmed delivered," bounded by the (externally-set) retry-count/backoff policy. | ACCEPTED |
| DB idempotency | A conditional `UPDATE ... WHERE <expected current state>` on the relevant row (`leave_requests` for state mutation, `notifications` for send-claiming) — guarantees at most one concurrent writer's operation commits, regardless of how many times a job or worker re-executes. | ACCEPTED |
| Queue idempotency | pg-boss's native `singletonKey` reduces duplicate *scheduling* in the common case; it is explicitly documented as insufficient alone (a retried/redelivered job can still execute more than once) and is never a substitute for DB idempotency above. | ACCEPTED |
| External provider exactly-once guarantee | **Explicitly not claimed.** The system provides at-least-once notification delivery with idempotent internal processing; a recipient may, in disclosed failure-recovery scenarios, receive a duplicate push for the same logical notification. No state mutation is ever duplicated by this. | ACCEPTED |

## 11. Three Independent Idempotency Layers

These are three separate guarantees, provided by three separate mechanisms, and must not be conflated with one another:

### Database state correctness

A conditional state transition — the pattern already accepted in ADR-017 §4 (leave-side) and ADR-018 §4 (notification-send-side):

```text
UPDATE leave_requests
SET status = <new_state>
WHERE id = <request>
  AND status = <expected_state>
```

This ensures only a row whose *current* state matches what the writer expected can actually transition, regardless of how many times the writer (a decision, an escalation-stage-advance job, or a notification-send worker) is invoked concurrently or repeatedly. The exact implementation is governed by ADR-017 (leave-state mutation) and ADR-018 (notification-row mutation) — this section restates, not redecides, what those ADRs already accept.

### Logical notification uniqueness

The logical notification identity — `(leave_request_id, stage, recipient_id)`, ADR-018 §1 — combined with its uniqueness constraint (ADR-017 §5's `notifications.stage` column, migration pending) prevents more than one logical notification from ever existing for the same request/stage/recipient combination. This is a distinct guarantee from database state correctness above: state correctness governs *whether a write to an existing row succeeds*; logical notification uniqueness governs *whether a second, competing row can even be created* for the same conceptual notification.

### Queue/job uniqueness

pg-boss's `singletonKey` constrains duplicate queued/active jobs according to its configured queue policy — reducing how often a duplicate escalation-timer or notification-send job is scheduled in the common case (ADR-017 §6, ADR-018 §4's Job Design). **This is the weakest of the three layers and does not replace either of the two above.** pg-boss's own documentation notes that retries can cause a job to be processed again even where a `singletonKey` was used for scheduling-time deduplication — so application-level idempotency (the two layers above) remains necessary regardless of queue configuration. This has been this design's position since ADR-017/018 were first accepted; this section only makes the three-layer separation explicit rather than leaving it implicit across two ADRs.

## 12. Authoritative State Validation Before External Side Effects (Implementation Contract — Not Implemented)

This section documents an implementation contract for the eventual notification worker. **It is not implemented by this or any prior design task** — no worker, scheduler, or provider-calling code exists in this repository.

**Before a notification worker performs an external provider side effect, it must revalidate that the referenced leave request and escalation stage are still authoritative and actionable.** A job existing in the queue, or a `notifications` row existing in the database, is not by itself evidence that sending is still appropriate — both can become stale between when a job was scheduled and when it executes.

This protects against:

- approval occurring after the job was created (the request is no longer in the stage the job was scheduled for);
- rejection occurring after the job was created (same reason);
- the request having advanced to `manual_verification` (per §4a, automatic escalation has already ended — a queued job for an earlier automatic stage should not act);
- the request having become `expired` (terminal — nothing further should ever act on it);
- a stale escalation job (superseded by a later stage-advance, per ADR-017 §4/§6's stale-job handling);
- the recipient's relationship or trusted-device state having become invalid since the job was scheduled (per the Critical Rule, `docs/auth-database-security-model.md`, and `requireActiveTrustedDevice` — relationship/device authorization is always evaluated live, never from a snapshot taken at job-creation time).

**The queue is not authoritative. The `notifications` row is not authoritative for leave lifecycle. The authoritative leave state remains the database leave workflow** (`leave_requests.status`, evaluated at the moment of the external side effect, not at the moment the job was scheduled). This is a restatement of a principle already implicit across ADR-016 (live relationship evaluation), ADR-017 §4 ("state validation occurs before any side effect in every scenario"), and ADR-018 §4 (send-level conditional write before calling the provider) — made explicit here as a single, consolidated implementation contract rather than left to be inferred separately from three documents. It does not introduce a new mechanism, table, or column beyond what those ADRs already accept.
