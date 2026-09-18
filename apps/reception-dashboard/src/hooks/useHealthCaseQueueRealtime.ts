import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createChannel, removeChannel } from "../services/realtime/realtimeClient";

export type HealthCaseQueueRealtimeStatus =
  "connecting" | "connected" | "disconnected" | "unavailable";

/**
 * `health_cases` realtime subscription for the Health Operations Center
 * queue (Phase 4, Prompt 11) — ports `useEmergencyQueueRealtime`'s
 * already-proven, established pattern verbatim rather than inventing a
 * second realtime architecture. `health_cases` joins the
 * `supabase_realtime` publication directly (migration
 * `0018_health_operations_center.sql`), and this table's own hostel-scoped
 * RLS policies already scope exactly which rows a given staff subscriber's
 * channel receives — the identical hostel/role scoping the REST endpoint
 * enforces, applied by Supabase Realtime itself, not re-implemented here.
 *
 * No filter is passed, same reasoning as `useEmergencyQueueRealtime`: the
 * queue must learn about every case its own RLS-scoped subscription is
 * allowed to see.
 *
 * `onChange` always triggers a real TanStack Query invalidation/refetch —
 * never a client-side merge of the raw realtime payload.
 */
export function useHealthCaseQueueRealtime(onChange: () => void): HealthCaseQueueRealtimeStatus {
  const [status, setStatus] = useState<HealthCaseQueueRealtimeStatus>("connecting");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const hasConnectedOnceRef = useRef(false);

  useEffect(() => {
    let channel: RealtimeChannel;
    try {
      channel = createChannel("reception-dashboard:health-case-queue");
    } catch {
      setStatus("unavailable");
      return;
    }

    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "health_cases" }, () => {
        onChangeRef.current();
      })
      .subscribe((subscribeStatus) => {
        if (subscribeStatus === "SUBSCRIBED") {
          // Postgres Changes never replays events missed while disconnected
          // — a reconnect must trigger a real catch-up refetch.
          if (hasConnectedOnceRef.current) {
            onChangeRef.current();
          }
          hasConnectedOnceRef.current = true;
          setStatus("connected");
        } else if (subscribeStatus === "CHANNEL_ERROR" || subscribeStatus === "TIMED_OUT") {
          setStatus("unavailable");
        } else if (subscribeStatus === "CLOSED") {
          setStatus("disconnected");
        }
      });

    return () => {
      removeChannel(channel);
    };
  }, []);

  return status;
}
