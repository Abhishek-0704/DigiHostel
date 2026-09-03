/**
 * Leave-approval service interface (Prompt 2 foundation).
 *
 * Unlike devices/notifications above, the backend contract for this one is
 * already fully implemented and verified (GET/POST /api/v1/leave-requests*,
 * including the parent-scoped list endpoint — see docs/current-state.md's
 * G-05 status). This is deliberately left as an interface-only placeholder
 * anyway, per this prompt's explicit scope boundary: "Leave approval, Leave
 * rejection, Leave state-machine logic" are out of scope for Prompt 2. Real
 * wiring to `@digihostel/api-client-react`'s useListLeaveRequests /
 * useGetLeaveRequest / useApproveLeaveRequest / useRejectLeaveRequest hooks
 * belongs to the leave-approval feature prompt (Prompt 1's roadmap, Phase 4),
 * not this foundation.
 */

export interface ApprovalService {
  listForCurrentParent(): Promise<unknown[]>;
  getById(leaveRequestId: string): Promise<unknown>;
  approve(leaveRequestId: string, biometricAssertion: unknown): Promise<unknown>;
  reject(leaveRequestId: string, biometricAssertion: unknown): Promise<unknown>;
}

export class ApprovalServiceNotImplementedError extends Error {
  constructor() {
    super(
      "The leave-approval feature is not implemented yet in the Parent app " +
        "(Prompt 2 is foundation-only). The backend contract this will use " +
        "already exists — see docs/current-state.md.",
    );
    this.name = "ApprovalServiceNotImplementedError";
  }
}

export class NotImplementedApprovalService implements ApprovalService {
  async listForCurrentParent(): Promise<never> {
    throw new ApprovalServiceNotImplementedError();
  }
  async getById(): Promise<never> {
    throw new ApprovalServiceNotImplementedError();
  }
  async approve(): Promise<never> {
    throw new ApprovalServiceNotImplementedError();
  }
  async reject(): Promise<never> {
    throw new ApprovalServiceNotImplementedError();
  }
}

export const approvalService: ApprovalService = new NotImplementedApprovalService();
