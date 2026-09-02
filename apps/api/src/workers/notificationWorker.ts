import { boss } from "../lib/queue/boss.js";
import {
  NOTIFICATION_QUEUE,
  PgBossJobScheduler,
  type JobScheduler,
  type NotificationJobPayload,
} from "../lib/queue/jobs.js";
import type { NotificationRepository } from "../domain/notification/repository.js";
import type { PushSender } from "../domain/notification/types.js";
import { buildLeaveNotificationContent } from "./notificationContent.js";
import { NOTIFICATION_MAX_RETRIES, NOTIFICATION_RETRY_DELAYS_MS } from "../config/escalation.js";
import { logger } from "../lib/logger.js";

/**
 * One attempt at delivering one already-identified logical notification
 * (ADR-018 §2-§5). Claims the specific attempt (retryCount-gated conditional
 * update, mirroring decide()'s pattern), sends, and either records success,
 * schedules the next retry, or records permanent failure — always without
 * blocking the leave-escalation state machine (retry policy is independent
 * of escalation timing; a failed/stuck notification never prevents the
 * authoritative leave-request status from advancing — the escalation worker
 * runs on its own schedule, untouched by anything here).
 */
async function attemptDelivery(
  repo: NotificationRepository,
  sender: PushSender,
  scheduler: JobScheduler,
  leaveRequestId: string,
  notificationId: string,
  currentRetryCount: number,
): Promise<void> {
  const claimed = await repo.claimAttempt(notificationId, currentRetryCount);
  if (!claimed) {
    // Another worker already claimed/completed this exact attempt, or the
    // row reached a terminal status in the meantime — clean no-op.
    return;
  }

  const student = await repo.getStudentSummary(leaveRequestId);
  if (!student) {
    // Leave request no longer resolvable (should not happen in practice) —
    // nothing sensible to send; fail this attempt rather than guess content.
    await repo.recordOutcome(claimed.id, "failed");
    return;
  }

  const tokens = await repo.getPushTokensForRecipient(claimed.recipientId);
  const content = buildLeaveNotificationContent(student);
  const result = await sender.send(tokens, content.title, content.body);

  if (result.outcome === "accepted") {
    await repo.recordOutcome(claimed.id, "sent");
    return;
  }

  // "rejected" and "unknown" are resolved identically (ADR-018 §5) — both
  // feed the same retry path, up to the same bound.
  const attemptsMade = claimed.retryCount; // already incremented by claimAttempt
  if (attemptsMade > NOTIFICATION_MAX_RETRIES) {
    await repo.recordOutcome(claimed.id, "failed");
    return;
  }

  const delayMs = NOTIFICATION_RETRY_DELAYS_MS[attemptsMade - 1];
  await scheduler.enqueueNotificationJob(
    {
      leaveRequestId,
      stage: claimed.stage,
      notificationId: claimed.id,
      expectedRetryCount: attemptsMade,
    },
    {
      startAfterMs: delayMs,
      singletonKey: `notification:${claimed.id}:attempt:${attemptsMade}`,
    },
  );
}

/** Exported for unit testing (fakes only — no real pg-boss connection
 * needed). registerNotificationWorker is the production entry point. */
export async function processNotificationJob(
  payload: NotificationJobPayload,
  repo: NotificationRepository,
  sender: PushSender,
  scheduler: JobScheduler,
): Promise<void> {
  if (payload.notificationId !== undefined && payload.expectedRetryCount !== undefined) {
    // Self-scheduled retry for one already-created logical notification.
    await attemptDelivery(
      repo,
      sender,
      scheduler,
      payload.leaveRequestId,
      payload.notificationId,
      payload.expectedRetryCount,
    );
    return;
  }

  // Initial stage-triggered job: resolve recipients fresh (ADR-016's
  // "notify every matching relationship, not one canonical contact"), then
  // create/attempt each recipient's own logical notification.
  const recipients = await repo.resolveRecipients(payload.leaveRequestId, payload.stage);
  for (const recipient of recipients) {
    const row = await repo.upsertLogicalNotification(
      payload.leaveRequestId,
      payload.stage,
      recipient.recipientId,
    );
    if (row.status === "sent" || row.status === "delivered") {
      continue; // already handled — idempotent re-entry (a redelivered job)
    }
    await attemptDelivery(repo, sender, scheduler, payload.leaveRequestId, row.id, row.retryCount);
  }
}

export function registerNotificationWorker(
  repository: NotificationRepository,
  sender: PushSender,
  scheduler: JobScheduler = new PgBossJobScheduler(),
): Promise<string> {
  return boss.work<NotificationJobPayload>(NOTIFICATION_QUEUE, async (jobs) => {
    for (const job of jobs) {
      try {
        await processNotificationJob(job.data, repository, sender, scheduler);
      } catch (err) {
        logger.error({ err, jobData: job.data }, "notification worker: unexpected error");
        throw err; // let pg-boss's own retry/backoff handle genuinely unexpected failures
      }
    }
  });
}
