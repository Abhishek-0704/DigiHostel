import {
  sql,
  db,
  staff,
  students,
  leaveRequests,
  leaveApprovalEvents,
  leaveExitAuthorizations,
  movements,
  notifications,
} from "@digihostel/db";
import type {
  AnalyticsQueryInput,
  AnalyticsOverview,
  PresenceSummary,
  LeaveOverviewSummary,
  MovementOverviewSummary,
  NotificationOverviewSummary,
  LeaveTrendResult,
  MovementTrendResult,
  TrendPoint,
  HourBucket,
} from "./types.js";

/**
 * Repository boundary for the Operational Intelligence & Executive
 * Analytics Dashboard (Phase 6, Prompt 15). Runs on Fastify's own
 * service-role Postgres connection, same as every other repository in this
 * codebase (ADR-006/ADR-014) — a pure READ layer over tables already owned
 * and written by their own certified domains:
 *
 *   - `students`/`leave_requests`/`leave_exit_authorizations`/`movements`
 *     — Student Operations / Leave / Movement domains (Prompts 7-9).
 *   - `leave_approval_events` — Parent Approval domain (ADR-015).
 *   - `notifications` — Notification delivery domain (ADR-018).
 *
 * This repository never writes to any of these tables, never duplicates
 * their state into a new table, and never returns a fabricated value —
 * every field either comes from a real aggregate query over the caller's
 * own authorized scope, or is `null` when the underlying data cannot
 * support it (see each field's own doc comment in `types.ts`).
 *
 * Hostel scope, exactly matching every other domain's established
 * discipline (`leave/repository.ts`'s `hostelScopedForStaff`,
 * `emergency|health/repository.ts`'s `scopeCheck`): `hostel_admin` is
 * ALWAYS forced to their own resolved hostel, `super_admin` is ALWAYS
 * unscoped — no client-supplied hostel filter is ever trusted, and (per
 * Prompt 15 §16's own instruction not to invent behavior beyond the
 * existing certified policy) no optional super_admin hostel-narrowing
 * filter is introduced either, since no other domain in this codebase
 * offers one.
 */

function scopeCondition(scope: { staffId: string; staffRole: "hostel_admin" | "super_admin" }) {
  if (scope.staffRole === "super_admin") return sql`true`;
  return sql`exists (
    select 1 from ${staff} s
    where s.id = ${scope.staffId} and s.hostel_id = ${students.hostelId}
  )`;
}

function toNumber(v: string | number | null | undefined): number {
  return Number(v ?? 0);
}

