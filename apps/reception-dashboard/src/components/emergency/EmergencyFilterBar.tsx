import {
  EMERGENCY_CATEGORIES,
  EMERGENCY_SEVERITIES,
  EMERGENCY_STATUSES,
} from "../../features/emergency";
import { emergencyCategoryLabel, emergencyStatusLabel } from "./EmergencyBadges";
import type {
  EmergencyCategory,
  EmergencySeverity,
  EmergencyStatus,
} from "@digihostel/api-client-react";
import styles from "./EmergencyFilterBar.module.css";

export interface EmergencyFilters {
  categories: EmergencyCategory[];
  severities: EmergencySeverity[];
  statuses: EmergencyStatus[];
  activeOnly: boolean;
}

export function emptyEmergencyFilters(): EmergencyFilters {
  return { categories: [], severities: [], statuses: [], activeOnly: true };
}

export interface EmergencyFilterBarProps {
  filters: EmergencyFilters;
  onChange: (next: EmergencyFilters) => void;
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

const SEVERITY_LABEL: Record<EmergencySeverity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  informational: "Informational",
};

/**
 * Reusable EOC queue filter controls (Phase 4, Prompt 10) — mirrors
 * `QueueFilterBar`'s (Prompt 7A) exact chip pattern. Category/severity/
 * status are the real, complete enum vocabularies this table's schema
 * actually defines (no fabricated "priority" or filter dimension with no
 * authoritative source). "Active only" is a convenience shortcut over the
 * same real status vocabulary (excludes resolved/closed), matching the
 * Leave Queue's identical "unresolved only" pattern.
 */
export function EmergencyFilterBar({ filters, onChange }: EmergencyFilterBarProps) {
  const hasActiveFilters =
    filters.categories.length > 0 || filters.severities.length > 0 || filters.statuses.length > 0;

  return (
    <div className={styles.bar}>
      <fieldset className={styles.group}>
        <legend className={styles.legend}>Category</legend>
        <div className={styles.chips}>
          {EMERGENCY_CATEGORIES.map((category) => {
            const active = filters.categories.includes(category);
            return (
              <button
                key={category}
                type="button"
                className={[styles.chip, active ? styles.chipActive : ""].filter(Boolean).join(" ")}
                aria-pressed={active}
                onClick={() =>
                  onChange({ ...filters, categories: toggle(filters.categories, category) })
                }
              >
                {emergencyCategoryLabel(category)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Priority</legend>
        <div className={styles.chips}>
          {EMERGENCY_SEVERITIES.map((severity) => {
            const active = filters.severities.includes(severity);
            return (
              <button
                key={severity}
                type="button"
                className={[styles.chip, active ? styles.chipActive : ""].filter(Boolean).join(" ")}
                aria-pressed={active}
                onClick={() =>
                  onChange({ ...filters, severities: toggle(filters.severities, severity) })
                }
              >
                {SEVERITY_LABEL[severity]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Status</legend>
        <div className={styles.chips}>
          {EMERGENCY_STATUSES.map((status) => {
            const active = filters.statuses.includes(status);
            return (
              <button
                key={status}
                type="button"
                className={[styles.chip, active ? styles.chipActive : ""].filter(Boolean).join(" ")}
                aria-pressed={active}
                onClick={() => onChange({ ...filters, statuses: toggle(filters.statuses, status) })}
              >
                {emergencyStatusLabel(status)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className={styles.activeOnlyToggle}>
        <input
          type="checkbox"
          checked={filters.activeOnly && filters.statuses.length === 0}
          disabled={filters.statuses.length > 0}
          onChange={(e) => onChange({ ...filters, activeOnly: e.target.checked })}
        />
        Active only
      </label>

      {hasActiveFilters && (
        <button
          type="button"
          className={styles.clearButton}
          onClick={() => onChange(emptyEmergencyFilters())}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
