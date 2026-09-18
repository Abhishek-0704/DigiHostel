import {
  and,
  asc,
  desc,
  eq,
  inArray,
  sql,
  db,
  leaveRequests,
  leaveApprovalEvents,
  leaveExitAuthorizations,
  auditLogs,
  parentStudentRelationships,
  staff,
  students,
  hostels,
  rooms,
} from "@digihostel/db";
import {
  PARENT_DECIDABLE_STATUSES,
  NEXT_ESCALATION_STAGE,
  type AuthorizeExitInput,
  type CreateLeaveRequestInput,
  type DecidableStatus,
  type DecideLeaveRequestInput,
  type ExitAuthorizationView,
  type LeaveApprovalEventView,
  type LeaveRequestStatus,
  type LeaveRequestView,
  type MarkExpiredInput,
  type StaffLeaveQueueInput,
  type StaffLeaveQueueItemView,
} from "./types.js";
import { ESCALATION_STAGE_TIMEOUT_MS } from "../../config/escalation.js";
import { PgBossJobScheduler, type JobScheduler } from "../../lib/queue/jobs.js";

/**
 * Repository boundary for the leave workflow (docs/database-schema-design.md,
 * ADR-015). Runs on the same privileged Postgres connection every other
 * backend repository uses (@digihostel/db's `db`, per ADR-006/ADR-014 —
 * Fastify's own connection is service-role/bypasses RLS by design; RLS
 * remains the independent final backstop for any direct client access path,
 * unaffected by this file). Authorization (the parent<->student relationship
 * check) is therefore enforced HERE, in application code — not assumed from
 * RLS, which does not apply to this connection.
 *
 * No UPDATE or DELETE capability is exposed for `leave_approval_events`
 * anywhere in this file — it is insert-only by construction, matching
 * ADR-015 and the table's own RLS policies (docs/rls-policy-matrix.md).
 */

export type DecideOutcome =
  | { kind: "success"; leaveRequest: LeaveRequestView }
  | { kind: "not_found" }
  | { kind: "conflict"; currentStatus: LeaveRequestStatus };

/** Phase 3, Prompt 7C — Exit Authorization outcome. Two distinct conflict
 * reasons (unlike DecideOutcome's single `currentStatus`-only shape) because
 * "not approved yet" and "already has an exit on record" are different
 * facts a caller needs to react to differently (the first can never be
 * retried by this same action; the second means someone already succeeded). */
export type ExitAuthorizationOutcome =
  | { kind: "success"; exitAuthorization: ExitAuthorizationView }
  | { kind: "not_found" }
  | { kind: "conflict"; reason: "not_approved"; currentStatus: LeaveRequestStatus }
  | { kind: "conflict"; reason: "already_authorized" };

/** Unlike DecideOutcome, "the expected stage no longer matches" is a clean
 * no-op here, never an error (ADR-017 §4) — a stale/superseded/duplicate
 * escalation-timer job must exit quietly, not surface a conflict. */
export type AdvanceOutcome =
  | { kind: "advanced"; leaveRequest: LeaveRequestView; nextStage: DecidableStatus }
  | { kind: "noop" };

export interface LeaveRepository {
  /** Loads a leave request only if `parentId` has a real
   * `parent_student_relationships` link to its student — returns null
   * otherwise, deliberately not distinguishing "doesn't exist" from "exists
   * but unrelated" (anti-enumeration, per this task's explicit requirement). */
  findAccessibleLeaveRequest(
    leaveRequestId: string,
    parentId: string,
  ): Promise<LeaveRequestView | null>;

  /** Atomically transitions the leave request, appends exactly one
   * immutable leave_approval_events row, and writes exactly one audit_logs
   * row — all three succeed together or none do. Uses a conditional
   * (optimistic-concurrency) UPDATE, not a separate read-then-write, so two
   * simultaneous calls for the same leave request cannot both succeed. */
  decide(input: DecideLeaveRequestInput): Promise<DecideOutcome>;

  /** Creates a new leave request for the given student in the schema's
   * default initial state (`pending`) and writes exactly one `audit_logs`
   * row — both in the same transaction. Does NOT write a
   * `leave_approval_events` row: that table's vocabulary (ADR-015) has no
   * "created" event type, and inserting a `notified` event here would
   * fabricate a notification that hasn't actually happened. Reception-
   * Initiated Parent Approval correction: also does NOT schedule any
   * escalation job — `pending` is a static "awaiting Reception review" state
   * until `startParentApproval()` (below) is explicitly called. */
  create(input: CreateLeaveRequestInput): Promise<LeaveRequestView>;

