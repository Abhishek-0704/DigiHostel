import type { ReportsRepository } from "./repository.js";
import { AnalyticsService } from "../analytics/service.js";
import { EmergencyService } from "../emergency/service.js";
import { HealthService } from "../health/service.js";
import { AuditService } from "../audit/service.js";
import {
  EMERGENCY_CATEGORIES,
  EMERGENCY_SEVERITIES,
  EMERGENCY_STATUSES,
} from "../emergency/types.js";
import {
  HEALTH_CASE_CATEGORIES,
  HEALTH_CASE_SEVERITIES,
  HEALTH_CASE_STATUSES,
} from "../health/types.js";
import { AUDIT_MODULES } from "../audit/types.js";
import {
  REPORT_IDS,
  type ReportId,
  type ReportDefinition,
  type ReportPreviewInput,
  type ReportPreviewResult,
  type ReportFieldDefinition,
  type ReportTemplateView,
  type ReportTemplateCreateInput,
  type ReportTemplateUpdateInput,
  type ReportTemplateMutationOutcome,
  type ReportHistoryEntryView,
  type StaffScopeInput,
} from "./types.js";

/**
 * Service boundary for the Enterprise Reporting Platform (Phase 6, Prompt
 * 16). Orchestrates a fixed, server-owned catalog of reports — most reusing
 * an already-certified domain's own service directly, a minority backed by
 * new, focused read queries (`ReportsRepository`):
 *
 *   - `operational_summary` -> `AnalyticsService.getOverview()` (Prompt 15,
 *     REUSED VERBATIM — never a second formula for the same metric, per
 *     Prompt 16 §32's explicit instruction).
 *   - `emergency_incident` -> `EmergencyService.list()` (Prompt 10).
 *   - `health_operations` -> `HealthService.list()` (Prompt 11).
 *   - `audit_activity` / `administrative_user_activity` (fixed to the
 *     `staff-auth` module) / `configuration_change` (fixed to the
 *     `configuration_entries` entity type) -> `AuditService.list()` (Prompt
 *     12) — the SAME protected, service-role-only, hostel-scoped audit read
 *     path, never a second access route to `audit_logs` (Prompt 16 §34).
 *   - `student_movement` / `parent_approval` / `leave_authorization` /
 *     `notification_activity` -> fresh, read-only queries in
 *     `ReportsRepository` (no existing service in this codebase exposes a
 *     bounded, filtered, paginated list over these tables yet).
 *   - `hostel_occupancy` -> UNAVAILABLE (no capacity data exists anywhere
 *     in the schema — `hostels`/`rooms` have no capacity column; this is an
 *     architectural gap, not a missing query, confirmed by direct schema
 *     inspection, matching Prompt 15's own identical finding).
 */

const dateRangeFilter = { id: "dateRange", label: "Date range", type: "date_range" } as const;

