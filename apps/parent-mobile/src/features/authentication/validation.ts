import { ParentRelationshipType } from "@digihostel/api-client-react";

/**
 * Login/OTP presentation-layer validation. Pure, no React Native import,
 * independently unit-tested.
 *
 * F-02 remediation (PRR Phase 13): login no longer collects a phone number
 * at all — the client submits a roll number + relationship, and the backend
 * resolves the authoritative phone server-side (never returned to this
 * app). `isValidRollNumber` is deliberately format-only (matches the
 * backend's own anti-enumeration design): it never determines whether a
 * roll number belongs to a real, registered student — that is not something
 * the client can or should decide.
 */

export const OTP_LENGTH = 6;

export const RELATIONSHIP_OPTIONS: ReadonlyArray<{
  value: ParentRelationshipType;
  label: string;
}> = [
  { value: ParentRelationshipType.father, label: "Father" },
  { value: ParentRelationshipType.mother, label: "Mother" },
  { value: ParentRelationshipType.guardian, label: "Guardian" },
];

export function isValidRollNumber(value: string): boolean {
  return value.trim().length > 0;
}

/** Strips non-digit characters and caps at `OTP_LENGTH` — the same
 * filtering OTPInput applies internally; exposed here so screen-level code
 * (and tests) can reason about "is this a submittable code" without
 * duplicating the regex. */
export function sanitizeOtpInput(raw: string): string {
  return raw.replace(/[^0-9]/g, "").slice(0, OTP_LENGTH);
}

export function isCompleteOtp(code: string): boolean {
  return code.length === OTP_LENGTH && /^\d+$/.test(code);
}
