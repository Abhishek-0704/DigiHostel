import type { NotificationSortOrder } from "../../features/notifications/types";
import styles from "./NotificationSort.module.css";

export interface NotificationSortProps {
  value: NotificationSortOrder;
  onChange: (value: NotificationSortOrder) => void;
}

const OPTIONS: { value: NotificationSortOrder; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "priority", label: "Priority" },
];

/** Reusable sort control (Prompt 6 §19). Deterministic by construction —
 * see `features/notifications/filtering.ts`'s `sortByOrder`, which always
 * applies `compareNotifications`' stable id tie-breaker underneath
 * whichever order is chosen here. */
export function NotificationSort({ value, onChange }: NotificationSortProps) {
  return (
    <label className={styles.wrapper}>
      <span className={styles.label}>Sort</span>
      <select
        className={styles.select}
        value={value}
        onChange={(e) => onChange(e.target.value as NotificationSortOrder)}
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
