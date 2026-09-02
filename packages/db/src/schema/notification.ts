import { sql } from "drizzle-orm";
import { pgTable, uuid, smallint, timestamp, index, pgPolicy } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { notificationRecipientType, notificationStatus } from "./enums.js";
import { leaveRequests } from "./leave.js";
import { libraryPasses } from "./library.js";
import { callerParentId, callerStudentId, isSuperAdmin } from "./rls-helpers.js";

// docs/database-schema-design.md — Notification Domain (minimal, ADR-010)

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipientType: notificationRecipientType("recipient_type").notNull(),
    recipientId: uuid("recipient_id").notNull(),
    relatedLeaveRequestId: uuid("related_leave_request_id").references(() => leaveRequests.id),
    relatedLibraryPassId: uuid("related_library_pass_id").references(() => libraryPasses.id),
    status: notificationStatus("status").notNull().default("queued"),
    retryCount: smallint("retry_count").notNull().default(0),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notifications_recipient_idx").on(t.recipientType, t.recipientId),
    index("notifications_status_idx").on(t.status),

    // No INSERT/UPDATE policy for any client role — Fastify service-role
    // (bypasses RLS) is the sole writer, per docs/rls-policy-matrix.md.
    pgPolicy("notifications_select_own_parent", {
      for: "select",
      to: authenticatedRole,
      using: sql`${t.recipientType} = 'parent' and ${t.recipientId} = ${callerParentId}`,
    }),
    pgPolicy("notifications_select_own_student", {
      for: "select",
      to: authenticatedRole,
      using: sql`${t.recipientType} = 'student' and ${t.recipientId} = ${callerStudentId}`,
    }),
    pgPolicy("notifications_select_super_admin", {
      for: "select",
      to: authenticatedRole,
      using: isSuperAdmin,
    }),
  ],
).enableRLS();
