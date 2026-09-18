import { useEffect, useState } from "react";

/**
 * Shared low-frequency clock (extracted from `HeaderClock`, Prompt 4 §7,
 * when Prompt 5's `WelcomeSection` needed the same current-time fact in a
 * different format). Prompt 5 §6 explicitly warns against "multiple
 * competing clocks with different behavior" and "another high-frequency
 * timer" once the header already owns canonical time — this hook is the one
 * ticking source both `HeaderClock` and `WelcomeSection` read from, each
 * formatting the same underlying `Date` differently. Defaults to a 60s
 * interval (a reception desk / dashboard summary needs no finer resolution;
 * re-rendering every second would be unnecessary churn), overridable for a
 * genuinely different future consumer without duplicating the timer logic.
 */
export function useCurrentDateTime(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
