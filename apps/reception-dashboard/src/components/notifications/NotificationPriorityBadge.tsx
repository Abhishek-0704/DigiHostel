import { StatusBadge } from "../ui";
import { NOTIFICATION_PRIORITY_META } from "../../features/notifications/priorities";
import type { NotificationPriority } from "../../features/notifications/types";

export interface NotificationPriorityBadgeProps {
  priority: NotificationPriority;
}

/** Reuses `StatusBadge` (Prompt 0.2/4) rather than a competing badge
 * component (Prompt 6 §37 — "do not create duplicate versions of... Badge
 * if Prompt 4/shared UI already provides them"). Icon + text always
 * together, never color alone (§9). */
export function NotificationPriorityBadge({ priority }: NotificationPriorityBadgeProps) {
  const meta = NOTIFICATION_PRIORITY_META[priority];
  return <StatusBadge label={meta.label} tone={meta.tone} />;
}
