import {
  and,
  desc,
  eq,
  inArray,
  sql,
  db,
  leaveRequests,
  leaveApprovalEvents,
  auditLogs,
  parentStudentRelationships,
  staff,
  students,
} from "@digihostel/db";
import {
  DECIDABLE_STATUSES,
  NEXT_ESCALATION_STAGE,
  type CreateLeaveRequestInput,
  type DecidableStatus,
  type DecideLeaveRequestInput,
  type LeaveRequestStatus,
  type LeaveRequestView,
  type MarkExpiredInput,
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
   * fabricate a notification that hasn't actually happened (the escalation
   * scheduler is out of scope). */
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
            inArray(leaveRequests.status, DECIDABLE_STATUSES),
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

      // First escalation-timer job (ADR-017/ADR-019): pending's own timeout
      // is what fires the first notification (father) — see ADR-019 §3's
      // canonical diagram, whose pending->father_notified edge is timed,
      // not immediate. Enqueued in this same transaction (ADR-017 §7).
      await this.scheduler.enqueueEscalationJob(
        { leaveRequestId: row.id, expectedStage: "pending" },
        {
          startAfterMs: ESCALATION_STAGE_TIMEOUT_MS,
          singletonKey: `leave-request:${row.id}:stage:pending`,
          tx,
        },
      );

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
}
