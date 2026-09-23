import { sql, db } from "@digihostel/db";
import type {
  AuditListInput,
  AuditListItemView,
  AuditListResult,
  AuditStatistics,
} from "./types.js";
import { AUDIT_MODULES, type AuditModule } from "./types.js";

/**
 * Repository boundary for the Enterprise Audit Center (Phase 5, Prompt 12).
 * Runs on Fastify's own service-role connection, same as every other
 * repository in this codebase (ADR-006/ADR-014) — `audit_logs` itself has
 * zero client-facing RLS by design, so hostel-scope authorization is
 * enforced HERE, in application code, exactly mirroring
 * `DrizzleEmergencyRepository`'s/`DrizzleHealthRepository`'s established
 * `scopeCheck` pattern, extended to a polymorphic `entity_type`/`entity_id`
 * trail instead of a single owning table.
 *
 * `audit_logs` has no `hostel_id` column — a row's hostel relevance is
 * resolved by joining `entity_id` back to the table `entity_type` names,
 * then to that table's own student (or, for `staff`, directly). Rows whose
 * `entity_type` has no such join (`trusted_devices`,
 * `device_registration_challenges`) resolve to a NULL hostel and are
 * therefore correctly invisible to every hostel-scoped role by construction
 * (NULL never equals a real hostel id) — visible only to `super_admin`,
 * which bypasses the hostel filter entirely.
 */

const MODULE_CASE = sql`
  case
    when audit_logs.action like 'leave.%' then 'leave'
    when audit_logs.action like 'movement.%' then 'movement'
    when audit_logs.action like 'emergency.%' then 'emergency'
    when audit_logs.action like 'health.%' then 'health'
    when audit_logs.action like 'device.%' then 'device'
    when audit_logs.action like 'staff\_%' escape '\' then 'staff-auth'
    else 'other'
  end
`;

/** The shared resolution CTE every query below builds on — one row per
 * `audit_logs` entry, with module/hostel/student/actor already resolved via
 * LEFT JOINs (a row simply carries NULLs where a given entity_type doesn't
 * apply, never a spurious match — every join's ON clause is itself gated by
 * `entity_type =`/`actor_type =`). */
const RESOLVED_CTE = sql`
  with resolved as (
    select
      audit_logs.id as id,
      audit_logs.occurred_at as occurred_at,
      audit_logs.action as action,
      ${MODULE_CASE} as module,
      audit_logs.actor_type as actor_type,
      audit_logs.actor_id as actor_id,
      audit_logs.entity_type as entity_type,
      audit_logs.entity_id as entity_id,
      audit_logs.metadata as metadata,
      coalesce(lr_st.id, si_st.id, hc_st.id) as student_id,
      coalesce(lr_st.full_name, si_st.full_name, hc_st.full_name) as student_full_name,
      coalesce(lr_st.roll_number, si_st.roll_number, hc_st.roll_number) as student_roll_number,
      coalesce(lr_st.hostel_id, si_st.hostel_id, hc_st.hostel_id, staff_entity.hostel_id) as hostel_id,
      coalesce(staff_actor.full_name, parent_actor.full_name, student_actor.full_name) as actor_name,
      staff_actor.role as actor_role
    from audit_logs
    left join leave_requests lr
      on audit_logs.entity_type = 'leave_requests' and lr.id = audit_logs.entity_id
    left join students lr_st on lr_st.id = lr.student_id
    left join security_incidents si
      on audit_logs.entity_type = 'security_incidents' and si.id = audit_logs.entity_id
    left join students si_st on si_st.id = si.student_id
    left join health_cases hc
      on audit_logs.entity_type = 'health_cases' and hc.id = audit_logs.entity_id
    left join students hc_st on hc_st.id = hc.student_id
    left join staff staff_entity
      on audit_logs.entity_type = 'staff' and staff_entity.id = audit_logs.entity_id
    left join staff staff_actor
      on audit_logs.actor_type = 'staff' and staff_actor.id = audit_logs.actor_id
    left join parents parent_actor
      on audit_logs.actor_type = 'parent' and parent_actor.id = audit_logs.actor_id
    left join students student_actor
      on audit_logs.actor_type = 'student' and student_actor.id = audit_logs.actor_id
  )
`;

