import { Card, EmptyState } from "../ui";
import { useActivityFeed } from "../../features/dashboard";
import { ActivityItem } from "./ActivityItem";
import styles from "./ActivityFeed.module.css";

/**
 * Recent Activity panel (Prompt 5 §11). Renders real events, newest first,
 * the instant `useActivityFeed` has any (see that hook's doc comment for
 * why it returns none today) — an honest empty state otherwise, never
 * fabricated production-looking events (§11/§34's explicit rule).
 */
export function ActivityFeed() {
  const { items } = useActivityFeed();

  return (
    <Card className={styles.card}>
      <h2 className={styles.heading}>Recent Activity</h2>
      {items.length === 0 ? (
        <EmptyState
          title="No recent activity"
          description="Activity will appear here as operational events become available."
        />
      ) : (
        <ol className={styles.list}>
          {items.map((item) => (
            <ActivityItem key={item.id} item={item} />
          ))}
        </ol>
      )}
    </Card>
  );
}
