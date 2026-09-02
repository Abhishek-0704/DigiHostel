import {
  and,
  eq,
  inArray,
  isNull,
  db,
  leaveRequests,
  notifications,
  parents,
  parentStudentRelationships,
  students,
  trustedDevices,
} from "@digihostel/db";
import type { DecidableStatus } from "../leave/types.js";
import type { NotificationRow, NotificationRowStatus, RecipientTarget } from "./types.js";

/** Which parent_student_relationships.relationship_type value(s) are the
 * intended audience for a given escalation stage. Empty for stages with no
 * defined parent-facing notification content — `pending` (nobody is
 * notified while merely pending; the first notification IS the
 * father_notified transition) and `manual_verification` (routes to a
 * reception dashboard that does not exist yet — genuinely out of scope, not
 * silently invented). `in_app_call` targets every linked parent/guardian,
 * not one relationship type — the final automated attempt before manual
 * verification. */
function stageRecipientRelationshipTypes(
  stage: DecidableStatus,
): Array<"father" | "mother" | "guardian"> {
  switch (stage) {
    case "father_notified":
      return ["father"];
    case "mother_notified":
      return ["mother"];
    case "guardian_notified":
      return ["guardian"];
    case "in_app_call":
      return ["father", "mother", "guardian"];
    default:
      return [];
  }
}

export interface NotificationRepository {
  /** Resolves who should be notified for this leave request at this stage,
   * and each recipient's currently-trusted (non-revoked) devices' push
   * tokens. Fans out to every parent_student_relationships row matching the
   * stage's relationship type(s) — deliberately not "the one canonical
   * contact", since the schema has no uniqueness constraint on
   * (student_id, relationship_type) and ADR-016 explicitly declined to
   * resolve that ambiguity. */
  resolveRecipients(leaveRequestId: string, stage: DecidableStatus): Promise<RecipientTarget[]>;

  /** Idempotent: returns the existing row if one already exists for
   * (leave_request_id, recipient_id, stage) — ADR-017 §5 / ADR-018 §1's
   * uniqueness constraint is what makes this safe under concurrent/repeated
   * job execution. */
  upsertLogicalNotification(
    leaveRequestId: string,
    stage: DecidableStatus,
    recipientId: string,
  ): Promise<NotificationRow>;

  /** Conditional claim (ADR-018 §4): only one caller can successfully claim
   * a given (id, expectedRetryCount) pair, exactly mirroring decide()'s
   * conditional-UPDATE pattern. Returns null if the claim did not match
   * (another worker already claimed/completed this attempt, or the row is
   * already terminal). */
  claimAttempt(notificationId: string, expectedRetryCount: number): Promise<NotificationRow | null>;

  /** Records the outcome of an attempt this caller already claimed via
   * claimAttempt — no further concurrency check needed, since claimAttempt
   * already established exclusive ownership of this specific attempt. */
  recordOutcome(notificationId: string, status: NotificationRowStatus): Promise<void>;

  /** Non-sensitive fields for push content (ADR-018 §8 — name/roll number
   * may appear in a lock-screen-visible notification). Null if the leave
   * request no longer exists (defensive — should not happen in practice). */
  getStudentSummary(
    leaveRequestId: string,
  ): Promise<{ fullName: string; rollNumber: string } | null>;

  /** Fetched fresh at each attempt (never carried in a job payload) — a
   * retry may run minutes after the job was scheduled, by which time a
   * device could have been revoked or a token rotated. */
  getPushTokensForRecipient(recipientId: string): Promise<string[]>;
}

function toRow(row: typeof notifications.$inferSelect): NotificationRow {
  return {
    id: row.id,
    recipientId: row.recipientId,
    stage: row.stage as DecidableStatus,
    status: row.status,
    retryCount: row.retryCount,
  };
}

