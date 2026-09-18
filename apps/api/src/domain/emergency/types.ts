/**
 * Emergency Operations Center (Phase 4, Prompt 10) domain types.
 *
 * Reconnaissance before this file was written confirmed `security_incidents`
 * (packages/db/src/schema/audit.ts) is the SDD's own single canonical
 * incident table for this whole domain — extended additively (migrations
 * 0016/0017), not duplicated into a second "emergency_incidents" table. The
 * category/severity/status vocabularies below are exactly this table's own
 * enum values (packages/db/src/schema/enums.ts) — never invented ad hoc.
 */

/** The 8 emergency categories added to `security_incident_type` by this
 * prompt. The table's ORIGINAL two values (`missed_checkpoint`,
 * `manual_flag`) belong to the separate, still-unbuilt Digital Library Pass
 * checkpoint-monitoring domain and are never returned/accepted by this
 * domain's own repository queries (every query filters
 * `incident_type IN (these 8 values)`). */
export const EMERGENCY_CATEGORIES = [
  "medical",
  "personal_safety",
  "fire",
  "security_threat",
  "violence",
  "infrastructure",
  "harassment",
  "other",
] as const;
export type EmergencyCategory = (typeof EMERGENCY_CATEGORIES)[number];

export const EMERGENCY_SEVERITIES = ["critical", "high", "medium", "low", "informational"] as const;
export type EmergencySeverity = (typeof EMERGENCY_SEVERITIES)[number];

/** The EOC's own 5-state lifecycle — a subset of `security_incident_status`
 * (the ORIGINAL `escalated` value is deliberately excluded here: it belongs
 * to the checkpoint-monitoring domain and no concrete EOC requirement
 * justifies wiring a new "Escalate" action to it in this prompt). */
export const EMERGENCY_STATUSES = [
  "open",
  "acknowledged",
  "in_progress",
  "resolved",
  "closed",
] as const;
export type EmergencyStatus = (typeof EMERGENCY_STATUSES)[number];

/** Server-authoritative transition matrix — the ONLY status changes any
 * route in this domain will ever perform. Each entry's `from` is the sole
 * status a transition may start from; the repository enforces this with a
 * conditional `UPDATE ... WHERE status = from` (same deterministic,
 * concurrency-safe pattern `DrizzleLeaveRepository.decide()`/`markExpired()`
 * already established) — never a client-supplied target status. */
export const EMERGENCY_TRANSITIONS = {
  acknowledge: { from: "open", to: "acknowledged", eventType: "acknowledged" },
  startResponse: { from: "acknowledged", to: "in_progress", eventType: "response_started" },
  resolve: { from: "in_progress", to: "resolved", eventType: "resolved" },
  close: { from: "resolved", to: "closed", eventType: "closed" },
} as const satisfies Record<
  string,
  { from: EmergencyStatus; to: EmergencyStatus; eventType: string }
>;
export type EmergencyTransitionAction = keyof typeof EMERGENCY_TRANSITIONS;

export type EmergencyEventType =
  "created" | "acknowledged" | "response_started" | "note_added" | "resolved" | "closed";

/** Server-authoritative — always the caller's own resolved staff profile
 * (routes/emergencies.ts), never a client-supplied filter. Mirrors
 * StaffScopeInput (domain/student/types.ts, domain/movement/types.ts). */
export interface StaffScopeInput {
  staffId: string;
  staffRole: "reception_warden" | "hostel_admin" | "super_admin";
}

export type EmergencySortField = "reportedAt" | "severity";
export type SortDirection = "asc" | "desc";

export interface EmergencyListInput extends StaffScopeInput {
  /** Case-insensitive PREFIX match against the linked student's full_name OR
   * roll_number — same convention as StudentSearchInput.query. */
  query?: string;
  categories?: EmergencyCategory[];
  severities?: EmergencySeverity[];
  statuses?: EmergencyStatus[];
  /** Convenience shortcut: status NOT IN (resolved, closed) — matches the
   * queue's default view, mirrors QueueFilterBar's "unresolved only". */
  activeOnly?: boolean;
  /** Phase 6, Prompt 16 (Enterprise Reporting Platform) — additive, optional
   * date-range filter on `reportedAt` (createdAt), following the exact
   * precedent `HealthCaseListInput.studentId` already established (Prompt
   * 11 closure): a new optional filter, applied AFTER the existing
   * hostel-scope check, serving a new read consumer without changing any
   * existing caller's behavior. The Emergency Operations Center's own queue
   * never sets these — only the Reporting domain does. */
  dateFrom?: string;
  dateTo?: string;
  page: number;
  pageSize: number;
  sortBy: EmergencySortField;
  sortDir: SortDirection;
}

/** Deliberately minimal student identification — reused DISPLAY fields only
 * (name/roll number/hostel/room), never a duplicated guardian/leave/timeline
 * query. The queue's "Open Student Profile" action navigates to the
 * existing, already-certified Student Operations Center for anything more
 * (§ "Student Operations Integration"). */
export interface EmergencyListItemView {
  id: string;
  studentId: string;
  studentFullName: string;
  studentRollNumber: string;
  hostelId: string | null;
  hostelName: string | null;
  roomNumber: string | null;
  category: EmergencyCategory;
  severity: EmergencySeverity;
  status: EmergencyStatus;
  reportedAt: string;
  /** `null` until acknowledged (assignment happens automatically on
   * acknowledge — see repository.ts). Showing a colleague's name to another
   * staff member on a staff-only operational queue is not the same
   * disclosure concern `LeaveApprovalEventView` guards against (that hides
   * actor identity from student/parent-facing views); this queue is never
   * reachable by a student or parent session. */
  assignedStaffId: string | null;
  assignedStaffName: string | null;
}

export interface EmergencyListResult {
  items: EmergencyListItemView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface EmergencyEventView {
  id: string;
  eventType: EmergencyEventType;
  note: string | null;
  actorStaffName: string | null;
  occurredAt: string;
}

export interface EmergencyDetailView extends EmergencyListItemView {
  description: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  timeline: EmergencyEventView[];
}

/** Server-derived, active-incident counts for the EOC's own statistics
 * strip — never a client-supplied number, always a fresh aggregate query
 * scoped identically to the list endpoint. */
export interface EmergencyStatistics {
  active: number;
  critical: number;
  open: number;
  acknowledged: number;
  inProgress: number;
  resolvedToday: number;
}

/** Staff-initiated incident report (§"Emergency Creation" — the intended
 * Student App -> Emergency Trigger pipeline does not exist in this
 * repository; this is a real, honest, staff-facing "log an incident"
 * capability, not a fabricated substitute for it). `rollNumber` resolves the
 * student the SAME hostel-scoped way `DrizzleStudentRepository` already
 * does — never a client-supplied studentId/hostelId. */
export interface EmergencyCreateInput extends StaffScopeInput {
  rollNumber: string;
  category: EmergencyCategory;
  severity: EmergencySeverity;
  description: string;
}

export interface EmergencyTransitionInput extends StaffScopeInput {
  incidentId: string;
}

export interface EmergencyNoteInput extends StaffScopeInput {
  incidentId: string;
  note: string;
}