const REPORT_DEFINITIONS: readonly ReportDefinition[] = [
  {
    id: "operational_summary",
    name: "Operational Summary",
    category: "operations",
    description:
      "A single-page executive summary across Presence, Leave, Movement, and Notifications — the same server-derived figures shown on the Operational Intelligence Dashboard (Phase 6, Prompt 15), reused unchanged.",
    status: "implemented",
    availableFields: [],
    availableFilters: [dateRangeFilter],
    sortFields: [],
    defaultSortField: "",
    isPaginated: false,
  },
  {
    id: "leave_authorization",
    name: "Leave Authorization Report",
    category: "leave",
    description:
      "Every DigiHostel hostel-leaving request within your authorized scope — status, dates, and hostel/room context. This is the DigiHostel leave-request lifecycle only; no KIIT SAP holiday-request data exists anywhere in this platform.",
    status: "implemented",
    availableFields: [
      { id: "studentRollNumber", label: "Roll Number" },
      { id: "studentFullName", label: "Student Name" },
      { id: "hostelName", label: "Hostel" },
      { id: "roomNumber", label: "Room" },
      { id: "status", label: "Status" },
      { id: "startDate", label: "Start Date" },
      { id: "endDate", label: "End Date" },
      { id: "createdAt", label: "Created" },
      { id: "updatedAt", label: "Last Updated" },
    ],
    availableFilters: [
      dateRangeFilter,
      {
        id: "statuses",
        label: "Status",
        type: "multi_select",
        options: [
          "pending",
          "father_notified",
          "mother_notified",
          "guardian_notified",
          "in_app_call",
          "manual_verification",
          "approved",
          "rejected",
          "expired",
        ],
      },
    ],
    sortFields: [{ id: "createdAt", label: "Created" }],
    defaultSortField: "createdAt",
    isPaginated: true,
  },
  {
    id: "parent_approval",
    name: "Parent Approval Report",
    category: "leave",
    description:
      'The real parent-approval-event timeline (notified / responded / escalated / expired / manual override) behind every leave request — never a single collapsed "leave approved" field. Never identifies which specific parent or staff member acted (the same privacy discipline the Approval History module already applies).',
    status: "implemented",
    availableFields: [
      { id: "studentRollNumber", label: "Roll Number" },
      { id: "studentFullName", label: "Student Name" },
      { id: "hostelName", label: "Hostel" },
      { id: "eventType", label: "Event Type" },
      { id: "response", label: "Response" },
      { id: "occurredAt", label: "Occurred At" },
    ],
    availableFilters: [
      dateRangeFilter,
      {
        id: "eventTypes",
        label: "Event Type",
        type: "multi_select",
        options: ["notified", "responded", "escalated", "expired", "manual_override"],
      },
    ],
    sortFields: [{ id: "occurredAt", label: "Occurred At" }],
    defaultSortField: "occurredAt",
    isPaginated: true,
  },
  {
    id: "student_movement",
    name: "Student Movement Report",
    category: "movement",
    description:
      "Every recorded hostel return within your authorized scope, from the authoritative Movement Engine (Phase 4, Prompt 9) — never derived from frontend state.",
    status: "implemented",
    availableFields: [
      { id: "studentRollNumber", label: "Roll Number" },
      { id: "studentFullName", label: "Student Name" },
      { id: "hostelName", label: "Hostel" },
      { id: "movementType", label: "Movement Type" },
      { id: "occurredAt", label: "Occurred At" },
      { id: "recordedByStaffName", label: "Recorded By" },
    ],
    availableFilters: [dateRangeFilter],
    sortFields: [{ id: "occurredAt", label: "Occurred At" }],
    defaultSortField: "occurredAt",
    isPaginated: true,
  },
  {
    id: "emergency_incident",
    name: "Emergency Incident Report",
    category: "safety",
    description:
      "Every emergency incident within your authorized scope, reusing the Emergency Operations Center's own certified read path (Phase 4, Prompt 10) unchanged.",
    status: "implemented",
    availableFields: [
      { id: "studentRollNumber", label: "Roll Number" },
      { id: "studentFullName", label: "Student Name" },
      { id: "hostelName", label: "Hostel" },
      { id: "roomNumber", label: "Room" },
      { id: "category", label: "Category" },
      { id: "severity", label: "Severity" },
      { id: "status", label: "Status" },
      { id: "reportedAt", label: "Reported At" },
      { id: "assignedStaffName", label: "Assigned To" },
    ],
    availableFilters: [
      dateRangeFilter,
      { id: "categories", label: "Category", type: "multi_select", options: EMERGENCY_CATEGORIES },
      { id: "severities", label: "Severity", type: "multi_select", options: EMERGENCY_SEVERITIES },
      { id: "statuses", label: "Status", type: "multi_select", options: EMERGENCY_STATUSES },
    ],
    sortFields: [
      { id: "reportedAt", label: "Reported At" },
      { id: "severity", label: "Severity" },
    ],
    defaultSortField: "reportedAt",
    isPaginated: true,
  },
  {
    id: "health_operations",
    name: "Health Operations Report",
    category: "safety",
    description:
      "Every health case within your authorized scope, reusing the Health Operations Center's own certified read path (Phase 4, Prompt 11) unchanged. An operational tracking tool, not a clinical/EHR record — no diagnosis, prescription, or lab-result field exists anywhere in this platform.",
    status: "implemented",
    availableFields: [
      { id: "studentRollNumber", label: "Roll Number" },
      { id: "studentFullName", label: "Student Name" },
      { id: "hostelName", label: "Hostel" },
      { id: "roomNumber", label: "Room" },
      { id: "category", label: "Category" },
      { id: "severity", label: "Severity" },
      { id: "status", label: "Status" },
      { id: "reportedAt", label: "Reported At" },
      { id: "assignedStaffName", label: "Assigned To" },
    ],
    availableFilters: [
      dateRangeFilter,
      {
        id: "categories",
        label: "Category",
        type: "multi_select",
        options: HEALTH_CASE_CATEGORIES,
      },
      {
        id: "severities",
        label: "Severity",
        type: "multi_select",
        options: HEALTH_CASE_SEVERITIES,
      },
      { id: "statuses", label: "Status", type: "multi_select", options: HEALTH_CASE_STATUSES },
    ],
    sortFields: [
      { id: "reportedAt", label: "Reported At" },
      { id: "severity", label: "Severity" },
    ],
    defaultSortField: "reportedAt",
    isPaginated: true,
  },
  {
    id: "notification_activity",
    name: "Notification Activity Report",
    category: "notifications",
    description:
      "The real, persistent parent/student leave-escalation notification record (ADR-018) — generated/sent/delivered/failed, per notification. This is NOT the Reception Dashboard's own Notification Center, which has zero persistent staff-facing backing (confirmed unchanged since Prompts 6/11).",
    status: "implemented",
    availableFields: [
      { id: "studentRollNumber", label: "Roll Number" },
      { id: "studentFullName", label: "Student Name" },
      { id: "hostelName", label: "Hostel" },
      { id: "stage", label: "Escalation Stage" },
      { id: "status", label: "Delivery Status" },
      { id: "createdAt", label: "Generated At" },
      { id: "sentAt", label: "Sent At" },
      { id: "deliveredAt", label: "Delivered At" },
    ],
    availableFilters: [
      dateRangeFilter,
      {
        id: "statuses",
        label: "Delivery Status",
        type: "multi_select",
        options: ["queued", "sent", "delivered", "failed"],
      },
    ],
    sortFields: [{ id: "createdAt", label: "Generated At" }],
    defaultSortField: "createdAt",
    isPaginated: true,
  },
  {
    id: "audit_activity",
    name: "Audit Activity Report",
    category: "compliance",
    description:
      "Every audit event within your authorized scope, reusing the Enterprise Audit Center's own protected read path (Phase 5, Prompt 12) unchanged — never a second access route to audit_logs.",
    status: "implemented",
    availableFields: [
      { id: "occurredAt", label: "Occurred At" },
      { id: "action", label: "Action" },
      { id: "module", label: "Module" },
      { id: "actorType", label: "Actor Type" },
      { id: "actorName", label: "Actor" },
      { id: "actorRole", label: "Actor Role" },
      { id: "studentFullName", label: "Student" },
      { id: "studentRollNumber", label: "Roll Number" },
      { id: "hostelName", label: "Hostel" },
    ],
    availableFilters: [
      dateRangeFilter,
      { id: "modules", label: "Module", type: "multi_select", options: AUDIT_MODULES },
    ],
    sortFields: [{ id: "occurredAt", label: "Occurred At" }],
    defaultSortField: "occurredAt",
    isPaginated: true,
  },
  {
    id: "administrative_user_activity",
    name: "Administrative User Activity Report",
    category: "administration",
    description:
      "Staff authentication events (sign-in, MFA, sign-out) from the Audit Center, fixed to the staff-auth module. This is NOT a list of currently active sessions — no session-listing capability exists anywhere in this platform (Force Sign-Out's sessions_invalidated_before column is a one-way invalidation watermark, not a session table, confirmed by QG-04).",
    status: "implemented",
    availableFields: [
      { id: "occurredAt", label: "Occurred At" },
      { id: "action", label: "Event" },
      { id: "actorName", label: "Staff Member" },
      { id: "actorRole", label: "Role" },
    ],
    availableFilters: [dateRangeFilter],
    sortFields: [{ id: "occurredAt", label: "Occurred At" }],
    defaultSortField: "occurredAt",
    isPaginated: true,
  },
  {
    id: "configuration_change",
    name: "Configuration Change Report",
    category: "administration",
    description:
      'Configuration entry create/update/deactivate events from the Audit Center, fixed to configuration_entries. Reports the CHANGE, not runtime effect — no configuration entry in this platform is currently consumed at runtime by any engine (Phase 5, Prompt 14\'s own explicit "CONFIGURATION STORED — RUNTIME CONSUMPTION DEFERRED" finding).',
    status: "implemented",
    availableFields: [
      { id: "occurredAt", label: "Occurred At" },
      { id: "action", label: "Action" },
      { id: "actorName", label: "Changed By" },
      { id: "actorRole", label: "Role" },
    ],
    availableFilters: [dateRangeFilter],
    sortFields: [{ id: "occurredAt", label: "Occurred At" }],
    defaultSortField: "occurredAt",
    isPaginated: true,
  },
  {
    id: "hostel_occupancy",
    name: "Hostel Occupancy Report",
    category: "operations",
    description: "Hostel occupancy against room/bed capacity.",
    status: "unavailable",
    unavailableReason:
      "Authoritative capacity data is not currently available — hostels/rooms carry no capacity/bed-count column anywhere in the schema (confirmed by direct inspection). Student presence (inside/outside counts, no capacity denominator) is available on the Operational Intelligence Dashboard instead, and is explicitly distinct from occupancy.",
    availableFields: [],
    availableFilters: [],
    sortFields: [],
    defaultSortField: "",
    isPaginated: false,
  },
];

