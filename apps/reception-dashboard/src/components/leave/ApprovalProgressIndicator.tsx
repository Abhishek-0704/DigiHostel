import { StatusBadge } from "../ui";
import { LeaveStatusBadge } from "./LeaveStatusBadge";
import type { LeaveRequestStatus } from "@digihostel/api-client-react";
import styles from "./ApprovalProgressIndicator.module.css";

export interface ApprovalProgressIndicatorProps {
  status: LeaveRequestStatus;
}

/**
 * Renders the two INDEPENDENT approval dimensions this queue must never
 * flatten into one status (Prompt 7A §18/§4 — the critical architectural
 * distinction between the DigiHostel Hostel-Leaving Request's own parent-
 * approval workflow and KIIT SAP's separate mentor-approved holiday/leave
 * information):
 *
 * - Parent Approval: the real, current `leave_requests.status` value.
 * - Mentor/SAP Approval: always shown as unavailable — this repository has
 *   no working SAP integration at all (confirmed by inspection; see
 *   `docs/leave-queue.md`'s SAP Integration Summary), so nothing here ever
 *   infers a mentor-approval state from the parent-approval status, and no
 *   `SAP_APPROVED`-shaped value is invented for `leave_requests` (an
 *   explicit prohibition — §4).
 */
export function ApprovalProgressIndicator({ status }: ApprovalProgressIndicatorProps) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.row}>
        <span className={styles.rowLabel}>Parent Approval</span>
        <LeaveStatusBadge status={status} />
      </div>
      <div className={styles.row}>
        <span className={styles.rowLabel}>Mentor/SAP Approval</span>
        <StatusBadge label="Not available — no SAP integration" tone="neutral" />
      </div>
    </div>
  );
}
