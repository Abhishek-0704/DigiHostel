import { useAuditLog } from "../../features/audit/useAuditLog";
import { Card, Skeleton, ErrorState, EmptyState } from "../ui";
import styles from "./PersonalActivityPanel.module.css";

export interface PersonalActivityPanelProps {
  staffId: string;
  staffRole: "reception_warden" | "hostel_admin" | "library_incharge" | "super_admin";
}

/**
 * Personal Activity (Phase 7, Prompt 17, §15) — a filtered, personalized
 * presentation of the SAME authoritative `audit_logs` trail the Enterprise
 * Audit Center already reads (`GET /audit?actorId=<self>`), never a second
 * audit/activity system. `GET /audit` is staff-only for
 * reception_warden/hostel_admin/super_admin (`audit:view`,
 * `routes/audit.ts`) — `library_incharge` has no grant on it at all, for
 * ANY reason, not just self-scoped, so this panel honestly reports
 * unavailability for that one role rather than silently showing nothing or
 * fabricating a workaround.
 */
export function PersonalActivityPanel({ staffId, staffRole }: PersonalActivityPanelProps) {
  if (staffRole === "library_incharge") {
    return (
      <Card id="section-activity" className={styles.section}>
        <h2 className={styles.title}>Personal Activity</h2>
        <p className={styles.unavailable}>
          Personal activity history is not available for your role.
        </p>
      </Card>
    );
  }
  return <PersonalActivityList staffId={staffId} />;
}

function PersonalActivityList({ staffId }: { staffId: string }) {
  const { result, isLoading, error } = useAuditLog({
    actorId: staffId,
    page: 1,
    pageSize: 20,
    sortDir: "desc",
  });

  return (
    <Card id="section-activity" className={styles.section}>
      <h2 className={styles.title}>Personal Activity</h2>
      {isLoading && <Skeleton height={160} width="100%" />}
      {error && <ErrorState message={error.userMessage} />}
      {!isLoading && !error && result && result.items.length === 0 && (
        <EmptyState title="No recent activity" description="Actions you take will appear here." />
      )}
      {!isLoading && !error && result && result.items.length > 0 && (
        <ul className={styles.list}>
          {result.items.map((item) => (
            <li key={item.id} className={styles.item}>
              <span className={styles.action}>{item.action}</span>
              <span className={styles.time}>{new Date(item.occurredAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
