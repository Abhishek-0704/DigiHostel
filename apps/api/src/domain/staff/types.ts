/**
 * Identity & Access Administration Center (Phase 5, Prompt 13) domain
 * types.
 *
 * Scope discipline (see `apps/reception-dashboard/docs/identity-admin.md`
 * for the full reasoning): `docs/current-state.md`'s own pre-existing gap
 * list already scoped this to "basic provisioning" for `super_admin` only
 * — role is a fixed database enum (not a database-row/custom-role model),
 * permissions are static, role-derived constants (never per-user), and
 * `staff.hostel_id` is a single nullable column (never multi-hostel).
 * Nothing here invents a role, a permission, or a multi-hostel model the
 * repository does not already establish.
 */

export const STAFF_ROLES = [
  "reception_warden",
  "library_incharge",
  "hostel_admin",
  "super_admin",
] as const;
export type StaffAdminRole = (typeof STAFF_ROLES)[number];

export const STAFF_STATUSES = ["active", "suspended"] as const;
export type StaffAdminStatus = (typeof STAFF_STATUSES)[number];

export interface ActorScope {
  /** The ACTING super_admin's own staff id — resolved server-side from
   * the authenticated session, never client-supplied. Used exclusively to
   * detect and block self-targeting mutations (§12's explicit
   * self-escalation defense). */
  actingStaffId: string;
}

export interface StaffListItemView {
  id: string;
  fullName: string;
  email: string | null;
  role: StaffAdminRole;
  hostelId: string | null;
  hostelName: string | null;
  status: StaffAdminStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StaffListInput extends ActorScope {
  q?: string;
  role?: StaffAdminRole[];
  status?: StaffAdminStatus[];
  hostelId?: string[];
  page: number;
  pageSize: number;
  sortDir: "asc" | "desc";
}

export interface StaffListResult {
  items: StaffListItemView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface StaffStatisticsView {
  totalStaff: number;
  activeStaff: number;
  suspendedStaff: number;
  byRole: Record<StaffAdminRole, number>;
}

export interface StaffCreateInput extends ActorScope {
  fullName: string;
  email: string;
  role: StaffAdminRole;
  hostelId: string | null;
}

export type StaffCreateOutcome =
  | { kind: "success"; staff: StaffListItemView }
  | { kind: "duplicate_email" }
  | { kind: "invalid_hostel" }
  | { kind: "hostel_required_for_role" };

export interface StaffRoleChangeInput extends ActorScope {
  targetStaffId: string;
  newRole: StaffAdminRole;
}

export type StaffMutationOutcome =
  | { kind: "success"; staff: StaffListItemView }
  | { kind: "not_found" }
  | { kind: "self_target_forbidden" }
  | { kind: "last_super_admin_protected" }
  | { kind: "invalid_hostel" }
  | { kind: "hostel_required_for_role" };

export interface StaffHostelChangeInput extends ActorScope {
  targetStaffId: string;
  newHostelId: string | null;
}

export interface StaffStatusChangeInput extends ActorScope {
  targetStaffId: string;
  newStatus: StaffAdminStatus;
}

export interface StaffPasswordResetInput extends ActorScope {
  targetStaffId: string;
}

export interface StaffForceSignOutInput extends ActorScope {
  targetStaffId: string;
}

export type StaffActionOutcome =
  { kind: "success" } | { kind: "not_found" } | { kind: "self_target_forbidden" };
