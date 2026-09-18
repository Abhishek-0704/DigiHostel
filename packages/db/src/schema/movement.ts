import { sql } from "drizzle-orm";
import { pgTable, uuid, timestamp, jsonb, uniqueIndex, index, pgPolicy } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { movementType } from "./enums.js";
import { students, parentStudentRelationships, staff } from "./identity.js";
import { leaveRequests, leaveExitAuthorizations } from "./leave.js";
import {
  callerParentId,
  callerStudentId,
  isSuperAdmin,
  isReceptionForStudent,
  isHostelAdminForStudent,
} from "./rls-helpers.js";

// Phase 4, Prompt 9 — Student Movement Management System (Movement Engine).
//
// Reconnaissance before this file was written (not repeated here — see
// apps/reception-dashboard/docs/movement-engine.md §2) confirmed no
// existing table represents "a student's physical movement completed":
// `journey_events`/`qr_sessions` (schema/library.ts) belong to the
// separate, still-unbuilt Digital Library Pass module — `library_pass_id`
// and `qr_session_id` are both NOT NULL and `biometric_confirmed` is
// hard-required, so reusing them here would mean fabricating a library
// pass and a biometric confirmation that never happened, exactly the same
// rejection `leave_exit_authorizations` (Prompt 7C) already established for
// this identical class of problem. `checkpoint_type`'s existing
// `hostel_return` enum value belongs entirely to that library-pass
// checkpoint vocabulary, not to this table — a deliberately DIFFERENT,
// new `movement_type` enum is used instead, so this table's own vocabulary
// can never be confused with the library-pass domain's.
//
// This table is the generic "Movement Engine" the product principle calls
// for, but only as far as Hostel Return actually justifies: one row means
// "this specific movement, of this specific type, tied to this specific
// leave request, was recorded" — the same single-atomic-attestation shape
// `leave_exit_authorizations` already established (no multi-state
// "in-progress" row; Register Return, like Authorize Exit, is one atomic
// staff action, not a multi-step process with real intermediate states to
// persist). Extensibility for a future movement type (Library Return,
// Medical Exit, etc.) is a new `movement_type` enum value plus new
// application code — NOT a schema redesign of this table.
export const movements = pgTable(
  "movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    movementType: movementType("movement_type").notNull(),
    // NOT NULL: the only movement type implemented today (hostel_return) is
    // always tied to exactly one leave request — the one whose exit it
    // completes. A future movement type genuinely unrelated to any leave
    // request would need this loosened to nullable at that time; not done
    // now, since nothing today needs it and a premature nullable column
    // would just be an unused escape hatch.
    leaveRequestId: uuid("leave_request_id")
      .notNull()
      .references(() => leaveRequests.id),
    recordedByStaffId: uuid("recorded_by_staff_id")
      .notNull()
      .references(() => staff.id),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    // Extension point for a future movement type's own type-specific
    // fields (e.g. a future Library Return's library_pass_id) — never
    // read or written by the Hostel Return implementation itself, which
    // stores nothing here (`{}`).
    metadata: jsonb("metadata").notNull().default({}),
  },
  (t) => [
    // The actual database-enforced "exactly one completion per leave
    // request, per movement type" invariant — a concurrent duplicate
    // INSERT fails on this constraint, not merely on an apps/api-side
    // check, mirroring leave_exit_authorizations's identical
    // UNIQUE(leave_request_id) pattern. Scoped by movement_type (not just
    // leave_request_id alone) so a future, genuinely different movement
    // type tied to the same leave request is not artificially blocked by
    // this constraint — though no such type exists yet.
    uniqueIndex("movements_leave_request_type_key").on(t.leaveRequestId, t.movementType),
    index("movements_student_id_idx").on(t.studentId),

    // Immutable: no UPDATE or DELETE policy exists for ANY role below —
    // this table is insert-only by construction, matching
    // leave_approval_events/leave_exit_authorizations exactly.

    pgPolicy("movements_select_own_student", {
      for: "select",
      to: authenticatedRole,
      using: sql`${t.studentId} = ${callerStudentId}`,
    }),
    pgPolicy("movements_select_linked_parent", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from ${parentStudentRelationships} psr where psr.student_id = ${t.studentId} and psr.parent_id = ${callerParentId})`,
    }),
    pgPolicy("movements_select_reception", {
      for: "select",
      to: authenticatedRole,
      using: isReceptionForStudent(t.studentId),
    }),
    pgPolicy("movements_select_hostel_admin", {
      for: "select",
      to: authenticatedRole,
      using: isHostelAdminForStudent(t.studentId),
    }),
    pgPolicy("movements_select_super_admin", {
      for: "select",
      to: authenticatedRole,
      using: isSuperAdmin,
    }),

    // F-QG02-01 lesson applied from the start (not retrofitted): the
    // workflow-state invariant this table exists to enforce — a hostel
    // return may only be recorded for a leave request that is genuinely
    // `approved` AND already has a real `leave_exit_authorizations` row —
    // is checked HERE, in the RLS WITH CHECK itself, not left to Fastify
    // alone. A direct PostgREST INSERT for a leave request that is
    // `pending`/`rejected`/not-yet-exited is rejected by RLS the same way
    // an unauthorized hostel is, not merely by the application layer.
    pgPolicy("movements_insert_staff", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        ${t.recordedByStaffId} = public.current_staff_id()
        and exists (
          select 1 from ${staff} s join ${students} st on st.id = ${t.studentId}
          where s.auth_user_id = auth.uid() and st.hostel_id = s.hostel_id
        )
        and exists (
          select 1 from ${leaveRequests} lr
          where lr.id = ${t.leaveRequestId}
            and lr.student_id = ${t.studentId}
            and lr.status = 'approved'
        )
        and exists (
          select 1 from ${leaveExitAuthorizations} lxa
          where lxa.leave_request_id = ${t.leaveRequestId}
        )
      `,
    }),
    pgPolicy("movements_insert_super_admin", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        ${isSuperAdmin}
        and exists (
          select 1 from ${leaveRequests} lr
          where lr.id = ${t.leaveRequestId}
            and lr.student_id = ${t.studentId}
            and lr.status = 'approved'
        )
        and exists (
          select 1 from ${leaveExitAuthorizations} lxa
          where lxa.leave_request_id = ${t.leaveRequestId}
        )
      `,
    }),
  ],
).enableRLS();
