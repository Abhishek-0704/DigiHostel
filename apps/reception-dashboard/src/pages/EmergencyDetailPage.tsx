import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ContentLayout } from "../layouts/ContentLayout";
import { getBreadcrumbTrail } from "../lib/navigation/navigationConfig";
import {
  useEmergencyDetail,
  useEmergencyTransition,
  useAddEmergencyNote,
} from "../features/emergency";
import { useEmergencyDetailRealtime } from "../hooks";
import { Button, Card, ConfirmationDialog, StatusBadge } from "../components/ui";
import {
  EmergencySeverityBadge,
  EmergencyStatusBadge,
  emergencyCategoryLabel,
} from "../components/emergency";
import { Can } from "../components/authorization";
import { studentProfilePath } from "../constants/routes";
import type { EmergencyTransitionAction } from "../features/emergency";
import type { EmergencyEventType } from "@digihostel/api-client-react";
import styles from "./EmergencyDetailPage.module.css";

const EVENT_LABEL: Record<EmergencyEventType, string> = {
  created: "Incident reported",
  acknowledged: "Acknowledged",
  response_started: "Response started",
  note_added: "Note added",
  resolved: "Resolved",
  closed: "Closed",
};

const NEXT_ACTION: Partial<
  Record<string, { action: EmergencyTransitionAction; label: string; confirmDescription: string }>
> = {
  open: {
    action: "acknowledge",
    label: "Acknowledge",
    confirmDescription: "This assigns the incident to you and marks it as acknowledged.",
  },
  acknowledged: {
    action: "startResponse",
    label: "Start Response",
    confirmDescription: "This marks the incident as actively being responded to.",
  },
  in_progress: {
    action: "resolve",
    label: "Mark Resolved",
    confirmDescription: "This marks the incident as resolved. You can still close it afterward.",
  },
  resolved: {
    action: "close",
    label: "Close Incident",
    confirmDescription:
      "This closes the incident permanently — no further action or notes can be added.",
  },
};

/**
 * Emergency Operations Center — Incident Detail (Phase 4, Prompt 10).
 * Structurally mirrors `StudentReturnPage`'s established
 * checklist/confirmation-dialog/timeline shape — one server-authoritative
 * transition per confirmed action, never multiple independent client
 * writes. Student information (name/roll number/hostel/room) is the SAME
 * minimal set already returned by this endpoint — no duplicated guardian/
 * leave query; "Open Student Profile" navigates to the existing, already-
 * certified Student Operations Center for anything more.
 */
