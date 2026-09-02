import type { BiometricFreshnessGate } from "../../lib/auth/security-gates.js";
import type { LeaveRepository } from "./repository.js";
import {
  LeaveBiometricConfirmationError,
  LeaveRequestConflictError,
  LeaveRequestNotFoundError,
} from "./errors.js";
import type {
  BiometricAssertionInput,
  CreateLeaveRequestInput,
  LeaveDecision,
  LeaveRequestView,
  MarkExpiredInput,
} from "./types.js";

/**
 * Business logic for the Parent Leave Approval workflow. Route handlers
 * (routes/leave.ts) stay thin and call only this — never the repository
 * directly — per this task's required layering: route -> authorization ->
 * leave service -> repository/database boundary.
 */
export class LeaveService {
  constructor(
    private readonly repository: LeaveRepository,
    private readonly biometricGate: BiometricFreshnessGate,
  ) {}

  /** Read path. Throws LeaveRequestNotFoundError for both "does not exist"
   * and "exists but caller unrelated" — anti-enumeration, enforced by the
   * repository's single query shape, not by this method hiding anything
   * itself. */
  async getForParent(leaveRequestId: string, actingParentId: string): Promise<LeaveRequestView> {
    const view = await this.repository.findAccessibleLeaveRequest(leaveRequestId, actingParentId);
    if (!view) {
      throw new LeaveRequestNotFoundError(leaveRequestId);
    }
    return view;
  }

  async decide(params: {
    leaveRequestId: string;
    actingParentId: string;
    decision: LeaveDecision;
    biometricAssertion: BiometricAssertionInput;
  }): Promise<LeaveRequestView> {
    // Biometric-freshness gate runs BEFORE touching the repository — see
    // repository.ts's comment on why decide() always writes
    // biometricConfirmed: true. This check is a pure function of the
    // supplied assertion and never depends on leaveRequestId or the
    // relationship, so running it first creates no enumeration signal
    // either way (a bad assertion fails identically regardless of whether
    // the target leave request exists or belongs to this caller).
    const freshness = await this.biometricGate.checkFreshness({
      assertionToken: params.biometricAssertion.assertionToken,
      actionId: params.biometricAssertion.actionId,
    });
    if (!freshness.fresh) {
      throw new LeaveBiometricConfirmationError(
        "Biometric confirmation is required and was not satisfied for this decision.",
      );
    }

    const outcome = await this.repository.decide({
      leaveRequestId: params.leaveRequestId,
      actingParentId: params.actingParentId,
      decision: params.decision,
      biometricAssertion: params.biometricAssertion,
    });

    switch (outcome.kind) {
      case "success":
        return outcome.leaveRequest;
      case "not_found":
        throw new LeaveRequestNotFoundError(params.leaveRequestId);
      case "conflict":
        throw new LeaveRequestConflictError(params.leaveRequestId, outcome.currentStatus);
    }
  }

  /** Student creation path. `input.studentId` is trusted here because
   * routes/leave.ts only ever populates it from the authenticated caller's
   * own resolved student profile — never from a request body/param. Request
   * shape and date-range validation already happened at the route (Zod)
   * before this is called. */
  async createForStudent(input: CreateLeaveRequestInput): Promise<LeaveRequestView> {
    return this.repository.create(input);
  }

  async listForStudent(studentId: string): Promise<LeaveRequestView[]> {
    return this.repository.listForStudent(studentId);
  }

  /** All leave requests belonging to any student linked to `parentId` (G-05)
   * — same relationship authorization `getForParent`/`decide` already use,
   * just unfiltered by a specific leaveRequestId. No anti-enumeration
   * concern here (unlike the single-id read path): this is a list scoped
   * entirely to the caller's own identity, with no id parameter a caller
   * could probe — an unrelated/no-link parent simply gets an empty array,
   * never an error. */
  async listForParent(parentId: string): Promise<LeaveRequestView[]> {
    return this.repository.listForParent(parentId);
  }

  /** Read path for the owning student — same anti-enumeration shape as
   * getForParent: "doesn't exist" and "exists but belongs to another
   * student" both throw the identical LeaveRequestNotFoundError. */
  async getForStudent(leaveRequestId: string, studentId: string): Promise<LeaveRequestView> {
    const view = await this.repository.findAccessibleLeaveRequestForStudent(
      leaveRequestId,
      studentId,
    );
    if (!view) {
      throw new LeaveRequestNotFoundError(leaveRequestId);
    }
    return view;
  }

  /** Staff-only transition from manual_verification to expired (ADR-019 §2)
   * — no biometric gate (not a parent decision), same conflict/not-found
   * error mapping as decide(). */
  async markExpired(input: MarkExpiredInput): Promise<LeaveRequestView> {
    const outcome = await this.repository.markExpired(input);

    switch (outcome.kind) {
      case "success":
        return outcome.leaveRequest;
      case "not_found":
        throw new LeaveRequestNotFoundError(input.leaveRequestId);
      case "conflict":
        throw new LeaveRequestConflictError(input.leaveRequestId, outcome.currentStatus);
    }
  }
}