function toNullableMinutes(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Fills every day in `[from, to]` (inclusive, UTC calendar days) with a
 * real `count: 0` for any day the query returned no row for — a day with
 * genuinely zero events is a real zero, not an omission (Prompt 15 §30:
 * "never silently return zero" is about FABRICATING data, not about
 * padding a real, fully-queried time series with real zero counts for
 * days a GROUP BY naturally omits). */
function fillDayBuckets(
  rows: { day: string; count: string }[],
  from: string,
  to: string,
): TrendPoint[] {
  const byDay = new Map(rows.map((r) => [r.day.slice(0, 10), Number(r.count)]));
  const points: TrendPoint[] = [];
  const cursor = new Date(`${from.slice(0, 10)}T00:00:00.000Z`);
  const end = new Date(`${to.slice(0, 10)}T00:00:00.000Z`);
  while (cursor.getTime() <= end.getTime()) {
    const key = cursor.toISOString().slice(0, 10);
    points.push({ date: key, count: byDay.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return points;
}

function fillHourBuckets(rows: { hour: number; count: string }[]): HourBucket[] {
  const byHour = new Map(rows.map((r) => [Number(r.hour), Number(r.count)]));
  return Array.from({ length: 24 }, (_, hour) => ({ hour, count: byHour.get(hour) ?? 0 }));
}

export interface AnalyticsRepository {
  getPresence(scope: {
    staffId: string;
    staffRole: "hostel_admin" | "super_admin";
  }): Promise<PresenceSummary>;
  getOverview(input: AnalyticsQueryInput): Promise<AnalyticsOverview>;
  getLeaveTrend(input: AnalyticsQueryInput): Promise<LeaveTrendResult>;
  getMovementTrend(input: AnalyticsQueryInput): Promise<MovementTrendResult>;
}

export class DrizzleAnalyticsRepository implements AnalyticsRepository {
  /** Verbatim port of `DrizzleStudentRepository.getHostelPresenceSummary()`
   * (Phase 4, Prompt 9 remediation) — that method was deliberately left
   * unwired to any route ("presentation is intentionally deferred," per
   * its own doc comment); this is the first route it is exposed through.
   * Not re-derived independently — kept identical so the two can never
   * silently disagree if both were ever queried side by side. */
  async getPresence(scope: {
    staffId: string;
    staffRole: "hostel_admin" | "super_admin";
  }): Promise<PresenceSummary> {
    const condition = scopeCondition(scope);
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
      where ${condition}
    `);
    const row = rows[0] ?? { total: "0", outside: "0" };
    const totalStudents = toNumber(row.total);
    const studentsOutside = toNumber(row.outside);
    return { totalStudents, studentsOutside, studentsInside: totalStudents - studentsOutside };
  }

  async getOverview(input: AnalyticsQueryInput): Promise<AnalyticsOverview> {
    const condition = scopeCondition(input);
    const [presence, leave, movement, notificationsSummary] = await Promise.all([
      this.getPresence(input),
      this.getLeaveOverview(input, condition),
      this.getMovementOverview(input, condition),
      this.getNotificationOverview(input, condition),
    ]);
    return {
      periodFrom: input.dateFrom,
      periodTo: input.dateTo,
      presence,
      leave,
      movement,
      notifications: notificationsSummary,
    };
  }

  private async getLeaveOverview(
    input: AnalyticsQueryInput,
    scopeSql: ReturnType<typeof scopeCondition>,
  ): Promise<LeaveOverviewSummary> {
    const rows = await db.execute<{
      pending_now: string;
      created_in_period: string;
      approved_in_period: string;
      rejected_in_period: string;
      expired_in_period: string;
      avg_response_minutes: string | null;
    }>(sql`
      with scoped_requests as (
        select ${leaveRequests.id} as id, ${leaveRequests.status} as status,
               ${leaveRequests.createdAt} as created_at
        from ${leaveRequests}
        join ${students} on ${students.id} = ${leaveRequests.studentId}
        where ${scopeSql}
      ),
      scoped_events as (
        select e.leave_request_id, e.event_type, e.response, e.occurred_at
        from ${leaveApprovalEvents} e
        join scoped_requests sr on sr.id = e.leave_request_id
      ),
      response_pairs as (
        select
          leave_request_id,
          min(occurred_at) filter (where event_type = 'manual_override') as sent_at,
          min(occurred_at) filter (where event_type = 'responded') as responded_at
        from scoped_events
        group by leave_request_id
      )
      select
        (select count(*) from scoped_requests where status = 'pending') as pending_now,
        (select count(*) from scoped_requests where created_at >= ${input.dateFrom} and created_at <= ${input.dateTo}) as created_in_period,
        (select count(*) from scoped_events where event_type = 'responded' and response = 'approved' and occurred_at >= ${input.dateFrom} and occurred_at <= ${input.dateTo}) as approved_in_period,
        (select count(*) from scoped_events where event_type = 'responded' and response = 'rejected' and occurred_at >= ${input.dateFrom} and occurred_at <= ${input.dateTo}) as rejected_in_period,
        (select count(*) from scoped_events where event_type = 'expired' and occurred_at >= ${input.dateFrom} and occurred_at <= ${input.dateTo}) as expired_in_period,
        (
          select avg(extract(epoch from (rp.responded_at - rp.sent_at)) / 60.0)
          from response_pairs rp
          where rp.sent_at is not null and rp.responded_at is not null and rp.responded_at > rp.sent_at
            and rp.responded_at >= ${input.dateFrom} and rp.responded_at <= ${input.dateTo}
        ) as avg_response_minutes
    `);
    const row = rows[0];
    const approvedInPeriod = toNumber(row?.approved_in_period);
    const rejectedInPeriod = toNumber(row?.rejected_in_period);
    const decided = approvedInPeriod + rejectedInPeriod;
    return {
      pendingNow: toNumber(row?.pending_now),
      createdInPeriod: toNumber(row?.created_in_period),
      approvedInPeriod,
      rejectedInPeriod,
      expiredInPeriod: toNumber(row?.expired_in_period),
      approvalRate: decided === 0 ? null : Math.round((approvedInPeriod / decided) * 10000) / 10000,
      avgResponseMinutes: toNullableMinutes(row?.avg_response_minutes),
    };
  }

  private async getMovementOverview(
    input: AnalyticsQueryInput,
    scopeSql: ReturnType<typeof scopeCondition>,
  ): Promise<MovementOverviewSummary> {
    const rows = await db.execute<{
      returns_in_period: string;
      avg_duration_minutes: string | null;
    }>(sql`
      with scoped_movements as (
        select mv.id, mv.occurred_at, mv.leave_request_id
        from ${movements} mv
        join ${students} on ${students.id} = mv.student_id
        where mv.movement_type = 'hostel_return' and ${scopeSql}
          and mv.occurred_at >= ${input.dateFrom} and mv.occurred_at <= ${input.dateTo}
      )
      select
        count(*) as returns_in_period,
        avg(extract(epoch from (sm.occurred_at - lxa.authorized_at)) / 60.0) as avg_duration_minutes
      from scoped_movements sm
      left join ${leaveExitAuthorizations} lxa on lxa.leave_request_id = sm.leave_request_id
    `);
    const row = rows[0];
    return {
      returnsInPeriod: toNumber(row?.returns_in_period),
      avgDurationMinutes: toNullableMinutes(row?.avg_duration_minutes),
    };
  }

  private async getNotificationOverview(
    input: AnalyticsQueryInput,
    scopeSql: ReturnType<typeof scopeCondition>,
  ): Promise<NotificationOverviewSummary> {
    // `notifications` has no hostel_id of its own — hostel relevance is
    // resolved by joining its (nullable) related_leave_request_id back to
    // leave_requests -> students, mirroring audit.ts's own polymorphic
    // resolution discipline. A notification with no related leave request
    // (none exist today — library-pass notifications are unimplemented)
    // resolves to no matching student and is correctly excluded from every
    // hostel-scoped count, visible only to super_admin (scopeSql = true).
    const rows = await db.execute<{
      generated_in_period: string;
      delivered_in_period: string;
      failed_in_period: string;
    }>(sql`
      with scoped_notifications as (
        select n.id, n.status, n.created_at, n.delivered_at
        from ${notifications} n
        join ${leaveRequests} lr on lr.id = n.related_leave_request_id
        join ${students} on ${students.id} = lr.student_id
        where ${scopeSql}
      )
      select
        (select count(*) from scoped_notifications where created_at >= ${input.dateFrom} and created_at <= ${input.dateTo}) as generated_in_period,
        (select count(*) from scoped_notifications where delivered_at is not null and delivered_at >= ${input.dateFrom} and delivered_at <= ${input.dateTo}) as delivered_in_period,
        (select count(*) from scoped_notifications where status = 'failed' and created_at >= ${input.dateFrom} and created_at <= ${input.dateTo}) as failed_in_period
    `);
    const row = rows[0];
    return {
      generatedInPeriod: toNumber(row?.generated_in_period),
      deliveredInPeriod: toNumber(row?.delivered_in_period),
      failedInPeriod: toNumber(row?.failed_in_period),
    };
  }

  async getLeaveTrend(input: AnalyticsQueryInput): Promise<LeaveTrendResult> {
    const condition = scopeCondition(input);
    const rows = await db.execute<{ day: string; kind: string; count: string }>(sql`
      with scoped_requests as (
        select ${leaveRequests.id} as id
        from ${leaveRequests}
        join ${students} on ${students.id} = ${leaveRequests.studentId}
        where ${condition}
      )
      select date_trunc('day', ${leaveRequests.createdAt})::date::text as day, 'created' as kind, count(*) as count
      from ${leaveRequests}
      where ${leaveRequests.id} in (select id from scoped_requests)
        and ${leaveRequests.createdAt} >= ${input.dateFrom} and ${leaveRequests.createdAt} <= ${input.dateTo}
      group by 1
      union all
      select date_trunc('day', e.occurred_at)::date::text as day, 'approved' as kind, count(*) as count
      from ${leaveApprovalEvents} e
      where e.leave_request_id in (select id from scoped_requests)
        and e.event_type = 'responded' and e.response = 'approved'
        and e.occurred_at >= ${input.dateFrom} and e.occurred_at <= ${input.dateTo}
      group by 1
      union all
      select date_trunc('day', e.occurred_at)::date::text as day, 'rejected' as kind, count(*) as count
      from ${leaveApprovalEvents} e
      where e.leave_request_id in (select id from scoped_requests)
        and e.event_type = 'responded' and e.response = 'rejected'
        and e.occurred_at >= ${input.dateFrom} and e.occurred_at <= ${input.dateTo}
      group by 1
    `);
    const created = rows.filter((r) => r.kind === "created");
    const approved = rows.filter((r) => r.kind === "approved");
    const rejected = rows.filter((r) => r.kind === "rejected");
    return {
      periodFrom: input.dateFrom,
      periodTo: input.dateTo,
      createdByDay: fillDayBuckets(created, input.dateFrom, input.dateTo),
      approvedByDay: fillDayBuckets(approved, input.dateFrom, input.dateTo),
      rejectedByDay: fillDayBuckets(rejected, input.dateFrom, input.dateTo),
    };
  }

  async getMovementTrend(input: AnalyticsQueryInput): Promise<MovementTrendResult> {
    const condition = scopeCondition(input);
    const [dayRows, hourRows] = await Promise.all([
      db.execute<{ day: string; count: string }>(sql`
        select date_trunc('day', mv.occurred_at)::date::text as day, count(*) as count
        from ${movements} mv
        join ${students} on ${students.id} = mv.student_id
        where mv.movement_type = 'hostel_return' and ${condition}
          and mv.occurred_at >= ${input.dateFrom} and mv.occurred_at <= ${input.dateTo}
        group by 1
      `),
      db.execute<{ hour: number; count: string }>(sql`
        select extract(hour from mv.occurred_at)::int as hour, count(*) as count
        from ${movements} mv
        join ${students} on ${students.id} = mv.student_id
        where mv.movement_type = 'hostel_return' and ${condition}
          and mv.occurred_at >= ${input.dateFrom} and mv.occurred_at <= ${input.dateTo}
        group by 1
      `),
    ]);
    return {
      periodFrom: input.dateFrom,
      periodTo: input.dateTo,
      returnsByDay: fillDayBuckets(dayRows, input.dateFrom, input.dateTo),
      returnsByHour: fillHourBuckets(hourRows),
    };
  }
}
