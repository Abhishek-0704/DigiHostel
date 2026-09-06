import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createChannel, removeChannel } from "../services/supabase/realtime";

/**
 * `leave_approval_events` realtime subscription (F-08 remediation) —
 * mirrors `useLeaveRequestRealtime.ts`'s exact pattern, extended to the
 * actual immutable history table. Before this hook existed, the Approval
 * History Detail screen learned about new events only as an INCIDENTAL
 * side effect of `leave_requests` changing in the same transaction — every
 * event insert this codebase's backend makes today (`responded`,
 * `escalated`, `expired`) happens to ride along with a status update, but
 * two enum event types already exist (`notified`, `manual_override`,
 * packages/db/src/schema/enums.ts) that are not currently inserted by any
 * code path; if either is ever inserted without an accompanying
 * `leave_requests` status change, this table's own direct subscription is
 * what would still catch it — the coupling this hook removes as a
 * dependency, not a redesign of how events are delivered.
 *
 * `supabase_realtime` now includes this table
 * (`supabase/migrations/0007_f08_leave_approval_events_realtime.sql`). RLS
 * (`lae_select_own_student`/`lae_select_linked_parent`,
 * `packages/db/src/schema/leave.ts`) scopes which rows a given client's
 * subscription actually receives — never treated as an authorization
 * mechanism itself, only a live-update accelerator; `onChange` always
 * triggers a real refetch of the authoritative `GET
 * /leave-requests/{id}/events` query, never a client-side merge of the raw
 * payload.
 *
 * `filter`: always `leave_request_id=eq.<leaveRequestId>` — this table has
 * no scenario analogous to `useLeaveRequestRealtime`'s unfiltered list-view
 * case, since every consumer of this hook already knows which leave
 * request's timeline it's displaying.
 */
export type LeaveApprovalEventsRealtimeStatus =
  "connecting" | "connected" | "disconnected" | "unavailable";

export function useLeaveApprovalEventsRealtime(
  onChange: () => void,
  filter: string,
): LeaveApprovalEventsRealtimeStatus {
  const [status, setStatus] = useState<LeaveApprovalEventsRealtimeStatus>("connecting");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // See useLeaveRequestRealtime.ts for why this distinction matters — a
  // reconnect (as opposed to the very first connect) must force a catch-up
  // refetch, since Postgres Changes never replays missed events.
  const hasConnectedOnceRef = useRef(false);

  useEffect(() => {
    let channel: RealtimeChannel;
    try {
      channel = createChannel(`parent-mobile:leave-approval-events:${filter}`);
    } catch {
      // Supabase not configured (e.g. missing env) — same fail-soft
      // condition the other realtime hooks already handle.
      setStatus("unavailable");
      return;
    }

    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "leave_approval_events",
          filter,
        },
        () => {
          onChangeRef.current();
        },
      )
      .subscribe((subscribeStatus) => {
        if (subscribeStatus === "SUBSCRIBED") {
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
