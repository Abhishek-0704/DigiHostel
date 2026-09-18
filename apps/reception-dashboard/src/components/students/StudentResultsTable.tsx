import { useNavigate } from "react-router-dom";
import { Table, EmptyState, ErrorState, Skeleton, Button } from "../ui";
import type { TableColumn } from "../ui";
import { studentProfilePath } from "../../constants/routes";
import type { StudentSearchResultItem } from "@digihostel/api-client-react";
import styles from "./StudentResultsTable.module.css";

export interface StudentResultsTableProps {
  items: StudentSearchResultItem[];
  loading?: boolean;
  error?: { message: string; onRetry?: () => void };
  emptyTitle: string;
  emptyDescription?: string;
}

/**
 * Student Operations Center results table (Phase 4, Prompt 8) — built on
 * the existing `Table` primitive, mirroring `LeaveRequestTable`'s exact
 * shape/loading/error/empty conventions. Columns are limited to fields that
 * genuinely exist on `StudentSearchResultItem`: name, roll number, hostel,
 * room. No photograph/department/program/current-status/current-location
 * column is shown — none of those fields exist anywhere in the
 * authoritative `students` schema (see
 * apps/reception-dashboard/docs/student-operations.md §2), and inventing
 * one here would be exactly the fabrication this task's No-Fabrication
 * Rule forbids. Leave status is deliberately NOT a list column either —
 * showing it here would require joining leave_requests into every search
 * result row on every keystroke; it is shown once, on the profile page,
 * where a single row's full leave history is already being fetched.
 */
export function StudentResultsTable({
  items,
  loading,
  error,
  emptyTitle,
  emptyDescription,
}: StudentResultsTableProps) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className={styles.skeletons} aria-busy="true" aria-label="Loading students">
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

  const columns: TableColumn<StudentSearchResultItem>[] = [
    {
      key: "student",
      header: "Student",
      render: (item) => (
        <div className={styles.studentCell}>
          <span className={styles.studentName}>{item.fullName}</span>
          <span className={styles.studentMeta}>{item.rollNumber}</span>
        </div>
      ),
    },
    {
      key: "hostel",
      header: "Hostel",
      render: (item) => <span>{item.hostelName ?? "Not assigned"}</span>,
    },
    {
      key: "room",
      header: "Room",
      render: (item) => <span>{item.roomNumber ?? "Not assigned"}</span>,
    },
    {
      key: "action",
      header: "Action",
      render: (item) => (
        <Button
          type="button"
          variant="secondary"
          onClick={() => navigate(studentProfilePath(item.rollNumber))}
        >
          View Profile
        </Button>
      ),
    },
  ];

  return (
    <Table
      columns={columns}
      rows={items}
      getRowKey={(item) => item.id}
      getRowProps={(item) => ({ "data-student-id": item.id })}
    />
  );
}
