import { EmptyState, ErrorState, Skeleton } from "../ui";
import type { LeaveApprovalEvent } from "@digihostel/api-client-react";
import styles from "./SessionTimeline.module.css";

export interface SessionTimelineProps {
  events: LeaveApprovalEvent[];
  loading?: boolean;
  error?: { message: string; onRetry?: () => void };
}

/** `leave_approval_events.event_type` labels (Prompt 7B). Every real value
 * this enum can hold, per `packages/db/src/schema/enums.ts` — `notified` is
 * included because it is part of the schema's own real vocabulary, not
 * because any current worker inserts it (`escalated`/`responded`/`expired`/
 * `manual_override` are the ones real code paths actually produce today —
 * see `docs/leave-queue.md` §13 for the full, evidence-checked account). */
const EVENT_LABEL: Record<LeaveApprovalEvent["eventType"], string> = {
  notified: "Parent notified",
  escalated: "Escalated to next contact",
  responded: "Parent responded",
  expired: "Marked expired by staff",
  manual_override: "Manual override recorded",
};

const RESPONSE_LABEL: Record<string, string> = {
  approved: "Approved",
  rejected: "Rejected",
  no_response: "No response recorded",
};

/**
 * Real Approval-Event Timeline (Prompt 7B §21 "Audit Timeline" — a real
 * rendering of `leave_approval_events`, not a placeholder, now that the
 * underlying `lae_select_staff` RLS gap is remediated and this dashboard has
 * a real, hostel-scoped Fastify read path to it — see
 * `apps/api/src/routes/leave.ts`'s extended events route). This is NOT the
 * Audit Viewer module (a separate, later, unimplemented prompt) — it is
 * scoped entirely to one leave request's own immutable event log, the same
 * data the Parent App's own Approval History screen already renders.
 *
 * Never shows actor identity — `LeaveApprovalEvent` has no such field
 * (backend-enforced, `LeaveApprovalEventView`'s own doc comment), so there
 * is nothing to accidentally leak here.
 */
export function SessionTimeline({ events, loading, error }: SessionTimelineProps) {
  if (loading) {
    return (
      <div className={styles.skeletons} aria-busy="true" aria-label="Loading approval timeline">
        {[0, 1].map((i) => (
          <Skeleton key={i} height={14} width="70%" />
        ))}
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error.message} onRetry={error.onRetry} />;
  }

  if (events.length === 0) {
    return (
      <EmptyState
        title="No timeline events yet"
        description="Events appear here as the automated escalation and parent response process progresses."
      />
    );
  }

  return (
    <ul className={styles.list}>
      {events.map((event) => (
        <li key={event.id} className={styles.item}>
          <div className={styles.itemRow}>
            <span className={styles.label}>{EVENT_LABEL[event.eventType]}</span>
            <time className={styles.timestamp} dateTime={event.occurredAt}>
              {new Date(event.occurredAt).toLocaleString()}
            </time>
          </div>
          {event.response && (
            <span className={styles.detail}>
              {RESPONSE_LABEL[event.response] ?? event.response}
            </span>
          )}
          {event.eventType === "responded" && (
            <span className={styles.detail}>
              {event.biometricConfirmed
                ? "Biometric confirmation recorded"
                : "No biometric confirmation recorded"}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
