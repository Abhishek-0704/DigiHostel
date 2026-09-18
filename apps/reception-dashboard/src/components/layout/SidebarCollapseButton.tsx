import { ChevronLeftIcon, ChevronRightIcon } from "../icons";
import styles from "./SidebarCollapseButton.module.css";

export interface SidebarCollapseButtonProps {
  collapsed: boolean;
  onToggle: () => void;
}

/** Desktop collapse/expand affordance anchored to the sidebar itself
 * (Prompt 4 §8/§31) — distinct from the header's hamburger button, which
 * remains the mobile nav toggle. A real, labeled, keyboard-operable
 * `<button>` whose accessible name changes with state (never relying on
 * the chevron direction alone to communicate it, §27). */
export function SidebarCollapseButton({ collapsed, onToggle }: SidebarCollapseButtonProps) {
  return (
    <button
      type="button"
      className={styles.button}
      onClick={onToggle}
      aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
      aria-pressed={collapsed}
    >
      {collapsed ? <ChevronRightIcon size="sm" /> : <ChevronLeftIcon size="sm" />}
    </button>
  );
}
