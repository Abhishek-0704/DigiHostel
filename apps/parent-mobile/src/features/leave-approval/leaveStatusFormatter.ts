import type { LeaveApprovalPresentationStatus } from "./types";
import type { BadgeTone } from "../../components/ui/Badge";

/**
 * Leave status → label/tone formatting (Prompt 9A) — no React/RN import.
 * Tone is always paired with the label text itself in every consumer (never
 * color alone) — see `StatusBanner`-equivalent usage in the Leave Details
 * screen.
 */
export function leaveStatusLabel(status: LeaveApprovalPresentationStatus): string {
  switch (status) {
    case "awaiting_response":
      return "Awaiting your response";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "expired":
      return "Expired";
    default:
      return "Status unavailable";
  }
}

export function leaveStatusTone(status: LeaveApprovalPresentationStatus): BadgeTone {
  switch (status) {
    case "awaiting_response":
      return "warning";
    case "approved":
      return "success";
    case "rejected":
      return "error";
    case "expired":
      return "neutral";
    default:
      return "neutral";
  }
}
