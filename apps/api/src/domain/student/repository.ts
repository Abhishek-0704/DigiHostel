import {
  and,
  asc,
  desc,
  eq,
  sql,
  db,
  students,
  hostels,
  rooms,
  staff,
  parents,
  parentStudentRelationships,
  leaveRequests,
  leaveApprovalEvents,
  leaveExitAuthorizations,
  movements,
} from "@digihostel/db";
import type {
  StaffScopeInput,
  StudentSearchInput,
  StudentSearchResult,
  StudentSearchResultItem,
  StudentProfileView,
  StudentGuardianView,
  StudentCurrentLeaveView,
  StudentTimelineEventView,
  HostelPresence,
} from "./types.js";

/** Server-side derived hostel-occupancy summary (Phase 4, Prompt 9
 * remediation, closing the "hostel occupancy" condition). Deliberately NOT
 * a stored counter/table — computed from the exact same authoritative
 * signals as `StudentProfileView.hostelPresence`, applied over each in-scope
 * student's own most recent leave request, so the two are always
 * consistent by construction. Not currently exposed by any route (no
 * dashboard in this repository consumes it yet) — see
 * `apps/reception-dashboard/docs/movement-engine.md` §12 for why this is
 * implemented and tested now but its presentation is deliberately
 * deferred. */
export interface HostelPresenceSummary {
  totalStudents: number;
  studentsInside: number;
  studentsOutside: number;
}

/**
 * Repository boundary for the Student Operations Center (Phase 4, Prompt 8).
 * Runs on the same privileged Postgres connection every other backend
 * repository uses (@digihostel/db's `db`) — Fastify's own connection is
 * service-role and bypasses RLS by design (ADR-006/ADR-014, unchanged);
 * hostel-scope authorization is therefore enforced HERE, in application
 * code, mirroring `DrizzleLeaveRepository`'s identical `hostelScopedForStaff`
 * pattern exactly rather than inventing a second scoping mechanism.
 */

export interface StudentRepository {
  /** Server-side search: case-insensitive PREFIX match on full_name OR
   * roll_number, hostel-scoped, paginated, deterministically ordered (the
   * requested sort field plus `id` as a tie-breaker, so pagination never
   * produces duplicate/skipped rows across pages when two students share a
   * sort key). Never loads the caller's whole in-scope population into
   * memory to filter client-side. */
  search(input: StudentSearchInput): Promise<StudentSearchResult>;

  /** Returns `null` for both "no such student" and "exists but outside the
   * caller's hostel scope" — anti-enumeration, identical shape to
   * `findAccessibleLeaveRequestForStaff` (domain/leave/repository.ts). */
  getProfileByRollNumber(
    rollNumber: string,
    scope: StaffScopeInput,
  ): Promise<StudentProfileView | null>;
}

const hostelScopedForStaff = (staffId: string) => sql`exists (
  select 1 from ${staff} s
  where s.id = ${staffId} and s.hostel_id = ${students.hostelId}
)`;

function searchCondition(query: string | undefined) {
  if (!query || query.trim() === "") return sql`true`;
  const prefix = `${query.trim()}%`;
  return sql`(lower(${students.fullName}) like lower(${prefix}) or lower(${students.rollNumber}) like lower(${prefix}))`;
}

function toSearchResultItem(row: {
  id: string;
  rollNumber: string;
  fullName: string;
  hostelId: string | null;
  hostelName: string | null;
  roomId: string | null;
  roomNumber: string | null;
}): StudentSearchResultItem {
  return {
    id: row.id,
    rollNumber: row.rollNumber,
    fullName: row.fullName,
    hostelId: row.hostelId,
    hostelName: row.hostelName,
    roomId: row.roomId,
    roomNumber: row.roomNumber,
  };
}

