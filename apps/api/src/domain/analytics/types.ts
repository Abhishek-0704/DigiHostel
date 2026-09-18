/**
 * Operational Intelligence & Executive Analytics Dashboard (Phase 6, Prompt
 * 15) domain types.
 *
 * This is a READ-MODEL layer only — every type here is derived by
 * aggregating rows that already exist in an already-certified domain's own
 * authoritative tables (`leave_requests`/`leave_approval_events`/
 * `leave_exit_authorizations`, `movements`, `notifications`, `students`).
 * Nothing here is written by this domain, and nothing here becomes a new
 * source of truth — see `repository.ts`'s own header comment for the exact
 * provenance of every field.
 *
 * Scope discipline: `reports:view` (the Reception Dashboard permission this
 * feature reuses — granted only to `hostel_admin`/`super_admin`, already
 * established since Prompt 3) is the actual authorization boundary, so
 * `StaffScopeInput` below is deliberately narrower than every other
 * domain's identical-shaped type in this codebase (which also allows
 * `reception_warden`) — a `reception_warden` session cannot reach this
 * domain at all, enforced both by the frontend nav/permission gate and,
 * authoritatively, by `requireStaffRole("hostel_admin","super_admin")` on
 * every route in `routes/analytics.ts`.
 */

/** Server-authoritative — always the caller's own resolved staff profile
 * (routes/analytics.ts), never a client-supplied filter. */
export interface StaffScopeInput {
  staffId: string;
  staffRole: "hostel_admin" | "super_admin";
}

/** Both bounds inclusive, both ISO 8601 datetime strings, always compared
 * against the relevant table's own `timestamptz` column in UTC (every
 * `timestamptz` column in this schema is UTC by construction —
 * `defaultNow()`/`now()` — no separate timezone system is introduced here).
 * `dateFrom <= dateTo` is enforced by the route's own Zod `.refine()`, and
 * the route also enforces a maximum 90-day span (`MAX_ANALYTICS_RANGE_DAYS`
 * below) — a real, evidence-based bound against unbounded aggregation cost
 * (Prompt 15 §23), not "caching" invented for its own sake. */
export interface DateRangeInput {
  dateFrom: string;
  dateTo: string;
}

export const MAX_ANALYTICS_RANGE_DAYS = 90;
export const DEFAULT_ANALYTICS_RANGE_DAYS = 7;

export interface AnalyticsQueryInput extends StaffScopeInput, DateRangeInput {}

/**
 * Student Presence — reuses `DrizzleStudentRepository.getHostelPresenceSummary()`
 * verbatim (Phase 4, Prompt 9 remediation), wired to a route for the first
 * time by this prompt. Deliberately NOT period-bound: presence is a
 * point-in-time fact ("right now"), derived from `exitAuthorized &&
 * !returnRecorded` per student's own most recent leave request — never a
 * client-supplied or estimated number.
 */
export interface PresenceSummary {
  totalStudents: number;
  studentsInside: number;
  studentsOutside: number;
}

/**
 * Leave Analytics — every count below is derived from a SPECIFIC,
 * authoritative event, never collapsed into a single ambiguous "leave
 * status" number (Prompt 15 §10's explicit requirement):
 *
 * - `pendingNow`: a snapshot COUNT of `leave_requests.status = 'pending'`
 *   right now — genuinely not period-bound (it answers "how many need
 *   Reception's attention today," not "how many were created in the
 *   selected period").
 * - `createdInPeriod`: COUNT of `leave_requests.created_at` falling in the
 *   selected period — a request being CREATED, nothing about its outcome.
 * - `approvedInPeriod`/`rejectedInPeriod`: COUNT of
 *   `leave_approval_events` rows with `event_type = 'responded'` and the
 *   matching `response`, whose `occurred_at` falls in the selected period
 *   — the actual PARENT DECISION event, never inferred from the leave
 *   request's current (possibly since-superseded, though in practice
 *   terminal) status column.
 * - `expiredInPeriod`: COUNT of `leave_approval_events` rows with
 *   `event_type = 'expired'` in the selected period — a distinct,
 *   staff-triggered terminal event (ADR-019 §2), never conflated with
 *   rejection.
 * - `approvalRate`: `approvedInPeriod / (approvedInPeriod +
 *   rejectedInPeriod)`, or `null` if that denominator is 0 (no decided
 *   requests in the period) — never displayed as `0%`, which would falsely
 *   claim "every decided request was rejected."
 * - `avgResponseMinutes`: the average, over every leave request whose
 *   `responded` event occurred in the selected period, of
 *   `responded.occurred_at - manual_override.occurred_at` (the
 *   `manual_override` event is written by `startParentApproval()` —
 *   "Send for Parent Approval" — the actual moment escalation begins,
 *   per the Reception-Initiated Parent Approval correction; using
 *   `leave_requests.created_at` instead would incorrectly include the time
 *   before Reception ever reviewed the request). `null` if no leave
 *   request in the period has BOTH events with `responded` after
 *   `manual_override` — never estimated from an unrelated timestamp.
 */
