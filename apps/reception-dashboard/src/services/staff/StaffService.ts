import {
  listStaff,
  getStaffStatistics,
  getStaff,
  createStaff,
  changeStaffRole,
  changeStaffHostel,
  changeStaffStatus,
  resetStaffPassword,
  forceSignOutStaff,
  type StaffList,
  type StaffStatistics,
  type StaffAdmin,
  type StaffAdminRole,
  type StaffAdminStatus,
} from "@digihostel/api-client-react";

export interface StaffListParams {
  q?: string;
  role?: StaffAdminRole[];
  status?: StaffAdminStatus[];
  hostelId?: string[];
  page: number;
  pageSize: number;
  sortDir: "asc" | "desc";
}

export interface CreateStaffParams {
  fullName: string;
  email: string;
  role: StaffAdminRole;
  hostelId: string | null;
}

/**
 * Identity & Access Administration Center service (Phase 5, Prompt 13) —
 * real implementation, matching `HealthOperationsService`'s/
 * `AuditService`'s established thin-transport-wrapper pattern. The backend
 * independently re-resolves the caller's own identity and re-verifies
 * super_admin authorization on every call — this service performs no
 * authorization of its own, and never accepts or sends a password.
 */
export interface StaffAdminService {
  list(params: StaffListParams): Promise<StaffList>;
  getStatistics(): Promise<StaffStatistics>;
  getById(staffId: string): Promise<StaffAdmin>;
  create(params: CreateStaffParams): Promise<StaffAdmin>;
  changeRole(staffId: string, role: StaffAdminRole): Promise<StaffAdmin>;
  changeHostel(staffId: string, hostelId: string | null): Promise<StaffAdmin>;
  changeStatus(staffId: string, status: StaffAdminStatus): Promise<StaffAdmin>;
  resetPassword(staffId: string): Promise<void>;
  forceSignOut(staffId: string): Promise<void>;
}

export const staffAdminService: StaffAdminService = {
  async list(params) {
    return listStaff({
      q: params.q,
      role: params.role,
      status: params.status,
      hostelId: params.hostelId,
      page: params.page,
      pageSize: params.pageSize,
      sortDir: params.sortDir,
    });
  },
  async getStatistics() {
    return getStaffStatistics();
  },
  async getById(staffId) {
    return getStaff(staffId);
  },
  async create(params) {
    return createStaff({
      fullName: params.fullName,
      email: params.email,
      role: params.role,
      hostelId: params.hostelId,
    });
  },
  async changeRole(staffId, role) {
    return changeStaffRole(staffId, { role });
  },
  async changeHostel(staffId, hostelId) {
    return changeStaffHostel(staffId, { hostelId });
  },
  async changeStatus(staffId, status) {
    return changeStaffStatus(staffId, { status });
  },
  async resetPassword(staffId) {
    await resetStaffPassword(staffId);
  },
  async forceSignOut(staffId) {
    await forceSignOutStaff(staffId);
  },
};

export type { StaffList, StaffStatistics, StaffAdmin, StaffAdminRole, StaffAdminStatus };
