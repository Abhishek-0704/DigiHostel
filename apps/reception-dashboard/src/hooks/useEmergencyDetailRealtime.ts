import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createChannel, removeChannel } from "../services/realtime/realtimeClient";

export type EmergencyDetailRealtimeStatus =
  "connecting" | "connected" | "disconnected" | "unavailable";

/**
 * Combined `security_incidents` + `security_incident_events` realtime
 * subscription for a single incident's detail view (Phase 4, Prompt 10) —
 * mirrors `useLeaveApprovalEventsRealtime`'s filtered, single-record shape.
 * Both tables are filtered to exactly this one incident (`id=eq.<id>` /
 * `incident_id=eq.<id>`) and drive the SAME `onChange` callback: a status
 * transition (security_incidents row change) and a new timeline event
 * (security_incident_events insert) both mean the detail view's cached data
 * is stale, so both trigger the identical real refetch of the authoritative
 * `GET /emergencies/{incidentId}` — never a client-side merge of the raw
 * realtime payload.
 */
export function useEmergencyDetailRealtime(
  onChange: () => void,
  incidentId: string,
): EmergencyDetailRealtimeStatus {
  const [status, setStatus] = useState<EmergencyDetailRealtimeStatus>("connecting");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const hasConnectedOnceRef = useRef(false);

  useEffect(() => {
    let channel: RealtimeChannel;
    try {
      channel = createChannel(`reception-dashboard:emergency-detail:${incidentId}`);
    } catch {
      setStatus("unavailable");
      return;
    }

    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "security_incidents",
          filter: `id=eq.${incidentId}`,
        },
        () => {
          onChangeRef.current();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "security_incident_events",
          filter: `incident_id=eq.${incidentId}`,
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
        } else if (subscribeStatus === "CLOSED") {
          setStatus("disconnected");
        }
      });

    return () => {
      removeChannel(channel);
    };
  }, [incidentId]);

  return status;
}
