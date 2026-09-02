# Parent Leave Approval Workflow (and Student Leave Request Creation)

The first real DigiHostel business workflow. Implements ADR-015's domain model and `docs/auth-database-security-model.md`'s authorization boundary end-to-end. No new architectural decisions were introduced — this document records how the already-accepted architecture was applied, not a new one.

A second task extended the same workflow with the student-facing side —
creating and viewing leave requests — reusing this exact architecture (no
second leave service, no new table). See "Student Leave Request Creation"
below.

## Implementation

`apps/api/src/domain/leave/` — `types.ts` (view types, decidable/terminal status sets, `CreateLeaveRequestInput`), `errors.ts` (typed domain errors), `repository.ts` (`LeaveRepository` interface + `DrizzleLeaveRepository`), `service.ts` (`LeaveService`, the only thing routes call). `apps/api/src/routes/leave.ts` — thin Fastify handlers (validate → call service → map errors to HTTP). `apps/api/src/plugins/leave.ts` — wires `app.leaveService` (same decorator pattern as `plugins/auth.ts`).

Layering: **route → authorization (Fastify guards) → leave service → repository → Postgres**, per this task's required structure. Routes never touch the repository or Drizzle directly.

## State Transitions

Uses the existing `leave_request_status` enum (`packages/db/src/schema/enums.ts`) — no second state vocabulary. Two derived sets, defined once in `types.ts`:

- **Decidable** (a decision may be applied): `pending`, `father_notified`, `mother_notified`, `guardian_notified`, `in_app_call`, `manual_verification`. The escalation-notification states are included because they are already part of the schema's state machine (SDD Ch.5) and nothing about accepting a decision should depend on which escalation step produced the current state — only the escalation *scheduler* that would move a request into those states is out of scope for this task, not the decision endpoint's ability to handle them once they exist.
- **Terminal** (no further decision possible): `approved`, `rejected`, `expired`.

`pending → approved` and `pending → rejected` are exercised end-to-end by this task (nothing yet creates the escalation states or `expired`). Any decision attempt against a terminal-state request returns `409 Conflict` with the current status; it is never silently overwritten.

## Authorization Boundary

```
Supabase Auth JWT
      ↓
Fastify authenticate           (apps/api/src/lib/auth/guards.ts, unchanged)
      ↓
requireParentOrGuardian()      (role check — proves "some parent/guardian")
      ↓
requireActiveTrustedDevice()   (approve/reject only — real, DB-backed; GET does not require it)
      ↓
LeaveService                    (relationship check happens HERE, not as a route param)
      ↓
LeaveRepository                 (single query: WHERE id = X AND EXISTS(relationship) — the
                                 relationship check and the row load are the same query, so
                                 "wrong id" and "right id, wrong parent" are indistinguishable)
      ↓
PostgreSQL RLS                  (independent, unchanged, final backstop — see below)
```

**Critical rule honored**: `student_id` is never read from anything the client supplies. The route only ever receives `leaveRequestId`; the student it belongs to, and whether the caller is related to that student, are both resolved from PostgreSQL inside the same query. A caller cannot supply a `studentId` to claim authorization — there is no such parameter anywhere in this API.

**Anti-enumeration**: `LeaveRequestNotFoundError` is thrown identically for "this ID doesn't exist" and "this ID exists but belongs to a student I have no relationship with." Verified by a dedicated test (`service.test.ts`) asserting both cases produce the exact same error message, and by a route-level 404 test.

**RLS remains the final boundary, unweakened.** Fastify's own Postgres connection is the pre-existing privileged/service-role connection (ADR-006, ADR-014) that already bypasses RLS by design — this was true before this task and is unchanged by it. Because of that, the parent↔student relationship check is *also* enforced in application code here (`repository.ts`'s `relationshipExists` subquery), matching what RLS independently enforces for any direct client access path. No RLS policy was modified; the existing 41 pgTAP assertions (`supabase/tests/database/`) were re-run and still pass unchanged.

