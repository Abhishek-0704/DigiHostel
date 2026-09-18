import { StatusBadge } from "../ui";
import { NOTIFICATION_CATEGORY_META } from "../../features/notifications/categories";
import type { NotificationCategory } from "../../features/notifications/types";

export interface NotificationCategoryBadgeProps {
  category: NotificationCategory;
}

/** Reuses `StatusBadge` at a neutral tone — category is a classification,
 * not an urgency signal, so it never competes visually with
 * `NotificationPriorityBadge` (Prompt 6 §8/§37). */
export function NotificationCategoryBadge({ category }: NotificationCategoryBadgeProps) {
  const meta = NOTIFICATION_CATEGORY_META[category];
  return <StatusBadge label={meta.label} tone="neutral" />;
}
