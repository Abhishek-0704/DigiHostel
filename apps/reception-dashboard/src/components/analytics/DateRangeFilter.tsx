import { Button } from "../ui";
import { DATE_RANGE_PRESETS, type DateRangePresetId } from "../../features/analytics/dateRange";
import styles from "./DateRangeFilter.module.css";

export interface DateRangeFilterProps {
  value: DateRangePresetId;
  onChange: (presetId: DateRangePresetId) => void;
}

/**
 * The ONE shared date-range control for the whole Analytics page (Phase 6,
 * Prompt 15 §16/§27) — every KPI/chart on the page reads the same selected
 * preset, so they can never silently disagree about "the period." A plain
 * button group (not a calendar picker) — the smallest control that
 * actually matches the 3 server-bounded presets
 * (`apps/api/src/domain/analytics/types.ts`'s `MAX_ANALYTICS_RANGE_DAYS`),
 * not a speculative arbitrary-range UI nothing on the backend supports yet.
 */
export function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  return (
    <div className={styles.group} role="group" aria-label="Select date range">
      {DATE_RANGE_PRESETS.map((preset) => (
        <Button
          key={preset.id}
          type="button"
          variant={preset.id === value ? "primary" : "secondary"}
          aria-pressed={preset.id === value}
          onClick={() => onChange(preset.id)}
        >
          {preset.label}
        </Button>
      ))}
    </div>
  );
}
