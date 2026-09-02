import { fromDrizzle } from "pg-boss";
import { sql, db } from "@digihostel/db";
import type { DecidableStatus } from "../../domain/leave/types.js";
import { boss } from "./boss.js";

export const ESCALATION_QUEUE = "leave-escalation-stage-evaluate";
export const NOTIFICATION_QUEUE = "leave-notification-deliver";

export interface EscalationJobPayload {
  leaveRequestId: string;
  expectedStage: DecidableStatus;
}

export interface NotificationJobPayload {
  leaveRequestId: string;
  stage: DecidableStatus;
  /** Present only for a self-scheduled retry (ADR-018 §3) — targets one
   * already-created logical notification at a specific attempt. Absent for
   * the initial stage-triggered job, which resolves recipients fresh and
   * creates/attempts each recipient's own logical notification row. */
  notificationId?: string;
  expectedRetryCount?: number;
}

/** The Drizzle transaction shape `db.transaction()` hands its callback —
 * derived, not hand-typed, so it always matches the real `db` this repo
 * uses (postgres-js driver). */
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Job-scheduling port. `DrizzleLeaveRepository`/`NotificationRepository`
 * depend on this interface, not on `boss` directly, so unit tests can use an
 * in-memory fake instead of a live pg-boss connection (mirrors this
 * codebase's existing BiometricFreshnessGate port pattern).
 */
export interface JobScheduler {
  /** Enqueues within `tx` when supplied (ADR-017 §7 — "same transaction
   * where practical": now practical, via pg-boss's Drizzle adapter). */
  enqueueEscalationJob(
    payload: EscalationJobPayload,
    options: { startAfterMs: number; singletonKey: string; tx?: DbTransaction },
  ): Promise<void>;

  enqueueNotificationJob(
    payload: NotificationJobPayload,
    options: { startAfterMs: number; singletonKey: string; tx?: DbTransaction },
  ): Promise<void>;
}

/** Null-object JobScheduler for tests that exercise real Postgres
 * transaction/race behavior (repository.integration.test.ts) without
 * needing a live pg-boss connection — that subsystem is a separate concern
 * from the leave-decision conditional-update semantics those tests verify. */
export class NoopJobScheduler implements JobScheduler {
  async enqueueEscalationJob(): Promise<void> {}
  async enqueueNotificationJob(): Promise<void> {}
}

export class PgBossJobScheduler implements JobScheduler {
  async enqueueEscalationJob(
    payload: EscalationJobPayload,
    options: { startAfterMs: number; singletonKey: string; tx?: DbTransaction },
  ): Promise<void> {
    await boss.send(ESCALATION_QUEUE, payload, {
      startAfter: Math.ceil(options.startAfterMs / 1000),
      singletonKey: options.singletonKey,
      ...(options.tx ? { db: fromDrizzle(options.tx, sql) } : {}),
    });
  }

  async enqueueNotificationJob(
    payload: NotificationJobPayload,
    options: { startAfterMs: number; singletonKey: string; tx?: DbTransaction },
  ): Promise<void> {
    await boss.send(NOTIFICATION_QUEUE, payload, {
      startAfter: Math.ceil(options.startAfterMs / 1000),
      singletonKey: options.singletonKey,
      ...(options.tx ? { db: fromDrizzle(options.tx, sql) } : {}),
    });
  }
}
