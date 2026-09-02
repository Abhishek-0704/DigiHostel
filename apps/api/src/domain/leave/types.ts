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

/** The escalation chain's automated next hop for each stage (ADR-017,
 * corrected by ADR-019 §1: guardian_notified -> in_app_call ->
 * manual_verification, two hops, not one). Derived directly from
 * DECIDABLE_STATUSES's own order rather than duplicated as a separate
 * literal map — that order already IS the escalation order.
 * `manual_verification` has no automatic successor: automation stops there
 * (ADR-017 §9 / ADR-019 §2 — `expired` is reached only by explicit staff
 * action, never a scheduled job). */
export const NEXT_ESCALATION_STAGE: Partial<Record<DecidableStatus, DecidableStatus>> =
  Object.fromEntries(
    DECIDABLE_STATUSES.slice(0, -1).map((stage, i) => [stage, DECIDABLE_STATUSES[i + 1]]),
  );

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

/** Staff action from manual_verification only (ADR-019 §2) — `role` decides
 * whether the repository applies the same hostel-scope restriction
 * `leave_requests_all_reception`/`_hostel_admin`'s RLS policies encode
 * (super_admin is unscoped; reception_warden/hostel_admin are not).
 * Fastify's own DB connection bypasses RLS (repository.ts's doc comment),
 * so this scope check must be re-enforced here in application code, exactly
 * like decide()'s relationship check already is. */
export interface MarkExpiredInput {
  leaveRequestId: string;
  actingStaffId: string;
  actingStaffRole: "reception_warden" | "hostel_admin" | "super_admin";
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
