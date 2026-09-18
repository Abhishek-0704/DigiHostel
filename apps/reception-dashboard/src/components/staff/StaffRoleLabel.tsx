import type { StaffAdminRole } from "@digihostel/api-client-react";

/** The real `staff_role` enum values and their labels (Phase 5, Prompt 13)
 * — mirrors `RoleBadge`'s own `ROLE_LABELS` map exactly, extended with
 * `library_incharge` (a real, valid staff role this Center manages
 * system-wide, even though the Reception Dashboard itself has no route for
 * that role — `types/roles.ts`'s own documented distinction). No invented
 * role ("Head Warden" etc.) appears here, matching this codebase's
 * established, repeatedly-reconfirmed discipline. */
export const STAFF_ROLE_LABELS: Record<StaffAdminRole, string> = {
  reception_warden: "Reception Warden",
  library_incharge: "Library In-charge",
  hostel_admin: "Hostel Administrator",
  super_admin: "Super Administrator",
};

export function staffRoleLabel(role: StaffAdminRole): string {
  return STAFF_ROLE_LABELS[role];
}
