import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  smallint,
  timestamp,
  uniqueIndex,
  index,
  pgPolicy,
} from "drizzle-orm/pg-core";
import { authUsers, authenticatedRole } from "drizzle-orm/supabase";
import { staffRole, parentRelationshipType, staffStatus } from "./enums.js";
import {
  callerParentId,
  callerStudentId,
  callerStaffHostelId,
  isSuperAdmin,
  isHostelAdmin,
  isReception,
  isLibraryIncharge,
  isParentLinkedToStudent,
  isHostelAdminForStudent,
  isHostelAdminForParent,
} from "./rls-helpers.js";

// docs/database-schema-design.md — Identity/Profile Domain

export const students = pgTable(
  "students",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authUserId: uuid("auth_user_id").references(() => authUsers.id),
    rollNumber: text("roll_number").notNull(),
    fullName: text("full_name").notNull(),
    hostelId: uuid("hostel_id"),
    roomId: uuid("room_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("students_roll_number_key").on(t.rollNumber),
    uniqueIndex("students_auth_user_id_key").on(t.authUserId),
    index("students_hostel_id_idx").on(t.hostelId),
    index("students_room_id_idx").on(t.roomId),
    // Phase 4, Prompt 8 — Student Operations Center. Search queries the
    // student's own hostel-scoped rows (already indexed above) filtered by
    // a case-insensitive PREFIX match on full_name (`lower(full_name) LIKE
    // lower($1) || '%'`) — roll_number's existing unique btree index
    // already supports an efficient prefix match with no further change.
    // A plain `index("students_full_name_idx").on(t.fullName)` would not
    // help a case-insensitive query at all (Postgres can't use a btree on
    // the raw column for an ILIKE/lower() comparison) — indexing
    // `lower(full_name)` directly is the smallest index that actually
    // matches the real query shape. A full substring ("contains") search
    // would need a trigram (pg_trgm) index instead; not added here since no
    // requirement asks for substring search and pg_trgm is new
    // infrastructure this task's own scope boundary ("do not create
    // speculative indexes for every possible field") argues against
    // introducing speculatively.
    index("students_full_name_lower_idx").on(sql`lower(${t.fullName})`),

    pgPolicy("students_select_own", {
      for: "select",
      to: authenticatedRole,
      using: sql`${t.authUserId} = auth.uid()`,
    }),
    pgPolicy("students_update_own", {
      for: "update",
      to: authenticatedRole,
      using: sql`${t.authUserId} = auth.uid()`,
      withCheck: sql`${t.authUserId} = auth.uid()`,
    }),
    // Both directions of the students <-> parent_student_relationships
    // relationship must go through bypass functions (rls-helpers.ts) — a raw
    // subquery here caused genuine cross-table RLS recursion, confirmed
    // empirically against a real local instance.
    pgPolicy("students_select_linked_parent", {
      for: "select",
      to: authenticatedRole,
      using: isParentLinkedToStudent(t.id),
    }),
    pgPolicy("students_select_own_hostel_reception", {
      for: "select",
      to: authenticatedRole,
      using: sql`${isReception} and ${t.hostelId} = ${callerStaffHostelId}`,
    }),
    pgPolicy("students_select_library_incharge", {
      for: "select",
      to: authenticatedRole,
      using: isLibraryIncharge,
    }),
    pgPolicy("students_all_hostel_admin", {
      for: "all",
      to: authenticatedRole,
      using: sql`${isHostelAdmin} and ${t.hostelId} = public.current_staff_hostel_id()`,
      withCheck: sql`${isHostelAdmin} and ${t.hostelId} = public.current_staff_hostel_id()`,
    }),
    pgPolicy("students_all_super_admin", {
      for: "all",
      to: authenticatedRole,
      using: isSuperAdmin,
      withCheck: isSuperAdmin,
    }),
  ],
).enableRLS();

