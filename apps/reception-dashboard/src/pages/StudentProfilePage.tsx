import { useNavigate, useParams } from "react-router-dom";
import { ContentLayout } from "../layouts/ContentLayout";
import { getBreadcrumbTrail } from "../lib/navigation/navigationConfig";
import { useStudentProfile } from "../features/students";
import { useLeaveApprovalEventsRealtime } from "../hooks";
import { Card, Button, StatusBadge } from "../components/ui";
import { Can } from "../components/authorization";
import { LeaveStatusBadge } from "../components/leave";
import {
  leaveDetailPath,
  studentVerificationPath,
  studentReturnPath,
  studentReportEmergencyPath,
  studentReportHealthCasePath,
} from "../constants/routes";
import styles from "./StudentProfilePage.module.css";

const EVENT_LABEL: Record<string, string> = {
  notified: "Parent notified",
  responded: "Parent responded",
  escalated: "Escalated to next contact",
  expired: "Leave expired",
  manual_override: "Reception action",
};

/** Future workflow launch points (§22) — destinations that genuinely don't
 * exist yet anywhere in this repository. "Register Return" was moved out of
 * this list in Phase 4, Prompt 9 (Student Movement Management System);
 * "Report Emergency" was moved out in Phase 4, Prompt 10 (Emergency
 * Operations Center); "Health Alert" was moved out in Phase 4, Prompt 11
 * (Health Operations Center) — all three now have real destinations.
 * Rendered disabled with an honest "Coming soon" label rather than a fake
 * route, per this task's explicit "do not create fake routes simply to
 * make buttons appear functional" instruction. */
const FUTURE_QUICK_ACTIONS = ["Library Pass", "Room Information", "Complaint History"];

/**
 * Student Operations Center — Profile (Phase 4, Prompt 8), replacing
 * Prompt 0.2's placeholder. Read-only by design (§13) — this page never
 * mutates a student/parent/leave record; every write action it offers is a
 * navigation launch point into an already-certified destination (the Leave
 * Detail workspace, Prompt 7B; the Verify Student / Exit Authorization
 * workspace, Prompt 7C), never a duplicate implementation.
 *
 * Data minimization (§14): renders exactly `StudentProfileView`'s fields —
 * no internal id, auth identifier, or unrelated audit detail is ever
 * requested or displayed. A partial profile stays usable (§28): missing
 * guardians or a `null` currentLeave never blocks the identity/hostel
 * sections from rendering.
 *
 * Realtime (§24): reuses the EXISTING `useLeaveApprovalEventsRealtime` hook
 * unchanged, filtered to the student's own current leave request when one
 * exists — the same real, already-certified `leave_approval_events`
 * subscription `LeaveDetailPage`/`StudentVerificationPage` already use, not
 * a new channel or a new business-specific subscription for a module that
 * doesn't exist yet.
 */
