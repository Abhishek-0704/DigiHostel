import {
  and,
  eq,
  sql,
  db,
  movements,
  leaveRequests,
  leaveExitAuthorizations,
  leaveApprovalEvents,
  auditLogs,
  staff,
  students,
} from "@digihostel/db";
import type { RecordHostelReturnInput, HostelReturnView } from "./types.js";

/**
 * Repository boundary for the Movement Engine (Phase 4, Prompt 9). Runs on
 * the same privileged Postgres connection every other backend repository
 * uses — Fastify's own connection is service-role and bypasses RLS by
 * design (ADR-006/ADR-014); hostel-scope and workflow-state authorization
 * are therefore enforced HERE, in application code, mirroring
 * `DrizzleLeaveRepository.authorizeExit()`'s exact shape (this repository
 * is deliberately a close structural twin of that method — same
 * try/catch-around-the-whole-transaction discipline, learned live during
 * Prompt 7C: catching a unique-violation INSIDE the transaction callback
 * leaves Postgres in an aborted protocol state, causing an async COMMIT
 * failure outside the method's control flow).
 */

export type RecordHostelReturnOutcome =
  | { kind: "success"; hostelReturn: HostelReturnView }
  | { kind: "not_found" }
  | { kind: "conflict"; reason: "not_eligible"; currentStatus?: string }
  | { kind: "conflict"; reason: "already_returned" };

export interface MovementRepository {
  /** Records a hostel return for the given leave request. Requires the
   * leave request to already be `approved` AND to already have a
   * `leave_exit_authorizations` row (the student must have genuinely been
   * marked as exited before a return can be recorded — this repository
   * never fabricates an exit that never happened). Hostel-scoped
   * identically to `authorizeExit()`. Concurrency/duplicate-prevention is
   * DATABASE-enforced via `movements`'s own
   * `UNIQUE(leave_request_id, movement_type)` constraint, not merely an
   * application-level check. In the SAME transaction as the insert: one
   * `leave_approval_events` row (`manual_override`, the same reused event
   * type `authorizeExit()`/`startParentApproval()` already established)
   * and one `audit_logs` row (`movement.hostel_return_recorded`).
   * Deliberately does NOT mutate `leave_requests.status` and does NOT
   * introduce a `students.status`/presence column — "the student has
   * returned" is captured entirely by this new row's own existence,
   * matching the exact discipline `leave_exit_authorizations` already
   * established for "the student has exited." A caller's "is this student
   * currently inside or outside the hostel" question is answered by
   * deriving it from (approved leave + exit authorization exists + no
   * movements row yet) = outside, everything else = inside — never a
   * separately stored, potentially-contradictory status field. */
  recordHostelReturn(input: RecordHostelReturnInput): Promise<RecordHostelReturnOutcome>;
}

/** Postgres unique_violation (SQLSTATE 23505) — duck-typed the same way
 * `DrizzleLeaveRepository.isUniqueViolation` is, for the identical reason
 * (drizzle-orm's postgres-js adapter wraps the raw driver error, which
 * carries `.code`, inside its own `DrizzleQueryError`, attached as
 * `.cause`). Checked at both levels so this stays correct regardless of
 * which layer a given drizzle-orm/postgres.js version surfaces the code on. */
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

function toHostelReturnView(row: typeof movements.$inferSelect): HostelReturnView {
  return {
    id: row.id,
    leaveRequestId: row.leaveRequestId,
    studentId: row.studentId,
    occurredAt: row.occurredAt.toISOString(),
  };
}

export class DrizzleMovementRepository implements MovementRepository {
  async recordHostelReturn(input: RecordHostelReturnInput): Promise<RecordHostelReturnOutcome> {
    // Load + scope-check the leave request first, using the leave
    // request's own student to resolve hostel scope (mirrors
    // authorizeExit()'s identical two-step: load-with-scope, then
    // insert-with-unique-constraint-as-backstop).
    const scopeCheck =
      input.staffRole === "super_admin"
        ? sql`true`
        : sql`exists (
            select 1 from ${staff} s
            join ${students} st on st.hostel_id = s.hostel_id
            where s.id = ${input.staffId} and st.id = ${leaveRequests.studentId}
          )`;

    try {
      return await db.transaction(async (tx) => {
        const rows = await tx
          .select({ status: leaveRequests.status, studentId: leaveRequests.studentId })
          .from(leaveRequests)
          .where(and(eq(leaveRequests.id, input.leaveRequestId), scopeCheck))
          .limit(1);

        if (rows.length === 0) {
          return { kind: "not_found" };
        }
        const { status, studentId } = rows[0];
        if (status !== "approved") {
          return { kind: "conflict", reason: "not_eligible", currentStatus: status };
        }

        const exitAuthRows = await tx
          .select({ id: leaveExitAuthorizations.id })
          .from(leaveExitAuthorizations)
          .where(eq(leaveExitAuthorizations.leaveRequestId, input.leaveRequestId))
          .limit(1);
        if (exitAuthRows.length === 0) {
          // Approved, but never actually exit-authorized — "Exit
          // Authorized" and "Student Actually Exited" are deliberately
          // distinguished by this system (see this repository's own doc
          // comment); a return can never be recorded without the latter
          // genuinely existing first.
          return { kind: "conflict", reason: "not_eligible" };
        }

        const inserted = await tx
          .insert(movements)
          .values({
            studentId,
            movementType: "hostel_return",
            leaveRequestId: input.leaveRequestId,
            recordedByStaffId: input.staffId,
          })
          .returning();
        const row = inserted[0];

        await tx.insert(leaveApprovalEvents).values({
          leaveRequestId: input.leaveRequestId,
          eventType: "manual_override",
          actorStaffId: input.staffId,
          biometricConfirmed: false,
        });

        await tx.insert(auditLogs).values({
          actorType: "staff",
          actorId: input.staffId,
          action: "movement.hostel_return_recorded",
          entityType: "leave_requests",
          entityId: input.leaveRequestId,
          metadata: { movementType: "hostel_return" },
        });

        return { kind: "success", hostelReturn: toHostelReturnView(row) };
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return { kind: "conflict", reason: "already_returned" };
      }
      throw err;
    }
  }
}
