import { describe, it, expect, vi, beforeEach } from "vitest";
import { recordStaffAuthEvent } from "@digihostel/api-client-react";
import { staffAuthAuditService } from "./staffAuthAuditService";

vi.mock("@digihostel/api-client-react", () => ({
  recordStaffAuthEvent: vi.fn(),
}));

describe("staffAuthAuditService.record", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls the generated API client with the event", async () => {
    vi.mocked(recordStaffAuthEvent).mockResolvedValue(undefined as never);
    await staffAuthAuditService.record("sign_in_success");
    expect(recordStaffAuthEvent).toHaveBeenCalledWith({ event: "sign_in_success" });
  });

  it("never throws when the report fails — fire-and-forget, never blocks the caller", async () => {
    vi.mocked(recordStaffAuthEvent).mockRejectedValue(new Error("network down"));
    await expect(staffAuthAuditService.record("sign_out")).resolves.toBeUndefined();
  });
});
