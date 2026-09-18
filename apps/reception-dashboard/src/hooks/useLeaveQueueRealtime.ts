import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createChannel, removeChannel } from "../services/realtime/realtimeClient";

export type LeaveQueueRealtimeStatus = "connecting" | "connected" | "disconnected" | "unavailable";

/**
 * Real business-table realtime subscription for the Reception Leave Request
 * Queue (Prompt 7A §20) — unlike Dashboard Home's and the Notification
 * Center's `useRealtimeConnectionProbe` (a deliberately empty-configure
 * probe, since neither page has a real business event source to attach),
 * this hook attaches a genuine `postgres_changes` listener to
 * `leave_requests`. That table has been in the `supabase_realtime`
 * publication since Prompt 9B
 * (`supabase/migrations/0002_realtime_publication.sql` —
 * apps/parent-mobile/src/hooks/useLeaveRequestRealtime.ts already proves
 * this works end-to-end for the parent side), and this app's own RLS
 * policies (`leave_requests_all_reception`/`_all_hostel_admin`/
 * `_all_super_admin`, packages/db/src/schema/leave.ts) already scope
 * exactly which rows a given staff member's subscription receives — the
 * identical hostel/role scoping the REST endpoint enforces, applied by
 * Supabase Realtime itself, not re-implemented here.
 *
 * No filter is passed (unlike the parent-mobile detail-screen variant): the
 * queue must learn about every request its own RLS-scoped subscription is
 * allowed to see, and there is no cheap client-side filter value (the
 * caller's own hostel id) safe to embed in a Realtime filter expression
 * without duplicating authorization logic client-side.
 *
 * `onChange` always triggers a real TanStack Query invalidation/refetch of
 * `LEAVE_QUEUE_QUERY_KEY` (see `LeaveQueuePage.tsx`) — never a client-side
 * merge of the raw realtime payload, matching this app's and
 * `apps/parent-mobile`'s established pattern (`docs/current-state.md`'s F-08
 * finding: "realtime is used only as an invalidate/refetch trigger
 * everywhere in the app").
 */
export function useLeaveQueueRealtime(onChange: () => void): LeaveQueueRealtimeStatus {
  const [status, setStatus] = useState<LeaveQueueRealtimeStatus>("connecting");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const hasConnectedOnceRef = useRef(false);

  useEffect(() => {
    let channel: RealtimeChannel;
    try {
      channel = createChannel("reception-dashboard:leave-queue");
    } catch {
      setStatus("unavailable");
      return;
    }

    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_requests" }, () => {
        onChangeRef.current();
      })
      .subscribe((subscribeStatus) => {
        if (subscribeStatus === "SUBSCRIBED") {
          // Postgres Changes never replays events missed while disconnected
          // — a reconnect (as opposed to the very first connect, whose data
          // the page's own initial fetch already covers) must trigger a real
          // catch-up refetch, matching useLeaveRequestRealtime's identical
          // reasoning.
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
