import { staffRoleLabel } from "./StaffRoleLabel";
import type { StaffAdminRole, StaffAdminStatus } from "@digihostel/api-client-react";
import styles from "./StaffFilterBar.module.css";

const STAFF_ADMIN_ROLES: StaffAdminRole[] = [
  "reception_warden",
  "library_incharge",
  "hostel_admin",
  "super_admin",
];
const STAFF_ADMIN_STATUSES: StaffAdminStatus[] = ["active", "suspended"];

const STATUS_LABEL: Record<StaffAdminStatus, string> = {
  active: "Active",
  suspended: "Suspended",
};

export interface StaffFilters {
  roles: StaffAdminRole[];
  statuses: StaffAdminStatus[];
}

export function emptyStaffFilters(): StaffFilters {
  return { roles: [], statuses: [] };
}

export interface StaffFilterBarProps {
  filters: StaffFilters;
  onChange: (next: StaffFilters) => void;
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * Reusable Identity & Access Administration Center filter controls (Phase
 * 5, Prompt 13) — mirrors `AuditFilterBar`'s/`HealthFilterBar`'s exact chip
 * pattern. Role/status are the real, complete vocabularies `GET /staff`'s
 * own server-side filtering actually supports.
 */
export function StaffFilterBar({ filters, onChange }: StaffFilterBarProps) {
  const hasActiveFilters = filters.roles.length > 0 || filters.statuses.length > 0;

  return (
    <div className={styles.bar}>
      <fieldset className={styles.group}>
        <legend className={styles.legend}>Role</legend>
        <div className={styles.chips}>
          {STAFF_ADMIN_ROLES.map((role) => {
            const active = filters.roles.includes(role);
            return (
              <button
                key={role}
                type="button"
                className={[styles.chip, active ? styles.chipActive : ""].filter(Boolean).join(" ")}
                aria-pressed={active}
                onClick={() => onChange({ ...filters, roles: toggle(filters.roles, role) })}
              >
                {staffRoleLabel(role)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Status</legend>
        <div className={styles.chips}>
          {STAFF_ADMIN_STATUSES.map((status) => {
            const active = filters.statuses.includes(status);
            return (
              <button
                key={status}
                type="button"
                className={[styles.chip, active ? styles.chipActive : ""].filter(Boolean).join(" ")}
                aria-pressed={active}
                onClick={() => onChange({ ...filters, statuses: toggle(filters.statuses, status) })}
              >
                {STATUS_LABEL[status]}
              </button>
            );
          })}
        </div>
      </fieldset>

      {hasActiveFilters && (
        <button
          type="button"
          className={styles.clearButton}
          onClick={() => onChange(emptyStaffFilters())}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
