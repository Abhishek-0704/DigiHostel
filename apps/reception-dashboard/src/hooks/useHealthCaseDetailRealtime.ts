import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createChannel, removeChannel } from "../services/realtime/realtimeClient";

export type HealthCaseDetailRealtimeStatus =
  "connecting" | "connected" | "disconnected" | "unavailable";

/**
 * Combined `health_cases` + `health_case_events` realtime subscription for
 * a single case's detail view (Phase 4, Prompt 11) — mirrors
 * `useEmergencyDetailRealtime`'s filtered, single-record shape. Both tables
 * are filtered to exactly this one case (`id=eq.<id>` /
 * `case_id=eq.<id>`) and drive the SAME `onChange` callback: a status
 * transition (health_cases row change) and a new timeline event
 * (health_case_events insert) both mean the detail view's cached data is
 * stale, so both trigger the identical real refetch of the authoritative
 * `GET /health-cases/{caseId}` — never a client-side merge of the raw
 * realtime payload.
 */
export function useHealthCaseDetailRealtime(
  onChange: () => void,
  caseId: string,
): HealthCaseDetailRealtimeStatus {
  const [status, setStatus] = useState<HealthCaseDetailRealtimeStatus>("connecting");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const hasConnectedOnceRef = useRef(false);

  useEffect(() => {
    let channel: RealtimeChannel;
    try {
      channel = createChannel(`reception-dashboard:health-case-detail:${caseId}`);
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
          table: "health_cases",
          filter: `id=eq.${caseId}`,
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
          table: "health_case_events",
          filter: `case_id=eq.${caseId}`,
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
  }, [caseId]);

  return status;
}
