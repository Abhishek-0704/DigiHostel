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
import {
  callerParentId,
  callerStudentId,
  isHostelAdmin,
  isSuperAdmin,
  isReceptionForStudent,
  isHostelAdminForStudent,
} from "./rls-helpers.js";

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
    // F-QG02-01 remediation (QG-02 Leave Authorization Workflow Review):
    // this table's single `for: "all"` reception/hostel_admin policy applied
    // its hostel-scope USING/WITH CHECK identically to SELECT, INSERT,
    // UPDATE, and DELETE — meaning a legitimately-authenticated reception/
    // hostel_admin session could directly PATCH `status` to ANY value (e.g.
    // `pending` -> `approved`) via PostgREST, bypassing the entire parent-
    // decision workflow (`DrizzleLeaveRepository.decide()`), with zero
    // `leave_approval_events`/`audit_logs` row written. Live-reproduced (QG-02
    // review, then re-confirmed during this remediation): a real
    // password-authenticated `reception1@example.test` session force-approved
    // a `pending` leave request via a direct PostgREST PATCH. Combined with
    // the `leave_exit_authorizations` gap this same finding covers, this made
    // the entire "parent approval required before exit" invariant
    // unenforceable outside the Fastify application path.
    //
    // Split into per-operation policies so UPDATE can be narrowed
    // independently of SELECT/INSERT/DELETE, which are unaffected (no
    // legitimate consumer of this table's RLS UPDATE grant exists anywhere in
    // the repository — `apps/reception-dashboard`/`apps/parent-mobile` never
    // write to `leave_requests` directly, confirmed by repository-wide
    // search; every real state transition is written by `apps/api`'s
    // service-role connection, which bypasses RLS entirely by design — so
    // narrowing this grant changes no legitimate application behavior).
    //
    // The UPDATE policy's USING clause now additionally requires
    // `status = 'manual_verification'` — matching the *already-documented*
    // "intended business use" of this grant (`docs/rls-policy-matrix.md`:
    // "primarily resolving `manual_verification` -> `approved`/`rejected`/
    // `expired`, per ADR-019"), not a new capability. This closes the
    // specific exploit chain (forcing `pending`/any other status directly to
    // `approved`) without touching the one manual-resolution capability this
    // grant was always intended to provide, and without inventing a new
    // authorization model.
    pgPolicy("leave_requests_select_reception", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from ${staff} s join ${students} st on st.hostel_id = s.hostel_id where s.auth_user_id = auth.uid() and s.role = 'reception_warden' and st.id = ${t.studentId})`,
    }),
    pgPolicy("leave_requests_insert_reception", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`exists (select 1 from ${staff} s join ${students} st on st.hostel_id = s.hostel_id where s.auth_user_id = auth.uid() and s.role = 'reception_warden' and st.id = ${t.studentId})`,
    }),
    pgPolicy("leave_requests_delete_reception", {
      for: "delete",
      to: authenticatedRole,
      using: sql`exists (select 1 from ${staff} s join ${students} st on st.hostel_id = s.hostel_id where s.auth_user_id = auth.uid() and s.role = 'reception_warden' and st.id = ${t.studentId})`,
    }),
    pgPolicy("leave_requests_update_reception", {
      for: "update",
      to: authenticatedRole,
      using: sql`${t.status} = 'manual_verification' and exists (select 1 from ${staff} s join ${students} st on st.hostel_id = s.hostel_id where s.auth_user_id = auth.uid() and s.role = 'reception_warden' and st.id = ${t.studentId})`,
      withCheck: sql`exists (select 1 from ${staff} s join ${students} st on st.hostel_id = s.hostel_id where s.auth_user_id = auth.uid() and s.role = 'reception_warden' and st.id = ${t.studentId})`,
    }),
    pgPolicy("leave_requests_select_hostel_admin", {
      for: "select",
      to: authenticatedRole,
      using: sql`${isHostelAdmin} and exists (select 1 from ${students} st where st.id = ${t.studentId} and st.hostel_id = public.current_staff_hostel_id())`,
    }),
    pgPolicy("leave_requests_insert_hostel_admin", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${isHostelAdmin} and exists (select 1 from ${students} st where st.id = ${t.studentId} and st.hostel_id = public.current_staff_hostel_id())`,
    }),
    pgPolicy("leave_requests_delete_hostel_admin", {
      for: "delete",
      to: authenticatedRole,
      using: sql`${isHostelAdmin} and exists (select 1 from ${students} st where st.id = ${t.studentId} and st.hostel_id = public.current_staff_hostel_id())`,
    }),
    pgPolicy("leave_requests_update_hostel_admin", {
      for: "update",
      to: authenticatedRole,
      using: sql`${isHostelAdmin} and ${t.status} = 'manual_verification' and exists (select 1 from ${students} st where st.id = ${t.studentId} and st.hostel_id = public.current_staff_hostel_id())`,
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
    // Security remediation (targeted `lae_select_staff` review, post-Prompt
    // 7A): the original `lae_select_staff` policy was
    // `exists (select 1 from staff s where s.auth_user_id = auth.uid())` —
    // row-independent (never referenced the target row at all), so it
    // granted every authenticated staff member, in any role and any hostel,
    // unrestricted SELECT on every row in this table. Empirically proven
    // exploitable via direct PostgREST: a Hostel-B reception_warden (and,
    // separately, a library_incharge with no hostel assignment, and even an
    // AAL1/password-only staff session — AAL2 is never checked by RLS
    // anywhere in this schema, it is exclusively an apps/api application-
    // layer gate via requireAal2()) could read a Hostel-A leave request's
    // approval-event row, including columns this codebase's own API layer
    // deliberately never serializes to any client
    // (LeaveApprovalEventView's doc comment: "never reveals which specific
    // parent/guardian/staff member acted").
    //
    // Replaced with the same three-way role split
    // leave_requests_all_reception/_all_hostel_admin/_all_super_admin
    // already use on this table's own parent row (leave_requests), reusing
    // the existing is_reception_for_student/is_hostel_admin_for_student
    // SECURITY DEFINER helpers (built for F-05A, same shape already proven
    // safe: STABLE, SET search_path, parameterized only by a server-derived
    // student id, resolves identity/hostel only from auth.uid() internally
    // — never a client-supplied hostel/staff id). Mirrors
    // lae_insert_reception_manual_override's existing, already-proven
    // pattern of joining through leave_requests to reach a student's hostel
    // from a policy on this table — no new helper function was needed.
    // library_incharge intentionally gets no policy here at all, matching
    // leave_requests's own complete absence of a library_incharge grant —
    // this codebase's architecture has never granted that role any access
    // to leave-domain data.
    pgPolicy("lae_select_reception", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from ${leaveRequests} lr where lr.id = ${t.leaveRequestId} and ${isReceptionForStudent(sql`lr.student_id`)})`,
    }),
    pgPolicy("lae_select_hostel_admin", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from ${leaveRequests} lr where lr.id = ${t.leaveRequestId} and ${isHostelAdminForStudent(sql`lr.student_id`)})`,
    }),
    pgPolicy("lae_select_super_admin", {
      for: "select",
      to: authenticatedRole,
      using: isSuperAdmin,
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

// Phase 3, Prompt 7C — Student Verification & Exit Authorization.
//
// Reconnaissance before this table was added (docs, not repeated here —
// see apps/reception-dashboard/docs/exit-authorization.md §2) confirmed no
// existing table represents "the student physically left the hostel":
// `journey_events`/`qr_sessions`/`library_passes` (packages/db/src/schema/
// library.ts) are a DIFFERENT domain entirely (the Digital Library Pass
// module, SDD Ch.6, still explicitly BLOCKED/unbuilt per
// apps/reception-dashboard/src/pages/StudentVerificationPage.tsx's own
// placeholder text) — `journey_events.library_pass_id` is NOT NULL, so a
// hostel-leave exit (which has nothing to do with a library pass) cannot be
// represented as a row in that table without either fabricating a library
// pass that was never issued, or fabricating `biometric_confirmed = true`
// (that table's own INSERT policy hard-requires it), which this task
// explicitly forbids. A new, minimal, single-purpose table was therefore
// genuinely required — not a duplicate of an existing concept.
//
// Deliberately NOT a new `leave_request_status` value ("completed"/"exited"
// etc.): `leave_requests.status` remains exactly the Parent Approval
// state machine's own vocabulary (ADR-015/016/017/018/019/025), unchanged
// and unexpanded by this table. "The student has left the hostel" is a
// SEPARATE authoritative fact, captured here, not by mutating that enum —
// this is the same discipline already applied to keep SAP mentor approval
// out of `leave_requests.status` (never `SAP_APPROVED`).
export const leaveExitAuthorizations = pgTable(
  "leave_exit_authorizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // UNIQUE, not just indexed: this is the actual database-enforced
    // "exactly one successful exit authorization per leave request"
    // invariant (a concurrent duplicate INSERT fails on this constraint,
    // not merely on an apps/api-side check) — the same class of guarantee
    // the conditional-UPDATE pattern gives `decide()`/`startParentApproval()`,
    // adapted to an INSERT-only table.
    leaveRequestId: uuid("leave_request_id")
      .notNull()
      .unique()
      .references(() => leaveRequests.id),
    authorizedByStaffId: uuid("authorized_by_staff_id")
      .notNull()
      .references(() => staff.id),
    // Staff attestation, not an independently server-re-derivable fact —
    // the server cannot verify "does the person at reception match the
    // photo," only that an authenticated, hostel-scoped, AAL2 staff member
    // explicitly asserted it. Same category of value as
    // `leave_approval_events.biometric_confirmed`/`journey_events.
    // biometric_confirmed` elsewhere in this schema: a recorded human
    // attestation, never independently verified, never silently defaulted.
    // NOT NULL and constrained to `true` by every INSERT policy below (and
    // by the application layer) — a row only ever exists if this was
    // explicitly confirmed; it is stored (rather than merely implied by the
    // row's existence) purely for audit-record completeness.
    identityConfirmed: boolean("identity_confirmed").notNull(),
    authorizedAt: timestamp("authorized_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("lxa_authorized_at_idx").on(t.authorizedAt),

    // Immutable, matching leave_approval_events: no UPDATE or DELETE policy
    // for any role — an exit authorization, once recorded, is a permanent
    // fact, never edited or retracted through this table.

    pgPolicy("lxa_select_own_student", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from ${leaveRequests} lr where lr.id = ${t.leaveRequestId} and lr.student_id = ${callerStudentId})`,
    }),
    pgPolicy("lxa_select_linked_parent", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from ${leaveRequests} lr join ${parentStudentRelationships} psr on psr.student_id = lr.student_id where lr.id = ${t.leaveRequestId} and psr.parent_id = ${callerParentId})`,
    }),
    pgPolicy("lxa_select_reception", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from ${leaveRequests} lr where lr.id = ${t.leaveRequestId} and ${isReceptionForStudent(sql`lr.student_id`)})`,
    }),
    pgPolicy("lxa_select_hostel_admin", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from ${leaveRequests} lr where lr.id = ${t.leaveRequestId} and ${isHostelAdminForStudent(sql`lr.student_id`)})`,
    }),
    pgPolicy("lxa_select_super_admin", {
      for: "select",
      to: authenticatedRole,
      using: isSuperAdmin,
    }),
    // Mirrors lae_insert_reception_manual_override's exact shape (hostel-
    // match join through leave_requests -> students, actor-id pinned to the
    // caller's own resolved staff id) — reception_warden and hostel_admin
    // share one policy here for the same reason that method's own
    // application-layer guard (`requireStaffRole`) is the real role gate;
    // RLS is defense-in-depth for direct client access, not the primary
    // boundary (Fastify's own connection is service-role and bypasses RLS).
    //
    // F-QG02-01 remediation (QG-02 Leave Authorization Workflow Review):
    // this WITH CHECK previously verified caller authorization (staff
    // identity, hostel scope, identity_confirmed=true) but never verified
    // the referenced leave request's own workflow state — it checked that
    // `leave_request_id` pointed to SOME row in this staff member's hostel,
    // not that the row was `approved`. Live-reproduced (QG-02 review): a
    // real password-authenticated reception session directly INSERTed a
    // `leave_exit_authorizations` row for a `pending` leave request (one
    // that had never even been sent for parent approval) via PostgREST,
    // bypassing the exact precondition `DrizzleLeaveRepository.authorizeExit()`
    // enforces (`status !== "approved"` -> conflict). The added
    // `lr.status = 'approved'` clause below is the missing half of the
    // invariant this table exists to enforce (see this table's own doc
    // comment above: "the student has left the hostel" must never be
    // recorded for a leave that was never genuinely approved) — reusing the
    // exact same EXISTS-join-through-leave_requests shape already present in
    // this policy, not a new authorization model or a new SECURITY DEFINER
    // function.
    pgPolicy("lxa_insert_staff", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        ${t.identityConfirmed} = true
        and ${t.authorizedByStaffId} = public.current_staff_id()
        and exists (
          select 1 from ${staff} s join ${leaveRequests} lr on true
          join ${students} st on st.id = lr.student_id
          where s.auth_user_id = auth.uid() and lr.id = ${t.leaveRequestId} and st.hostel_id = s.hostel_id
            and lr.status = 'approved'
        )
      `,
    }),
    // F-QG02-01 remediation: previously carried NO join to leave_requests at
    // all — a super_admin's INSERT was authorized purely by role and
    // identity_confirmed=true, meaning the workflow-state invariant was
    // entirely unchecked for this role (worse than lxa_insert_staff's
    // original gap, which at least confirmed the row existed in-hostel).
    // Now requires the same `status = 'approved'` precondition as every
    // other caller — the invariant in this table's own doc comment applies
    // uniformly, not just to hostel-scoped staff.
    pgPolicy("lxa_insert_super_admin", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        ${t.identityConfirmed} = true
        and ${isSuperAdmin}
        and exists (select 1 from ${leaveRequests} lr where lr.id = ${t.leaveRequestId} and lr.status = 'approved')
      `,
    }),
  ],
).enableRLS();