  /** All leave requests belonging to `studentId`, newest first. Always
   * scoped by the authenticated caller's own resolved student id — never a
   * client-supplied filter. */
  listForStudent(studentId: string): Promise<LeaveRequestView[]>;

  /** All leave requests belonging to any student `parentId` has a real
   * `parent_student_relationships` link to (any relationship_type,
   * unfiltered by escalation_order — ADR-016 Model C), newest first. Always
   * scoped by the authenticated caller's own resolved parent id — never a
   * client-supplied filter (G-05). */
  listForParent(parentId: string): Promise<LeaveRequestView[]>;

  /** Loads a leave request only if it belongs to `studentId` — returns null
   * otherwise, deliberately not distinguishing "doesn't exist" from "exists
   * but belongs to another student" (same anti-enumeration shape as
   * findAccessibleLeaveRequest). */
  findAccessibleLeaveRequestForStudent(
    leaveRequestId: string,
    studentId: string,
  ): Promise<LeaveRequestView | null>;

  /** Conditionally advances the leave request from `expectedStage` to its
   * automated next hop (ADR-017 §4/§9, corrected by ADR-019). A stale job
   * (status no longer matches `expectedStage` — already decided, already
   * advanced by another worker, or terminal) is a clean no-op, never an
   * error. On success, schedules the next evaluate job (unless the new
   * stage is `manual_verification`, which has no automatic successor) and
   * the notification-deliver job for the new stage — in the SAME
   * transaction as the state mutation (ADR-017 §7). */
  advanceEscalation(
    leaveRequestId: string,
    expectedStage: DecidableStatus,
  ): Promise<AdvanceOutcome>;

  /** Staff-only transition from `manual_verification` to the terminal
   * `expired` status (ADR-019 §2) — never automatic. Same conditional-UPDATE
   * shape as `decide()`, including hostel-scope enforcement for
   * hostel-scoped staff roles (see MarkExpiredInput's doc comment). */
  markExpired(input: MarkExpiredInput): Promise<DecideOutcome>;

  /** All immutable `leave_approval_events` rows for one leave request,
   * oldest first (Approval History, Phase 4 Prompt 10). No authorization
   * check here — the caller (LeaveService) must already have established
   * access via getForParent/getForStudent before calling this, exactly as
   * `decide()`'s own event-insert trusts its one caller's precondition. */
  listEventsForLeaveRequest(leaveRequestId: string): Promise<LeaveApprovalEventView[]>;

  /** Staff-only queue read (Reception Dashboard, Phase 3 Prompt 7A) — every
   * leave request the caller's own resolved staff role/hostel authorizes,
   * newest first with the leave request id as a stable secondary sort key.
   * `input.staffId`/`input.staffRole` are always the authenticated caller's
   * own resolved profile (routes/leave.ts) — never a client-supplied filter,
   * exactly like markExpired()'s own staff-scope input. */
  listForStaffQueue(input: StaffLeaveQueueInput): Promise<StaffLeaveQueueItemView[]>;

  /** Staff-only single-request accessibility check (Reception Dashboard,
   * Phase 3 Prompt 7B — Parent Approval Session Workspace, gating the
   * Approval-Event Timeline). Returns null for both "does not exist" and
   * "exists but outside this staff member's hostel scope" — same
   * anti-enumeration shape as findAccessibleLeaveRequest/
   * findAccessibleLeaveRequestForStudent, and the exact same hostel-scope
   * check markExpired()/listForStaffQueue() already use (safe to build now:
   * the underlying `leave_approval_events` RLS gap this depended on was
   * independently reviewed and remediated — migration
   * 0010_lae_select_staff_hostel_scope.sql — before this method was added). */
  findAccessibleLeaveRequestForStaff(
    leaveRequestId: string,
    input: StaffLeaveQueueInput,
  ): Promise<LeaveRequestView | null>;

