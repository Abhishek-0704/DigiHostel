import { describe, expect, it } from "vitest";
import {
  mapBackendStatus,
  mapLeaveRequestToPresentation,
  deriveUiStateFromPresentation,
  filterAwaitingResponse,
} from "./leavePresentationMapper";
import type { LeaveRequestPresentation } from "./types";

function backendRow(overrides: Partial<Record<string, string>> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    studentId: "22222222-2222-2222-2222-222222222222",
    reason: "Family function",
    startDate: "2026-09-10",
    endDate: "2026-09-12",
    status: "pending",
    createdAt: "2026-09-01T10:00:00.000Z",
    ...overrides,
  } as Parameters<typeof mapLeaveRequestToPresentation>[0];
}

describe("mapBackendStatus", () => {
  it.each([
    "pending",
    "father_notified",
    "mother_notified",
    "guardian_notified",
    "in_app_call",
    "manual_verification",
  ])("collapses %s into awaiting_response", (status) => {
    expect(mapBackendStatus(status)).toBe("awaiting_response");
  });

  it("maps approved/rejected/expired directly", () => {
    expect(mapBackendStatus("approved")).toBe("approved");
    expect(mapBackendStatus("rejected")).toBe("rejected");
    expect(mapBackendStatus("expired")).toBe("expired");
  });

  it("falls back to unknown for an unrecognized value", () => {
    expect(mapBackendStatus("something_new")).toBe("unknown");
  });
});

describe("mapLeaveRequestToPresentation", () => {
  it("maps real fields and nulls out every field the backend doesn't supply", () => {
    const result = mapLeaveRequestToPresentation(backendRow());
    expect(result).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      studentId: "22222222-2222-2222-2222-222222222222",
      student: null,
      leaveType: null,
      destination: null,
      reason: "Family function",
      departureDate: "2026-09-10",
      expectedReturnDate: "2026-09-12",
      status: "awaiting_response",
      createdAt: "2026-09-01T10:00:00.000Z",
      expiryTimestamp: null,
    });
  });

  it("never fabricates a student name or destination", () => {
    const result = mapLeaveRequestToPresentation(backendRow());
    expect(result.student).toBeNull();
    expect(result.destination).toBeNull();
    expect(result.leaveType).toBeNull();
    expect(result.expiryTimestamp).toBeNull();
  });
});

describe("filterAwaitingResponse", () => {
  function presentation(status: LeaveRequestPresentation["status"], id: string) {
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
    } satisfies LeaveRequestPresentation;
  }

  it("keeps only awaiting_response entries — a decided/expired request is never counted as pending", () => {
    const all = [
      presentation("awaiting_response", "1"),
      presentation("approved", "2"),
      presentation("rejected", "3"),
      presentation("expired", "4"),
      presentation("awaiting_response", "5"),
    ];

    const result = filterAwaitingResponse(all);

    expect(result.map((p) => p.id)).toEqual(["1", "5"]);
  });

  it("returns an empty array when nothing is awaiting a response", () => {
    const all = [presentation("approved", "1"), presentation("expired", "2")];
    expect(filterAwaitingResponse(all)).toEqual([]);
  });
});

describe("deriveUiStateFromPresentation", () => {
  function presentation(status: LeaveRequestPresentation["status"]): LeaveRequestPresentation {
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
      createdAt: "2026-09-01T10:00:00.000Z",
      expiryTimestamp: null,
    };
  }

  it("awaiting_response -> loaded", () => {
    expect(deriveUiStateFromPresentation(presentation("awaiting_response"))).toBe("loaded");
  });

  it("approved -> already_processed", () => {
    expect(deriveUiStateFromPresentation(presentation("approved"))).toBe("already_processed");
  });

  it("rejected -> already_processed", () => {
    expect(deriveUiStateFromPresentation(presentation("rejected"))).toBe("already_processed");
  });

  it("expired -> expired", () => {
    expect(deriveUiStateFromPresentation(presentation("expired"))).toBe("expired");
  });

  it("unknown -> unavailable (defensive)", () => {
    expect(deriveUiStateFromPresentation(presentation("unknown"))).toBe("unavailable");
  });

  it("never produces 'cancelled' — no cancellation concept exists in the backend model", () => {
    const statuses: LeaveRequestPresentation["status"][] = [
      "awaiting_response",
      "approved",
      "rejected",
      "expired",
      "unknown",
    ];
    for (const status of statuses) {
      expect(deriveUiStateFromPresentation(presentation(status))).not.toBe("cancelled");
    }
  });
});
