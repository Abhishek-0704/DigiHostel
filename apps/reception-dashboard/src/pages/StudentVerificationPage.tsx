import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { ContentLayout } from "../layouts/ContentLayout";
import { getBreadcrumbTrail } from "../lib/navigation/navigationConfig";
import { useLeaveQueue, useLeaveApprovalEvents, useAuthorizeExit } from "../features/leave";
import { useLeaveQueueRealtime, useLeaveApprovalEventsRealtime } from "../hooks";
import { Button, Card, ConfirmationDialog, StatusBadge, EmptyState } from "../components/ui";
import type { StatusTone } from "../components/ui";
import { Can } from "../components/authorization";
import styles from "./StudentVerificationPage.module.css";

interface ChecklistItem {
  label: string;
  tone: StatusTone;
  statusLabel: string;
  detail: string;
}

/**
 * Student Verification & Exit Authorization workspace (Phase 3, Prompt 7C).
 * Replaces the placeholder reserved at this exact route since Prompt 0.2
 * ("Student check-in/check-out — blocked on the Digital Library Pass
 * backend"). That placeholder's own blocking dependency (the Digital
 * Library Pass module, `journey_events`/`qr_sessions`/`library_passes`) is
 * a DIFFERENT domain and remains genuinely unbuilt — this page does not
 * implement it, and never claims to. What this page implements is the
 * narrower, Leave-domain-scoped Exit Authorization checkpoint: the final
 * Reception-side gate before a student is permitted to leave the hostel for
 * an already-approved leave request, per the Parent Approval Session
 * Workspace's own "Ready for Student Verification" handoff
 * (`LeaveDetailPage.tsx`).
 *
 * Reached with `?leaveRequestId=<id>` (from that handoff link) — the route
 * itself is keyed by `:rollNumber` (Prompt 0.2's original scaffolding
 * decision, unchanged), but this feature needs a specific leave request,
 * not just a student, so the id travels as a query parameter rather than
 * requiring a route-shape change. Without it, this page has nothing to act
 * on and says so honestly rather than guessing which of a student's leave
 * requests (if any) is meant.
 *
 * Every prerequisite the checklist below displays is either read from
 * already-fetched, real server data (`useLeaveQueue`/`useLeaveApprovalEvents`
 * — the same two hooks `LeaveDetailPage` uses) or is explicitly marked as
 * something the SERVER verifies at submission time, never something this
 * page pre-confirms on the client's behalf (§10 of this feature's own
 * governing prompt: "UI readiness is not authorization"). Mentor/SAP
 * approval is shown as informational-only and permanently unavailable — no
 * SAP integration exists anywhere in this repository (re-confirmed by
 * direct search before this page was written; see
 * `apps/reception-dashboard/docs/exit-authorization.md`) — matching the
 * identical, already-established "Not available — no SAP integration"
 * treatment `ApprovalProgressIndicator` gives this same fact on the Parent
 * Approval Session Workspace. It is never treated as a gate on the actual
 * `POST /leave-requests/{id}/exit-authorization` call, which the backend
 * itself does not check either — see that endpoint's own doc comment.
 */
