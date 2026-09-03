import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "./client";

/**
 * Realtime subscription foundation (Prompt 2 — ADR-009). ADR-009 accepts
 * Supabase Realtime (Postgres Changes for leave_requests/notifications,
 * Broadcast for transient alerts) as the architecture, but — verified
 * against the current backend — nothing implements it yet, on either side.
 * This file provides only the generic "create/remove a named channel"
 * capability; no leave_requests or notifications subscription is wired up
 * here, since defining exactly what to subscribe to and how to reconcile
 * it with TanStack Query's cache is feature-specific work for a later
 * prompt, not foundation.
 */
export function createChannel(channelName: string): RealtimeChannel {
  return getSupabaseClient().channel(channelName);
}

export function removeChannel(channel: RealtimeChannel) {
  return getSupabaseClient().removeChannel(channel);
}
