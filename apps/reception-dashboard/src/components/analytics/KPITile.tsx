import { Card, Skeleton } from "../ui";
import styles from "./KPITile.module.css";

export interface KPITileProps {
  label: string;
  /** `null` means genuinely unavailable/not computable — rendered as an
   * honest dash + reason, NEVER as a fabricated 0 (Prompt 15 §30). A real
   * computed zero is a plain `0`, passed as a number, and renders
   * normally. */
  value: number | string | null;
  /** Required whenever `value` is `null` — the honest reason a screen
   * reader/sighted user both see instead of a number. */
  unavailableReason?: string;
  unit?: string;
  loading?: boolean;
}

/**
 * A single executive KPI stat (Phase 6, Prompt 15) — the generic version of
 * `StaffStatisticsStrip`'s/`AuditStatisticsStrip`'s per-module "Card with a
 * big number and a label" tile, made reusable across every analytics
 * domain on this one page rather than duplicated per-domain.
 */
export function KPITile({ label, value, unavailableReason, unit, loading }: KPITileProps) {
  if (loading) {
    return (
      <Card className={styles.tile} aria-busy="true">
        <Skeleton height={28} width="60%" />
        <Skeleton height={12} width="80%" />
      </Card>
    );
  }

  if (value === null) {
    return (
      <Card className={styles.tile}>
        <span className={styles.unavailable} aria-label={`${label}: unavailable`}>
          {unavailableReason ?? "Unavailable"}
        </span>
        <span className={styles.label}>{label}</span>
      </Card>
    );
  }

  return (
    <Card className={styles.tile}>
      <span className={styles.value}>
        {value}
        {unit ? <span className={styles.unit}> {unit}</span> : null}
      </span>
      <span className={styles.label}>{label}</span>
    </Card>
  );
}