function buildFilters(input: {
  staffId: string;
  staffRole: "reception_warden" | "hostel_admin" | "super_admin";
  q?: string;
  modules?: AuditModule[];
  actorTypes?: string[];
  entityTypes?: string[];
  actorId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const conditions = [
    input.staffRole === "super_admin"
      ? sql`true`
      : sql`resolved.hostel_id in (select hostel_id from staff where id = ${input.staffId} and hostel_id is not null)`,
  ];
  // Drizzle's `sql` tag spreads a plain JS array interpolated via `${...}`
  // into individually-parameterized, comma-separated values (for native
  // `IN (...)` usage) rather than a single Postgres array parameter — using
  // `= any($n::text[])` here sent a bare scalar where an array-literal
  // string was expected and failed with "malformed array literal". `IN
  // (...)` is both correct for this driver behavior and the standard SQL
  // form anyway.
  if (input.modules && input.modules.length > 0) {
    conditions.push(
      sql`resolved.module in (${sql.join(
        input.modules.map((m) => sql`${m}`),
        sql`, `,
      )})`,
    );
  }
  if (input.actorTypes && input.actorTypes.length > 0) {
    conditions.push(
      sql`resolved.actor_type in (${sql.join(
        input.actorTypes.map((t) => sql`${t}`),
        sql`, `,
      )})`,
    );
  }
  if (input.entityTypes && input.entityTypes.length > 0) {
    conditions.push(
      sql`resolved.entity_type in (${sql.join(
        input.entityTypes.map((t) => sql`${t}`),
        sql`, `,
      )})`,
    );
  }
  if (input.actorId) {
    conditions.push(sql`resolved.actor_id = ${input.actorId}`);
  }
  if (input.dateFrom) {
    conditions.push(sql`resolved.occurred_at >= ${input.dateFrom}`);
  }
  if (input.dateTo) {
    conditions.push(sql`resolved.occurred_at <= ${input.dateTo}`);
  }
  if (input.q && input.q.trim() !== "") {
    const prefix = `${input.q.trim()}%`;
    conditions.push(sql`(
      lower(resolved.student_full_name) like lower(${prefix})
      or lower(resolved.student_roll_number) like lower(${prefix})
      or lower(resolved.actor_name) like lower(${prefix})
    )`);
  }
  return sql.join(conditions, sql` and `);
}

interface ResolvedRow {
  [key: string]: unknown;
  id: string;
  occurred_at: string;
  action: string;
  module: string;
  actor_type: string;
  actor_id: string | null;
  entity_type: string;
  entity_id: string;
  metadata: unknown;
  student_id: string | null;
  student_full_name: string | null;
  student_roll_number: string | null;
  hostel_id: string | null;
  hostel_name: string | null;
  actor_name: string | null;
  actor_role: string | null;
}

function toListItem(row: ResolvedRow): AuditListItemView {
  return {
    id: row.id,
    occurredAt: new Date(row.occurred_at).toISOString(),
    action: row.action,
    module: row.module as AuditListItemView["module"],
    actorType: row.actor_type as AuditListItemView["actorType"],
    actorId: row.actor_id,
    actorName: row.actor_name,
    actorRole: row.actor_role,
    entityType: row.entity_type,
    entityId: row.entity_id,
    studentId: row.student_id,
    studentFullName: row.student_full_name,
    studentRollNumber: row.student_roll_number,
    hostelId: row.hostel_id,
    hostelName: row.hostel_name,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}

export interface AuditRepository {
  list(input: AuditListInput): Promise<AuditListResult>;
  getStatistics(scope: {
    staffId: string;
    staffRole: "reception_warden" | "hostel_admin" | "super_admin";
  }): Promise<AuditStatistics>;
}

export class DrizzleAuditRepository implements AuditRepository {
  async list(input: AuditListInput): Promise<AuditListResult> {
    const filters = buildFilters(input);
    const orderDir = input.sortDir === "asc" ? sql`asc` : sql`desc`;
    const offset = (input.page - 1) * input.pageSize;

    const [rows, countRows] = await Promise.all([
      db.execute<ResolvedRow>(sql`
        ${RESOLVED_CTE}
        select resolved.*, hostels.name as hostel_name
        from resolved
        left join hostels on hostels.id = resolved.hostel_id
        where ${filters}
        order by resolved.occurred_at ${orderDir}, resolved.id ${orderDir}
        limit ${input.pageSize} offset ${offset}
      `),
      db.execute<{ count: string }>(sql`
        ${RESOLVED_CTE}
        select count(*) as count
        from resolved
        where ${filters}
      `),
    ]);

    return {
      items: rows.map(toListItem),
      total: Number(countRows[0]?.count ?? 0),
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  async getStatistics(scope: {
    staffId: string;
    staffRole: "reception_warden" | "hostel_admin" | "super_admin";
  }): Promise<AuditStatistics> {
    const filters = buildFilters({ staffId: scope.staffId, staffRole: scope.staffRole });
    const rows = await db.execute<{ module: string; count: string }>(sql`
      ${RESOLVED_CTE}
      select resolved.module as module, count(*) as count
      from resolved
      where ${filters} and resolved.occurred_at >= date_trunc('day', now())
      group by resolved.module
    `);

    const byModule = Object.fromEntries(AUDIT_MODULES.map((m) => [m, 0])) as Record<
      AuditModule,
      number
    >;
    let eventsToday = 0;
    for (const row of rows) {
      const count = Number(row.count);
      if (row.module in byModule) {
        byModule[row.module as AuditModule] = count;
      }
      eventsToday += count;
    }

    return { eventsToday, byModule };
  }
}
