import { sql } from "drizzle-orm";
import { pgTable, uuid, text, jsonb, timestamp, index, pgPolicy } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { auditActorType, securityIncidentType, securityIncidentStatus } from "./enums.js";
import { students, parentStudentRelationships } from "./identity.js";
import {
  callerParentId,
  callerStudentId,
  isLibraryIncharge,
  isHostelAdminForStudent,
  isReceptionForStudent,
  isSuperAdmin,
} from "./rls-helpers.js";

// docs/database-schema-design.md — Audit Domain

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorType: auditActorType("actor_type").notNull(),
    actorId: uuid("actor_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    index("audit_logs_occurred_at_idx").on(t.occurredAt),
    index("audit_logs_actor_id_idx").on(t.actorId),

    // Deliberately NO policies at all for any client role (anon or
    // authenticated) — no SELECT, INSERT, UPDATE, or DELETE grant exists.
    // Only Fastify's service-role connection (which bypasses RLS entirely)
    // reads/writes this table. docs/rls-policy-matrix.md.
  ],
).enableRLS();

export const securityIncidents = pgTable(
  "security_incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    incidentType: securityIncidentType("incident_type").notNull(),
    status: securityIncidentStatus("status").notNull().default("open"),
    // Raw coordinates deliberately live in a single nullable jsonb column,
    // isolated from the rest of the row, so the actively-enforced deletion
    // requirement below only ever has to null out one field:
    geolocation: jsonb("geolocation"),
    geolocationCapturedAt: timestamp("geolocation_captured_at", { withTimezone: true }),
    geolocationDeletedAt: timestamp("geolocation_deleted_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("security_incidents_student_id_idx").on(t.studentId),
    index("security_incidents_status_idx").on(t.status),

    // Row-level policies only — the design doc's "column-level restriction on
    // geolocation for student/parent" is enforced via a dedicated view or
    // column privileges at implementation time, not by RLS itself (RLS
    // filters rows, not columns). Flagged as an unresolved implementation
    // detail in the final report.
    pgPolicy("security_incidents_select_own_student", {
      for: "select",
      to: authenticatedRole,
      using: sql`${t.studentId} = ${callerStudentId}`,
    }),
    pgPolicy("security_incidents_select_linked_parent", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from ${parentStudentRelationships} psr where psr.student_id = ${t.studentId} and psr.parent_id = ${callerParentId})`,
    }),
    // F-05A remediation: was one combined policy, `isReception or
    // isLibraryIncharge` — a pure role-membership OR with no hostel-scope
    // join for reception, giving any reception_warden full cross-hostel CRUD
    // (docs/rls-policy-matrix.md documents reception as own-hostel scoped,
    // library_incharge as intentionally global). Split into two policies,
    // matching the existing students-table precedent
    // (students_select_own_hostel_reception / students_select_library_incharge)
    // for these same two roles — library_incharge's global access is
    // unchanged.
    pgPolicy("security_incidents_all_reception", {
      for: "all",
      to: authenticatedRole,
      using: isReceptionForStudent(t.studentId),
      withCheck: isReceptionForStudent(t.studentId),
    }),
    pgPolicy("security_incidents_all_library", {
      for: "all",
      to: authenticatedRole,
      using: isLibraryIncharge,
      withCheck: isLibraryIncharge,
    }),
    // F-05 remediation: was `isHostelAdmin` (pure role check, no hostel-scope
    // join) — any hostel_admin, from any hostel, had full CRUD over every
    // student's security incidents. isHostelAdminForStudent(t.studentId) is
    // the same SECURITY DEFINER helper already used correctly on
    // parent_student_relationships (psr_all_hostel_admin, identity.ts).
    pgPolicy("security_incidents_all_hostel_admin", {
      for: "all",
      to: authenticatedRole,
      using: isHostelAdminForStudent(t.studentId),
      withCheck: isHostelAdminForStudent(t.studentId),
    }),
    pgPolicy("security_incidents_all_super_admin", {
      for: "all",
      to: authenticatedRole,
      using: isSuperAdmin,
      withCheck: isSuperAdmin,
    }),
  ],
).enableRLS();
