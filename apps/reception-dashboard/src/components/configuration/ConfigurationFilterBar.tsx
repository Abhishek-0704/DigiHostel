import { configurationDomainLabel } from "./ConfigurationDomainLabel";
import type { ConfigurationDomain, ConfigurationScope } from "@digihostel/api-client-react";
import styles from "./ConfigurationFilterBar.module.css";

const CONFIGURATION_DOMAINS: ConfigurationDomain[] = [
  "hostel",
  "approval",
  "movement",
  "emergency",
  "health",
  "notification",
  "system",
  "feature_flags",
];
const CONFIGURATION_SCOPES: ConfigurationScope[] = ["global", "hostel"];

export interface ConfigurationFilters {
  domains: ConfigurationDomain[];
  scopes: ConfigurationScope[];
  activeOnly: boolean | null;
}

export function emptyConfigurationFilters(): ConfigurationFilters {
  return { domains: [], scopes: [], activeOnly: null };
}

export interface ConfigurationFilterBarProps {
  filters: ConfigurationFilters;
  onChange: (next: ConfigurationFilters) => void;
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * Reusable Enterprise Configuration Center filter controls (Phase 5,
 * Prompt 14) — mirrors `StaffFilterBar`'s/`AuditFilterBar`'s exact chip
 * pattern. Domain/scope are the real, complete vocabularies `GET
 * /configuration`'s own server-side filtering actually supports.
 */
export function ConfigurationFilterBar({ filters, onChange }: ConfigurationFilterBarProps) {
  const hasActiveFilters =
    filters.domains.length > 0 || filters.scopes.length > 0 || filters.activeOnly !== null;

  return (
    <div className={styles.bar}>
      <fieldset className={styles.group}>
        <legend className={styles.legend}>Domain</legend>
        <div className={styles.chips}>
          {CONFIGURATION_DOMAINS.map((domain) => {
            const active = filters.domains.includes(domain);
            return (
              <button
                key={domain}
                type="button"
                className={[styles.chip, active ? styles.chipActive : ""].filter(Boolean).join(" ")}
                aria-pressed={active}
                onClick={() => onChange({ ...filters, domains: toggle(filters.domains, domain) })}
              >
                {configurationDomainLabel(domain)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Scope</legend>
        <div className={styles.chips}>
          {CONFIGURATION_SCOPES.map((scope) => {
            const active = filters.scopes.includes(scope);
            return (
              <button
                key={scope}
                type="button"
                className={[styles.chip, active ? styles.chipActive : ""].filter(Boolean).join(" ")}
                aria-pressed={active}
                onClick={() => onChange({ ...filters, scopes: toggle(filters.scopes, scope) })}
              >
                {scope === "global" ? "Global" : "Hostel-scoped"}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Status</legend>
        <div className={styles.chips}>
          <button
            type="button"
            className={[styles.chip, filters.activeOnly === true ? styles.chipActive : ""]
              .filter(Boolean)
              .join(" ")}
            aria-pressed={filters.activeOnly === true}
            onClick={() =>
              onChange({ ...filters, activeOnly: filters.activeOnly === true ? null : true })
            }
          >
            Active only
          </button>
          <button
            type="button"
            className={[styles.chip, filters.activeOnly === false ? styles.chipActive : ""]
              .filter(Boolean)
              .join(" ")}
            aria-pressed={filters.activeOnly === false}
            onClick={() =>
              onChange({ ...filters, activeOnly: filters.activeOnly === false ? null : false })
            }
          >
            Inactive only
          </button>
        </div>
      </fieldset>

      {hasActiveFilters && (
        <button
          type="button"
          className={styles.clearButton}
          onClick={() => onChange(emptyConfigurationFilters())}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
