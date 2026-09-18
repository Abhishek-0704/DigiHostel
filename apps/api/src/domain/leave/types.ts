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

/**
 * The statuses a PARENT may actually decide (approve/reject) — Reception-
 * Initiated Parent Approval correction. Deliberately narrower than
 * `DECIDABLE_STATUSES`: `pending` is excluded because, before this
 * correction, a parent could call `decide()` successfully on a `pending`
 * request — one the student had only just created, that Reception had never
 * reviewed or explicitly sent for parent approval — since `pending` sat in
 * the same set used for both "is this a legal escalation stage" (still true;
 * `DECIDABLE_STATUSES`/`NEXT_ESCALATION_STAGE` keep it) and "can a parent act
 * on it right now" (no longer true for `pending`). The Parent App's own
 * presentation layer had the identical gap independently
 * (`apps/parent-mobile/src/features/leave-approval/leavePresentationMapper.ts`'s
 * `AWAITING_RESPONSE_STATUSES` included `pending` too — fixed in the same
 * corrective pass, no longer showing a `pending` request as actionable).
 * `father_notified` onward is unaffected: once Reception has explicitly
 * started parent approval (`startParentApproval()` below), the request
 * transitions straight to `father_notified`, which remains fully
 * parent-decidable exactly as before.
 */
export const PARENT_DECIDABLE_STATUSES = DECIDABLE_STATUSES.filter(
  (status) => status !== "pending",
);

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

/** Staff-only queue read (Reception Dashboard, Phase 3 Prompt 7A).
 * `staffRole` decides scoping exactly like MarkExpiredInput does:
 * reception_warden/hostel_admin are hostel-scoped, super_admin is not
 * (mirrors leave_requests_all_reception/_all_hostel_admin/_all_super_admin's
 * own RLS shape — library_incharge is deliberately excluded, no RLS grant on
 * leave_requests for that role). */
export interface StaffLeaveQueueInput {
  staffId: string;
  staffRole: "reception_warden" | "hostel_admin" | "super_admin";
}

/** A leave_requests row enriched with the minimum student/hostel/room
 * context the Reception Dashboard's queue table needs (§12 of Prompt 7A) —
 * never a parent identity/contact field, and never any SAP/mentor-approval
 * field (no such data source exists in this repository — see
 * apps/reception-dashboard/docs/leave-queue.md's SAP Integration Summary).
 * `studentHostelName`/`studentRoomNumber` come from the real `hostels`/
 * `rooms` reference tables (packages/db/src/schema/hostel.ts) — genuinely
 * REAL data, not a placeholder, since both tables exist and are readable by
 * any authenticated staff member (`hostels_select_authenticated`/
 * `rooms_select_authenticated`). */
export interface StaffLeaveQueueItemView extends LeaveRequestView {
  studentRollNumber: string;
  studentFullName: string;
  studentHostelId: string | null;
  studentHostelName: string | null;
  studentRoomId: string | null;
  studentRoomNumber: string | null;
}

/** `leave_approval_events.event_type` (packages/db/src/schema/enums.ts,
 * `approval_event_type`) — the complete, real vocabulary. No other event
 * type exists; nothing beyond this list may ever be surfaced (ADR-015). */
export type ApprovalEventType =
  "notified" | "responded" | "escalated" | "expired" | "manual_override";

/** `leave_approval_events.response` — nullable; only populated on
 * `responded` rows. */
export type ApprovalEventResponse = "approved" | "rejected" | "no_response";

/**
 * API view of one immutable `leave_approval_events` row (Approval History,
 * Phase 4 Prompt 10). Deliberately omits `actor_parent_id`/`actor_staff_id`:
 * this app must never let a parent learn which specific parent/guardian/staff
 * member acted on a request (escalation-relationship privacy — same
 * principle already applied to the Leave Approval timeline). Every field
 * here is a fact about the EVENT, never about the ACTOR.
 */
export interface LeaveApprovalEventView {
  id: string;
  eventType: ApprovalEventType;
  response: ApprovalEventResponse | null;
  biometricConfirmed: boolean;
  occurredAt: string;
}

/**
 * Phase 3, Prompt 7C — Student Verification & Exit Authorization. Staff-only
 * input to `authorizeExit()`. `identityConfirmed` is a staff attestation
 * (the server cannot independently verify a physical identity match), same
 * category of value as `biometricAssertion`/`biometricConfirmed` elsewhere
 * in this domain — required `true` at every layer (route validation, this
 * type, and the database RLS `withCheck`, defense-in-depth); a `false`/
 * absent value is rejected before ever reaching the repository. `staffRole`
 * drives hostel scoping exactly like `MarkExpiredInput`/`StaffLeaveQueueInput`.
 */
export interface AuthorizeExitInput {
  leaveRequestId: string;
  actingStaffId: string;
  actingStaffRole: "reception_warden" | "hostel_admin" | "super_admin";
  identityConfirmed: true;
}

/**
 * API view of one immutable `leave_exit_authorizations` row — the
 * authoritative record that a student physically left the hostel for a
 * specific, already-`approved` leave request. Deliberately does not surface
 * `authorizedByStaffId`: mirrors `LeaveApprovalEventView`'s own established
 * privacy discipline (a fact about the EXIT, not about which specific staff
 * member recorded it) — the actor is retained in the database row itself
 * (and in the `leave_approval_events`/`audit_logs` rows this action also
 * writes) for internal audit purposes, not for client display.
 */
export interface ExitAuthorizationView {
  id: string;
  leaveRequestId: string;
  identityConfirmed: boolean;
  authorizedAt: string;
}
