import { randomUUID } from "node:crypto";
import type { ChallengeRepository } from "../challengeRepository.js";
import type { DevicePlatform, RegistrationChallenge } from "../types.js";

/** In-memory fake for DeviceRegistrationService unit tests — mirrors
 * DrizzleChallengeRepository's single-use/expiry semantics exactly, without a
 * real database (see domain/auth/__fixtures__/fake-eligibility-repository.ts
 * for this codebase's established fake-repository convention). */
export class FakeChallengeRepository implements ChallengeRepository {
  private readonly rows = new Map<string, RegistrationChallenge & { consumedAt: Date | null }>();
  private nonceCounter = 0;

  async create(parentId: string, platform: DevicePlatform): Promise<RegistrationChallenge> {
    const id = randomUUID();
    this.nonceCounter += 1;
    const challenge: RegistrationChallenge & { consumedAt: Date | null } = {
      id,
      parentId,
      platform,
      nonce: `fake-nonce-${this.nonceCounter}`,
      expiresAt: new Date(Date.now() + 5 * 60_000),
      consumedAt: null,
    };
    this.rows.set(id, challenge);
    return challenge;
  }

  async consume(challengeId: string, parentId: string): Promise<RegistrationChallenge | null> {
    const row = this.rows.get(challengeId);
    if (!row) return null;
    if (row.parentId !== parentId) return null;
    if (row.consumedAt) return null;
    if (row.expiresAt.getTime() <= Date.now()) return null;

    row.consumedAt = new Date();
    return {
      id: row.id,
      parentId: row.parentId,
      platform: row.platform,
      nonce: row.nonce,
      expiresAt: row.expiresAt,
    };
  }

  /** Test helper — forces a challenge into the past so expiry can be
   * exercised deterministically. */
  expire(challengeId: string): void {
    const row = this.rows.get(challengeId);
    if (row) row.expiresAt = new Date(Date.now() - 1000);
  }
}
