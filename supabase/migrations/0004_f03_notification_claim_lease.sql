-- PRR Phase 13, Finding F-03 remediation (notification crash/retry
-- recovery). `claimed_at` replaces `retry_count` as the sole authority for
-- "is this delivery attempt currently, genuinely in flight" — the previous
-- design used an exact-match on the job payload's own copy of
-- `retry_count` (`expectedRetryCount`) to gate claims, which went stale the
-- instant a crash/redelivery/reap changed the row's real `retry_count`
-- first, permanently orphaning the attempt (see
-- apps/api/src/domain/notification/repository.ts's `claimAttempt` doc
-- comment for the full mechanics). `claimed_at` is set fresh on every
-- successful claim; a claim whose `claimed_at` has aged past
-- NOTIFICATION_CLAIM_LEASE_MS (config/escalation.ts) is presumed abandoned
-- (its claimant crashed) and becomes reclaimable again. The partial index
-- below is what keeps the reaper's periodic "find stale claims" query
-- (repository.ts's `findStaleClaims`) bounded and indexed rather than a
-- full-table scan — mirrors this schema's existing
-- trusted_devices_active_idx convention for a similarly-shaped
-- one-status-matters partial index.
ALTER TABLE "notifications" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "notifications_stale_claim_idx" ON "notifications" USING btree ("claimed_at") WHERE "notifications"."status" = 'queued';