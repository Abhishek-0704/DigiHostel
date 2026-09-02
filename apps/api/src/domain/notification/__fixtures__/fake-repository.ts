import type { NotificationRepository } from "../repository.js";
import type { NotificationRow, NotificationRowStatus, RecipientTarget } from "../types.js";
import type { DecidableStatus } from "../../leave/types.js";

interface InternalRow extends NotificationRow {
  leaveRequestId: string;
}

/** Deterministic in-memory fake of NotificationRepository — mirrors the real
 * repository's claimAttempt conditional-concurrency check (retryCount-gated),
 * so unit tests of the notification worker's retry/outcome branching stay
 * meaningful without a real database (same convention as
 * domain/leave/__fixtures__/fake-repository.ts). */
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
    };
    this.rows.set(row.id, row);
    return row;
  }

  async claimAttempt(
    notificationId: string,
    expectedRetryCount: number,
  ): Promise<NotificationRow | null> {
    const row = this.rows.get(notificationId);
    if (!row) return null;
    if (row.retryCount !== expectedRetryCount) return null;
    if (row.status !== "queued" && row.status !== "failed") return null;
    row.retryCount = expectedRetryCount + 1;
    return { ...row };
  }

  async recordOutcome(notificationId: string, status: NotificationRowStatus): Promise<void> {
    const row = this.rows.get(notificationId);
    if (row) row.status = status;
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
