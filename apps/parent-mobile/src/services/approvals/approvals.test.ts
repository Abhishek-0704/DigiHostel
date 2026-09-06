import { describe, it, expect, vi } from "vitest";

const listLeaveRequests = vi.fn();
const getLeaveRequest = vi.fn();
const approveLeaveRequest = vi.fn();
const rejectLeaveRequest = vi.fn();
const listLeaveRequestEvents = vi.fn();

vi.mock("@digihostel/api-client-react", () => ({
  listLeaveRequests: (...args: unknown[]) => listLeaveRequests(...args),
  getLeaveRequest: (...args: unknown[]) => getLeaveRequest(...args),
  approveLeaveRequest: (...args: unknown[]) => approveLeaveRequest(...args),
  rejectLeaveRequest: (...args: unknown[]) => rejectLeaveRequest(...args),
  listLeaveRequestEvents: (...args: unknown[]) => listLeaveRequestEvents(...args),
}));

const { approvalService } = await import("./approvals");

const ASSERTION = { assertionToken: "tok-1", actionId: "leave-decision:lr-1" };

describe("approvalService (real, Prompt 9B)", () => {
  it("listForCurrentParent calls the generated listLeaveRequests with no args", async () => {
    listLeaveRequests.mockResolvedValueOnce([{ id: "lr-1" }]);
    const result = await approvalService.listForCurrentParent();
    expect(listLeaveRequests).toHaveBeenCalledWith();
    expect(result).toEqual([{ id: "lr-1" }]);
  });

  it("getById calls the generated getLeaveRequest with the given id", async () => {
    getLeaveRequest.mockResolvedValueOnce({ id: "lr-1" });
    const result = await approvalService.getById("lr-1");
    expect(getLeaveRequest).toHaveBeenCalledWith("lr-1");
    expect(result).toEqual({ id: "lr-1" });
  });

  it("approve wraps the assertion as { biometricAssertion } per LeaveDecisionRequest's shape", async () => {
    approveLeaveRequest.mockResolvedValueOnce({ id: "lr-1", status: "approved" });
    const result = await approvalService.approve("lr-1", ASSERTION);
    expect(approveLeaveRequest).toHaveBeenCalledWith("lr-1", { biometricAssertion: ASSERTION });
    expect(result).toEqual({ id: "lr-1", status: "approved" });
  });

  it("reject wraps the assertion the same way", async () => {
    rejectLeaveRequest.mockResolvedValueOnce({ id: "lr-1", status: "rejected" });
    const result = await approvalService.reject("lr-1", ASSERTION);
    expect(rejectLeaveRequest).toHaveBeenCalledWith("lr-1", { biometricAssertion: ASSERTION });
    expect(result).toEqual({ id: "lr-1", status: "rejected" });
  });

  it("propagates a rejection from the generated client unchanged (classification is leaveErrors.ts's job, not this service's)", async () => {
    const err = { status: 409, message: "{}" };
    approveLeaveRequest.mockRejectedValueOnce(err);
    await expect(approvalService.approve("lr-1", ASSERTION)).rejects.toBe(err);
  });

  it("getEvents calls the generated listLeaveRequestEvents with the given id (Approval History, Phase 4 Prompt 10)", async () => {
    listLeaveRequestEvents.mockResolvedValueOnce([{ id: "evt-1", eventType: "notified" }]);
    const result = await approvalService.getEvents("lr-1");
    expect(listLeaveRequestEvents).toHaveBeenCalledWith("lr-1");
    expect(result).toEqual([{ id: "evt-1", eventType: "notified" }]);
  });
});
