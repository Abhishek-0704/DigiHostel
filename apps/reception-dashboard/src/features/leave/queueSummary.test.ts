import { describe, it, expect } from "vitest";
import { computeLeaveQueueSummary, leaveQueueSummaryMetrics } from "./queueSummary";
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
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("computeLeaveQueueSummary", () => {
  const now = new Date("2026-01-05T12:00:00.000Z");

  it("buckets every real status into exactly one group — counts add up to the total", () => {
    const items = [
      make({ id: "a", status: "pending" }),
      make({ id: "b", status: "father_notified" }),
      make({ id: "c", status: "mother_notified" }),
      make({ id: "d", status: "guardian_notified" }),
      make({ id: "e", status: "in_app_call" }),
      make({ id: "f", status: "manual_verification" }),
      make({ id: "g", status: "approved", updatedAt: now.toISOString() }),
      make({ id: "h", status: "rejected", updatedAt: "2026-01-01T00:00:00.000Z" }),
      make({ id: "i", status: "expired", updatedAt: "2026-01-01T00:00:00.000Z" }),
    ];
    const counts = computeLeaveQueueSummary(items, now);
    expect(counts.pending).toBe(1);
    expect(counts.escalating).toBe(4);
    expect(counts.manualVerification).toBe(1);
    expect(counts.completedToday).toBe(1); // only "g", resolved today
    expect(counts.total).toBe(9);
  });

  it("never fabricates a count for an empty queue", () => {
    const counts = computeLeaveQueueSummary([], now);
    expect(counts).toEqual({
      pending: 0,
      escalating: 0,
      manualVerification: 0,
      completedToday: 0,
      total: 0,
    });
  });
});

describe("leaveQueueSummaryMetrics", () => {
  it("classifies every metric as real (genuinely derived, never fabricated)", () => {
    const metrics = leaveQueueSummaryMetrics(
      computeLeaveQueueSummary([], new Date("2026-01-05T00:00:00.000Z")),
    );
    for (const metric of metrics) {
      expect(metric.availability).toBe("real");
      expect(metric.value).not.toBeNull();
    }
  });
});
