import type { ReportHistoryEntry } from "../../services/reports/ReportService";
import { Skeleton, EmptyState, ErrorState } from "../ui";
import type { AppError } from "../../lib/errors/errors";
import styles from "./ReportHistoryPanel.module.css";

export interface ReportHistoryPanelProps {
  history: ReportHistoryEntry[];
  isLoading: boolean;
  error: AppError | null;
  onRetry: () => void;
}

/** The caller's own recent report executions (Phase 6, Prompt 16 §14) — a
 * minimal execution-history record only: which report, when, how many rows
 * it returned. Never a generated artifact (no file exists to list). */
export function ReportHistoryPanel({
  history,
  isLoading,
  error,
  onRetry,
}: ReportHistoryPanelProps) {
  if (isLoading) return <Skeleton height={80} width="100%" />;
  if (error) return <ErrorState message={error.message} onRetry={onRetry} />;
  if (history.length === 0) {
    return (
      <EmptyState
        title="No reports generated yet"
        description="Every report you generate this session (and in future sessions) will appear here."
      />
    );
  }

  return (
    <ul className={styles.list}>
      {history.map((entry) => (
        <li key={entry.id} className={styles.item}>
          <span className={styles.reportId}>{entry.reportId.replace(/_/g, " ")}</span>
          <span className={styles.meta}>
            {entry.rowCount} {entry.rowCount === 1 ? "row" : "rows"} ·{" "}
            {new Date(entry.generatedAt).toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  );
}
