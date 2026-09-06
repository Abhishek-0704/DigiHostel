import {
  and,
  eq,
  inArray,
  isNull,
  isNotNull,
  lt,
  or,
  sql,
  db,
  leaveRequests,
  notifications,
  parents,
  parentStudentRelationships,
  students,
  trustedDevices,
} from "@digihostel/db";
import { NOTIFICATION_CLAIM_LEASE_MS } from "../../config/escalation.js";
import type { DecidableStatus } from "../leave/types.js";
import type {
  NotificationRow,
  NotificationRowStatus,
  RecipientTarget,
  StaleNotificationClaim,
} from "./types.js";

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

  /**
   * Conditional claim (ADR-018 §4, re-designed under F-03 — PRR Phase 13).
   * Atomically claims `notificationId` if it is currently `status = 'queued'`
   * AND either never claimed before (`claimed_at IS NULL`) or its previous
   * claim's lease has expired (`claimed_at` older than
   * `NOTIFICATION_CLAIM_LEASE_MS` — see config/escalation.ts). On success,
   * bumps `retry_count` and refreshes `claimed_at` in the same UPDATE.
   * Returns null if the claim did not match (another worker/attempt
   * currently holds an unexpired lease, or the row is terminal —
   * `'sent'`/`'delivered'`/`'failed'`; `'failed'` is a genuinely terminal
   * outcome in this domain — see recordOutcome's own callers — and must
   * never be reclaimed, so it is deliberately excluded here, unlike the
   * pre-F-03 version of this method).
   *
   * Deliberately does NOT take an `expectedRetryCount` parameter (the
   * pre-F-03 design's root cause): that value was copied into a pg-boss job
   * payload at schedule time and could go stale the moment a *different*
   * attempt (a crash-triggered redelivery, or the reaper) changed the row's
   * real `retry_count` first — a redelivered job carrying the old value
   * would then never match this method's WHERE clause again, silently and
   * permanently abandoning an otherwise-still-eligible attempt. This
   * version instead derives claim eligibility entirely from the row's OWN
   * current, authoritative state (status + lease), so a stale job payload
   * can never permanently prevent recovery — it simply re-derives whatever
   * is actually true right now.
   */
  claimAttempt(notificationId: string): Promise<NotificationRow | null>;

  /** Records the outcome of an attempt this caller already claimed via
   * claimAttempt — no further concurrency check needed, since claimAttempt
   * already established exclusive ownership of this specific attempt. */
  recordOutcome(notificationId: string, status: NotificationRowStatus): Promise<void>;

  /** F-03: the reaper's own query — every currently-claimed, not-yet-terminal
   * (`status = 'queued'`) notification whose lease has expired (its claimant
   * never recorded an outcome or scheduled a retry — almost certainly a
   * crashed/killed worker), oldest-stale-first, bounded to `limit` rows via
   * the partial `notifications_stale_claim_idx` index — never an unbounded
   * scan. Finding a row here does not itself change anything; the caller
   * (the reaper) re-enqueues a notification job for it, and this same
   * `claimAttempt` is what then safely reclaims (or, under a genuine race,
   * correctly declines to reclaim) it. */
  findStaleClaims(olderThan: Date, limit: number): Promise<StaleNotificationClaim[]>;

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

  async claimAttempt(notificationId: string): Promise<NotificationRow | null> {
    const leaseCutoff = new Date(Date.now() - NOTIFICATION_CLAIM_LEASE_MS);
    const updated = await db
      .update(notifications)
      .set({ retryCount: sql`${notifications.retryCount} + 1`, claimedAt: new Date() })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.status, "queued"),
          or(isNull(notifications.claimedAt), lt(notifications.claimedAt, leaseCutoff)),
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

  async findStaleClaims(olderThan: Date, limit: number): Promise<StaleNotificationClaim[]> {
    const rows = await db
      .select({
        id: notifications.id,
        leaveRequestId: notifications.relatedLeaveRequestId,
        stage: notifications.stage,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.status, "queued"),
          isNotNull(notifications.claimedAt),
          lt(notifications.claimedAt, olderThan),
        ),
      )
      .orderBy(notifications.claimedAt)
      .limit(limit);

    // relatedLeaveRequestId/stage are nullable in the schema (a future
    // non-leave notification type would have neither) — every row this
    // query can ever match is a leave-escalation notification (the only
    // kind this codebase creates today, always with both set), but the
    // filter is explicit rather than assumed, so a future notification
    // kind can never silently be mis-reaped.
    return rows.filter(
      (row): row is { id: string; leaveRequestId: string; stage: DecidableStatus } =>
        row.leaveRequestId !== null && row.stage !== null,
    );
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
