import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, db, parents, deviceRegistrationChallenges } from "@digihostel/db";
import { DrizzleChallengeRepository } from "./challengeRepository.js";

/**
 * Real-Postgres integration test — proves the challenge repository's actual
 * single-use/expiry SQL against a real schema and a real unique constraint
 * set, not just FakeChallengeRepository's in-memory Map (service.test.ts).
 * Same convention as domain/auth/eligibilityRepository.integration.test.ts:
 * skipped automatically when DATABASE_URL isn't set, fixed synthetic UUIDs,
 * cleans up everything it inserts.
 */
const RUN = Boolean(process.env.DATABASE_URL);

describe.skipIf(!RUN)("DrizzleChallengeRepository (real Postgres integration)", () => {
  const PARENT_ID = "f0300000-0000-0000-0000-000000000001";
  const OTHER_PARENT_ID = "f0300000-0000-0000-0000-000000000002";

  const repository = new DrizzleChallengeRepository();

  beforeAll(async () => {
    await db.insert(parents).values([
      { id: PARENT_ID, fullName: "ADR-003 Integration Parent", phoneNumber: "+91-9000000101" },
      {
        id: OTHER_PARENT_ID,
        fullName: "ADR-003 Integration Other Parent",
        phoneNumber: "+91-9000000102",
      },
    ]);
  });

  afterAll(async () => {
    await db
      .delete(deviceRegistrationChallenges)
      .where(eq(deviceRegistrationChallenges.parentId, PARENT_ID));
    await db
      .delete(deviceRegistrationChallenges)
      .where(eq(deviceRegistrationChallenges.parentId, OTHER_PARENT_ID));
    await db.delete(parents).where(eq(parents.id, PARENT_ID));
    await db.delete(parents).where(eq(parents.id, OTHER_PARENT_ID));
  });

  it("creates a challenge with a real, unexpired, unconsumed row", async () => {
    const challenge = await repository.create(PARENT_ID, "android");

    expect(challenge.parentId).toBe(PARENT_ID);
    expect(challenge.nonce.length).toBeGreaterThan(20);
    expect(challenge.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("consume() succeeds exactly once for a real, valid challenge — the second call sees it already consumed", async () => {
    const challenge = await repository.create(PARENT_ID, "android");

    const first = await repository.consume(challenge.id, PARENT_ID);
    const second = await repository.consume(challenge.id, PARENT_ID);

    expect(first?.id).toBe(challenge.id);
    expect(second).toBeNull();
  });

  it("consume() fails for the wrong parent — cross-user redemption is impossible even against a real row", async () => {
    const challenge = await repository.create(PARENT_ID, "android");

    const result = await repository.consume(challenge.id, OTHER_PARENT_ID);

    expect(result).toBeNull();
    // Confirm it wasn't silently consumed by the failed cross-user attempt —
    // the rightful owner can still redeem it.
    const rightfulAttempt = await repository.consume(challenge.id, PARENT_ID);
    expect(rightfulAttempt?.id).toBe(challenge.id);
  });

  it("consume() fails for an expired challenge, even though it was never redeemed", async () => {
    const challenge = await repository.create(PARENT_ID, "android");
    await db
      .update(deviceRegistrationChallenges)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(deviceRegistrationChallenges.id, challenge.id));

    const result = await repository.consume(challenge.id, PARENT_ID);

    expect(result).toBeNull();
  });

  it("concurrent redemption attempts against the same real row: exactly one succeeds", async () => {
    const challenge = await repository.create(PARENT_ID, "android");

    const [a, b] = await Promise.all([
      repository.consume(challenge.id, PARENT_ID),
      repository.consume(challenge.id, PARENT_ID),
    ]);

    const successes = [a, b].filter((r) => r !== null);
    expect(successes.length).toBe(1);
  });
});
