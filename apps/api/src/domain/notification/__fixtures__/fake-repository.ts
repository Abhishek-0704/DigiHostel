import type { NotificationRepository } from "../repository.js";
import type {
  NotificationRow,
  NotificationRowStatus,
  RecipientTarget,
  StaleNotificationClaim,
} from "../types.js";
import type { DecidableStatus } from "../../leave/types.js";

interface InternalRow extends NotificationRow {
  leaveRequestId: string;
  claimedAt: Date | null;
}

/**
 * Deterministic in-memory fake of NotificationRepository — mirrors the real
 * repository's `claimAttempt` (status + claim gate; see the interface's own
 * doc comment for why it no longer takes an `expectedRetryCount`), so unit
 * tests of the notification worker's retry/outcome branching stay
 * meaningful without a real database (same convention as
 * domain/leave/__fixtures__/fake-repository.ts).
 *
 * Deliberately does NOT simulate lease expiry (every claim here is
 * "instant," so there is no wall-clock gap to model) — this fake exists to
 * test the WORKER's business-logic branching (retry counting, backoff
 * scheduling, success/exhaustion), not the lease/concurrency mechanism
 * itself, which is a real-Postgres concern covered by
 * `repository.integration.test.ts` (F-03's crash-boundary/concurrency
 * tests). `claimAttempt` here treats "already claimed" the same as "not
 * claimed" for that reason — a caller in this fake context can always
 * re-claim their own row, since nothing here ever runs two claims
 * concurrently.
 */
export class FakeNotificationRepository implements NotificationRepository {
  private rows = new Map<string, InternalRow>();
  private recipients = new Map<string, RecipientTarget[]>();
  private students = new Map<string, { fullName: string; rollNumber: string }>();
  private tokens = new Map<string, string[]>();
  private nextId = 1;

  setRecipients(leaveRequestId: string, stage: DecidableStatus, recipients: RecipientTarget[]) {
    this.recipients.set(`${leaveRequestId}:${stage}`, recipients);
    return this;
  }
  setStudent(leaveRequestId: string, summary: { fullName: string; rollNumber: string }) {
    this.students.set(leaveRequestId, summary);
    return this;
  }
  setTokens(recipientId: string, tokens: string[]) {
    this.tokens.set(recipientId, tokens);
    return this;
  }
  getRow(id: string): InternalRow | undefined {
    return this.rows.get(id);
  }
  allRows(): InternalRow[] {
    return [...this.rows.values()];
  }
  /** F-03 test helper: backdates a row's claim as if it were claimed at
   * `claimedAt` (and, unless `status` is given, leaves it "queued" — the
   * state a genuine crashed attempt would be left in) — deterministically
   * reproduces "a claim exists whose lease has since expired" without
   * needing to actually wait out a real lease window. */
  simulateStaleClaim(id: string, claimedAt: Date, retryCount = 1): this {
    const row = this.rows.get(id);
    if (row) {
      row.claimedAt = claimedAt;
      row.retryCount = retryCount;
    }
    return this;
  }

  async resolveRecipients(
    leaveRequestId: string,
    stage: DecidableStatus,
  ): Promise<RecipientTarget[]> {
    return this.recipients.get(`${leaveRequestId}:${stage}`) ?? [];
  }

  async upsertLogicalNotification(
    leaveRequestId: string,
    stage: DecidableStatus,
    recipientId: string,
  ): Promise<NotificationRow> {
    const existing = [...this.rows.values()].find(
      (r) =>
        r.leaveRequestId === leaveRequestId && r.stage === stage && r.recipientId === recipientId,
    );
    if (existing) return existing;
    const row: InternalRow = {
      id: `notif-${this.nextId++}`,
      leaveRequestId,
      recipientId,
      stage,
      status: "queued",
      retryCount: 0,
      claimedAt: null,
    };
    this.rows.set(row.id, row);
    return row;
  }

  async claimAttempt(notificationId: string): Promise<NotificationRow | null> {
    const row = this.rows.get(notificationId);
    if (!row) return null;
    // 'failed' is terminal (F-03) — never reclaimable, matching the real
    // repository. Lease expiry is intentionally not modeled here — see this
    // class's own doc comment.
    if (row.status !== "queued") return null;
    row.retryCount = row.retryCount + 1;
    row.claimedAt = new Date();
    return { ...row };
  }

  async recordOutcome(notificationId: string, status: NotificationRowStatus): Promise<void> {
    const row = this.rows.get(notificationId);
    if (row) row.status = status;
  }

  async findStaleClaims(olderThan: Date, limit: number): Promise<StaleNotificationClaim[]> {
    return [...this.rows.values()]
      .filter((r) => r.status === "queued" && r.claimedAt !== null && r.claimedAt < olderThan)
      .sort((a, b) => (a.claimedAt as Date).getTime() - (b.claimedAt as Date).getTime())
      .slice(0, limit)
      .map((r) => ({ id: r.id, leaveRequestId: r.leaveRequestId, stage: r.stage }));
  }

  async getStudentSummary(
    leaveRequestId: string,
  ): Promise<{ fullName: string; rollNumber: string } | null> {
    return this.students.get(leaveRequestId) ?? null;
  }

  async getPushTokensForRecipient(recipientId: string): Promise<string[]> {
    return this.tokens.get(recipientId) ?? [];
  }
}
