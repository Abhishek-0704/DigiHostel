import { Link } from "react-router-dom";
import { BellIcon } from "../icons";
import styles from "./NotificationIndicator.module.css";

export interface NotificationIndicatorProps {
  to: string;
  count: number;
}

/** Header notification-bell primitive (Prompt 0.2 §16/§19, rebuilt Prompt 4
 * §7/§25). Links to the real, already-permission-gated `/notifications`
 * route (Prompt 0.2/3) — not a dead button. Renders a count only when
 * greater than zero; no notification list/panel, no data source wired up
 * yet (the Notification Center's real data source remains architecturally
 * undecided, `docs/reception-dashboard-architecture.md` §19) — every
 * current caller still passes `count={0}`. */
export function NotificationIndicator({ to, count }: NotificationIndicatorProps) {
  return (
    <Link
      to={to}
      className={styles.button}
      aria-label={count > 0 ? `${count} unread notifications` : "Notifications"}
    >
      <BellIcon size="md" />
      {count > 0 && (
        <span className={styles.badge} aria-hidden="true">
          {count}
        </span>
      )}
    </Link>
  );
}
