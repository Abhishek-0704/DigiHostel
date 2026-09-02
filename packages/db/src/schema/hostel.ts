import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, uniqueIndex, index, pgPolicy } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { students, parentStudentRelationships } from "./identity.js";
import { callerParentId, isHostelAdmin, isSuperAdmin } from "./rls-helpers.js";

// docs/database-schema-design.md — Hostel Domain (minimal, reference data)

export const hostels = pgTable(
  "hostels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("hostels_name_key").on(t.name),

    pgPolicy("hostels_select_authenticated", {
      for: "select",
      to: authenticatedRole,
      using: sql`true`,
    }),
    pgPolicy("hostels_all_super_admin", {
      for: "all",
      to: authenticatedRole,
      using: isSuperAdmin,
      withCheck: isSuperAdmin,
    }),
  ],
).enableRLS();

export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hostelId: uuid("hostel_id")
      .notNull()
      .references(() => hostels.id),
    roomNumber: text("room_number").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("rooms_hostel_room_key").on(t.hostelId, t.roomNumber),

    pgPolicy("rooms_select_authenticated", {
      for: "select",
      to: authenticatedRole,
      using: sql`true`,
    }),
    pgPolicy("rooms_all_hostel_admin", {
      for: "all",
      to: authenticatedRole,
      using: sql`${isHostelAdmin} and ${t.hostelId} = public.current_staff_hostel_id()`,
      withCheck: sql`${isHostelAdmin} and ${t.hostelId} = public.current_staff_hostel_id()`,
    }),
    pgPolicy("rooms_all_super_admin", {
      for: "all",
      to: authenticatedRole,
      using: isSuperAdmin,
      withCheck: isSuperAdmin,
    }),
  ],
).enableRLS();

export const studentRoomAssignments = pgTable(
  "student_room_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("sra_current_assignment_key")
      .on(t.studentId)
      .where(sql`${t.endedAt} is null`),
    index("sra_student_id_idx").on(t.studentId),

    pgPolicy("sra_select_own_student", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from students s where s.id = ${t.studentId} and s.auth_user_id = auth.uid())`,
    }),
    pgPolicy("sra_select_linked_parent", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from ${parentStudentRelationships} psr where psr.student_id = ${t.studentId} and psr.parent_id = ${callerParentId})`,
    }),
    pgPolicy("sra_all_hostel_admin", {
      for: "all",
      to: authenticatedRole,
      using: sql`${isHostelAdmin} and exists (select 1 from rooms r where r.id = ${t.roomId} and r.hostel_id = public.current_staff_hostel_id())`,
      withCheck: sql`${isHostelAdmin} and exists (select 1 from rooms r where r.id = ${t.roomId} and r.hostel_id = public.current_staff_hostel_id())`,
    }),
    pgPolicy("sra_all_super_admin", {
      for: "all",
      to: authenticatedRole,
      using: isSuperAdmin,
      withCheck: isSuperAdmin,
    }),
  ],
).enableRLS();
