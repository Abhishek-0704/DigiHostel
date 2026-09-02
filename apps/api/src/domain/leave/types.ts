/**
 * Domain types for the Parent Leave Approval workflow. Deliberately a
 * distinct, narrow "view" type for API responses — never the raw Drizzle
 * row shape — so a future column addition to leave_requests doesn't
 * automatically leak into the API without a deliberate decision.
 */

/** Statuses defined by the existing schema (packages/db/src/schema/enums.ts,
 * `leave_request_status`) that still admit a parent decision. The
 * escalation-notification states (father_notified/mother_notified/
 * guardian_notified/in_app_call/manual_verification) are included because
 * nothing in this task creates them yet, but the state machine already
 * defines them as pre-decision states in the SDD's escalation chain (Ch.5) —
 * excluding them here would silently invent a narrower vocabulary than the
 * schema already has. See ADR-015 and docs/leave-approval-workflow.md. */
export const DECIDABLE_STATUSES = [
  "pending",
  "father_notified",
  "mother_notified",
  "guardian_notified",
  "in_app_call",
  "manual_verification",
] as const;

export type DecidableStatus = (typeof DECIDABLE_STATUSES)[number];

export const TERMINAL_STATUSES = ["approved", "rejected", "expired"] as const;
export type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

export type LeaveRequestStatus = DecidableStatus | TerminalStatus;

export type LeaveDecision = "approved" | "rejected";

export interface LeaveRequestView {
  id: string;
  studentId: string;
  reason: string;
  startDate: string;
  endDate: string;
  status: LeaveRequestStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BiometricAssertionInput {
  assertionToken: string;
  actionId: string;
}

export interface DecideLeaveRequestInput {
  leaveRequestId: string;
  actingParentId: string;
  decision: LeaveDecision;
  biometricAssertion: BiometricAssertionInput;
}

/** Student-facing creation input. `studentId` is always resolved from the
 * authenticated caller's profile (routes/leave.ts) — never accepted as a
 * client-supplied field, per this task's Critical Rule. */
export interface CreateLeaveRequestInput {
  studentId: string;
  reason: string;
  startDate: string;
  endDate: string;
}
