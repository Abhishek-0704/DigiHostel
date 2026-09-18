import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "../../lib/supabase/client";

/**
 * Realtime subscription foundation (Prompt 0.2 §19 — ADR-009). Mirrors
 * apps/parent-mobile/src/services/supabase/realtime.ts exactly: only the
 * generic "create/remove a named channel" capability. No business-table
 * subscription (leave_requests, journey_events, security_incidents, etc.)
 * is wired up here — see src/hooks/useRealtimeChannel.ts for the lifecycle
 * wrapper a future feature hook will build on, and
 * docs/reception-dashboard-architecture.md §15 for which tables are even
 * realtime-enabled yet (only leave_requests/notifications/leave_approval_events
 * today — journey_events/security_incidents need a migration first).
 */
export function createChannel(channelName: string): RealtimeChannel {
  return getSupabaseClient().channel(channelName);
}

export function removeChannel(channel: RealtimeChannel) {
  return getSupabaseClient().removeChannel(channel);
}
