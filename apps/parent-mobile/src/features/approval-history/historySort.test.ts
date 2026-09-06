import { describe, expect, it } from "vitest";
import { sortHistoryRecords } from "./historySort";
import type { HistoryRecordPresentation } from "./historyPresentationMapper";

function record(
  id: string,
  requestedAt: string,
  decidedAt: string | null,
  status: HistoryRecordPresentation["status"] = "approved",
): HistoryRecordPresentation {
  return {
    id,
    studentId: null,
    student: null,
    leaveType: null,
    destination: null,
    reason: "x",
    departureDate: "2026-09-10",
    expectedReturnDate: "2026-09-12",
    status,
    createdAt: requestedAt,
    expiryTimestamp: null,
    requestedAt,
    decidedAt,
  };
}

describe("sortHistoryRecords", () => {
  const records = [
    record("a", "2026-09-03T00:00:00.000Z", "2026-09-04T00:00:00.000Z"),
    record("b", "2026-09-01T00:00:00.000Z", null),
    record("c", "2026-09-02T00:00:00.000Z", "2026-09-02T12:00:00.000Z"),
  ];

  it("sorts by requestedAt ascending using raw timestamps, not formatted strings", () => {
    const result = sortHistoryRecords(records, "requestedAt", "asc");
    expect(result.map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts by requestedAt descending", () => {
    const result = sortHistoryRecords(records, "requestedAt", "desc");
    expect(result.map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("treats a null decidedAt as the smallest value, following direction like any other value", () => {
    const ascending = sortHistoryRecords(records, "decidedAt", "asc");
    expect(ascending[0].id).toBe("b"); // null decidedAt sorts first ascending
    const descending = sortHistoryRecords(records, "decidedAt", "desc");
    expect(descending[descending.length - 1].id).toBe("b"); // sorts last descending
  });

  it("sorts by status using the display label, not the raw status value", () => {
    const statusRecords = [
      record("x", "2026-09-01T00:00:00.000Z", null, "rejected"),
      record("y", "2026-09-01T00:00:00.000Z", null, "approved"),
    ];
    const result = sortHistoryRecords(statusRecords, "status", "asc");
    // "Approved" < "Rejected" alphabetically
    expect(result.map((r) => r.id)).toEqual(["y", "x"]);
  });

  it("does not mutate the input array", () => {
    const copy = [...records];
    sortHistoryRecords(records, "requestedAt", "asc");
    expect(records).toEqual(copy);
  });
});
