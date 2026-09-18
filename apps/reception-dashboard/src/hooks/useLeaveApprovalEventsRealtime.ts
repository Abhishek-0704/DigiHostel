import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createChannel, removeChannel } from "../services/realtime/realtimeClient";

export type LeaveApprovalEventsRealtimeStatus =
  "connecting" | "connected" | "disconnected" | "unavailable";

/**
 * `leave_approval_events` realtime subscription for the Parent Approval
 * Session Workspace (Phase 3, Prompt 7B) — ports
 * `apps/parent-mobile/src/hooks/useLeaveApprovalEventsRealtime.ts`'s
 * already-proven pattern verbatim rather than inventing a second realtime
 * architecture (§17/§18's explicit instruction). `leave_approval_events` has
 * been in the `supabase_realtime` publication since Prompt 9B/F-08
 * (`supabase/migrations/0007_f08_leave_approval_events_realtime.sql`), and
 * the corrected, hostel-scoped staff RLS policies
 * (`lae_select_reception`/`lae_select_hostel_admin`/`lae_select_super_admin`
 * — migration 0010, independently re-verified: QG-01 PASSED) now scope
 * exactly which rows a given staff subscriber's channel actually receives —
 * `onChange` always triggers a real refetch of the authoritative
 * `useLeaveApprovalEvents` query, never a client-side merge of the raw
 * realtime payload.
 *
 * `filter` is always `leave_request_id=eq.<leaveRequestId>` — this hook is
 * only ever used by the Session Workspace, which already knows exactly
 * which leave request's timeline it is displaying.
 */
export function useLeaveApprovalEventsRealtime(
  onChange: () => void,
  filter: string,
): LeaveApprovalEventsRealtimeStatus {
  const [status, setStatus] = useState<LeaveApprovalEventsRealtimeStatus>("connecting");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const hasConnectedOnceRef = useRef(false);

  useEffect(() => {
    let channel: RealtimeChannel;
    try {
      channel = createChannel(`reception-dashboard:leave-approval-events:${filter}`);
    } catch {
      setStatus("unavailable");
      return;
    }

    channel
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leave_approval_events", filter },
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
        } else if (subscribeStatus === "CLOSED") {
          setStatus("disconnected");
        }
      });

    return () => {
      removeChannel(channel);
    };
  }, [filter]);

  return status;
}
