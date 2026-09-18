import { useNavigate } from "react-router-dom";
import { Table, EmptyState, ErrorState, Skeleton, Button } from "../ui";
import type { TableColumn } from "../ui";
import {
  HealthCaseSeverityBadge,
  HealthCaseStatusBadge,
  healthCaseCategoryLabel,
} from "./HealthBadges";
import { healthCaseDetailPath } from "../../constants/routes";
import type { HealthCaseListItem } from "@digihostel/api-client-react";
import styles from "./HealthCaseTable.module.css";

export interface HealthCaseTableProps {
  items: HealthCaseListItem[];
  loading?: boolean;
  error?: { message: string; onRetry?: () => void };
  emptyTitle: string;
  emptyDescription?: string;
}

/**
 * Health Operations Center case queue table (Phase 4, Prompt 11) — built on
 * the existing `Table` primitive, mirroring `EmergencyQueueTable`'s exact
 * loading/error/empty conventions. Columns match this task's own §13
 * required column list, limited to fields `HealthCaseListItem` (the real
 * API response shape) actually provides.
 */
export function HealthCaseTable({
  items,
  loading,
  error,
  emptyTitle,
  emptyDescription,
}: HealthCaseTableProps) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className={styles.skeletons} aria-busy="true" aria-label="Loading medical cases">
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

  const columns: TableColumn<HealthCaseListItem>[] = [
    {
      key: "student",
      header: "Student",
      render: (item) => (
        <div className={styles.studentCell}>
          <span className={styles.studentName}>{item.studentFullName}</span>
          <span className={styles.studentMeta}>{item.studentRollNumber}</span>
        </div>
      ),
    },
    {
      key: "hostel",
      header: "Hostel / Room",
      render: (item) => (
        <div className={styles.studentCell}>
          <span>{item.hostelName ?? "Not assigned"}</span>
          <span className={styles.studentMeta}>{item.roomNumber ?? "Room not assigned"}</span>
        </div>
      ),
    },
    {
      key: "category",
      header: "Medical Category",
      render: (item) => <span>{healthCaseCategoryLabel(item.category)}</span>,
    },
    {
      key: "priority",
      header: "Priority",
      render: (item) => <HealthCaseSeverityBadge severity={item.severity} />,
    },
    {
      key: "status",
      header: "Current Status",
      render: (item) => <HealthCaseStatusBadge status={item.status} />,
    },
    {
      key: "admittedAt",
      header: "Admission Time",
      render: (item) => (
        <span>{item.admittedAt ? new Date(item.admittedAt).toLocaleString() : "—"}</span>
      ),
    },
    {
      key: "latestUpdateAt",
      header: "Latest Update",
      render: (item) => <span>{new Date(item.latestUpdateAt).toLocaleString()}</span>,
    },
    {
      key: "action",
      header: "Action",
      render: (item) => (
        <Button
          type="button"
          variant="secondary"
          onClick={() => navigate(healthCaseDetailPath(item.id))}
        >
          Open
        </Button>
      ),
    },
  ];

  return (
    <Table
      columns={columns}
      rows={items}
      getRowKey={(item) => item.id}
      getRowProps={(item) => ({ "data-case-id": item.id })}
    />
  );
}
