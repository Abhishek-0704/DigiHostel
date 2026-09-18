import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { ContentLayout } from "../layouts/ContentLayout";
import { getBreadcrumbTrail } from "../lib/navigation/navigationConfig";
import { useStudentProfile } from "../features/students";
import { useRecordHostelReturn } from "../features/movement";
import { useLeaveApprovalEventsRealtime } from "../hooks";
import { Button, Card, ConfirmationDialog, StatusBadge, EmptyState } from "../components/ui";
import type { StatusTone } from "../components/ui";
import { Can } from "../components/authorization";
import styles from "./StudentReturnPage.module.css";

interface ChecklistItem {
  label: string;
  tone: StatusTone;
  statusLabel: string;
  detail: string;
}

/**
 * Student Movement Management System — Hostel Return workspace (Phase 4,
 * Prompt 9). Replaces the "Register Return" placeholder button
 * (`StudentProfilePage.tsx`, Prompt 8, "Coming soon — future module") with
 * a real, dedicated workspace — the first implemented Movement Engine
 * type. Structurally mirrors `StudentVerificationPage.tsx`'s exact
 * checklist/confirmation-dialog/success-banner shape (Prompt 7C), the
 * established pattern for every "explicit staff attestation before an
 * atomic, server-authoritative state change" action in this codebase.
 *
 * Reached with `?leaveRequestId=<id>` from `StudentProfilePage`'s own
 * "Register Return" quick action — the route itself stays keyed by
 * `:rollNumber` (matching `/verification`'s identical, established
 * decision), the leave request id travels as a query parameter.
 *
 * Reuses `useStudentProfile` (Prompt 8's Student Operations Center) for
 * ALL eligibility data — never a second student-search/fetch path. Every
 * checklist row is backed by a real, already-fetched field
 * (`currentLeave.status`/`exitAuthorized`/`returnRecorded`); nothing here
 * is fabricated or independently re-derived client-side. "Conflicting
 * Movement" is shown as informational-only ("not applicable — no other
 * movement type exists yet"), never a fabricated real conflict, since
 * Hostel Return is the only implemented Movement Engine type (a future
 * type would introduce a genuine cross-type conflict check here without
 * requiring this page's own structure to change).
 */
