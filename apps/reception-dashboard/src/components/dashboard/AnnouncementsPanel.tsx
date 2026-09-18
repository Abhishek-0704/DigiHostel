import { Card, EmptyState } from "../ui";
import { useAnnouncements } from "../../features/dashboard";
import { AnnouncementCard } from "./AnnouncementCard";
import styles from "./AnnouncementsPanel.module.css";

/**
 * Announcements panel (Prompt 5 §12). No announcement service exists
 * anywhere in this repository (`useAnnouncements`'s doc comment) — this
 * renders only the presentation shell and an honest empty state, never an
 * announcement-management system or a new database table (§12/§37).
 */
export function AnnouncementsPanel() {
  const { items } = useAnnouncements();

  return (
    <Card className={styles.card}>
      <h2 className={styles.heading}>Announcements</h2>
      {items.length === 0 ? (
        <EmptyState
          title="No announcements available"
          description="Announcements will appear here when the announcement service is connected."
        />
      ) : (
        <ul className={styles.list}>
          {items.map((announcement) => (
            <AnnouncementCard key={announcement.id} announcement={announcement} />
          ))}
        </ul>
      )}
    </Card>
  );
}
