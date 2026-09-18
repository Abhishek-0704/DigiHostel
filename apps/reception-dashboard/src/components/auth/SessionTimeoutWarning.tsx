import { useAuthContext } from "../../contexts/AuthContext";
import { formatRemainingTime } from "../../lib/validation/formatRemainingTime";
import { Button } from "../ui";
import styles from "./SessionTimeoutWarning.module.css";

/**
 * "You're about to be signed out" banner (Prompt 1's `authentication.md`
 * explicitly assigns this UI to Prompt 2 — the inactivity timer/state
 * itself, `useInactivityTimer`/`AuthContext`, was already built and is
 * reused unchanged here, not duplicated: §28 forbids a second timer).
 * Renders nothing outside the `"warning"` window — the dashboard shell
 * mounts this unconditionally once authenticated, and it self-hides.
 * `role="status"`/`aria-live="polite"` rather than `"alert"`: this is an
 * advance notice, not an error, and re-announcing it every second as the
 * countdown ticks would be disruptive — only its appearance is announced.
 */
export function SessionTimeoutWarning() {
  const { inactivityStatus, inactivityRemainingMs, resetInactivityTimer } = useAuthContext();

  if (inactivityStatus !== "warning") return null;

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <span>
        You will be signed out in {formatRemainingTime(inactivityRemainingMs)} due to inactivity.
      </span>
      <Button type="button" variant="secondary" onClick={resetInactivityTimer}>
        Stay signed in
      </Button>
    </div>
  );
}
