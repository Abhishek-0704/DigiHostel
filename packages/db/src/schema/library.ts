import { sql } from "drizzle-orm";
import { pgTable, uuid, text, boolean, timestamp, index, pgPolicy } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { libraryPassStatus, checkpointType } from "./enums.js";
import { students, staff, parentStudentRelationships } from "./identity.js";
import {
  callerParentId,
  callerStudentId,
  isReception,
  isLibraryIncharge,
  isSuperAdmin,
} from "./rls-helpers.js";

// docs/database-schema-design.md — Library Domain

export const libraryPasses = pgTable(
  "library_passes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    status: libraryPassStatus("status").notNull().default("active"),
    expectedReturnBy: timestamp("expected_return_by", { withTimezone: true }),
    isOverdue: boolean("is_overdue").notNull().default(false),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("library_passes_student_id_idx").on(t.studentId),
    index("library_passes_active_idx")
      .on(t.studentId)
      .where(sql`${t.status} = 'active'`),
    index("library_passes_overdue_idx").on(t.isOverdue),

    pgPolicy("library_passes_select_own_student", {
      for: "select",
      to: authenticatedRole,
      using: sql`${t.studentId} = ${callerStudentId}`,
    }),
    pgPolicy("library_passes_insert_own_student", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${t.studentId} = ${callerStudentId}`,
    }),
    pgPolicy("library_passes_select_linked_parent", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from ${parentStudentRelationships} psr where psr.student_id = ${t.studentId} and psr.parent_id = ${callerParentId})`,
    }),
    pgPolicy("library_passes_all_reception", {
      for: "all",
      to: authenticatedRole,
      using: sql`${isReception} and exists (select 1 from ${students} st where st.id = ${t.studentId} and st.hostel_id = public.current_staff_hostel_id())`,
      withCheck: sql`${isReception} and exists (select 1 from ${students} st where st.id = ${t.studentId} and st.hostel_id = public.current_staff_hostel_id())`,
    }),
    pgPolicy("library_passes_all_library_incharge", {
      for: "all",
      to: authenticatedRole,
      using: isLibraryIncharge,
      withCheck: isLibraryIncharge,
    }),
    pgPolicy("library_passes_all_super_admin", {
      for: "all",
      to: authenticatedRole,
      using: isSuperAdmin,
      withCheck: isSuperAdmin,
    }),
  ],
).enableRLS();

export const qrSessions = pgTable(
  "qr_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    libraryPassId: uuid("library_pass_id")
      .notNull()
      .references(() => libraryPasses.id),
    checkpointType: checkpointType("checkpoint_type").notNull(),
    tokenHash: text("token_hash").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    usedByStaffId: uuid("used_by_staff_id").references(() => staff.id),
  },
  (t) => [
    index("qr_sessions_library_pass_id_idx").on(t.libraryPassId),
    index("qr_sessions_expires_at_idx").on(t.expiresAt),

    pgPolicy("qr_sessions_select_own_student", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from ${libraryPasses} lp where lp.id = ${t.libraryPassId} and lp.student_id = ${callerStudentId})`,
    }),
    pgPolicy("qr_sessions_all_reception_library", {
      for: "all",
      to: authenticatedRole,
      using: sql`${isReception} or ${isLibraryIncharge}`,
      withCheck: sql`${isReception} or ${isLibraryIncharge}`,
    }),
    pgPolicy("qr_sessions_all_super_admin", {
      for: "all",
      to: authenticatedRole,
      using: isSuperAdmin,
      withCheck: isSuperAdmin,
    }),
  ],
).enableRLS();

export const journeyEvents = pgTable(
  "journey_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    libraryPassId: uuid("library_pass_id")
      .notNull()
      .references(() => libraryPasses.id),
    qrSessionId: uuid("qr_session_id")
      .notNull()
      .references(() => qrSessions.id),
    checkpointType: checkpointType("checkpoint_type").notNull(),
    verifiedByStaffId: uuid("verified_by_staff_id")
      .notNull()
      .references(() => staff.id),
    biometricConfirmed: boolean("biometric_confirmed").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("journey_events_library_pass_id_idx").on(t.libraryPassId),
    index("journey_events_occurred_at_idx").on(t.occurredAt),

    pgPolicy("journey_events_select_own_student", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from ${libraryPasses} lp where lp.id = ${t.libraryPassId} and lp.student_id = ${callerStudentId})`,
    }),
    pgPolicy("journey_events_select_linked_parent", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from ${libraryPasses} lp join ${parentStudentRelationships} psr on psr.student_id = lp.student_id where lp.id = ${t.libraryPassId} and psr.parent_id = ${callerParentId})`,
    }),
    pgPolicy("journey_events_insert_reception_library", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        (${isReception} or ${isLibraryIncharge})
        and ${t.verifiedByStaffId} = public.current_staff_id()
        and ${t.biometricConfirmed} = true
      `,
    }),
    pgPolicy("journey_events_select_reception_library", {
      for: "select",
      to: authenticatedRole,
      using: sql`${isReception} or ${isLibraryIncharge}`,
    }),
    pgPolicy("journey_events_all_super_admin", {
      for: "all",
      to: authenticatedRole,
      using: isSuperAdmin,
      withCheck: isSuperAdmin,
    }),
  ],
).enableRLS();
