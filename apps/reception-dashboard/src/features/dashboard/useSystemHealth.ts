import { useMemo } from "react";
import { useAuthContext } from "../../contexts/AuthContext";
import type { RealtimeConnectionState } from "../../hooks/useRealtimeChannel";
import type { SystemHealthRow, SystemHealthStatus } from "./types";

function realtimeRow(state: RealtimeConnectionState): SystemHealthRow {
  const byState: Record<RealtimeConnectionState, { status: SystemHealthStatus; detail: string }> = {
    idle: { status: "unknown", detail: "Connecting…" },
    subscribing: { status: "unknown", detail: "Connecting…" },
    subscribed: { status: "operational", detail: "Connected" },
    error: { status: "degraded", detail: "Connection error — retrying" },
    closed: { status: "unavailable", detail: "Disconnected" },
  };
  return {
    id: "realtime",
    label: "Realtime",
    availability: "real",
    ...byState[state],
  };
}

function authenticationRow(status: string): SystemHealthRow {
  const operational = status === "authenticated";
  return {
    id: "authentication",
    label: "Authentication",
    status: operational ? "operational" : "unavailable",
    detail: operational ? "Session active" : "Session not authenticated",
    availability: "real",
  };
}

/**
 * System Health panel data (Prompt 5 §13). Every row below is derived from
 * a signal this app can genuinely observe — never a fabricated "all green"
 * (§13's explicit "Never represent an unverified service as 'healthy'").
 *
 * - Authentication: `AuthContext`'s own already-resolved status (real —
 *   this page cannot even render unless it reached `"authenticated"`, but
 *   the check is honest rather than assumed).
 * - Realtime: the caller's own `useRealtimeConnectionProbe` reading (Prompt
 *   5 §14/§15/§30) — passed in rather than probed a second time here, so
 *   this panel and `LiveStatusBar` share ONE realtime channel subscription
 *   instead of each independently opening its own (§30 — "avoid duplicate
 *   queries").
 * - Notification Service: `NotificationService.ts`'s own doc comment
 *   confirms the `notifications` table grants staff zero RLS access —
 *   honestly "not configured", never invented as reachable.
 * - SAP Integration: confirmed by repository-wide inspection (Prompt 0.1/0.2,
 *   restated in `docs/current-state.md`) that no scraping mechanism exists
 *   anywhere in this codebase — "not configured".
 * - Background Jobs: `apps/api`'s pg-boss workers are real (Prompt 0.7+) but
 *   expose no status endpoint this browser app can read — honestly
 *   "unknown", not fabricated as either healthy or down.
 */
export function useSystemHealth(realtimeState: RealtimeConnectionState): {
  rows: SystemHealthRow[];
} {
  const { status } = useAuthContext();

  const rows = useMemo<SystemHealthRow[]>(
    () => [
      authenticationRow(status),
      realtimeRow(realtimeState),
      {
        id: "notification-service",
        label: "Notification Service",
        status: "not_configured",
        detail: "Not configured for staff access",
        availability: "future",
      },
      {
        id: "sap-integration",
        label: "SAP Integration",
        status: "not_configured",
        detail: "No scraping mechanism found in this repository",
        availability: "future",
      },
      {
        id: "background-jobs",
        label: "Background Jobs",
        status: "unknown",
        detail: "Not exposed to this dashboard",
        availability: "future",
      },
    ],
    [status, realtimeState],
  );

  return { rows };
}