function getDefinition(reportId: ReportId): ReportDefinition {
  const def = REPORT_DEFINITIONS.find((d) => d.id === reportId);
  if (!def) throw new Error(`Unknown report id: ${reportId}`);
  return def;
}

/** Selects only the requested (or, if none requested, every available)
 * field from each row — never a fabricated field, never an unrecognized
 * one (the caller/route already validated `selectedFields` against the
 * report's own `availableFields` before this runs). */
function pickFields(
  rows: Array<Record<string, unknown>>,
  available: readonly ReportFieldDefinition[],
  selected: string[] | undefined,
): { columns: ReportFieldDefinition[]; rows: Array<Record<string, unknown>> } {
  const fieldIds = selected && selected.length > 0 ? selected : available.map((f) => f.id);
  const columns = available.filter((f) => fieldIds.includes(f.id));
  const pickedRows = rows.map((row) => {
    const picked: Record<string, unknown> = {};
    for (const id of fieldIds) picked[id] = row[id] ?? null;
    return picked;
  });
  return { columns, rows: pickedRows };
}

/** The public surface `routes/reports.ts` actually depends on — kept as an
 * interface, separate from the `ReportsService` class itself, purely so
 * test fixtures (`__fixtures__/fake-service.ts`) can provide a structurally
 * compatible fake without TypeScript's nominal-typing treatment of a
 * class's private constructor parameters getting in the way (the exact
 * same reason every other domain in this codebase injects at the
 * REPOSITORY layer instead — this domain's equivalent injection point is
 * one level up, since `ReportsService` itself composes four other
 * domains' own already-real services rather than a single repository). */
