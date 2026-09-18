import { MetricCard } from "../dashboard";
import { computeLeaveQueueSummary, leaveQueueSummaryMetrics } from "../../features/leave";
import type { LeaveQueueItem } from "../../features/leave";
import styles from "./QueueSummary.module.css";

export interface QueueSummaryProps {
  items: LeaveQueueItem[];
  now: Date;
}

/**
 * Queue Summary metrics (Prompt 7A §11) — reuses the existing `MetricCard`
 * primitive (Prompt 5) rather than a duplicate `QueueStatisticsCard`, since
 * the two are structurally identical (label + real derived value, no
 * navigation target). Every count is genuinely derived from the
 * already-fetched, already-authorized queue dataset — see
 * `features/leave/queueSummary.ts` for the full REAL classification
 * rationale.
 */
export function QueueSummary({ items, now }: QueueSummaryProps) {
  const counts = computeLeaveQueueSummary(items, now);
  const metrics = leaveQueueSummaryMetrics(counts);

  return (
    <section aria-labelledby="queue-summary-heading">
      <h2 id="queue-summary-heading" className={styles.heading}>
        Queue Summary
      </h2>
      <div className={styles.grid}>
        {metrics.map((metric) => (
          <MetricCard key={metric.id} data={metric} />
        ))}
      </div>
    </section>
  );
}
