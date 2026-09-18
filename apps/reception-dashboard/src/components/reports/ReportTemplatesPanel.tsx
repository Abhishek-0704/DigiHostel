import type { ReportTemplate } from "../../services/reports/ReportService";
import { Button, Skeleton, EmptyState, ErrorState } from "../ui";
import type { AppError } from "../../lib/errors/errors";
import styles from "./ReportTemplatesPanel.module.css";

export interface ReportTemplatesPanelProps {
  templates: ReportTemplate[];
  isLoading: boolean;
  error: AppError | null;
  onRetry: () => void;
  onLoad: (template: ReportTemplate) => void;
  onToggleFavorite: (template: ReportTemplate) => void;
  onDelete: (template: ReportTemplate) => void;
}

/** The caller's own saved report templates (Phase 6, Prompt 16 §15) —
 * personal, never organization-wide. Favourites are the same rows with
 * `isFavorite: true`, sorted first by the backend — no separate list. */
export function ReportTemplatesPanel({
  templates,
  isLoading,
  error,
  onRetry,
  onLoad,
  onToggleFavorite,
  onDelete,
}: ReportTemplatesPanelProps) {
  if (isLoading) return <Skeleton height={80} width="100%" />;
  if (error) return <ErrorState message={error.message} onRetry={onRetry} />;
  if (templates.length === 0) {
    return (
      <EmptyState
        title="No saved templates yet"
        description="Generate a report preview, then click Save as Template to reuse this configuration later."
      />
    );
  }

  return (
    <ul className={styles.list}>
      {templates.map((template) => (
        <li key={template.id} className={styles.item}>
          <button type="button" className={styles.loadButton} onClick={() => onLoad(template)}>
            {template.isFavorite ? <span aria-hidden="true">★ </span> : null}
            {template.name}
          </button>
          <div className={styles.actions}>
            <Button
              variant="secondary"
              onClick={() => onToggleFavorite(template)}
              aria-pressed={template.isFavorite}
            >
              {template.isFavorite ? "Unfavourite" : "Favourite"}
            </Button>
            <Button variant="secondary" onClick={() => onDelete(template)}>
              Delete
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
