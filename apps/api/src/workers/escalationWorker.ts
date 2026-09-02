import { boss } from "../lib/queue/boss.js";
import { ESCALATION_QUEUE, type EscalationJobPayload } from "../lib/queue/jobs.js";
import type { LeaveRepository } from "../domain/leave/repository.js";
import { logger } from "../lib/logger.js";

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
      await processEscalationJob(job.data, repository);
    }
  });
}
