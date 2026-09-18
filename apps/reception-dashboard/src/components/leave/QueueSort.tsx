import type { LeaveQueueSortOrder } from "../../features/leave";
import styles from "./QueueSort.module.css";

export interface QueueSortProps {
  value: LeaveQueueSortOrder;
  onChange: (value: LeaveQueueSortOrder) => void;
}

const OPTIONS: { value: LeaveQueueSortOrder; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "waiting_time", label: "Longest waiting" },
  { value: "student_name", label: "Student name" },
];

/** Reusable sort control (Prompt 7A §17). Every order is deterministic —
 * see `features/leave/filtering.ts`'s `sortLeaveQueue`, which always applies
 * a stable id tie-breaker underneath whichever order is chosen here, so a
 * realtime refetch never reorders unrelated rows. */
export function QueueSort({ value, onChange }: QueueSortProps) {
  return (
    <label className={styles.wrapper}>
      <span className={styles.label}>Sort</span>
      <select
        className={styles.select}
        value={value}
        onChange={(e) => onChange(e.target.value as LeaveQueueSortOrder)}
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
