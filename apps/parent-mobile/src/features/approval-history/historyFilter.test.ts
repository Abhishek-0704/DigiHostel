import { describe, expect, it } from "vitest";
import { filterHistoryRecords } from "./historyFilter";
import type { HistoryRecordPresentation } from "./historyPresentationMapper";
import type { LeaveApprovalPresentationStatus } from "../leave-approval";

function record(status: LeaveApprovalPresentationStatus, id: string): HistoryRecordPresentation {
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
    createdAt: "2026-09-01T10:00:00.000Z",
    expiryTimestamp: null,
    requestedAt: "2026-09-01T10:00:00.000Z",
    decidedAt: null,
  };
}

describe("filterHistoryRecords", () => {
  const records = [
    record("awaiting_response", "1"),
    record("approved", "2"),
    record("rejected", "3"),
    record("expired", "4"),
  ];

  it("returns every record when no status filter is applied", () => {
    expect(filterHistoryRecords(records, { statuses: [] })).toEqual(records);
  });

  it("returns only records matching the selected statuses", () => {
    const result = filterHistoryRecords(records, { statuses: ["approved", "rejected"] });
    expect(result.map((r) => r.id)).toEqual(["2", "3"]);
  });

  it("returns an empty array when no record matches the selected statuses", () => {
    const result = filterHistoryRecords([record("awaiting_response", "1")], {
      statuses: ["expired"],
    });
    expect(result).toEqual([]);
  });
});
