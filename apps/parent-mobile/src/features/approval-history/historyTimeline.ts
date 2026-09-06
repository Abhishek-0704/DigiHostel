import type { LeaveApprovalEvent } from "@digihostel/api-client-react";
import type { LeaveApprovalPresentationStatus, LeaveTimelineEvent } from "../leave-approval";

/**
 * Approval History timeline derivation (Phase 4 Prompt 10) — no React/RN
 * import. Builds ONLY from the authoritative `requestedAt` fact plus real
 * `leave_approval_events` rows returned by the new `GET
 * /leave-requests/{id}/events` endpoint — never a fabricated event. The
 * richer vocabulary this prompt's own instructions name (Academic Approval,
 * Reception Verification, Student Exit/Return) has no backend representation
 * (`ApprovalEventType` is exactly `notified | responded | escalated |
 * expired | manual_override` — `apps/api/src/domain/leave/types.ts`) and is
 * never invented here, matching the identical discipline already applied by
 * `leave-approval/leaveTimeline.ts`'s `buildMinimalTimelineFromStatus`.
 *
 * Every real event is rendered as "completed" — it is, definitionally, a
 * thing that already happened. A trailing "current" step is appended only
 * when the request's own presentation status is still `awaiting_response`
 * (no decision has occurred yet) — never a fabricated future step.
 *
 * Never surfaces which specific parent/guardian/staff member acted — the
 * event itself carries no such field (see the backend's own
 * LeaveApprovalEventView doc comment), so there is nothing to accidentally
 * leak here either.
 */
function labelForEvent(event: Pick<LeaveApprovalEvent, "eventType" | "response">): string {
  switch (event.eventType) {
    case "notified":
      return "Escalation notice sent";
    case "responded":
      if (event.response === "approved") return "Approved";
      if (event.response === "rejected") return "Rejected";
      return "Response recorded";
    case "escalated":
      return "Escalated to next contact";
    case "expired":
      return "Marked expired by hostel staff";
    case "manual_override":
      return "Resolved by hostel staff";
    default:
      return "Update recorded";
  }
}

export function buildTimelineFromEvents(
  events: Array<Pick<LeaveApprovalEvent, "id" | "eventType" | "response" | "occurredAt">>,
  requestedAt: string | null,
  status: LeaveApprovalPresentationStatus,
): LeaveTimelineEvent[] {
  const timeline: LeaveTimelineEvent[] = [
    { id: "requested", label: "Leave requested", status: "completed", timestamp: requestedAt },
  ];

  for (const event of events) {
    timeline.push({
      id: event.id,
      label: labelForEvent(event),
      status: "completed",
      timestamp: event.occurredAt,
    });
  }

  if (status === "awaiting_response") {
    timeline.push({
      id: "awaiting-response",
      label: "Awaiting your response",
      status: "current",
      timestamp: null,
    });
  }

  return timeline;
}
