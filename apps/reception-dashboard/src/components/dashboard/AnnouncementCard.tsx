import type { AnnouncementData } from "../../features/dashboard";
import styles from "./AnnouncementCard.module.css";

export interface AnnouncementCardProps {
  announcement: AnnouncementData;
}

/** Reusable Announcement row (Prompt 5 §12/§26) — not populated by real
 * data yet (no announcement service/table exists anywhere in this
 * repository), built now so a future announcement module only has to
 * supply `AnnouncementData`. */
export function AnnouncementCard({ announcement }: AnnouncementCardProps) {
  return (
    <li className={styles.item}>
      <span className={styles.title}>{announcement.title}</span>
      <p className={styles.body}>{announcement.body}</p>
      <time className={styles.timestamp} dateTime={announcement.publishedAt}>
        {new Date(announcement.publishedAt).toLocaleDateString()}
      </time>
    </li>
  );
}
