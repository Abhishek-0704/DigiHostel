import type { StatusTone } from "../../components/ui";
import type { NotificationLifecycleState } from "./types";

/**
 * Lifecycle-state metadata and predicates (Prompt 6 §10). Pure/presentation
 * only — this file does not perform any state TRANSITION (that's
 * `notificationService.ts`'s local-state mutations); it only labels and
 * classifies states already assigned to a notification.
 */
export const NOTIFICATION_STATE_LABEL: Record<NotificationLifecycleState, string> = {
  unread: "Unread",
  read: "Read",
  acknowledged: "Acknowledged",
  action_required: "Action required",
  completed: "Completed",
  expired: "Expired",
  dismissed: "Dismissed",
  archived: "Archived",
};

/** Reuses `StatusBadge`'s existing tone vocabulary — never a new color
 * system (§9's rule applied to lifecycle state too). */
export const NOTIFICATION_STATE_TONE: Record<NotificationLifecycleState, StatusTone> = {
  unread: "info",
  read: "neutral",
  acknowledged: "success",
  action_required: "warning",
  completed: "success",
  expired: "neutral",
  dismissed: "neutral",
  archived: "neutral",
};

/** States that should still count toward "needs attention" surfaces (the
 * unread badge, the Dashboard Home metric) — deliberately narrower than
 * "not dismissed/archived": a `read` notification is no longer unread but
 * may still require action. */
export function isUnread(state: NotificationLifecycleState): boolean {
  return state === "unread";
}

export function requiresAttention(state: NotificationLifecycleState): boolean {
  return state === "unread" || state === "action_required";
}

/** States a notification can still be acted on FROM — dismissed/archived/
 * expired/completed notifications are terminal for staff-facing action
 * purposes, even though the record itself is retained for history. */
export function isTerminalState(state: NotificationLifecycleState): boolean {
  return (
    state === "dismissed" || state === "archived" || state === "expired" || state === "completed"
  );
}
