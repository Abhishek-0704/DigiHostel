import { boss, startQueue } from "../lib/queue/boss.js";
import {
  ESCALATION_QUEUE,
  NOTIFICATION_QUEUE,
  NOTIFICATION_REAP_QUEUE,
} from "../lib/queue/jobs.js";
import { DrizzleLeaveRepository } from "../domain/leave/repository.js";
import { DrizzleNotificationRepository } from "../domain/notification/repository.js";
import { ExpoPushSender } from "../lib/push/expoPush.js";
import { registerEscalationWorker } from "./escalationWorker.js";
import { registerNotificationWorker } from "./notificationWorker.js";
import { registerNotificationReaperWorker } from "./notificationReaperWorker.js";
import { workerLogger as logger } from "../lib/logger.js";

/**
 * Starts pg-boss and registers both job handlers (ADR-011/ADR-017/ADR-018).
 * Deliberately separate from buildApp() — the HTTP-serving Fastify app and
 * these background workers are independent concerns sharing one process for
 * operational simplicity (ADR-011), not a hard coupling. Keeping them apart
 * also means every existing test that calls buildApp() with fake overrides
 * (routes/leave.test.ts etc.) needs no live pg-boss/Postgres connection at
 * all — only index.ts's real production entrypoint calls this.
 */
export async function startBackgroundWorkers(): Promise<void> {
  await startQueue();
  await boss.createQueue(ESCALATION_QUEUE);
  await boss.createQueue(NOTIFICATION_QUEUE);
  // F-03 remediation (PRR Phase 13) — bounded, idempotent backstop for a
  // notification delivery attempt whose claim lease expired with no future
  // job left to reclaim it (registerNotificationReaperWorker's own doc
  // comment explains why pg-boss's own native redelivery alone isn't
  // sufficient here). Its own recurring schedule is registered inside
  // registerNotificationReaperWorker via pg-boss's native `schedule()`.
  await boss.createQueue(NOTIFICATION_REAP_QUEUE);

  // F-07: each worker is logged individually with its own queue identity —
  // previously only one blanket "background workers registered" line
  // existed after all three succeeded, so a startup failure partway through
  // (e.g. the second registerX call throws) gave no indication which
  // specific worker never came up before index.ts's outer catch logged a
  // generic "startup: failed, exiting".
  await registerEscalationWorker(new DrizzleLeaveRepository());
  logger.info({ queue: ESCALATION_QUEUE }, "worker registered: escalation");

  await registerNotificationWorker(new DrizzleNotificationRepository(), new ExpoPushSender());
  logger.info({ queue: NOTIFICATION_QUEUE }, "worker registered: notification delivery");

  await registerNotificationReaperWorker(new DrizzleNotificationRepository());
  logger.info({ queue: NOTIFICATION_REAP_QUEUE }, "worker registered: notification reaper");
}
