import { describe, it, expect } from "vitest";
import { buildSessionCompletionHandoff } from "./sessionHandoff";
import type { LeaveQueueItem } from "./types";

function make(overrides: Partial<LeaveQueueItem> = {}): LeaveQueueItem {
  return {
    id: "lr1",
    studentId: "s1",
    studentRollNumber: "TEST-001",
    studentFullName: "Test Student",
    studentHostelId: "h1",
    studentHostelName: "Test Hostel",
    studentRoomId: "r1",
    studentRoomNumber: "101",
    reason: "Family function",
    startDate: "2026-01-10",
    endDate: "2026-01-12",
    status: "pending",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildSessionCompletionHandoff", () => {
  it("returns null for a non-terminal (still-active) session — nothing to hand off yet", () => {
    expect(buildSessionCompletionHandoff(make({ status: "pending" }))).toBeNull();
    expect(buildSessionCompletionHandoff(make({ status: "father_notified" }))).toBeNull();
    expect(buildSessionCompletionHandoff(make({ status: "manual_verification" }))).toBeNull();
  });

  it("builds a real handoff for an approved session", () => {
    const handoff = buildSessionCompletionHandoff(make({ status: "approved", id: "lr-99" }));
    expect(handoff).toEqual({
      leaveRequestId: "lr-99",
      studentId: "s1",
      studentRollNumber: "TEST-001",
      approvalSessionReference: "lr-99",
      outcome: "approved",
      occurredAt: "2026-01-02T00:00:00.000Z",
    });
  });

  it("builds a real handoff for a rejected session", () => {
    const handoff = buildSessionCompletionHandoff(make({ status: "rejected" }));
    expect(handoff?.outcome).toBe("rejected");
  });

  it("builds a real handoff for an expired session", () => {
    const handoff = buildSessionCompletionHandoff(make({ status: "expired" }));
    expect(handoff?.outcome).toBe("expired");
  });

  it("never includes a parent identity field — this dashboard never has that data", () => {
    const handoff = buildSessionCompletionHandoff(make({ status: "approved" }));
    expect(handoff).not.toHaveProperty("parentId");
    expect(handoff).not.toHaveProperty("actorParentId");
  });
});
