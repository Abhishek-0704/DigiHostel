import { useNavigate } from "react-router-dom";
import { Card } from "../ui";
import type { MetricCardData } from "../../features/dashboard";
import styles from "./MetricCard.module.css";

export interface MetricCardProps {
  data: MetricCardData;
}

/**
 * Reusable operational-summary metric primitive (Prompt 5 §7/§26). Renders
 * either a real numeric `value` or an honest `unavailableReason` — never
 * both, never a fabricated number in place of a missing one (§7/§34's
 * central rule: "— / Awaiting Leave Management integration" instead of a
 * made-up "12").
 *
 * Becomes a real, keyboard-accessible button (not a `<Link>` nested inside
 * another control — the same nested-interactive-element defect caught and
 * fixed in `NotFoundPage` during Prompt 4) only when the card carries a
 * `route`; a card with no destination stays a plain, non-interactive
 * informational surface (§29 — "purely informational cards should not
 * become unnecessary interactive controls").
 */
export function MetricCard({ data }: MetricCardProps) {
  const navigate = useNavigate();
  const Icon = data.icon;
  const hasValue = data.value !== null;

  const content = (
    <>
      <div className={styles.iconWrap} aria-hidden="true">
        <Icon size="md" />
      </div>
      <div className={styles.body}>
        <span className={styles.label}>{data.label}</span>
        {hasValue ? (
          <span className={styles.value}>{data.value}</span>
        ) : (
          <span className={styles.unavailable}>
            <span aria-hidden="true">—</span>
            {data.unavailableReason && <span> {data.unavailableReason}</span>}
          </span>
        )}
      </div>
    </>
  );

  if (data.route) {
    const accessibleName = hasValue
      ? `${data.label}: ${data.value}. View.`
      : `${data.label}: ${data.unavailableReason ?? "not available"}. View.`;
    return (
      <Card className={styles.card} data-testid={`metric-${data.id}`}>
        <button
          type="button"
          className={styles.actionable}
          onClick={() => navigate(data.route as string)}
          aria-label={accessibleName}
        >
          {content}
        </button>
      </Card>
    );
  }

  return (
    <Card className={styles.card} data-testid={`metric-${data.id}`}>
      <div className={styles.actionable}>{content}</div>
    </Card>
  );
}