export interface ReportsServicePort {
  getCatalog(): ReportDefinition[];
  preview(input: ReportPreviewInput): Promise<ReportPreviewResult>;
  recordExecution(
    scope: StaffScopeInput & { hostelScopeId: string | null },
    reportId: ReportId,
    filtersSummary: ReportPreviewInput["filters"],
    rowCount: number,
  ): Promise<void>;
  listTemplates(scope: StaffScopeInput): Promise<ReportTemplateView[]>;
  createTemplate(input: ReportTemplateCreateInput): Promise<ReportTemplateMutationOutcome>;
  updateTemplate(input: ReportTemplateUpdateInput): Promise<ReportTemplateMutationOutcome>;
  deleteTemplate(
    scope: StaffScopeInput,
    templateId: string,
  ): Promise<{ kind: "success" | "not_found" }>;
  listHistory(scope: StaffScopeInput, limit: number): Promise<ReportHistoryEntryView[]>;
}

export class ReportsService implements ReportsServicePort {
  constructor(
    private readonly repository: ReportsRepository,
    private readonly analyticsService: AnalyticsService,
    private readonly emergencyService: EmergencyService,
    private readonly healthService: HealthService,
    private readonly auditService: AuditService,
  ) {}

  getCatalog(): ReportDefinition[] {
    return REPORT_DEFINITIONS.map((d) => ({ ...d }));
  }

