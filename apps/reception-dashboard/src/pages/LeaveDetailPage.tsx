import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ContentLayout } from "../layouts/ContentLayout";
import { getBreadcrumbTrail } from "../lib/navigation/navigationConfig";
import { studentVerificationPath } from "../constants/routes";
import {
  useLeaveQueue,
  useLeaveApprovalEvents,
  buildSessionCompletionHandoff,
  useStartParentApproval,
} from "../features/leave";
import { useLeaveQueueRealtime, useLeaveApprovalEventsRealtime } from "../hooks";
import {
  ApprovalProgressIndicator,
  SessionTimer,
  SessionTimeline,
  SessionResultBanner,
} from "../components/leave";
import { Button } from "../components/ui";
import { Can } from "../components/authorization";
import styles from "./LeaveDetailPage.module.css";

const REALTIME_LABEL: Record<string, string> = {
  connecting: "Connecting…",
  connected: "Live",
  disconnected: "Disconnected",
  unavailable: "Reconnecting…",
};

/**
 * Parent Approval Session Workspace (Phase 3, Prompt 7B; corrected by the
 * Reception-Initiated Parent Approval correction). Replaces the placeholder
 * reserved for this exact purpose since Prompt 4 ("Approval session
 * monitoring — Phase 3, Prompt 7B").
 *
 * Architectural framing (see `docs/leave-queue.md`'s "Parent Approval
 * Session" section for the full account): there is no separate "session"
 * database entity — `leave_requests.status`/`leave_approval_events` model
 * the full lifecycle. What HAS changed since Prompt 7B: a freshly-created
 * leave request no longer enters the parent-approval/escalation lifecycle
 * automatically. It sits in `pending` — visible in Reception's queue, with
 * NO parent notification, NO escalation timer, and NO event of any kind —
 * until a Reception Warden/Hostel Admin/Super Admin explicitly clicks "Send
 * for Parent Approval" below, which calls the staff-only, AAL2-protected
 * `POST /leave-requests/{id}/send-for-parent-approval`
 * (`useStartParentApproval`). Only THAT call transitions the request into
 * `father_notified` and schedules the first escalation/notification job.
 * This page therefore has two distinct modes over the same one lifecycle:
 * for a `pending` request, it is the place Reception makes that explicit
 * decision; for anything past `pending`, it is a real-time MONITORING
 * workspace over the now-running (or already-completed) process, keyed by
 * the leave request's own id, which also doubles as the externally-exposed
 * "session reference" (see `sessionHandoff.ts`'s doc comment for why no
 * second identifier was minted). "One active parent-approval process per
 * leave request" is a structural property of the data model, not a
 * constraint this page enforces — a `leave_requests` row has exactly one
 * `status` at a time, and the same database-enforced conditional-UPDATE
 * pattern `decide()`/`markExpired()` already used makes "exactly one caller
 * can ever start it" a server invariant (`apps/api/src/domain/leave/repository.ts`'s
 * `startParentApproval()`), not merely a disabled button.
 *
 * Two realtime subscriptions, matching the established one-hook-per-page
 * convention: `useLeaveQueueRealtime` (the same one the queue page uses,
 * invalidating the same `["leave-queue"]` query this page also reads) keeps
 * the request's own status current; `useLeaveApprovalEventsRealtime`,
 * scoped to this one leave request, keeps the timeline current. The "Send
 * for Parent Approval" mutation below also invalidates both directly (see
 * `useStartParentApproval`'s own doc comment), so the UI updates
 * immediately rather than waiting on the next realtime tick.
 */
