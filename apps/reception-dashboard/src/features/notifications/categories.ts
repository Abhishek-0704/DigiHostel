import type { ComponentType } from "react";
import {
  LeaveIcon,
  StudentsIcon,
  EmergencyIcon,
  HealthIcon,
  SystemIcon,
  AdminIcon,
  BellIcon,
  AuditIcon,
  type IconProps,
} from "../../components/icons";
import type { NotificationCategory } from "./types";

export interface NotificationCategoryMeta {
  label: string;
  icon: ComponentType<IconProps>;
}

/**
 * Category metadata (Prompt 6 §8). Extensible by construction — a future
 * category only needs one new entry here (plus a value added to
 * `NOTIFICATION_CATEGORIES` in `types.ts`); nothing about `NotificationCard`/
 * `NotificationCategoryBadge` needs to change. No business logic lives
 * here — this is presentation metadata only (label + icon), never a
 * category-specific behavior branch.
 */
export const NOTIFICATION_CATEGORY_META: Record<NotificationCategory, NotificationCategoryMeta> = {
  parent_approval: { label: "Parent Approval", icon: LeaveIcon },
  student_verification: { label: "Student Verification", icon: StudentsIcon },
  student_return: { label: "Student Return", icon: StudentsIcon },
  student_exit: { label: "Student Exit", icon: StudentsIcon },
  emergency: { label: "Emergency", icon: EmergencyIcon },
  health: { label: "Health", icon: HealthIcon },
  system: { label: "System", icon: SystemIcon },
  administrative: { label: "Administrative", icon: AdminIcon },
  security: { label: "Security", icon: EmergencyIcon },
  announcement: { label: "Announcement", icon: BellIcon },
  audit: { label: "Audit", icon: AuditIcon },
};
