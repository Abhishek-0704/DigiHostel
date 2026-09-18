import { describe, expect, it } from "vitest";
import { mapLeaveRequestToHistoryRecord } from "./historyPresentationMapper";

function backendRow(overrides: Partial<Record<string, string>> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    reason: "Family function",
    startDate: "2026-09-10",
    endDate: "2026-09-12",
    status: "pending",
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    ...overrides,
  } as Parameters<typeof mapLeaveRequestToHistoryRecord>[0];
}

describe("mapLeaveRequestToHistoryRecord", () => {
  it("carries every field mapLeaveRequestToPresentation already produces", () => {
    const result = mapLeaveRequestToHistoryRecord(backendRow());
    expect(result.id).toBe("11111111-1111-1111-1111-111111111111");
    expect(result.reason).toBe("Family function");
    // Default backendRow() status is "pending" — not yet sent for parent
    // approval by Reception (Reception-Initiated Parent Approval
    // correction), so this is "not_yet_sent", never "awaiting_response".
    expect(result.status).toBe("not_yet_sent");
  });

  it("sets requestedAt to the same value as createdAt", () => {
    const result = mapLeaveRequestToHistoryRecord(backendRow());
    expect(result.requestedAt).toBe(result.createdAt);
  });

  it.each(["approved", "rejected", "expired"])(
    "sets decidedAt to updatedAt for a terminal status (%s)",
    (status) => {
      const result = mapLeaveRequestToHistoryRecord(
        backendRow({ status, updatedAt: "2026-09-05T12:00:00.000Z" }),
      );
      expect(result.decidedAt).toBe("2026-09-05T12:00:00.000Z");
    },
  );

  it.each([
    "pending",
    "father_notified",
    "mother_notified",
    "guardian_notified",
    "in_app_call",
    "manual_verification",
  ])(
    "leaves decidedAt null for a non-terminal status (%s) — no decision has happened yet",
    (status) => {
      const result = mapLeaveRequestToHistoryRecord(backendRow({ status }));
      expect(result.decidedAt).toBeNull();
    },
  );
});
