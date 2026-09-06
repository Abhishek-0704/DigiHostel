import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createChannel, removeChannel } from "../services/supabase/realtime";

/**
 * Leave request realtime subscription (Prompt 9B) — mirrors
 * `useNotificationRealtime.ts`'s exact pattern (same generic
 * `createChannel`/`removeChannel` wrapper, same reasoning), extended to
 * `leave_requests`. ADR-009 accepts Postgres Changes for this table; the
 * `supabase_realtime` publication now includes it
 * (`supabase/migrations/0002_realtime_publication.sql`, Prompt 9B) — unlike
 * `useNotificationRealtime` when it was first built, this subscription
 * receives real change events, not just a connected-but-silent channel.
 *
 * RLS (`leave_requests_select_own_student`/`_select_linked_parent`) scopes
 * which rows a given client's subscription actually receives — never
 * treated as an authorization mechanism itself, only a live-update
 * accelerator; `onChange` always triggers a real refetch/invalidate of the
 * authoritative query, never a client-side merge of the raw payload.
 *
 * `filter` (optional): pass `id=eq.<leaveRequestId>` on the detail screen
 * to scope the subscription to one row; omit on the list screen, where
 * every one of this parent's visible requests must be covered and no cheap
 * client-side filter value (e.g. this parent's own `parents.id`) is
 * available — same reasoning `useNotificationRealtime` already established.
 */
export type LeaveRequestRealtimeStatus =
  "connecting" | "connected" | "disconnected" | "unavailable";

export function useLeaveRequestRealtime(
  onChange: () => void,
  filter?: string,
): LeaveRequestRealtimeStatus {
  const [status, setStatus] = useState<LeaveRequestRealtimeStatus>("connecting");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // Tracks whether this channel has already reached "connected" once, so a
  // later SUBSCRIBED transition (a reconnect after a drop) can be told apart
  // from the very first connect — see the reconnect handling below.
  const hasConnectedOnceRef = useRef(false);

  useEffect(() => {
    let channel: RealtimeChannel;
    try {
      channel = createChannel(
        filter ? `parent-mobile:leave-requests:${filter}` : "parent-mobile:leave-requests",
      );
    } catch {
      // Supabase not configured (e.g. missing env) — same fail-soft
      // condition useNotificationRealtime already handles.
      setStatus("unavailable");
      return;
    }

    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "leave_requests",
          ...(filter ? { filter } : {}),
        },
        () => {
          onChangeRef.current();
        },
      )
      .subscribe((subscribeStatus) => {
        if (subscribeStatus === "SUBSCRIBED") {
          // Postgres Changes never replays events missed while disconnected
          // — a reconnect (as opposed to the very first connect, whose data
          // the mount's own initial fetch already covers) must trigger a
          // real catch-up refetch, or a decision made elsewhere during the
          // drop would go unreflected until an unrelated remount/manual
          // refresh.
          if (hasConnectedOnceRef.current) {
            onChangeRef.current();
          }
          hasConnectedOnceRef.current = true;
          setStatus("connected");
        } else if (subscribeStatus === "CHANNEL_ERROR" || subscribeStatus === "TIMED_OUT") {
          setStatus("unavailable");
        } else if (subscribeStatus === "CLOSED") setStatus("disconnected");
      });

    return () => {
      removeChannel(channel);
    };
  }, [filter]);

  return status;
}
