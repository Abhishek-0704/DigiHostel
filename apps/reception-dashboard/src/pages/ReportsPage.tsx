import { useMemo, useState } from "react";
import { ContentLayout } from "../layouts/ContentLayout";
import { getBreadcrumbTrail } from "../lib/navigation/navigationConfig";
import { useAuthorization } from "../contexts/AuthorizationContext";
import { Card, Button, useToast } from "../components/ui";
import {
  useReportCatalog,
  useReportPreview,
  useReportTemplates,
  useReportHistory,
} from "../features/reports";
import {
  ReportCatalogList,
  ReportFilterPanel,
  ReportFieldSelector,
  ReportResultTable,
  SaveTemplateDialog,
  ReportTemplatesPanel,
  ReportHistoryPanel,
} from "../components/reports";
import type { ReportId, ReportFilters, ReportTemplate } from "../services/reports/ReportService";
import styles from "./ReportsPage.module.css";

/**
 * Enterprise Reporting Platform (Phase 6, Prompt 16), replacing Prompt
 * 0.2's "Future scope" placeholder. Reuses the existing `reports:view`/
 * `reports:generate` permission gate (`routes/index.tsx`, unchanged) —
 * this page is only ever mounted for `hostel_admin`/`super_admin`,
 * matching the backend's own `requireStaffRole("hostel_admin",
 * "super_admin")` boundary on every `/reports/*` route.
 *
 * A pure read-model presentation layer: every report definition, field,
 * filter, and row comes from the server-owned catalog and a bounded,
 * server-validated preview — this page performs no calculation of its own
 * and accepts no arbitrary field/table/SQL input. Distinct from the
 * Operational Intelligence Dashboard (Phase 6, Prompt 15): that page is an
 * interactive, always-current KPI dashboard; this page is a catalog of
 * standardized, configurable, reproducible reports with filters, field
 * selection, saved templates, and execution history — no export/PDF/
 * scheduling capability is implemented (Prompt 16's own explicit scope
 * boundary).
 */
export default function ReportsPage() {
  const { role } = useAuthorization();
  const { showToast } = useToast();

  const catalog = useReportCatalog();
  const preview = useReportPreview();
  const templates = useReportTemplates();
  const history = useReportHistory();

  const [selectedReportId, setSelectedReportId] = useState<ReportId | null>(null);
  const [filters, setFilters] = useState<ReportFilters>({});
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const selectedReport = useMemo(
    () => catalog.reports.find((r) => r.id === selectedReportId) ?? null,
    [catalog.reports, selectedReportId],
  );

  function handleSelectReport(reportId: ReportId) {
    setSelectedReportId(reportId);
    setFilters({});
    setSelectedFields([]);
    preview.reset();
  }

  async function handleGenerate() {
    if (!selectedReport || selectedReport.status === "unavailable") return;
    await preview.generate(selectedReport.id, {
      reportId: selectedReport.id,
      filters,
      selectedFields: selectedFields.length > 0 ? selectedFields : undefined,
      page: 1,
      pageSize: 20,
    });
    await history.refresh();
  }

  async function handleSaveTemplate(name: string, isFavorite: boolean) {
    if (!selectedReport) return;
    setSaving(true);
    setSaveError(undefined);
    try {
      await templates.create({
        reportId: selectedReport.id,
        name,
        filters,
        selectedFields,
        isFavorite,
      });
      setSaveDialogOpen(false);
      showToast({ variant: "success", message: "Template saved." });
    } catch {
      setSaveError("Could not save this template — the name may already be in use.");
    } finally {
      setSaving(false);
    }
  }

  function handleLoadTemplate(template: ReportTemplate) {
    setSelectedReportId(template.reportId);
    setFilters(template.filters);
    setSelectedFields(template.selectedFields);
    preview.reset();
    showToast({ variant: "success", message: `Loaded "${template.name}".` });
  }

  async function handleToggleFavorite(template: ReportTemplate) {
    await templates.update(template.id, { isFavorite: !template.isFavorite });
  }

  async function handleDeleteTemplate(template: ReportTemplate) {
    await templates.remove(template.id);
    showToast({ variant: "success", message: "Template deleted." });
  }

  return (
    <ContentLayout
      title="Enterprise Reporting"
      description="Standardized, configurable reports over Leave, Movement, Emergency, Health, Notification, and Audit activity within your authorized scope."
      breadcrumb={getBreadcrumbTrail("reports")}
      width="full"
      actions={
        <span className={styles.scopeIndicator}>
          {role === "super_admin" ? "All hostels" : "Hostel-scoped"}
        </span>
      }
    >
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <Card className={styles.sidebarCard}>
            <h2 className={styles.sidebarHeading}>Report Catalog</h2>
            <ReportCatalogList
              reports={catalog.reports}
              selectedReportId={selectedReportId}
              onSelect={handleSelectReport}
            />
          </Card>
          <Card className={styles.sidebarCard}>
            <h2 className={styles.sidebarHeading}>My Templates</h2>
            <ReportTemplatesPanel
              templates={templates.templates}
              isLoading={templates.isLoading}
              error={templates.error}
              onRetry={() => void templates.refresh()}
              onLoad={handleLoadTemplate}
              onToggleFavorite={(t) => void handleToggleFavorite(t)}
              onDelete={(t) => void handleDeleteTemplate(t)}
            />
          </Card>
          <Card className={styles.sidebarCard}>
            <h2 className={styles.sidebarHeading}>Recent Reports</h2>
            <ReportHistoryPanel
              history={history.history}
              isLoading={history.isLoading}
              error={history.error}
              onRetry={() => void history.refresh()}
            />
          </Card>
        </aside>

        <section className={styles.main}>
          {!selectedReport ? (
            <Card className={styles.placeholderCard}>
              <p>Select a report from the catalog to configure and generate a preview.</p>
            </Card>
          ) : (
            <Card className={styles.builderCard}>
              <h2 className={styles.reportName}>{selectedReport.name}</h2>
              <p className={styles.reportDescription}>{selectedReport.description}</p>

              {selectedReport.status === "unavailable" ? (
                <p role="alert" className={styles.unavailableNotice}>
                  {selectedReport.unavailableReason}
                </p>
              ) : (
                <>
                  <ReportFilterPanel
                    availableFilters={selectedReport.availableFilters}
                    value={filters}
                    onChange={setFilters}
                  />
                  <ReportFieldSelector
                    availableFields={selectedReport.availableFields}
                    selectedFields={selectedFields}
                    onChange={setSelectedFields}
                  />
                  <div className={styles.builderActions}>
                    <Button
                      variant="primary"
                      onClick={() => void handleGenerate()}
                      disabled={preview.isLoading}
                    >
                      {preview.isLoading ? "Generating…" : "Generate Preview"}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setSaveDialogOpen(true)}
                      disabled={!preview.result}
                    >
                      Save as Template
                    </Button>
                  </div>

                  <ReportResultTable
                    result={preview.result}
                    isLoading={preview.isLoading}
                    error={preview.error}
                    onRetry={() => void handleGenerate()}
                  />
                </>
              )}
            </Card>
          )}
        </section>
      </div>

      <SaveTemplateDialog
        open={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        onSave={handleSaveTemplate}
        saving={saving}
        error={saveError}
      />

      <p className={styles.deferredNote}>
        Export to PDF/Excel/CSV, scheduled report delivery, and organization-wide shared templates
        are not implemented — see the Enterprise Reporting documentation for the full list of
        deferred capabilities.
      </p>
    </ContentLayout>
  );
}
