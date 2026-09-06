import { QueryClient, onlineManager, focusManager } from "@tanstack/react-query";
import NetInfo from "@react-native-community/netinfo";
import { AppState, type AppStateStatus } from "react-native";

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
 * F-08 remediation — binds TanStack Query's `focusManager` to RN's
 * `AppState`, the library's own documented React Native recipe. Without
 * this, `refetchOnWindowFocus` (below) is a pure no-op on this platform:
 * the web-only `visibilitychange` event it defaults to listening for never
 * fires in React Native, so nothing previously triggered a refetch when
 * the app returned to the foreground. The one existing `AppState` listener
 * in this app (`services/supabase/client.ts`) only starts/stops Supabase
 * Auth's token auto-refresh — it never touched query state, so backgrounding
 * the app long enough for the OS to suspend the websocket (without the
 * realtime channel itself completing a CLOSED->SUBSCRIBED cycle before the
 * user looks again) had no independent catch-up path beyond a manual
 * pull-to-refresh.
 */
let focusManagerBound = false;
function bindFocusManagerToAppState(): void {
  if (focusManagerBound) return;
  focusManagerBound = true;
  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener("change", (state: AppStateStatus) => {
      handleFocus(state === "active");
    });
    return () => subscription.remove();
  });
}

/**
 * TanStack Query client factory (Prompt 2 foundation). Conservative
 * defaults appropriate for a mobile client talking to a REST backend that
 * is itself the source of truth (ADR-014/ADR-016) — no feature-specific
 * query configuration lives here.
 */
export function createQueryClient(): QueryClient {
  bindOnlineManagerToNetInfo();
  bindFocusManagerToAppState();
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 2,
        staleTime: 30_000,
        // F-08: was `false`. Now that focusManager is actually wired to
        // AppState above, this setting has a real effect for the first
        // time — a foreground-catch-up refetch (still respecting
        // `staleTime`, so it never fires more often than every 30s) that
        // no longer depends solely on a realtime channel's own reconnect
        // timing or a manual pull-to-refresh.
        refetchOnWindowFocus: true,
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
