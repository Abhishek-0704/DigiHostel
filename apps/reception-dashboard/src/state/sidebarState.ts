import { useCallback, useState } from "react";

const STORAGE_KEY = "digihostel.reception-dashboard.sidebar-collapsed";

/** Reads the persisted collapse preference. Never throws — a private
 * window, cleared site data, or a browser that blocks storage access all
 * fail silently back to `null` (Prompt 4 §8 — "persistent UI state where
 * appropriate" is a per-viewer convenience, not something that should ever
 * break the shell if unavailable). */
function readPersistedCollapsed(): boolean | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === null ? null : raw === "true";
  } catch {
    return null;
  }
}

function persistCollapsed(value: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Same fail-silent reasoning as the read above.
  }
}

/**
 * Cross-cutting UI state (Prompt 0.2 §11, extended Prompt 4 §8/§17).
 * Sidebar collapsed/expanded is genuinely cross-feature (every dashboard
 * page renders inside DashboardLayout, which owns the sidebar) and has no
 * business meaning — a legitimate, non-speculative use of this folder,
 * unlike a business feature store (e.g. a leave-queue store), which would
 * be premature since no feature reads/writes one yet.
 *
 * Persisted to `localStorage` (new this prompt — Prompt 0.2's own
 * foundation deliberately deferred this until "a real 'operators expect
 * this to survive a reload' requirement is confirmed"; an enterprise
 * reception workstation used by the same operator across a full shift is
 * exactly that requirement). `initialCollapsed` is only the fallback for a
 * first-ever visit or an unavailable storage API.
 */
export function useSidebarState(initialCollapsed = false) {
  const [collapsed, setCollapsedState] = useState(
    () => readPersistedCollapsed() ?? initialCollapsed,
  );

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value);
    persistCollapsed(value);
  }, []);

  const toggle = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev;
      persistCollapsed(next);
      return next;
    });
  }, []);

  return { collapsed, toggle, setCollapsed };
}
