import { describe, it, expect } from "vitest";
import { reconcileAfterDecisionFailure } from "./leaveDecisionReconciliation";
import { AppError } from "../../types/errors";
import type { LeaveRequestPresentation } from "./types";

function presentation(status: LeaveRequestPresentation["status"]): LeaveRequestPresentation {
  return {
    id: "lr-1",
    studentId: null,
    student: null,
    leaveType: null,
    destination: null,
    reason: "test",
    departureDate: "2026-10-01",
    expectedReturnDate: "2026-10-03",
    status,
    createdAt: "2026-09-01T00:00:00.000Z",
    expiryTimestamp: null,
  };
}

describe("reconcileAfterDecisionFailure", () => {
  it("network failure + refetch shows the decision actually went through -> already_processed, error cleared", () => {
    const result = reconcileAfterDecisionFailure(
      new AppError("network", "offline"),
      presentation("approved"),
    );
    expect(result).toEqual({ uiState: "already_processed", error: null });
  });

  it("network failure + refetch shows nothing changed -> loaded, error cleared (safe to retry)", () => {
    const result = reconcileAfterDecisionFailure(
      new AppError("network", "offline"),
      presentation("awaiting_response"),
    );
    expect(result).toEqual({ uiState: "loaded", error: null });
  });

  it("network failure + the reconciling refetch ALSO failed (still offline) -> surfaces the original error, stays loaded", () => {
    const original = new AppError("network", "offline");
    const result = reconcileAfterDecisionFailure(original, null);
    expect(result).toEqual({ uiState: "loaded", error: original });
  });

  it("conflict (409 — a concurrent decision may have won) defers to the refetched authoritative state", () => {
    const result = reconcileAfterDecisionFailure(
      new AppError("conflict", "already decided"),
      presentation("rejected"),
    );
    expect(result).toEqual({ uiState: "already_processed", error: null });
  });

  it("conflict where the refetch shows the request expired in the meantime", () => {
    const result = reconcileAfterDecisionFailure(
      new AppError("conflict", "already decided"),
      presentation("expired"),
    );
    expect(result).toEqual({ uiState: "expired", error: null });
  });

  it.each([
    "forbidden",
    "device_revoked",
    "biometric_verification_failed",
    "validation",
    "unknown",
  ] as const)(
    "a definite failure kind (%s) never consults the refetch — mutation certainly did not apply",
    (kind) => {
      const error = new AppError(kind, "definite failure");
      const result = reconcileAfterDecisionFailure(error, presentation("approved"));
      expect(result).toEqual({ uiState: "loaded", error });
    },
  );
});