export interface LeaveOverviewSummary {
  pendingNow: number;
  createdInPeriod: number;
  approvedInPeriod: number;
  rejectedInPeriod: number;
  expiredInPeriod: number;
  approvalRate: number | null;
  avgResponseMinutes: number | null;
}

/**
 * Movement Analytics — `returnsInPeriod` is a COUNT of `movements` rows
 * (the only implemented `movement_type`, `hostel_return`) whose
 * `occurred_at` falls in the selected period. `avgDurationMinutes` is the
 * average, over every such movement, of `movements.occurred_at -
 * leave_exit_authorizations.authorized_at` (joined via the shared
 * `leave_request_id`) — the exact, server-derived "time a student was
 * outside the hostel" duration Prompt 15 §9 requires; `null` if no
 * movement in the period has a resolvable matching exit-authorization row
 * (should not occur given `movements`' own INSERT-time RLS invariant that
 * an exit authorization must already exist, but computed defensively
 * rather than assumed).
 */
export interface MovementOverviewSummary {
  returnsInPeriod: number;
  avgDurationMinutes: number | null;
}

/**
 * Notification Analytics — Prompt 15 §14's own explicit warning applies
 * directly: this summarizes the REAL, persistent `notifications` table
 * (parent/student leave-escalation push-delivery records, ADR-018), never
 * the Reception Dashboard's own client-local Notification Center (which
 * has no persistent staff-facing record at all — confirmed unchanged since
 * Prompt 6/11's own findings). `generatedInPeriod` counts `created_at` in
 * period (regardless of current status); `deliveredInPeriod` counts rows
 * whose `delivered_at` (not `created_at`) falls in period — a delivery can
 * complete after the notification was generated, and this must not be
 * conflated; `failedInPeriod` counts rows with `status = 'failed'` AND
 * `created_at` in period.
 */
export interface NotificationOverviewSummary {
  generatedInPeriod: number;
  deliveredInPeriod: number;
  failedInPeriod: number;
}

export interface AnalyticsOverview {
  periodFrom: string;
  periodTo: string;
  presence: PresenceSummary;
  leave: LeaveOverviewSummary;
  movement: MovementOverviewSummary;
  notifications: NotificationOverviewSummary;
}

/** One day bucket, UTC calendar day (`date_trunc('day', ...)`), `date`
 * formatted `YYYY-MM-DD`. A day with zero events is included with
 * `count: 0` (a real, server-computed zero — the period genuinely had no
 * events that day — distinct from an "unavailable" state, which this
 * domain never fabricates around; see Prompt 15 §30). */
export interface TrendPoint {
  date: string;
  count: number;
}

export interface LeaveTrendResult {
  periodFrom: string;
  periodTo: string;
  createdByDay: TrendPoint[];
  approvedByDay: TrendPoint[];
  rejectedByDay: TrendPoint[];
}

/** `hour` is 0-23, UTC (matching every timestamp in this schema — no
 * separate local-time conversion is introduced, since staff/hostel local
 * time was never established as a schema concept anywhere in this
 * repository). */
export interface HourBucket {
  hour: number;
  count: number;
}

export interface MovementTrendResult {
  periodFrom: string;
  periodTo: string;
  returnsByDay: TrendPoint[];
  returnsByHour: HourBucket[];
}
