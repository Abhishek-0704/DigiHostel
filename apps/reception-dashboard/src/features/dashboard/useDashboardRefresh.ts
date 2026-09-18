import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export const DASHBOARD_QUERY_KEY_NAMESPACE = ["dashboard"] as const;

export interface DashboardRefreshState {
  /** Bumped on every refresh — passed down to `useRealtimeConnectionProbe`
   * so a manual refresh gets a fresh connection reading instead of trusting
   * a socket state that may be stale (Prompt 5 §18/§19). */
  generation: number;
  lastUpdatedAt: Date | null;
  refresh: () => void;
}

/**
 * Dashboard-wide refresh orchestrator (Prompt 5 §18 — "Do not force every
 * widget to reload if only one failed... use its invalidation/refetch
 * mechanism rather than manually duplicating fetch logic").
 *
 * Two real effects today, both honest about what they actually do:
 * 1. `queryClient.invalidateQueries` under the `["dashboard"]` key
 *    namespace — a genuine no-op right now (no widget has registered a
 *    query under this key yet, since every current widget's data is either
 *    static/local or realtime-probed, not TanStack-Query-backed), but this
 *    establishes the real, working convention a future widget (once a real
 *    metric/activity query exists) will actually be invalidated by, without
 *    that future widget needing its own bespoke refresh wiring.
 * 2. Bumping `generation` remounts `useRealtimeConnectionProbe`'s channel,
 *    genuinely re-testing the realtime socket connection rather than
 *    reporting a stale cached state.
 *
 * Deliberately no `isRefreshing` boolean: neither effect above has an
 * awaitable result to spin on (invalidating an empty query namespace
 * resolves immediately; remounting a channel is fire-and-forget from the
 * caller's perspective) — inventing a fake loading window would contradict
 * §34's "no fake states" principle. `DashboardRefreshControl` gives the
 * operator a toast confirmation instead of a spinner.
 */
export function useDashboardRefresh(): DashboardRefreshState {
  const queryClient = useQueryClient();
  const [generation, setGeneration] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY_NAMESPACE });
    setGeneration((g) => g + 1);
    setLastUpdatedAt(new Date());
  }, [queryClient]);

  return { generation, lastUpdatedAt, refresh };
}