export default function StudentReturnPage() {
  const { rollNumber } = useParams<{ rollNumber: string }>();
  const [searchParams] = useSearchParams();
  const leaveRequestId = searchParams.get("leaveRequestId");

  const { profile, isLoading, error, refresh } = useStudentProfile(rollNumber);

  useLeaveApprovalEventsRealtime(
    () => {
      void refresh();
    },
    `leave_request_id=eq.${leaveRequestId ?? ""}`,
  );

  const hostelReturn = useRecordHostelReturn();
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  const breadcrumb = getBreadcrumbTrail(
    "students",
    rollNumber ? `Return ${rollNumber}` : undefined,
  );

  if (!leaveRequestId) {
    return (
      <ContentLayout title={`Return ${rollNumber ?? ""}`} breadcrumb={breadcrumb}>
        <EmptyState
          title="No leave request selected"
          description="Open this workspace from the student's profile (the 'Register Return' action) — it needs to know which leave request this return completes."
        />
      </ContentLayout>
    );
  }

  if (isLoading) {
    return (
      <ContentLayout title={`Return ${rollNumber ?? ""}`} breadcrumb={breadcrumb} loading>
        {null}
      </ContentLayout>
    );
  }

  if (error || !profile) {
    return (
      <ContentLayout
        title={`Return ${rollNumber ?? ""}`}
        breadcrumb={breadcrumb}
        error={{
          message: error?.userMessage ?? "This student could not be found.",
          onRetry: refresh,
        }}
      >
        {null}
      </ContentLayout>
    );
  }

  const { currentLeave } = profile;
  const matchesRequestedLeave = currentLeave?.id === leaveRequestId;
  const isApproved = matchesRequestedLeave && currentLeave?.status === "approved";
  const isExitAuthorized = matchesRequestedLeave && currentLeave?.exitAuthorized === true;
  const alreadyReturned =
    (matchesRequestedLeave && currentLeave?.returnRecorded === true) || hostelReturn.data !== null;
  const canSubmit = isApproved && isExitAuthorized && !alreadyReturned;

  const checklist: ChecklistItem[] = [
    {
      label: "Leave request found and in scope",
      tone: matchesRequestedLeave ? "success" : "error",
      statusLabel: matchesRequestedLeave ? "Verified" : "Not found",
      detail: matchesRequestedLeave
        ? `${profile.fullName} (${profile.rollNumber}), ${profile.hostelName ?? "hostel not available"}.`
        : "This leave request does not match the student's current leave on record.",
    },
    {
      label: "Active leave (approved)",
      tone: isApproved ? "success" : "error",
      statusLabel: isApproved ? "Approved" : `Not complete (${currentLeave?.status ?? "unknown"})`,
      detail: isApproved
        ? "Parent approval is complete for this leave request."
        : "Return is not available until parent approval is complete.",
    },
    {
      label: "Exit authorization",
      tone: isExitAuthorized ? "success" : "error",
      statusLabel: isExitAuthorized ? "Authorized" : "Not recorded",
      detail: isExitAuthorized
        ? `Exit authorized ${currentLeave?.exitAuthorizedAt ? new Date(currentLeave.exitAuthorizedAt).toLocaleString() : ""}.`
        : "This student has not been exit-authorized for this leave request yet — return is not available.",
    },
    {
      label: "Already returned",
      tone: alreadyReturned ? "warning" : "neutral",
      statusLabel: alreadyReturned ? "Yes" : "Not yet",
      detail: alreadyReturned
        ? `A return was already recorded${currentLeave?.returnedAt ? ` ${new Date(currentLeave.returnedAt).toLocaleString()}` : ""}.`
        : "No return has been recorded for this leave request yet.",
    },
    {
      label: "Conflicting movement",
      tone: "info",
      statusLabel: "Not applicable",
      detail: "No other movement type is implemented yet — future extensibility point.",
    },
    {
      label: "Return eligible",
      tone: canSubmit ? "success" : "error",
      statusLabel: canSubmit ? "Eligible" : "Not eligible",
      detail: canSubmit
        ? "All preconditions are met — server enforces this independently at submission time."
        : "Not all preconditions are met yet.",
    },
  ];

  return (
    <ContentLayout
      title={`Register Return — ${profile.fullName}`}
      breadcrumb={breadcrumb}
      actions={
        <Button variant="secondary" onClick={() => void refresh()}>
          Refresh
        </Button>
      }
    >
      <div className={styles.page}>
        <Card className={styles.card}>
          <h2 className={styles.heading}>Student</h2>
          <dl className={styles.metaList}>
            <div className={styles.metaRow}>
              <dt>Name</dt>
              <dd>{profile.fullName}</dd>
            </div>
            <div className={styles.metaRow}>
              <dt>Roll Number</dt>
              <dd>{profile.rollNumber}</dd>
            </div>
            <div className={styles.metaRow}>
              <dt>Hostel</dt>
              <dd>{profile.hostelName ?? "Not assigned"}</dd>
            </div>
            <div className={styles.metaRow}>
              <dt>Room</dt>
              <dd>{profile.roomNumber ?? "Not assigned"}</dd>
            </div>
            <div className={styles.metaRow}>
              <dt>Hostel Presence</dt>
              <dd>
                <StatusBadge
                  label={
                    profile.hostelPresence === "outside_hostel" ? "Outside Hostel" : "Inside Hostel"
                  }
                  tone={profile.hostelPresence === "outside_hostel" ? "warning" : "success"}
                />
              </dd>
            </div>
          </dl>
          <p className={styles.unavailableNote}>
            Photograph is not available — this system's authoritative student record does not
            currently include one.
          </p>
        </Card>

        <Card className={styles.card}>
          <h2 className={styles.heading}>Movement</h2>
          <dl className={styles.metaList}>
            <div className={styles.metaRow}>
              <dt>Movement type</dt>
              <dd>Hostel Return</dd>
            </div>
            <div className={styles.metaRow}>
              <dt>Exit recorded</dt>
              <dd>
                {isExitAuthorized && currentLeave?.exitAuthorizedAt
                  ? new Date(currentLeave.exitAuthorizedAt).toLocaleString()
                  : "Not available"}
              </dd>
            </div>
            <div className={styles.metaRow}>
              <dt>Return recorded</dt>
              <dd>
                {alreadyReturned && currentLeave?.returnedAt
                  ? new Date(currentLeave.returnedAt).toLocaleString()
                  : hostelReturn.data
                    ? new Date(hostelReturn.data.occurredAt).toLocaleString()
                    : "Not yet"}
              </dd>
            </div>
            <div className={styles.metaRow}>
              <dt>Duration outside</dt>
              <dd>
                {isExitAuthorized && currentLeave?.exitAuthorizedAt && currentLeave?.returnedAt
                  ? formatDuration(
                      new Date(currentLeave.returnedAt).getTime() -
                        new Date(currentLeave.exitAuthorizedAt).getTime(),
                    )
                  : "Not computable until returned"}
              </dd>
            </div>
          </dl>
        </Card>

        <Card className={styles.card}>
          <h2 className={styles.heading}>Return Verification</h2>
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

        {alreadyReturned ? (
          <Card className={styles.card}>
            <div role="status" className={styles.successBanner}>
              <StatusBadge label="Return recorded" tone="success" />
              <p>{profile.fullName}'s return to the hostel has been recorded.</p>
            </div>
          </Card>
        ) : (
          <Can permission="movement:return">
            <Card className={styles.card}>
              <h2 className={styles.heading}>Register Return</h2>
              <Button
                variant="primary"
                disabled={!canSubmit}
                loading={hostelReturn.isPending}
                onClick={() => setConfirmDialogOpen(true)}
              >
                Register Return
              </Button>

              {hostelReturn.error && (
                <div role="alert" className={styles.formError}>
                  {hostelReturn.error.userMessage}
                </div>
              )}
            </Card>
          </Can>
        )}

        <ConfirmationDialog
          open={confirmDialogOpen}
          title="Confirm Register Return"
          description={`${profile.fullName} (${profile.rollNumber}) will be recorded as having returned to ${profile.hostelName ?? "the hostel"} now. This action is permanent and cannot be undone.`}
          confirmLabel="Confirm Return"
          onConfirm={() => {
            setConfirmDialogOpen(false);
            hostelReturn.record({ leaveRequestId, rollNumber: profile.rollNumber });
          }}
          onCancel={() => setConfirmDialogOpen(false)}
        />
      </div>
    </ContentLayout>
  );
}

function formatDuration(ms: number): string {
  if (ms < 0) return "Not available";
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}
