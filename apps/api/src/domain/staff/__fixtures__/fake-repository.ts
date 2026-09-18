import type { StaffRepository } from "../repository.js";
import type {
  StaffListInput,
  StaffListResult,
  StaffListItemView,
  StaffStatisticsView,
  StaffCreateInput,
  StaffCreateOutcome,
  StaffRoleChangeInput,
  StaffHostelChangeInput,
  StaffStatusChangeInput,
  StaffMutationOutcome,
  StaffPasswordResetInput,
  StaffForceSignOutInput,
  StaffActionOutcome,
  StaffAdminRole,
} from "../types.js";
import { STAFF_ROLES } from "../types.js";

const HOSTEL_REQUIRED_ROLES: readonly StaffAdminRole[] = ["reception_warden", "hostel_admin"];

/**
 * In-memory fake, mirroring `FakeEmergencyRepository`'s established shape —
 * used by routes/staff.test.ts to exercise the route/auth/self-escalation/
 * last-super-admin-protection layer without a real Postgres connection or
 * a real Supabase Admin API call. The real SQL/Admin-API behavior is
 * exercised separately by repository.integration.test.ts.
 */
export class FakeStaffRepository implements StaffRepository {
  items: StaffListItemView[] = [];
  validHostelIds = new Set<string>();
  passwordResetCalls: string[] = [];
  forceSignOutCalls: string[] = [];
  nextId = 1;

  private freshId(): string {
    return `fake-staff-${this.nextId++}`;
  }

  async list(input: StaffListInput): Promise<StaffListResult> {
    let filtered = [...this.items];
    if (input.role && input.role.length > 0)
      filtered = filtered.filter((i) => input.role!.includes(i.role));
    if (input.status && input.status.length > 0) {
      filtered = filtered.filter((i) => input.status!.includes(i.status));
    }
    if (input.hostelId && input.hostelId.length > 0) {
      filtered = filtered.filter(
        (i) => i.hostelId !== null && input.hostelId!.includes(i.hostelId),
      );
    }
    if (input.q && input.q.trim() !== "") {
      const prefix = input.q.trim().toLowerCase();
      filtered = filtered.filter(
        (i) =>
          i.fullName.toLowerCase().startsWith(prefix) ||
          (i.email ?? "").toLowerCase().startsWith(prefix),
      );
    }
    filtered.sort((a, b) => {
      const cmp = a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
      return input.sortDir === "asc" ? cmp : -cmp;
    });
    const total = filtered.length;
    const start = (input.page - 1) * input.pageSize;
    return {
      items: filtered.slice(start, start + input.pageSize),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  async getStatistics(): Promise<StaffStatisticsView> {
    const byRole = Object.fromEntries(STAFF_ROLES.map((r) => [r, 0])) as Record<
      StaffAdminRole,
      number
    >;
    let activeStaff = 0;
    let suspendedStaff = 0;
    for (const item of this.items) {
      byRole[item.role] += 1;
      if (item.status === "active") activeStaff += 1;
      else suspendedStaff += 1;
    }
    return { totalStaff: this.items.length, activeStaff, suspendedStaff, byRole };
  }

  async getById(staffId: string): Promise<StaffListItemView | null> {
    return this.items.find((i) => i.id === staffId) ?? null;
  }

  async create(input: StaffCreateInput): Promise<StaffCreateOutcome> {
    if (HOSTEL_REQUIRED_ROLES.includes(input.role) && !input.hostelId) {
      return { kind: "hostel_required_for_role" };
    }
    if (input.hostelId && !this.validHostelIds.has(input.hostelId)) {
      return { kind: "invalid_hostel" };
    }
    if (this.items.some((i) => i.email === input.email)) {
      return { kind: "duplicate_email" };
    }
    const now = new Date().toISOString();
    const created: StaffListItemView = {
      id: this.freshId(),
      fullName: input.fullName,
      email: input.email,
      role: input.role,
      hostelId: input.hostelId,
      hostelName: input.hostelId ? "Fake Hostel" : null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    this.items.push(created);
    return { kind: "success", staff: created };
  }

  private countOtherActiveSuperAdmins(excludeId: string): number {
    return this.items.filter(
      (i) => i.role === "super_admin" && i.status === "active" && i.id !== excludeId,
    ).length;
  }

  async changeRole(input: StaffRoleChangeInput): Promise<StaffMutationOutcome> {
    if (input.targetStaffId === input.actingStaffId) return { kind: "self_target_forbidden" };
    const target = this.items.find((i) => i.id === input.targetStaffId);
    if (!target) return { kind: "not_found" };
    if (HOSTEL_REQUIRED_ROLES.includes(input.newRole) && !target.hostelId) {
      return { kind: "hostel_required_for_role" };
    }
    if (
      target.role === "super_admin" &&
      input.newRole !== "super_admin" &&
      target.status === "active"
    ) {
      if (this.countOtherActiveSuperAdmins(target.id) === 0)
        return { kind: "last_super_admin_protected" };
    }
    target.role = input.newRole;
    return { kind: "success", staff: target };
  }

  async changeHostel(input: StaffHostelChangeInput): Promise<StaffMutationOutcome> {
    if (input.targetStaffId === input.actingStaffId) return { kind: "self_target_forbidden" };
    const target = this.items.find((i) => i.id === input.targetStaffId);
    if (!target) return { kind: "not_found" };
    if (HOSTEL_REQUIRED_ROLES.includes(target.role) && !input.newHostelId) {
      return { kind: "hostel_required_for_role" };
    }
    if (input.newHostelId && !this.validHostelIds.has(input.newHostelId)) {
      return { kind: "invalid_hostel" };
    }
    target.hostelId = input.newHostelId;
    return { kind: "success", staff: target };
  }

  async changeStatus(input: StaffStatusChangeInput): Promise<StaffMutationOutcome> {
    if (input.targetStaffId === input.actingStaffId) return { kind: "self_target_forbidden" };
    const target = this.items.find((i) => i.id === input.targetStaffId);
    if (!target) return { kind: "not_found" };
    if (
      target.role === "super_admin" &&
      input.newStatus === "suspended" &&
      target.status === "active"
    ) {
      if (this.countOtherActiveSuperAdmins(target.id) === 0)
        return { kind: "last_super_admin_protected" };
    }
    target.status = input.newStatus;
    return { kind: "success", staff: target };
  }

  async resetPassword(input: StaffPasswordResetInput): Promise<StaffActionOutcome> {
    if (input.targetStaffId === input.actingStaffId) return { kind: "self_target_forbidden" };
    const target = this.items.find((i) => i.id === input.targetStaffId);
    if (!target) return { kind: "not_found" };
    this.passwordResetCalls.push(target.id);
    return { kind: "success" };
  }

  async forceSignOut(input: StaffForceSignOutInput): Promise<StaffActionOutcome> {
    if (input.targetStaffId === input.actingStaffId) return { kind: "self_target_forbidden" };
    const target = this.items.find((i) => i.id === input.targetStaffId);
    if (!target) return { kind: "not_found" };
    this.forceSignOutCalls.push(target.id);
    return { kind: "success" };
  }
}
