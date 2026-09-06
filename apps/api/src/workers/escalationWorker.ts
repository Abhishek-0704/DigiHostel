import { boss } from "../lib/queue/boss.js";
import { ESCALATION_QUEUE, type EscalationJobPayload } from "../lib/queue/jobs.js";
import type { LeaveRepository } from "../domain/leave/repository.js";
import { workerLogger as logger } from "../lib/logger.js";

/**
 * `leave-escalation-stage-evaluate` (ADR-017's Job Design, corrected by
 * ADR-019 §4). Thin: all state-mutation, race-resolution, and follow-up
 * scheduling logic lives in LeaveRepository.advanceEscalation — this worker
 * only unpacks the payload and logs the outcome. A stale/superseded job
 * (advanceEscalation returns "noop") is exactly as valid an outcome as an
 * actual advance — never an error, never retried.
 */
/** Exported for unit testing (fakes only). registerEscalationWorker is the
 * production entry point. */
export async function processEscalationJob(
  payload: EscalationJobPayload,
  repository: LeaveRepository,
): Promise<void> {
  const outcome = await repository.advanceEscalation(payload.leaveRequestId, payload.expectedStage);
  if (outcome.kind === "noop") {
    logger.info(
      { leaveRequestId: payload.leaveRequestId, expectedStage: payload.expectedStage },
      "escalation: stale/superseded job, no-op",
    );
  } else {
    logger.info(
      {
        leaveRequestId: payload.leaveRequestId,
        expectedStage: payload.expectedStage,
        nextStage: outcome.nextStage,
      },
      "escalation: advanced",
    );
  }
}

export function registerEscalationWorker(repository: LeaveRepository): Promise<string> {
  return boss.work<EscalationJobPayload>(ESCALATION_QUEUE, async (jobs) => {
    for (const job of jobs) {
      try {
        await processEscalationJob(job.data, repository);
      } catch (err) {
        // F-07: previously uncaught here — pg-boss records the failure in
        // its own job table either way, but this call site produced no
        // structured log line at all when a job threw, matching the
        // try/catch shape notificationWorker.ts already uses. IDs only,
        // never a full payload dump (there's nothing else on this payload).
        logger.error(
          { err, jobId: job.id, leaveRequestId: job.data.leaveRequestId },
          "escalation worker: unexpected error",
        );
        throw err; // let pg-boss's own retry/backoff handle it
      }
    }
  });
}
