import { isValidPhoneNumber } from "../../utils/phone";

/**
 * Login/OTP presentation-layer validation (Prompt 4A) — pure, no React
 * Native import, independently unit-tested. Reuses Prompt 3's existing
 * `isValidPhoneNumber` (src/utils/phone.ts) rather than inventing a second
 * phone-format algorithm; this module only adds the UI-specific composition
 * (fixed country code + local-number-length check) around it.
 *
 * Never determines whether a number belongs to a real/registered parent —
 * that is not something the client can or should decide (see
 * docs/authentication.md's security-boundary note). This is format
 * validation only.
 */

export const COUNTRY_CODE = "+91";
export const LOCAL_NUMBER_LENGTH = 10;
export const OTP_LENGTH = 6;

export type PhoneValidationResult =
  { valid: true; fullNumber: string } | { valid: false; message: string };

export function validateLocalPhoneNumber(localNumber: string): PhoneValidationResult {
  if (localNumber.length !== LOCAL_NUMBER_LENGTH) {
    return { valid: false, message: `Enter your ${LOCAL_NUMBER_LENGTH}-digit mobile number.` };
  }
  const fullNumber = `${COUNTRY_CODE}${localNumber}`;
  if (!isValidPhoneNumber(fullNumber)) {
    return { valid: false, message: "Please enter a valid mobile number." };
  }
  return { valid: true, fullNumber };
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
