import { describe, it, expect } from "vitest";
import { processNotificationJob } from "./notificationWorker.js";
import { FakeNotificationRepository } from "../domain/notification/__fixtures__/fake-repository.js";
import type { NotificationJobPayload, JobScheduler } from "../lib/queue/jobs.js";
import type { PushSendResult, PushSender } from "../domain/notification/types.js";

const STUDENT_SUMMARY = { fullName: "Test Student", rollNumber: "TS-001" };

class RecordingJobScheduler implements JobScheduler {
  enqueuedEscalation: unknown[] = [];
  enqueuedNotifications: Array<{ payload: NotificationJobPayload; startAfterMs: number }> = [];
  async enqueueEscalationJob(payload: unknown): Promise<void> {
    this.enqueuedEscalation.push(payload);
  }
  async enqueueNotificationJob(
    payload: NotificationJobPayload,
    options: { startAfterMs: number },
  ): Promise<void> {
    this.enqueuedNotifications.push({ payload, startAfterMs: options.startAfterMs });
  }
}

function alwaysAccept(): PushSender {
  return { send: async () => ({ outcome: "accepted" }) };
}
function alwaysReject(reason = "test_rejected"): PushSender {
  return { send: async () => ({ outcome: "rejected", reason }) };
}
function fixedOutcomes(outcomes: PushSendResult[]): PushSender {
  let i = 0;
  return { send: async () => outcomes[Math.min(i++, outcomes.length - 1)] };
}

describe("processNotificationJob — initial stage-triggered job", () => {
  it("resolves recipients, upserts a logical notification per recipient, and records 'sent' on acceptance", async () => {
    const repo = new FakeNotificationRepository()
      .setRecipients("lr-1", "father_notified", [
        { recipientId: "parent-1", pushTokens: ["tok-1"] },
      ])
      .setStudent("lr-1", STUDENT_SUMMARY);
    const scheduler = new RecordingJobScheduler();

    await processNotificationJob(
      { leaveRequestId: "lr-1", stage: "father_notified" },
      repo,
      alwaysAccept(),
      scheduler,
    );

    const rows = repo.allRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("sent");
    expect(rows[0].retryCount).toBe(1);
    expect(scheduler.enqueuedNotifications).toHaveLength(0); // no retry needed
  });

  it("zero recipients (e.g. manual_verification — out of scope, no defined content): no rows created, no crash", async () => {
    const repo = new FakeNotificationRepository().setStudent("lr-1", STUDENT_SUMMARY);
    const scheduler = new RecordingJobScheduler();

    await processNotificationJob(
      { leaveRequestId: "lr-1", stage: "manual_verification" },
      repo,
      alwaysAccept(),
      scheduler,
    );

    expect(repo.allRows()).toHaveLength(0);
  });

  it("in_app_call fans out to every provided recipient (father+mother+guardian), not one relationship type", async () => {
    const repo = new FakeNotificationRepository()
      .setRecipients("lr-1", "in_app_call", [
        { recipientId: "parent-father", pushTokens: ["t1"] },
        { recipientId: "parent-mother", pushTokens: ["t2"] },
        { recipientId: "parent-guardian", pushTokens: ["t3"] },
      ])
      .setStudent("lr-1", STUDENT_SUMMARY);
    const scheduler = new RecordingJobScheduler();

    await processNotificationJob(
      { leaveRequestId: "lr-1", stage: "in_app_call" },
      repo,
      alwaysAccept(),
      scheduler,
    );

    expect(repo.allRows()).toHaveLength(3);
    expect(repo.allRows().every((r) => r.status === "sent")).toBe(true);
  });
});

