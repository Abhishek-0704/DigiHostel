import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button, EmptyState } from "../ui";
import { AuditModuleBadge } from "./AuditModuleBadge";
import {
  leaveDetailPath,
  studentProfilePath,
  emergencyDetailPath,
  healthCaseDetailPath,
} from "../../constants/routes";
import type { AuditListItem } from "@digihostel/api-client-react";
import styles from "./AuditDetailPanel.module.css";

export interface AuditDetailPanelProps {
  item: AuditListItem | null;
  onClose: () => void;
}

const ACTOR_TYPE_LABEL: Record<AuditListItem["actorType"], string> = {
  student: "Student",
  parent: "Parent/Guardian",
  staff: "Staff",
  system: "System",
};

/** Every one of these entity types is real and hostel-derivable server-side
 * (see domain/audit/repository.ts's RESOLVED_CTE) — never a fabricated
 * link for a type this endpoint doesn't actually resolve. */
function relatedEntityLink(item: AuditListItem): { label: string; to: string } | null {
  switch (item.entityType) {
    case "leave_requests":
      return { label: "Open Leave Request", to: leaveDetailPath(item.entityId) };
    case "security_incidents":
      return { label: "Open Emergency Case", to: emergencyDetailPath(item.entityId) };
    case "health_cases":
      return { label: "Open Health Case", to: healthCaseDetailPath(item.entityId) };
    default:
      return null;
  }
}

/**
 * Enterprise Audit Center detail panel (Phase 5, Prompt 12) — mirrors
 * `LeaveRequestDetailPanel`'s/`NotificationDetail`'s established list/
 * detail split-pane pattern and identical focus-management discipline
 * (close button auto-focused on open, Escape closes). Deliberately renders
 * ONLY from the already-fetched `AuditListItem` — there is no
 * `GET /audit/:id` endpoint and no second network round-trip, which also
 * means there is no separate by-id lookup surface an attacker could probe
 * (§37's IDOR concern is structurally eliminated, not merely defended).
 * Strictly read-only: no control on this panel ever mutates anything.
 * "Related Entities"/"Timeline" (§23) are satisfied by navigating to that
 * entity's own already-certified detail page (which re-runs its own
 * authorization independently — a link is never treated as permission)
 * rather than duplicating a second timeline renderer here.
 */
export function AuditDetailPanel({ item, onClose }: AuditDetailPanelProps) {
  const navigate = useNavigate();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (item) closeButtonRef.current?.focus();
  }, [item?.id]);

  if (!item) {
    return (
      <div className={styles.placeholder}>
        <EmptyState
          title="No event selected"
          description="Select an audit event from the table to view its details."
        />
      </div>
    );
  }

  const relatedLink = relatedEntityLink(item);
  const metadataEntries = Object.entries(item.metadata ?? {});

  return (
    <div
      className={styles.panel}
      role="region"
      aria-label={`Audit event detail: ${item.action}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>{item.action}</h2>
          <AuditModuleBadge module={item.module} />
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close audit event detail"
        >
          ×
        </button>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionHeading}>Metadata</h3>
        <dl className={styles.metaList}>
          <div className={styles.metaRow}>
            <dt>Audit ID</dt>
            <dd className={styles.mono}>{item.id}</dd>
          </div>
          <div className={styles.metaRow}>
            <dt>Timestamp</dt>
            <dd>
              <time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleString()}</time>
            </dd>
          </div>
          <div className={styles.metaRow}>
            <dt>Source Table</dt>
            <dd className={styles.mono}>{item.entityType}</dd>
          </div>
        </dl>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionHeading}>Actor</h3>
        <dl className={styles.metaList}>
          <div className={styles.metaRow}>
            <dt>Name</dt>
            <dd>{item.actorName ?? "Not available"}</dd>
          </div>
          <div className={styles.metaRow}>
            <dt>Type</dt>
            <dd>{ACTOR_TYPE_LABEL[item.actorType]}</dd>
          </div>
          {item.actorRole && (
            <div className={styles.metaRow}>
              <dt>Role</dt>
              <dd>{item.actorRole}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionHeading}>Affected Entity</h3>
        {item.studentFullName ? (
          <dl className={styles.metaList}>
            <div className={styles.metaRow}>
              <dt>Student</dt>
              <dd>{item.studentFullName}</dd>
            </div>
            <div className={styles.metaRow}>
              <dt>Roll Number</dt>
              <dd>{item.studentRollNumber}</dd>
            </div>
            <div className={styles.metaRow}>
              <dt>Hostel</dt>
              <dd>{item.hostelName ?? "Not available"}</dd>
            </div>
          </dl>
        ) : (
          <p className={styles.note}>No student is associated with this event.</p>
        )}
      </div>

      {metadataEntries.length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.sectionHeading}>Operation Details</h3>
          <dl className={styles.metaList}>
            {metadataEntries.map(([key, value]) => (
              <div className={styles.metaRow} key={key}>
                <dt>{key}</dt>
                <dd className={styles.mono}>{String(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className={styles.section}>
        <h3 className={styles.sectionHeading}>Attachments</h3>
        <p className={styles.note}>No attachment capability exists yet for audit events.</p>
      </div>

      <div className={styles.footerActions}>
        {relatedLink && (
          <Button variant="primary" onClick={() => navigate(relatedLink.to)}>
            {relatedLink.label}
          </Button>
        )}
        {item.studentRollNumber && (
          <Button
            variant="secondary"
            onClick={() => navigate(studentProfilePath(item.studentRollNumber!))}
          >
            Open Student Profile
          </Button>
        )}
      </div>
    </div>
  );
}
