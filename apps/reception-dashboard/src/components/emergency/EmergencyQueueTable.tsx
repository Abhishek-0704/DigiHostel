import { useNavigate } from "react-router-dom";
import { Table, EmptyState, ErrorState, Skeleton, Button } from "../ui";
import type { TableColumn } from "../ui";
import {
  EmergencySeverityBadge,
  EmergencyStatusBadge,
  emergencyCategoryLabel,
} from "./EmergencyBadges";
import { emergencyDetailPath } from "../../constants/routes";
import type { EmergencyListItem } from "@digihostel/api-client-react";
import styles from "./EmergencyQueueTable.module.css";

export interface EmergencyQueueTableProps {
  items: EmergencyListItem[];
  loading?: boolean;
  error?: { message: string; onRetry?: () => void };
  emptyTitle: string;
  emptyDescription?: string;
}

/**
 * Emergency Operations Center incident queue table (Phase 4, Prompt 10) —
 * built on the existing `Table` primitive, mirroring `StudentResultsTable`'s
 * exact loading/error/empty conventions. Columns are limited to fields
 * `EmergencyListItem` (the real API response shape) actually provides.
 */
export function EmergencyQueueTable({
  items,
  loading,
  error,
  emptyTitle,
  emptyDescription,
}: EmergencyQueueTableProps) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className={styles.skeletons} aria-busy="true" aria-label="Loading incidents">
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

  const columns: TableColumn<EmergencyListItem>[] = [
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
      key: "category",
      header: "Category",
      render: (item) => <span>{emergencyCategoryLabel(item.category)}</span>,
    },
    {
      key: "priority",
      header: "Priority",
      render: (item) => <EmergencySeverityBadge severity={item.severity} />,
    },
    {
      key: "hostel",
      header: "Hostel",
      render: (item) => (
        <div className={styles.studentCell}>
          <span>{item.hostelName ?? "Not assigned"}</span>
          <span className={styles.studentMeta}>{item.roomNumber ?? "Room not assigned"}</span>
        </div>
      ),
    },
    {
      key: "reportedAt",
      header: "Reported At",
      render: (item) => <span>{new Date(item.reportedAt).toLocaleString()}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (item) => <EmergencyStatusBadge status={item.status} />,
    },
    {
      key: "assignedStaff",
      header: "Assigned Staff",
      render: (item) => <span>{item.assignedStaffName ?? "Unassigned"}</span>,
    },
    {
      key: "action",
      header: "Action",
      render: (item) => (
        <Button
          type="button"
          variant="secondary"
          onClick={() => navigate(emergencyDetailPath(item.id))}
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
      getRowProps={(item) => ({ "data-incident-id": item.id })}
    />
  );
}
