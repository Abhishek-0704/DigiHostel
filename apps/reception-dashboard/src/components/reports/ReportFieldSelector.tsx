import type { ReportFieldDefinition } from "../../services/reports/ReportService";
import styles from "./ReportFieldSelector.module.css";

export interface ReportFieldSelectorProps {
  availableFields: readonly ReportFieldDefinition[];
  selectedFields: string[];
  onChange: (next: string[]) => void;
}

/** Field SELECTION over a fixed, server-owned report definition (Phase 6,
 * Prompt 16 §9) — never a dynamic query builder. An empty selection means
 * "every available field" (the server's own default). */
export function ReportFieldSelector({
  availableFields,
  selectedFields,
  onChange,
}: ReportFieldSelectorProps) {
  if (availableFields.length === 0) return null;

  function toggle(fieldId: string) {
    // An empty selection means "every field" (the server's default) — the
    // first deselection must materialize the full list before removing one,
    // or filtering an already-empty array against `fieldId` would silently
    // no-op.
    const base = selectedFields.length === 0 ? availableFields.map((f) => f.id) : selectedFields;
    const next = base.includes(fieldId) ? base.filter((f) => f !== fieldId) : [...base, fieldId];
    onChange(next);
  }

  return (
    <fieldset className={styles.wrapper}>
      <legend className={styles.legend}>Columns</legend>
      <div className={styles.grid}>
        {availableFields.map((field) => {
          const checked = selectedFields.length === 0 || selectedFields.includes(field.id);
          const inputId = `report-field-${field.id}`;
          return (
            <label key={field.id} htmlFor={inputId} className={styles.option}>
              <input
                id={inputId}
                type="checkbox"
                checked={checked}
                onChange={() => toggle(field.id)}
              />
              {field.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
