import type { EligibilityRepository } from "./eligibilityRepository.js";
import type { OtpChallengeStore } from "./otpChallengeStore.js";
import type { OtpSender } from "./otpSender.js";
import type { OtpVerificationResult, ParentRelationshipType } from "./types.js";
import { logger } from "../../lib/logger.js";

/**
 * F-02 remediation (PRR Phase 13) — orchestrates the ADR-020-required
 * eligibility gate in front of Supabase's native phone-OTP flow. Route
 * handlers (routes/auth.ts) stay thin and call only this, mirroring every
 * other domain service in this backend (LeaveService, the notification
 * pipeline).
 */
export class AuthOtpService {
  constructor(
    private readonly eligibilityRepository: EligibilityRepository,
    private readonly challengeStore: OtpChallengeStore,
    private readonly otpSender: OtpSender,
  ) {}

  /**
   * Always returns a challenge id, in the same shape, regardless of whether
   * the supplied roll number/relationship actually resolved to a real,
   * linked parent — this is the anti-enumeration requirement (§7): an
   * unauthenticated caller must not be able to distinguish "eligible, OTP
   * sent" from "ineligible, nothing sent" by response shape, status code,
   * or (to the extent practical) timing. The real SMS dispatch is skipped
   * entirely for an ineligible request — no cost, no attempt against a
   * number this backend has no authoritative link to.
   */
  async requestOtp(
    rollNumber: string,
    relationshipType: ParentRelationshipType,
  ): Promise<{ challengeId: string }> {
    const phoneNumber = await this.eligibilityRepository.findEligiblePhone(
      rollNumber,
      relationshipType,
    );

    if (phoneNumber) {
      try {
        await this.otpSender.send(phoneNumber);
      } catch (err) {
        // A provider-side failure (invalid number format, provider outage)
        // must not reveal anything to the caller beyond the same generic
        // response every other outcome gets — logged server-side only.
        logger.warn({ err }, "auth: otp dispatch failed for an eligible request");
      }
      return { challengeId: this.challengeStore.create(phoneNumber) };
    }

    logger.info(
      { rollNumber, relationshipType },
      "auth: otp requested for an ineligible roll number/relationship — no dispatch attempted",
    );
    return { challengeId: this.challengeStore.create(null) };
  }

  /**
   * Returns the real Supabase session tokens on success, or `null` for any
   * failure — unknown/expired/exhausted/ineligible challenge, or a genuine
   * wrong/expired OTP code. The route maps `null` to one generic, safe
   * error response; nothing here ever indicates which of those cases
   * occurred.
   */
  async verifyOtp(challengeId: string, code: string): Promise<OtpVerificationResult | null> {
    const phoneNumber = this.challengeStore.consume(challengeId);
    if (!phoneNumber) {
      return null;
    }

    const result = await this.otpSender.verify(phoneNumber, code);
    if (!result) {
      return null;
    }

    // Single-use: a challenge cannot be replayed to mint a second session
    // once it has actually succeeded once.
    this.challengeStore.invalidate(challengeId);
    return result;
  }
}
