import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, index, pgPolicy } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { healthCaseCategory, healthCaseStatus, healthCaseEventType } from "./enums.js";
import { securityIncidentSeverity } from "./enums.js";
import { students, parentStudentRelationships, staff } from "./identity.js";
import {
  callerParentId,
  callerStudentId,
  isHostelAdminForStudent,
  isReceptionForStudent,
  isSuperAdmin,
} from "./rls-helpers.js";

/**
 * Health Operations Center (Phase 4, Prompt 11). A new domain, structurally
 * parallel to the Emergency Operations Center's `security_incidents`/
 * `security_incident_events` pair (Prompt 10) — see enums.ts's doc comment
 * on `healthCaseCategory` for the full reconnaissance/reasoning on why this
 * is a NEW table rather than a further extension of `security_incidents`.
 * `severity` reuses `security_incident_severity` directly (no duplicated
 * enum) — same vocabulary, no competing concept.
 *
 * No `library_incharge` policy exists on either table at all — that role
 * has even less product reason to manage a medical case than an emergency
 * incident (Prompt 10 at least narrowed its access; here there is simply
 * none to narrow).
 */
export const healthCases = pgTable(
  "health_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    category: healthCaseCategory("category").notNull(),
    severity: securityIncidentSeverity("severity").notNull(),
    status: healthCaseStatus("status").notNull().default("new"),
    description: text("description"),
    assignedStaffId: uuid("assigned_staff_id").references(() => staff.id),
    // Set at creation when `category` is an admission-type category
    // (hospital_admission/emergency_admission) — a real, honest fact
    // ("this case was reported as an admission at this time"), never a
    // fabricated clinical admission-confirmation workflow. Nullable for
    // every other category.
    admittedAt: timestamp("admitted_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    dischargedAt: timestamp("discharged_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("health_cases_student_id_idx").on(t.studentId),
    index("health_cases_status_idx").on(t.status),
    // Supports the queue's default "active cases" view and the statistics
    // query, both filtered by status (and sometimes category) — a real
    // query shape this domain's own list/statistics endpoints use.
    index("health_cases_category_status_idx").on(t.category, t.status),

    pgPolicy("health_cases_select_own_student", {
      for: "select",
      to: authenticatedRole,
      using: sql`${t.studentId} = ${callerStudentId}`,
    }),
    pgPolicy("health_cases_select_linked_parent", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from ${parentStudentRelationships} psr where psr.student_id = ${t.studentId} and psr.parent_id = ${callerParentId})`,
    }),
    // F-QG02-01 lesson applied from the start (Prompt 10 precedent): a
    // direct PostgREST bypass cannot assign a case to a DIFFERENT staff
    // member's identity — a non-null assigned_staff_id must equal the
    // caller's own resolved staff id.
    pgPolicy("health_cases_all_reception", {
      for: "all",
      to: authenticatedRole,
      using: isReceptionForStudent(t.studentId),
      withCheck: sql`${isReceptionForStudent(t.studentId)} and (${t.assignedStaffId} is null or ${t.assignedStaffId} = public.current_staff_id())`,
    }),
    pgPolicy("health_cases_all_hostel_admin", {
      for: "all",
      to: authenticatedRole,
      using: isHostelAdminForStudent(t.studentId),
      withCheck: sql`${isHostelAdminForStudent(t.studentId)} and (${t.assignedStaffId} is null or ${t.assignedStaffId} = public.current_staff_id())`,
    }),
    pgPolicy("health_cases_all_super_admin", {
      for: "all",
      to: authenticatedRole,
      using: isSuperAdmin,
      withCheck: isSuperAdmin,
    }),
  ],
).enableRLS();

/**
 * Health Operations Center's own append-only operational timeline — mirrors
 * `security_incident_events`'/`leave_approval_events`'s established shape
 * exactly (immutable, RLS-scoped through the parent row's own student/
 * hostel relationship). NOT a second audit system: `audit_logs`
 * (service-role-only) remains the compliance-grade record every mutation
 * also writes to; this table is what the Health Operations Center's own UI
 * timeline actually queries/subscribes to.
 */
export const healthCaseEvents = pgTable(
  "health_case_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => healthCases.id),
    eventType: healthCaseEventType("event_type").notNull(),
    actorStaffId: uuid("actor_staff_id").references(() => staff.id),
    // Only populated for `note_added` — nullable for every other event type.
    note: text("note"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("hce_case_id_idx").on(t.caseId),
    index("hce_occurred_at_idx").on(t.occurredAt),

    // Immutable: no UPDATE or DELETE policy for any role.

    pgPolicy("hce_select_own_student", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from ${healthCases} hc where hc.id = ${t.caseId} and hc.student_id = ${callerStudentId})`,
    }),
    pgPolicy("hce_select_linked_parent", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from ${healthCases} hc join ${parentStudentRelationships} psr on psr.student_id = hc.student_id where hc.id = ${t.caseId} and psr.parent_id = ${callerParentId})`,
    }),
    pgPolicy("hce_select_reception", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from ${healthCases} hc where hc.id = ${t.caseId} and ${isReceptionForStudent(sql`hc.student_id`)})`,
    }),
    pgPolicy("hce_select_hostel_admin", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from ${healthCases} hc where hc.id = ${t.caseId} and ${isHostelAdminForStudent(sql`hc.student_id`)})`,
    }),
    pgPolicy("hce_select_super_admin", {
      for: "select",
      to: authenticatedRole,
      using: isSuperAdmin,
    }),
    // INSERT: actor identity pinned to the caller's own resolved staff id
    // (forged-actor defense), hostel-scoped via the parent case's own
    // student.
    pgPolicy("hce_insert_staff", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        ${t.actorStaffId} = public.current_staff_id()
        and exists (
          select 1 from ${healthCases} hc
          where hc.id = ${t.caseId}
            and (${isReceptionForStudent(sql`hc.student_id`)} or ${isHostelAdminForStudent(sql`hc.student_id`)})
        )
      `,
    }),
    pgPolicy("hce_insert_super_admin", {
      for: "insert",
      to: authenticatedRole,
      withCheck: isSuperAdmin,
    }),
  ],
).enableRLS();
