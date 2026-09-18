import type { StaffRepository } from "./repository.js";
import type {
  StaffListInput,
  StaffListResult,
  StaffStatisticsView,
  StaffListItemView,
  StaffCreateInput,
  StaffRoleChangeInput,
  StaffHostelChangeInput,
  StaffStatusChangeInput,
  StaffPasswordResetInput,
  StaffForceSignOutInput,
} from "./types.js";
import {
  StaffNotFoundError,
  StaffSelfTargetError,
  StaffLastSuperAdminError,
  StaffDuplicateEmailError,
  StaffInvalidHostelError,
  StaffHostelRequiredError,
} from "./errors.js";

/**
 * Service boundary for the Identity & Access Administration Center (Phase
 * 5, Prompt 13) — thin pass-through over the repository, matching
 * `EmergencyService`'s/`HealthService`'s established shape. The only logic
 * beyond delegation is turning a repository outcome into the typed error
 * the route maps to the correct HTTP status.
 */
export class StaffAdminService {
  constructor(private readonly repository: StaffRepository) {}

  async list(input: StaffListInput): Promise<StaffListResult> {
    return this.repository.list(input);
  }

  async getStatistics(): Promise<StaffStatisticsView> {
    return this.repository.getStatistics();
  }

  async getById(staffId: string): Promise<StaffListItemView> {
    const found = await this.repository.getById(staffId);
    if (!found) throw new StaffNotFoundError(staffId);
    return found;
  }

  async create(input: StaffCreateInput): Promise<StaffListItemView> {
    const outcome = await this.repository.create(input);
    if (outcome.kind === "duplicate_email") throw new StaffDuplicateEmailError(input.email);
    if (outcome.kind === "invalid_hostel") throw new StaffInvalidHostelError(input.hostelId ?? "");
    if (outcome.kind === "hostel_required_for_role") {
      throw new StaffHostelRequiredError(input.role);
    }
    return outcome.staff;
  }

  async changeRole(input: StaffRoleChangeInput): Promise<StaffListItemView> {
    const outcome = await this.repository.changeRole(input);
    return this.unwrap(outcome, input.newRole);
  }

  async changeHostel(input: StaffHostelChangeInput): Promise<StaffListItemView> {
    const outcome = await this.repository.changeHostel(input);
    return this.unwrap(outcome);
  }

  async changeStatus(input: StaffStatusChangeInput): Promise<StaffListItemView> {
    const outcome = await this.repository.changeStatus(input);
    return this.unwrap(outcome);
  }

  async resetPassword(input: StaffPasswordResetInput): Promise<void> {
    const outcome = await this.repository.resetPassword(input);
    if (outcome.kind === "not_found") throw new StaffNotFoundError(input.targetStaffId);
    if (outcome.kind === "self_target_forbidden") throw new StaffSelfTargetError();
  }

  async forceSignOut(input: StaffForceSignOutInput): Promise<void> {
    const outcome = await this.repository.forceSignOut(input);
    if (outcome.kind === "not_found") throw new StaffNotFoundError(input.targetStaffId);
    if (outcome.kind === "self_target_forbidden") throw new StaffSelfTargetError();
  }

  private unwrap(
    outcome:
      | { kind: "success"; staff: StaffListItemView }
      | { kind: "not_found" }
      | { kind: "self_target_forbidden" }
      | { kind: "last_super_admin_protected" }
      | { kind: "invalid_hostel" }
      | { kind: "hostel_required_for_role" },
    role?: string,
  ): StaffListItemView {
    if (outcome.kind === "not_found") throw new StaffNotFoundError("");
    if (outcome.kind === "self_target_forbidden") throw new StaffSelfTargetError();
    if (outcome.kind === "last_super_admin_protected") {
      throw new StaffLastSuperAdminError("modify");
    }
    if (outcome.kind === "invalid_hostel") throw new StaffInvalidHostelError("");
    if (outcome.kind === "hostel_required_for_role") {
      throw new StaffHostelRequiredError(role ?? "");
    }
    return outcome.staff;
  }
}