  async preview(input: ReportPreviewInput): Promise<ReportPreviewResult> {
    const def = getDefinition(input.reportId);
    if (def.status === "unavailable") {
      throw new Error(`Report ${input.reportId} is unavailable: ${def.unavailableReason}`);
    }

    const { dateFrom, dateTo } = input.filters;
    const generatedAt = new Date().toISOString();

    if (input.reportId === "operational_summary") {
      const overview = await this.analyticsService.getOverview({
        staffId: input.staffId,
        staffRole: input.staffRole,
        dateFrom: dateFrom!,
        dateTo: dateTo!,
      });
      return {
        reportId: input.reportId,
        generatedAt,
        periodFrom: overview.periodFrom,
        periodTo: overview.periodTo,
        columns: [],
        rows: [],
        summary: overview as unknown as Record<string, unknown>,
        total: 1,
        page: 1,
        pageSize: 1,
      };
    }

    const scope = { staffId: input.staffId, staffRole: input.staffRole };
    let rawRows: Array<Record<string, unknown>>;
    let total: number;

    switch (input.reportId) {
      case "student_movement": {
        const result = await this.repository.listStudentMovement(
          scope,
          input.filters,
          input.page,
          input.pageSize,
        );
        rawRows = result.rows;
        total = result.total;
        break;
      }
      case "parent_approval": {
        const result = await this.repository.listParentApproval(
          scope,
          input.filters,
          input.page,
          input.pageSize,
        );
        rawRows = result.rows;
        total = result.total;
        break;
      }
      case "leave_authorization": {
        const result = await this.repository.listLeaveAuthorization(
          scope,
          input.filters,
          input.page,
          input.pageSize,
        );
        rawRows = result.rows;
        total = result.total;
        break;
      }
      case "notification_activity": {
        const result = await this.repository.listNotificationActivity(
          scope,
          input.filters,
          input.page,
          input.pageSize,
        );
        rawRows = result.rows;
        total = result.total;
        break;
      }
      case "emergency_incident": {
        const result = await this.emergencyService.list({
          staffId: input.staffId,
          staffRole: input.staffRole,
          categories: input.filters.categories as never,
          severities: input.filters.severities as never,
          statuses: input.filters.statuses as never,
          dateFrom,
          dateTo,
          page: input.page,
          pageSize: input.pageSize,
          sortBy: input.sortField === "severity" ? "severity" : "reportedAt",
          sortDir: input.sortDir ?? "desc",
        });
        rawRows = result.items as unknown as Array<Record<string, unknown>>;
        total = result.total;
        break;
      }
      case "health_operations": {
        const result = await this.healthService.list({
          staffId: input.staffId,
          staffRole: input.staffRole,
          categories: input.filters.categories as never,
          severities: input.filters.severities as never,
          statuses: input.filters.statuses as never,
          dateFrom,
          dateTo,
          page: input.page,
          pageSize: input.pageSize,
          sortBy: input.sortField === "severity" ? "severity" : "reportedAt",
          sortDir: input.sortDir ?? "desc",
        });
        rawRows = result.items as unknown as Array<Record<string, unknown>>;
        total = result.total;
        break;
      }
      case "audit_activity": {
        const result = await this.auditService.list({
          staffId: input.staffId,
          staffRole: input.staffRole,
          modules: input.filters.modules as never,
          dateFrom,
          dateTo,
          page: input.page,
          pageSize: input.pageSize,
          sortDir: input.sortDir ?? "desc",
        });
        rawRows = result.items as unknown as Array<Record<string, unknown>>;
        total = result.total;
        break;
      }
      case "administrative_user_activity": {
        const result = await this.auditService.list({
          staffId: input.staffId,
          staffRole: input.staffRole,
          modules: ["staff-auth"],
          dateFrom,
          dateTo,
          page: input.page,
          pageSize: input.pageSize,
          sortDir: input.sortDir ?? "desc",
        });
        rawRows = result.items as unknown as Array<Record<string, unknown>>;
        total = result.total;
        break;
      }
      case "configuration_change": {
        const result = await this.auditService.list({
          staffId: input.staffId,
          staffRole: input.staffRole,
          entityTypes: ["configuration_entries"] as never,
          dateFrom,
          dateTo,
          page: input.page,
          pageSize: input.pageSize,
          sortDir: input.sortDir ?? "desc",
        });
        rawRows = result.items as unknown as Array<Record<string, unknown>>;
        total = result.total;
        break;
      }
      case "hostel_occupancy":
        // Unreachable — already rejected by the `status === "unavailable"`
        // check above; kept as an explicit case (rather than folded into
        // `default`) so this switch stays exhaustively checked against
        // `ReportId` by the compiler.
        throw new Error(`Report ${input.reportId} is unavailable.`);
      default: {
        const exhaustive: never = input.reportId;
        throw new Error(`Unhandled report id: ${String(exhaustive)}`);
      }
    }

    const { columns, rows } = pickFields(rawRows, def.availableFields, input.selectedFields);
    return {
      reportId: input.reportId,
      generatedAt,
      periodFrom: dateFrom ?? null,
      periodTo: dateTo ?? null,
      columns,
      rows,
      summary: null,
      total,
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
    await this.repository.recordExecution({
      reportId,
      requestedByStaffId: scope.staffId,
      hostelScopeId: scope.hostelScopeId,
      filtersSummary,
      rowCount,
    });
  }

  async listTemplates(scope: StaffScopeInput): Promise<ReportTemplateView[]> {
    return this.repository.listTemplates(scope);
  }

  async createTemplate(input: ReportTemplateCreateInput): Promise<ReportTemplateMutationOutcome> {
    getDefinition(input.reportId); // throws on an unknown report id
    return this.repository.createTemplate(input);
  }

  async updateTemplate(input: ReportTemplateUpdateInput): Promise<ReportTemplateMutationOutcome> {
    return this.repository.updateTemplate(input);
  }

  async deleteTemplate(
    scope: StaffScopeInput,
    templateId: string,
  ): Promise<{ kind: "success" | "not_found" }> {
    return this.repository.deleteTemplate(scope, templateId);
  }

  async listHistory(scope: StaffScopeInput, limit: number): Promise<ReportHistoryEntryView[]> {
    return this.repository.listHistory(scope, limit);
  }
}

export { REPORT_IDS };
