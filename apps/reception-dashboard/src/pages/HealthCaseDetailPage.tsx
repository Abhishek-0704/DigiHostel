import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ContentLayout } from "../layouts/ContentLayout";
import { getBreadcrumbTrail } from "../lib/navigation/navigationConfig";
import {
  useHealthCaseDetail,
  useHealthCaseTransition,
  useAddHealthCaseNote,
  useHealthCaseHistory,
} from "../features/health";
import { useStudentProfile } from "../features/students";
import { useHealthCaseDetailRealtime } from "../hooks";
import { Button, Card, ConfirmationDialog, StatusBadge, Skeleton } from "../components/ui";
import {
  HealthCaseSeverityBadge,
  HealthCaseStatusBadge,
  healthCaseCategoryLabel,
} from "../components/health";
import { Can } from "../components/authorization";
import { studentProfilePath, healthCaseDetailPath } from "../constants/routes";
import type { HealthCaseTransitionAction } from "../features/health";
import type { HealthCaseEventType } from "@digihostel/api-client-react";
import styles from "./HealthCaseDetailPage.module.css";

const EVENT_LABEL: Record<HealthCaseEventType, string> = {
  created: "Case reported",
  acknowledged: "Acknowledged",
  monitoring_started: "Monitoring started",
  awaiting_update: "Marked awaiting update",
  update_received: "Update received — monitoring resumed",
  note_added: "Note added",
  resolved: "Resolved",
  discharge_recorded: "Discharge recorded",
  closed: "Closed",
  cancelled: "Cancelled",
};

interface ActionDefinition {
  action: HealthCaseTransitionAction;
  label: string;
  confirmDescription: string;
  variant: "primary" | "secondary";
}

/** Every status's own available next action(s) — unlike the EOC's single
 * linear chain, several statuses here genuinely offer more than one valid
 * next step (e.g. a monitored case may resolve OR be discharged), so this
 * maps to an ARRAY, each entry independently confirmed before being sent. */
const NEXT_ACTIONS: Partial<Record<string, ActionDefinition[]>> = {
  new: [
    {
      action: "acknowledge",
      label: "Acknowledge",
      confirmDescription: "This assigns the case to you and marks it as acknowledged.",
      variant: "primary",
    },
    {
      action: "cancel",
      label: "Cancel (False Alarm)",
      confirmDescription: "This cancels the case as a false alarm or duplicate report.",
      variant: "secondary",
    },
  ],
  acknowledged: [
    {
      action: "startMonitoring",
      label: "Start Monitoring",
      confirmDescription: "This marks the case as actively being monitored.",
      variant: "primary",
    },
  ],
  monitoring: [
    {
      action: "markAwaitingUpdate",
      label: "Mark Awaiting Update",
      confirmDescription: "This marks the case as waiting on an external update (e.g. a hospital).",
      variant: "secondary",
    },
    {
      action: "resolve",
      label: "Mark Resolved",
      confirmDescription: "This marks the case as resolved, with no hospital admission involved.",
      variant: "primary",
    },
    {
      action: "discharge",
      label: "Record Discharge",
      confirmDescription: "This records that the student has been discharged.",
      variant: "primary",
    },
  ],
  awaiting_update: [
    {
      action: "resumeMonitoring",
      label: "Resume Monitoring",
      confirmDescription: "This records that an update was received and resumes active monitoring.",
      variant: "primary",
    },
  ],
  resolved: [
    {
      action: "close",
      label: "Close Case",
      confirmDescription:
        "This closes the case permanently — no further action or notes can be added.",
      variant: "primary",
    },
  ],
  discharged: [
    {
      action: "close",
      label: "Close Case",
      confirmDescription:
        "This closes the case permanently — no further action or notes can be added.",
      variant: "primary",
    },
  ],
};

