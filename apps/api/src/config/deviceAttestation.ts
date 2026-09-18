/**
 * ADR-003 implementation — device-registration/attestation configuration.
 * Env-overridable, matching this codebase's existing config/rateLimit.ts and
 * config/escalation.ts convention rather than hard-coding values.
 *
 * GOOGLE_PLAY_INTEGRITY_* are absent in every environment this repository has
 * been run in so far (no Google Play Console registration / Cloud project
 * exists yet for this app — see the ADR-003 implementation report). When
 * unset, `PlayIntegrityVerifier` throws `AttestationProviderNotConfiguredError`
 * rather than silently succeeding or falling back to a weaker check — the
 * same fail-closed convention `security-gates.ts`'s `NotImplementedAttestationGate`
 * already established for the previous, entirely-absent state.
 */

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** How long a registration challenge stays redeemable. Short by design — a
 * legitimate client uses it within seconds of requesting it. */
export const DEVICE_CHALLENGE_TTL_MS = envNumber("DEVICE_CHALLENGE_TTL_MS", 5 * 60_000);

/** The Android application id Play Integrity verdicts must report — must
 * equal `app.json`'s `expo.android.package`. Verified explicitly rather than
 * assumed, so a token issued for a different app can never be replayed here. */
export const ANDROID_PACKAGE_NAME = process.env.ANDROID_PACKAGE_NAME ?? "com.digihostel.parent";

export interface GooglePlayIntegrityConfig {
  /** Numeric Cloud project number linked to the Play Console app listing —
   * required by the classic Play Integrity Standard API request shape. */
  cloudProjectNumber: string;
  /** Service-account credentials (JSON key content, not a file path) used to
   * obtain an OAuth token for the `playintegrity.googleapis.com` API. Never
   * logged; never returned in any API response. */
  serviceAccountKeyJson: string;
}

/** Returns the Play Integrity config, or `null` if it isn't configured in
 * this environment — the caller (attestationVerifier.ts) must fail closed on
 * `null`, never substitute a default. */
export function getGooglePlayIntegrityConfig(): GooglePlayIntegrityConfig | null {
  const cloudProjectNumber = process.env.GOOGLE_PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER;
  const serviceAccountKeyJson = process.env.GOOGLE_PLAY_INTEGRITY_SERVICE_ACCOUNT_KEY;
  if (!cloudProjectNumber || !serviceAccountKeyJson) return null;
  return { cloudProjectNumber, serviceAccountKeyJson };
}
