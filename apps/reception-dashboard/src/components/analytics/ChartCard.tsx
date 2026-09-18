import type { ReactNode } from "react";
import { Card, Skeleton, ErrorState, EmptyState } from "../ui";
import styles from "./ChartCard.module.css";

export interface ChartCardProps {
  title: string;
  description?: string;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  isEmpty?: boolean;
  emptyMessage?: string;
  /** A plain-language description of what the chart shows (Prompt 15
   * §21/§22's explicit requirement: "for every important chart, provide a
   * textual interpretation or accessible data summary"). Rendered visually
   * hidden but present in the accessibility tree — a screen-reader user
   * gets the same information a sighted user reads off the chart's shape,
   * not merely "a chart exists here." */
  accessibleSummary?: string;
  children: ReactNode;
}

/**
 * Shared chart wrapper (Phase 6, Prompt 15 §21) — every trend chart on the
 * Analytics page composes this ONE component for its title/loading/empty/
 * error/accessible-summary/responsive-container chrome, so those five
 * states are implemented once, not duplicated per chart.
 */
export function ChartCard({
  title,
  description,
  loading,
  error,
  onRetry,
  isEmpty,
  emptyMessage,
  accessibleSummary,
  children,
}: ChartCardProps) {
  return (
    <Card className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>

      {loading ? (
        <div aria-busy="true" aria-label={`Loading ${title}`}>
          <Skeleton height={220} width="100%" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : isEmpty ? (
        <EmptyState title="No data for this period" description={emptyMessage} />
      ) : (
        <>
          {accessibleSummary ? <p className={styles.srOnly}>{accessibleSummary}</p> : null}
          <div className={styles.chartArea} aria-hidden={accessibleSummary ? "true" : undefined}>
            {children}
          </div>
        </>
      )}
    </Card>
  );
}