export class DrizzleStudentRepository implements StudentRepository {
  async search(input: StudentSearchInput): Promise<StudentSearchResult> {
    const scopeCheck =
      input.staffRole === "super_admin" ? sql`true` : hostelScopedForStaff(input.staffId);
    const condition = and(scopeCheck, searchCondition(input.query));

    const sortColumn = input.sortBy === "rollNumber" ? students.rollNumber : students.fullName;
    const orderFn = input.sortDir === "desc" ? desc : asc;

    const [rows, countRows] = await Promise.all([
      db
        .select({
          id: students.id,
          rollNumber: students.rollNumber,
          fullName: students.fullName,
          hostelId: students.hostelId,
          hostelName: hostels.name,
          roomId: students.roomId,
          roomNumber: rooms.roomNumber,
        })
        .from(students)
        .leftJoin(hostels, eq(hostels.id, students.hostelId))
        .leftJoin(rooms, eq(rooms.id, students.roomId))
        .where(condition)
        .orderBy(orderFn(sortColumn), asc(students.id))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      db
        .select({ count: sql<string>`count(*)` })
        .from(students)
        .where(condition),
    ]);

    return {
      items: rows.map(toSearchResultItem),
      total: Number(countRows[0]?.count ?? 0),
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  async getProfileByRollNumber(
    rollNumber: string,
    scope: StaffScopeInput,
  ): Promise<StudentProfileView | null> {
    const scopeCheck =
      scope.staffRole === "super_admin" ? sql`true` : hostelScopedForStaff(scope.staffId);

    const studentRows = await db
      .select({
        id: students.id,
        rollNumber: students.rollNumber,
        fullName: students.fullName,
        hostelId: students.hostelId,
        hostelName: hostels.name,
        roomId: students.roomId,
        roomNumber: rooms.roomNumber,
      })
      .from(students)
      .leftJoin(hostels, eq(hostels.id, students.hostelId))
      .leftJoin(rooms, eq(rooms.id, students.roomId))
      .where(and(eq(students.rollNumber, rollNumber), scopeCheck))
      .limit(1);

    if (studentRows.length === 0) return null;
    const studentRow = studentRows[0];

    const [guardianRows, currentLeaveRows] = await Promise.all([
      db
        .select({
          fullName: parents.fullName,
          relationshipType: parentStudentRelationships.relationshipType,
          phoneNumber: parents.phoneNumber,
        })
        .from(parentStudentRelationships)
        .innerJoin(parents, eq(parents.id, parentStudentRelationships.parentId))
        .where(eq(parentStudentRelationships.studentId, studentRow.id))
        .orderBy(asc(parentStudentRelationships.escalationOrder)),
      db
        .select()
        .from(leaveRequests)
        .where(eq(leaveRequests.studentId, studentRow.id))
        .orderBy(desc(leaveRequests.createdAt))
        .limit(1),
    ]);

    const guardians: StudentGuardianView[] = guardianRows.map((g) => ({
      fullName: g.fullName,
      relationshipType: g.relationshipType,
      phoneNumber: g.phoneNumber,
    }));

    let currentLeave: StudentCurrentLeaveView | null = null;
    let timeline: StudentTimelineEventView[] = [];

    if (currentLeaveRows.length > 0) {
      const lr = currentLeaveRows[0];
      const [exitAuthRows, returnRows, eventRows] = await Promise.all([
        db
          .select({ authorizedAt: leaveExitAuthorizations.authorizedAt })
          .from(leaveExitAuthorizations)
          .where(eq(leaveExitAuthorizations.leaveRequestId, lr.id))
          .limit(1),
        // Phase 4, Prompt 9 — Movement Engine. `movement_type = 'hostel_return'`
        // is implicit today (the only value the enum has); not filtered
        // explicitly here since a future second movement type would need
        // its own dedicated view field anyway, not a shared one.
        db
          .select({ occurredAt: movements.occurredAt })
          .from(movements)
          .where(eq(movements.leaveRequestId, lr.id))
          .limit(1),
        db
          .select()
          .from(leaveApprovalEvents)
          .where(eq(leaveApprovalEvents.leaveRequestId, lr.id))
          .orderBy(asc(leaveApprovalEvents.occurredAt)),
      ]);

      currentLeave = {
        id: lr.id,
        status: lr.status,
        reason: lr.reason,
        startDate: lr.startDate,
        endDate: lr.endDate,
        createdAt: lr.createdAt.toISOString(),
        updatedAt: lr.updatedAt.toISOString(),
        exitAuthorized: exitAuthRows.length > 0,
        exitAuthorizedAt: exitAuthRows[0]?.authorizedAt.toISOString() ?? null,
        returnRecorded: returnRows.length > 0,
        returnedAt: returnRows[0]?.occurredAt.toISOString() ?? null,
      };

      timeline = eventRows.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        response: e.response,
        occurredAt: e.occurredAt.toISOString(),
      }));
    }

    // Server-derived, never persisted — see the `HostelPresence` doc
    // comment (types.ts) for the exact rule and its rationale.
    const hostelPresence: HostelPresence =
      currentLeave?.exitAuthorized && !currentLeave.returnRecorded
        ? "outside_hostel"
        : "inside_hostel";

    return {
      id: studentRow.id,
      rollNumber: studentRow.rollNumber,
      fullName: studentRow.fullName,
      hostelId: studentRow.hostelId,
      hostelName: studentRow.hostelName,
      roomId: studentRow.roomId,
      roomNumber: studentRow.roomNumber,
      guardians,
      currentLeave,
      timeline,
      hostelPresence,
    };
  }

  /** See `HostelPresenceSummary`'s own doc comment above for why this
   * exists but is not wired to any route. Scoped identically to
   * `search()`/`getProfileByRollNumber()` (own hostel for
   * reception_warden/hostel_admin, unscoped for super_admin). Each
   * student's "current leave" is its own most recent leave request by
   * `created_at` — the same single-most-recent-leave concept
   * `getProfileByRollNumber()` already uses — computed via `distinct on`
   * rather than a correlated-lateral join, since it needs no per-row
   * correlation with an outer query (it is the entire result). */
  async getHostelPresenceSummary(scope: StaffScopeInput): Promise<HostelPresenceSummary> {
    const scopeCheck =
      scope.staffRole === "super_admin" ? sql`true` : hostelScopedForStaff(scope.staffId);

    const rows = await db.execute<{ total: string; outside: string }>(sql`
      with latest_leave as (
        select distinct on (${leaveRequests.studentId})
          ${leaveRequests.id} as id,
          ${leaveRequests.studentId} as student_id
        from ${leaveRequests}
        order by ${leaveRequests.studentId}, ${leaveRequests.createdAt} desc
      )
      select
        count(*) as total,
        count(*) filter (where lxa.id is not null and mv.id is null) as outside
      from ${students}
      left join latest_leave ll on ll.student_id = ${students.id}
      left join ${leaveExitAuthorizations} lxa on lxa.leave_request_id = ll.id
      left join ${movements} mv
        on mv.leave_request_id = ll.id and mv.movement_type = 'hostel_return'
      where ${scopeCheck}
    `);

    const row = rows[0] ?? { total: "0", outside: "0" };
    const totalStudents = Number(row.total);
    const studentsOutside = Number(row.outside);
    return {
      totalStudents,
      studentsOutside,
      studentsInside: totalStudents - studentsOutside,
    };
  }
}
