import { and, asc, desc, eq, gte, lte, inArray, notInArray, sql, db, alias } from "@digihostel/db";
import {
  students,
  hostels,
  rooms,
  staff,
  securityIncidents,
  securityIncidentEvents,
  auditLogs,
} from "@digihostel/db";
import {
  EMERGENCY_CATEGORIES,
  EMERGENCY_TRANSITIONS,
  type StaffScopeInput,
  type EmergencyListInput,
  type EmergencyListResult,
  type EmergencyListItemView,
  type EmergencyDetailView,
  type EmergencyEventView,
  type EmergencyStatistics,
  type EmergencyCreateInput,
  type EmergencyTransitionInput,
  type EmergencyNoteInput,
  type EmergencyTransitionAction,
  type EmergencyStatus,
} from "./types.js";

/**
 * Repository boundary for the Emergency Operations Center (Phase 4, Prompt
 * 10). Runs on the same privileged Postgres connection every other backend
 * repository uses — Fastify's own connection is service-role and bypasses
 * RLS by design (ADR-006/ADR-014); hostel-scope authorization is therefore
 * enforced HERE, in application code, mirroring
 * `DrizzleStudentRepository`'s/`DrizzleMovementRepository`'s identical
 * pattern. Every query additionally filters
 * `incident_type IN (the 8 emergency categories)` — this domain never
 * reads/writes the ORIGINAL `missed_checkpoint`/`manual_flag` rows that
 * belong to the separate, still-unbuilt checkpoint-monitoring domain.
 */

const assignedStaff = alias(staff, "assigned_staff");
const actorStaff = alias(staff, "actor_staff");

// Self-contained (joins staff -> students itself via the incident's own
// student_id) rather than assuming an outer `students` join is already
// present in the surrounding query — required for transition()/addNote(),
// whose UPDATE/SELECT-for-update statements have no such join, and safe to
// reuse identically for list()/getById()/create() which do join `students`
// (mirrors DrizzleMovementRepository's own identical scopeCheck shape).
const scopeCheck = (scope: StaffScopeInput) =>
  scope.staffRole === "super_admin"
    ? sql`true`
    : sql`exists (
        select 1 from ${staff} s
        join ${students} st on st.hostel_id = s.hostel_id
        where s.id = ${scope.staffId} and st.id = ${securityIncidents.studentId}
      )`;

const categoryFilter = sql`${securityIncidents.incidentType} in ${EMERGENCY_CATEGORIES}`;

function searchCondition(query: string | undefined) {
  if (!query || query.trim() === "") return sql`true`;
  const prefix = `${query.trim()}%`;
  return sql`(lower(${students.fullName}) like lower(${prefix}) or lower(${students.rollNumber}) like lower(${prefix}))`;
}

function toListItem(row: {
  id: string;
  studentId: string;
  studentFullName: string;
  studentRollNumber: string;
  hostelId: string | null;
  hostelName: string | null;
  roomNumber: string | null;
  incidentType: string;
  severity: string | null;
  status: string;
  createdAt: Date;
  assignedStaffId: string | null;
  assignedStaffName: string | null;
}): EmergencyListItemView {
  return {
    id: row.id,
    studentId: row.studentId,
    studentFullName: row.studentFullName,
    studentRollNumber: row.studentRollNumber,
    hostelId: row.hostelId,
    hostelName: row.hostelName,
    roomNumber: row.roomNumber,
    category: row.incidentType as EmergencyListItemView["category"],
    severity: (row.severity ?? "medium") as EmergencyListItemView["severity"],
    status: row.status as EmergencyStatus,
    reportedAt: row.createdAt.toISOString(),
    assignedStaffId: row.assignedStaffId,
    assignedStaffName: row.assignedStaffName,
  };
}

export type EmergencyCreateOutcome =
  { kind: "success"; incident: EmergencyDetailView } | { kind: "student_not_found" };

export type EmergencyTransitionOutcome =
  | { kind: "success"; incident: EmergencyDetailView }
  | { kind: "not_found" }
  | { kind: "conflict"; currentStatus: EmergencyStatus };

