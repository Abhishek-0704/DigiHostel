/**
 * Health Operations Center (Phase 4, Prompt 11) domain types.
 *
 * Reconnaissance before this file was written confirmed a health case is a
 * materially different, longer-lived case-tracking concept than the
 * Emergency Operations Center's acute `security_incidents` domain (Prompt
 * 10) — see packages/db/src/schema/health.ts's header for the full
 * reasoning on why this is a NEW table pair (`health_cases`/
 * `health_case_events`), not a further extension of `security_incidents`.
 * The category/status/event vocabularies below are exactly this new
 * table's own enum values (packages/db/src/schema/enums.ts) — never
 * invented ad hoc. `severity` reuses the EXISTING
 * `security_incident_severity` vocabulary (no competing concept).
 */

export const HEALTH_CASE_CATEGORIES = [
  "hospital_admission",
  "medical_observation",
  "emergency_admission",
  "outpatient_visit",
  "discharge",
  "medical_follow_up",
  "accident",
  "other_medical_event",
] as const;
export type HealthCaseCategory = (typeof HEALTH_CASE_CATEGORIES)[number];

/** Reuses the EOC's own severity vocabulary/enum column type directly. */
export const HEALTH_CASE_SEVERITIES = [
  "critical",
  "high",
  "medium",
  "low",
  "informational",
] as const;
export type HealthCaseSeverity = (typeof HEALTH_CASE_SEVERITIES)[number];

/** Admission-type categories set `admittedAt` automatically at creation
 * (see repository.ts's `create()`) — a real, honest fact ("reported as an
 * admission at this time"), never a fabricated clinical confirmation. */
export const ADMISSION_CATEGORIES: readonly HealthCaseCategory[] = [
  "hospital_admission",
  "emergency_admission",
];

export const HEALTH_CASE_STATUSES = [
  "new",
  "acknowledged",
  "monitoring",
  "awaiting_update",
  "resolved",
  "discharged",
  "closed",
  "cancelled",
] as const;
export type HealthCaseStatus = (typeof HEALTH_CASE_STATUSES)[number];

export type HealthCaseEventType =
  | "created"
  | "acknowledged"
  | "monitoring_started"
  | "awaiting_update"
  | "update_received"
  | "note_added"
  | "resolved"
  | "discharge_recorded"
  | "closed"
  | "cancelled";

/** Server-authoritative transition matrix — the ONLY status changes any
 * route in this domain will ever perform. `from` may be a single status or
 * a small set (only `close`, which is reachable from either terminal-ish
 * state `resolved` or `discharged`) — the repository enforces this with a
 * conditional `UPDATE ... WHERE status = from` / `WHERE status IN (from)`
 * (same deterministic, concurrency-safe pattern
 * `DrizzleEmergencyRepository.transition()` already established), never a
 * client-supplied target status. */
export const HEALTH_CASE_TRANSITIONS = {
  acknowledge: { from: "new", to: "acknowledged", eventType: "acknowledged" },
  cancel: { from: "new", to: "cancelled", eventType: "cancelled" },
  startMonitoring: { from: "acknowledged", to: "monitoring", eventType: "monitoring_started" },
  markAwaitingUpdate: { from: "monitoring", to: "awaiting_update", eventType: "awaiting_update" },
  resumeMonitoring: { from: "awaiting_update", to: "monitoring", eventType: "update_received" },
  resolve: { from: "monitoring", to: "resolved", eventType: "resolved" },
  discharge: { from: "monitoring", to: "discharged", eventType: "discharge_recorded" },
  close: { from: ["resolved", "discharged"], to: "closed", eventType: "closed" },
} as const satisfies Record<
  string,
  {
    from: HealthCaseStatus | HealthCaseStatus[];
    to: HealthCaseStatus;
    eventType: HealthCaseEventType;
  }
>;
export type HealthCaseTransitionAction = keyof typeof HEALTH_CASE_TRANSITIONS;

/** Server-authoritative — always the caller's own resolved staff profile
 * (routes/health-cases.ts), never a client-supplied filter. Mirrors
 * emergency/types.ts's identical `StaffScopeInput`. */
