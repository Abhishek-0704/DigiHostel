import { describe, expect, it } from "vitest";
import { buildMinimalTimelineFromStatus } from "./leaveTimeline";
import type { LeaveRequestPresentation } from "./types";

function presentation(
  status: LeaveRequestPresentation["status"],
  createdAt: string | null = "2026-09-01T10:00:00.000Z",
): LeaveRequestPresentation {
  return {
    id: "1",
    studentId: null,
    student: null,
    leaveType: null,
    destination: null,
    reason: "x",
    departureDate: "2026-09-10",
    expectedReturnDate: "2026-09-12",
    status,
    createdAt,
    expiryTimestamp: null,
  };
}

describe("buildMinimalTimelineFromStatus", () => {
  it("always starts with a completed 'Leave requested' step using createdAt", () => {
    const timeline = buildMinimalTimelineFromStatus(presentation("awaiting_response"));
    expect(timeline[0]).toEqual({
      id: "requested",
      label: "Leave requested",
      status: "completed",
      timestamp: "2026-09-01T10:00:00.000Z",
    });
  });

  it("awaiting_response: current step is 'Awaiting parent response', decision is upcoming", () => {
    const timeline = buildMinimalTimelineFromStatus(presentation("awaiting_response"));
    expect(timeline.map((e) => e.status)).toEqual(["completed", "current", "upcoming"]);
    expect(timeline.some((e) => e.label.toLowerCase().includes("father"))).toBe(false);
    expect(timeline.some((e) => e.label.toLowerCase().includes("guardian"))).toBe(false);
  });

  it("approved: every step completed, final label is Approved", () => {
    const timeline = buildMinimalTimelineFromStatus(presentation("approved"));
    expect(timeline.every((e) => e.status === "completed")).toBe(true);
    expect(timeline.at(-1)?.label).toBe("Approved");
  });

  it("rejected: every step completed, final label is Rejected", () => {
    const timeline = buildMinimalTimelineFromStatus(presentation("rejected"));
    expect(timeline.at(-1)?.label).toBe("Rejected");
  });

  it("expired: every step completed, final label is Expired", () => {
    const timeline = buildMinimalTimelineFromStatus(presentation("expired"));
    expect(timeline.at(-1)?.label).toBe("Expired");
  });

  it("unknown status: only the 'Leave requested' step is produced", () => {
    const timeline = buildMinimalTimelineFromStatus(presentation("unknown"));
    expect(timeline).toHaveLength(1);
  });

  it("handles a missing createdAt without crashing", () => {
    const timeline = buildMinimalTimelineFromStatus(presentation("awaiting_response", null));
    expect(timeline[0].timestamp).toBeNull();
  });

  it("never fabricates a timestamp for an upcoming/current step", () => {
    const timeline = buildMinimalTimelineFromStatus(presentation("awaiting_response"));
    const nonRequestedSteps = timeline.slice(1);
    expect(nonRequestedSteps.every((e) => e.timestamp === null)).toBe(true);
  });
});
