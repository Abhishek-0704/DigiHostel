import {
  listLeaveRequests,
  getLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
  listLeaveRequestEvents,
  type LeaveRequest,
  type LeaveApprovalEvent,
} from "@digihostel/api-client-react";
import type { BiometricAssertion } from "../biometric/biometric";

/**
 * Leave-approval service interface (Prompt 2 foundation; typed against the
 * real generated `LeaveRequest` shape in Prompt 9A; wired to the real
 * backend in Prompt 9B).
 *
 * The backend contract is fully implemented and verified (GET/POST
 * /api/v1/leave-requests*, including the parent-scoped list endpoint — see
 * docs/current-state.md's G-05 status, and `docs/leave-approval.md`'s
 * capability matrix). This calls the generated plain functions from
 * `@digihostel/api-client-react` directly (not the React-hook wrappers —
 * this module is a plain service, not a component; the hooks are a
 * thin `useMutation`/`useQuery` layer over these same functions,
 * consistent with how every other real service in this app is a plain
 * async-function object consumed by its own feature hook, e.g.
 * `deviceService`/`useDevice()`). No ad-hoc `fetch` — the generated
 * client's `customFetch` mutator (auth header, base URL) is reused as-is.
 */

export interface ApprovalService {
  listForCurrentParent(): Promise<LeaveRequest[]>;
  getById(leaveRequestId: string): Promise<LeaveRequest>;
  approve(leaveRequestId: string, biometricAssertion: BiometricAssertion): Promise<LeaveRequest>;
  reject(leaveRequestId: string, biometricAssertion: BiometricAssertion): Promise<LeaveRequest>;
  /** Approval History (Phase 4 Prompt 10) — the leave request's immutable
   * approval-event timeline, oldest first. Never includes actor identity
   * (see the backend's own LeaveApprovalEvent doc comment). */
  getEvents(leaveRequestId: string): Promise<LeaveApprovalEvent[]>;
}

/** Retained for backward compatibility with any code that still imports it
 * (e.g. a stale dev fixture) — no production path throws this anymore. */
export class ApprovalServiceNotImplementedError extends Error {
  constructor() {
    super(
      "Leave approval isn't available in this version of the app yet. " +
        "The backend contract this will use already exists — see docs/leave-approval.md.",
    );
    this.name = "ApprovalServiceNotImplementedError";
  }
}

export class RealApprovalService implements ApprovalService {
  async listForCurrentParent(): Promise<LeaveRequest[]> {
    return listLeaveRequests();
  }

  async getById(leaveRequestId: string): Promise<LeaveRequest> {
    return getLeaveRequest(leaveRequestId);
  }

  async approve(
    leaveRequestId: string,
    biometricAssertion: BiometricAssertion,
  ): Promise<LeaveRequest> {
    return approveLeaveRequest(leaveRequestId, { biometricAssertion });
  }

  async reject(
    leaveRequestId: string,
    biometricAssertion: BiometricAssertion,
  ): Promise<LeaveRequest> {
    return rejectLeaveRequest(leaveRequestId, { biometricAssertion });
  }

  async getEvents(leaveRequestId: string): Promise<LeaveApprovalEvent[]> {
    return listLeaveRequestEvents(leaveRequestId);
  }
}

export const approvalService: ApprovalService = new RealApprovalService();
