import {
  getReportsCatalog,
  previewReport,
  listReportTemplates,
  createReportTemplate,
  updateReportTemplate,
  deleteReportTemplate,
  getReportHistory,
  type ReportId,
  type ReportPreviewRequest,
  type ReportTemplateCreateRequest,
  type ReportTemplateUpdateRequest,
} from "@digihostel/api-client-react";

/**
 * Enterprise Reporting Platform service (Phase 6, Prompt 16) — thin
 * transport wrapper, matching `AnalyticsService`/`AuditService`'s
 * established pattern exactly. The backend resolves the fixed report
 * catalog, hostel scope, and the `reports:view`/`reports:generate`
 * permission boundary entirely server-side; this service performs no
 * authorization, scoping, or field-validation of its own.
 */
export interface ReportService {
  getCatalog(): ReturnType<typeof getReportsCatalog>;
  preview(reportId: ReportId, request: ReportPreviewRequest): ReturnType<typeof previewReport>;
  listTemplates(): ReturnType<typeof listReportTemplates>;
  createTemplate(request: ReportTemplateCreateRequest): ReturnType<typeof createReportTemplate>;
  updateTemplate(
    templateId: string,
    request: ReportTemplateUpdateRequest,
  ): ReturnType<typeof updateReportTemplate>;
  deleteTemplate(templateId: string): ReturnType<typeof deleteReportTemplate>;
  getHistory(limit?: number): ReturnType<typeof getReportHistory>;
}

export const reportService: ReportService = {
  async getCatalog() {
    return getReportsCatalog();
  },
  async preview(reportId, request) {
    return previewReport(reportId, request);
  },
  async listTemplates() {
    return listReportTemplates();
  },
  async createTemplate(request) {
    return createReportTemplate(request);
  },
  async updateTemplate(templateId, request) {
    return updateReportTemplate(templateId, request);
  },
  async deleteTemplate(templateId) {
    return deleteReportTemplate(templateId);
  },
  async getHistory(limit) {
    return getReportHistory(limit !== undefined ? { limit } : undefined);
  },
};

export type {
  ReportId,
  ReportDefinition,
  ReportFieldDefinition,
  ReportFilterDefinition,
  ReportPreviewRequest,
  ReportPreviewResult,
  ReportFilters,
  ReportTemplate,
  ReportTemplateCreateRequest,
  ReportTemplateUpdateRequest,
  ReportHistoryEntry,
} from "@digihostel/api-client-react";
