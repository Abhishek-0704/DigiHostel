import { and, asc, desc, eq, gte, lte, inArray, notInArray, sql, db, alias } from "@digihostel/db";
import {
  students,
  hostels,
  rooms,
  staff,
  healthCases,
  healthCaseEvents,
  auditLogs,
} from "@digihostel/db";
import {
  ADMISSION_CATEGORIES,
  HEALTH_CASE_TRANSITIONS,
  type StaffScopeInput,
  type HealthCaseListInput,
  type HealthCaseListResult,
  type HealthCaseListItemView,
  type HealthCaseDetailView,
  type HealthCaseEventView,
  type HealthCaseStatistics,
  type HealthCaseCreateInput,
  type HealthCaseTransitionInput,
  type HealthCaseNoteInput,
  type HealthCaseTransitionAction,
  type HealthCaseStatus,
} from "./types.js";

/**
 * Repository boundary for the Health Operations Center (Phase 4, Prompt 11).
 * Runs on the same privileged Postgres connection every other backend
 * repository uses — Fastify's own connection is service-role and bypasses
 * RLS by design (ADR-006/ADR-014); hostel-scope authorization is therefore
 * enforced HERE, in application code, mirroring
 * `DrizzleEmergencyRepository`'s identical pattern.
 */

const assignedStaff = alias(staff, "assigned_staff");
const actorStaff = alias(staff, "actor_staff");

// Self-contained (joins staff -> students itself via the case's own
// student_id) rather than assuming an outer `students` join is already
// present in the surrounding query — required for transition()/addNote(),
// whose UPDATE/SELECT-for-update statements have no such join. Mirrors
// DrizzleEmergencyRepository's identical scopeCheck shape.
const scopeCheck = (scope: StaffScopeInput) =>
  scope.staffRole === "super_admin"
    ? sql`true`
    : sql`exists (
        select 1 from ${staff} s
        join ${students} st on st.hostel_id = s.hostel_id
        where s.id = ${scope.staffId} and st.id = ${healthCases.studentId}
      )`;

function searchCondition(query: string | undefined) {
  if (!query || query.trim() === "") return sql`true`;
  const prefix = `${query.trim()}%`;
  return sql`(lower(${students.fullName}) like lower(${prefix}) or lower(${students.rollNumber}) like lower(${prefix}))`;
}

// Real, server-derived "latest update" — the most recent timeline event's
// timestamp, or the case's own createdAt if it has no events yet (never a
// client-computed guess).
const latestUpdateAtExpr = sql<string>`greatest(
  ${healthCases.createdAt},
  coalesce((select max(e.occurred_at) from health_case_events e where e.case_id = ${healthCases.id}), ${healthCases.createdAt})
)`;

function toListItem(row: {
  id: string;
  studentId: string;
  studentFullName: string;
  studentRollNumber: string;
  hostelId: string | null;
  hostelName: string | null;
  roomNumber: string | null;
  category: string;
  severity: string;
  status: string;
  createdAt: Date;
  admittedAt: Date | null;
  latestUpdateAt: Date | string;
  assignedStaffId: string | null;
  assignedStaffName: string | null;
}): HealthCaseListItemView {
  return {
    id: row.id,
    studentId: row.studentId,
    studentFullName: row.studentFullName,
    studentRollNumber: row.studentRollNumber,
    hostelId: row.hostelId,
    hostelName: row.hostelName,
    roomNumber: row.roomNumber,
    category: row.category as HealthCaseListItemView["category"],
    severity: row.severity as HealthCaseListItemView["severity"],
    status: row.status as HealthCaseStatus,
    reportedAt: row.createdAt.toISOString(),
    admittedAt: row.admittedAt?.toISOString() ?? null,
    latestUpdateAt: new Date(row.latestUpdateAt).toISOString(),
    assignedStaffId: row.assignedStaffId,
    assignedStaffName: row.assignedStaffName,
  };
}

export type HealthCaseCreateOutcome =
  { kind: "success"; healthCase: HealthCaseDetailView } | { kind: "student_not_found" };

export type HealthCaseTransitionOutcome =
  | { kind: "success"; healthCase: HealthCaseDetailView }
  | { kind: "not_found" }
  | { kind: "conflict"; currentStatus: HealthCaseStatus };

export type HealthCaseNoteOutcome =
  | { kind: "success"; event: HealthCaseEventView }
  | { kind: "not_found" }
  | { kind: "conflict"; currentStatus: HealthCaseStatus };

