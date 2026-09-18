import { NOTIFICATION_CATEGORY_META } from "../../features/notifications/categories";
import { NOTIFICATION_PRIORITY_META } from "../../features/notifications/priorities";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_PRIORITIES,
} from "../../features/notifications/types";
import type {
  NotificationCategory,
  NotificationFilters,
  NotificationPriority,
} from "../../features/notifications/types";
import styles from "./NotificationFilterBar.module.css";

export interface NotificationFilterBarProps {
  filters: NotificationFilters;
  onChange: (next: NotificationFilters) => void;
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * Reusable notification filter controls (Prompt 6 §17). Category and
 * priority are real, working toggle-button groups (`aria-pressed`, never
 * color-only — each chip carries its own text label); `dateRange`/`sources`
 * are modeled in `NotificationFilters` but have no control here yet (see
 * `docs/notification-center.md` §7 for why) — `states` is intentionally
 * folded into the simpler "unread only" toggle for this first pass rather
 * than a full 8-state picker, since most of those states have no real data
 * to filter by yet either.
 */
export function NotificationFilterBar({ filters, onChange }: NotificationFilterBarProps) {
  const hasActiveFilters =
    filters.categories.length > 0 || filters.priorities.length > 0 || filters.unreadOnly;

  function toggleCategory(category: NotificationCategory) {
    onChange({ ...filters, categories: toggle(filters.categories, category) });
  }
  function togglePriority(priority: NotificationPriority) {
    onChange({ ...filters, priorities: toggle(filters.priorities, priority) });
  }

  return (
    <div className={styles.bar}>
      <fieldset className={styles.group}>
        <legend className={styles.legend}>Priority</legend>
        <div className={styles.chips}>
          {NOTIFICATION_PRIORITIES.map((priority) => {
            const active = filters.priorities.includes(priority);
            return (
              <button
                key={priority}
                type="button"
                className={[styles.chip, active ? styles.chipActive : ""].filter(Boolean).join(" ")}
                aria-pressed={active}
                onClick={() => togglePriority(priority)}
              >
                {NOTIFICATION_PRIORITY_META[priority].label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Category</legend>
        <div className={styles.chips}>
          {NOTIFICATION_CATEGORIES.map((category) => {
            const active = filters.categories.includes(category);
            return (
              <button
                key={category}
                type="button"
                className={[styles.chip, active ? styles.chipActive : ""].filter(Boolean).join(" ")}
                aria-pressed={active}
                onClick={() => toggleCategory(category)}
              >
                {NOTIFICATION_CATEGORY_META[category].label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className={styles.unreadToggle}>
        <input
          type="checkbox"
          checked={filters.unreadOnly}
          onChange={(e) => onChange({ ...filters, unreadOnly: e.target.checked })}
        />
        Unread only
      </label>

      {hasActiveFilters && (
        <button
          type="button"
          className={styles.clearButton}
          onClick={() =>
            onChange({ categories: [], priorities: [], states: [], unreadOnly: false })
          }
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