export const parents = pgTable(
  "parents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authUserId: uuid("auth_user_id").references(() => authUsers.id),
    fullName: text("full_name").notNull(),
    phoneNumber: text("phone_number").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("parents_auth_user_id_key").on(t.authUserId),
    index("parents_phone_number_idx").on(t.phoneNumber),

    pgPolicy("parents_select_own", {
      for: "select",
      to: authenticatedRole,
      using: sql`${t.authUserId} = auth.uid()`,
    }),
    pgPolicy("parents_update_own", {
      for: "update",
      to: authenticatedRole,
      using: sql`${t.authUserId} = auth.uid()`,
      withCheck: sql`${t.authUserId} = auth.uid()`,
    }),
    // QG-03 remediation, F-QG03-01 (CRITICAL — live-confirmed cross-hostel
    // read+write): this was previously ONE `for: "all"` policy using a bare
    // `isHostelAdmin` role check (present, unfixed, since the very first
    // migration, 0000_cute_korvac.sql) — no join against which hostel the
    // parent's own linked students actually belong to. An independent
    // review reproduced this live: a Utkal-scoped hostel_admin read every
    // parent record system-wide (including a Kalinga parent's full name
    // and phone number) and successfully overwrote that Kalinga parent's
    // phone_number via direct PostgREST, and the write persisted.
    //
    // Split into three per-operation policies (SELECT/UPDATE/DELETE), each
    // scoped via `isHostelAdminForParent` (join through
    // parent_student_relationships -> students -> hostel_id, see that
    // helper's own doc comment in rls-helpers.ts for the multi-hostel-parent
    // reasoning). Deliberately NO INSERT policy for hostel_admin: a brand
    // new `parents` row has no parent_student_relationships row yet (that
    // relationship can only be created AFTER the parent exists, since
    // psr.parent_id references parents.id) — there is no way to scope an
    // INSERT via this relationship at insert-time, and no legitimate
    // product workflow needs hostel_admin to directly insert a parent row
    // in the first place (parent registration is exclusively the Parent
    // App's own OTP/eligibility flow, apps/api/src/domain/auth/, which uses
    // Fastify's service-role connection and bypasses RLS entirely — this
    // policy change has zero effect on that path). Omitting the INSERT
    // policy denies every hostel_admin INSERT attempt outright (no matching
    // policy = denied), which is the correct, safest behavior — not a
    // narrower version of the old bug.
    pgPolicy("parents_select_hostel_admin", {
      for: "select",
      to: authenticatedRole,
      using: isHostelAdminForParent(t.id),
    }),
    pgPolicy("parents_update_hostel_admin", {
      for: "update",
      to: authenticatedRole,
      using: isHostelAdminForParent(t.id),
      withCheck: isHostelAdminForParent(t.id),
    }),
    pgPolicy("parents_delete_hostel_admin", {
      for: "delete",
      to: authenticatedRole,
      using: isHostelAdminForParent(t.id),
    }),
    pgPolicy("parents_all_super_admin", {
      for: "all",
      to: authenticatedRole,
      using: isSuperAdmin,
      withCheck: isSuperAdmin,
    }),
  ],
).enableRLS();