export interface HealthRepository {
  list(input: HealthCaseListInput): Promise<HealthCaseListResult>;
  getById(caseId: string, scope: StaffScopeInput): Promise<HealthCaseDetailView | null>;
  getStatistics(scope: StaffScopeInput): Promise<HealthCaseStatistics>;
  create(input: HealthCaseCreateInput): Promise<HealthCaseCreateOutcome>;
  transition(
    action: HealthCaseTransitionAction,
    input: HealthCaseTransitionInput,
  ): Promise<HealthCaseTransitionOutcome>;
  addNote(input: HealthCaseNoteInput): Promise<HealthCaseNoteOutcome>;
}

async function loadTimeline(caseId: string): Promise<HealthCaseEventView[]> {
  const rows = await db
    .select({
      id: healthCaseEvents.id,
      eventType: healthCaseEvents.eventType,
      note: healthCaseEvents.note,
      actorStaffName: actorStaff.fullName,
      occurredAt: healthCaseEvents.occurredAt,
    })
    .from(healthCaseEvents)
    .leftJoin(actorStaff, eq(actorStaff.id, healthCaseEvents.actorStaffId))
    .where(eq(healthCaseEvents.caseId, caseId))
    .orderBy(asc(healthCaseEvents.occurredAt));

  return rows.map((r) => ({
    id: r.id,
    eventType: r.eventType as HealthCaseEventView["eventType"],
    note: r.note,
    actorStaffName: r.actorStaffName,
    occurredAt: r.occurredAt.toISOString(),
  }));
}

async function loadDetail(
  caseId: string,
  scope: StaffScopeInput,
): Promise<HealthCaseDetailView | null> {
  const rows = await db
    .select({
      id: healthCases.id,
      studentId: healthCases.studentId,
      studentFullName: students.fullName,
      studentRollNumber: students.rollNumber,
      hostelId: students.hostelId,
      hostelName: hostels.name,
      roomNumber: rooms.roomNumber,
      category: healthCases.category,
      severity: healthCases.severity,
      status: healthCases.status,
      description: healthCases.description,
      createdAt: healthCases.createdAt,
      admittedAt: healthCases.admittedAt,
      latestUpdateAt: latestUpdateAtExpr,
      resolvedAt: healthCases.resolvedAt,
      dischargedAt: healthCases.dischargedAt,
      closedAt: healthCases.closedAt,
      cancelledAt: healthCases.cancelledAt,
      assignedStaffId: healthCases.assignedStaffId,
      assignedStaffName: assignedStaff.fullName,
    })
    .from(healthCases)
    .innerJoin(students, eq(students.id, healthCases.studentId))
    .leftJoin(hostels, eq(hostels.id, students.hostelId))
    .leftJoin(rooms, eq(rooms.id, students.roomId))
    .leftJoin(assignedStaff, eq(assignedStaff.id, healthCases.assignedStaffId))
    .where(and(eq(healthCases.id, caseId), scopeCheck(scope)))
    .limit(1);

  if (rows.length === 0) return null;
  const row = rows[0];
  const timeline = await loadTimeline(caseId);

  return {
    ...toListItem(row),
    description: row.description,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    dischargedAt: row.dischargedAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    timeline,
  };
}

