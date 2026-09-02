import { describe, it, expect } from "vitest";
import { LeaveService } from "./service.js";
import { FakeLeaveRepository } from "./__fixtures__/fake-repository.js";
import {
  LeaveBiometricConfirmationError,
  LeaveRequestConflictError,
  LeaveRequestNotFoundError,
} from "./errors.js";
import type { BiometricFreshnessGate } from "../../lib/auth/security-gates.js";
import type { LeaveRequestStatus, LeaveRequestView } from "./types.js";

const PARENT_A = "parent-a";
const PARENT_B = "parent-b";
const STUDENT_1 = "student-1";
const STUDENT_2 = "student-2";

function alwaysFreshGate(): BiometricFreshnessGate {
  return { checkFreshness: async () => ({ fresh: true, confirmedAt: new Date() }) };
}
function alwaysStaleGate(): BiometricFreshnessGate {
  return { checkFreshness: async () => ({ fresh: false, confirmedAt: new Date() }) };
}

function makeLeaveRequest(
  id: string,
  studentId: string,
  status: LeaveRequestStatus,
): LeaveRequestView {
  return {
    id,
    studentId,
    reason: "test reason",
    startDate: "2026-10-01",
    endDate: "2026-10-03",
    status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const assertion = { assertionToken: "test-token", actionId: "leave-decision:lr-1" };

describe("LeaveService.getForParent — relationship authorization", () => {
  it("related parent: allowed", async () => {
    const repo = new FakeLeaveRepository()
      .addLeaveRequest(makeLeaveRequest("lr-1", STUDENT_1, "pending"))
      .linkParentToStudent(PARENT_A, STUDENT_1);
    const service = new LeaveService(repo, alwaysFreshGate());

    const view = await service.getForParent("lr-1", PARENT_A);
    expect(view.id).toBe("lr-1");
  });

  it("unrelated parent: denied (not found)", async () => {
    const repo = new FakeLeaveRepository()
      .addLeaveRequest(makeLeaveRequest("lr-1", STUDENT_1, "pending"))
      .linkParentToStudent(PARENT_A, STUDENT_1); // parent B never linked
    const service = new LeaveService(repo, alwaysFreshGate());

    await expect(service.getForParent("lr-1", PARENT_B)).rejects.toBeInstanceOf(
      LeaveRequestNotFoundError,
    );
  });

  it("related parent requesting another student's leave id: denied (not found), same error as a nonexistent id — anti-enumeration", async () => {
    const repo = new FakeLeaveRepository()
      .addLeaveRequest(makeLeaveRequest("lr-1", STUDENT_1, "pending")) // belongs to student 1
      .addLeaveRequest(makeLeaveRequest("lr-2", STUDENT_2, "pending")) // belongs to student 2
      .linkParentToStudent(PARENT_A, STUDENT_1); // parent A is linked ONLY to student 1

    const service = new LeaveService(repo, alwaysFreshGate());

    const errorForOtherStudentsRequest = await service
      .getForParent("lr-2", PARENT_A)
      .catch((e: unknown) => e);
    const errorForNonexistentId = await service
      .getForParent("lr-does-not-exist", PARENT_A)
      .catch((e: unknown) => e);

    expect(errorForOtherStudentsRequest).toBeInstanceOf(LeaveRequestNotFoundError);
    expect(errorForNonexistentId).toBeInstanceOf(LeaveRequestNotFoundError);
    expect((errorForOtherStudentsRequest as Error).message).toBe(
      (errorForNonexistentId as Error).message,
    );
  });
});

describe("LeaveService.decide — state machine", () => {
  it("pending -> approved succeeds", async () => {
    const repo = new FakeLeaveRepository()
      .addLeaveRequest(makeLeaveRequest("lr-1", STUDENT_1, "pending"))
      .linkParentToStudent(PARENT_A, STUDENT_1);
    const service = new LeaveService(repo, alwaysFreshGate());

    const result = await service.decide({
      leaveRequestId: "lr-1",
      actingParentId: PARENT_A,
      decision: "approved",
      biometricAssertion: assertion,
    });
    expect(result.status).toBe("approved");
  });

  it("pending -> rejected succeeds", async () => {
    const repo = new FakeLeaveRepository()
      .addLeaveRequest(makeLeaveRequest("lr-1", STUDENT_1, "pending"))
      .linkParentToStudent(PARENT_A, STUDENT_1);
    const service = new LeaveService(repo, alwaysFreshGate());

    const result = await service.decide({
      leaveRequestId: "lr-1",
      actingParentId: PARENT_A,
      decision: "rejected",
      biometricAssertion: assertion,
    });
    expect(result.status).toBe("rejected");
  });

  it.each([
    ["approved", "approved"],
    ["approved", "rejected"],
    ["rejected", "approved"],
    ["rejected", "rejected"],
    ["expired", "approved"],
    ["expired", "rejected"],
  ] as const)("%s -> %s fails with a conflict", async (initialStatus, decision) => {
    const repo = new FakeLeaveRepository()
      .addLeaveRequest(makeLeaveRequest("lr-1", STUDENT_1, initialStatus))
      .linkParentToStudent(PARENT_A, STUDENT_1);
    const service = new LeaveService(repo, alwaysFreshGate());

    const err = await service
      .decide({
        leaveRequestId: "lr-1",
        actingParentId: PARENT_A,
        decision,
        biometricAssertion: assertion,
      })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(LeaveRequestConflictError);
    expect((err as LeaveRequestConflictError).currentStatus).toBe(initialStatus);
  });

  it("unrelated parent cannot decide (not found, not a role-only check)", async () => {
    const repo = new FakeLeaveRepository()
      .addLeaveRequest(makeLeaveRequest("lr-1", STUDENT_1, "pending"))
      .linkParentToStudent(PARENT_A, STUDENT_1);
    const service = new LeaveService(repo, alwaysFreshGate());

    await expect(
      service.decide({
        leaveRequestId: "lr-1",
        actingParentId: PARENT_B,
        decision: "approved",
        biometricAssertion: assertion,
      }),
    ).rejects.toBeInstanceOf(LeaveRequestNotFoundError);
  });

  it("stale/missing biometric assertion blocks the decision before touching the repository", async () => {
    const repo = new FakeLeaveRepository()
      .addLeaveRequest(makeLeaveRequest("lr-1", STUDENT_1, "pending"))
      .linkParentToStudent(PARENT_A, STUDENT_1);
    const service = new LeaveService(repo, alwaysStaleGate());

    const err = await service
      .decide({
        leaveRequestId: "lr-1",
        actingParentId: PARENT_A,
        decision: "approved",
        biometricAssertion: assertion,
      })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(LeaveBiometricConfirmationError);
    // The repository must never have been touched — no event recorded and
    // status unchanged.
    expect(repo.events).toHaveLength(0);
    expect(repo.leaveRequests.get("lr-1")?.status).toBe("pending");
  });
});

describe("LeaveService — student creation and ownership", () => {
  it("createForStudent creates a request for the given student in the schema's default (pending) state", async () => {
    const repo = new FakeLeaveRepository();
    const service = new LeaveService(repo, alwaysFreshGate());

    const view = await service.createForStudent({
      studentId: STUDENT_1,
      reason: "Family function",
      startDate: "2026-11-01",
      endDate: "2026-11-03",
    });

    expect(view.studentId).toBe(STUDENT_1);
    expect(view.status).toBe("pending");
    expect(view.reason).toBe("Family function");
  });

  it("listForStudent returns only that student's requests", async () => {
    const repo = new FakeLeaveRepository()
      .addLeaveRequest(makeLeaveRequest("lr-1", STUDENT_1, "pending"))
      .addLeaveRequest(makeLeaveRequest("lr-2", STUDENT_2, "pending"));
    const service = new LeaveService(repo, alwaysFreshGate());

    const results = await service.listForStudent(STUDENT_1);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("lr-1");
  });

  it("listForParent returns only requests for students the parent is linked to (G-05)", async () => {
    const repo = new FakeLeaveRepository()
      .addLeaveRequest(makeLeaveRequest("lr-1", STUDENT_1, "pending"))
      .addLeaveRequest(makeLeaveRequest("lr-2", STUDENT_2, "pending"))
      .linkParentToStudent(PARENT_A, STUDENT_1); // not linked to STUDENT_2
    const service = new LeaveService(repo, alwaysFreshGate());

    const results = await service.listForParent(PARENT_A);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("lr-1");
  });

  it("listForParent: an unrelated/unlinked parent gets an empty array, never an error", async () => {
    const repo = new FakeLeaveRepository().addLeaveRequest(
      makeLeaveRequest("lr-1", STUDENT_1, "pending"),
    );
    const service = new LeaveService(repo, alwaysFreshGate());

    const results = await service.listForParent(PARENT_B); // never linked
    expect(results).toEqual([]);
  });

  it("getForStudent: owning student allowed", async () => {
    const repo = new FakeLeaveRepository().addLeaveRequest(
      makeLeaveRequest("lr-1", STUDENT_1, "pending"),
    );
    const service = new LeaveService(repo, alwaysFreshGate());

    const view = await service.getForStudent("lr-1", STUDENT_1);
    expect(view.id).toBe("lr-1");
  });

  it("getForStudent: a different student is denied with the same anti-enumeration error as a nonexistent id", async () => {
    const repo = new FakeLeaveRepository().addLeaveRequest(
      makeLeaveRequest("lr-1", STUDENT_1, "pending"),
    );
    const service = new LeaveService(repo, alwaysFreshGate());

    const errorForOtherStudent = await service
      .getForStudent("lr-1", STUDENT_2)
      .catch((e: unknown) => e);
    const errorForNonexistentId = await service
      .getForStudent("lr-does-not-exist", STUDENT_2)
      .catch((e: unknown) => e);

    expect(errorForOtherStudent).toBeInstanceOf(LeaveRequestNotFoundError);
    expect(errorForNonexistentId).toBeInstanceOf(LeaveRequestNotFoundError);
    expect((errorForOtherStudent as Error).message).toBe((errorForNonexistentId as Error).message);
  });
});

describe("LeaveService.markExpired — staff-only, from manual_verification only (ADR-019 §2)", () => {
  const HOSTEL_A = "hostel-a";
  const HOSTEL_B = "hostel-b";
  const RECEPTION_A = "reception-a";
  const RECEPTION_B = "reception-b";
  const SUPER_ADMIN = "super-admin-1";

  it("super_admin: manual_verification -> expired succeeds, unscoped by hostel", async () => {
    const repo = new FakeLeaveRepository().addLeaveRequest(
      makeLeaveRequest("lr-1", STUDENT_1, "manual_verification"),
    );
    const service = new LeaveService(repo, alwaysFreshGate());

    const view = await service.markExpired({
      leaveRequestId: "lr-1",
      actingStaffId: SUPER_ADMIN,
      actingStaffRole: "super_admin",
    });
    expect(view.status).toBe("expired");
  });

  it("reception_warden in the SAME hostel as the student: succeeds", async () => {
    const repo = new FakeLeaveRepository()
      .addLeaveRequest(makeLeaveRequest("lr-1", STUDENT_1, "manual_verification"))
      .linkStaffToHostel(RECEPTION_A, HOSTEL_A)
      .linkStudentToHostel(STUDENT_1, HOSTEL_A);
    const service = new LeaveService(repo, alwaysFreshGate());

    const view = await service.markExpired({
      leaveRequestId: "lr-1",
      actingStaffId: RECEPTION_A,
      actingStaffRole: "reception_warden",
    });
    expect(view.status).toBe("expired");
  });

  it("reception_warden in a DIFFERENT hostel: denied (not found, anti-enumeration) — never silently a 403 that would confirm the request exists", async () => {
    const repo = new FakeLeaveRepository()
      .addLeaveRequest(makeLeaveRequest("lr-1", STUDENT_1, "manual_verification"))
      .linkStaffToHostel(RECEPTION_B, HOSTEL_B)
      .linkStudentToHostel(STUDENT_1, HOSTEL_A);
    const service = new LeaveService(repo, alwaysFreshGate());

    await expect(
      service.markExpired({
        leaveRequestId: "lr-1",
        actingStaffId: RECEPTION_B,
        actingStaffRole: "reception_warden",
      }),
    ).rejects.toBeInstanceOf(LeaveRequestNotFoundError);
  });

  it("wrong status (not manual_verification): 409 conflict, never silently accepted", async () => {
    const repo = new FakeLeaveRepository().addLeaveRequest(
      makeLeaveRequest("lr-1", STUDENT_1, "guardian_notified"),
    );
    const service = new LeaveService(repo, alwaysFreshGate());

    const err = await service
      .markExpired({
        leaveRequestId: "lr-1",
        actingStaffId: SUPER_ADMIN,
        actingStaffRole: "super_admin",
      })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(LeaveRequestConflictError);
    expect((err as LeaveRequestConflictError).currentStatus).toBe("guardian_notified");
  });
});
