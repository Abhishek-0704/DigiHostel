import { useAuthorization } from "../../contexts/AuthorizationContext";
import { useOperationalSummary } from "../../features/dashboard";
import { MetricCard } from "./MetricCard";
import styles from "./OperationalSummary.module.css";

/**
 * Operational Summary section (Prompt 5 §7). Metrics whose destination
 * route the caller lacks permission for are filtered out entirely — same
 * "hidden navigation is not authorization" principle Prompt 4's sidebar
 * already established, applied here so a card never dangles a link the
 * operator would be denied for clicking.
 */
export function OperationalSummary() {
  const { metrics } = useOperationalSummary();
  const { hasPermission } = useAuthorization();

  const visible = metrics.filter(
    (metric) => !metric.requiredPermission || hasPermission(metric.requiredPermission),
  );

  if (visible.length === 0) return null;

  return (
    <section aria-labelledby="operational-summary-heading">
      <h2 id="operational-summary-heading" className={styles.heading}>
        Operational Summary
      </h2>
      <div className={styles.grid}>
        {visible.map((metric) => (
          <MetricCard key={metric.id} data={metric} />
        ))}
      </div>
    </section>
  );
}
