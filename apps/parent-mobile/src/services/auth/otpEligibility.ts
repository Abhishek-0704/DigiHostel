import {
  requestOtp as requestOtpEligibility,
  verifyOtp as verifyOtpChallenge,
  type ParentRelationshipType,
} from "@digihostel/api-client-react";

/**
 * F-02 remediation (PRR Phase 13) — the mobile side of the backend-brokered
 * OTP flow (ADR-020's required eligibility pre-check). This app never calls
 * Supabase's `signInWithOtp`/`verifyOtp` directly and never holds or submits
 * a phone number anywhere in login; it submits a roll number + relationship
 * and receives an opaque challenge id, then submits that id + the entered
 * code and receives real Supabase session tokens (adopted locally via
 * `authService.adoptSession`). Same "plain service object wrapping the
 * generated client" pattern as `services/approvals/approvals.ts`.
 */
export interface OtpEligibilityService {
  requestOtp(
    rollNumber: string,
    relationshipType: ParentRelationshipType,
  ): Promise<{ challengeId: string }>;
  verifyOtp(
    challengeId: string,
    code: string,
  ): Promise<{ accessToken: string; refreshToken: string }>;
}

export class RealOtpEligibilityService implements OtpEligibilityService {
  async requestOtp(rollNumber: string, relationshipType: ParentRelationshipType) {
    return requestOtpEligibility({ rollNumber, relationshipType });
  }

  async verifyOtp(challengeId: string, code: string) {
    return verifyOtpChallenge({ challengeId, code });
  }
}

export const otpEligibilityService: OtpEligibilityService = new RealOtpEligibilityService();

export type { ParentRelationshipType };
