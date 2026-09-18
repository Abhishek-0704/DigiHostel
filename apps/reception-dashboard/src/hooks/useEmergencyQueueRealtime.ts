import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createChannel, removeChannel } from "../services/realtime/realtimeClient";

export type EmergencyQueueRealtimeStatus =
  "connecting" | "connected" | "disconnected" | "unavailable";

/**
 * `security_incidents` realtime subscription for the Emergency Operations
 * Center queue (Phase 4, Prompt 10) — ports `useLeaveQueueRealtime`'s
 * already-proven, established pattern verbatim rather than inventing a
 * second realtime architecture. `security_incidents` joins the
 * `supabase_realtime` publication directly (migration
 * `0017_emergency_operations_center.sql`), and this table's own
 * hostel-scoped RLS policies (`security_incidents_all_reception`/
 * `_all_hostel_admin`/`_all_super_admin`, unchanged by this prompt beyond
 * the new assigned_staff_id/category-narrowing invariants) already scope
 * exactly which rows a given staff subscriber's channel receives — the
 * identical hostel/role scoping the REST endpoint enforces, applied by
 * Supabase Realtime itself, not re-implemented here.
 *
 * No filter is passed, same reasoning as `useLeaveQueueRealtime`: the queue
 * must learn about every incident its own RLS-scoped subscription is
 * allowed to see, and there is no cheap client-side filter value safe to
 * embed without duplicating authorization logic client-side.
 *
 * `onChange` always triggers a real TanStack Query invalidation/refetch —
 * never a client-side merge of the raw realtime payload, matching this
 * app's established "invalidate-and-refetch" discipline.
 */
export function useEmergencyQueueRealtime(onChange: () => void): EmergencyQueueRealtimeStatus {
  const [status, setStatus] = useState<EmergencyQueueRealtimeStatus>("connecting");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const hasConnectedOnceRef = useRef(false);

  useEffect(() => {
    let channel: RealtimeChannel;
    try {
      channel = createChannel("reception-dashboard:emergency-queue");
    } catch {
      setStatus("unavailable");
      return;
    }

    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "security_incidents" }, () => {
        onChangeRef.current();
      })
      .subscribe((subscribeStatus) => {
        if (subscribeStatus === "SUBSCRIBED") {
          // Postgres Changes never replays events missed while disconnected
          // — a reconnect must trigger a real catch-up refetch, matching
          // useLeaveQueueRealtime's identical reasoning.
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
