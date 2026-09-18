import { Card, EmptyState } from "../ui";
import { usePendingWork } from "../../features/dashboard";
import { TaskItem } from "./TaskItem";
import styles from "./PendingWorkPanel.module.css";

/**
 * Pending Work panel (Prompt 5 §10). Shows real tasks in priority order the
 * instant `usePendingWork` has any to give it (see that hook's doc comment
 * for why it returns none today) — until then, an honest, specific empty
 * state, never a fabricated task list (§21/§34).
 */
export function PendingWorkPanel() {
  const { items } = usePendingWork();

  return (
    <Card className={styles.card}>
      <h2 className={styles.heading}>Pending Work</h2>
      {items.length === 0 ? (
        <EmptyState
          title="You're all caught up"
          description="Leave Management data will appear here when the module is connected (Phase 3)."
        />
      ) : (
        <ul className={styles.list}>
          {items.map((task) => (
            <TaskItem key={task.id} task={task} />
          ))}
        </ul>
      )}
    </Card>
  );
}
