import { useRealtimeChannel, type RealtimeConnectionState } from "./useRealtimeChannel";

const PROBE_CHANNEL_NAME = "dashboard-status-probe";

/**
 * Realtime-readiness signal for Dashboard Home's System Health / Live Status
 * widgets (Prompt 5 §13/§14/§15). Deliberately built on the EXISTING generic
 * `useRealtimeChannel` lifecycle hook (Prompt 0.2 §19) with an empty
 * `configure` callback — no `.on("postgres_changes", ...)` listener is ever
 * attached, so this never becomes, and must never be mistaken for, a
 * business-table subscription. It only observes whether this browser's
 * Supabase Realtime socket can actually establish and hold a channel
 * subscription — the same "Sync status" fact
 * `docs/reception-dashboard-architecture.md` §7.4/§15 names as something the
 * operator should see, surfaced honestly rather than invented.
 *
 * `generation` lets a caller (the dashboard refresh control) force a fresh
 * probe by remounting the underlying channel — bumping it removes the old
 * channel and subscribes a new one, exactly like any other
 * `useRealtimeChannel` consumer changing its channel name.
 */
export function useRealtimeConnectionProbe(generation = 0): RealtimeConnectionState {
  return useRealtimeChannel(`${PROBE_CHANNEL_NAME}-${generation}`, () => {
    // Deliberately empty: no postgres_changes listener, no business table.
    // See doc comment above — this hook proves the socket connects, nothing more.
  });
}
