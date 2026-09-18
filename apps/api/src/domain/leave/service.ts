import type { BiometricFreshnessGate } from "../../lib/auth/security-gates.js";
import type { LeaveRepository } from "./repository.js";
import {
  ExitAuthorizationConflictError,
  LeaveBiometricConfirmationError,
  LeaveRequestConflictError,
  LeaveRequestNotFoundError,
} from "./errors.js";
import type {
  AuthorizeExitInput,
  BiometricAssertionInput,
  CreateLeaveRequestInput,
  ExitAuthorizationView,
  LeaveApprovalEventView,
  LeaveDecision,
  LeaveRequestView,
  MarkExpiredInput,
  StaffLeaveQueueInput,
  StaffLeaveQueueItemView,
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
    // The client always binds its step-up prompt to one specific leave
    // request (`leave-decision:${leaveRequestId}` — see
    // apps/parent-mobile/app/(app)/leave/[id].tsx), but nothing previously
    // verified that server-side: `AssertionPresenceBiometricFreshnessGate`
    // only checks that `actionId` is non-empty, not that it matches the
    // resource actually being decided (RC1 hardening finding). Without this,
    // a valid assertion captured for one leave request could be replayed
    // against any other. This check is a pure string comparison of two
    // caller-supplied values (URL param vs. body field) — it never touches
    // the database, so it creates no additional enumeration signal beyond
    // what already exists.
    const expectedActionId = `leave-decision:${params.leaveRequestId}`;
    if (params.biometricAssertion.actionId !== expectedActionId) {
      throw new LeaveBiometricConfirmationError(
        "Biometric confirmation is required and was not satisfied for this decision.",
      );
    }

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

  /** Approval History (Phase 4 Prompt 10) read path for a linked parent.
   * Reuses getForParent's already-tested anti-enumeration check instead of
   * duplicating the relationship-check SQL — a parent who cannot read the
   * leave request itself cannot read its event log either. */
  async getEventsForParent(
    leaveRequestId: string,
    actingParentId: string,
  ): Promise<LeaveApprovalEventView[]> {
    await this.getForParent(leaveRequestId, actingParentId);
    return this.repository.listEventsForLeaveRequest(leaveRequestId);
  }

  /** Same as getEventsForParent, for the owning student. */
  async getEventsForStudent(
    leaveRequestId: string,
    studentId: string,
  ): Promise<LeaveApprovalEventView[]> {
    await this.getForStudent(leaveRequestId, studentId);
    return this.repository.listEventsForLeaveRequest(leaveRequestId);
  }

  /** Staff-only queue read (Reception Dashboard, Phase 3 Prompt 7A) — a thin
   * passthrough today, kept as its own service method (rather than calling
   * the repository directly from the route) so a future authorization
   * refinement has somewhere to live without moving the route/repository
   * boundary. */
  async getQueueForStaff(input: StaffLeaveQueueInput): Promise<StaffLeaveQueueItemView[]> {
    return this.repository.listForStaffQueue(input);
  }

  /** Approval-Event Timeline for the Parent Approval Session Workspace
   * (Phase 3 Prompt 7B). Reuses the exact same anti-enumeration shape as
   * getEventsForParent/getEventsForStudent: a caller who cannot access the
   * leave request itself (wrong hostel, or it doesn't exist) cannot access
   * its event log either — the accessibility check throws before the event
   * read ever runs. */
  async getEventsForStaff(
    leaveRequestId: string,
    input: StaffLeaveQueueInput,
  ): Promise<LeaveApprovalEventView[]> {
    const accessible = await this.repository.findAccessibleLeaveRequestForStaff(
      leaveRequestId,
      input,
    );
    if (!accessible) {
      throw new LeaveRequestNotFoundError(leaveRequestId);
    }
    return this.repository.listEventsForLeaveRequest(leaveRequestId);
  }

  /** Reception-Initiated Parent Approval — the one and only server-
   * authoritative way a leave request leaves `pending` and enters the
   * parent-decidable/escalation lifecycle. Same not_found/conflict mapping
   * as markExpired(): "doesn't exist," "wrong hostel," and "not currently
   * pending" (including a losing concurrent call, or a second click after
   * approval already started) are all indistinguishable to the caller
   * beyond the 404/409 split every other staff transition already uses —
   * no new error shape was introduced for this action. */
  async startParentApproval(input: {
    leaveRequestId: string;
    actingStaffId: string;
    actingStaffRole: "reception_warden" | "hostel_admin" | "super_admin";
  }): Promise<LeaveRequestView> {
    const outcome = await this.repository.startParentApproval(input);

    switch (outcome.kind) {
      case "success":
        return outcome.leaveRequest;
      case "not_found":
        throw new LeaveRequestNotFoundError(input.leaveRequestId);
      case "conflict":
        throw new LeaveRequestConflictError(input.leaveRequestId, outcome.currentStatus);
    }
  }

  /** Phase 3, Prompt 7C — Student Verification & Exit Authorization. Same
   * not_found/conflict error-mapping discipline as every other staff
   * transition in this service; the one addition is the two distinct
   * conflict reasons `authorizeExit()`'s outcome carries (see
   * ExitAuthorizationOutcome's own doc comment). */
  async authorizeExit(input: AuthorizeExitInput): Promise<ExitAuthorizationView> {
    const outcome = await this.repository.authorizeExit(input);

    switch (outcome.kind) {
      case "success":
        return outcome.exitAuthorization;
      case "not_found":
        throw new LeaveRequestNotFoundError(input.leaveRequestId);
      case "conflict":
        throw outcome.reason === "already_authorized"
          ? new ExitAuthorizationConflictError(input.leaveRequestId, "already_authorized")
          : new ExitAuthorizationConflictError(
              input.leaveRequestId,
              "not_approved",
              outcome.currentStatus,
            );
    }
  }
}
