/**
 * F-02 remediation (PRR Phase 13) — OTP eligibility domain types.
 *
 * ADR-020 requires "a roll-number-to-parent-record pre-check... before an
 * OTP is triggered, so SMS is only ever sent to an already-registered
 * parent's phone number." This is that pre-check's own domain layer — kept
 * separate from `domain/leave/` and `domain/notification/` since it is a
 * genuinely distinct concern (pre-authentication eligibility, not
 * leave-workflow or push-delivery business logic).
 */

/** Mirrors packages/db/src/schema/enums.ts's `parent_relationship_type`
 * enum exactly — not re-exported from there because no other backend
 * domain module needs the DB-level enum type itself, only this literal
 * union (same convention `domain/notification/repository.ts`'s
 * `stageRecipientRelationshipTypes` already uses). */
export type ParentRelationshipType = "father" | "mother" | "guardian";

export const PARENT_RELATIONSHIP_TYPES: readonly ParentRelationshipType[] = [
  "father",
  "mother",
  "guardian",
];

/**
 * Opaque, server-issued reference binding one eligibility-approved OTP
 * attempt to the specific authoritative phone number it was issued for —
 * the client never sees, holds, or supplies that phone number itself (F-02
 * requirement). A weak client-generated identifier is deliberately not
 * used; see `otpChallengeStore.ts`.
 */
export interface OtpChallenge {
  id: string;
  /** Null specifically means "this challenge was issued for an ineligible
   * request" (see `AuthOtpService.requestOtp`) — it still gets a real
   * challenge id, for constant response-shape/timing, but can never
   * succeed at verification. */
  phoneNumber: string | null;
  createdAt: number;
  /** Bounds local OTP-guessing against one challenge — a small,
   * self-contained defense-in-depth measure, independent of and in addition
   * to whatever attempt/rate limits Supabase's own OTP verification already
   * applies server-side. */
  verifyAttempts: number;
}

export interface OtpVerificationResult {
  accessToken: string;
  refreshToken: string;
}
