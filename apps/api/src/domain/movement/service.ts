import type { MovementRepository } from "./repository.js";
import type { RecordHostelReturnInput, HostelReturnView } from "./types.js";
import { MovementConflictError, MovementLeaveRequestNotFoundError } from "./errors.js";

/**
 * Service boundary for the Movement Engine (Phase 4, Prompt 9) — thin
 * pass-through over the repository, mirroring `LeaveService`'s/
 * `StudentService`'s own shape.
 */
export class MovementService {
  constructor(private readonly repository: MovementRepository) {}

  async recordHostelReturn(input: RecordHostelReturnInput): Promise<HostelReturnView> {
    const outcome = await this.repository.recordHostelReturn(input);
    if (outcome.kind === "not_found") {
      throw new MovementLeaveRequestNotFoundError(input.leaveRequestId);
    }
    if (outcome.kind === "conflict") {
      throw new MovementConflictError(
        input.leaveRequestId,
        outcome.reason,
        outcome.reason === "not_eligible" ? outcome.currentStatus : undefined,
      );
    }
    return outcome.hostelReturn;
  }
}
