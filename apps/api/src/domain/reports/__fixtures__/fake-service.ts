import type { ReportsServicePort } from "../service.js";
import type {
  ReportDefinition,
  ReportId,
  ReportPreviewInput,
  ReportPreviewResult,
  ReportTemplateView,
  ReportTemplateCreateInput,
  ReportTemplateUpdateInput,
  ReportTemplateMutationOutcome,
  ReportHistoryEntryView,
  StaffScopeInput,
} from "../types.js";

const REAL_CATALOG: readonly ReportDefinition[] = [
  {
    id: "operational_summary",
    name: "Operational Summary",
    category: "operations",
    description: "test",
    status: "implemented",
    availableFields: [],
    availableFilters: [{ id: "dateRange", label: "Date range", type: "date_range" }],
    sortFields: [],
    defaultSortField: "",
    isPaginated: false,
  },
  {
    id: "leave_authorization",
    name: "Leave Authorization Report",
    category: "leave",
    description: "test",
    status: "implemented",
    availableFields: [
      { id: "studentRollNumber", label: "Roll Number" },
      { id: "status", label: "Status" },
    ],
    availableFilters: [
      { id: "dateRange", label: "Date range", type: "date_range" },
      { id: "statuses", label: "Status", type: "multi_select", options: ["pending", "approved"] },
    ],
    sortFields: [{ id: "createdAt", label: "Created" }],
    defaultSortField: "createdAt",
    isPaginated: true,
  },
  {
    id: "hostel_occupancy",
    name: "Hostel Occupancy Report",
    category: "operations",
    description: "test",
    status: "unavailable",
    unavailableReason: "No capacity data exists.",
    availableFields: [],
    availableFilters: [],
    sortFields: [],
    defaultSortField: "",
    isPaginated: false,
  },
];

/**
 * In-memory fake, mirroring `FakeAnalyticsRepository`'s established shape —
 * used by routes/reports.test.ts to exercise the route/auth/hostel-scope/
 * validation layer without a real Postgres connection or the four other
 * domain services `ReportsService` normally composes. The real
 * reuse-wiring and aggregate-query behavior is exercised separately by
 * repository.integration.test.ts.
 */
export class FakeReportsService implements ReportsServicePort {
  previewCalls: ReportPreviewInput[] = [];
  recordExecutionCalls: Array<{
    scope: StaffScopeInput & { hostelScopeId: string | null };
    reportId: ReportId;
    filtersSummary: ReportPreviewInput["filters"];
    rowCount: number;
  }> = [];
  templates: ReportTemplateView[] = [];
  history: ReportHistoryEntryView[] = [];
  nextPreview: ReportPreviewResult = {
    reportId: "leave_authorization",
    generatedAt: "2026-01-01T00:00:00.000Z",
    periodFrom: "2026-01-01T00:00:00.000Z",
    periodTo: "2026-01-07T23:59:59.999Z",
    columns: [{ id: "studentRollNumber", label: "Roll Number" }],
    rows: [],
    summary: null,
    total: 0,
    page: 1,
    pageSize: 20,
  };

  getCatalog(): ReportDefinition[] {
    return REAL_CATALOG.map((d) => ({ ...d }));
  }

  async preview(input: ReportPreviewInput): Promise<ReportPreviewResult> {
    this.previewCalls.push(input);
    return {
      ...this.nextPreview,
      reportId: input.reportId,
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  async recordExecution(
    scope: StaffScopeInput & { hostelScopeId: string | null },
    reportId: ReportId,
    filtersSummary: ReportPreviewInput["filters"],
    rowCount: number,
  ): Promise<void> {
    this.recordExecutionCalls.push({ scope, reportId, filtersSummary, rowCount });
  }

  async listTemplates(scope: StaffScopeInput): Promise<ReportTemplateView[]> {
    return this.templates.filter(() => scope.staffId !== "");
  }

  async createTemplate(input: ReportTemplateCreateInput): Promise<ReportTemplateMutationOutcome> {
    if (this.templates.some((t) => t.name === input.name)) {
      return { kind: "duplicate_name" };
    }
    const template: ReportTemplateView = {
      id: `00000000-0000-0000-0000-${String(this.templates.length + 1).padStart(12, "0")}`,
      reportId: input.reportId,
      name: input.name,
      filters: input.filters,
      selectedFields: input.selectedFields,
      isFavorite: input.isFavorite,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    this.templates.push(template);
    return { kind: "success", template };
  }

  async updateTemplate(input: ReportTemplateUpdateInput): Promise<ReportTemplateMutationOutcome> {
    const template = this.templates.find((t) => t.id === input.templateId);
    if (!template) return { kind: "not_found" };
    if (input.name !== undefined) template.name = input.name;
    if (input.filters !== undefined) template.filters = input.filters;
    if (input.selectedFields !== undefined) template.selectedFields = input.selectedFields;
    if (input.isFavorite !== undefined) template.isFavorite = input.isFavorite;
    return { kind: "success", template };
  }

  async deleteTemplate(
    _scope: StaffScopeInput,
    templateId: string,
  ): Promise<{ kind: "success" | "not_found" }> {
    const idx = this.templates.findIndex((t) => t.id === templateId);
    if (idx === -1) return { kind: "not_found" };
    this.templates.splice(idx, 1);
    return { kind: "success" };
  }

  async listHistory(_scope: StaffScopeInput, limit: number): Promise<ReportHistoryEntryView[]> {
    return this.history.slice(0, limit);
  }
}