export type EmergencyNoteOutcome =
  | { kind: "success"; event: EmergencyEventView }
  | { kind: "not_found" }
  | { kind: "conflict"; currentStatus: EmergencyStatus };

export interface EmergencyRepository {
  list(input: EmergencyListInput): Promise<EmergencyListResult>;
  getById(incidentId: string, scope: StaffScopeInput): Promise<EmergencyDetailView | null>;
  getStatistics(scope: StaffScopeInput): Promise<EmergencyStatistics>;
  create(input: EmergencyCreateInput): Promise<EmergencyCreateOutcome>;
  transition(
    action: EmergencyTransitionAction,
    input: EmergencyTransitionInput,
  ): Promise<EmergencyTransitionOutcome>;
  addNote(input: EmergencyNoteInput): Promise<EmergencyNoteOutcome>;
}

async function loadTimeline(incidentId: string): Promise<EmergencyEventView[]> {
  const rows = await db
    .select({
      id: securityIncidentEvents.id,
      eventType: securityIncidentEvents.eventType,
      note: securityIncidentEvents.note,
      actorStaffName: actorStaff.fullName,
      occurredAt: securityIncidentEvents.occurredAt,
    })
    .from(securityIncidentEvents)
    .leftJoin(actorStaff, eq(actorStaff.id, securityIncidentEvents.actorStaffId))
    .where(eq(securityIncidentEvents.incidentId, incidentId))
    .orderBy(asc(securityIncidentEvents.occurredAt));

  return rows.map((r) => ({
    id: r.id,
    eventType: r.eventType as EmergencyEventView["eventType"],
    note: r.note,
    actorStaffName: r.actorStaffName,
    occurredAt: r.occurredAt.toISOString(),
  }));
}

async function loadDetail(
  incidentId: string,
  scope: StaffScopeInput,
): Promise<EmergencyDetailView | null> {
  const rows = await db
    .select({
      id: securityIncidents.id,
      studentId: securityIncidents.studentId,
      studentFullName: students.fullName,
      studentRollNumber: students.rollNumber,
      hostelId: students.hostelId,
      hostelName: hostels.name,
      roomNumber: rooms.roomNumber,
      incidentType: securityIncidents.incidentType,
      severity: securityIncidents.severity,
      status: securityIncidents.status,
      description: securityIncidents.description,
      createdAt: securityIncidents.createdAt,
      resolvedAt: securityIncidents.resolvedAt,
      closedAt: securityIncidents.closedAt,
      assignedStaffId: securityIncidents.assignedStaffId,
      assignedStaffName: assignedStaff.fullName,
    })
    .from(securityIncidents)
    .innerJoin(students, eq(students.id, securityIncidents.studentId))
    .leftJoin(hostels, eq(hostels.id, students.hostelId))
    .leftJoin(rooms, eq(rooms.id, students.roomId))
    .leftJoin(assignedStaff, eq(assignedStaff.id, securityIncidents.assignedStaffId))
    .where(and(eq(securityIncidents.id, incidentId), categoryFilter, scopeCheck(scope)))
    .limit(1);

  if (rows.length === 0) return null;
  const row = rows[0];
  const timeline = await loadTimeline(incidentId);

  return {
    ...toListItem(row),
    description: row.description,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    timeline,
  };
}

