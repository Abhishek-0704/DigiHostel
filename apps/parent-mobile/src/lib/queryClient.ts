import { QueryClient, onlineManager } from "@tanstack/react-query";
import NetInfo from "@react-native-community/netinfo";

/**
 * Binds TanStack Query's `onlineManager` to real device connectivity
 * (RC1 hardening — Phase 12). Without this, the library's default relies on
 * the browser's `navigator.onLine`, which does not exist in React Native, so
 * a query that fails while offline is never automatically resumed on
 * reconnect — only an unrelated remount or manual pull-to-refresh would
 * pick it back up. This is the standard TanStack Query React Native
 * integration (its own docs' recommended recipe), registered once, globally
 * — independent of `NetworkContext`'s own stricter, UI-facing
 * online/offline/unknown state (which additionally requires confirmed
 * internet reachability, not just a network interface, before gating the
 * leave-decision mutation — see `contexts/networkStatus.ts`). This
 * `onlineManager` binding governs only ordinary query retry/resume
 * behavior, never authorization or mutation-blocking decisions.
 */
let onlineManagerBound = false;
function bindOnlineManagerToNetInfo(): void {
  if (onlineManagerBound) return;
  onlineManagerBound = true;
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => setOnline(state.isConnected ?? false)),
  );
}

/**
 * TanStack Query client factory (Prompt 2 foundation). Conservative
 * defaults appropriate for a mobile client talking to a REST backend that
 * is itself the source of truth (ADR-014/ADR-016) — no feature-specific
 * query configuration lives here.
 */
export function createQueryClient(): QueryClient {
  bindOnlineManagerToNetInfo();
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 2,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
      mutations: {
        // Security-sensitive mutations (leave decisions) must never
        // auto-retry silently. No feature currently opts into retry for any
        // mutation; if one legitimately needs it, that decision belongs
        // explicitly at the call site, never as a change to this default.
        retry: false,
      },
    },
  });
}
