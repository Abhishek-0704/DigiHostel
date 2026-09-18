import { sql } from "drizzle-orm";
import { pgTable, uuid, text, jsonb, timestamp, index, pgPolicy } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import {
  auditActorType,
  securityIncidentType,
  securityIncidentStatus,
  securityIncidentSeverity,
  securityIncidentEventType,
} from "./enums.js";
import { students, parentStudentRelationships, staff } from "./identity.js";
import {
  callerParentId,
  callerStudentId,
  isLibraryIncharge,
  isHostelAdminForStudent,
  isReceptionForStudent,
  isSuperAdmin,
} from "./rls-helpers.js";

// The original two incident_type values (`missed_checkpoint`, `manual_flag`)
// belong entirely to the still-unbuilt Digital Library Pass checkpoint-
// monitoring domain, which `security_incidents_all_library` below was
// designed for (library_incharge's intentionally GLOBAL, cross-hostel
// access). The Emergency Operations Center's eight new categories (Phase 4,
// Prompt 10) are a different, reception-owned domain — library_incharge has
// no product reason to create/read/manage a "Medical"/"Violence"/etc.
// incident, so that policy is scoped to keep excluding them, rather than
// silently inheriting global access to the new categories too.
const EMERGENCY_INCIDENT_TYPES = sql`(
  'medical', 'personal_safety', 'fire', 'security_threat', 'violence',
  'infrastructure', 'harassment', 'other'
)`;

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
    // --- Phase 4, Prompt 10 — Emergency Operations Center additions ---
    // All four nullable: the two ORIGINAL incident_type values
    // (missed_checkpoint/manual_flag) never populate them, so existing rows
    // and existing pgTAP fixtures remain valid without a backfill. Required-
    // at-creation for the new emergency categories is enforced by the
    // application layer (domain/emergency's Zod input schema), not a DB
    // NOT NULL constraint that would retroactively invalidate old rows.
    severity: securityIncidentSeverity("severity"),
    description: text("description"),
    assignedStaffId: uuid("assigned_staff_id").references(() => staff.id),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    index("security_incidents_student_id_idx").on(t.studentId),
    index("security_incidents_status_idx").on(t.status),
    // Supports the EOC queue's default "active incidents" view (status not
    // in resolved/closed) and its statistics query, both filtered by
    // incident_type IN (the 8 emergency categories) AND status — a real
    // query shape this prompt's own queue/statistics endpoints use, not a
    // speculative index.
    index("security_incidents_type_status_idx").on(t.incidentType, t.status),

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
    // unchanged. Prompt 10: reception's WITH CHECK additionally requires
    // any non-null assignedStaffId to be the caller's own resolved staff id
    // — a direct PostgREST bypass cannot assign an incident to a DIFFERENT
    // staff member's identity (the same class of forged-actor defense
    // `movements_insert_staff` already established for recordedByStaffId).
    pgPolicy("security_incidents_all_reception", {
      for: "all",
      to: authenticatedRole,
      using: isReceptionForStudent(t.studentId),
      withCheck: sql`${isReceptionForStudent(t.studentId)} and (${t.assignedStaffId} is null or ${t.assignedStaffId} = public.current_staff_id())`,
    }),
    // Prompt 10: narrowed to the ORIGINAL two incident_type values —
    // library_incharge's pre-existing global access to the checkpoint-
    // monitoring domain is completely unaffected, but does NOT silently
    // extend to the new emergency categories this migration adds (no
    // product reason for library staff to manage a medical/fire/violence
    // incident). See EMERGENCY_INCIDENT_TYPES's own doc comment above.
    pgPolicy("security_incidents_all_library", {
      for: "all",
      to: authenticatedRole,
      using: sql`${isLibraryIncharge} and ${t.incidentType} not in ${EMERGENCY_INCIDENT_TYPES}`,
      withCheck: sql`${isLibraryIncharge} and ${t.incidentType} not in ${EMERGENCY_INCIDENT_TYPES}`,
    }),
    // F-05 remediation: was `isHostelAdmin` (pure role check, no hostel-scope
    // join) — any hostel_admin, from any hostel, had full CRUD over every
    // student's security incidents. isHostelAdminForStudent(t.studentId) is
    // the same SECURITY DEFINER helper already used correctly on
    // parent_student_relationships (psr_all_hostel_admin, identity.ts).
    // Prompt 10: same forged-assignedStaffId defense as reception, above.
    pgPolicy("security_incidents_all_hostel_admin", {
      for: "all",
      to: authenticatedRole,
      using: isHostelAdminForStudent(t.studentId),
      withCheck: sql`${isHostelAdminForStudent(t.studentId)} and (${t.assignedStaffId} is null or ${t.assignedStaffId} = public.current_staff_id())`,
    }),
    pgPolicy("security_incidents_all_super_admin", {
      for: "all",
      to: authenticatedRole,
      using: isSuperAdmin,
      withCheck: isSuperAdmin,
    }),
  ],
).enableRLS();

