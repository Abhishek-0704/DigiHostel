import { describe, expect, it } from "vitest";
import { leaveStatusLabel, leaveStatusTone } from "./leaveStatusFormatter";
import type { LeaveApprovalPresentationStatus } from "./types";

const ALL_STATUSES: LeaveApprovalPresentationStatus[] = [
  "awaiting_response",
  "approved",
  "rejected",
  "expired",
  "unknown",
];

describe("leaveStatusLabel", () => {
  it("has a non-empty, distinct label for every supported status", () => {
    const labels = ALL_STATUSES.map(leaveStatusLabel);
    for (const label of labels) {
      expect(label.length).toBeGreaterThan(0);
    }
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("falls back to a safe label for an unknown status", () => {
    expect(leaveStatusLabel("unknown")).toBe("Status unavailable");
  });
});

describe("leaveStatusTone", () => {
  it("returns a defined tone for every supported status", () => {
    for (const status of ALL_STATUSES) {
      expect(["neutral", "primary", "success", "warning", "error"]).toContain(
        leaveStatusTone(status),
      );
    }
  });

  it("uses success only for approved, error only for rejected", () => {
    expect(leaveStatusTone("approved")).toBe("success");
    expect(leaveStatusTone("rejected")).toBe("error");
  });
});
