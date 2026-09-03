/**
 * Generic phone-number helpers (Prompt 3). No country/business-specific
 * rules are encoded here — the SDD does not specify a phone-number format,
 * so this stays a general E.164-shaped check rather than inventing a rule.
 * Prompt 4's actual Login screen owns any stricter, UX-facing validation.
 */

/** E.164: optional leading '+', 8-15 digits total, first digit 1-9. */
const E164_PATTERN = /^\+?[1-9]\d{7,14}$/;

export function isValidPhoneNumber(value: string): boolean {
  return E164_PATTERN.test(value.trim());
}

/** Never log a full phone number (this app's logging policy — see
 * src/services/logger/logger.ts's doc comment). Keeps only the last 2
 * digits, useful for a developer to distinguish two test accounts in a
 * debug session without reconstructing a real number from logs. */
export function maskPhoneNumber(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 2) return "*".repeat(trimmed.length);
  return "*".repeat(trimmed.length - 2) + trimmed.slice(-2);
}
