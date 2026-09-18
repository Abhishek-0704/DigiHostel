import { Table, EmptyState, ErrorState, Skeleton, Button } from "../ui";
import type { TableColumn } from "../ui";
import { LeaveStatusBadge } from "./LeaveStatusBadge";
import { WaitingTimeIndicator } from "./WaitingTimeIndicator";
import type { LeaveQueueItem } from "../../features/leave";
import styles from "./LeaveRequestTable.module.css";

export interface LeaveRequestTableProps {
  items: LeaveQueueItem[];
  activeId: string | null;
  onOpen: (id: string) => void;
  loading?: boolean;
  error?: { message: string; onRetry?: () => void };
  emptyTitle: string;
  emptyDescription?: string;
}

/**
 * Reception Leave Request Queue table (Prompt 7A §12/§30) — built on the
 * existing `Table` primitive (accessible semantic `<table>`, Prompt 0.2)
 * rather than a bespoke grid. Columns are limited to fields that genuinely
 * exist on `StaffLeaveQueueItem` (§12's own rule: "only display fields
 * that actually exist... do not fabricate assigned staff/priority/
 * destination"). No "Priority"/"Assigned Staff"/"Destination" column is
 * shown — none of those fields exist anywhere in this data model, and
 * inventing one here would be exactly the fabrication §12 forbids.
 *
 * Row selection for keyboard/focus purposes is handled entirely by
 * `data-leave-request-id` (read back by `LeaveQueuePage` to restore focus
 * when the detail panel closes) — mirrors the Notification Center's
 * identical `data-notification-id` pattern.
 */
export function LeaveRequestTable({
  items,
  activeId,
  onOpen,
  loading,
  error,
  emptyTitle,
  emptyDescription,
}: LeaveRequestTableProps) {
  if (loading) {
    return (
      <div className={styles.skeletons} aria-busy="true" aria-label="Loading leave requests">
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

  const columns: TableColumn<LeaveQueueItem>[] = [
    {
      key: "student",
      header: "Student",
      render: (item) => (
        <div className={styles.studentCell}>
          <span className={styles.studentName}>{item.studentFullName}</span>
          <span className={styles.studentMeta}>
            {item.studentRollNumber}
            {item.studentHostelName ? ` · ${item.studentHostelName}` : ""}
            {item.studentRoomNumber ? ` · Room ${item.studentRoomNumber}` : ""}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (item) => <LeaveStatusBadge status={item.status} />,
    },
    {
      key: "dates",
      header: "Leave Period",
      render: (item) => (
        <span className={styles.dateRange}>
          {item.startDate} – {item.endDate}
        </span>
      ),
    },
    {
      key: "waiting",
      header: "Waiting",
      render: (item) => <WaitingTimeIndicator createdAt={item.createdAt} />,
    },
    {
      key: "action",
      header: "Action",
      render: (item) => (
        <Button
          type="button"
          variant="secondary"
          className={styles.viewButton}
          onClick={() => onOpen(item.id)}
          aria-current={activeId === item.id ? "true" : undefined}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <Table
      columns={columns}
      rows={items}
      getRowKey={(item) => item.id}
      getRowProps={(item) => ({
        "data-leave-request-id": item.id,
        className: item.id === activeId ? styles.activeRow : undefined,
      })}
    />
  );
}
