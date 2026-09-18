import { useNavigate } from "react-router-dom";
import { StatusBadge, type StatusTone } from "../ui";
import type { TaskItemData, TaskPriority } from "../../features/dashboard";
import styles from "./TaskItem.module.css";

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  critical: "Critical",
  time_sensitive: "Time-sensitive",
  waiting: "Waiting",
  informational: "Informational",
};

const PRIORITY_TONE: Record<TaskPriority, StatusTone> = {
  critical: "error",
  time_sensitive: "warning",
  waiting: "info",
  informational: "neutral",
};

export interface TaskItemProps {
  task: TaskItemData;
}

/** Reusable Pending Work row (Prompt 5 §10/§26). Not used by real data yet
 * (see `usePendingWork`'s doc comment) but built now so a future prompt only
 * has to supply `TaskItemData` — this component already renders it fully,
 * including navigation and non-color-only priority semantics (§8/§29). */
export function TaskItem({ task }: TaskItemProps) {
  const navigate = useNavigate();

  const body = (
    <>
      <div className={styles.main}>
        <span className={styles.title}>{task.title}</span>
        {task.description && <span className={styles.description}>{task.description}</span>}
      </div>
      <div className={styles.meta}>
        <StatusBadge label={PRIORITY_LABEL[task.priority]} tone={PRIORITY_TONE[task.priority]} />
        {task.occurredAt && (
          <time className={styles.timestamp} dateTime={task.occurredAt}>
            {new Date(task.occurredAt).toLocaleString()}
          </time>
        )}
      </div>
    </>
  );

  if (task.route) {
    return (
      <li className={styles.item}>
        <button
          type="button"
          className={styles.actionable}
          onClick={() => navigate(task.route as string)}
        >
          {body}
        </button>
      </li>
    );
  }

  return (
    <li className={styles.item}>
      <div className={styles.actionable}>{body}</div>
    </li>
  );
}
