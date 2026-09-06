import { boss } from "../lib/queue/boss.js";
import {
  NOTIFICATION_REAP_QUEUE,
  PgBossJobScheduler,
  type JobScheduler,
} from "../lib/queue/jobs.js";
import type { NotificationRepository } from "../domain/notification/repository.js";
import { NOTIFICATION_CLAIM_LEASE_MS, NOTIFICATION_REAP_BATCH_SIZE } from "../config/escalation.js";
import { logger } from "../lib/logger.js";

/**
 * F-03 remediation (PRR Phase 13 — notification crash/retry recovery).
 *
 * `NotificationRepository.claimAttempt`'s lease-based redesign makes any
 * *redelivered* job safe to reprocess, but redelivery itself still has to
 * come from somewhere: a scheduled retry that never got to
 * `enqueueNotificationJob` because its worker crashed first leaves nothing
 * that will ever run again on its own. ADR-017 §8 directs relying on
 * pg-boss's own native retry/expiration handling *first*, and this
 * codebase's pg-boss send calls do exactly that (no explicit
 * `expireInSeconds`/`retryLimit` override — installed pg-boss v12.29.0's
 * own defaults, 900s/2, still eventually redeliver a hung job) — but at
 * that timescale, and bounded by that retry count, recovery could take tens
 * of minutes and is not indefinite, which the PRR's F-03 finding
 * demonstrated is insufficient on its own for this specific case (the
 * pre-fix `claimAttempt` turned every such redelivery into a silent,
 * pg-boss-succeeding no-op, permanently abandoning the row well before
 * pg-boss's own retry budget was even exhausted).
 *
 * This reaper is the small, bounded, idempotent backstop ADR-017 §8 itself
 * anticipates ("if... found insufficient in practice, that is a
 * capacity/reliability signal warranting a follow-up decision") — not a new
 * queue technology (still pg-boss, ADR-011, using pg-boss's own native
 * cron-style `schedule()` recurrence rather than a hand-rolled
 * self-rescheduling job), not a change to escalation timing, and not a
 * replacement for pg-boss's own native mechanism, which remains the first
 * line of defense. It only ever re-enqueues an ordinary
 * `leave-notification-deliver` job for a notification whose claim lease has
 * demonstrably expired — the exact same job type/handler every other path
 * already uses. A follow-up ADR entry recording this decision is
 * recommended (see the F-03 remediation report) but is a governance action
 * outside this remediation's own scope to perform unilaterally.
 *
 * Idempotent and race-safe by construction, not by extra bookkeeping:
 * finding a stale claim here changes nothing by itself; the re-enqueued
 * job's own `claimAttempt` call is what actually reclaims it, and that call
 * is the same atomic conditional UPDATE every other caller uses. Two
 * overlapping reaper runs (or a reaper run racing an ordinary
 * worker/redelivery) that both find the same stale row will both attempt to
 * re-enqueue, but at most one of the resulting attempts will ever
 * successfully claim it — the rest cleanly no-op, exactly as a duplicate
 * pg-boss redelivery already does today.
 */
export async function processReapJob(
  repo: NotificationRepository,
  scheduler: JobScheduler,
): Promise<void> {
  const leaseCutoff = new Date(Date.now() - NOTIFICATION_CLAIM_LEASE_MS);
  const stale = await repo.findStaleClaims(leaseCutoff, NOTIFICATION_REAP_BATCH_SIZE);

  for (const attempt of stale) {
    logger.info(
      { notificationId: attempt.id, leaveRequestId: attempt.leaveRequestId, stage: attempt.stage },
      "notification reaper: reclaiming a stale delivery attempt",
    );
    await scheduler.enqueueNotificationJob(
      { leaveRequestId: attempt.leaveRequestId, stage: attempt.stage, notificationId: attempt.id },
      // A fresh key per reclaim (never a fixed one) — this specific
      // notification may also have a still-pending ordinary retry job
      // scheduled under its own `notification:{id}:attempt:{n}` key; this
      // reap-triggered job must never collide with (and silently get
      // dropped by) that unrelated key.
      { startAfterMs: 0, singletonKey: `notification:${attempt.id}:reap:${Date.now()}` },
    );
  }

  if (stale.length > 0) {
    logger.info({ count: stale.length }, "notification reaper: run complete");
  }
}

/**
 * Registers the reaper's job handler AND its recurring schedule, via
 * pg-boss's own native cron support (`boss.schedule`) — no hand-rolled
 * self-rescheduling, no new timer/interval mechanism. Every minute
 * (deliberately close to `NOTIFICATION_CLAIM_LEASE_MS`'s own 45s default,
 * so a stale claim is typically reclaimed within roughly one lease duration
 * of going stale, consistent with the existing 30s/60s/120s retry policy's
 * own cadence — see config/escalation.ts).
 */
export async function registerNotificationReaperWorker(
  repository: NotificationRepository,
  scheduler: JobScheduler = new PgBossJobScheduler(),
): Promise<string> {
  const workerId = await boss.work(NOTIFICATION_REAP_QUEUE, async () => {
    await processReapJob(repository, scheduler);
  });
  await boss.schedule(NOTIFICATION_REAP_QUEUE, "* * * * *");
  return workerId;
}
