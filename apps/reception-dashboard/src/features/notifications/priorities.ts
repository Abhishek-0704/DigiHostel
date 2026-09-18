import type { StatusTone } from "../../components/ui";
import type { NotificationPriority } from "./types";

export interface NotificationPriorityMeta {
  label: string;
  tone: StatusTone;
  /** Lower sorts first when sorting by priority (Prompt 6 §19). */
  weight: number;
}

/**
 * Priority metadata (Prompt 6 §9). Reuses the existing `StatusBadge` tone
 * vocabulary (never a new color system — §9's "do not create arbitrary new
 * color semantics" mirrors Prompt 4 §8's identical rule) so Critical/High
 * are visually distinguishable without inventing a sixth tone: Critical and
 * High both read as urgent (error/warning) while remaining textually
 * distinct, exactly matching §9's "never rely on color alone."
 */
export const NOTIFICATION_PRIORITY_META: Record<NotificationPriority, NotificationPriorityMeta> = {
  critical: { label: "Critical", tone: "error", weight: 0 },
  high: { label: "High", tone: "warning", weight: 1 },
  medium: { label: "Medium", tone: "info", weight: 2 },
  low: { label: "Low", tone: "neutral", weight: 3 },
  informational: { label: "Informational", tone: "neutral", weight: 4 },
};
