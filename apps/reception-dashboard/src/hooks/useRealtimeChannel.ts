import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createChannel, removeChannel } from "../services/realtime/realtimeClient";
import { logger } from "../lib/logging/logger";

export type RealtimeConnectionState = "idle" | "subscribing" | "subscribed" | "error" | "closed";

/**
 * Generic realtime subscription lifecycle (Prompt 0.2 §19). Handles
 * subscribe-on-mount / cleanup-on-unmount and exposes connection state for
 * an operator-visible indicator (SDD Ch.7 §7.4's "Sync status" panel,
 * docs/reception-dashboard-architecture.md §15 — "surface degraded/
 * disconnected realtime state to the operator rather than silently falling
 * back to polling").
 *
 * `configure` receives the raw channel so a future feature hook can attach
 * `.on('postgres_changes', ...)` listeners before this hook subscribes —
 * deliberately generic: this hook has no knowledge of any business table.
 * No feature calls this yet.
 *
 * Guards against the duplicate-subscription/leak class of bug by always
 * removing the previous channel before creating a new one and on unmount,
 * matching apps/parent-mobile's realtime hooks' established discipline
 * (docs/current-state.md's F-08 finding, "subscription cleanup is correct
 * everywhere").
 */
export function useRealtimeChannel(
  channelName: string,
  configure: (channel: RealtimeChannel) => void,
): RealtimeConnectionState {
  const [state, setState] = useState<RealtimeConnectionState>("idle");
  const configureRef = useRef(configure);
  configureRef.current = configure;

  useEffect(() => {
    setState("subscribing");
    const channel = createChannel(channelName);
    configureRef.current(channel);

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setState("subscribed");
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setState("error");
        logger.warn("realtime: subscription error", { channelName, status });
      } else if (status === "CLOSED") {
        setState("closed");
      }
    });

    return () => {
      removeChannel(channel);
    };
  }, [channelName]);

  return state;
}
