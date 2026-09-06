import type { LeaveRequestPresentation, LeaveTimelineEvent } from "./types";

/**
 * Leave Request Timeline derivation (Prompt 9A) — no React/RN import.
 *
 * Builds only from data this presentation model actually carries
 * (`status`, `createdAt`) — never a new fetch, never `Supabase queries`
 * (explicitly forbidden in this prompt). The richer event log this prompt's
 * own `<leave_information>`/timeline instructions describe — Academic
 * Approval, Reception Verification, Student Exit — has NO backend
 * representation anywhere (`leave_approval_events.event_type` is
 * `notified | responded | escalated | expired | manual_override` —
 * `packages/db/src/schema/enums.ts` — none of those map to "academic
 * approval" or "reception verification," and no `staffRole` enum value is
 * "academic" either): these are classified NOT APPLICABLE in
 * `docs/leave-approval.md`'s capability matrix, not silently invented here.
 *
 * The middle step deliberately says "Awaiting parent response" for every
 * pre-decision escalation stage — never which stage, which relationship was
 * contacted, or whether an in-app call/manual-verification step was
 * reached — same escalation-privacy principle already established for
 * notifications (`docs/notifications.md` §1).
 *
 * Returns `null` when there is no presentation to build from at all (the
 * request itself is unavailable) — `LeaveTimeline`'s own "unavailable"
 * rendering handles that case; this function is never called with `null`
 * input to fabricate a timeline for a request that doesn't exist.
 */
export function buildMinimalTimelineFromStatus(
  presentation: LeaveRequestPresentation,
): LeaveTimelineEvent[] {
  const requested: LeaveTimelineEvent = {
    id: "requested",
    label: "Leave requested",
    status: "completed",
    timestamp: presentation.createdAt,
  };

  switch (presentation.status) {
    case "awaiting_response":
      return [
        requested,
        {
          id: "awaiting-response",
          label: "Awaiting parent response",
          status: "current",
          timestamp: null,
        },
        { id: "decision", label: "Decision", status: "upcoming", timestamp: null },
      ];
    case "approved":
      return [
        requested,
        {
          id: "awaiting-response",
          label: "Awaiting parent response",
          status: "completed",
          timestamp: null,
        },
        { id: "decision", label: "Approved", status: "completed", timestamp: null },
      ];
    case "rejected":
      return [
        requested,
        {
          id: "awaiting-response",
          label: "Awaiting parent response",
          status: "completed",
          timestamp: null,
        },
        { id: "decision", label: "Rejected", status: "completed", timestamp: null },
      ];
    case "expired":
      return [
        requested,
        {
          id: "awaiting-response",
          label: "Awaiting parent response",
          status: "completed",
          timestamp: null,
        },
        { id: "decision", label: "Expired", status: "completed", timestamp: null },
      ];
    default:
      return [requested];
  }
}
