import {
  HEALTH_CASE_CATEGORIES,
  HEALTH_CASE_SEVERITIES,
  HEALTH_CASE_STATUSES,
} from "../../features/health";
import { healthCaseCategoryLabel, healthCaseStatusLabel } from "./HealthBadges";
import type {
  HealthCaseCategory,
  HealthCaseSeverity,
  HealthCaseStatus,
} from "@digihostel/api-client-react";
import styles from "./HealthFilterBar.module.css";

export interface HealthCaseFilters {
  categories: HealthCaseCategory[];
  severities: HealthCaseSeverity[];
  statuses: HealthCaseStatus[];
  activeOnly: boolean;
}

export function emptyHealthCaseFilters(): HealthCaseFilters {
  return { categories: [], severities: [], statuses: [], activeOnly: true };
}

export interface HealthFilterBarProps {
  filters: HealthCaseFilters;
  onChange: (next: HealthCaseFilters) => void;
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

const SEVERITY_LABEL: Record<HealthCaseSeverity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  informational: "Informational",
};

/**
 * Reusable Health Operations Center queue filter controls (Phase 4, Prompt
 * 11) — mirrors `EmergencyFilterBar`'s exact chip pattern. Category/
 * severity/status are the real, complete enum vocabularies this table's
 * schema actually defines. "Active only" is a convenience shortcut over the
 * same real status vocabulary (excludes resolved/discharged/closed/
 * cancelled).
 */
export function HealthFilterBar({ filters, onChange }: HealthFilterBarProps) {
  const hasActiveFilters =
    filters.categories.length > 0 || filters.severities.length > 0 || filters.statuses.length > 0;

  return (
    <div className={styles.bar}>
      <fieldset className={styles.group}>
        <legend className={styles.legend}>Category</legend>
        <div className={styles.chips}>
          {HEALTH_CASE_CATEGORIES.map((category) => {
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
                {healthCaseCategoryLabel(category)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Priority</legend>
        <div className={styles.chips}>
          {HEALTH_CASE_SEVERITIES.map((severity) => {
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
          {HEALTH_CASE_STATUSES.map((status) => {
            const active = filters.statuses.includes(status);
            return (
              <button
                key={status}
                type="button"
                className={[styles.chip, active ? styles.chipActive : ""].filter(Boolean).join(" ")}
                aria-pressed={active}
                onClick={() => onChange({ ...filters, statuses: toggle(filters.statuses, status) })}
              >
                {healthCaseStatusLabel(status)}
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
          onClick={() => onChange(emptyHealthCaseFilters())}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