export class DrizzleHealthRepository implements HealthRepository {
  async list(input: HealthCaseListInput): Promise<HealthCaseListResult> {
    const conditions = [scopeCheck(input), searchCondition(input.query)];
    if (input.studentId) {
      conditions.push(eq(healthCases.studentId, input.studentId));
    }
    if (input.categories && input.categories.length > 0) {
      conditions.push(inArray(healthCases.category, input.categories));
    }
    if (input.severities && input.severities.length > 0) {
      conditions.push(inArray(healthCases.severity, input.severities));
    }
    if (input.statuses && input.statuses.length > 0) {
      conditions.push(inArray(healthCases.status, input.statuses));
    } else if (input.activeOnly) {
      conditions.push(
        notInArray(healthCases.status, ["resolved", "discharged", "closed", "cancelled"]),
      );
    }
    if (input.dateFrom) {
      conditions.push(gte(healthCases.createdAt, new Date(input.dateFrom)));
    }
    if (input.dateTo) {
      conditions.push(lte(healthCases.createdAt, new Date(input.dateTo)));
    }
    const condition = and(...conditions);

    // `severity` reuses the EOC's own Postgres enum, declared
    // ('critical','high','medium','low','informational') in exactly that
    // order — ORDER BY severity ASC naturally means "most severe first".
    const sortColumn = input.sortBy === "severity" ? healthCases.severity : healthCases.createdAt;
    const orderFn = input.sortDir === "desc" ? desc : asc;

    const [rows, countRows] = await Promise.all([
      db
        .select({
          id: healthCases.id,
          studentId: healthCases.studentId,
          studentFullName: students.fullName,
          studentRollNumber: students.rollNumber,
          hostelId: students.hostelId,
          hostelName: hostels.name,
          roomNumber: rooms.roomNumber,
          category: healthCases.category,
          severity: healthCases.severity,
          status: healthCases.status,
          createdAt: healthCases.createdAt,
          admittedAt: healthCases.admittedAt,
          latestUpdateAt: latestUpdateAtExpr,
          assignedStaffId: healthCases.assignedStaffId,
          assignedStaffName: assignedStaff.fullName,
        })
        .from(healthCases)
        .innerJoin(students, eq(students.id, healthCases.studentId))
        .leftJoin(hostels, eq(hostels.id, students.hostelId))
        .leftJoin(rooms, eq(rooms.id, students.roomId))
        .leftJoin(assignedStaff, eq(assignedStaff.id, healthCases.assignedStaffId))
        .where(condition)
        .orderBy(orderFn(sortColumn), asc(healthCases.id))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      db
        .select({ count: sql<string>`count(*)` })
        .from(healthCases)
        .innerJoin(students, eq(students.id, healthCases.studentId))
        .where(condition),
    ]);

    return {
      items: rows.map(toListItem),
      total: Number(countRows[0]?.count ?? 0),
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  async getById(caseId: string, scope: StaffScopeInput): Promise<HealthCaseDetailView | null> {
    return loadDetail(caseId, scope);
  }

  async getStatistics(scope: StaffScopeInput): Promise<HealthCaseStatistics> {
    const condition = scopeCheck(scope);
    const rows = await db
      .select({
        active: sql<string>`count(*) filter (where ${healthCases.status} not in ('resolved','discharged','closed','cancelled'))`,
        critical: sql<string>`count(*) filter (where ${healthCases.severity} = 'critical' and ${healthCases.status} not in ('resolved','discharged','closed','cancelled'))`,
        newCases: sql<string>`count(*) filter (where ${healthCases.status} = 'new')`,
        monitoring: sql<string>`count(*) filter (where ${healthCases.status} = 'monitoring')`,
        awaitingUpdate: sql<string>`count(*) filter (where ${healthCases.status} = 'awaiting_update')`,
        admittedToday: sql<string>`count(*) filter (where ${healthCases.admittedAt} >= date_trunc('day', now()))`,
        dischargedToday: sql<string>`count(*) filter (where ${healthCases.dischargedAt} >= date_trunc('day', now()))`,
      })
      .from(healthCases)
      .innerJoin(students, eq(students.id, healthCases.studentId))
      .where(condition);

    const row = rows[0];
    return {
      active: Number(row?.active ?? 0),
      critical: Number(row?.critical ?? 0),
      newCases: Number(row?.newCases ?? 0),
      monitoring: Number(row?.monitoring ?? 0),
      awaitingUpdate: Number(row?.awaitingUpdate ?? 0),
      admittedToday: Number(row?.admittedToday ?? 0),
      dischargedToday: Number(row?.dischargedToday ?? 0),
    };
  }

  async create(input: HealthCaseCreateInput): Promise<HealthCaseCreateOutcome> {
    const studentScope =
      input.staffRole === "super_admin"
        ? sql`true`
        : sql`exists (select 1 from ${staff} s where s.id = ${input.staffId} and s.hostel_id = ${students.hostelId})`;

    const admittedAt = ADMISSION_CATEGORIES.includes(input.category) ? new Date() : null;

    // `loadDetail` is deliberately called AFTER this transaction commits —
    // same "load after commit" discipline DrizzleEmergencyRepository
    // established (a query on a different connection cannot see this
    // transaction's uncommitted insert under READ COMMITTED isolation).
    const outcome = await db.transaction(async (tx) => {
      const studentRows = await tx
        .select({ id: students.id })
        .from(students)
        .where(and(eq(students.rollNumber, input.rollNumber), studentScope))
        .limit(1);

      if (studentRows.length === 0) {
        return { kind: "student_not_found" as const };
      }
      const studentId = studentRows[0].id;

      const inserted = await tx
        .insert(healthCases)
        .values({
          studentId,
          category: input.category,
          status: "new",
          severity: input.severity,
          description: input.description,
          admittedAt,
        })
        .returning({ id: healthCases.id });
      const caseId = inserted[0].id;

      await tx.insert(healthCaseEvents).values({
        caseId,
        eventType: "created",
        actorStaffId: input.staffId,
      });

      await tx.insert(auditLogs).values({
        actorType: "staff",
        actorId: input.staffId,
        action: "health.case_reported",
        entityType: "health_cases",
        entityId: caseId,
        metadata: { category: input.category, severity: input.severity },
      });

      return { kind: "success" as const, caseId };
    });

    if (outcome.kind === "student_not_found") return outcome;
    const healthCase = await loadDetail(outcome.caseId, input);
    return { kind: "success", healthCase: healthCase! };
  }

  async transition(
    action: HealthCaseTransitionAction,
    input: HealthCaseTransitionInput,
  ): Promise<HealthCaseTransitionOutcome> {
    // Cast needed: indexing HEALTH_CASE_TRANSITIONS by the generic
    // `action` parameter produces a union across every entry's own
    // `as const`-narrowed `from` type (a mix of single literals and one
    // tuple, for `close`) rather than the intended
    // `HealthCaseStatus | HealthCaseStatus[]` shape `types.ts` declares.
    const { from, to, eventType } = HEALTH_CASE_TRANSITIONS[action] as {
      from: HealthCaseStatus | readonly HealthCaseStatus[];
      to: HealthCaseStatus;
      eventType: (typeof HEALTH_CASE_TRANSITIONS)[HealthCaseTransitionAction]["eventType"];
    };
    const fromStates: HealthCaseStatus[] = Array.isArray(from) ? [...from] : [from];
    const scope = scopeCheck(input);

    // Same "load AFTER commit" discipline as create() above.
    const outcome = await db.transaction(async (tx) => {
      const setValues: Record<string, unknown> = { status: to };
      if (to === "acknowledged") setValues.assignedStaffId = input.staffId;
      if (to === "resolved") setValues.resolvedAt = new Date();
      if (to === "discharged") setValues.dischargedAt = new Date();
      if (to === "closed") setValues.closedAt = new Date();
      if (to === "cancelled") setValues.cancelledAt = new Date();

      const updated = await tx
        .update(healthCases)
        .set(setValues)
        .where(
          and(eq(healthCases.id, input.caseId), inArray(healthCases.status, fromStates), scope),
        )
        .returning({ id: healthCases.id });

      if (updated.length === 0) {
        const existing = await tx
          .select({ status: healthCases.status })
          .from(healthCases)
          .innerJoin(students, eq(students.id, healthCases.studentId))
          .where(and(eq(healthCases.id, input.caseId), scope))
          .limit(1);

        if (existing.length === 0) return { kind: "not_found" as const };
        return {
          kind: "conflict" as const,
          currentStatus: existing[0].status as HealthCaseStatus,
        };
      }

      await tx.insert(healthCaseEvents).values({
        caseId: input.caseId,
        eventType,
        actorStaffId: input.staffId,
      });

      await tx.insert(auditLogs).values({
        actorType: "staff",
        actorId: input.staffId,
        action: `health.case_${action}`,
        entityType: "health_cases",
        entityId: input.caseId,
        metadata: { from, to },
      });

      return { kind: "success" as const };
    });

    if (outcome.kind !== "success") return outcome;
    const healthCase = await loadDetail(input.caseId, input);
    return { kind: "success", healthCase: healthCase! };
  }

  async addNote(input: HealthCaseNoteInput): Promise<HealthCaseNoteOutcome> {
    const scope = scopeCheck(input);

    return db.transaction(async (tx) => {
      const rows = await tx
        .select({ status: healthCases.status })
        .from(healthCases)
        .innerJoin(students, eq(students.id, healthCases.studentId))
        .where(and(eq(healthCases.id, input.caseId), scope))
        .for("update")
        .limit(1);

      if (rows.length === 0) return { kind: "not_found" };
      if (rows[0].status === "closed" || rows[0].status === "cancelled") {
        return { kind: "conflict", currentStatus: rows[0].status as HealthCaseStatus };
      }

      const inserted = await tx
        .insert(healthCaseEvents)
        .values({
          caseId: input.caseId,
          eventType: "note_added",
          actorStaffId: input.staffId,
          note: input.note,
        })
        .returning();
      const row = inserted[0];

      await tx.insert(auditLogs).values({
        actorType: "staff",
        actorId: input.staffId,
        action: "health.note_added",
        entityType: "health_cases",
        entityId: input.caseId,
        metadata: {},
      });

      // actorStaffName intentionally null here — the frontend always
      // invalidates and refetches the full case detail after posting a
      // note, whose own loadTimeline() join resolves the real name.
      return {
        kind: "success",
        event: {
          id: row.id,
          eventType: "note_added",
          note: row.note,
          actorStaffName: null,
          occurredAt: row.occurredAt.toISOString(),
        },
      };
    });
  }
}
