import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray, db, hostels, students, leaveRequests, notifications } from "@digihostel/db";
import { DrizzleNotificationRepository } from "./repository.js";
import type { DecidableStatus } from "../leave/types.js";

/**
 * Real-Postgres integration test for the F-03 remediation (PRR Phase 13 —
 * notification crash/retry recovery). Mirrors
 * `domain/leave/repository.integration.test.ts`'s own conventions exactly:
 * skipped automatically when `DATABASE_URL` isn't set, fixed
 * obviously-synthetic UUIDs, full cleanup in `afterAll`, never touches
 * `supabase/seed.sql`'s own fixtures.
 *
 * These tests specifically target what only a real database can prove:
 * atomic claim/reclaim under the new lease-based design, genuine concurrent
 * claims, and the partial-index-backed stale-claim query — not the
 * business-logic branching already covered by
 * `workers/notificationWorker.test.ts`'s fake-repository tests.
 *
 * A real worker-process crash cannot be safely reproduced inside this test
 * framework. Every "crash" scenario below is instead a deterministic
 * database-state fixture that reconstructs exactly what a real crash would
 * leave behind (a claim with a stale/old `claimed_at` and no recorded
 * outcome) — the strongest reproducible proxy available, and explicitly
 * disclosed as such rather than claimed to be a live process-crash test.
 */
const RUN = Boolean(process.env.DATABASE_URL);