export default function EmergencyDetailPage() {
  const { incidentId } = useParams<{ incidentId: string }>();
  const navigate = useNavigate();
  const { incident, isLoading, error, refresh } = useEmergencyDetail(incidentId);

  useEmergencyDetailRealtime(() => {
    void refresh();
  }, incidentId ?? "");

  const [confirmAction, setConfirmAction] = useState<EmergencyTransitionAction | null>(null);
  const [noteText, setNoteText] = useState("");

  const nextAction = incident ? NEXT_ACTION[incident.status] : undefined;
  const transition = useEmergencyTransition(nextAction?.action ?? "acknowledge");
  const addNote = useAddEmergencyNote();

  const breadcrumb = getBreadcrumbTrail(
    "emergency",
    incident ? `Incident ${incident.id.slice(0, 8)}` : undefined,
  );

  if (isLoading) {
    return (
      <ContentLayout title="Incident" breadcrumb={breadcrumb} loading>
        {null}
      </ContentLayout>
    );
  }

  if (error || !incident) {
    return (
      <ContentLayout
        title="Incident"
        breadcrumb={breadcrumb}
        error={{
          message: error?.userMessage ?? "This incident could not be found.",
          onRetry: refresh,
        }}
      >
        {null}
      </ContentLayout>
    );
  }

  function handleAddNote() {
    if (!incidentId || noteText.trim() === "") return;
    addNote.addNote({ incidentId, note: noteText.trim() });
    setNoteText("");
  }

  return (
    <ContentLayout
      title={`${emergencyCategoryLabel(incident.category)} — ${incident.studentFullName}`}
      description={incident.studentRollNumber}
      breadcrumb={breadcrumb}
      actions={
        <Button
          variant="secondary"
          onClick={() => navigate(studentProfilePath(incident.studentRollNumber))}
        >
          Open Student Profile
        </Button>
      }
    >
      <div className={styles.page}>
        <div className={styles.grid}>
          <Card className={styles.card}>
            <h2 className={styles.heading}>Incident</h2>
            <dl className={styles.metaList}>
              <div className={styles.metaRow}>
                <dt>Category</dt>
                <dd>{emergencyCategoryLabel(incident.category)}</dd>
              </div>
              <div className={styles.metaRow}>
                <dt>Priority</dt>
                <dd>
                  <EmergencySeverityBadge severity={incident.severity} />
                </dd>
              </div>
              <div className={styles.metaRow}>
                <dt>Status</dt>
                <dd>
                  <EmergencyStatusBadge status={incident.status} />
                </dd>
              </div>
              <div className={styles.metaRow}>
                <dt>Reported</dt>
                <dd>{new Date(incident.reportedAt).toLocaleString()}</dd>
              </div>
              <div className={styles.metaRow}>
                <dt>Assigned Staff</dt>
                <dd>{incident.assignedStaffName ?? "Unassigned"}</dd>
              </div>
              {incident.resolvedAt && (
                <div className={styles.metaRow}>
                  <dt>Resolved</dt>
                  <dd>{new Date(incident.resolvedAt).toLocaleString()}</dd>
                </div>
              )}
              {incident.closedAt && (
                <div className={styles.metaRow}>
                  <dt>Closed</dt>
                  <dd>{new Date(incident.closedAt).toLocaleString()}</dd>
                </div>
              )}
            </dl>
            {incident.description && <p className={styles.description}>{incident.description}</p>}
          </Card>

          <Card className={styles.card}>
            <h2 className={styles.heading}>Student</h2>
            <dl className={styles.metaList}>
              <div className={styles.metaRow}>
                <dt>Name</dt>
                <dd>{incident.studentFullName}</dd>
              </div>
              <div className={styles.metaRow}>
                <dt>Roll Number</dt>
                <dd>{incident.studentRollNumber}</dd>
              </div>
              <div className={styles.metaRow}>
                <dt>Hostel</dt>
                <dd>{incident.hostelName ?? "Not assigned"}</dd>
              </div>
              <div className={styles.metaRow}>
                <dt>Room</dt>
                <dd>{incident.roomNumber ?? "Not assigned"}</dd>
              </div>
            </dl>
            <p className={styles.unavailableNote}>
              Guardian contact and leave context are available on the student's own profile — use
              "Open Student Profile" above.
            </p>
          </Card>
        </div>

        <Card className={styles.card}>
          <h2 className={styles.heading}>Operational Timeline</h2>
          <ol className={styles.timeline}>
            {incident.timeline.map((event) => (
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

        <Can permission="emergency:manage">
          <Card className={styles.card}>
            <h2 className={styles.heading}>Add Operational Note</h2>
            {incident.status === "closed" ? (
              <p className={styles.unavailableNote}>
                This incident is closed — no further notes can be added.
              </p>
            ) : (
              <div className={styles.noteForm}>
                <textarea
                  className={styles.noteTextarea}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="e.g. Called ambulance, student conscious and stable."
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

          {nextAction && (
            <Card className={styles.card}>
              <h2 className={styles.heading}>Action</h2>
              <Button
                variant="primary"
                loading={transition.isPending}
                onClick={() => setConfirmAction(nextAction.action)}
              >
                {nextAction.label}
              </Button>
              {transition.error && (
                <div role="alert" className={styles.formError}>
                  {transition.error.userMessage}
                </div>
              )}
            </Card>
          )}

          {incident.status === "closed" && (
            <div role="status" className={styles.unavailableNote}>
              <StatusBadge label="Incident closed" tone="neutral" />
            </div>
          )}
        </Can>

        {nextAction && (
          <ConfirmationDialog
            open={confirmAction !== null}
            title={`Confirm: ${nextAction.label}`}
            description={nextAction.confirmDescription}
            confirmLabel={nextAction.label}
            onConfirm={() => {
              setConfirmAction(null);
              if (incidentId) transition.transition(incidentId);
            }}
            onCancel={() => setConfirmAction(null)}
          />
        )}
      </div>
    </ContentLayout>
  );
}
