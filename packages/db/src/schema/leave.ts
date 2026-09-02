import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  date,
  boolean,
  timestamp,
  index,
  pgPolicy,
} from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { leaveRequestStatus, approvalEventType, approvalResponse } from "./enums.js";
import { students, parentStudentRelationships, staff } from "./identity.js";
import { callerParentId, callerStudentId, isHostelAdmin, isSuperAdmin } from "./rls-helpers.js";

// docs/database-schema-design.md + docs/adr/ADR-015-approval-workflow-data-model.md
// — Parent Approval Domain

export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    reason: text("reason").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: leaveRequestStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("leave_requests_student_id_idx").on(t.studentId),
    index("leave_requests_status_idx").on(t.status),

    pgPolicy("leave_requests_select_own_student", {
      for: "select",
      to: authenticatedRole,
      using: sql`${t.studentId} = ${callerStudentId}`,
    }),
    pgPolicy("leave_requests_insert_own_student", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${t.studentId} = ${callerStudentId}`,
    }),
    pgPolicy("leave_requests_select_linked_parent", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from ${parentStudentRelationships} psr where psr.student_id = ${t.studentId} and psr.parent_id = ${callerParentId})`,
    }),
    // Coarse gate only: "is this parent linked to this student at all."
    // Fastify additionally enforces that only the party matching the CURRENT
    // escalation step may actually succeed (docs/rls-policy-matrix.md's note
    // on this deliberate split between RLS and business authorization).
    pgPolicy("leave_requests_update_linked_parent", {
      for: "update",
      to: authenticatedRole,
      using: sql`exists (select 1 from ${parentStudentRelationships} psr where psr.student_id = ${t.studentId} and psr.parent_id = ${callerParentId})`,
      withCheck: sql`exists (select 1 from ${parentStudentRelationships} psr where psr.student_id = ${t.studentId} and psr.parent_id = ${callerParentId})`,
    }),
    pgPolicy("leave_requests_all_reception", {
      for: "all",
      to: authenticatedRole,
      using: sql`exists (select 1 from ${staff} s join ${students} st on st.hostel_id = s.hostel_id where s.auth_user_id = auth.uid() and s.role = 'reception_warden' and st.id = ${t.studentId})`,
      withCheck: sql`exists (select 1 from ${staff} s join ${students} st on st.hostel_id = s.hostel_id where s.auth_user_id = auth.uid() and s.role = 'reception_warden' and st.id = ${t.studentId})`,
    }),
    pgPolicy("leave_requests_all_hostel_admin", {
      for: "all",
      to: authenticatedRole,
      using: sql`${isHostelAdmin} and exists (select 1 from ${students} st where st.id = ${t.studentId} and st.hostel_id = public.current_staff_hostel_id())`,
      withCheck: sql`${isHostelAdmin} and exists (select 1 from ${students} st where st.id = ${t.studentId} and st.hostel_id = public.current_staff_hostel_id())`,
    }),
    pgPolicy("leave_requests_all_super_admin", {
      for: "all",
      to: authenticatedRole,
      using: isSuperAdmin,
      withCheck: isSuperAdmin,
    }),
  ],
).enableRLS();

export const leaveApprovalEvents = pgTable(
  "leave_approval_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leaveRequestId: uuid("leave_request_id")
      .notNull()
      .references(() => leaveRequests.id),
    eventType: approvalEventType("event_type").notNull(),
    actorParentId: uuid("actor_parent_id"),
    actorStaffId: uuid("actor_staff_id"),
    response: approvalResponse("response"),
    biometricConfirmed: boolean("biometric_confirmed").notNull().default(false),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("lae_leave_request_id_idx").on(t.leaveRequestId),
    index("lae_occurred_at_idx").on(t.occurredAt),

    // Immutable: no UPDATE or DELETE policy exists for ANY role below —
    // this table is insert-only by construction (docs/adr/ADR-015).

    pgPolicy("lae_select_own_student", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from ${leaveRequests} lr where lr.id = ${t.leaveRequestId} and lr.student_id = ${callerStudentId})`,
    }),
    pgPolicy("lae_select_linked_parent", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from ${leaveRequests} lr join ${parentStudentRelationships} psr on psr.student_id = lr.student_id where lr.id = ${t.leaveRequestId} and psr.parent_id = ${callerParentId})`,
    }),
    // Defense-in-depth beyond Fastify's business-authorization layer
    // (docs/auth-database-security-model.md §6/§16): a parent whose every
    // device is revoked cannot submit an approval response even with an
    // otherwise-valid Supabase session (the residual access-token window
    // ADR-014 flags) — enforced here at the database, not just application code.
    pgPolicy("lae_insert_own_parent_response", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        ${t.actorParentId} = ${callerParentId}
        and exists (
          select 1 from ${leaveRequests} lr
          join ${parentStudentRelationships} psr on psr.student_id = lr.student_id
          where lr.id = ${t.leaveRequestId} and psr.parent_id = ${callerParentId}
        )
        and (${t.response} is null or ${t.biometricConfirmed} = true)
        and (
          ${t.response} is null
          or exists (
            select 1 from trusted_devices td
            where td.parent_id = ${callerParentId} and td.revoked_at is null
          )
        )
      `,
    }),
    pgPolicy("lae_select_staff", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from staff s where s.auth_user_id = auth.uid())`,
    }),
    pgPolicy("lae_insert_reception_manual_override", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        ${t.eventType} = 'manual_override'
        and ${t.actorStaffId} = public.current_staff_id()
        and exists (
          select 1 from ${staff} s join ${leaveRequests} lr on true
          join ${students} st on st.id = lr.student_id
          where s.auth_user_id = auth.uid() and lr.id = ${t.leaveRequestId} and st.hostel_id = s.hostel_id
        )
      `,
    }),
    pgPolicy("lae_insert_super_admin", {
      for: "insert",
      to: authenticatedRole,
      withCheck: isSuperAdmin,
    }),
  ],
).enableRLS();
