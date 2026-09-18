import { LEAVE_REQUEST_STATUSES, LEAVE_STATUS_LABEL } from "../../features/leave";
import type { LeaveQueueFilters } from "../../features/leave";
import type { LeaveRequestStatus } from "@digihostel/api-client-react";
import styles from "./QueueFilterBar.module.css";

export interface QueueFilterBarProps {
  filters: LeaveQueueFilters;
  onChange: (next: LeaveQueueFilters) => void;
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * Reusable queue filter controls (Prompt 7A §16). Status is the ONLY
 * status-shaped filter dimension exposed — the real, complete
 * `leave_request_status` enum, never a fabricated "priority" or "leave
 * type" filter (§16's explicit rule: "do not create filters for fields
 * that have no authoritative source" — no such fields exist on this data
 * model). "Unresolved only" is a convenience shortcut over the same real
 * status vocabulary (excludes approved/rejected/expired), matching the
 * Notification Center's identical "unread only" pattern.
 */
export function QueueFilterBar({ filters, onChange }: QueueFilterBarProps) {
  const hasActiveFilters = filters.statuses.length > 0 || filters.unresolvedOnly;

  function toggleStatus(status: LeaveRequestStatus) {
    onChange({ ...filters, statuses: toggle(filters.statuses, status) });
  }

  return (
    <div className={styles.bar}>
      <fieldset className={styles.group}>
        <legend className={styles.legend}>Status</legend>
        <div className={styles.chips}>
          {LEAVE_REQUEST_STATUSES.map((status) => {
            const active = filters.statuses.includes(status);
            return (
              <button
                key={status}
                type="button"
                className={[styles.chip, active ? styles.chipActive : ""].filter(Boolean).join(" ")}
                aria-pressed={active}
                onClick={() => toggleStatus(status)}
              >
                {LEAVE_STATUS_LABEL[status]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className={styles.unresolvedToggle}>
        <input
          type="checkbox"
          checked={filters.unresolvedOnly}
          onChange={(e) => onChange({ ...filters, unresolvedOnly: e.target.checked })}
        />
        Unresolved only
      </label>

      {hasActiveFilters && (
        <button
          type="button"
          className={styles.clearButton}
          onClick={() => onChange({ statuses: [], unresolvedOnly: false })}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
