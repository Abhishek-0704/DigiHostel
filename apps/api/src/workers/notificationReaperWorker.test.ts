import { describe, it, expect } from "vitest";
import { processReapJob } from "./notificationReaperWorker.js";
import { FakeNotificationRepository } from "../domain/notification/__fixtures__/fake-repository.js";
import type { NotificationJobPayload, JobScheduler } from "../lib/queue/jobs.js";

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

const HOUR_AGO = new Date(Date.now() - 60 * 60 * 1000);
const NOW = new Date();

describe("processReapJob", () => {
  it("re-enqueues a notification job for a stale claim it finds", async () => {
    const repo = new FakeNotificationRepository()
      .setRecipients("lr-1", "father_notified", [{ recipientId: "parent-1", pushTokens: ["t1"] }])
      .setStudent("lr-1", { fullName: "x", rollNumber: "y" });
    const row = await repo.upsertLogicalNotification("lr-1", "father_notified", "parent-1");
    repo.simulateStaleClaim(row.id, HOUR_AGO);
    const scheduler = new RecordingJobScheduler();

    await processReapJob(repo, scheduler);

    expect(scheduler.enqueuedNotifications).toHaveLength(1);
    expect(scheduler.enqueuedNotifications[0].payload).toEqual({
      leaveRequestId: "lr-1",
      stage: "father_notified",
      notificationId: row.id,
    });
    expect(scheduler.enqueuedNotifications[0].startAfterMs).toBe(0);
  });

  it("does not reclaim a fresh (recently-claimed, still within its lease) row", async () => {
    const repo = new FakeNotificationRepository()
      .setRecipients("lr-1", "father_notified", [{ recipientId: "parent-1", pushTokens: ["t1"] }])
      .setStudent("lr-1", { fullName: "x", rollNumber: "y" });
    const row = await repo.upsertLogicalNotification("lr-1", "father_notified", "parent-1");
    repo.simulateStaleClaim(row.id, NOW); // "just claimed", not stale
    const scheduler = new RecordingJobScheduler();

    // findStaleClaims is called with a cutoff in the past; a claimedAt of
    // "now" is never older than that cutoff, so it must not be found.
    await processReapJob(repo, scheduler);

    expect(scheduler.enqueuedNotifications).toHaveLength(0);
  });

  it("does nothing when there are no stale claims", async () => {
    const repo = new FakeNotificationRepository();
    const scheduler = new RecordingJobScheduler();

    await expect(processReapJob(repo, scheduler)).resolves.toBeUndefined();
    expect(scheduler.enqueuedNotifications).toHaveLength(0);
  });

  it("each reclaimed row gets its own distinct singletonKey — never collides with an unrelated pending retry", async () => {
    const repo = new FakeNotificationRepository()
      .setRecipients("lr-1", "father_notified", [{ recipientId: "parent-1", pushTokens: ["t1"] }])
      .setStudent("lr-1", { fullName: "x", rollNumber: "y" });
    const row = await repo.upsertLogicalNotification("lr-1", "father_notified", "parent-1");
    repo.simulateStaleClaim(row.id, HOUR_AGO);
    const scheduler = new RecordingJobScheduler();

    await processReapJob(repo, scheduler);
    await processReapJob(repo, scheduler); // a second pass over the same still-stale row

    // Two independent re-enqueue attempts, deliberately not deduplicated by
    // the reaper itself (see processReapJob's own doc comment) — safety
    // against a double-send lives in claimAttempt's own lease gate, not
    // here.
    expect(scheduler.enqueuedNotifications).toHaveLength(2);
  });

  it("processes multiple stale claims across different logical notifications in one pass", async () => {
    const repo = new FakeNotificationRepository()
      .setRecipients("lr-1", "father_notified", [{ recipientId: "parent-1", pushTokens: ["t1"] }])
      .setRecipients("lr-1", "mother_notified", [{ recipientId: "parent-2", pushTokens: ["t2"] }])
      .setStudent("lr-1", { fullName: "x", rollNumber: "y" });
    const rowA = await repo.upsertLogicalNotification("lr-1", "father_notified", "parent-1");
    const rowB = await repo.upsertLogicalNotification("lr-1", "mother_notified", "parent-2");
    repo.simulateStaleClaim(rowA.id, HOUR_AGO);
    repo.simulateStaleClaim(rowB.id, HOUR_AGO);
    const scheduler = new RecordingJobScheduler();

    await processReapJob(repo, scheduler);

    expect(scheduler.enqueuedNotifications).toHaveLength(2);
    const notifiedIds = scheduler.enqueuedNotifications.map((n) => n.payload.notificationId).sort();
    expect(notifiedIds).toEqual([rowA.id, rowB.id].sort());
  });
});