export default function StudentProfilePage() {
  const { rollNumber } = useParams<{ rollNumber: string }>();
  const navigate = useNavigate();
  const { profile, isLoading, error, refresh } = useStudentProfile(rollNumber);

  useLeaveApprovalEventsRealtime(
    () => {
      void refresh();
    },
    `leave_request_id=eq.${profile?.currentLeave?.id ?? ""}`,
  );

  const breadcrumb = getBreadcrumbTrail("students", rollNumber ? `${rollNumber}` : undefined);

  if (!rollNumber) {
    return (
      <ContentLayout title="Student Profile" breadcrumb={breadcrumb}>
        {null}
      </ContentLayout>
    );
  }

  if (isLoading) {
    return (
      <ContentLayout title={`Student ${rollNumber}`} breadcrumb={breadcrumb} loading>
        {null}
      </ContentLayout>
    );
  }

  if (error || !profile) {
    return (
      <ContentLayout
        title={`Student ${rollNumber}`}
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
  const isApprovedLeave = currentLeave?.status === "approved";

  return (
    <ContentLayout
      title={profile.fullName}
      description={profile.rollNumber}
      breadcrumb={breadcrumb}
      actions={
        <Button variant="secondary" onClick={() => navigate(-1)}>
          Back to Search
        </Button>
      }
    >
      <div className={styles.page}>
        <div className={styles.grid}>
          <Card className={styles.card}>
            <h2 className={styles.heading}>Identity</h2>
            <dl className={styles.metaList}>
              <div className={styles.metaRow}>
                <dt>Name</dt>
                <dd>{profile.fullName}</dd>
              </div>
              <div className={styles.metaRow}>
                <dt>Roll Number</dt>
                <dd>{profile.rollNumber}</dd>
              </div>
            </dl>
            <p className={styles.unavailableNote}>
              Department, program, semester, and photograph are not available — this system's
              authoritative student record does not currently include them.
            </p>
          </Card>

          <Card className={styles.card}>
            <h2 className={styles.heading}>Hostel</h2>
            <dl className={styles.metaList}>
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
                      profile.hostelPresence === "outside_hostel"
                        ? "Outside Hostel"
                        : "Inside Hostel"
                    }
                    tone={profile.hostelPresence === "outside_hostel" ? "warning" : "success"}
                  />
                </dd>
              </div>
            </dl>
            <p className={styles.unavailableNote}>
              Server-derived from the student's own current leave record (exit authorization and
              recorded return) — never a separately stored status field.
            </p>
          </Card>

          <Card className={styles.card}>
            <h2 className={styles.heading}>Parent / Guardian</h2>
            {profile.guardians.length === 0 ? (
              <p className={styles.unavailableNote}>No linked parent/guardian on record.</p>
            ) : (
              <ul className={styles.guardianList}>
                {profile.guardians.map((g, i) => (
                  <li key={i} className={styles.guardianItem}>
                    <span className={styles.guardianName}>{g.fullName}</span>
                    <span className={styles.guardianMeta}>
                      {g.relationshipType} · {g.phoneNumber}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className={styles.card}>
            <h2 className={styles.heading}>Academic &amp; Mentor</h2>
            <StatusBadge label="Not available — no data source" tone="neutral" />
            <p className={styles.unavailableNote}>
              KIIT SAP mentor/academic integration is not implemented in this system (BLOCKED / NOT
              IMPLEMENTED). This is informational only, never a precondition for any workflow on
              this page.
            </p>
          </Card>
        </div>

        <Card className={styles.card}>
          <h2 className={styles.heading}>Current Leave</h2>
          {!currentLeave ? (
            <p className={styles.unavailableNote}>This student has no leave request on record.</p>
          ) : (
            <>
              <div className={styles.leaveHeader}>
                <LeaveStatusBadge status={currentLeave.status} />
                <span className={styles.leavePeriod}>
                  {currentLeave.startDate} – {currentLeave.endDate}
                </span>
              </div>
              <p className={styles.leaveReason}>{currentLeave.reason}</p>
              <p className={styles.unavailableNote}>
                {currentLeave.exitAuthorized
                  ? `Exit authorized ${currentLeave.exitAuthorizedAt ? new Date(currentLeave.exitAuthorizedAt).toLocaleString() : ""}.`
                  : "No exit authorization recorded for this leave request."}
              </p>
            </>
          )}
        </Card>

        <Card className={styles.card}>
          <h2 className={styles.heading}>Activity Timeline</h2>
          {profile.timeline.length === 0 ? (
            <p className={styles.unavailableNote}>
              No approval events recorded for the current leave request.
            </p>
          ) : (
            <ol className={styles.timeline}>
              {profile.timeline.map((event) => (
                <li key={event.id} className={styles.timelineItem}>
                  <span className={styles.timelineLabel}>
                    {EVENT_LABEL[event.eventType] ?? event.eventType}
                    {event.response ? ` (${event.response})` : ""}
                  </span>
                  <span className={styles.timelineTime}>
                    {new Date(event.occurredAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card className={styles.card}>
          <h2 className={styles.heading}>Quick Actions</h2>
          <div className={styles.actionsGrid}>
            {currentLeave && (
              <Can permission="leave:parent_approval:monitor">
                <Button
                  variant="secondary"
                  onClick={() => navigate(leaveDetailPath(currentLeave.id))}
                >
                  Open Leave Request
                </Button>
              </Can>
            )}
            {isApprovedLeave && (
              <Can permission="student:verify">
                <Button
                  variant="primary"
                  onClick={() =>
                    navigate(
                      `${studentVerificationPath(profile.rollNumber)}?leaveRequestId=${currentLeave!.id}`,
                    )
                  }
                >
                  Verify Student
                </Button>
              </Can>
            )}
            {currentLeave?.exitAuthorized && !currentLeave.returnRecorded && (
              <Can permission="movement:return">
                <Button
                  variant="primary"
                  onClick={() =>
                    navigate(
                      `${studentReturnPath(profile.rollNumber)}?leaveRequestId=${currentLeave.id}`,
                    )
                  }
                >
                  Register Return
                </Button>
              </Can>
            )}
            <Can permission="emergency:manage">
              <Button
                variant="secondary"
                onClick={() => navigate(studentReportEmergencyPath(profile.rollNumber))}
              >
                Report Emergency
              </Button>
            </Can>
            <Can permission="health:manage">
              <Button
                variant="secondary"
                onClick={() => navigate(studentReportHealthCasePath(profile.rollNumber))}
              >
                Report Health Case
              </Button>
            </Can>
            {FUTURE_QUICK_ACTIONS.map((label) => (
              <Button key={label} variant="secondary" disabled title="Coming soon — future module">
                {label}
              </Button>
            ))}
          </div>
        </Card>
      </div>
    </ContentLayout>
  );
}
