import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull, db, deviceRegistrationChallenges } from "@digihostel/db";
import { DEVICE_CHALLENGE_TTL_MS } from "../../config/deviceAttestation.js";
import type { DevicePlatform, RegistrationChallenge } from "./types.js";

/**
 * ADR-003 implementation — server-controlled challenge/nonce issuance and
 * single-use redemption, per the implementation task's §6 requirement that
 * the client must never be the authority for the challenge.
 *
 * Backed by `device_registration_challenges` (packages/db/src/schema/device.ts),
 * a table with zero RLS grants for any client role — only this repository's
 * own privileged `db` connection (Fastify's service-role-equivalent, exactly
 * like every other domain repository in this backend) ever reads or writes
 * it. Nonces are never returned to any caller other than the one who just
 * created them.
 */
export interface ChallengeRepository {
  create(parentId: string, platform: DevicePlatform): Promise<RegistrationChallenge>;
  /** Atomically finds an unexpired, unconsumed challenge belonging to
   * `parentId` and marks it consumed in the same statement — the
   * single-use/no-replay guarantee lives here, not in application-level
   * check-then-act logic (which would race under concurrent requests). */
  consume(challengeId: string, parentId: string): Promise<RegistrationChallenge | null>;
}

/** 32 bytes of CSPRNG output, base64url-encoded — large enough that guessing
 * or brute-forcing a valid nonce is infeasible within the challenge's TTL. */
function generateNonce(): string {
  return randomBytes(32).toString("base64url");
}

export class DrizzleChallengeRepository implements ChallengeRepository {
  async create(parentId: string, platform: DevicePlatform): Promise<RegistrationChallenge> {
    const nonce = generateNonce();
    const expiresAt = new Date(Date.now() + DEVICE_CHALLENGE_TTL_MS);

    const [row] = await db
      .insert(deviceRegistrationChallenges)
      .values({ parentId, platform, nonce, expiresAt })
      .returning();

    return {
      id: row.id,
      parentId: row.parentId,
      platform: row.platform as DevicePlatform,
      nonce: row.nonce,
      expiresAt: row.expiresAt,
    };
  }

  async consume(challengeId: string, parentId: string): Promise<RegistrationChallenge | null> {
    // Single UPDATE ... WHERE ... RETURNING, conditioned on every requirement
    // at once (belongs to this caller, not already consumed, not expired) —
    // an atomic compare-and-set. Two concurrent redemption attempts against
    // the same challenge can both run this statement, but only one can ever
    // match a still-unconsumed row; the second necessarily finds zero rows.
    const [row] = await db
      .update(deviceRegistrationChallenges)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(deviceRegistrationChallenges.id, challengeId),
          eq(deviceRegistrationChallenges.parentId, parentId),
          isNull(deviceRegistrationChallenges.consumedAt),
          gt(deviceRegistrationChallenges.expiresAt, new Date()),
        ),
      )
      .returning();

    if (!row) return null;
    return {
      id: row.id,
      parentId: row.parentId,
      platform: row.platform as DevicePlatform,
      nonce: row.nonce,
      expiresAt: row.expiresAt,
    };
  }
}
