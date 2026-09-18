import { LeaveRequestStatus } from "@digihostel/api-client-react";
import type { StatusTone } from "../../components/ui";

/**
 * UI presentation for the real `leave_request_status` enum (Prompt 7A §18).
 * A pure label/tone/stage-group lookup — never re-derives or renames the
 * backend's own vocabulary, and never invents a status the schema doesn't
 * have (§38 — no speculative status enum).
 */
export const LEAVE_STATUS_LABEL: Record<LeaveRequestStatus, string> = {
  pending: "Pending",
  father_notified: "Father notified",
  mother_notified: "Mother notified",
  guardian_notified: "Guardian notified",
  in_app_call: "In-app call",
  manual_verification: "Manual verification",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
};

export const LEAVE_STATUS_TONE: Record<LeaveRequestStatus, StatusTone> = {
  pending: "neutral",
  father_notified: "info",
  mother_notified: "info",
  guardian_notified: "info",
  in_app_call: "warning",
  manual_verification: "warning",
  approved: "success",
  rejected: "error",
  expired: "error",
};

/** Queue Summary bucket grouping (Prompt 7A §11) — every real status maps to
 * exactly one bucket, so summary counts always add up to the queue's own
 * total (no status is double-counted or silently dropped). */
export type QueueStageBucket = "pending" | "escalating" | "manual_verification" | "resolved";

export const LEAVE_STATUS_STAGE_BUCKET: Record<LeaveRequestStatus, QueueStageBucket> = {
  pending: "pending",
  father_notified: "escalating",
  mother_notified: "escalating",
  guardian_notified: "escalating",
  in_app_call: "escalating",
  manual_verification: "manual_verification",
  approved: "resolved",
  rejected: "resolved",
  expired: "resolved",
};
