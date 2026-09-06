import { describe, expect, it } from "vitest";
import { searchHistoryRecords } from "./historySearch";
import type { HistoryRecordPresentation } from "./historyPresentationMapper";

function record(overrides: Partial<HistoryRecordPresentation> = {}): HistoryRecordPresentation {
  return {
    id: "1",
    studentId: null,
    student: null,
    leaveType: null,
    destination: null,
    reason: "Family wedding",
    departureDate: "2026-09-10",
    expectedReturnDate: "2026-09-12",
    status: "approved",
    createdAt: "2026-09-01T10:00:00.000Z",
    expiryTimestamp: null,
    requestedAt: "2026-09-01T10:00:00.000Z",
    decidedAt: "2026-09-02T10:00:00.000Z",
    ...overrides,
  };
}

describe("searchHistoryRecords", () => {
  it("returns every record unchanged for an empty/whitespace query", () => {
    const records = [record()];
    expect(searchHistoryRecords(records, "")).toEqual(records);
    expect(searchHistoryRecords(records, "   ")).toEqual(records);
  });

  it("matches case-insensitively against reason", () => {
    const records = [
      record({ id: "1", reason: "Family wedding" }),
      record({ id: "2", reason: "Medical checkup" }),
    ];
    const result = searchHistoryRecords(records, "WEDDING");
    expect(result.map((r) => r.id)).toEqual(["1"]);
  });

  it("matches against the status label, not the raw status value", () => {
    const records = [record({ id: "1", status: "awaiting_response" })];
    const result = searchHistoryRecords(records, "awaiting your response");
    expect(result).toHaveLength(1);
  });

  it("does not match on a field with no authoritative source (e.g. student name is always null)", () => {
    const records = [record({ id: "1", student: null })];
    expect(searchHistoryRecords(records, "linked student")).toHaveLength(0);
  });
});
