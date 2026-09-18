import type { MovementRepository, RecordHostelReturnOutcome } from "../repository.js";
import type { RecordHostelReturnInput } from "../types.js";

interface FakeLeaveRow {
  id: string;
  studentId: string;
  status: string;
  hasExitAuthorization: boolean;
}

/** Deterministic in-memory fake of MovementRepository — no live database
 * connection. Mirrors the real repository's core invariants (hostel scope,
 * approved-and-exit-authorized precondition, at-most-once-per-leave-request)
 * so unit tests of MovementService's error handling stay meaningful without
 * needing real Postgres — same convention as domain/leave/domain/student's
 * own fakes. */
export class FakeMovementRepository implements MovementRepository {
  leaves: FakeLeaveRow[] = [];
  staffHostels = new Map<string, string>(); // staffId -> hostelId
  studentHostels = new Map<string, string>(); // studentId -> hostelId
  returns = new Set<string>(); // leaveRequestId already returned

  private isInScope(studentId: string, scope: { staffId: string; staffRole: string }): boolean {
    if (scope.staffRole === "super_admin") return true;
    const staffHostel = this.staffHostels.get(scope.staffId) ?? null;
    const studentHostel = this.studentHostels.get(studentId) ?? null;
    return staffHostel !== null && staffHostel === studentHostel;
  }

  async recordHostelReturn(input: RecordHostelReturnInput): Promise<RecordHostelReturnOutcome> {
    const leave = this.leaves.find((l) => l.id === input.leaveRequestId);
    if (!leave || !this.isInScope(leave.studentId, input)) {
      return { kind: "not_found" };
    }
    if (leave.status !== "approved") {
      return { kind: "conflict", reason: "not_eligible", currentStatus: leave.status };
    }
    if (!leave.hasExitAuthorization) {
      return { kind: "conflict", reason: "not_eligible" };
    }
    if (this.returns.has(input.leaveRequestId)) {
      return { kind: "conflict", reason: "already_returned" };
    }
    this.returns.add(input.leaveRequestId);
    return {
      kind: "success",
      hostelReturn: {
        id: `movement-${input.leaveRequestId}`,
        leaveRequestId: input.leaveRequestId,
        studentId: leave.studentId,
        occurredAt: new Date().toISOString(),
      },
    };
  }
}
