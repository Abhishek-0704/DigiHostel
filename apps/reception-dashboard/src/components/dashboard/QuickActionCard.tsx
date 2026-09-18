import { useNavigate } from "react-router-dom";
import { Card } from "../ui";
import type { QuickActionDefinition } from "../../features/dashboard";
import styles from "./QuickActionCard.module.css";

export interface QuickActionCardProps {
  action: QuickActionDefinition;
}

/**
 * Single Quick Action (Prompt 5 §9/§26). A pure navigation shortcut — it
 * calls `useNavigate()` to an already-real route and implements nothing
 * about the destination module (§9's "they are navigation shortcuts
 * only"). Uses the same `<button onClick={() => navigate(...)}>` pattern
 * `NotFoundPage`/`AccessDeniedMessage` already established, never a
 * `<Link>` nested inside a styled button.
 */
export function QuickActionCard({ action }: QuickActionCardProps) {
  const navigate = useNavigate();
  const Icon = action.icon;

  return (
    <Card className={styles.card} data-testid={`quick-action-${action.id}`}>
      <button
        type="button"
        className={styles.button}
        onClick={() => navigate(action.route)}
        aria-label={`${action.label}: ${action.description}`}
      >
        <span className={styles.iconWrap} aria-hidden="true">
          <Icon size="md" />
        </span>
        <span className={styles.label}>{action.label}</span>
      </button>
    </Card>
  );
}