export const staff = pgTable(
  "staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authUserId: uuid("auth_user_id")
      .notNull()
      .references(() => authUsers.id),
    fullName: text("full_name").notNull(),
    role: staffRole("role").notNull(),
    hostelId: uuid("hostel_id"),
    // Phase 5, Prompt 13 — Identity & Access Administration Center.
    // Enforcement is NOT merely "hide this account in a list" — the
    // Fastify authentication boundary's own per-request identity
    // resolution (`apps/api/src/lib/auth/db-port.ts`'s
    // `findStaffByAuthUserId`) filters on `status = 'active'`, so a
    // suspended staff member's very next authenticated request fails
    // closed with 401 `no_app_profile`, regardless of how long their
    // already-issued Supabase JWT remains technically valid. This is the
    // same request-time-resolution mechanism every other identity check in
    // this codebase already relies on — not a new enforcement point.
    status: staffStatus("status").notNull().default("active"),
    // QG-04 remediation, F-QG04-02: "Force Sign-Out" was found to be
    // completely non-functional — Supabase Auth Admin API's `signOut(jwt,
    // scope)` requires a SESSION ACCESS-TOKEN JWT as its first argument
    // (confirmed against the installed @supabase/auth-js@2.113.0's own
    // .d.ts/implementation), not a user id; this backend never stores a
    // staff member's session JWT, and no user-id-keyed "revoke all
    // sessions" capability exists anywhere in the installed Admin API
    // surface (signOut/inviteUserByEmail/generateLink/createUser/
    // listUsers/getUserById/updateUserById/deleteUser — none of the other
    // seven methods can achieve this either; `updateUserById`'s
    // `ban_duration` was also evaluated and rejected, since a ban only
    // blocks *future* Supabase Auth sign-ins — it does nothing to an
    // already-issued, unexpired JWT, and this backend's own JWT
    // verification (`apps/api/src/lib/auth/jwt.ts`) is entirely stateless
    // (JWKS signature check only, no round-trip to GoTrue's live user
    // state), so a ban would not have achieved the required semantic
    // either). This column is the smallest contained, fully
    // backend-owned mechanism that DOES achieve the real product
    // requirement ("invalidate the target's currently valid sessions so
    // they cannot continue being used") against an already-issued token:
    // a super_admin's Force Sign-Out action sets this to `now()`;
    // `findStaffByAuthUserId` (apps/api/src/lib/auth/db-port.ts) compares
    // it against the presented JWT's own `iat` claim on every
    // authenticated request, rejecting any token issued before this
    // timestamp — the exact same per-request, fail-closed resolution
    // point `status = 'active'` already established, extended rather
    // than duplicated. NULL means "no invalidation has ever been
    // triggered" (every token accepted, subject to the usual `exp`
    // check). Like `status`, this is enforced via the SAME
    // `staff_self_update_column_guard` deny-list trigger extended for it
    // in migration 0023 — omitting that extension would let a staff
    // member undo their own force-sign-out by clearing this column via
    // `staff_update_own_limited`.
    sessionsInvalidatedBefore: timestamp("sessions_invalidated_before", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("staff_auth_user_id_key").on(t.authUserId),
    index("staff_role_idx").on(t.role),
    index("staff_hostel_id_idx").on(t.hostelId),
    index("staff_status_idx").on(t.status),

    pgPolicy("staff_select_own", {
      for: "select",
      to: authenticatedRole,
      using: sql`${t.authUserId} = auth.uid()`,
    }),
    pgPolicy("staff_update_own_limited", {
      for: "update",
      to: authenticatedRole,
      // Row-level only — RLS USING/WITH CHECK constrain WHICH ROW, never
      // WHICH COLUMNS. Column-level enforcement (self-service may only
      // touch full_name/updated_at — never id/auth_user_id/role/hostel_id)
      // is a BEFORE UPDATE trigger, `staff_self_update_column_guard`
      // (supabase/migrations/0009_qg01_staff_privilege_column_protection.sql),
      // not expressible in Drizzle's schema DSL. QG-01 (Authentication &
      // Security Review, F-QG01-01) found this column gap unguarded and
      // empirically proved it a complete privilege-escalation path — the
      // "at implementation time" this comment previously deferred to had
      // never actually happened. See that migration's own comment for the
      // full root-cause account and `supabase/tests/database/16_qg01_staff_privilege_column_protection.sql`
      // for regression coverage. Phase 5, Prompt 13: the trigger function
      // is a DENY-LIST of specific named columns (id/auth_user_id/role/
      // hostel_id/created_at), not an allow-list — adding the new `status`
      // column here required EXPLICITLY extending that deny-list in the new
      // migration (0021), or it would have been silently self-updatable —
      // the exact "a new column isn't automatically covered by an existing
      // guard" lesson this project has already learned twice (QG-01 itself;
      // F-QG03-09's relationship-table gap). See migration 0021's own
      // comment and `supabase/tests/database/25_prompt13_staff_status_self_update_guard.sql`.
      // Migration 0021 also fixed a second, independently-discovered bug:
      // being SECURITY INVOKER, this trigger fires even for Fastify's own
      // service-role connection (a trigger is not an RLS policy and is
      // therefore NOT bypassed the way every RLS policy already is) — and
      // that connection has no auth.uid() context at all, so
      // current_staff_role() = 'super_admin' could never pass for it,
      // silently blocking Fastify's own trusted backend from ever updating
      // role/hostel_id/status. Fixed by also exempting `auth.uid() is
      // null` (see migration 0021's own comment for the full account).
      using: sql`${t.authUserId} = auth.uid()`,
      withCheck: sql`${t.authUserId} = auth.uid()`,
    }),
    pgPolicy("staff_all_super_admin", {
      for: "all",
      to: authenticatedRole,
      using: isSuperAdmin,
      withCheck: isSuperAdmin,
    }),
  ],
).enableRLS();

