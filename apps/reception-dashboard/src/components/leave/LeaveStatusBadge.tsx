import { StatusBadge } from "../ui";
import { LEAVE_STATUS_LABEL, LEAVE_STATUS_TONE } from "../../features/leave";
import type { LeaveRequestStatus } from "@digihostel/api-client-react";

export interface LeaveStatusBadgeProps {
  status: LeaveRequestStatus;
}

/** Thin `StatusBadge` wrapper (Prompt 7A §30) — reuses the existing
 * icon+text, never-color-only primitive rather than a duplicate, matching
 * `NotificationPriorityBadge`/`NotificationCategoryBadge`'s established
 * pattern exactly. */
export function LeaveStatusBadge({ status }: LeaveStatusBadgeProps) {
  return <StatusBadge label={LEAVE_STATUS_LABEL[status]} tone={LEAVE_STATUS_TONE[status]} />;
}
