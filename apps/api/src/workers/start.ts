import { boss, startQueue } from "../lib/queue/boss.js";
import { ESCALATION_QUEUE, NOTIFICATION_QUEUE } from "../lib/queue/jobs.js";
import { DrizzleLeaveRepository } from "../domain/leave/repository.js";
import { DrizzleNotificationRepository } from "../domain/notification/repository.js";
import { ExpoPushSender } from "../lib/push/expoPush.js";
import { registerEscalationWorker } from "./escalationWorker.js";
import { registerNotificationWorker } from "./notificationWorker.js";

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
  await registerEscalationWorker(new DrizzleLeaveRepository());
  await registerNotificationWorker(new DrizzleNotificationRepository(), new ExpoPushSender());
}