export const parentStudentRelationships = pgTable(
  "parent_student_relationships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentId: uuid("parent_id")
      .notNull()
      .references(() => parents.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    relationshipType: parentRelationshipType("relationship_type").notNull(),
    escalationOrder: smallint("escalation_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("psr_parent_student_key").on(t.parentId, t.studentId),
    index("psr_student_id_idx").on(t.studentId, t.escalationOrder),
    index("psr_parent_id_idx").on(t.parentId),

    pgPolicy("psr_select_own_student", {
      for: "select",
      to: authenticatedRole,
      using: sql`${t.studentId} = ${callerStudentId}`,
    }),
    pgPolicy("psr_select_own_parent", {
      for: "select",
      to: authenticatedRole,
      using: sql`${t.parentId} = ${callerParentId}`,
    }),
    // F-QG03-09 remediation (CRITICAL — independent QG-03 re-verification):
    // this was previously ONE `for: "all"` policy (psr_all_hostel_admin),
    // granting hostel_admin unrestricted INSERT/UPDATE/DELETE on this table,
    // scoped only by the student side (isHostelAdminForStudent). A hostel
    // admin could INSERT a fabricated relationship linking ANY existing
    // parent (any hostel, no legitimate connection) to one of their own
    // students, then use that fabricated row to satisfy `parents`'
    // isHostelAdminForParent check and read/write that parent's PII — live-
    // reproduced, independently, reinstating the exact cross-hostel PII
    // read+write impact F-QG03-01 was remediated to eliminate.
    //
    // Exhaustive repository search (see the 0020 migration's own header
    // comment and docs/qg03-remediation.md's F-QG03-09 section) found NO
    // legitimate product workflow — Fastify, frontend, or documented
    // onboarding — that writes to this table at all; every write anywhere in
    // the repository is either seed data or test-fixture setup, both via the
    // service-role connection (unaffected by RLS). hostel_admin therefore has
    // no legitimate INSERT/UPDATE/DELETE need on this table today. Mirroring
    // the identical "no legitimate workflow = no policy" precedent the 0019
    // migration already established for `parents` INSERT, hostel_admin's
    // write authority is removed entirely, retaining only the pre-existing,
    // correctly-scoped SELECT (multi-hostel-parent semantics unchanged — see
    // that migration's header comment for the full reasoning).
    pgPolicy("psr_select_hostel_admin", {
      for: "select",
      to: authenticatedRole,
      using: isHostelAdminForStudent(t.studentId),
    }),
    pgPolicy("psr_all_super_admin", {
      for: "all",
      to: authenticatedRole,
      using: isSuperAdmin,
      withCheck: isSuperAdmin,
    }),
  ],
).enableRLS();
