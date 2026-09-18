import styles from "./StatusBadge.module.css";

export type StatusTone = "neutral" | "success" | "warning" | "error" | "info";

export interface StatusBadgeProps {
  label: string;
  tone: StatusTone;
}

/** Reusable status indicator (Prompt 0.2 §16). Never color-only (§24
 * accessibility requirement — "non-color-only status indicators"): the tone
 * is always paired with an icon glyph AND the visible text label, so
 * meaning survives for a color-blind operator or a screen reader. */
const TONE_ICON: Record<StatusTone, string> = {
  neutral: "●",
  success: "✓",
  warning: "▲",
  error: "✕",
  info: "ℹ",
};

export function StatusBadge({ label, tone }: StatusBadgeProps) {
  return (
    <span className={[styles.badge, styles[tone]].join(" ")}>
      <span aria-hidden="true">{TONE_ICON[tone]}</span>
      {label}
    </span>
  );
}
