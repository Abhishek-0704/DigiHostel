import { MAX_ANALYTICS_RANGE_DAYS, DEFAULT_ANALYTICS_RANGE_DAYS } from "../analytics/types.js";

/**
 * Enterprise Reporting Platform (Phase 6, Prompt 16) domain types.
 *
 * This is a READ-ORIENTED ANALYTICAL LAYER, not a new business-transaction
 * engine — every report is derived from an already-certified domain's own
 * authoritative tables (or, for Leave/Movement/Parent-Approval/Notification
 * reports, a fresh read-only query over those same tables), and several
 * reports reuse an already-certified domain's own service directly
 * (Emergency, Health, Audit, Analytics) rather than re-deriving its logic —
 * see `service.ts`'s own header comment for exactly which report reuses
 * what.
 *
 * Date-range contract: reuses Prompt 15's own `MAX_ANALYTICS_RANGE_DAYS`/
 * `DEFAULT_ANALYTICS_RANGE_DAYS` directly (re-exported below), never a
 * second, independently-defined date interpretation — Prompt 16 §11's own
 * explicit "use a consistent server-side date interpretation" requirement,
 * and §32's "do not maintain two different formulas for the same metric."
 * Both bounds inclusive, UTC ISO 8601, matching every `timestamptz` column
 * in this schema.
 *
 * Custom Report Builder design: field SELECTION over a FIXED, server-owned
 * report definition — never a dynamic query engine. A caller may choose
 * which of a report's own pre-declared `availableFields` to include in its
 * preview/template, and may set that report's own pre-declared filters
 * (also validated server-side against a fixed allow-list per report). No
 * report ever accepts a client-supplied table name, column name, join, or
 * raw SQL fragment (Prompt 16 §9's explicit prohibition). Grouping is
 * DEFERRED entirely — no dynamic GROUP BY is exposed anywhere in this
 * domain (see `docs/enterprise-reporting.md` for why).
 */

export { MAX_ANALYTICS_RANGE_DAYS, DEFAULT_ANALYTICS_RANGE_DAYS };

/** Server-authoritative — always the caller's own resolved staff profile
 * (routes/reports.ts), never a client-supplied filter. Reports are reached
 * exclusively via `reports:view`/`reports:generate`, both granted only to
 * `hostel_admin`/`super_admin` (unchanged since Prompt 3) — `reception_warden`
 * cannot reach this domain at all, mirroring Analytics' (Prompt 15) identical
 * `StaffScopeInput` narrowing. */
export interface StaffScopeInput {
  staffId: string;
  staffRole: "hostel_admin" | "super_admin";
}

export interface DateRangeInput {
  dateFrom?: string;
  dateTo?: string;
}

/**
 * The complete, fixed catalog of reports this platform can produce. Every
 * id here has a corresponding case in `service.ts`'s resolver switch — there
 * is no dynamic/client-registered report id.
 */
export const REPORT_IDS = [
  "operational_summary",
  "leave_authorization",
  "parent_approval",
  "student_movement",
  "emergency_incident",
  "health_operations",
  "notification_activity",
  "audit_activity",
  "administrative_user_activity",
  "configuration_change",
  "hostel_occupancy",
] as const;
export type ReportId = (typeof REPORT_IDS)[number];

export type ReportCategory =
  | "operations"
  | "leave"
  | "movement"
  | "safety"
  | "notifications"
  | "compliance"
  | "administration";

export type ReportStatus = "implemented" | "unavailable";

export interface ReportFieldDefinition {
  id: string;
  label: string;
}

export interface ReportFilterDefinition {
  id: string;
  label: string;
  type: "date_range" | "multi_select";
  /** Only present for `multi_select` — the real, fixed set of values this
   * filter accepts (a report's own domain enum), never an open string. */
  options?: readonly string[];
}

export interface ReportSortFieldDefinition {
  id: string;
  label: string;
}

/** Server-owned report metadata — the ONE source the catalog endpoint and
 * every preview/validation call reads from. Never client-supplied. */
export interface ReportDefinition {
  id: ReportId;
  name: string;
  category: ReportCategory;
  description: string;
  status: ReportStatus;
  /** Populated only when `status === "unavailable"` — the honest reason,
   * shown verbatim in the UI (Prompt 16 §37). */
  unavailableReason?: string;
  availableFields: readonly ReportFieldDefinition[];
  availableFilters: readonly ReportFilterDefinition[];
  sortFields: readonly ReportSortFieldDefinition[];
  defaultSortField: string;
  /** `false` for the single-row Operational Summary report (no pagination —
   * one summary object, not a row list). */
  isPaginated: boolean;
}

export interface ReportPreviewFilters extends DateRangeInput {
  statuses?: string[];
  categories?: string[];
  severities?: string[];
  eventTypes?: string[];
  modules?: string[];
}

export interface ReportPreviewInput extends StaffScopeInput {
  reportId: ReportId;
  filters: ReportPreviewFilters;
  /** A subset of the report's own `availableFields` ids — validated
   * server-side; an unrecognized field id is rejected, never silently
   * dropped or silently accepted (Prompt 16 §9's "no fabricated fields"). */
  selectedFields?: string[];
  sortField?: string;
  sortDir?: "asc" | "desc";
  page: number;
  pageSize: number;
}

export interface ReportPreviewResult {
  reportId: ReportId;
  /** The moment this specific query executed — the closest honest
   * approximation of "snapshot timestamp" this platform offers (Prompt 16
   * §13): a consistent, single-transaction-adjacent read, not a formal
   * immutable database snapshot/version (no such capability exists in this
   * architecture — recorded as a future extension point, not implemented
   * as though it already existed). */
  generatedAt: string;
  periodFrom: string | null;
  periodTo: string | null;
  columns: ReportFieldDefinition[];
  rows: Array<Record<string, unknown>>;
  /** Only populated for the Operational Summary report (a single aggregate
   * object rather than a row list) — `null` for every row-list report. */
  summary: Record<string, unknown> | null;
  total: number;
  page: number;
  pageSize: number;
}

export interface ReportTemplateView {
  id: string;
  reportId: ReportId;
  name: string;
  filters: ReportPreviewFilters;
  selectedFields: string[];
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReportTemplateCreateInput extends StaffScopeInput {
  reportId: ReportId;
  name: string;
  filters: ReportPreviewFilters;
  selectedFields: string[];
  isFavorite: boolean;
}

export interface ReportTemplateUpdateInput extends StaffScopeInput {
  templateId: string;
  name?: string;
  filters?: ReportPreviewFilters;
  selectedFields?: string[];
  isFavorite?: boolean;
}

export type ReportTemplateMutationOutcome =
  | { kind: "success"; template: ReportTemplateView }
  | { kind: "not_found" }
  | { kind: "duplicate_name" };

export interface ReportHistoryEntryView {
  id: string;
  reportId: ReportId;
  filtersSummary: ReportPreviewFilters;
  rowCount: number;
  generatedAt: string;
}
