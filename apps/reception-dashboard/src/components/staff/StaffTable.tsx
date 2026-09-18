import { Table, EmptyState, ErrorState, Skeleton, StatusBadge } from "../ui";
import type { TableColumn } from "../ui";
import { staffRoleLabel } from "./StaffRoleLabel";
import type { StaffAdmin } from "@digihostel/api-client-react";
import styles from "./StaffTable.module.css";

export interface StaffTableProps {
  items: StaffAdmin[];
  activeId: string | null;
  onOpen: (id: string) => void;
  loading?: boolean;
  error?: { message: string; onRetry?: () => void };
  emptyTitle: string;
  emptyDescription?: string;
}

/**
 * Identity & Access Administration Center staff directory table (Phase 5,
 * Prompt 13) — built on the existing `Table` primitive, mirroring
 * `AuditTable`'s/`HealthCaseTable`'s exact loading/error/empty conventions.
 * Columns show only fields `StaffAdmin` (the real API response shape)
 * actually provides — hostel is shown by name where resolved (super_admin/
 * library_incharge may legitimately have none), never a fabricated field.
 */
export function StaffTable({
  items,
  activeId,
  onOpen,
  loading,
  error,
  emptyTitle,
  emptyDescription,
}: StaffTableProps) {
  if (loading) {
    return (
      <div className={styles.skeletons} aria-busy="true" aria-label="Loading staff directory">
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

  const columns: TableColumn<StaffAdmin>[] = [
    {
      key: "name",
      header: "Name",
      render: (item) => (
        <div className={styles.nameCell}>
          <span>{item.fullName}</span>
          <span className={styles.meta}>{item.email ?? "No email on record"}</span>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (item) => <span className={styles.roleText}>{staffRoleLabel(item.role)}</span>,
    },
    {
      key: "hostel",
      header: "Hostel",
      render: (item) => <span>{item.hostelName ?? "—"}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (item) =>
        item.status === "active" ? (
          <StatusBadge label="Active" tone="success" />
        ) : (
          <StatusBadge label="Suspended" tone="error" />
        ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (item) => (
        <button type="button" className={styles.manageButton} onClick={() => onOpen(item.id)}>
          Manage
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
        "data-staff-id": item.id,
        "aria-selected": item.id === activeId,
      })}
    />
  );
}
