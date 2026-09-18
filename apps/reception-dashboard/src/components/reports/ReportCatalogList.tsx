import type { ReportDefinition, ReportId } from "../../services/reports/ReportService";
import { Card } from "../ui";
import styles from "./ReportCatalogList.module.css";

export interface ReportCatalogListProps {
  reports: ReportDefinition[];
  selectedReportId: ReportId | null;
  onSelect: (reportId: ReportId) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  operations: "Operations",
  leave: "Leave",
  movement: "Movement",
  safety: "Safety",
  notifications: "Notifications",
  compliance: "Compliance",
  administration: "Administration",
};

/** The fixed, server-owned report catalog (Phase 6, Prompt 16), grouped by
 * category. A report marked `unavailable` is shown honestly, with its
 * reason, rather than hidden (§37) — clicking it still selects it so the
 * builder panel can display the same reason prominently. */
export function ReportCatalogList({ reports, selectedReportId, onSelect }: ReportCatalogListProps) {
  const byCategory = new Map<string, ReportDefinition[]>();
  for (const report of reports) {
    const list = byCategory.get(report.category) ?? [];
    list.push(report);
    byCategory.set(report.category, list);
  }

  return (
    <nav className={styles.wrapper} aria-label="Report catalog">
      {Array.from(byCategory.entries()).map(([category, categoryReports]) => (
        <section key={category} className={styles.category}>
          <h3 className={styles.categoryHeading}>{CATEGORY_LABELS[category] ?? category}</h3>
          <ul className={styles.list}>
            {categoryReports.map((report) => (
              <li key={report.id}>
                <button
                  type="button"
                  className={styles.item}
                  aria-current={report.id === selectedReportId ? "true" : undefined}
                  onClick={() => onSelect(report.id)}
                >
                  <span className={styles.itemName}>{report.name}</span>
                  {report.status === "unavailable" ? (
                    <span className={styles.unavailableBadge}>Unavailable</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {reports.length === 0 ? (
        <Card className={styles.empty}>
          <p>No reports in the catalog.</p>
        </Card>
      ) : null}
    </nav>
  );
}
