import {
  and,
  eq,
  gte,
  lte,
  inArray,
  desc,
  asc,
  sql,
  db,
  staff,
  students,
  hostels,
  rooms,
  leaveRequests,
  leaveApprovalEvents,
  movements,
  notifications,
  reportTemplates,
  reportExecutions,
} from "@digihostel/db";
import type {
  StaffScopeInput,
  ReportPreviewFilters,
  ReportTemplateView,
  ReportTemplateCreateInput,
  ReportTemplateUpdateInput,
  ReportTemplateMutationOutcome,
  ReportHistoryEntryView,
  ReportId,
} from "./types.js";

/**
 * Repository boundary for the Enterprise Reporting Platform (Phase 6, Prompt
 * 16). Runs on Fastify's own service-role Postgres connection, same as
 * every other repository in this codebase (ADR-006/ADR-014).
 *
 * Four report-shaped queries live here (student_movement, parent_approval,
 * leave_authorization, notification_activity) — fresh, read-only SELECTs
 * over existing operational tables these domains have never exposed as a
 * bounded, filtered, paginated list before. Every other implemented report
 * reuses an already-certified domain's own service directly (see
 * `service.ts`) rather than adding a query here — this file is NOT a
 * second copy of Emergency/Health/Audit/Analytics' own logic.
 *
 * Hostel scope, matching `analytics/repository.ts`'s identical
 * `scopeCondition` pattern exactly (this codebase does not share that
 * helper centrally — each domain repository defines its own copy, per
 * established convention): `hostel_admin` is ALWAYS forced to their own
 * resolved hostel, `super_admin` is ALWAYS unscoped. No client-supplied
 * hostel filter is ever trusted.
 */

function scopeCondition(scope: StaffScopeInput) {
  if (scope.staffRole === "super_admin") return sql`true`;
  return sql`exists (
    select 1 from ${staff} s
    where s.id = ${scope.staffId} and s.hostel_id = ${students.hostelId}
  )`;
}

function dateRangeSql(column: unknown, filters: ReportPreviewFilters) {
  const conditions = [];
  if (filters.dateFrom) conditions.push(gte(column as never, new Date(filters.dateFrom)));
  if (filters.dateTo) conditions.push(lte(column as never, new Date(filters.dateTo)));
  return conditions;
}

export interface ReportRowsResult {
  rows: Array<Record<string, unknown>>;
  total: number;
}

export interface ReportsRepository {
  listStudentMovement(
    scope: StaffScopeInput,
    filters: ReportPreviewFilters,
    page: number,
    pageSize: number,
  ): Promise<ReportRowsResult>;
  listParentApproval(
    scope: StaffScopeInput,
    filters: ReportPreviewFilters,
    page: number,
    pageSize: number,
  ): Promise<ReportRowsResult>;
  listLeaveAuthorization(
    scope: StaffScopeInput,
    filters: ReportPreviewFilters,
    page: number,
    pageSize: number,
  ): Promise<ReportRowsResult>;
  listNotificationActivity(
    scope: StaffScopeInput,
    filters: ReportPreviewFilters,
    page: number,
    pageSize: number,
  ): Promise<ReportRowsResult>;

  listTemplates(scope: StaffScopeInput): Promise<ReportTemplateView[]>;
  createTemplate(input: ReportTemplateCreateInput): Promise<ReportTemplateMutationOutcome>;
  updateTemplate(input: ReportTemplateUpdateInput): Promise<ReportTemplateMutationOutcome>;
  deleteTemplate(
    scope: StaffScopeInput,
    templateId: string,
  ): Promise<{ kind: "success" | "not_found" }>;

  listHistory(scope: StaffScopeInput, limit: number): Promise<ReportHistoryEntryView[]>;
  recordExecution(input: {
    reportId: ReportId;
    requestedByStaffId: string;
    hostelScopeId: string | null;
    filtersSummary: ReportPreviewFilters;
    rowCount: number;
  }): Promise<void>;
}