  /** Reception-Initiated Parent Approval — the ONLY way a leave request ever
   * leaves `pending` and enters the parent-decidable/escalation lifecycle
   * (`create()` no longer schedules this automatically). Conditionally
   * transitions `pending -> father_notified` (fails closed as a clean
   * `conflict`/`not_found` outcome — never a partial write — for any other
   * current status, including a second concurrent call: the conditional
   * UPDATE's `WHERE status = 'pending'` clause is what makes "exactly one
   * caller can ever start this" a database-enforced invariant, not a
   * frontend one), same hostel-scope enforcement as
   * `markExpired()`/`listForStaffQueue()`, and — in the SAME transaction —
   * appends one `leave_approval_events` row (`manual_override`, with the
   * acting staff member's id — the one existing event type that already
   * carries staff-actor identity, per ADR-015's real vocabulary; no new
   * event type was introduced) and schedules the same follow-up jobs
   * `advanceEscalation()` would schedule for any other real stage transition
   * (the `father_notified -> mother_notified` evaluate job, and the
   * `father_notified`-stage notification-deliver job) — this is the moment
   * the real, existing notification worker (ADR-018) first actually
   * dispatches anything for this leave request. */
  startParentApproval(input: {
    leaveRequestId: string;
    actingStaffId: string;
    actingStaffRole: StaffLeaveQueueInput["staffRole"];
  }): Promise<DecideOutcome>;

  /** Phase 3, Prompt 7C — Student Verification & Exit Authorization. The
   * final Reception-side checkpoint: records that a student has physically
   * left the hostel for an already-`approved` leave request. Requires the
   * leave request to be `approved` (parent approval genuinely complete —
   * there is no separate "session expiration" concept to check beyond this:
   * a request that timed out before a parent ever decided is `expired`, not
   * `approved`, so this precondition alone already excludes it) and
   * `input.identityConfirmed === true` (a staff attestation, never
   * independently re-derived — see AuthorizeExitInput's doc comment).
   * Hostel-scoped identically to `markExpired()`/`startParentApproval()`.
   * Concurrency/duplicate-prevention is DATABASE-enforced via
   * `leave_exit_authorizations`'s `UNIQUE(leave_request_id)` constraint, not
   * merely an application-level check: two simultaneous calls can both pass
   * the initial status check, but only one INSERT can ever succeed — the
   * loser's unique-violation is caught and mapped to a clean `conflict`
   * outcome, never a raw database error and never a duplicate row. In the
   * SAME transaction as the insert: one `leave_approval_events` row
   * (`manual_override`, the same reused event type `startParentApproval()`
   * already established for a staff-initiated transition with no dedicated
   * event type of its own) and one `audit_logs` row
   * (`leave.exit_authorized`). Deliberately does NOT mutate
   * `leave_requests.status` — "the student has left" is a separate
   * authoritative fact from "the parent approved," captured by this new
   * table's own existence, not by inventing a `completed`/`exited` status
   * value (see leaveExitAuthorizations's own schema doc comment). */
  authorizeExit(input: AuthorizeExitInput): Promise<ExitAuthorizationOutcome>;
}

