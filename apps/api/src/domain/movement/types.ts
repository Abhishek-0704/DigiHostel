/**
 * Movement Engine domain types (Phase 4, Prompt 9). Hostel Return is the
 * only implemented movement type — see `movements` table's own doc comment
 * (packages/db/src/schema/movement.ts) for why this is deliberately a
 * single-atomic-attestation shape, not a multi-state lifecycle.
 */

/** Server-authoritative — always the caller's own resolved staff profile
 * (routes/movements.ts), never a client-supplied filter. Mirrors
 * StaffScopeInput (domain/student/types.ts)/StaffLeaveQueueInput
 * (domain/leave/types.ts) exactly. */
export interface StaffScopeInput {
  staffId: string;
  staffRole: "reception_warden" | "hostel_admin" | "super_admin";
}

export interface RecordHostelReturnInput extends StaffScopeInput {
  leaveRequestId: string;
}

/** Deliberately narrower than the full `movements` row — never serializes
 * `recordedByStaffId` (actor identity is never revealed to a client,
 * matching `LeaveApprovalEventView`/`ExitAuthorizationView`'s identical
 * discipline elsewhere in this codebase). */
export interface HostelReturnView {
  id: string;
  leaveRequestId: string;
  studentId: string;
  occurredAt: string;
}
