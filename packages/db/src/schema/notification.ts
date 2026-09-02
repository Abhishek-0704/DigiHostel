import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  smallint,
  timestamp,
  index,
  uniqueIndex,
  pgPolicy,
} from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { notificationRecipientType, notificationStatus, leaveRequestStatus } from "./enums.js";
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
    // Mirrors leave_request_status — the escalation stage this logical
    // notification is for (ADR-017 §5, ADR-018 §1). Nullable: only leave-
    // escalation notifications have a stage; a future library-pass
    // notification (relatedLibraryPassId set instead) has none. Together with
    // the uniqueness constraint below, `stage` is what makes
    // (leave_request_id, stage, recipient_id) a well-defined logical
    // notification identity distinct from an individual delivery attempt
    // (tracked via retryCount, not a new row per attempt).
    stage: leaveRequestStatus("stage"),
    status: notificationStatus("status").notNull().default("queued"),
    retryCount: smallint("retry_count").notNull().default(0),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notifications_recipient_idx").on(t.recipientType, t.recipientId),
    index("notifications_status_idx").on(t.status),
    // ADR-017 §5 / ADR-018 §1: one logical notification per escalation stage
    // per recipient. Postgres treats each NULL `stage` as distinct from every
    // other NULL, so non-leave (future library-pass) notifications, which
    // have no stage, are never constrained by this index.
    uniqueIndex("notifications_leave_stage_recipient_key").on(
      t.relatedLeaveRequestId,
      t.recipientId,
      t.stage,
    ),

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