function HealthCaseActionButton({
  caseId,
  definition,
}: {
  caseId: string;
  definition: ActionDefinition;
}) {
  const transition = useHealthCaseTransition(definition.action);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className={styles.actionGroup}>
      <Button
        variant={definition.variant}
        loading={transition.isPending}
        onClick={() => setConfirmOpen(true)}
      >
        {definition.label}
      </Button>
      {transition.error && (
        <div role="alert" className={styles.formError}>
          {transition.error.userMessage}
        </div>
      )}
      <ConfirmationDialog
        open={confirmOpen}
        title={`Confirm: ${definition.label}`}
        description={definition.confirmDescription}
        confirmLabel={definition.label}
        onConfirm={() => {
          setConfirmOpen(false);
          transition.transition(caseId);
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

/**
 * Health Operations Center — Case Detail (Phase 4, Prompt 11; closure pass
 * for the Notification/Parent-Guardian/Medical-History conditions).
 * Structurally mirrors `EmergencyDetailPage`'s established checklist/
 * confirmation-dialog/timeline shape, extended for this domain's own
 * richer state machine (several statuses genuinely offer more than one
 * valid next action).
 *
 * **Parent/Guardian** (closure condition #2): reuses `useStudentProfile`
 * (Student Operations Center, Prompt 8) directly — the SAME already-
 * authorized, already-hostel-scoped, already-tested `GET /students/
 * {rollNumber}` endpoint `StudentProfilePage` itself uses, never a
 * duplicated guardian query or a second parent/guardian data path.
 *
 * **Medical History** (closure condition #3): reuses `useHealthCaseHistory`
 * — the SAME `health_cases` table and `GET /health-cases` endpoint the
 * operational queue already uses, filtered to this student. Read-only: no
 * action buttons, only a link to view another case's own detail page.
 *
 * **Notification Center** (closure condition #1): confirmed, not changed —
 * see `apps/reception-dashboard/docs/health-operations-center.md` §16 for
 * the full evidence trail on why no Health notification producer exists.
 */
export default function HealthCaseDetailPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const { healthCase, isLoading, error, refresh } = useHealthCaseDetail(caseId);

  useHealthCaseDetailRealtime(() => {
    void refresh();
  }, caseId ?? "");

  const [noteText, setNoteText] = useState("");
  const addNote = useAddHealthCaseNote();
  // Hooks are called unconditionally (before the loading/error early
  // returns below) per the Rules of Hooks — both hooks already handle an
  // undefined argument by simply not firing their query yet (`enabled:
  // Boolean(...)`, matching every other conditional-fetch hook in this
  // codebase, e.g. useStudentProfile's own doc comment).
  const {
    profile: studentProfile,
    isLoading: isProfileLoading,
    error: profileError,
  } = useStudentProfile(healthCase?.studentRollNumber);
  const {
    items: historyItems,
    isLoading: isHistoryLoading,
    error: historyError,
  } = useHealthCaseHistory(healthCase?.studentId);

  const breadcrumb = getBreadcrumbTrail(
    "health",
    healthCase ? `Case ${healthCase.id.slice(0, 8)}` : undefined,
  );

  if (isLoading) {
    return (
      <ContentLayout title="Case" breadcrumb={breadcrumb} loading>
        {null}
      </ContentLayout>
    );
  }

  if (error || !healthCase) {
    return (
      <ContentLayout
        title="Case"
        breadcrumb={breadcrumb}
        error={{
          message: error?.userMessage ?? "This case could not be found.",
          onRetry: refresh,
        }}
      >
        {null}
      </ContentLayout>
    );
  }

  const isClosedOrCancelled = healthCase.status === "closed" || healthCase.status === "cancelled";
  const nextActions = NEXT_ACTIONS[healthCase.status] ?? [];

  function handleAddNote() {
    if (!caseId || noteText.trim() === "") return;
    addNote.addNote({ caseId, note: noteText.trim() });
    setNoteText("");
  }

  return (
    <ContentLayout
      title={`${healthCaseCategoryLabel(healthCase.category)} — ${healthCase.studentFullName}`}
      description={healthCase.studentRollNumber}
      breadcrumb={breadcrumb}
      actions={
        <Button
          variant="secondary"
          onClick={() => navigate(studentProfilePath(healthCase.studentRollNumber))}
        >
          Open Student Profile
        </Button>
      }
    >
      <div className={styles.page}>
        <div className={styles.grid}>
          <Card className={styles.card}>
            <h2 className={styles.heading}>Medical Case</h2>
            <dl className={styles.metaList}>
              <div className={styles.metaRow}>
                <dt>Category</dt>
                <dd>{healthCaseCategoryLabel(healthCase.category)}</dd>
              </div>
              <div className={styles.metaRow}>
                <dt>Priority</dt>
                <dd>
                  <HealthCaseSeverityBadge severity={healthCase.severity} />
                </dd>
              </div>
              <div className={styles.metaRow}>
                <dt>Status</dt>
                <dd>
                  <HealthCaseStatusBadge status={healthCase.status} />
                </dd>
              </div>
              <div className={styles.metaRow}>
                <dt>Reported</dt>
                <dd>{new Date(healthCase.reportedAt).toLocaleString()}</dd>
              </div>
              {healthCase.admittedAt && (
                <div className={styles.metaRow}>
                  <dt>Admitted</dt>
                  <dd>{new Date(healthCase.admittedAt).toLocaleString()}</dd>
                </div>
              )}
              <div className={styles.metaRow}>
                <dt>Latest Update</dt>
                <dd>{new Date(healthCase.latestUpdateAt).toLocaleString()}</dd>
              </div>
              <div className={styles.metaRow}>
                <dt>Assigned Staff</dt>
                <dd>{healthCase.assignedStaffName ?? "Unassigned"}</dd>
              </div>
              {healthCase.resolvedAt && (
                <div className={styles.metaRow}>
                  <dt>Resolved</dt>
                  <dd>{new Date(healthCase.resolvedAt).toLocaleString()}</dd>
                </div>
              )}
              {healthCase.dischargedAt && (
                <div className={styles.metaRow}>
                  <dt>Discharged</dt>
                  <dd>{new Date(healthCase.dischargedAt).toLocaleString()}</dd>
                </div>
              )}
              {healthCase.closedAt && (
                <div className={styles.metaRow}>
                  <dt>Closed</dt>
                  <dd>{new Date(healthCase.closedAt).toLocaleString()}</dd>
                </div>
              )}
              {healthCase.cancelledAt && (
                <div className={styles.metaRow}>
                  <dt>Cancelled</dt>
                  <dd>{new Date(healthCase.cancelledAt).toLocaleString()}</dd>
                </div>
              )}
            </dl>
            {healthCase.description && (
              <p className={styles.description}>{healthCase.description}</p>
            )}
          </Card>

          <Card className={styles.card}>
            <h2 className={styles.heading}>Student</h2>
            <dl className={styles.metaList}>
              <div className={styles.metaRow}>
                <dt>Name</dt>
                <dd>{healthCase.studentFullName}</dd>
              </div>
              <div className={styles.metaRow}>
                <dt>Roll Number</dt>
                <dd>{healthCase.studentRollNumber}</dd>
              </div>
              <div className={styles.metaRow}>
                <dt>Hostel</dt>
                <dd>{healthCase.hostelName ?? "Not assigned"}</dd>
              </div>
              <div className={styles.metaRow}>
                <dt>Room</dt>
                <dd>{healthCase.roomNumber ?? "Not assigned"}</dd>
              </div>
            </dl>
            <p className={styles.unavailableNote}>
              Leave context is available on the student's own profile — use "Open Student Profile"
              above.
            </p>
          </Card>

          <Card className={styles.card}>
            <h2 className={styles.heading}>Parent / Guardian</h2>
            {isProfileLoading ? (
              <div aria-busy="true" aria-label="Loading parent/guardian information">
                <Skeleton height={14} width="70%" />
                <Skeleton height={12} width="50%" />
              </div>
            ) : profileError ? (
              <p className={styles.unavailableNote} role="status">
                Parent/guardian information is not currently available.
              </p>
            ) : !studentProfile || studentProfile.guardians.length === 0 ? (
              <p className={styles.unavailableNote}>No linked parent/guardian on record.</p>
            ) : (
              <ul className={styles.guardianList}>
                {studentProfile.guardians.map((g, i) => (
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
            <h2 className={styles.heading}>Medical History</h2>
            {isHistoryLoading ? (
              <div aria-busy="true" aria-label="Loading medical history">
                <Skeleton height={14} width="70%" />
                <Skeleton height={12} width="50%" />
              </div>
            ) : historyError ? (
              <p className={styles.unavailableNote} role="status">
                Medical history is not currently available.
              </p>
            ) : (
              (() => {
                const otherCases = historyItems.filter((item) => item.id !== healthCase.id);
                if (otherCases.length === 0) {
                  return (
                    <p className={styles.unavailableNote}>
                      No other historical medical records for this student.
                    </p>
                  );
                }
                return (
                  <ul className={styles.historyList}>
                    {otherCases.map((item) => (
                      <li key={item.id} className={styles.historyItem}>
                        <button
                          type="button"
                          className={styles.historyLink}
                          onClick={() => navigate(healthCaseDetailPath(item.id))}
                        >
                          {healthCaseCategoryLabel(item.category)}
                        </button>
                        <span className={styles.historyMeta}>
                          <HealthCaseStatusBadge status={item.status} /> ·{" "}
                          {new Date(item.reportedAt).toLocaleDateString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                );
              })()
            )}
            <p className={styles.unavailableNote}>
              Read-only — this domain's own past case records, never editable from here.
            </p>
          </Card>

          <Card className={styles.card}>
            <h2 className={styles.heading}>Future Integrations</h2>
            <p className={styles.unavailableNote}>
              Future — discharge summary document: not implemented.
              <br />
              Future — medical document attachments: not implemented.
              <br />
              Future — hospital updates (KIIMS/external system): not implemented, no such
              integration exists in this repository.
              <br />
              Future — staff notification on critical cases: platform capability currently
              unavailable (see the architecture doc's §16 for the full dependency boundary).
            </p>
          </Card>
        </div>

        <Card className={styles.card}>
          <h2 className={styles.heading}>Operational Timeline</h2>
          <ol className={styles.timeline}>
            {healthCase.timeline.map((event) => (
              <li key={event.id} className={styles.timelineItem}>
                <span className={styles.timelineLabel}>
                  {EVENT_LABEL[event.eventType] ?? event.eventType}
                  {event.actorStaffName ? ` — ${event.actorStaffName}` : ""}
                </span>
                {event.note && <span className={styles.timelineNote}>{event.note}</span>}
                <span className={styles.timelineTime}>
                  {new Date(event.occurredAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        </Card>

        <Can permission="health:manage">
          <Card className={styles.card}>
            <h2 className={styles.heading}>Add Operational Note</h2>
            {isClosedOrCancelled ? (
              <p className={styles.unavailableNote}>
                This case is {healthCase.status} — no further notes can be added.
              </p>
            ) : (
              <div className={styles.noteForm}>
                <textarea
                  className={styles.noteTextarea}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="e.g. Parent informed by phone, student stable."
                  aria-label="Operational note"
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={noteText.trim() === "" || addNote.isPending}
                  loading={addNote.isPending}
                  onClick={handleAddNote}
                >
                  Add Note
                </Button>
                {addNote.error && (
                  <div role="alert" className={styles.formError}>
                    {addNote.error.userMessage}
                  </div>
                )}
              </div>
            )}
          </Card>

          {nextActions.length > 0 && (
            <Card className={styles.card}>
              <h2 className={styles.heading}>Actions</h2>
              <div className={styles.actionsGrid}>
                {nextActions.map((definition) => (
                  <HealthCaseActionButton
                    key={definition.action}
                    caseId={healthCase.id}
                    definition={definition}
                  />
                ))}
              </div>
            </Card>
          )}

          {isClosedOrCancelled && (
            <div role="status" className={styles.unavailableNote}>
              <StatusBadge
                label={healthCase.status === "closed" ? "Case closed" : "Case cancelled"}
                tone="neutral"
              />
            </div>
          )}
        </Can>
      </div>
    </ContentLayout>
  );
}