## Consistency

The transaction is a single `db.transaction()` covering all three writes — the status update, the `leave_approval_events` insert, and the `audit_logs` insert commit or roll back together; there is no code path that can commit one without the others. Verified against real local Postgres (`repository.integration.test.ts`), not just asserted.

**Concurrency**: the status transition is a conditional `UPDATE ... WHERE status IN (decidable) AND EXISTS(relationship)`, not a read-then-write. Two simultaneous decisions on the same leave request race on this single UPDATE; Postgres's normal row-level locking means only one commits, and the other's WHERE clause no longer matches once it re-evaluates (the row is now in a terminal state) — it deterministically receives `{ kind: "conflict" }`. Verified with two real, concurrently-fired transactions against local Postgres, not simulated.

**Approval events are immutable.** `LeaveRepository` exposes no update/delete capability for `leave_approval_events` at all — insert-only, matching ADR-015. The RLS-level guarantee (no role, including the privileged connection's own callers if they went through the RLS-scoped path, may UPDATE/DELETE an existing event) is unchanged and was re-verified via the existing `07_approval_immutability.sql` pgTAP suite.

## Biometric Confirmation — Known Limitation

`leave_approval_events`'s RLS policy requires `biometric_confirmed = true` for any response-bearing insert, and SDD Ch.5 §5.2 requires biometric confirmation before every approval decision. No real biometric provider exists yet (explicitly out of scope for this task). The service calls `BiometricFreshnessGate.checkFreshness()` (interface already established in `lib/auth/security-gates.ts`) before touching the repository; the production-wired implementation, `AssertionPresenceBiometricFreshnessGate`, **only checks that the client supplied a non-empty, action-bound assertion token — it does not cryptographically verify a real biometric event occurred.** This is a deliberate, documented placeholder (see that class's doc comment), not equivalent to real verification, and is the primary genuine follow-up before this system handles real users.

## Student Leave Request Creation

Adds `POST /leave-requests` (create) and `GET /leave-requests` (list own) to the same `LeaveService`/`LeaveRepository`/`leave.ts` routes — no second service, no new table, no schema/migration change (`leave_requests` already had `student(self)` INSERT/SELECT RLS policies from the original schema design; this task only added the Fastify-side path to reach them). `GET /leave-requests/{leaveRequestId}` was extended, not duplicated: it now branches on the caller's resolved profile kind (`student` → `LeaveService.getForStudent`, `parent` → the pre-existing `LeaveService.getForParent`, anything else → `403`) rather than gating the whole route behind `requireParentOrGuardian()` as before.

**Identity/ownership**: `POST /leave-requests` never accepts a `studentId` field — the Zod body schema is `.strict()` (an included `studentId` is rejected as an unrecognized key, verified by a dedicated test). The student id used for the insert always comes from `request.auth.profile.id`, resolved by the pre-existing `requireStudent()` guard + `resolveAppProfile()`/`auth_user_id` chain — the same Critical Rule already documented above for parents.

**Initial state**: the schema's own `leave_requests.status` column default (`pending`) is the single source of truth — `DrizzleLeaveRepository.create()` deliberately omits `status` from its INSERT rather than re-asserting `"pending"` itself.

**No fabricated approval event on creation**: `leave_approval_events`'s vocabulary (`notified` | `responded` | `escalated` | `expired` | `manual_override`, ADR-015) has no "created" event type, and nothing about creation constitutes a notification actually being sent (the escalation scheduler is out of scope). Creation therefore writes **only** a `leave_requests` INSERT plus one `audit_logs` row (`action: "leave.created"`) in the same transaction — atomic, verified against real Postgres — and zero `leave_approval_events` rows.

