import { useMemo } from "react";
import { useCurrentDateTime } from "../../hooks/useCurrentDateTime";
import styles from "./HeaderClock.module.css";

const FORMATTER = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** Header date/time display (Prompt 4 §7/§24 — "date/time display or
 * reserved integration point"). Updates once a minute, not every second —
 * a reception desk clock needs no finer resolution than that, and
 * re-rendering every second would be unnecessary churn (§28/§30 — avoid
 * decorative/unnecessary animation and re-renders). Real, not a static
 * placeholder — `Intl.DateTimeFormat` renders in the viewer's own locale
 * and timezone. Shares its ticking source with `WelcomeSection` via
 * `useCurrentDateTime` (Prompt 5 §6 — "avoid... another high-frequency
 * timer" once the header already owns canonical time) rather than each
 * component running its own independent `setInterval`. */
export function HeaderClock() {
  const now = useCurrentDateTime();

  const formatted = useMemo(() => FORMATTER.format(now), [now]);

  return (
    <span className={styles.clock} aria-label={`Current date and time: ${formatted}`}>
      {formatted}
    </span>
  );
}
