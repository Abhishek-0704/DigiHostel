import { describe, it, expect } from "vitest";
import { DrizzleLeaveRepository } from "../leave/repository.js";
import { DrizzleMovementRepository } from "./repository.js";
import { NoopJobScheduler } from "../../lib/queue/jobs.js";

/**
 * Real-Postgres integration test — exercises the actual atomic transaction,
 * workflow-state preconditions, and unique-constraint-backed concurrency
 * behavior against the local Supabase instance's real seed data, mirroring
 * `domain/leave/repository.integration.test.ts`'s own `RUN`-gated
 * convention. Builds a genuinely `approved` + exit-authorized leave request
 * via the real `DrizzleLeaveRepository` methods (create ->
 * startParentApproval -> decide -> authorizeExit) rather than hand-seeding
 * a row, so this test exercises the real, certified upstream chain, not an
 * assumption about its shape.
 */
const RUN = Boolean(process.env.DATABASE_URL);

describe.skipIf(!RUN)("DrizzleMovementRepository (real Postgres integration)", () => {
  const STUDENT_ID = "c0000000-0000-0000-0000-000000000001"; // seeded student1, Kalinga
  const PARENT_ID = "d0000000-0000-0000-0000-000000000001"; // seeded parent1-father, linked to student1
  const RECEPTION1_STAFF_ID = "e0000000-0000-0000-0000-000000000001"; // seeded, Kalinga
  const RECEPTION2_STAFF_ID = "e0000000-0000-0000-0000-000000000006"; // seeded, Utkal

  async function buildApprovedExitedLeave(): Promise<string> {
    const leaveRepo = new DrizzleLeaveRepository(new NoopJobScheduler());
    const created = await leaveRepo.create({
      studentId: STUDENT_ID,
      reason: "Movement integration test",
      startDate: "2026-12-20",
      endDate: "2026-12-22",
    });
    const started = await leaveRepo.startParentApproval({
      leaveRequestId: created.id,
      actingStaffId: RECEPTION1_STAFF_ID,
      actingStaffRole: "reception_warden",
    });
    if (started.kind !== "success") throw new Error("startParentApproval failed");
    const decided = await leaveRepo.decide({
      leaveRequestId: created.id,
      actingParentId: PARENT_ID,
      decision: "approved",
      biometricAssertion: {
        assertionToken: "movement-integration-test-token",
        actionId: `leave-decision:${created.id}`,
      },
    });
    if (decided.kind !== "success") throw new Error("decide failed");
    const exited = await leaveRepo.authorizeExit({
      leaveRequestId: created.id,
      actingStaffId: RECEPTION1_STAFF_ID,
      actingStaffRole: "reception_warden",
      identityConfirmed: true,
    });
    if (exited.kind !== "success") throw new Error("authorizeExit failed");
    return created.id;
  }

  it("records a hostel return for a genuinely approved + exit-authorized leave", async () => {
    const leaveRequestId = await buildApprovedExitedLeave();
    const movementRepo = new DrizzleMovementRepository();

    const outcome = await movementRepo.recordHostelReturn({
      leaveRequestId,
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
    });

    expect(outcome.kind).toBe("success");
    if (outcome.kind === "success") {
      expect(outcome.hostelReturn.leaveRequestId).toBe(leaveRequestId);
      expect(outcome.hostelReturn.studentId).toBe(STUDENT_ID);
    }
  });

  it("denies a return for a leave that was never exit-authorized (still pending)", async () => {
    const leaveRepo = new DrizzleLeaveRepository(new NoopJobScheduler());
    const created = await leaveRepo.create({
      studentId: STUDENT_ID,
      reason: "Movement integration test - pending",
      startDate: "2026-12-20",
      endDate: "2026-12-22",
    });
    const movementRepo = new DrizzleMovementRepository();

    const outcome = await movementRepo.recordHostelReturn({
      leaveRequestId: created.id,
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
    });

    expect(outcome.kind).toBe("conflict");
  });

  it("denies a return for a cross-hostel leave request (anti-enumeration)", async () => {
    const leaveRequestId = await buildApprovedExitedLeave();
    const movementRepo = new DrizzleMovementRepository();

    const outcome = await movementRepo.recordHostelReturn({
      leaveRequestId,
      staffId: RECEPTION2_STAFF_ID, // Utkal, student1 is Kalinga
      staffRole: "reception_warden",
    });

    expect(outcome.kind).toBe("not_found");
  });

  it("denies a second return attempt for the same leave (unique-constraint-backed)", async () => {
    const leaveRequestId = await buildApprovedExitedLeave();
    const movementRepo = new DrizzleMovementRepository();

    const first = await movementRepo.recordHostelReturn({
      leaveRequestId,
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
    });
    const second = await movementRepo.recordHostelReturn({
      leaveRequestId,
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
    });

    expect(first.kind).toBe("success");
    expect(second.kind).toBe("conflict");
    if (second.kind === "conflict") {
      expect(second.reason).toBe("already_returned");
    }
  });

  it("concurrent return attempts on the same leave: exactly one success, one conflict", async () => {
    const leaveRequestId = await buildApprovedExitedLeave();
    const movementRepo = new DrizzleMovementRepository();

    const [a, b] = await Promise.all([
      movementRepo.recordHostelReturn({
        leaveRequestId,
        staffId: RECEPTION1_STAFF_ID,
        staffRole: "reception_warden",
      }),
      movementRepo.recordHostelReturn({
        leaveRequestId,
        staffId: RECEPTION1_STAFF_ID,
        staffRole: "reception_warden",
      }),
    ]);

    const kinds = [a.kind, b.kind].sort();
    expect(kinds).toEqual(["conflict", "success"]);
  });
});