**Validation** (`routes/leave.ts`, Zod, no DB access in the validation phase): `reason` (1–1000 chars, trimmed, non-empty), `startDate`/`endDate` (`YYYY-MM-DD`, round-tripped through `Date.UTC` to reject impossible calendar dates like `2026-02-30`, not just regex-matched), `endDate >= startDate` (object-level `.refine()`), and `.strict()` (rejects any unrecognized field, including a client-supplied `studentId`). The 1000-char `reason` limit is an API-layer choice, not a schema constraint — the underlying column is unconstrained `text`; flagged here rather than silently treated as a schema fact.

**Duplicate/overlapping requests**: neither the SDD nor `docs/database-schema-design.md`/ADR-015 defines a uniqueness or overlap restriction on `leave_requests` (no partial-unique index, no application check anywhere in the existing schema). Per this task's explicit instruction not to invent a business rule the spec doesn't state, none was added — a student may currently have multiple `pending` (or otherwise non-terminal) requests simultaneously, including with overlapping date ranges. This is a documented absence, not an oversight; introducing such a restriction is a genuine follow-up if a future task confirms the business requirement.

**No modification/cancellation**: not implemented, since neither the SDD nor the current schema defines one (no `cancelled` status, no update path for student-authored fields). Out of scope per this task's explicit instruction not to expand beyond what the spec already defines.