export default function StudentVerificationPage() {
  const { rollNumber } = useParams<{ rollNumber: string }>();
  const [searchParams] = useSearchParams();
  const leaveRequestId = searchParams.get("leaveRequestId");

  const { items, isLoading, error: queueError, refresh: refreshQueue } = useLeaveQueue();
  const {
    events,
    isLoading: eventsLoading,
    error: eventsError,
    refresh: refreshEvents,
  } = useLeaveApprovalEvents(leaveRequestId ?? undefined);

  useLeaveQueueRealtime(() => {
    void refreshQueue();
  });
  useLeaveApprovalEventsRealtime(
    () => {
      void refreshEvents();
    },
    `leave_request_id=eq.${leaveRequestId ?? ""}`,
  );

  const exitAuth = useAuthorizeExit();

  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  const item = useMemo(
    () =>
      leaveRequestId ? (items.find((candidate) => candidate.id === leaveRequestId) ?? null) : null,
    [items, leaveRequestId],
  );

  const breadcrumb = getBreadcrumbTrail(
    "students",
    rollNumber ? `Verify ${rollNumber}` : undefined,
  );

  if (!leaveRequestId) {
    return (
      <ContentLayout title={`Verify ${rollNumber ?? ""}`} breadcrumb={breadcrumb}>
        <EmptyState
          title="No leave request selected"
          description="Open this workspace from an approved leave request's Approval Session page (the 'Verify Student' link shown once a request is approved) — it needs to know which leave request to check, not just which student."
        />
      </ContentLayout>
    );
  }

  if (isLoading) {
    return (
      <ContentLayout title={`Verify ${rollNumber ?? ""}`} breadcrumb={breadcrumb} loading>
        {null}
      </ContentLayout>
    );
  }

  if (queueError) {
    return (
      <ContentLayout
        title={`Verify ${rollNumber ?? ""}`}
        breadcrumb={breadcrumb}
        error={{ message: queueError.userMessage, onRetry: refreshQueue }}
      >
        {null}
      </ContentLayout>
    );
  }

  if (!item) {
    return (
      <ContentLayout
        title={`Verify ${rollNumber ?? ""}`}
        breadcrumb={breadcrumb}
        error={{
          message: "This leave request could not be found, or you are not authorized to view it.",
          onRetry: refreshQueue,
        }}
      >
        {null}
      </ContentLayout>
    );
  }

  const isApproved = item.status === "approved";
  const parentApprovalEvent = events.find(
    (e) => e.eventType === "responded" && e.response === "approved",
  );
  const alreadyExited = exitAuth.data !== null;

  const checklist: ChecklistItem[] = [
    {
      label: "Leave request found and in scope",
      tone: "success",
      statusLabel: "Verified",
      detail: `${item.studentFullName} (${item.studentRollNumber}), ${item.studentHostelName ?? "hostel not available"}.`,
    },
    {
      label: "Mentor/SAP approval (eligibility context only)",
      tone: "info",
      statusLabel: "Not available",
      detail:
        "No SAP integration exists in this system — this is never checked as a precondition for exit authorization, and is shown for eligibility context only, never as parent approval.",
    },
    {
      label: "Parent approval",
      tone: isApproved ? "success" : "error",
      statusLabel: isApproved ? "Approved" : `Not complete (${item.status})`,
      detail: isApproved
        ? parentApprovalEvent
          ? `Approved ${new Date(parentApprovalEvent.occurredAt).toLocaleString()}.`
          : "Approved (approval event detail unavailable)."
        : "This leave request has not completed parent approval yet — exit authorization is not available until it does.",
    },
    {
      label: "No existing exit authorization for this leave request",
      tone: "neutral",
      statusLabel: "Verified by server",
      detail:
        "Not pre-checked here — the server enforces this as a database-level uniqueness constraint at the moment you confirm, so a stale view here can never allow a duplicate.",
    },
    {
      label: "Student identity manually confirmed",
      tone: identityConfirmed ? "success" : "warning",
      statusLabel: identityConfirmed ? "Confirmed" : "Not yet confirmed",
      detail:
        "A staff attestation only — the server cannot independently verify a physical identity match.",
    },
  ];

  const canSubmit = isApproved && identityConfirmed && !alreadyExited;

  return (
    <ContentLayout
      title={`Verify ${item.studentFullName}`}
      breadcrumb={breadcrumb}
      actions={
        <Button variant="secondary" onClick={() => void refreshQueue()}>
          Refresh
        </Button>
      }
    >
      <div className={styles.page}>
        {!isApproved && (
          <div role="alert" className={styles.blockedBanner}>
            This leave request is in status <strong>{item.status}</strong> — exit authorization is
            only available once parent approval is complete ("approved").
          </div>
        )}

        <Card className={styles.card}>
          <h2 className={styles.heading}>Student &amp; Leave</h2>
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
        </Card>

        <Card className={styles.card}>
          <h2 className={styles.heading}>Verification Checklist</h2>
          {eventsLoading && <p className={styles.note}>Loading approval timeline…</p>}
          {eventsError && (
            <div role="alert" className={styles.formError}>
              {eventsError.userMessage}
            </div>
          )}
          <ul className={styles.checklist}>
            {checklist.map((c) => (
              <li key={c.label} className={styles.checklistItem}>
                <div className={styles.checklistItemHeader}>
                  <span className={styles.checklistLabel}>{c.label}</span>
                  <StatusBadge label={c.statusLabel} tone={c.tone} />
                </div>
                <p className={styles.checklistDetail}>{c.detail}</p>
              </li>
            ))}
          </ul>
        </Card>

        {alreadyExited ? (
          <Card className={styles.card}>
            <div role="status" className={styles.successBanner}>
              <StatusBadge label="Exit authorized" tone="success" />
              <p>
                {item.studentFullName} was recorded as exited{" "}
                {exitAuth.data && new Date(exitAuth.data.authorizedAt).toLocaleString()}.
              </p>
            </div>
          </Card>
        ) : (
          <Can permission="movement:exit">
            <Card className={styles.card}>
              <h2 className={styles.heading}>Identity Confirmation &amp; Exit Authorization</h2>
              <label className={styles.confirmLabel}>
                <input
                  type="checkbox"
                  checked={identityConfirmed}
                  disabled={!isApproved}
                  onChange={(e) => setIdentityConfirmed(e.target.checked)}
                />
                I have visually confirmed the person at reception matches this student's identity.
              </label>

              <Button
                variant="primary"
                disabled={!canSubmit}
                loading={exitAuth.isPending}
                onClick={() => setConfirmDialogOpen(true)}
              >
                Authorize Exit
              </Button>

              {exitAuth.error && (
                <div role="alert" className={styles.formError}>
                  {exitAuth.error.userMessage}
                </div>
              )}
            </Card>
          </Can>
        )}

        <ConfirmationDialog
          open={confirmDialogOpen}
          title="Confirm Exit Authorization"
          description={`${item.studentFullName} (${item.studentRollNumber}) will be recorded as having exited ${item.studentHostelName ?? "the hostel"} now, for leave request "${item.reason}" (${item.startDate} – ${item.endDate}). This action is permanent and cannot be undone.`}
          confirmLabel="Confirm Authorization"
          onConfirm={() => {
            setConfirmDialogOpen(false);
            exitAuth.authorize(item.id);
          }}
          onCancel={() => setConfirmDialogOpen(false)}
        />
      </div>
    </ContentLayout>
  );
}