describe.skipIf(!RUN)("NotificationRepository (real Postgres integration) — F-03", () => {
  const HOSTEL_ID = "f3000000-0000-0000-0000-000000000001";
  const STUDENT_ID = "f3000000-0000-0000-0000-000000000002";
  const RECIPIENT_ID = "f3000000-0000-0000-0000-000000000003";

  const repository = new DrizzleNotificationRepository();

  async function freshLeaveRequestId(): Promise<string> {
    const [row] = await db
      .insert(leaveRequests)
      .values({
        studentId: STUDENT_ID,
        reason: "f-03 integration test",
        startDate: "2026-10-01",
        endDate: "2026-10-03",
        status: "father_notified",
      })
      .returning({ id: leaveRequests.id });
    return row.id;
  }

  async function freshNotification(
    leaveRequestId: string,
    recipientId: string = RECIPIENT_ID,
    stage: DecidableStatus = "father_notified",
  ) {
    return repository.upsertLogicalNotification(leaveRequestId, stage, recipientId);
  }

  /** Deterministically recreates "a worker claimed this attempt and then
   * crashed before recording anything" — backdates `claimed_at` well past
   * any real `NOTIFICATION_CLAIM_LEASE_MS` value. */
  async function backdateClaim(notificationId: string, minutesAgo = 10): Promise<void> {
    await db
      .update(notifications)
      .set({ claimedAt: new Date(Date.now() - minutesAgo * 60_000) })
      .where(eq(notifications.id, notificationId));
  }

  beforeAll(async () => {
    await db.insert(hostels).values({ id: HOSTEL_ID, name: "F-03 Integration Test Hostel" });
    await db.insert(students).values({
      id: STUDENT_ID,
      rollNumber: "F03-TEST-001",
      fullName: "F-03 Integration Test Student",
      hostelId: HOSTEL_ID,
    });
  });

  afterAll(async () => {
    const ownLeaveRequestIds = (
      await db
        .select({ id: leaveRequests.id })
        .from(leaveRequests)
        .where(eq(leaveRequests.studentId, STUDENT_ID))
    ).map((r) => r.id);
    if (ownLeaveRequestIds.length > 0) {
      await db
        .delete(notifications)
        .where(inArray(notifications.relatedLeaveRequestId, ownLeaveRequestIds));
    }
    await db.delete(leaveRequests).where(eq(leaveRequests.studentId, STUDENT_ID));
    await db.delete(students).where(eq(students.id, STUDENT_ID));
    await db.delete(hostels).where(eq(hostels.id, HOSTEL_ID));
  });

  it("claimAttempt succeeds on a fresh, never-claimed queued row", async () => {
    const leaveRequestId = await freshLeaveRequestId();
    const row = await freshNotification(leaveRequestId);

    const claimed = await repository.claimAttempt(row.id);

    expect(claimed).not.toBeNull();
    expect(claimed?.retryCount).toBe(1);
  });

  it("a second claim attempt on the SAME still-fresh (unexpired) lease fails", async () => {
    const leaveRequestId = await freshLeaveRequestId();
    const row = await freshNotification(leaveRequestId);

    const first = await repository.claimAttempt(row.id);
    const second = await repository.claimAttempt(row.id);

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it("concurrency: two simultaneous claim attempts on the same fresh row — exactly one succeeds", async () => {
    const leaveRequestId = await freshLeaveRequestId();
    const row = await freshNotification(leaveRequestId);

    const [a, b] = await Promise.all([
      repository.claimAttempt(row.id),
      repository.claimAttempt(row.id),
    ]);

    const winners = [a, b].filter((r) => r !== null);
    expect(winners).toHaveLength(1);
    // The row itself reflects exactly one increment, never two — no
    // corruption/double-counting under the race.
    const [persisted] = await db
      .select({ retryCount: notifications.retryCount })
      .from(notifications)
      .where(eq(notifications.id, row.id));
    expect(persisted.retryCount).toBe(1);
  });

  it("F-03 (Test 4 — stale-claim recovery): a claim whose lease has expired can be reclaimed", async () => {
    const leaveRequestId = await freshLeaveRequestId();
    const row = await freshNotification(leaveRequestId);

    // The "crashed worker" attempt: claims, then never records an outcome.
    const firstClaim = await repository.claimAttempt(row.id);
    expect(firstClaim).not.toBeNull();
    await backdateClaim(row.id);

    // A redelivered/reaper-triggered job for the SAME notification, with no
    // knowledge of the (now-irrelevant) retryCount the first attempt used —
    // this is exactly the scenario the pre-F-03 `expectedRetryCount`-gated
    // design could never recover from.
    const reclaimed = await repository.claimAttempt(row.id);

    expect(reclaimed).not.toBeNull();
    expect(reclaimed?.retryCount).toBe(2); // bumped again on reclaim
  });

  it("F-03 (Test 8 — recovery race): a reaper-style reclaim and a genuinely-still-active claim cannot both win", async () => {
    const leaveRequestId = await freshLeaveRequestId();
    const row = await freshNotification(leaveRequestId);
    await repository.claimAttempt(row.id); // still within its lease — NOT backdated

    // A reap-style reclaim attempt arriving while the original claim is
    // still genuinely fresh (the reaper would never actually find this row
    // via findStaleClaims in practice — this directly tests the claim
    // primitive's own race-safety independent of that query).
    const reclaimAttempt = await repository.claimAttempt(row.id);

    expect(reclaimAttempt).toBeNull(); // fresh lease correctly protected
    const [persisted] = await db
      .select({ retryCount: notifications.retryCount })
      .from(notifications)
      .where(eq(notifications.id, row.id));
    expect(persisted.retryCount).toBe(1); // only the original claim's increment
  });

  it("F-03 (Test 7 — exhausted/terminal): a 'failed' notification can never be reclaimed, even with an expired lease", async () => {
    const leaveRequestId = await freshLeaveRequestId();
    const row = await freshNotification(leaveRequestId);
    await repository.claimAttempt(row.id);
    await repository.recordOutcome(row.id, "failed");
    await backdateClaim(row.id);

    const reclaimed = await repository.claimAttempt(row.id);

    expect(reclaimed).toBeNull();
  });

  it("a 'sent' (successfully delivered) notification can never be reclaimed, even with an expired lease", async () => {
    const leaveRequestId = await freshLeaveRequestId();
    const row = await freshNotification(leaveRequestId);
    await repository.claimAttempt(row.id);
    await repository.recordOutcome(row.id, "sent");
    await backdateClaim(row.id);

    const reclaimed = await repository.claimAttempt(row.id);

    expect(reclaimed).toBeNull();
  });

  it("findStaleClaims finds a lease-expired claim and excludes a still-fresh one", async () => {
    const leaveRequestId = await freshLeaveRequestId();
    const staleRow = await freshNotification(
      leaveRequestId,
      "f3000000-0000-0000-0000-000000000010",
    );
    const freshRow = await freshNotification(
      leaveRequestId,
      "f3000000-0000-0000-0000-000000000011",
    );
    await repository.claimAttempt(staleRow.id);
    await repository.claimAttempt(freshRow.id);
    await backdateClaim(staleRow.id);

    const found = await repository.findStaleClaims(new Date(Date.now() - 60_000), 50);
    const foundIds = found.map((f) => f.id);

    expect(foundIds).toContain(staleRow.id);
    expect(foundIds).not.toContain(freshRow.id);
  });

  it("findStaleClaims never returns a terminal ('sent' or 'failed') row, even with an old claimed_at", async () => {
    const leaveRequestId = await freshLeaveRequestId();
    const sentRow = await freshNotification(leaveRequestId, "f3000000-0000-0000-0000-000000000012");
    const failedRow = await freshNotification(
      leaveRequestId,
      "f3000000-0000-0000-0000-000000000013",
    );
    await repository.claimAttempt(sentRow.id);
    await repository.recordOutcome(sentRow.id, "sent");
    await backdateClaim(sentRow.id);
    await repository.claimAttempt(failedRow.id);
    await repository.recordOutcome(failedRow.id, "failed");
    await backdateClaim(failedRow.id);

    const found = await repository.findStaleClaims(new Date(Date.now() - 60_000), 50);
    const foundIds = found.map((f) => f.id);

    expect(foundIds).not.toContain(sentRow.id);
    expect(foundIds).not.toContain(failedRow.id);
  });

  it("findStaleClaims never returns a row that was never claimed (claimed_at is null)", async () => {
    const leaveRequestId = await freshLeaveRequestId();
    const neverClaimedRow = await freshNotification(
      leaveRequestId,
      "f3000000-0000-0000-0000-000000000014",
    );

    const found = await repository.findStaleClaims(new Date(Date.now() + 60_000), 50);

    expect(found.map((f) => f.id)).not.toContain(neverClaimedRow.id);
  });

  it("findStaleClaims is bounded — never returns more rows than the requested limit", async () => {
    const leaveRequestId = await freshLeaveRequestId();
    const rowIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const row = await freshNotification(
        leaveRequestId,
        `f3000000-0000-0000-0000-00000000002${i}`,
      );
      await repository.claimAttempt(row.id);
      await backdateClaim(row.id);
      rowIds.push(row.id);
    }

    const found = await repository.findStaleClaims(new Date(Date.now() - 60_000), 3);

    expect(found.length).toBeLessThanOrEqual(3);
    // Sanity: without the limit, all 5 genuinely are stale (proves the
    // limit is actually constraining something real, not vacuously true).
    const unbounded = await repository.findStaleClaims(new Date(Date.now() - 60_000), 50);
    expect(unbounded.filter((f) => rowIds.includes(f.id)).length).toBe(5);
  });

  it("recovery is idempotent: repeatedly finding the same stale claim never corrupts state or double-claims across repeated reaper passes", async () => {
    const leaveRequestId = await freshLeaveRequestId();
    const row = await freshNotification(leaveRequestId, "f3000000-0000-0000-0000-000000000030");
    await repository.claimAttempt(row.id);
    await backdateClaim(row.id);

    // Simulate two "reaper passes" racing to reclaim the same stale row.
    const [reclaimA, reclaimB] = await Promise.all([
      repository.claimAttempt(row.id),
      repository.claimAttempt(row.id),
    ]);
    const winners = [reclaimA, reclaimB].filter((r) => r !== null);
    expect(winners).toHaveLength(1);

    // A third, later pass over the (now freshly-claimed-again) row must not
    // also win — the winner's own new lease protects it.
    const thirdAttempt = await repository.claimAttempt(row.id);
    expect(thirdAttempt).toBeNull();

    const [persisted] = await db
      .select({ retryCount: notifications.retryCount })
      .from(notifications)
      .where(eq(notifications.id, row.id));
    expect(persisted.retryCount).toBe(2); // exactly one reclaim's worth of increment
  });
});
