import type { ActivityEventType, ActivityItemData } from "../../features/dashboard";
import styles from "./ActivityItem.module.css";

const EVENT_LABEL: Record<ActivityEventType, string> = {
  student_exit: "Student exited hostel",
  student_return: "Student returned",
  parent_approved: "Parent approved leave",
  parent_rejected: "Parent rejected leave",
  verification_completed: "Verification completed",
  emergency_alert: "Emergency alert",
  health_alert: "Health alert",
  audit_event: "Audit event",
};

export interface ActivityItemProps {
  item: ActivityItemData;
}

/** Reusable Recent Activity row (Prompt 5 §11/§26). Semantic chronological
 * markup (`<li>` inside an ordered list — newest first) with a real
 * `<time>` element, ready for a future module to emit real events into
 * (see `useActivityFeed`'s doc comment). */
export function ActivityItem({ item }: ActivityItemProps) {
  return (
    <li className={styles.item}>
      <span className={styles.type}>{EVENT_LABEL[item.type]}</span>
      <span className={styles.description}>{item.description}</span>
      <time className={styles.timestamp} dateTime={item.occurredAt}>
        {new Date(item.occurredAt).toLocaleString()}
      </time>
    </li>
  );
}
