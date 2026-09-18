import type { ComponentType } from "react";
import { NavLink } from "react-router-dom";
import type { IconProps } from "../icons";
import styles from "./NavItem.module.css";

export interface NavItemProps {
  to: string;
  label: string;
  icon?: ComponentType<IconProps>;
  /** Icon-only rendering for a collapsed sidebar (Prompt 4 §8). The label
   * is never actually removed from the DOM in this state — it becomes
   * visually-hidden text plus the native `title` attribute, so the link
   * still has a real accessible name and a hover tooltip. The PRIOR
   * scaffolding passed `label=""` when collapsed, which left the link with
   * no accessible name at all in that state — a real defect this fixes,
   * not merely a visual change. */
  collapsed?: boolean;
}

/** Reusable navigation primitive (Prompt 0.2 §16/§25, extended Prompt 4
 * §8/§9/§27). Uses react-router's `NavLink` so the active route gets
 * `aria-current="page"` automatically — never a manually computed
 * "isActive" class. Active state is shown via both a background/left-border
 * treatment AND `aria-current` (never color alone, §27). */
export function NavItem({ to, label, icon: Icon, collapsed = false }: NavItemProps) {
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        [styles.item, isActive ? styles.active : "", collapsed ? styles.collapsedItem : ""]
          .filter(Boolean)
          .join(" ")
      }
    >
      {Icon && <Icon size="md" />}
      <span className={collapsed ? styles.srOnly : undefined}>{label}</span>
    </NavLink>
  );
}
