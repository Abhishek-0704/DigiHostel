import { Card, Button, StatusBadge, Skeleton, ErrorState } from "../ui";
import { useDiagnostics } from "../../features/monitoring";
import styles from "./DiagnosticsPanel.module.css";

const STATUS_LABEL = { pass: "Pass", fail: "Fail", unavailable: "Unavailable" } as const;
const STATUS_TONE = { pass: "success", fail: "error", unavailable: "neutral" } as const;

/**
 * Diagnostics Center (Phase 7, Prompt 18 §17/§32). Every diagnostic id
 * rendered here comes directly from `GET /monitoring/diagnostics`'s own
 * fixed, server-owned catalog — this component never constructs or accepts
 * an arbitrary diagnostic id. Each check is read-only, bounded by the
 * backend's own timeout, and its execution is recorded in the existing
 * audit trail server-side (no client-visible audit action needed here).
 */
export function DiagnosticsPanel() {
  const { diagnostics, isLoading, error, results, runningId, runError, run } = useDiagnostics();

  return (
    <Card>
      <h2 className={styles.heading}>Diagnostics</h2>
      {isLoading ? (
        <Skeleton />
      ) : error ? (
        <ErrorState message={error.message} />
      ) : (
        <ul className={styles.list}>
          {diagnostics.map((d) => {
            const result = results[d.id];
            const isRunning = runningId === d.id;
            return (
              <li key={d.id} className={styles.item}>
                <div className={styles.itemHeader}>
                  <div>
                    <p className={styles.label}>{d.label}</p>
                    <p className={styles.description}>{d.description}</p>
                  </div>
                  <Button variant="secondary" onClick={() => void run(d.id)} loading={isRunning}>
                    {isRunning ? "Running…" : "Run"}
                  </Button>
                </div>
                {result && (
                  <div className={styles.result}>
                    <StatusBadge
                      label={STATUS_LABEL[result.status]}
                      tone={STATUS_TONE[result.status]}
                    />
                    <span className={styles.resultDetail}>{result.detail}</span>
                    <span className={styles.resultMeta}>
                      {result.durationMs}ms · {new Date(result.executedAt).toLocaleTimeString()}
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {runError && (
        <p role="alert" className={styles.runError}>
          {runError.message}
        </p>
      )}
    </Card>
  );
}
