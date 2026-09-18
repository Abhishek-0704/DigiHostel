import { Outlet } from "react-router-dom";
import { Sidebar, Header, Footer, SkipLink } from "../components/layout";
import { SessionTimeoutWarning } from "../components/auth";
import { useSidebarState } from "../state/sidebarState";
import styles from "./DashboardLayout.module.css";

const MAIN_CONTENT_ID = "main-content";

/** Desktop-first administrative application shell (Prompt 0.2 §10, rebuilt
 * as the permanent shell in Prompt 4 §6). Sidebar + header + content area +
 * footer, matching the enterprise-dashboard direction
 * (docs/reception-dashboard-architecture.md §22). `SessionTimeoutWarning`
 * (Prompt 2 §28) is mounted here, once, for every authenticated page — it
 * self-hides outside the inactivity-warning window, so this is not a second
 * timer, just the one existing `AuthContext` timer's UI.
 *
 * Landmark structure (§6/§27): `<nav>` (Sidebar) + `<header>` (Header) +
 * `<main id="main-content">` (page content, the SkipLink's target) +
 * `<footer>` (Footer) — four real semantic landmarks, not styled `<div>`s.
 * A single `collapsed` state drives both the header's hamburger toggle and
 * the sidebar's own collapse button (`Sidebar.tsx`'s doc comment) — one
 * shared handler, not two competing toggles.
 */
export function DashboardLayout() {
  const { collapsed, toggle } = useSidebarState();

  return (
    <div className={styles.shell}>
      <SkipLink targetId={MAIN_CONTENT_ID} />
      <Sidebar collapsed={collapsed} onToggleCollapsed={toggle} />
      <div className={styles.main}>
        <Header onToggleSidebar={toggle} />
        <SessionTimeoutWarning />
        <main id={MAIN_CONTENT_ID} className={styles.content}>
          <Outlet />
        </main>
        <Footer />
      </div>
    </div>
  );
}
