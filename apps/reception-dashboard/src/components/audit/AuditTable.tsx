import { Table, EmptyState, ErrorState, Skeleton } from "../ui";
import type { TableColumn } from "../ui";
import { AuditModuleBadge } from "./AuditModuleBadge";
import type { AuditListItem } from "@digihostel/api-client-react";
import styles from "./AuditTable.module.css";

export interface AuditTableProps {
  items: AuditListItem[];
  activeId: string | null;
  onOpen: (id: string) => void;
  loading?: boolean;
  error?: { message: string; onRetry?: () => void };
  emptyTitle: string;
  emptyDescription?: string;
}

const ACTOR_LABEL: Record<AuditListItem["actorType"], string> = {
  student: "Student",
  parent: "Parent/Guardian",
  staff: "Staff",
  system: "System",
};

/**
 * Enterprise Audit Center table (Phase 5, Prompt 12) — built on the
 * existing `Table` primitive, mirroring `HealthCaseTable`'s/
 * `LeaveRequestTable`'s exact loading/error/empty conventions. Columns
 * match §18's required list, limited to fields `AuditListItem` (the real
 * API response shape) actually provides — never a fabricated "Priority"/
 * "Assigned Staff" column. `View Details` is the only row action, opening
 * the detail panel from ALREADY-fetched data (no second network round-trip,
 * and no separate GET /audit/:id lookup surface to attack).
 */
export function AuditTable({
  items,
  activeId,
  onOpen,
  loading,
  error,
  emptyTitle,
  emptyDescription,
}: AuditTableProps) {
  if (loading) {
    return (
      <div className={styles.skeletons} aria-busy="true" aria-label="Loading audit events">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={styles.skeletonRow}>
            <Skeleton height={14} width="30%" />
            <Skeleton height={12} width="60%" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error.message} onRetry={error.onRetry} />;
  }

  if (items.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  const columns: TableColumn<AuditListItem>[] = [
    {
      key: "occurredAt",
      header: "Timestamp",
      render: (item) => (
        <time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleString()}</time>
      ),
    },
    {
      key: "module",
      header: "Module",
      render: (item) => <AuditModuleBadge module={item.module} />,
    },
    {
      key: "action",
      header: "Event Type",
      render: (item) => <span className={styles.actionText}>{item.action}</span>,
    },
    {
      key: "student",
      header: "Student",
      render: (item) =>
        item.studentFullName ? (
          <div className={styles.studentCell}>
            <span>{item.studentFullName}</span>
            <span className={styles.studentMeta}>{item.studentRollNumber}</span>
          </div>
        ) : (
          <span className={styles.muted}>Not applicable</span>
        ),
    },
    {
      key: "actor",
      header: "Actor",
      render: (item) => (
        <div className={styles.studentCell}>
          <span>{item.actorName ?? "Not available"}</span>
          <span className={styles.studentMeta}>
            {ACTOR_LABEL[item.actorType]}
            {item.actorRole ? ` · ${item.actorRole}` : ""}
          </span>
        </div>
      ),
    },
    {
      key: "hostel",
      header: "Hostel",
      render: (item) => <span>{item.hostelName ?? "—"}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      render: (item) => (
        <button type="button" className={styles.viewButton} onClick={() => onOpen(item.id)}>
          View Details
        </button>
      ),
    },
  ];

  return (
    <Table
      columns={columns}
      rows={items}
      getRowKey={(item) => item.id}
      getRowProps={(item) => ({
        "data-audit-id": item.id,
        "aria-selected": item.id === activeId,
      })}
    />
  );
}
