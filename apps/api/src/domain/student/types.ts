import type { LeaveRequestStatus } from "../leave/types.js";

/**
 * Student Operations Center (Phase 4, Prompt 8) domain types.
 *
 * Reconnaissance before this file was written (not repeated here — see
 * apps/reception-dashboard/docs/student-operations.md §2) confirmed the
 * ACTUAL authoritative `students` schema (packages/db/src/schema/
 * identity.ts) carries only `id`, `authUserId`, `rollNumber`, `fullName`,
 * `hostelId`, `roomId`, `createdAt`, `updatedAt` — no department, program,
 * semester, gender, phone, photograph, registration number, academic year,
 * student category, or mentor field exists anywhere in this schema. None of
 * those are represented below; fabricating them (even as `null`-filled
 * placeholders that LOOK like real fields) would violate this task's
 * explicit No-Fabrication Rule. `parents` (identity.ts) carries only
 * `fullName`/`phoneNumber` beyond its own id — no separate per-relationship
 * fields exist either. `rooms` (hostel.ts) carries only `roomNumber` — no
 * `floor` column exists in this schema, so no floor field/filter is
 * represented here.
 */

/** Server-authoritative — always the caller's own resolved staff profile
 * (routes/students.ts), never a client-supplied filter. Mirrors
 * StaffLeaveQueueInput's identical shape (domain/leave/types.ts). */
export interface StaffScopeInput {
  staffId: string;
  staffRole: "reception_warden" | "hostel_admin" | "super_admin";
}

export type StudentSortField = "fullName" | "rollNumber";
export type SortDirection = "asc" | "desc";

export interface StudentSearchInput extends StaffScopeInput {
  /** Free-text query matched as a case-insensitive PREFIX against
   * full_name OR roll_number — never a fabricated full-text/fuzzy search
   * over fields this schema doesn't index. `undefined`/empty returns the
   * caller's whole in-scope population, newest-name-first. */
  query?: string;
  /** 1-based. */
  page: number;
  pageSize: number;
  sortBy: StudentSortField;
  sortDir: SortDirection;
}

/** Deliberately narrower than the full `students` row — never serializes
 * `authUserId` (an internal identity-linkage field with no product purpose
 * on a staff-facing read surface, per this task's own data-minimization
 * requirement, §14). */
export interface StudentSearchResultItem {
  id: string;
  rollNumber: string;
  fullName: string;
  hostelId: string | null;
  hostelName: string | null;
  roomId: string | null;
  roomNumber: string | null;
}

export interface StudentSearchResult {
  items: StudentSearchResultItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** One linked parent/guardian, minimized to exactly what the Student
 * Operations Center profile needs — never `id`/`authUserId` (internal
 * identifiers with no product purpose here, and the same discipline
 * `LeaveApprovalEventView` already applies to actor identity elsewhere in
 * this codebase). */
export interface StudentGuardianView {
  fullName: string;
  relationshipType: "father" | "mother" | "guardian";
  phoneNumber: string;
}

/** The student's single most recent leave request, if any — reused,
 * unmutated, read-only data from the certified Parent Approval /
 * Exit Authorization workflow (Prompt 7A/7B/7C, QG-02 PASSED WITH MINOR
 * IMPROVEMENTS). This is the DigiHostel Hostel Leaving Request concept
 * ONLY — never conflated with, and carrying no field derived from, KIIT
 * SAP's separate Holiday Request concept (which this repository confirms,
 * by direct search, has no scraper/service/table/endpoint anywhere —
 * BLOCKED / NOT IMPLEMENTED, see student-operations.md §9). */
export interface StudentCurrentLeaveView {
  id: string;
  status: LeaveRequestStatus;
  reason: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
  /** True only if a real `leave_exit_authorizations` row exists for this
   * leave request — never inferred/guessed. */
  exitAuthorized: boolean;
  exitAuthorizedAt: string | null;
  /** Phase 4, Prompt 9 — true only if a real `movements` row (movement_type
   * = 'hostel_return') exists for this leave request. Deliberately a
   * derived read, never a stored `students.status`/presence column — see
   * `MovementRepository.recordHostelReturn`'s own doc comment
   * (domain/movement/repository.ts) for why "is this student currently
   * inside or outside the hostel" is answered entirely from
   * (exitAuthorized && !returnRecorded), never a separate, potentially
   * contradictory status field. */
  returnRecorded: boolean;
  returnedAt: string | null;
}

/** One immutable `leave_approval_events` row for the student's current
 * leave request — same actor-omission discipline as `LeaveApprovalEventView`
 * (domain/leave/types.ts): never reveals which specific parent/guardian/
 * staff member acted. */
export interface StudentTimelineEventView {
  id: string;
  eventType: "notified" | "responded" | "escalated" | "expired" | "manual_override";
  response: "approved" | "rejected" | "no_response" | null;
  occurredAt: string;
}

/** Phase 4, Prompt 9 remediation (closing the "student hostel status"
 * condition from the QG-02-style Prompt 9 review). Server-derived,
 * never persisted: `"outside_hostel"` iff the student's own current leave
 * request is genuinely exit-authorized and has no return recorded yet
 * (`currentLeave.exitAuthorized && !currentLeave.returnRecorded`);
 * `"inside_hostel"` for every other case, including "no leave request at
 * all." This is the SAME derivation `StudentReturnPage`'s own
 * `alreadyReturned`/`isExitAuthorized` client logic already computes
 * (Prompt 9's original doc comment on `returnRecorded` above already
 * specified this exact rule) — now also computed once, server-side, and
 * exposed as its own named field so every consumer reads the identical
 * value instead of each re-deriving it independently. See
 * `apps/reception-dashboard/docs/movement-engine.md` §12 for the full
 * rationale for deriving rather than persisting this. */
export type HostelPresence = "inside_hostel" | "outside_hostel";

export interface StudentProfileView {
  id: string;
  rollNumber: string;
  fullName: string;
  hostelId: string | null;
  hostelName: string | null;
  roomId: string | null;
  roomNumber: string | null;
  guardians: StudentGuardianView[];
  /** `null` when the student has never created a leave request — an honest
   * absence, not an error. */
  currentLeave: StudentCurrentLeaveView | null;
  /** `[]` when `currentLeave` is `null` (nothing to show a timeline for) or
   * the current leave genuinely has no events yet. */
  timeline: StudentTimelineEventView[];
  hostelPresence: HostelPresence;
}
