import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button, EmptyState } from "../ui";
import { useAuthorization } from "../../contexts/AuthorizationContext";
import { ApprovalProgressIndicator } from "./ApprovalProgressIndicator";
import { WaitingTimeIndicator } from "./WaitingTimeIndicator";
import { leaveDetailPath } from "../../constants/routes";
import type { LeaveQueueItem } from "../../features/leave";
import styles from "./LeaveRequestDetailPanel.module.css";

export interface LeaveRequestDetailPanelProps {
  item: LeaveQueueItem | null;
  onClose: () => void;
}

/**
 * Reception Leave Request detail panel (Prompt 7A §13, updated Prompt 7B).
 * Mirrors the Notification Center's `NotificationDetail` list/detail
 * split-pane pattern (Prompt 6). Same focus-management discipline: the
 * close button receives focus whenever a NEW request is opened, and Escape
 * closes the panel from anywhere inside it.
 *
 * Every section below only ever shows real data or an HONEST unavailable
 * state — never a fabricated field:
 * - Parent/Guardian identity/contact is never shown: this endpoint's own
 *   contract deliberately excludes it (reception staff have no legitimate
 *   need to see it here — docs/rls-policy-matrix.md).
 * - Timeline: NOT duplicated inline here — the full, real timeline now
 *   lives in the Parent Approval Session Workspace (`/leave/:id`,
 *   `LeaveDetailPage`, Prompt 7B), which this panel links to. Rendering it
 *   twice would be exactly the "avoid excessive fragmentation" duplication
 *   this app's own conventions warn against.
 * - Operational notes: no persistence model exists for reception-authored
 *   notes on a leave request anywhere in this schema — shown as a
 *   future-ready placeholder rather than an ad-hoc, undesigned table.
 * - "Open Approval Session": a REAL navigation (Prompt 7B), gated by the
 *   same `leave:parent_approval:initiate` permission this button has always
 *   used. It does NOT itself start parent approval — there is no separate
 *   "session" entity to create (see `docs/leave-queue.md`'s Parent Approval
 *   Session Workspace section for why). This button only opens the
 *   real-time monitoring workspace at `/leave/:id`
 *   (`LeaveDetailPage`); the actual "Send for Parent Approval" action
 *   (Reception-Initiated Parent Approval correction — a `pending` request no
 *   longer starts its escalation lifecycle automatically at creation) lives
 *   on that workspace itself, not here, since it is a one-time, deliberate
 *   staff decision rather than something to trigger from a list-row panel.
 */
export function LeaveRequestDetailPanel({ item, onClose }: LeaveRequestDetailPanelProps) {
  const { hasPermission } = useAuthorization();
  const navigate = useNavigate();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (item) closeButtonRef.current?.focus();
  }, [item?.id]);

  if (!item) {
    return (
      <div className={styles.placeholder}>
        <EmptyState
          title="No request selected"
          description="Select a leave request from the queue to view its details."
        />
      </div>
    );
  }

  const canOpenApprovalSession = hasPermission("leave:parent_approval:initiate");

  return (
    <div
      className={styles.panel}
      role="region"
      aria-label={`Leave request detail: ${item.studentFullName}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className={styles.header}>
        <h2 className={styles.title}>{item.studentFullName}</h2>
        <button
          ref={closeButtonRef}
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close leave request detail"
        >
          ×
        </button>
      </div>

      <ApprovalProgressIndicator status={item.status} />

      <dl className={styles.metaList}>
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
        <div className={styles.metaRow}>
          <dt>Created</dt>
          <dd>
            <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
          </dd>
        </div>
        <div className={styles.metaRow}>
          <dt>Waiting</dt>
          <dd>
            <WaitingTimeIndicator createdAt={item.createdAt} />
          </dd>
        </div>
      </dl>

      <div className={styles.section}>
        <h3 className={styles.sectionHeading}>Parent / Guardian</h3>
        <p className={styles.note}>
          Not shown here — parent/guardian identity and contact details are not exposed to reception
          staff through this queue.
        </p>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionHeading}>Operational Notes</h3>
        <p className={styles.note}>No note-taking capability exists yet for leave requests.</p>
      </div>

      {canOpenApprovalSession && (
        <Button
          variant="primary"
          className={styles.actionButton}
          onClick={() => navigate(leaveDetailPath(item.id))}
        >
          Open Approval Session
        </Button>
      )}
    </div>
  );
}
