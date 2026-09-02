import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  leaveRequests,
  leaveApprovalEvents,
  auditLogs,
  parentStudentRelationships,
} from "@digihostel/db";
import {
  DECIDABLE_STATUSES,
  type CreateLeaveRequestInput,
  type DecideLeaveRequestInput,
  type LeaveRequestStatus,
  type LeaveRequestView,
} from "./types.js";

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

  /** Loads a leave request only if it belongs to `studentId` — returns null
   * otherwise, deliberately not distinguishing "doesn't exist" from "exists
   * but belongs to another student" (same anti-enumeration shape as
   * findAccessibleLeaveRequest). */
  findAccessibleLeaveRequestForStudent(
    leaveRequestId: string,
    studentId: string,
  ): Promise<LeaveRequestView | null>;
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

export class DrizzleLeaveRepository implements LeaveRepository {
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
}
