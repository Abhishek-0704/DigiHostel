import styles from "./ErrorState.module.css";
import { Button } from "./Button";

export interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

/** Reusable primitive (Prompt 0.2 §16/§20/§26). `role="alert"` so the error
 * is announced as soon as it renders — the pattern apps/parent-mobile's
 * F-09 fix established was necessary for a live-region error to actually
 * be announced (docs/current-state.md), applied here from the start rather
 * than retrofitted later. */
export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className={styles.wrapper} role="alert">
      <p className={styles.message}>{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