export class DrizzleNotificationRepository implements NotificationRepository {
  async resolveRecipients(
    leaveRequestId: string,
    stage: DecidableStatus,
  ): Promise<RecipientTarget[]> {
    const relationshipTypes = stageRecipientRelationshipTypes(stage);
    if (relationshipTypes.length === 0) {
      return [];
    }

    const rows = await db
      .select({
        parentId: parents.id,
        pushToken: trustedDevices.expoPushToken,
      })
      .from(leaveRequests)
      .innerJoin(
        parentStudentRelationships,
        eq(parentStudentRelationships.studentId, leaveRequests.studentId),
      )
      .innerJoin(parents, eq(parents.id, parentStudentRelationships.parentId))
      .leftJoin(
        trustedDevices,
        and(eq(trustedDevices.parentId, parents.id), isNull(trustedDevices.revokedAt)),
      )
      .where(
        and(
          eq(leaveRequests.id, leaveRequestId),
          inArray(parentStudentRelationships.relationshipType, relationshipTypes),
        ),
      );

    const byParent = new Map<string, string[]>();
    for (const row of rows) {
      const tokens = byParent.get(row.parentId) ?? [];
      if (row.pushToken) tokens.push(row.pushToken);
      byParent.set(row.parentId, tokens);
    }
    return [...byParent.entries()].map(([recipientId, pushTokens]) => ({
      recipientId,
      pushTokens,
    }));
  }

  async upsertLogicalNotification(
    leaveRequestId: string,
    stage: DecidableStatus,
    recipientId: string,
  ): Promise<NotificationRow> {
    const inserted = await db
      .insert(notifications)
      .values({
        recipientType: "parent",
        recipientId,
        relatedLeaveRequestId: leaveRequestId,
        stage,
      })
      .onConflictDoNothing({
        target: [
          notifications.relatedLeaveRequestId,
          notifications.recipientId,
          notifications.stage,
        ],
      })
      .returning();

    if (inserted[0]) {
      return toRow(inserted[0]);
    }

    // Already existed (idempotent re-entry — e.g. a redelivered job) — load
    // and return the existing row rather than fabricating a new one.
    const existing = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.relatedLeaveRequestId, leaveRequestId),
          eq(notifications.recipientId, recipientId),
          eq(notifications.stage, stage),
        ),
      )
      .limit(1);
    return toRow(existing[0]);
  }

  async claimAttempt(
    notificationId: string,
    expectedRetryCount: number,
  ): Promise<NotificationRow | null> {
    const updated = await db
      .update(notifications)
      .set({ retryCount: expectedRetryCount + 1 })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.retryCount, expectedRetryCount),
          inArray(notifications.status, ["queued", "failed"]),
        ),
      )
      .returning();
    return updated[0] ? toRow(updated[0]) : null;
  }

  async recordOutcome(notificationId: string, status: NotificationRowStatus): Promise<void> {
    const patch: { status: NotificationRowStatus; sentAt?: Date } = { status };
    if (status === "sent") {
      patch.sentAt = new Date();
    }
    await db.update(notifications).set(patch).where(eq(notifications.id, notificationId));
  }

  async getStudentSummary(
    leaveRequestId: string,
  ): Promise<{ fullName: string; rollNumber: string } | null> {
    const rows = await db
      .select({ fullName: students.fullName, rollNumber: students.rollNumber })
      .from(leaveRequests)
      .innerJoin(students, eq(students.id, leaveRequests.studentId))
      .where(eq(leaveRequests.id, leaveRequestId))
      .limit(1);
    return rows[0] ?? null;
  }

  async getPushTokensForRecipient(recipientId: string): Promise<string[]> {
    const rows = await db
      .select({ pushToken: trustedDevices.expoPushToken })
      .from(trustedDevices)
      .where(and(eq(trustedDevices.parentId, recipientId), isNull(trustedDevices.revokedAt)));
    return rows.map((r) => r.pushToken).filter((t): t is string => t !== null);
  }
}
