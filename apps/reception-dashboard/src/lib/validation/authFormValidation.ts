/**
 * Pure, framework-free validation for the login/MFA forms (Prompt 2 §11),
 * kept separate from the components so it's unit-testable without React —
 * mirrors this app's existing convention (`authStatus.ts`,
 * `authorizationState.ts`, `sessionTimeout/inactivityStatus.ts`).
 *
 * Deliberately minimal: this never enforces or reveals the backend's actual
 * password policy (§11 — "without revealing authentication policy
 * unnecessarily") and never trims/mutates a password (§11 — a password's
 * whitespace is part of the credential the user intends). Email IS trimmed
 * before both validation and submission — leading/trailing whitespace from a
 * pasted address is never a meaningful part of an email address, and
 * `authService.signIn` receives the already-trimmed value.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CredentialsFieldErrors {
  email?: string;
  password?: string;
}

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}

export function validateCredentials(email: string, password: string): CredentialsFieldErrors {
  const errors: CredentialsFieldErrors = {};
  const trimmedEmail = email.trim();

  if (!trimmedEmail) {
    errors.email = "Enter your email address.";
  } else if (!isValidEmail(trimmedEmail)) {
    errors.email = "Enter a valid email address.";
  }

  if (!password) {
    errors.password = "Enter your password.";
  }

  return errors;
}

/** Supabase's native TOTP factors always produce 6-digit codes (the
 * `otplib`/RFC 6238 default it uses internally) — validated client-side only
 * to give immediate feedback and avoid a wasted network round-trip for an
 * obviously-incomplete code; the actual code is always verified server-side
 * by Supabase Auth, never here. */
export function isValidTotpCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}

/** Strips anything that isn't a digit and caps length at 6 — lets a user
 * paste a code with surrounding whitespace/formatting without it being
 * rejected outright. */
export function sanitizeTotpInput(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 6);
}