function toView(row: typeof leaveRequests.$inferSelect): LeaveRequestView {
  return {
    id: row.id,
    studentId: row.studentId,
    reason: row.reason,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Deliberately does not read actorParentId/actorStaffId off `row` — see
// LeaveApprovalEventView's own doc comment on why actor identity is never
// surfaced to a client.
function toEventView(row: typeof leaveApprovalEvents.$inferSelect): LeaveApprovalEventView {
  return {
    id: row.id,
    eventType: row.eventType,
    response: row.response,
    biometricConfirmed: row.biometricConfirmed,
    occurredAt: row.occurredAt.toISOString(),
  };
}

function toExitAuthorizationView(
  row: typeof leaveExitAuthorizations.$inferSelect,
): ExitAuthorizationView {
  return {
    id: row.id,
    leaveRequestId: row.leaveRequestId,
    identityConfirmed: row.identityConfirmed,
    authorizedAt: row.authorizedAt.toISOString(),
  };
}

/** Postgres unique_violation (SQLSTATE 23505). Live-verified (real Postgres
 * integration test) that drizzle-orm's postgres-js adapter does NOT surface
 * `.code` directly on the error it throws — it wraps the raw driver error
 * (which does carry `.code`) in its own `DrizzleQueryError`, attached as
 * `.cause`. Checked at both levels (rather than only the wrapper or only the
 * cause) so this stays correct regardless of which layer a given
 * drizzle-orm/postgres.js version happens to surface the code on — the
 * SQLSTATE contract is what Postgres itself guarantees, not an
 * implementation detail of either wrapper. Duck-typed, not a driver-specific
 * imported error class, for the same reason. */
function isUniqueViolation(err: unknown): boolean {
  const hasCode = (value: unknown): boolean =>
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    (value as { code: unknown }).code === "23505";
  if (hasCode(err)) return true;
  if (typeof err === "object" && err !== null && "cause" in err) {
    return hasCode((err as { cause: unknown }).cause);
  }
  return false;
}

interface StaffLeaveQueueRow {
  id: string;
  studentId: string;
  reason: string;
  startDate: string;
  endDate: string;
  status: LeaveRequestStatus;
  createdAt: Date;
  updatedAt: Date;
  studentRollNumber: string;
  studentFullName: string;
  studentHostelId: string | null;
  studentHostelName: string | null;
  studentRoomId: string | null;
  studentRoomNumber: string | null;
}

function toQueueItemView(row: StaffLeaveQueueRow): StaffLeaveQueueItemView {
  return {
    id: row.id,
    studentId: row.studentId,
    reason: row.reason,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    studentRollNumber: row.studentRollNumber,
    studentFullName: row.studentFullName,
    studentHostelId: row.studentHostelId,
    studentHostelName: row.studentHostelName,
    studentRoomId: row.studentRoomId,
    studentRoomNumber: row.studentRoomNumber,
  };
}

const relationshipExists = (parentId: string) => sql`exists (
  select 1 from ${parentStudentRelationships} psr
  where psr.student_id = ${leaveRequests.studentId} and psr.parent_id = ${parentId}
)`;

const hostelScopedForStaff = (staffId: string) => sql`exists (
  select 1 from ${staff} s
  join ${students} st on st.hostel_id = s.hostel_id
  where s.id = ${staffId} and st.id = ${leaveRequests.studentId}
)`;

export class DrizzleLeaveRepository implements LeaveRepository {
  constructor(private readonly scheduler: JobScheduler = new PgBossJobScheduler()) {}

  async findAccessibleLeaveRequest(
    leaveRequestId: string,
    parentId: string,
  ): Promise<LeaveRequestView | null> {
    const rows = await db
      .select()
      .from(leaveRequests)
      .where(and(eq(leaveRequests.id, leaveRequestId), relationshipExists(parentId)))
      .limit(1);
    return rows[0] ? toView(rows[0]) : null;
  }

  async decide(input: DecideLeaveRequestInput): Promise<DecideOutcome> {
    return db.transaction(async (tx) => {
      const updated = await tx
        .update(leaveRequests)
        .set({ status: input.decision, updatedAt: new Date() })
        .where(
          and(
            eq(leaveRequests.id, input.leaveRequestId),
            // PARENT_DECIDABLE_STATUSES, not DECIDABLE_STATUSES — Reception-
            // Initiated Parent Approval correction. A `pending` request (just
            // created, not yet explicitly sent for parent approval by
            // Reception) is deliberately NOT parent-decidable; see
            // PARENT_DECIDABLE_STATUSES's own doc comment (types.ts).
            inArray(leaveRequests.status, PARENT_DECIDABLE_STATUSES),
            relationshipExists(input.actingParentId),
          ),
        )
        .returning();

      if (updated.length === 0) {
        // Diagnose why, for a correct 404 vs 409 — still inside the
        // transaction (which will simply not commit any writes; nothing was
        // written on this path).
        const existing = await tx
          .select({ status: leaveRequests.status })
          .from(leaveRequests)
          .where(
            and(
              eq(leaveRequests.id, input.leaveRequestId),
              relationshipExists(input.actingParentId),
            ),
          )
          .limit(1);

        if (existing.length === 0) {
          return { kind: "not_found" };
        }
        return { kind: "conflict", currentStatus: existing[0].status };
      }

      const leaveRequestRow = updated[0];

      await tx.insert(leaveApprovalEvents).values({
        leaveRequestId: input.leaveRequestId,
        eventType: "responded",
        actorParentId: input.actingParentId,
        response: input.decision,
        // Always true here by contract: the service layer validates the
        // biometric-freshness gate BEFORE calling decide() and throws if it
        // fails, so reaching this line already guarantees confirmation —
        // see LeaveService.decide(). Not re-derived here; the repository
        // trusts its one caller's enforced precondition.
        biometricConfirmed: true,
      });

      await tx.insert(auditLogs).values({
        actorType: "parent",
        actorId: input.actingParentId,
        action: input.decision === "approved" ? "leave.approved" : "leave.rejected",
        entityType: "leave_requests",
        entityId: input.leaveRequestId,
        metadata: { newStatus: input.decision },
      });

      return { kind: "success", leaveRequest: toView(leaveRequestRow) };
    });
  }

  async create(input: CreateLeaveRequestInput): Promise<LeaveRequestView> {
    return db.transaction(async (tx) => {
      const inserted = await tx
        .insert(leaveRequests)
        .values({
          studentId: input.studentId,
          reason: input.reason,
          startDate: input.startDate,
          endDate: input.endDate,
          // status omitted deliberately — the schema's own default
          // (`pending`) is the single source of truth for the initial state
          // (packages/db/src/schema/leave.ts), not re-asserted here.
        })
        .returning();

      const row = inserted[0];

      await tx.insert(auditLogs).values({
        actorType: "student",
        actorId: input.studentId,
        action: "leave.created",
        entityType: "leave_requests",
        entityId: row.id,
        metadata: {},
      });

      // Reception-Initiated Parent Approval correction: NO escalation job is
      // scheduled here anymore. Before this correction, `create()` itself
      // enqueued the first `leave-escalation-stage-evaluate` job
      // (`expectedStage: "pending"`), meaning the student's own act of
      // creating a leave request automatically started the parent-
      // notification/escalation chain — a genuine product/architecture
      // mismatch, since neither the SDD's intended workflow nor any accepted
      // ADR actually specifies that student creation alone should trigger
      // parent involvement. The real workflow requires an authorized
      // Reception Warden to explicitly review the request and call
      // `startParentApproval()` (below) before any parent notification is
      // dispatched. `pending` is now a genuinely static "awaiting Reception
      // review" state — no timer is running against it, and (see
      // PARENT_DECIDABLE_STATUSES) a parent cannot decide it either. See
      // `docs/leave-escalation-notification-design.md`'s update note and
      // `apps/reception-dashboard/docs/parent-approval-session.md` §1 for
      // the full before/after account.
      return toView(row);
    });
  }

  async listForStudent(studentId: string): Promise<LeaveRequestView[]> {
    const rows = await db
      .select()
      .from(leaveRequests)
      .where(eq(leaveRequests.studentId, studentId))
      .orderBy(desc(leaveRequests.createdAt));
    return rows.map(toView);
  }

  async listForParent(parentId: string): Promise<LeaveRequestView[]> {
    const rows = await db
      .select()
      .from(leaveRequests)
      .where(relationshipExists(parentId))
      .orderBy(desc(leaveRequests.createdAt));
    return rows.map(toView);
  }

  async findAccessibleLeaveRequestForStudent(
    leaveRequestId: string,
    studentId: string,
  ): Promise<LeaveRequestView | null> {
    const rows = await db
      .select()
      .from(leaveRequests)
      .where(and(eq(leaveRequests.id, leaveRequestId), eq(leaveRequests.studentId, studentId)))
      .limit(1);
    return rows[0] ? toView(rows[0]) : null;
  }

  async advanceEscalation(
    leaveRequestId: string,
    expectedStage: DecidableStatus,
  ): Promise<AdvanceOutcome> {
    const nextStage = NEXT_ESCALATION_STAGE[expectedStage];
    if (!nextStage) {
      // manual_verification has no automatic successor (ADR-017 §9 / ADR-019
      // §2) — an evaluate job should never be scheduled against it. Defensive
      // no-op rather than a thrown error if one somehow is.
      return { kind: "noop" };
    }

    return db.transaction(async (tx) => {
      const updated = await tx
        .update(leaveRequests)
        .set({ status: nextStage, updatedAt: new Date() })
        .where(and(eq(leaveRequests.id, leaveRequestId), eq(leaveRequests.status, expectedStage)))
        .returning();

      if (updated.length === 0) {
        // Stale/superseded job: decided in the meantime, already advanced by
        // another worker, or already terminal. Nothing was written on this
        // path — clean no-op per ADR-017 §4, never an error, never a retry.
        return { kind: "noop" };
      }

      const row = updated[0];

      await tx.insert(leaveApprovalEvents).values({
        leaveRequestId,
        eventType: "escalated",
        biometricConfirmed: false,
      });

      await tx.insert(auditLogs).values({
        actorType: "system",
        actorId: null,
        action: "leave.escalated",
        entityType: "leave_requests",
        entityId: leaveRequestId,
        metadata: { fromStage: expectedStage, toStage: nextStage },
      });

      // Same-transaction follow-up scheduling (ADR-017 §7): the next hop's
      // own evaluate job (unless the new stage has no automatic successor)
      // plus this stage's notification-deliver job (ADR-018).
      if (NEXT_ESCALATION_STAGE[nextStage]) {
        await this.scheduler.enqueueEscalationJob(
          { leaveRequestId, expectedStage: nextStage },
          {
            startAfterMs: ESCALATION_STAGE_TIMEOUT_MS,
            singletonKey: `leave-request:${leaveRequestId}:stage:${nextStage}`,
            tx,
          },
        );
      }
      await this.scheduler.enqueueNotificationJob(
        { leaveRequestId, stage: nextStage },
        {
          startAfterMs: 0,
          singletonKey: `leave-request:${leaveRequestId}:notify:${nextStage}`,
          tx,
        },
      );

      return { kind: "advanced", leaveRequest: toView(row), nextStage };
    });
  }

  async markExpired(input: MarkExpiredInput): Promise<DecideOutcome> {
    const scopeCheck =
      input.actingStaffRole === "super_admin"
        ? sql`true`
        : hostelScopedForStaff(input.actingStaffId);

    return db.transaction(async (tx) => {
      const updated = await tx
        .update(leaveRequests)
        .set({ status: "expired", updatedAt: new Date() })
        .where(
          and(
            eq(leaveRequests.id, input.leaveRequestId),
            eq(leaveRequests.status, "manual_verification"),
            scopeCheck,
          ),
        )
        .returning();

      if (updated.length === 0) {
        // Same 404-vs-409 diagnosis as decide(): re-check existence+scope
        // without the status filter, still inside the transaction (nothing
        // was written on this path).
        const existing = await tx
          .select({ status: leaveRequests.status })
          .from(leaveRequests)
          .where(and(eq(leaveRequests.id, input.leaveRequestId), scopeCheck))
          .limit(1);

        if (existing.length === 0) {
          return { kind: "not_found" };
        }
        return { kind: "conflict", currentStatus: existing[0].status };
      }

      const row = updated[0];

      await tx.insert(leaveApprovalEvents).values({
        leaveRequestId: input.leaveRequestId,
        eventType: "expired",
        actorStaffId: input.actingStaffId,
        biometricConfirmed: false,
      });

      await tx.insert(auditLogs).values({
        actorType: "staff",
        actorId: input.actingStaffId,
        action: "leave.expired",
        entityType: "leave_requests",
        entityId: input.leaveRequestId,
        metadata: {},
      });

      return { kind: "success", leaveRequest: toView(row) };
    });
  }

  async listEventsForLeaveRequest(leaveRequestId: string): Promise<LeaveApprovalEventView[]> {
    const rows = await db
      .select()
      .from(leaveApprovalEvents)
      .where(eq(leaveApprovalEvents.leaveRequestId, leaveRequestId))
      .orderBy(asc(leaveApprovalEvents.occurredAt));
    return rows.map(toEventView);
  }

  async listForStaffQueue(input: StaffLeaveQueueInput): Promise<StaffLeaveQueueItemView[]> {
    const scopeCheck =
      input.staffRole === "super_admin" ? sql`true` : hostelScopedForStaff(input.staffId);

    const rows = await db
      .select({
        id: leaveRequests.id,
        studentId: leaveRequests.studentId,
        reason: leaveRequests.reason,
        startDate: leaveRequests.startDate,
        endDate: leaveRequests.endDate,
        status: leaveRequests.status,
        createdAt: leaveRequests.createdAt,
        updatedAt: leaveRequests.updatedAt,
        studentRollNumber: students.rollNumber,
        studentFullName: students.fullName,
        studentHostelId: students.hostelId,
        studentHostelName: hostels.name,
        studentRoomId: students.roomId,
        studentRoomNumber: rooms.roomNumber,
      })
      .from(leaveRequests)
      .innerJoin(students, eq(students.id, leaveRequests.studentId))
      .leftJoin(hostels, eq(hostels.id, students.hostelId))
      .leftJoin(rooms, eq(rooms.id, students.roomId))
      .where(scopeCheck)
      .orderBy(desc(leaveRequests.createdAt), asc(leaveRequests.id));

    return rows.map((row) =>
      toQueueItemView({
        ...row,
        studentHostelId: row.studentHostelId ?? null,
        studentHostelName: row.studentHostelName ?? null,
        studentRoomId: row.studentRoomId ?? null,
        studentRoomNumber: row.studentRoomNumber ?? null,
      }),
    );
  }

  async findAccessibleLeaveRequestForStaff(
    leaveRequestId: string,
    input: StaffLeaveQueueInput,
  ): Promise<LeaveRequestView | null> {
    const scopeCheck =
      input.staffRole === "super_admin" ? sql`true` : hostelScopedForStaff(input.staffId);

    const rows = await db
      .select()
      .from(leaveRequests)
      .where(and(eq(leaveRequests.id, leaveRequestId), scopeCheck))
      .limit(1);
    return rows[0] ? toView(rows[0]) : null;
  }

  async startParentApproval(input: {
    leaveRequestId: string;
    actingStaffId: string;
    actingStaffRole: StaffLeaveQueueInput["staffRole"];
  }): Promise<DecideOutcome> {
    const scopeCheck =
      input.actingStaffRole === "super_admin"
        ? sql`true`
        : hostelScopedForStaff(input.actingStaffId);
    // Literal, not NEXT_ESCALATION_STAGE.pending — that lookup types as
    // `DecidableStatus | undefined` (Partial<Record<...>>), which would
    // force an unsafe assertion below for a value that is, in practice,
    // always defined (DECIDABLE_STATUSES's own derivation guarantees
    // "pending" maps to "father_notified"). The literal IS that same real
    // value; NEXT_ESCALATION_STAGE remains the single source of truth for
    // every OTHER transition in this file (advanceEscalation).
    const nextStage: DecidableStatus = "father_notified";

    return db.transaction(async (tx) => {
      // Same conditional-UPDATE / hostel-scope shape as markExpired(): the
      // WHERE clause's `status = 'pending'` is what makes "exactly one
      // caller can ever successfully start this" a database invariant —
      // two concurrent calls (double-click, two tabs, a network retry) can
      // both reach this statement, but only one UPDATE actually matches a
      // row; the other sees `updated.length === 0` and falls into the
      // conflict branch below, exactly like a second decide() or
      // markExpired() call would.
      const updated = await tx
        .update(leaveRequests)
        .set({ status: nextStage, updatedAt: new Date() })
        .where(
          and(
            eq(leaveRequests.id, input.leaveRequestId),
            eq(leaveRequests.status, "pending"),
            scopeCheck,
          ),
        )
        .returning();

      if (updated.length === 0) {
        const existing = await tx
          .select({ status: leaveRequests.status })
          .from(leaveRequests)
          .where(and(eq(leaveRequests.id, input.leaveRequestId), scopeCheck))
          .limit(1);

        if (existing.length === 0) {
          return { kind: "not_found" };
        }
        return { kind: "conflict", currentStatus: existing[0].status };
      }

      const row = updated[0];

      // manual_override — the one existing leave_approval_events type that
      // already carries staff-actor identity (ADR-015's real vocabulary; no
      // new event type introduced for this correction).
      await tx.insert(leaveApprovalEvents).values({
        leaveRequestId: input.leaveRequestId,
        eventType: "manual_override",
        actorStaffId: input.actingStaffId,
        biometricConfirmed: false,
      });

      await tx.insert(auditLogs).values({
        actorType: "staff",
        actorId: input.actingStaffId,
        action: "leave.parent_approval_started",
        entityType: "leave_requests",
        entityId: input.leaveRequestId,
        metadata: { toStage: nextStage },
      });

      // Same follow-up scheduling advanceEscalation() applies for any other
      // real stage transition (ADR-017 §7): the next hop's own evaluate job,
      // plus this stage's notification-deliver job — this is the moment the
      // real, existing notification worker first actually dispatches
      // anything for this leave request (ADR-018).
      if (NEXT_ESCALATION_STAGE[nextStage]) {
        await this.scheduler.enqueueEscalationJob(
          { leaveRequestId: input.leaveRequestId, expectedStage: nextStage },
          {
            startAfterMs: ESCALATION_STAGE_TIMEOUT_MS,
            singletonKey: `leave-request:${input.leaveRequestId}:stage:${nextStage}`,
            tx,
          },
        );
      }
      await this.scheduler.enqueueNotificationJob(
        { leaveRequestId: input.leaveRequestId, stage: nextStage },
        {
          startAfterMs: 0,
          singletonKey: `leave-request:${input.leaveRequestId}:notify:${nextStage}`,
          tx,
        },
      );

      return { kind: "success", leaveRequest: toView(row) };
    });
  }

  async authorizeExit(input: AuthorizeExitInput): Promise<ExitAuthorizationOutcome> {
    const scopeCheck =
      input.actingStaffRole === "super_admin"
        ? sql`true`
        : hostelScopedForStaff(input.actingStaffId);

    // The try/catch wraps the ENTIRE transaction, not just the INSERT
    // statement inside it — live-verified (real Postgres) that this matters:
    // once a statement inside a Postgres transaction fails, the transaction
    // itself is left in an aborted state at the protocol level, so catching
    // the error INSIDE the callback and returning a normal value would make
    // drizzle's transaction wrapper attempt to COMMIT an already-aborted
    // transaction — which fails again, asynchronously, outside this
    // function's own control flow entirely. Letting the error propagate out
    // of the callback lets `db.transaction()` roll back correctly first (the
    // same mechanism every other error path in this file already relies on
    // implicitly, since none of them previously needed to catch a specific
    // driver error and keep using the same transaction afterward); only
    // AFTER that rollback do we classify the error and return a clean
    // outcome instead of throwing.
    try {
      return await db.transaction(async (tx) => {
        // Load + scope-check first — this needs the leave request's current
        // status regardless of which outcome results, and the scope check
        // must gate visibility itself (anti-enumeration: a cross-hostel id
        // must look identical to a nonexistent one).
        const rows = await tx
          .select({ status: leaveRequests.status })
          .from(leaveRequests)
          .where(and(eq(leaveRequests.id, input.leaveRequestId), scopeCheck))
          .limit(1);

        if (rows.length === 0) {
          return { kind: "not_found" };
        }
        const { status } = rows[0];
        if (status !== "approved") {
          return { kind: "conflict", reason: "not_approved", currentStatus: status };
        }

        // The UNIQUE(leave_request_id) constraint on leave_exit_authorizations
        // is the actual concurrency backstop — two simultaneous calls can
        // both reach this point (both saw status = 'approved'), but only one
        // INSERT can ever succeed. The loser's unique-violation propagates
        // out of this callback (see the outer try/catch's own comment) and
        // is mapped to a clean conflict outcome there — never a raw database
        // error and never a duplicate row, the same "exactly one caller can
        // ever succeed" guarantee decide()/markExpired()/startParentApproval()
        // get from their own conditional UPDATE, adapted to an INSERT-only
        // table.
        const inserted = await tx
          .insert(leaveExitAuthorizations)
          .values({
            leaveRequestId: input.leaveRequestId,
            authorizedByStaffId: input.actingStaffId,
            identityConfirmed: input.identityConfirmed,
          })
          .returning();
        const row = inserted[0];

        // manual_override — the same reused event type startParentApproval()
        // already established for a staff-initiated transition with no
        // dedicated event type of its own (ADR-015's real vocabulary; no new
        // event type introduced here either).
        await tx.insert(leaveApprovalEvents).values({
          leaveRequestId: input.leaveRequestId,
          eventType: "manual_override",
          actorStaffId: input.actingStaffId,
          biometricConfirmed: false,
        });

        await tx.insert(auditLogs).values({
          actorType: "staff",
          actorId: input.actingStaffId,
          action: "leave.exit_authorized",
          entityType: "leave_requests",
          entityId: input.leaveRequestId,
          metadata: {},
        });

        return { kind: "success", exitAuthorization: toExitAuthorizationView(row) };
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return { kind: "conflict", reason: "already_authorized" };
      }
      throw err;
    }
  }
}