function toTemplateView(row: typeof reportTemplates.$inferSelect): ReportTemplateView {
  return {
    id: row.id,
    reportId: row.reportId as ReportId,
    name: row.name,
    filters: row.filters as ReportPreviewFilters,
    selectedFields: row.selectedFields as string[],
    isFavorite: row.isFavorite,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isUniqueViolation(err: unknown): boolean {
  const hasCode = (value: unknown): boolean =>
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    (value as { code: unknown }).code === "23505";
  if (hasCode(err)) return true;
  if (typeof err === "object" && err !== null && "cause" in err) {
    return hasCode((err as { cause: unknown }).cause);
  }
  return false;
}

export class DrizzleReportsRepository implements ReportsRepository {
  async listStudentMovement(
    scope: StaffScopeInput,
    filters: ReportPreviewFilters,
    page: number,
    pageSize: number,
  ): Promise<ReportRowsResult> {
    const conditions = [scopeCondition(scope), ...dateRangeSql(movements.occurredAt, filters)];
    const condition = and(...conditions);
    const offset = (page - 1) * pageSize;

    const [rows, countRows] = await Promise.all([
      db
        .select({
          studentRollNumber: students.rollNumber,
          studentFullName: students.fullName,
          hostelName: hostels.name,
          movementType: movements.movementType,
          occurredAt: movements.occurredAt,
          recordedByStaffName: staff.fullName,
        })
        .from(movements)
        .innerJoin(students, eq(students.id, movements.studentId))
        .leftJoin(hostels, eq(hostels.id, students.hostelId))
        .innerJoin(staff, eq(staff.id, movements.recordedByStaffId))
        .where(condition)
        .orderBy(desc(movements.occurredAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<string>`count(*)` })
        .from(movements)
        .innerJoin(students, eq(students.id, movements.studentId))
        .where(condition),
    ]);

    return {
      rows: rows.map((r) => ({ ...r, occurredAt: r.occurredAt.toISOString() })),
      total: Number(countRows[0]?.count ?? 0),
    };
  }

  async listParentApproval(
    scope: StaffScopeInput,
    filters: ReportPreviewFilters,
    page: number,
    pageSize: number,
  ): Promise<ReportRowsResult> {
    const conditions = [
      scopeCondition(scope),
      ...dateRangeSql(leaveApprovalEvents.occurredAt, filters),
    ];
    if (filters.eventTypes && filters.eventTypes.length > 0) {
      conditions.push(inArray(leaveApprovalEvents.eventType, filters.eventTypes as never[]));
    }
    const condition = and(...conditions);
    const offset = (page - 1) * pageSize;

    const [rows, countRows] = await Promise.all([
      db
        .select({
          studentRollNumber: students.rollNumber,
          studentFullName: students.fullName,
          hostelName: hostels.name,
          eventType: leaveApprovalEvents.eventType,
          response: leaveApprovalEvents.response,
          occurredAt: leaveApprovalEvents.occurredAt,
        })
        .from(leaveApprovalEvents)
        .innerJoin(leaveRequests, eq(leaveRequests.id, leaveApprovalEvents.leaveRequestId))
        .innerJoin(students, eq(students.id, leaveRequests.studentId))
        .leftJoin(hostels, eq(hostels.id, students.hostelId))
        .where(condition)
        .orderBy(desc(leaveApprovalEvents.occurredAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<string>`count(*)` })
        .from(leaveApprovalEvents)
        .innerJoin(leaveRequests, eq(leaveRequests.id, leaveApprovalEvents.leaveRequestId))
        .innerJoin(students, eq(students.id, leaveRequests.studentId))
        .where(condition),
    ]);

    return {
      rows: rows.map((r) => ({ ...r, occurredAt: r.occurredAt.toISOString() })),
      total: Number(countRows[0]?.count ?? 0),
    };
  }

  async listLeaveAuthorization(
    scope: StaffScopeInput,
    filters: ReportPreviewFilters,
    page: number,
    pageSize: number,
  ): Promise<ReportRowsResult> {
    const conditions = [scopeCondition(scope), ...dateRangeSql(leaveRequests.createdAt, filters)];
    if (filters.statuses && filters.statuses.length > 0) {
      conditions.push(inArray(leaveRequests.status, filters.statuses as never[]));
    }
    const condition = and(...conditions);
    const offset = (page - 1) * pageSize;

    const [rows, countRows] = await Promise.all([
      db
        .select({
          studentRollNumber: students.rollNumber,
          studentFullName: students.fullName,
          hostelName: hostels.name,
          roomNumber: rooms.roomNumber,
          status: leaveRequests.status,
          startDate: leaveRequests.startDate,
          endDate: leaveRequests.endDate,
          createdAt: leaveRequests.createdAt,
          updatedAt: leaveRequests.updatedAt,
        })
        .from(leaveRequests)
        .innerJoin(students, eq(students.id, leaveRequests.studentId))
        .leftJoin(hostels, eq(hostels.id, students.hostelId))
        .leftJoin(rooms, eq(rooms.id, students.roomId))
        .where(condition)
        .orderBy(desc(leaveRequests.createdAt), asc(leaveRequests.id))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<string>`count(*)` })
        .from(leaveRequests)
        .innerJoin(students, eq(students.id, leaveRequests.studentId))
        .where(condition),
    ]);

    return {
      rows: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      total: Number(countRows[0]?.count ?? 0),
    };
  }

  async listNotificationActivity(
    scope: StaffScopeInput,
    filters: ReportPreviewFilters,
    page: number,
    pageSize: number,
  ): Promise<ReportRowsResult> {
    // `notifications` has no hostel_id of its own — hostel relevance is
    // resolved by joining its (nullable) related_leave_request_id back to
    // leave_requests -> students, mirroring analytics/repository.ts's
    // identical getNotificationOverview() resolution exactly.
    const conditions = [scopeCondition(scope), ...dateRangeSql(notifications.createdAt, filters)];
    if (filters.statuses && filters.statuses.length > 0) {
      conditions.push(inArray(notifications.status, filters.statuses as never[]));
    }
    const condition = and(...conditions);
    const offset = (page - 1) * pageSize;

    const [rows, countRows] = await Promise.all([
      db
        .select({
          studentRollNumber: students.rollNumber,
          studentFullName: students.fullName,
          hostelName: hostels.name,
          stage: notifications.stage,
          status: notifications.status,
          createdAt: notifications.createdAt,
          sentAt: notifications.sentAt,
          deliveredAt: notifications.deliveredAt,
        })
        .from(notifications)
        .innerJoin(leaveRequests, eq(leaveRequests.id, notifications.relatedLeaveRequestId))
        .innerJoin(students, eq(students.id, leaveRequests.studentId))
        .leftJoin(hostels, eq(hostels.id, students.hostelId))
        .where(condition)
        .orderBy(desc(notifications.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<string>`count(*)` })
        .from(notifications)
        .innerJoin(leaveRequests, eq(leaveRequests.id, notifications.relatedLeaveRequestId))
        .innerJoin(students, eq(students.id, leaveRequests.studentId))
        .where(condition),
    ]);

    return {
      rows: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        sentAt: r.sentAt?.toISOString() ?? null,
        deliveredAt: r.deliveredAt?.toISOString() ?? null,
      })),
      total: Number(countRows[0]?.count ?? 0),
    };
  }

  async listTemplates(scope: StaffScopeInput): Promise<ReportTemplateView[]> {
    const rows = await db
      .select()
      .from(reportTemplates)
      .where(eq(reportTemplates.staffId, scope.staffId))
      .orderBy(desc(reportTemplates.isFavorite), desc(reportTemplates.updatedAt));
    return rows.map(toTemplateView);
  }

  async createTemplate(input: ReportTemplateCreateInput): Promise<ReportTemplateMutationOutcome> {
    try {
      const inserted = await db
        .insert(reportTemplates)
        .values({
          staffId: input.staffId,
          reportId: input.reportId,
          name: input.name,
          filters: input.filters,
          selectedFields: input.selectedFields,
          isFavorite: input.isFavorite,
        })
        .returning();
      return { kind: "success", template: toTemplateView(inserted[0]) };
    } catch (err) {
      if (isUniqueViolation(err)) return { kind: "duplicate_name" };
      throw err;
    }
  }

  async updateTemplate(input: ReportTemplateUpdateInput): Promise<ReportTemplateMutationOutcome> {
    const patch: Partial<typeof reportTemplates.$inferInsert> = { updatedAt: new Date() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.filters !== undefined) patch.filters = input.filters;
    if (input.selectedFields !== undefined) patch.selectedFields = input.selectedFields;
    if (input.isFavorite !== undefined) patch.isFavorite = input.isFavorite;

    try {
      const updated = await db
        .update(reportTemplates)
        .set(patch)
        .where(
          and(eq(reportTemplates.id, input.templateId), eq(reportTemplates.staffId, input.staffId)),
        )
        .returning();
      if (updated.length === 0) return { kind: "not_found" };
      return { kind: "success", template: toTemplateView(updated[0]) };
    } catch (err) {
      if (isUniqueViolation(err)) return { kind: "duplicate_name" };
      throw err;
    }
  }

  async deleteTemplate(
    scope: StaffScopeInput,
    templateId: string,
  ): Promise<{ kind: "success" | "not_found" }> {
    const deleted = await db
      .delete(reportTemplates)
      .where(and(eq(reportTemplates.id, templateId), eq(reportTemplates.staffId, scope.staffId)))
      .returning({ id: reportTemplates.id });
    return { kind: deleted.length > 0 ? "success" : "not_found" };
  }

  async listHistory(scope: StaffScopeInput, limit: number): Promise<ReportHistoryEntryView[]> {
    const rows = await db
      .select()
      .from(reportExecutions)
      .where(eq(reportExecutions.requestedByStaffId, scope.staffId))
      .orderBy(desc(reportExecutions.generatedAt))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      reportId: r.reportId as ReportId,
      filtersSummary: r.filtersSummary as ReportPreviewFilters,
      rowCount: r.rowCount,
      generatedAt: r.generatedAt.toISOString(),
    }));
  }

  async recordExecution(input: {
    reportId: ReportId;
    requestedByStaffId: string;
    hostelScopeId: string | null;
    filtersSummary: ReportPreviewFilters;
    rowCount: number;
  }): Promise<void> {
    await db.insert(reportExecutions).values({
      reportId: input.reportId,
      requestedByStaffId: input.requestedByStaffId,
      hostelScopeId: input.hostelScopeId,
      filtersSummary: input.filtersSummary,
      rowCount: input.rowCount,
    });
  }
}