export default function LeaveDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { items, isLoading, error: queueError, refresh: refreshQueue } = useLeaveQueue();
  const {
    events,
    isLoading: eventsLoading,
    error: eventsError,
    refresh: refreshEvents,
  } = useLeaveApprovalEvents(id);

  const realtimeState = useLeaveQueueRealtime(() => {
    void refreshQueue();
  });
  useLeaveApprovalEventsRealtime(
    () => {
      void refreshEvents();
    },
    `leave_request_id=eq.${id ?? ""}`,
  );
  const startApproval = useStartParentApproval();

  const item = useMemo(() => items.find((candidate) => candidate.id === id) ?? null, [items, id]);
  const handoff = item ? buildSessionCompletionHandoff(item) : null;

  const breadcrumb = getBreadcrumbTrail("leave-queue", item?.studentFullName ?? id);

  if (isLoading) {
    return (
      <ContentLayout title="Approval Session" breadcrumb={breadcrumb} width="full" loading>
        {null}
      </ContentLayout>
    );
  }

  if (queueError) {
    return (
      <ContentLayout
        title="Approval Session"
        breadcrumb={breadcrumb}
        width="full"
        error={{ message: queueError.userMessage, onRetry: refreshQueue }}
      >
        {null}
      </ContentLayout>
    );
  }

  if (!item) {
    return (
      <ContentLayout
        title="Approval Session"
        breadcrumb={breadcrumb}
        width="full"
        error={{
          message: "This leave request could not be found, or you are not authorized to view it.",
          onRetry: refreshQueue,
        }}
      >
        {null}
      </ContentLayout>
    );
  }

  return (
    <ContentLayout
      title={`Approval Session — ${item.studentFullName}`}
      breadcrumb={breadcrumb}
      width="full"
      actions={
        <div className={styles.headerActions}>
          <span className={styles.realtimeStatus}>
            {REALTIME_LABEL[realtimeState] ?? "Unknown"}
          </span>
          <Button variant="secondary" onClick={() => void refreshQueue()}>
            Refresh
          </Button>
        </div>
      }
    >
      <div className={styles.page}>
        <SessionResultBanner status={item.status} />

        <ApprovalProgressIndicator status={item.status} />

        <SessionTimer updatedAt={item.updatedAt} status={item.status} />

        {item.status === "pending" && (
          <Can permission="leave:parent_approval:initiate">
            <div className={styles.startApprovalPanel}>
              <p className={styles.startApprovalNote}>
                This request has not been sent for parent approval yet. No parent has been notified
                and no escalation timer has started. Once you confirm this request is ready, send it
                for parent approval to begin the notification/escalation process.
              </p>
              <Button
                variant="primary"
                loading={startApproval.isPending}
                onClick={() => startApproval.start(item.id)}
              >
                Send for Parent Approval
              </Button>
              {startApproval.error && (
                <div role="alert" className={styles.formError}>
                  {startApproval.error.userMessage}
                </div>
              )}
            </div>
          </Can>
        )}

        {item.status === "manual_verification" && (
          <p className={styles.note}>
            Automated escalation is exhausted for this request — every configured contact has been
            notified. Manual verification is required next; no automatic action will occur.
          </p>
        )}

        {handoff && handoff.outcome === "approved" && (
          <div className={styles.handoffNote}>
            <p>
              Ready for Student Verification — approved{" "}
              {new Date(handoff.occurredAt).toLocaleString()}.
            </p>
            <Can permission="student:verify">
              <Button
                variant="secondary"
                onClick={() =>
                  navigate(
                    `${studentVerificationPath(handoff.studentRollNumber)}?leaveRequestId=${handoff.leaveRequestId}`,
                  )
                }
              >
                Verify Student
              </Button>
            </Can>
          </div>
        )}

        <div className={styles.columns}>
          <div className={styles.card}>
            <h2 className={styles.heading}>Student</h2>
            <dl className={styles.metaList}>
              <div className={styles.metaRow}>
                <dt>Name</dt>
                <dd>{item.studentFullName}</dd>
              </div>
              <div className={styles.metaRow}>
                <dt>Roll Number</dt>
                <dd>{item.studentRollNumber}</dd>
              </div>
              <div className={styles.metaRow}>
                <dt>Hostel</dt>
                <dd>{item.studentHostelName ?? "Not available"}</dd>
              </div>
              <div className={styles.metaRow}>
                <dt>Room</dt>
                <dd>{item.studentRoomNumber ?? "Not available"}</dd>
              </div>
              <div className={styles.metaRow}>
                <dt>Reason</dt>
                <dd>{item.reason}</dd>
              </div>
              <div className={styles.metaRow}>
                <dt>Leave Period</dt>
                <dd>
                  {item.startDate} – {item.endDate}
                </dd>
              </div>
            </dl>

            <h2 className={styles.heading}>Parent / Guardian</h2>
            <p className={styles.note}>
              Not shown here — parent/guardian identity and contact details are not exposed to
              reception staff through this workspace.
            </p>
          </div>

          <div className={styles.card}>
            <h2 className={styles.heading}>Approval Timeline</h2>
            <SessionTimeline
              events={events}
              loading={eventsLoading}
              error={
                eventsError
                  ? { message: eventsError.userMessage, onRetry: refreshEvents }
                  : undefined
              }
            />
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