describe("processNotificationJob — retry policy (1 initial + 3 retries, 30s/60s/120s, exponential, capped at 120s)", () => {
  it("a rejected first attempt schedules a retry at 30s with expectedRetryCount=1", async () => {
    const repo = new FakeNotificationRepository()
      .setRecipients("lr-1", "father_notified", [{ recipientId: "parent-1", pushTokens: ["t1"] }])
      .setStudent("lr-1", STUDENT_SUMMARY);
    const scheduler = new RecordingJobScheduler();

    await processNotificationJob(
      { leaveRequestId: "lr-1", stage: "father_notified" },
      repo,
      alwaysReject(),
      scheduler,
    );

    expect(repo.allRows()[0].status).toBe("queued"); // still retryable, not failed yet
    expect(scheduler.enqueuedNotifications).toHaveLength(1);
    expect(scheduler.enqueuedNotifications[0].startAfterMs).toBe(30_000);
    expect(scheduler.enqueuedNotifications[0].payload.expectedRetryCount).toBe(1);
  });

  it("an 'unknown' provider outcome is treated identically to 'rejected' (ADR-018 §5, Case 3)", async () => {
    const repo = new FakeNotificationRepository()
      .setRecipients("lr-1", "father_notified", [{ recipientId: "parent-1", pushTokens: ["t1"] }])
      .setStudent("lr-1", STUDENT_SUMMARY);
    const scheduler = new RecordingJobScheduler();
    const unknownSender: PushSender = { send: async () => ({ outcome: "unknown" }) };

    await processNotificationJob(
      { leaveRequestId: "lr-1", stage: "father_notified" },
      repo,
      unknownSender,
      scheduler,
    );

    expect(scheduler.enqueuedNotifications).toHaveLength(1);
    expect(scheduler.enqueuedNotifications[0].startAfterMs).toBe(30_000);
  });

  it("all four attempts fail: exhausts after retry 3 (120s), never a 5th attempt, final status 'failed'", async () => {
    const repo = new FakeNotificationRepository()
      .setRecipients("lr-1", "father_notified", [{ recipientId: "parent-1", pushTokens: ["t1"] }])
      .setStudent("lr-1", STUDENT_SUMMARY);
    const scheduler = new RecordingJobScheduler();

    // Attempt 1 (initial).
    await processNotificationJob(
      { leaveRequestId: "lr-1", stage: "father_notified" },
      repo,
      alwaysReject(),
      scheduler,
    );
    const notificationId = repo.allRows()[0].id;
    expect(scheduler.enqueuedNotifications[0].startAfterMs).toBe(30_000);

    // Attempt 2 (retry 1).
    await processNotificationJob(
      { leaveRequestId: "lr-1", stage: "father_notified", notificationId, expectedRetryCount: 1 },
      repo,
      alwaysReject(),
      scheduler,
    );
    expect(scheduler.enqueuedNotifications[1].startAfterMs).toBe(60_000);

    // Attempt 3 (retry 2).
    await processNotificationJob(
      { leaveRequestId: "lr-1", stage: "father_notified", notificationId, expectedRetryCount: 2 },
      repo,
      alwaysReject(),
      scheduler,
    );
    expect(scheduler.enqueuedNotifications[2].startAfterMs).toBe(120_000);

    // Attempt 4 (retry 3, the last provider attempt allowed) — exhausted.
    await processNotificationJob(
      { leaveRequestId: "lr-1", stage: "father_notified", notificationId, expectedRetryCount: 3 },
      repo,
      alwaysReject(),
      scheduler,
    );

    expect(scheduler.enqueuedNotifications).toHaveLength(3); // no 5th attempt scheduled
    expect(repo.getRow(notificationId)?.status).toBe("failed");
    expect(repo.getRow(notificationId)?.retryCount).toBe(4);
  });

  it("a retry that later succeeds records 'sent' and stops retrying", async () => {
    const repo = new FakeNotificationRepository()
      .setRecipients("lr-1", "father_notified", [{ recipientId: "parent-1", pushTokens: ["t1"] }])
      .setStudent("lr-1", STUDENT_SUMMARY);
    const scheduler = new RecordingJobScheduler();
    const sender = fixedOutcomes([{ outcome: "rejected", reason: "x" }, { outcome: "accepted" }]);

    await processNotificationJob(
      { leaveRequestId: "lr-1", stage: "father_notified" },
      repo,
      sender,
      scheduler,
    );
    const notificationId = repo.allRows()[0].id;

    await processNotificationJob(
      { leaveRequestId: "lr-1", stage: "father_notified", notificationId, expectedRetryCount: 1 },
      repo,
      sender,
      scheduler,
    );

    expect(repo.getRow(notificationId)?.status).toBe("sent");
    expect(scheduler.enqueuedNotifications).toHaveLength(1); // only the one retry, none after success
  });

  it("a stale/duplicate retry job (expectedRetryCount no longer matches) is a clean no-op", async () => {
    const repo = new FakeNotificationRepository()
      .setRecipients("lr-1", "father_notified", [{ recipientId: "parent-1", pushTokens: ["t1"] }])
      .setStudent("lr-1", STUDENT_SUMMARY);
    const scheduler = new RecordingJobScheduler();

    await processNotificationJob(
      { leaveRequestId: "lr-1", stage: "father_notified" },
      repo,
      alwaysAccept(), // succeeds immediately, retryCount now 1, status "sent"
      scheduler,
    );
    const notificationId = repo.allRows()[0].id;

    // A duplicate/redelivered retry job for the (already-superseded) attempt 0.
    await expect(
      processNotificationJob(
        { leaveRequestId: "lr-1", stage: "father_notified", notificationId, expectedRetryCount: 0 },
        repo,
        alwaysAccept(),
        scheduler,
      ),
    ).resolves.toBeUndefined();

    expect(repo.getRow(notificationId)?.status).toBe("sent"); // unchanged
  });
});