// Phase 4, Prompt 10 — Emergency Operations Center's operational timeline.
// Mirrors `leave_approval_events`'s established shape/discipline exactly:
// one immutable row per lifecycle transition or note, RLS-scoped through the
// parent `security_incidents` row's own student/hostel relationship (no new
// SECURITY DEFINER helper needed — reuses is_reception_for_student/
// is_hostel_admin_for_student via a join, same pattern lae_select_reception/
// lxa_select_reception already established). This is NOT a second audit
// system: `audit_logs` (service-role-only) remains the compliance-grade
// record every mutation also writes to; this table is what the EOC's own
// UI timeline actually queries/subscribes to.
export const securityIncidentEvents = pgTable(
  "security_incident_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => securityIncidents.id),
    eventType: securityIncidentEventType("event_type").notNull(),
    actorStaffId: uuid("actor_staff_id").references(() => staff.id),
    // Only populated for `note_added` (an operational note) — nullable for
    // every other event type, matching leave_approval_events's identical
    // "not every column applies to every event_type" shape (response/
    // biometricConfirmed there).
    note: text("note"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sie_incident_id_idx").on(t.incidentId),
    index("sie_occurred_at_idx").on(t.occurredAt),

    // Immutable: no UPDATE or DELETE policy for any role — matches
    // leave_approval_events/leave_exit_authorizations exactly.

    pgPolicy("sie_select_own_student", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from ${securityIncidents} si where si.id = ${t.incidentId} and si.student_id = ${callerStudentId})`,
    }),
    pgPolicy("sie_select_linked_parent", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from ${securityIncidents} si join ${parentStudentRelationships} psr on psr.student_id = si.student_id where si.id = ${t.incidentId} and psr.parent_id = ${callerParentId})`,
    }),
    pgPolicy("sie_select_reception", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from ${securityIncidents} si where si.id = ${t.incidentId} and ${isReceptionForStudent(sql`si.student_id`)})`,
    }),
    pgPolicy("sie_select_hostel_admin", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from ${securityIncidents} si where si.id = ${t.incidentId} and ${isHostelAdminForStudent(sql`si.student_id`)})`,
    }),
    pgPolicy("sie_select_super_admin", {
      for: "select",
      to: authenticatedRole,
      using: isSuperAdmin,
    }),
    // INSERT: actor identity pinned to the caller's own resolved staff id
    // (forged-actor defense, same shape as lae_insert_reception_manual_override),
    // hostel-scoped via the parent incident's own student. reception_warden
    // and hostel_admin share one policy — Fastify's own role guard is the
    // real capability gate (RLS here is defense-in-depth for a direct
    // client, matching this codebase's established division of labor).
    pgPolicy("sie_insert_staff", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        ${t.actorStaffId} = public.current_staff_id()
        and exists (
          select 1 from ${securityIncidents} si
          where si.id = ${t.incidentId}
            and (${isReceptionForStudent(sql`si.student_id`)} or ${isHostelAdminForStudent(sql`si.student_id`)})
        )
      `,
    }),
    pgPolicy("sie_insert_super_admin", {
      for: "insert",
      to: authenticatedRole,
      withCheck: isSuperAdmin,
    }),
  ],
).enableRLS();