**Destination/location field**: the schema has no such column (`packages/db/src/schema/leave.ts`'s `leave_requests` — only `reason`, `start_date`, `end_date`) and the SDD text does not define one either. Per this task's explicit instruction to use only already-supported fields, none was added.

**Parent-workflow compatibility**: verified end-to-end (route-level test and a real-Postgres integration test) — a student-created `pending` request is immediately readable and approvable by a linked parent through the unmodified existing `decide()` path, producing exactly one `leave_approval_events` row and a second `audit_logs` row (`leave.approved`), alongside the creation-time `leave.created` row. No change was made to `LeaveService.decide()`, `DrizzleLeaveRepository.decide()`, or the approve/reject routes.

## Hardening / Authorization Verification

A third task hardened and verified (rather than redesigned) the parent/guardian approval path. No authorization mechanism, table, or workflow semantic changed — this section records what was verified and the one validation tightening made.

**Guardian access — confirmed, not fabricated**: guardian is not a separate profile kind, role, or table — it is the same `parents` row + `parent_student_relationships` link as father/mother, distinguished only by `relationship_type` (per ADR-001's rationale). `relationshipExists()`/`requireParentOrGuardian()` never inspect `relationship_type`, so a `relationship_type: "guardian"` row is authorized identically to `"father"`/`"mother"` for both read and decide — proven directly against real Postgres (`repository.integration.test.ts`'s guardian tests), not merely inferred from the code. The existing `04_guardian_relationship.sql` pgTAP file already covered guardian visibility at the `students` RLS layer; this task added the equivalent proof at the `leave_requests`/`leave_approval_events` layer.

**Staff — confirmed no route-level bypass**: every staff role (`reception_warden`, `hostel_admin`, `super_admin`, `library_incharge`) receives `403` on `GET`/`approve`/`reject` — there is no staff branch anywhere in `routes/leave.ts`. This matches `docs/rls-policy-matrix.md`'s `leave_requests` row, where reception/hostel_admin/super_admin access is a direct-RLS/manual-fallback path, not a Fastify route this API exposes.

**Full terminal-state matrix verified**: previously only `approved → approve` and one `expired → approve` case were tested; this task added `approved → reject`, `rejected → approve`, and `rejected → reject` (route-level `it.each`), closing the matrix.

**Decision-body schema tightened to `.strict()`** (`routes/leave.ts`'s `decisionBodySchema` and `paramsSchema`), matching the convention the student-creation task already established for `createLeaveRequestBodySchema`. Previously an unrecognized top-level or nested `biometricAssertion` field was silently stripped rather than rejected — now both reject with `400`. `packages/api-spec/openapi.yaml`'s `BiometricAssertion`/`LeaveDecisionRequest` gained `additionalProperties: false` to match; Orval regenerated.

**Documentation-only finding, not a code change**: `docs/rls-policy-matrix.md` and `docs/database-schema-design.md` both stated that Fastify enforces "only the party matching the current escalation step" may decide. Neither RLS nor `LeaveService.decide()` has ever actually done this — the Parent Leave Approval task deliberately scoped decisions to "any linked parent/guardian, any decidable status" (see "State Transitions" above), but that decision was never propagated back to those two earlier design docs, leaving them stale/contradictory. Corrected in both files, and **formally resolved and accepted as [ADR-016](adr/ADR-016-leave-escalation-approval-authority.md)** — see "Escalation & Notification — Design Status" below.

**Anti-enumeration extended**: added a route-level check that a nonexistent id and a real-but-unrelated id produce byte-identical 404 response bodies (not just equal error messages at the unit-test level, which already existed).

## Escalation & Notification — Design Status

**Designed and formally accepted; not yet implemented.** A design milestone, a correction pass, and a final governance-resolution pass produced:

- `docs/leave-escalation-notification-design.md` — the final 26-row Escalation Decision Matrix plus a supplementary state/notification-semantics table, each row cited against SDD chapters/FRs/accepted ADRs/existing schema, with two decisions explicitly left external (see below).
- [ADR-016](adr/ADR-016-leave-escalation-approval-authority.md) (**ACCEPTED**) — Model C: escalation controls notification priority only; approval authority is relationship-based, exactly as already implemented. Ratifies existing, already-tested behavior with zero code change.
- [ADR-017](adr/ADR-017-leave-escalation-orchestration-model.md) (**ACCEPTED, §9 partially superseded by ADR-019**) — the **Leave Approval Service's** side of escalation (SDD Ch.11 §11.3): `leave_requests.status`'s precise meaning, the escalation-deadline timestamp (`updated_at`), the full race-resolution invariant covering all required decision-vs-escalation scenarios, generation/attempt identity (a `notifications.stage` column — decided, migration not yet created), transaction boundary, and crash recovery all remain fully authoritative. Its original `manual_verification`/`expired` transition-sequencing claim (§9) was found factually wrong and is corrected by ADR-019, below.
- [ADR-018](adr/ADR-018-notification-delivery-reliability.md) (**ACCEPTED**, new) — the **Notification Service's** side (SDD Ch.11 §11.3): notification identity (`stage` identifies the logical notification, never an individual delivery attempt), the attempt/retry/failure vocabulary, send-level idempotency, the three provider-outcome cases (rejected/accepted/unknown, all resolved under the same at-least-once model, with an explicit no-exactly-once statement), invalid-token handling (never auto-revokes device trust), multi-device fan-out (simultaneous, one logical notification), and push-content privacy (never names another parent). Split from an earlier, broader draft of ADR-017 once SDD Ch.11's own two-service boundary was verified.
- [ADR-019](adr/ADR-019-leave-escalation-state-sequencing-correction.md) (**ACCEPTED**, new) — corrects ADR-017 §9 only: the automated chain advances `guardian_notified` → `in_app_call` → `manual_verification` (not a direct hop, as ADR-017 §9 incorrectly stated — FR-007 and the schema's own `DECIDABLE_STATUSES` ordering both name `in_app_call` as a required intermediate stage), and `expired` is reached **only** by explicit staff/reception action from `manual_verification`, never by an automatic timer (ADR-017 §9's invented "absolute lifecycle bound" claim, unsupported by any source, is retracted). ADR-017 §9's separate claim — `manual_verification` requires explicit staff action — is unaffected and remains authoritative. ADR-017's original text is preserved unedited, per the ADR immutability rule; ADR-019 is the sanctioned correction mechanism, not a silent rewrite.

**Correction note (preserved from the prior revision)**: an earlier version of the design record stated, without sufficient qualification, that `leave_requests.status` "represents the escalation chain." Re-verification found this imprecise and ADR-017 §1 now states the corrected, final position: `status` is one physical column flattening two genuinely distinct concepts — **leave lifecycle state** and **escalation stage** — already correctly handled in code via `DECIDABLE_STATUSES`/`TERMINAL_STATUSES`, and does **not** represent a third dimension, **escalation execution state**, which is now fully resolved (deadline via `updated_at`, generation identity via the pending `notifications.stage` migration) rather than merely flagged as a gap. No schema change resulted from the terminology correction itself.

**Automatic escalation boundary, stated explicitly**: automatic escalation terminates when `manual_verification` is entered. `manual_verification` itself is **not terminal** — it remains a decidable workflow state (unchanged in `DECIDABLE_STATUSES`). After that point: no further automatic contact escalation occurs; the request remains actionable; an authorised parent/guardian decision remains possible (ADR-016); staff may perform the defined manual-verification workflow (the existing `manual_override` path, ADR-015); staff may eventually mark the request `expired` (ADR-019) — the only path to that terminal state. `manual_verification` and `expired` are never the same thing and are not described interchangeably anywhere in this document.

**Two genuinely external decisions remain, and only these two block implementation**: the exact escalation-interval duration, and the exact notification retry-count/backoff schedule — both product/operational parameters with no ADR mechanism, per the Implementation Gate in `docs/leave-escalation-notification-design.md`. A small, already-specified migration (`notifications.stage` + a uniqueness constraint, ADR-017 §5) is also a concrete prerequisite for ADR-018-dependent components specifically, not yet created. This document's "State Transitions" and "Not Implemented" sections above remain accurate — **no code has changed**; the leave-side state machine's ADR-level decisions are all accepted, but no scheduler, worker, or push integration exists yet.

## Not Implemented (explicitly out of scope for this task)

Mobile UI, push notifications, the escalation scheduler (so only `pending` is reachable today), a real biometric provider, SIM verification, device attestation provider, realtime events for leave status, the library workflow. `docs/auth-database-security-model.md` and `lib/auth/security-gates.ts` already define the interfaces these will integrate against.

## Local Testing

- `apps/api/src/domain/leave/service.test.ts` — business-logic unit tests, fake repository, no database. Includes student creation/listing/ownership (`LeaveService — student creation and ownership`).
- `apps/api/src/routes/leave.test.ts` — full HTTP-level tests via `app.inject()`, fake JWT verifier (real ES256 crypto, offline) and fake repository/gate — no live Supabase project, local or remote. Includes student creation validation (malformed/impossible dates, end-before-start, oversized/empty `reason`, strict-schema rejection of an extra field including a client-supplied `studentId`), list-scoping, GET-by-id ownership (owning student allowed, a different student denied identically to a nonexistent id, staff denied), a creation→parent-approval compatibility flow plus explicit "student cannot approve/reject their own request" tests, and (added by the hardening task) unrelated-parent approve/reject denial, staff approve/reject denial across all four staff roles, malformed-UUID rejection on all three id-bearing routes, the full terminal-state matrix, strict decision-body validation, and a byte-identical-404-body anti-enumeration check.
- `apps/api/src/domain/leave/repository.integration.test.ts` — real local Postgres, skipped automatically unless `DATABASE_URL` is set (keeps the default `pnpm test` Docker-independent); run explicitly against `supabase start`'s local instance for the atomicity/concurrency proof, the creation-atomicity/list-scoping/ownership tests, and (added by the hardening task) the guardian-relationship proof and the full 10-step create→read→decide→verify-DB-state→student-sees-terminal-state→second-decision-fails flow, run for both the approve and reject variants.
- Manual production-runtime smoke test: signed in via the real local GoTrue `/auth/v1/signup` endpoint (not a hand-crafted `auth.users` row), inserted ordinary domain fixtures (including, for the student-creation task, a `students` row linking the real `auth.users.id` to a student profile), hit the compiled `node apps/api/dist/index.js` server directly — exercised `POST /leave-requests`, `GET /leave-requests`, and `GET /leave-requests/{id}` end-to-end. All test/fixture data was removed afterward via `supabase db reset`.
