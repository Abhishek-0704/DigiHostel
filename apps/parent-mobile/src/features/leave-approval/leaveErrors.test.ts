import { describe, it, expect } from "vitest";
import { mapLeaveApprovalError } from "./leaveErrors";
import { AppError } from "../../types/errors";
import type { CustomFetchError } from "@digihostel/api-client-react";

function fetchError(status: number, code?: string): CustomFetchError {
  return {
    status,
    message: code
      ? JSON.stringify({ error: { code, message: "backend detail" } })
      : "not json at all",
  };
}

describe("mapLeaveApprovalError", () => {
  it("passes an existing AppError through unchanged", () => {
    const original = new AppError("network", "already mapped");
    expect(mapLeaveApprovalError(original)).toBe(original);
  });

  it("401 -> unauthenticated", () => {
    expect(mapLeaveApprovalError(fetchError(401)).kind).toBe("unauthenticated");
  });

  it("403 with code 'device_revoked' -> device_revoked", () => {
    expect(mapLeaveApprovalError(fetchError(403, "device_revoked")).kind).toBe("device_revoked");
  });

  it("403 with code 'biometric_confirmation_required' -> biometric_verification_failed", () => {
    expect(mapLeaveApprovalError(fetchError(403, "biometric_confirmation_required")).kind).toBe(
      "biometric_verification_failed",
    );
  });

  it("403 with an unrecognized/absent code -> forbidden", () => {
    expect(mapLeaveApprovalError(fetchError(403)).kind).toBe("forbidden");
    expect(mapLeaveApprovalError(fetchError(403, "role_required")).kind).toBe("forbidden");
  });

  it("404 -> not_found", () => {
    expect(mapLeaveApprovalError(fetchError(404, "leave_request_not_found")).kind).toBe(
      "not_found",
    );
  });

  it("409 -> conflict", () => {
    expect(mapLeaveApprovalError(fetchError(409, "leave_request_conflict")).kind).toBe("conflict");
  });

  it("400 -> validation", () => {
    expect(mapLeaveApprovalError(fetchError(400, "validation_failed")).kind).toBe("validation");
  });

  it("an unrecognized status -> unknown", () => {
    expect(mapLeaveApprovalError(fetchError(500)).kind).toBe("unknown");
  });

  it("a raw TypeError (no status field — request never returned) -> network, not unknown", () => {
    expect(mapLeaveApprovalError(new TypeError("Network request failed")).kind).toBe("network");
  });

  it("never surfaces the raw backend message/code as the user-facing message", () => {
    const result = mapLeaveApprovalError(fetchError(403, "device_revoked"));
    expect(result.userMessage).not.toContain("backend detail");
    expect(result.userMessage).not.toContain("device_revoked");
  });

  it("a malformed (non-JSON) error body still classifies correctly by status alone", () => {
    const result = mapLeaveApprovalError(fetchError(409));
    expect(result.kind).toBe("conflict");
  });
});
