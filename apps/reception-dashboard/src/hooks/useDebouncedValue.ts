import { useEffect, useState } from "react";

/**
 * Generic debounce primitive (Phase 4, Prompt 8 — Student Operations
 * Center's first real consumer: server-side search, unlike the Leave
 * Queue's existing client-side-filtered search, `QueueSearch.tsx`, which
 * has no async boundary to debounce against). Returns `value` unchanged
 * after `delayMs` of no further updates — the debounced value is what a
 * caller should key a network request off, not the raw per-keystroke value.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
