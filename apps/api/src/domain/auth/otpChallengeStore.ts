import { randomUUID } from "node:crypto";
import type { OtpChallenge } from "./types.js";

/**
 * F-02 remediation — the "server-issued transaction/reference" binding one
 * OTP-request attempt to the specific authoritative phone number resolved
 * for it, so the client never needs to (and never can) supply a phone
 * number at verification time either. A `randomUUID()` — cryptographically
 * random, not a weak client-generated or sequential identifier — is the
 * only value the client ever sees for this attempt.
 *
 * In-memory, single-process (matching this backend's existing colocated
 * Fastify+pg-boss single-process deployment model — no CI/CD or
 * multi-instance deployment exists yet, see docs/current-state.md). A
 * process restart mid-login simply invalidates any in-flight challenge,
 * requiring the user to restart the (cheap, few-second) login flow — a
 * disclosed, accepted trade-off, not a correctness gap: it never leaves a
 * phone number or session reachable after a restart, it only ever makes an
 * in-flight one unreachable. A durable (DB-backed) store was deliberately
 * not introduced for this — no new migration is needed for a value that
 * only needs to survive a few minutes and is properly invalidated by design
 * the moment it's consumed or expires; this mirrors ADR-011/ADR-017 §8's
 * own stated preference for the simplest sufficient mechanism.
 */
const CHALLENGE_TTL_MS = 5 * 60_000; // 5 minutes — comfortably covers real SMS delivery + entry time.
const MAX_VERIFY_ATTEMPTS = 5;

export interface OtpChallengeStore {
  /** Creates a new challenge and returns its opaque id. `phoneNumber` is
   * `null` for an ineligible request (see `AuthOtpService.requestOtp`) —
   * still produces a real, indistinguishable challenge id, but one that can
   * never succeed at verification. */
  create(phoneNumber: string | null): string;
  /**
   * Returns the challenge's phone number if `challengeId` is a real,
   * unexpired, not-yet-exhausted, *eligible* (non-null-phone) challenge —
   * incrementing its attempt counter as a side effect (every call counts as
   * an attempt, matching how a real OTP-verify call is itself the "attempt"
   * being bounded). Returns `null` for an unknown, expired,
   * attempts-exhausted, or ineligible-at-issuance id — deliberately the
   * same `null` for all four, for the same anti-enumeration reason
   * `EligibilityRepository.findEligiblePhone` collapses its own negative
   * cases.
   */
  consume(challengeId: string): string | null;
  /** Permanently invalidates a challenge — called once verification
   * actually succeeds, so the same challenge (and the OTP code it was
   * issued for) can never be replayed. */
  invalidate(challengeId: string): void;
}

export class InMemoryOtpChallengeStore implements OtpChallengeStore {
  private readonly challenges = new Map<string, OtpChallenge>();

  create(phoneNumber: string | null): string {
    this.sweepExpired();
    const id = randomUUID();
    this.challenges.set(id, { id, phoneNumber, createdAt: Date.now(), verifyAttempts: 0 });
    return id;
  }

  consume(challengeId: string): string | null {
    const challenge = this.challenges.get(challengeId);
    if (!challenge) return null;
    if (Date.now() - challenge.createdAt > CHALLENGE_TTL_MS) {
      this.challenges.delete(challengeId);
      return null;
    }
    if (challenge.verifyAttempts >= MAX_VERIFY_ATTEMPTS) {
      this.challenges.delete(challengeId);
      return null;
    }
    challenge.verifyAttempts += 1;
    return challenge.phoneNumber;
  }

  invalidate(challengeId: string): void {
    this.challenges.delete(challengeId);
  }

  /** Opportunistic cleanup on create — this store never accumulates
   * unboundedly beyond however many logins are genuinely in flight at once
   * plus whatever expired entries haven't yet been swept. */
  private sweepExpired(): void {
    const now = Date.now();
    for (const [id, challenge] of this.challenges) {
      if (now - challenge.createdAt > CHALLENGE_TTL_MS) {
        this.challenges.delete(id);
      }
    }
  }
}
