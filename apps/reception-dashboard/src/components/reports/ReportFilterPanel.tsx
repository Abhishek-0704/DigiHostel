import type { ReportFilterDefinition, ReportFilters } from "../../services/reports/ReportService";
import { Button, FormField } from "../ui";
import styles from "./ReportFilterPanel.module.css";

export interface ReportFilterPanelProps {
  availableFilters: readonly ReportFilterDefinition[];
  value: ReportFilters;
  onChange: (next: ReportFilters) => void;
}

function toLocalDateInputValue(iso: string | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function toIsoStart(dateOnly: string): string {
  return `${dateOnly}T00:00:00.000Z`;
}
function toIsoEnd(dateOnly: string): string {
  return `${dateOnly}T23:59:59.999Z`;
}

/**
 * Reusable filter control (Phase 6, Prompt 16 §10), built entirely from a
 * report's own server-declared `availableFilters` — never a hard-coded
 * filter set. Multi-select filters render as a toggleable chip group
 * (mirroring `DateRangeFilter`'s established `aria-pressed` button-group
 * pattern, Phase 6 Prompt 15); date range renders as two native date
 * inputs. Every accepted value is already a member of that filter's own
 * `options` list — this component cannot construct an unrecognized value.
 */
export function ReportFilterPanel({ availableFilters, value, onChange }: ReportFilterPanelProps) {
  function setField<K extends keyof ReportFilters>(key: K, next: ReportFilters[K]) {
    onChange({ ...value, [key]: next });
  }

  function toggleOption(filterId: string, option: string) {
    const current = (value[filterId as keyof ReportFilters] as string[] | undefined) ?? [];
    const next = current.includes(option)
      ? current.filter((v) => v !== option)
      : [...current, option];
    onChange({ ...value, [filterId]: next.length > 0 ? next : undefined });
  }

  return (
    <div className={styles.wrapper}>
      {availableFilters.map((filter) => {
        if (filter.type === "date_range") {
          return (
            <div key={filter.id} className={styles.dateRange}>
              <FormField label="From" htmlFor="report-filter-date-from">
                <input
                  id="report-filter-date-from"
                  type="date"
                  className={styles.dateInput}
                  value={toLocalDateInputValue(value.dateFrom)}
                  onChange={(e) =>
                    setField("dateFrom", e.target.value ? toIsoStart(e.target.value) : undefined)
                  }
                />
              </FormField>
              <FormField label="To" htmlFor="report-filter-date-to">
                <input
                  id="report-filter-date-to"
                  type="date"
                  className={styles.dateInput}
                  value={toLocalDateInputValue(value.dateTo)}
                  onChange={(e) =>
                    setField("dateTo", e.target.value ? toIsoEnd(e.target.value) : undefined)
                  }
                />
              </FormField>
            </div>
          );
        }
        const selected = (value[filter.id as keyof ReportFilters] as string[] | undefined) ?? [];
        return (
          <div key={filter.id} className={styles.multiSelect}>
            <span className={styles.multiSelectLabel}>{filter.label}</span>
            <div className={styles.chipGroup} role="group" aria-label={filter.label}>
              {(filter.options ?? []).map((option) => (
                <Button
                  key={option}
                  type="button"
                  variant={selected.includes(option) ? "primary" : "secondary"}
                  aria-pressed={selected.includes(option)}
                  onClick={() => toggleOption(filter.id, option)}
                >
                  {option}
                </Button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