export interface StaffScopeInput {
  staffId: string;
  staffRole: "reception_warden" | "hostel_admin" | "super_admin";
}

export type HealthCaseSortField = "reportedAt" | "severity";
export type SortDirection = "asc" | "desc";

export interface HealthCaseListInput extends StaffScopeInput {
  query?: string;
  categories?: HealthCaseCategory[];
  severities?: HealthCaseSeverity[];
  statuses?: HealthCaseStatus[];
  /** Convenience shortcut: status NOT IN (resolved, discharged, closed,
   * cancelled) — matches the queue's default view. */
  activeOnly?: boolean;
  /** Prompt 11 closure (Medical History condition) — restricts the list to
   * one student's own cases, still fully hostel-scoped by `scopeCheck()`
   * like every other query in this repository. This is what the Health
   * Case Detail page's read-only "Medical History" section uses to list a
   * student's OTHER cases — the same authoritative `health_cases` table
   * the operational queue reads, just filtered per-student instead of
   * per-hostel/status. Never a second, duplicated history store. */
  studentId?: string;
  /** Phase 6, Prompt 16 (Enterprise Reporting Platform) — additive, optional
   * date-range filter on `reportedAt` (createdAt), following the exact same
   * precedent `studentId` above already established. The Health Operations
   * Center's own queue never sets these — only the Reporting domain does. */
  dateFrom?: string;
  dateTo?: string;
  page: number;
  pageSize: number;
  sortBy: HealthCaseSortField;
  sortDir: SortDirection;
}

/** Deliberately minimal student identification — reused DISPLAY fields
 * only (name/roll number/hostel/room), never a duplicated guardian/leave
 * query. The queue's "Open Student Profile" action navigates to the
 * existing, already-certified Student Operations Center for anything
 * more. */
export interface HealthCaseListItemView {
  id: string;
  studentId: string;
  studentFullName: string;
  studentRollNumber: string;
  hostelId: string | null;
  hostelName: string | null;
  roomNumber: string | null;
  category: HealthCaseCategory;
  severity: HealthCaseSeverity;
  status: HealthCaseStatus;
  reportedAt: string;
  admittedAt: string | null;
  /** Most recent timeline event's timestamp, or `reportedAt` if none —
   * server-derived, never a client-computed guess. */
  latestUpdateAt: string;
  assignedStaffId: string | null;
  assignedStaffName: string | null;
}

export interface HealthCaseListResult {
  items: HealthCaseListItemView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface HealthCaseEventView {
  id: string;
  eventType: HealthCaseEventType;
  note: string | null;
  actorStaffName: string | null;
  occurredAt: string;
}

export interface HealthCaseDetailView extends HealthCaseListItemView {
  description: string | null;
  resolvedAt: string | null;
  dischargedAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  timeline: HealthCaseEventView[];
}

/** Server-derived counts for the Health Operations Center's own statistics
 * strip — never a client-supplied number, always a fresh aggregate query
 * scoped identically to the list endpoint. */
export interface HealthCaseStatistics {
  active: number;
  critical: number;
  newCases: number;
  monitoring: number;
  awaitingUpdate: number;
  admittedToday: number;
  dischargedToday: number;
}

/** Staff-initiated case report — the intended KIIMS/hospital-system
 * producer does not exist in this repository (see routes/health-cases.ts's
 * doc comment); this is a real, honest "log a medical case" capability, not
 * a fabricated substitute for it. `rollNumber` resolves the student the
 * SAME hostel-scoped way `DrizzleStudentRepository`/
 * `DrizzleEmergencyRepository` already do — never a client-supplied
 * studentId/hostelId. */
export interface HealthCaseCreateInput extends StaffScopeInput {
  rollNumber: string;
  category: HealthCaseCategory;
  severity: HealthCaseSeverity;
  description: string;
}

export interface HealthCaseTransitionInput extends StaffScopeInput {
  caseId: string;
}

export interface HealthCaseNoteInput extends StaffScopeInput {
  caseId: string;
  note: string;
}
