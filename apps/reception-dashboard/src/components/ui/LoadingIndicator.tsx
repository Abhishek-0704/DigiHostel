import styles from "./LoadingIndicator.module.css";

export interface LoadingIndicatorProps {
  label?: string;
}

/** Reusable primitive (Prompt 0.2 §16). `role="status"` + `aria-live`
 * so assistive tech announces loading state without stealing focus. */
export function LoadingIndicator({ label = "Loading…" }: LoadingIndicatorProps) {
  return (
    <div className={styles.wrapper} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
