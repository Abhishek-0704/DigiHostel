import type { ReportPreviewResult } from "../../services/reports/ReportService";
import { Table, type TableColumn, Skeleton, ErrorState, EmptyState } from "../ui";
import type { AppError } from "../../lib/errors/errors";
import styles from "./ReportResultTable.module.css";

export interface ReportResultTableProps {
  result: ReportPreviewResult | null;
  isLoading: boolean;
  error: AppError | null;
  onRetry: () => void;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function isIsoDateTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value);
}

function formatSummaryValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "string" && isIsoDateTime(value)) {
    return new Date(value).toLocaleString();
  }
  return String(value);
}

/** Renders a bounded report preview (Phase 6, Prompt 16 §12) — either a
 * row-list report (a real `Table` built from the report's own returned
 * `columns`) or the single-row Operational Summary report (a flat
 * key/value summary, since it has no `columns`/`rows` shape at all). Never
 * loads an unbounded dataset — `result.rows` is already the server's own
 * bounded page. */
export function ReportResultTable({ result, isLoading, error, onRetry }: ReportResultTableProps) {
  if (isLoading) {
    return (
      <div aria-busy="true" aria-label="Loading report results" className={styles.loading}>
        <Skeleton height={220} width="100%" />
      </div>
    );
  }
  if (error) {
    return <ErrorState message={error.message} onRetry={onRetry} />;
  }
  if (!result) {
    return (
      <EmptyState
        title="No report generated yet"
        description="Choose a report, adjust the filters if needed, then click Generate Preview."
      />
    );
  }
  if (result.summary) {
    return (
      <dl className={styles.summaryGrid}>
        {Object.entries(result.summary).map(([key, value]) => (
          <div key={key} className={styles.summaryItem}>
            <dt className={styles.summaryKey}>{key}</dt>
            <dd className={styles.summaryValue}>
              {typeof value === "object" && value !== null ? (
                <pre className={styles.summaryJson}>{JSON.stringify(value, null, 2)}</pre>
              ) : (
                formatSummaryValue(value)
              )}
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  if (result.rows.length === 0) {
    return (
      <EmptyState
        title="No data for this selection"
        description="No rows matched the selected filters and date range."
      />
    );
  }

  const columns: TableColumn<Record<string, unknown>>[] = result.columns.map((col) => ({
    key: col.id,
    header: col.label,
    render: (row) => formatCell(row[col.id]),
  }));

  return (
    <div>
      <p className={styles.summaryLine}>
        {result.total} matching {result.total === 1 ? "row" : "rows"} — showing page {result.page}
        {result.periodFrom && result.periodTo ? (
          <>
            {" "}
            for {new Date(result.periodFrom).toLocaleDateString()} –{" "}
            {new Date(result.periodTo).toLocaleDateString()}
          </>
        ) : null}
      </p>
      <Table
        columns={columns}
        rows={result.rows}
        getRowKey={(row) => JSON.stringify(row)}
        emptyMessage="No data for this selection."
      />
    </div>
  );
}
