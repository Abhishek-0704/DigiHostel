import { useEffect, useState } from "react";

/** Standalone, generic value-debouncing hook — no feature/domain knowledge.
 * Intended future consumers: search/filter inputs (none exist yet in this
 * foundation). */
export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
