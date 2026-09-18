import { recordHostelReturn, type HostelReturn } from "@digihostel/api-client-react";

/**
 * Movement Engine service (Phase 4, Prompt 9) — real implementation. Calls
 * the generated plain function directly, matching `LeaveService.ts`'s/
 * `StudentService.ts`'s established pattern — a thin transport wrapper.
 * The backend (`POST /api/v1/leave-requests/{id}/return`) resolves hostel
 * scope and the exit-authorization/approved-leave precondition entirely
 * server-side; this service performs no authorization or eligibility
 * checking of its own — the UI's own eligibility panel (Return Workspace)
 * is informative only, never authoritative.
 */
export interface MovementService {
  recordHostelReturn(leaveRequestId: string): Promise<HostelReturn>;
}

export const movementService: MovementService = {
  async recordHostelReturn(leaveRequestId: string) {
    return recordHostelReturn(leaveRequestId);
  },
};

export type { HostelReturn };
