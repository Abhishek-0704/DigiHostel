import { NavItem } from "../navigation";
import { SidebarSection } from "./SidebarSection";
import { SidebarCollapseButton } from "./SidebarCollapseButton";
import { UNGATED_NAVIGATION_ITEMS, useVisibleNavigation } from "../../lib/navigation";
import styles from "./Sidebar.module.css";

export interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

/** Dashboard shell navigation (Prompt 0.2 §10/§25, made permission-aware in
 * Prompt 3 §16, rebuilt on the centralized navigation model in Prompt 4
 * §8/§9). Every item's visibility derives from `useVisibleNavigation()`,
 * which defers to `useAuthorization().hasPermission` — the SAME centralized
 * check `RequirePermission` (route guards) uses, per §16/§10's explicit
 * "navigation visibility must derive from the same centralized
 * authorization model, not a duplicated logic path." Settings/Help are
 * always shown (ungated pages, `routes/index.tsx`'s own doc comment) and
 * are therefore not permission-filtered — rendered unconditionally below,
 * unchanged from Prompt 0.2/3's own convention. */
export function Sidebar({ collapsed, onToggleCollapsed }: SidebarProps) {
  const { topLevelItems, groups } = useVisibleNavigation();

  return (
    <nav className={collapsed ? styles.collapsed : styles.sidebar} aria-label="Primary">
      <div className={styles.scrollArea}>
        <ul className={styles.list}>
          {topLevelItems.map((item) => (
            <li key={item.id}>
              <NavItem to={item.route} label={item.label} icon={item.icon} collapsed={collapsed} />
            </li>
          ))}
        </ul>

        {groups.map((resolved) => (
          <SidebarSection
            key={resolved.group.id}
            label={resolved.group.label}
            collapsed={collapsed}
          >
            {resolved.items.map((item) => (
              <li key={item.id}>
                <NavItem
                  to={item.route}
                  label={item.label}
                  icon={item.icon}
                  collapsed={collapsed}
                />
              </li>
            ))}
          </SidebarSection>
        ))}

        <div className={styles.footerGroup}>
          <ul className={styles.list}>
            {UNGATED_NAVIGATION_ITEMS.map((item) => (
              <li key={item.id}>
                <NavItem
                  to={item.route}
                  label={item.label}
                  icon={item.icon}
                  collapsed={collapsed}
                />
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={styles.collapseArea}>
        <SidebarCollapseButton collapsed={collapsed} onToggle={onToggleCollapsed} />
      </div>
    </nav>
  );
}
