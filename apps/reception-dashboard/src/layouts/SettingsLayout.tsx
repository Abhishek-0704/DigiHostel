import { Outlet } from "react-router-dom";
import { NavItem } from "../components/navigation";
import { ROUTES } from "../constants/routes";
import styles from "./SettingsLayout.module.css";

/** Layout for future settings pages (Prompt 0.2 §10) — a secondary,
 * settings-scoped nav alongside the main dashboard shell. No settings
 * content implemented yet. */
export function SettingsLayout() {
  return (
    <div className={styles.wrapper}>
      <nav aria-label="Settings" className={styles.nav}>
        <NavItem to={ROUTES.settings} label="Account" />
        <NavItem to={ROUTES.users} label="Users" />
        <NavItem to={ROUTES.help} label="Help & Support" />
      </nav>
      <div className={styles.content}>
        <Outlet />
      </div>
    </div>
  );
}