export class DrizzleEmergencyRepository implements EmergencyRepository {
  async list(input: EmergencyListInput): Promise<EmergencyListResult> {
    const conditions = [categoryFilter, scopeCheck(input), searchCondition(input.query)];
    if (input.categories && input.categories.length > 0) {
      conditions.push(inArray(securityIncidents.incidentType, input.categories));
    }
    if (input.severities && input.severities.length > 0) {
      conditions.push(inArray(securityIncidents.severity, input.severities));
    }
    if (input.statuses && input.statuses.length > 0) {
      conditions.push(inArray(securityIncidents.status, input.statuses));
    } else if (input.activeOnly) {
      conditions.push(notInArray(securityIncidents.status, ["resolved", "closed"]));
    }
    if (input.dateFrom) {
      conditions.push(gte(securityIncidents.createdAt, new Date(input.dateFrom)));
    }
    if (input.dateTo) {
      conditions.push(lte(securityIncidents.createdAt, new Date(input.dateTo)));
    }
    const condition = and(...conditions);

    // `severity` is a Postgres enum declared ('critical','high','medium','low',
    // 'informational') in exactly that order — Postgres orders enum values by
    // declaration order, so ORDER BY severity ASC naturally means "most
    // severe first" without a fabricated CASE expression.
    const sortColumn =
      input.sortBy === "severity" ? securityIncidents.severity : securityIncidents.createdAt;
    const orderFn = input.sortDir === "desc" ? desc : asc;

    const [rows, countRows] = await Promise.all([
      db
        .select({
          id: securityIncidents.id,
          studentId: securityIncidents.studentId,
          studentFullName: students.fullName,
          studentRollNumber: students.rollNumber,
          hostelId: students.hostelId,
          hostelName: hostels.name,
          roomNumber: rooms.roomNumber,
          incidentType: securityIncidents.incidentType,
          severity: securityIncidents.severity,
          status: securityIncidents.status,
          createdAt: securityIncidents.createdAt,
          assignedStaffId: securityIncidents.assignedStaffId,
          assignedStaffName: assignedStaff.fullName,
        })
        .from(securityIncidents)
        .innerJoin(students, eq(students.id, securityIncidents.studentId))
        .leftJoin(hostels, eq(hostels.id, students.hostelId))
        .leftJoin(rooms, eq(rooms.id, students.roomId))
        .leftJoin(assignedStaff, eq(assignedStaff.id, securityIncidents.assignedStaffId))
        .where(condition)
        .orderBy(orderFn(sortColumn), asc(securityIncidents.id))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      db
        .select({ count: sql<string>`count(*)` })
        .from(securityIncidents)
        .innerJoin(students, eq(students.id, securityIncidents.studentId))
        .where(condition),
    ]);

    return {
      items: rows.map(toListItem),
      total: Number(countRows[0]?.count ?? 0),
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  async getById(incidentId: string, scope: StaffScopeInput): Promise<EmergencyDetailView | null> {
    return loadDetail(incidentId, scope);
  }

  async getStatistics(scope: StaffScopeInput): Promise<EmergencyStatistics> {
    const condition = and(categoryFilter, scopeCheck(scope));
    const rows = await db
      .select({
        active: sql<string>`count(*) filter (where ${securityIncidents.status} in ('open','acknowledged','in_progress'))`,
        critical: sql<string>`count(*) filter (where ${securityIncidents.severity} = 'critical' and ${securityIncidents.status} in ('open','acknowledged','in_progress'))`,
        open: sql<string>`count(*) filter (where ${securityIncidents.status} = 'open')`,
        acknowledged: sql<string>`count(*) filter (where ${securityIncidents.status} = 'acknowledged')`,
        inProgress: sql<string>`count(*) filter (where ${securityIncidents.status} = 'in_progress')`,
        resolvedToday: sql<string>`count(*) filter (where ${securityIncidents.status} = 'resolved' and ${securityIncidents.resolvedAt} >= date_trunc('day', now()))`,
      })
      .from(securityIncidents)
      .innerJoin(students, eq(students.id, securityIncidents.studentId))
      .where(condition);

    const row = rows[0];
    return {
      active: Number(row?.active ?? 0),
      critical: Number(row?.critical ?? 0),
      open: Number(row?.open ?? 0),
      acknowledged: Number(row?.acknowledged ?? 0),
      inProgress: Number(row?.inProgress ?? 0),
      resolvedToday: Number(row?.resolvedToday ?? 0),
    };
  }

  async create(input: EmergencyCreateInput): Promise<EmergencyCreateOutcome> {
    const studentScope =
      input.staffRole === "super_admin"
        ? sql`true`
        : sql`exists (select 1 from ${staff} s where s.id = ${input.staffId} and s.hostel_id = ${students.hostelId})`;

    // `loadDetail` is deliberately called AFTER this transaction commits
    // (using the top-level `db` connection, not `tx`) — a query issued via a
    // different connection while `tx` is still open cannot see its
    // uncommitted insert (READ COMMITTED isolation), so re-querying inside
    // the callback would race against its own not-yet-committed write.
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
        .insert(securityIncidents)
        .values({
          studentId,
          incidentType: input.category,
          status: "open",
          severity: input.severity,
          description: input.description,
        })
        .returning({ id: securityIncidents.id });
      const incidentId = inserted[0].id;

      await tx.insert(securityIncidentEvents).values({
        incidentId,
        eventType: "created",
        actorStaffId: input.staffId,
      });

      await tx.insert(auditLogs).values({
        actorType: "staff",
        actorId: input.staffId,
        action: "emergency.incident_reported",
        entityType: "security_incidents",
        entityId: incidentId,
        metadata: { category: input.category, severity: input.severity },
      });

      return { kind: "success" as const, incidentId };
    });

    if (outcome.kind === "student_not_found") return outcome;
    const incident = await loadDetail(outcome.incidentId, input);
    return { kind: "success", incident: incident! };
  }

