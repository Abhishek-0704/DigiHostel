import { QueryClient } from "@tanstack/react-query";

/**
 * Server-state foundation (Prompt 0.2). One shared TanStack Query client for
 * the whole app, consumed by @digihostel/api-client-react's generated hooks
 * — the same server-state library apps/parent-mobile already uses (no new
 * server-state approach introduced).
 *
 * Realtime updates are expected to trigger `queryClient.invalidateQueries`
 * (or a narrower `refetchQueries`), never a direct cache merge of a realtime
 * payload — matching the pattern apps/parent-mobile validated and reused
 * across every realtime hook it built (docs/current-state.md's F-08 entry).
 * No such invalidation is wired up yet, since no feature subscribes to a
 * business table yet (src/hooks/useRealtimeChannel.ts is generic lifecycle
 * only).
 *
 * Defaults are deliberately conservative rather than tuned — no feature
 * exists yet to tune them against.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});
