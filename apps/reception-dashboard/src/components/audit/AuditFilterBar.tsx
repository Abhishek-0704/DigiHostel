import { auditModuleLabel } from "./AuditModuleBadge";
import type { AuditModule, AuditActorType } from "@digihostel/api-client-react";
import styles from "./AuditFilterBar.module.css";

const AUDIT_MODULES: AuditModule[] = [
  "leave",
  "movement",
  "emergency",
  "health",
  "device",
  "staff-auth",
  "other",
];
const AUDIT_ACTOR_TYPES: AuditActorType[] = ["student", "parent", "staff", "system"];

const ACTOR_TYPE_LABEL: Record<AuditActorType, string> = {
  student: "Student",
  parent: "Parent/Guardian",
  staff: "Staff",
  system: "System",
};

export interface AuditFilters {
  modules: AuditModule[];
  actorTypes: AuditActorType[];
  dateFrom: string;
  dateTo: string;
}

export function emptyAuditFilters(): AuditFilters {
  return { modules: [], actorTypes: [], dateFrom: "", dateTo: "" };
}

export interface AuditFilterBarProps {
  filters: AuditFilters;
  onChange: (next: AuditFilters) => void;
  dateRangeError?: string;
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * Reusable Enterprise Audit Center filter controls (Phase 5, Prompt 12) —
 * mirrors `HealthFilterBar`'s/`EmergencyFilterBar`'s exact chip pattern.
 * Module/actorType are the real, complete vocabularies this endpoint's own
 * server-side filtering actually supports — never a fabricated "Priority"
 * facet the backend has no concept of. Date range is validated by the
 * caller (the page composing this bar) and surfaced back here via
 * `dateRangeError` — this component never silently swallows an invalid
 * range.
 */
export function AuditFilterBar({ filters, onChange, dateRangeError }: AuditFilterBarProps) {
  const hasActiveFilters =
    filters.modules.length > 0 ||
    filters.actorTypes.length > 0 ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "";

  return (
    <div className={styles.bar}>
      <fieldset className={styles.group}>
        <legend className={styles.legend}>Module</legend>
        <div className={styles.chips}>
          {AUDIT_MODULES.map((module) => {
            const active = filters.modules.includes(module);
            return (
              <button
                key={module}
                type="button"
                className={[styles.chip, active ? styles.chipActive : ""].filter(Boolean).join(" ")}
                aria-pressed={active}
                onClick={() => onChange({ ...filters, modules: toggle(filters.modules, module) })}
              >
                {auditModuleLabel(module)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Actor</legend>
        <div className={styles.chips}>
          {AUDIT_ACTOR_TYPES.map((actorType) => {
            const active = filters.actorTypes.includes(actorType);
            return (
              <button
                key={actorType}
                type="button"
                className={[styles.chip, active ? styles.chipActive : ""].filter(Boolean).join(" ")}
                aria-pressed={active}
                onClick={() =>
                  onChange({ ...filters, actorTypes: toggle(filters.actorTypes, actorType) })
                }
              >
                {ACTOR_TYPE_LABEL[actorType]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className={styles.dateGroup}>
        <legend className={styles.legend}>Date range</legend>
        <div className={styles.dateInputs}>
          <label className={styles.dateLabel}>
            From
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
            />
          </label>
          <label className={styles.dateLabel}>
            To
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
            />
          </label>
        </div>
        {dateRangeError && (
          <p className={styles.dateError} role="alert">
            {dateRangeError}
          </p>
        )}
      </fieldset>

      {hasActiveFilters && (
        <button
          type="button"
          className={styles.clearButton}
          onClick={() => onChange(emptyAuditFilters())}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