  async transition(
    action: EmergencyTransitionAction,
    input: EmergencyTransitionInput,
  ): Promise<EmergencyTransitionOutcome> {
    const { from, to, eventType } = EMERGENCY_TRANSITIONS[action];
    const scope = scopeCheck(input);

    // Same "load AFTER commit" discipline as create() above.
    const outcome = await db.transaction(async (tx) => {
      const setValues: Record<string, unknown> = { status: to };
      if (to === "acknowledged") setValues.assignedStaffId = input.staffId;
      if (to === "resolved") setValues.resolvedAt = new Date();
      if (to === "closed") setValues.closedAt = new Date();

      const updated = await tx
        .update(securityIncidents)
        .set(setValues)
        .where(
          and(
            eq(securityIncidents.id, input.incidentId),
            eq(securityIncidents.status, from),
            categoryFilter,
            scope,
          ),
        )
        .returning({ id: securityIncidents.id });

      if (updated.length === 0) {
        const existing = await tx
          .select({ status: securityIncidents.status })
          .from(securityIncidents)
          .innerJoin(students, eq(students.id, securityIncidents.studentId))
          .where(and(eq(securityIncidents.id, input.incidentId), categoryFilter, scope))
          .limit(1);

        if (existing.length === 0) return { kind: "not_found" as const };
        return {
          kind: "conflict" as const,
          currentStatus: existing[0].status as EmergencyStatus,
        };
      }

      await tx.insert(securityIncidentEvents).values({
        incidentId: input.incidentId,
        eventType,
        actorStaffId: input.staffId,
      });

      await tx.insert(auditLogs).values({
        actorType: "staff",
        actorId: input.staffId,
        action: `emergency.incident_${action}`,
        entityType: "security_incidents",
        entityId: input.incidentId,
        metadata: { from, to },
      });

      return { kind: "success" as const };
    });

    if (outcome.kind !== "success") return outcome;
    const incident = await loadDetail(input.incidentId, input);
    return { kind: "success", incident: incident! };
  }

  async addNote(input: EmergencyNoteInput): Promise<EmergencyNoteOutcome> {
    const scope = scopeCheck(input);

    return db.transaction(async (tx) => {
      const rows = await tx
        .select({ status: securityIncidents.status })
        .from(securityIncidents)
        .innerJoin(students, eq(students.id, securityIncidents.studentId))
        .where(and(eq(securityIncidents.id, input.incidentId), categoryFilter, scope))
        .for("update")
        .limit(1);

      if (rows.length === 0) return { kind: "not_found" };
      if (rows[0].status === "closed") {
        return { kind: "conflict", currentStatus: "closed" };
      }

      const inserted = await tx
        .insert(securityIncidentEvents)
        .values({
          incidentId: input.incidentId,
          eventType: "note_added",
          actorStaffId: input.staffId,
          note: input.note,
        })
        .returning();
      const row = inserted[0];

      await tx.insert(auditLogs).values({
        actorType: "staff",
        actorId: input.staffId,
        action: "emergency.note_added",
        entityType: "security_incidents",
        entityId: input.incidentId,
        metadata: {},
      });

      // actorStaffName intentionally null here (no staff join in this
      // insert-only path) — the frontend always invalidates and refetches
      // the full incident detail after posting a note (same
      // invalidate-and-refetch convention as useRecordHostelReturn), whose
      // own `loadTimeline()` join resolves the real name.
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
