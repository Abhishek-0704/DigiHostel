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
import { staffRole, parentRelationshipType } from "./enums.js";
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
    pgPolicy("parents_all_hostel_admin", {
      for: "all",
      to: authenticatedRole,
      using: isHostelAdmin,
      withCheck: isHostelAdmin,
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("staff_auth_user_id_key").on(t.authUserId),
    index("staff_role_idx").on(t.role),
    index("staff_hostel_id_idx").on(t.hostelId),

    pgPolicy("staff_select_own", {
      for: "select",
      to: authenticatedRole,
      using: sql`${t.authUserId} = auth.uid()`,
    }),
    pgPolicy("staff_update_own_limited", {
      for: "update",
      to: authenticatedRole,
      // Column-level restriction (not role/hostel_id) is enforced via a
      // dedicated view/grant at implementation time — RLS alone controls rows,
      // not columns; this row-level policy still requires ownership.
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
    pgPolicy("psr_all_hostel_admin", {
      for: "all",
      to: authenticatedRole,
      using: isHostelAdminForStudent(t.studentId),
      withCheck: isHostelAdminForStudent(t.studentId),
    }),
    pgPolicy("psr_all_super_admin", {
      for: "all",
      to: authenticatedRole,
      using: isSuperAdmin,
      withCheck: isSuperAdmin,
    }),
  ],
).enableRLS();
