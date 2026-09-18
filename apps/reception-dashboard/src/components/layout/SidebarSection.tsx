import type { ReactNode } from "react";
import styles from "./SidebarSection.module.css";

export interface SidebarSectionProps {
  label: string;
  collapsed: boolean;
  children: ReactNode;
}

/** A labeled group of sidebar items (Prompt 4 §8 — "nested sections").
 * Rendered as a real `<h3>` heading (not a styled `<div>`) so it appears
 * as a genuine landmark-adjacent heading for screen-reader navigation,
 * matching the sidebar's own `aria-label="Primary"` nav landmark. Hidden
 * visually (not removed) when the sidebar is collapsed — the group's items
 * remain individually reachable and labeled (`NavItem`'s own `collapsed`
 * handling), the heading just adds no value at icon-only width. */
export function SidebarSection({ label, collapsed, children }: SidebarSectionProps) {
  return (
    <div className={styles.section}>
      {!collapsed && <h3 className={styles.heading}>{label}</h3>}
      <ul className={styles.list}>{children}</ul>
    </div>
  );
}
