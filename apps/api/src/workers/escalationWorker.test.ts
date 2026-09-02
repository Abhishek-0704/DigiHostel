import { describe, it, expect } from "vitest";
import { processEscalationJob } from "./escalationWorker.js";
import { FakeLeaveRepository } from "../domain/leave/__fixtures__/fake-repository.js";
import type { LeaveRequestView } from "../domain/leave/types.js";

function makeLeaveRequest(id: string, status: LeaveRequestView["status"]): LeaveRequestView {
  return {
    id,
    studentId: "student-1",
    reason: "test",
    startDate: "2026-10-01",
    endDate: "2026-10-03",
    status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("processEscalationJob", () => {
  it("advances a matching stage and schedules the next evaluate + notification jobs", async () => {
    const repo = new FakeLeaveRepository().addLeaveRequest(
      makeLeaveRequest("lr-1", "father_notified"),
    );

    await processEscalationJob({ leaveRequestId: "lr-1", expectedStage: "father_notified" }, repo);

    expect(repo.leaveRequests.get("lr-1")?.status).toBe("mother_notified");
    expect(repo.scheduledEscalationJobs).toContainEqual({
      leaveRequestId: "lr-1",
      expectedStage: "mother_notified",
    });
    expect(repo.scheduledNotificationJobs).toContainEqual({
      leaveRequestId: "lr-1",
      stage: "mother_notified",
    });
  });

  it("a stale job (already decided) does not throw and does not mutate status", async () => {
    const repo = new FakeLeaveRepository().addLeaveRequest(makeLeaveRequest("lr-1", "approved"));

    await expect(
      processEscalationJob({ leaveRequestId: "lr-1", expectedStage: "father_notified" }, repo),
    ).resolves.toBeUndefined();

    expect(repo.leaveRequests.get("lr-1")?.status).toBe("approved");
  });

  it("advancing into manual_verification does not schedule a further evaluate job (ADR-017 §9 / ADR-019 §2)", async () => {
    const repo = new FakeLeaveRepository().addLeaveRequest(makeLeaveRequest("lr-1", "in_app_call"));

    await processEscalationJob({ leaveRequestId: "lr-1", expectedStage: "in_app_call" }, repo);

    expect(repo.leaveRequests.get("lr-1")?.status).toBe("manual_verification");
    expect(
      repo.scheduledEscalationJobs.some((j) => j.expectedStage === "manual_verification"),
    ).toBe(false);
    expect(repo.scheduledNotificationJobs).toContainEqual({
      leaveRequestId: "lr-1",
      stage: "manual_verification",
    });
  });
});
