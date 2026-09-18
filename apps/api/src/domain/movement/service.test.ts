import { describe, it, expect } from "vitest";
import { MovementService } from "./service.js";
import { FakeMovementRepository } from "./__fixtures__/fake-repository.js";
import { MovementConflictError, MovementLeaveRequestNotFoundError } from "./errors.js";

const RECEPTION_A = { staffId: "staff-a", staffRole: "reception_warden" as const };
const RECEPTION_B = { staffId: "staff-b", staffRole: "reception_warden" as const };
const SUPER_ADMIN = { staffId: "staff-super", staffRole: "super_admin" as const };

function seed(repo: FakeMovementRepository) {
  repo.staffHostels.set("staff-a", "hostel-a");
  repo.staffHostels.set("staff-b", "hostel-b");
  repo.studentHostels.set("student-1", "hostel-a");
  repo.leaves.push(
    {
      id: "lr-approved-exited",
      studentId: "student-1",
      status: "approved",
      hasExitAuthorization: true,
    },
    {
      id: "lr-approved-not-exited",
      studentId: "student-1",
      status: "approved",
      hasExitAuthorization: false,
    },
    { id: "lr-pending", studentId: "student-1", status: "pending", hasExitAuthorization: false },
    { id: "lr-rejected", studentId: "student-1", status: "rejected", hasExitAuthorization: false },
  );
}

describe("MovementService.recordHostelReturn — eligibility", () => {
  it("approved + exit-authorized + own hostel: succeeds", async () => {
    const repo = new FakeMovementRepository();
    seed(repo);
    const service = new MovementService(repo);

    const result = await service.recordHostelReturn({
      leaveRequestId: "lr-approved-exited",
      ...RECEPTION_A,
    });
    expect(result.leaveRequestId).toBe("lr-approved-exited");
  });

  it("approved but never exit-authorized: MovementConflictError(not_eligible)", async () => {
    const repo = new FakeMovementRepository();
    seed(repo);
    const service = new MovementService(repo);

    await expect(
      service.recordHostelReturn({ leaveRequestId: "lr-approved-not-exited", ...RECEPTION_A }),
    ).rejects.toBeInstanceOf(MovementConflictError);
  });

  it.each(["pending", "rejected"])(
    "leave in status %s: MovementConflictError(not_eligible)",
    async (status) => {
      const repo = new FakeMovementRepository();
      seed(repo);
      const service = new MovementService(repo);
      const id = status === "pending" ? "lr-pending" : "lr-rejected";

      await expect(
        service.recordHostelReturn({ leaveRequestId: id, ...RECEPTION_A }),
      ).rejects.toBeInstanceOf(MovementConflictError);
    },
  );

  it("already returned: MovementConflictError(already_returned) on the second call", async () => {
    const repo = new FakeMovementRepository();
    seed(repo);
    const service = new MovementService(repo);

    await service.recordHostelReturn({ leaveRequestId: "lr-approved-exited", ...RECEPTION_A });
    await expect(
      service.recordHostelReturn({ leaveRequestId: "lr-approved-exited", ...RECEPTION_A }),
    ).rejects.toMatchObject({ reason: "already_returned" });
  });

  it("cross-hostel: MovementLeaveRequestNotFoundError (anti-enumeration)", async () => {
    const repo = new FakeMovementRepository();
    seed(repo);
    const service = new MovementService(repo);

    await expect(
      service.recordHostelReturn({ leaveRequestId: "lr-approved-exited", ...RECEPTION_B }),
    ).rejects.toBeInstanceOf(MovementLeaveRequestNotFoundError);
  });

  it("nonexistent leave request: the identical MovementLeaveRequestNotFoundError", async () => {
    const repo = new FakeMovementRepository();
    seed(repo);
    const service = new MovementService(repo);

    await expect(
      service.recordHostelReturn({ leaveRequestId: "nonexistent", ...RECEPTION_A }),
    ).rejects.toBeInstanceOf(MovementLeaveRequestNotFoundError);
  });

  it("super_admin: resolves regardless of hostel", async () => {
    const repo = new FakeMovementRepository();
    seed(repo);
    const service = new MovementService(repo);

    const result = await service.recordHostelReturn({
      leaveRequestId: "lr-approved-exited",
      ...SUPER_ADMIN,
    });
    expect(result.studentId).toBe("student-1");
  });
});
