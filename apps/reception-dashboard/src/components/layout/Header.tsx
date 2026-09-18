import { useAuthorization } from "../../contexts/AuthorizationContext";
import { useNotificationCenter } from "../../contexts/NotificationContext";
import { ROUTES } from "../../constants/routes";
import { MenuIcon, SearchIcon } from "../icons";
import { NotificationIndicator } from "../feedback/NotificationIndicator";
import { StaffIdentity } from "./StaffIdentity";
import { ProfileMenu } from "./ProfileMenu";
import { HeaderClock } from "./HeaderClock";
import { ConnectivityStatus } from "./ConnectivityStatus";
import styles from "./Header.module.css";

export interface HeaderProps {
  onToggleSidebar: () => void;
}

/**
 * Dashboard shell header (Prompt 0.2 §10, rebuilt Prompt 4 §7/§24/§25).
 * Structure: menu toggle + brand identity on the left; status region
 * (search/connectivity/clock/notifications/profile) on the right.
 *
 * Integration points for genuinely future functionality stay exactly
 * that — inert, clearly labeled placeholders, never fake business
 * behavior (§7's explicit rule): the search button has no query
 * implementation behind it. The notification bell and the settings entry
 * (inside `ProfileMenu`) are NOT placeholders — `/notifications` links to
 * the real Notification Center (Prompt 6), and its badge count is the
 * genuine canonical `unreadCount` from `NotificationContext`, never a
 * second, independently-computed count (§40) — it simply reads `0` today
 * since no real notification producer exists yet (honest, not fabricated).
 * `/settings` is already a real, permission-gated route from Prompt 0.2/3.
 */
export function Header({ onToggleSidebar }: HeaderProps) {
  const { hasPermission, isAuthorizationLoading } = useAuthorization();
  const canViewNotifications = !isAuthorizationLoading && hasPermission("notifications:view");
  // Prompt 6 §14/§40: the ONE canonical unread count, read from
  // NotificationContext — never computed independently here.
  const { unreadCount } = useNotificationCenter();

  return (
    <header className={styles.header}>
      <button
        type="button"
        className={styles.menuButton}
        onClick={onToggleSidebar}
        aria-label="Toggle navigation"
      >
        <MenuIcon size="md" />
      </button>
      <span className={styles.title}>Reception Dashboard</span>

      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.iconButton} ${styles.searchButton}`}
          disabled
          aria-label="Search (coming soon)"
          title="Search — coming soon"
        >
          <SearchIcon size="md" />
        </button>

        <ConnectivityStatus />
        <HeaderClock />

        {canViewNotifications && (
          <NotificationIndicator to={ROUTES.notifications} count={unreadCount} />
        )}

        <StaffIdentity />
        <ProfileMenu />
      </div>
    </header>
  );
}
