import { LeaveIcon } from "../../components/icons";
import { LEAVE_STATUS_STAGE_BUCKET } from "./statusPresentation";
import type { LeaveQueueItem } from "./types";
import type { MetricCardData } from "../dashboard";

/**
 * Queue Summary metrics (Prompt 7A §11) — every count here is derived
 * directly from the already-fetched, already-authorized queue dataset, never
 * a separate statistics endpoint (§11's own explicit preference: "prefer
 * derived statistics from the queue dataset/API rather than duplicating data
 * sources... avoid creating new statistics endpoints unless there is a
 * demonstrated architectural need" — none exists here). Every metric is
 * classified `"real"`: each is genuine arithmetic over real, currently-
 * visible rows, not a fabricated number.
 *
 * "Completed Today" uses `updatedAt` (the timestamp of the transition INTO
 * a terminal status) compared against the caller's own local calendar day —
 * an honest, if timezone-naive, definition; a future prompt could refine
 * this once "today" has a server-defined meaning (hostel-local timezone),
 * which nothing in this repository currently establishes.
 */
export interface LeaveQueueSummaryCounts {
  pending: number;
  escalating: number;
  manualVerification: number;
  completedToday: number;
  total: number;
}

export function computeLeaveQueueSummary(
  items: readonly LeaveQueueItem[],
  now: Date,
): LeaveQueueSummaryCounts {
  const todayKey = now.toDateString();
  let pending = 0;
  let escalating = 0;
  let manualVerification = 0;
  let completedToday = 0;

  for (const item of items) {
    const bucket = LEAVE_STATUS_STAGE_BUCKET[item.status];
    if (bucket === "pending") pending += 1;
    else if (bucket === "escalating") escalating += 1;
    else if (bucket === "manual_verification") manualVerification += 1;
    else if (bucket === "resolved" && new Date(item.updatedAt).toDateString() === todayKey) {
      completedToday += 1;
    }
  }

  return { pending, escalating, manualVerification, completedToday, total: items.length };
}

export function leaveQueueSummaryMetrics(counts: LeaveQueueSummaryCounts): MetricCardData[] {
  return [
    {
      id: "queue-pending",
      label: "Pending",
      value: counts.pending,
      availability: "real",
      tone: "neutral",
      icon: LeaveIcon,
    },
    {
      id: "queue-escalating",
      label: "In Progress (Parent Notification)",
      value: counts.escalating,
      availability: "real",
      tone: "info",
      icon: LeaveIcon,
    },
    {
      id: "queue-manual-verification",
      label: "Manual Verification",
      value: counts.manualVerification,
      availability: "real",
      tone: "warning",
      icon: LeaveIcon,
    },
    {
      id: "queue-completed-today",
      label: "Completed Today",
      value: counts.completedToday,
      availability: "real",
      tone: "success",
      icon: LeaveIcon,
    },
  ];
}
