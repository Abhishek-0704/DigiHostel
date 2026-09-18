import { importPKCS8, SignJWT } from "jose";
import {
  ANDROID_PACKAGE_NAME,
  getGooglePlayIntegrityConfig,
  type GooglePlayIntegrityConfig,
} from "../../config/deviceAttestation.js";
import { logger } from "../../lib/logger.js";
import type { DevicePlatform } from "./types.js";

/**
 * ADR-003 implementation — real, server-side Play Integrity Standard API
 * verification. This is the backend trust boundary the implementation task's
 * §7 requires: the client can never self-declare trust, because the only
 * thing it ever sends here is an opaque, Google-signed integrity token — the
 * actual pass/fail decision is made by decoding and inspecting that token via
 * Google's own `playintegrity.googleapis.com` API, never by trusting
 * anything the client asserted about itself.
 *
 * Requires a Google Play Console app registration (package name uploaded to
 * at least Internal Testing) and a linked Google Cloud project with the Play
 * Integrity API enabled and a service-account key — none of which exist in
 * any environment this repository has been deployed to yet (see the ADR-003
 * implementation report's "Remaining Limitations" section). When
 * `getGooglePlayIntegrityConfig()` returns null, `verify()` throws
 * `AttestationProviderNotConfiguredError` — fails closed, exactly like
 * `NotImplementedAttestationGate` did before this task, never silently
 * returns a pass.
 */

export class AttestationProviderNotConfiguredError extends Error {
  constructor(platform: DevicePlatform) {
    super(
      `No attestation provider is configured for platform "${platform}" in this environment ` +
        "(ADR-003 implementation report — Google Play Console/Cloud project not yet provisioned). " +
        "Do not treat this as a pass.",
    );
    this.name = "AttestationProviderNotConfiguredError";
  }
}

export interface AttestationVerificationInput {
  platform: DevicePlatform;
  /** The raw, opaque token the client's native attestation call produced —
   * a Play Integrity "integrity token" on Android. Never logged in full
   * (only its length/prefix, if anything, for debugging). */
  attestationToken: string;
  /** The exact nonce this backend issued for the challenge being redeemed —
   * compared against the value Google's decoded verdict itself reports the
   * client requested the token with, closing the replay/substitution gap
   * §6/§17 of the implementation task require. */
  expectedNonce: string;
}

export interface AttestationVerificationResult {
  passed: boolean;
  provider: "play_integrity" | "app_attest" | "device_check";
  /** Present only when passed=false — a short, non-sensitive machine reason
   * (never the raw token or any user-identifying data) for audit logging. */
  rejectionReason?: string;
}

export interface AttestationVerifier {
  verify(input: AttestationVerificationInput): Promise<AttestationVerificationResult>;
}

// Google-documented verdict vocabulary (Play Integrity Standard API response
// shape) — https://developer.android.com/google/play/integrity/verdicts.
// Only the fields this backend's policy actually inspects are typed; the
// real response carries more, deliberately not modelled here.
interface PlayIntegrityDecodedToken {
  requestDetails?: {
    requestPackageName?: string;
    nonce?: string;
    timestampMillis?: string;
  };
  appIntegrity?: {
    appRecognitionVerdict?: string;
    packageName?: string;
  };
  deviceIntegrity?: {
    deviceRecognitionVerdict?: string[];
  };
}

/** How stale a request's own timestamp may be before this backend refuses it
 * outright, independent of Google's own verdict — closes the window for a
 * captured-but-delayed token to be replayed long after issuance. */
const MAX_REQUEST_AGE_MS = 2 * 60_000;

/** Device-integrity verdicts this policy accepts. `MEETS_DEVICE_INTEGRITY`
 * (a genuine, unmodified, Play-Protect-certified device) is the only one
 * required for MVP — the stricter STRONG/BASIC labels are a future tightening
 * knob, not implemented now, since no real device population exists yet to
 * calibrate against. */
const ACCEPTABLE_DEVICE_VERDICTS = new Set(["MEETS_DEVICE_INTEGRITY"]);

export class PlayIntegrityVerifier implements AttestationVerifier {
  async verify(input: AttestationVerificationInput): Promise<AttestationVerificationResult> {
    if (input.platform !== "android") {
      // iOS App Attest/DeviceCheck is a separate, not-yet-implemented
      // integration (see the ADR-003 implementation report) — this verifier
      // only ever handles Android. Failing closed here, rather than routing
      // iOS through Play Integrity by mistake, is the correct behavior.
      throw new AttestationProviderNotConfiguredError(input.platform);
    }

    const config = getGooglePlayIntegrityConfig();
    if (!config) {
      throw new AttestationProviderNotConfiguredError(input.platform);
    }

    const decoded = await decodeIntegrityToken(config, input.attestationToken);

    const rejection = evaluateVerdict(decoded, input.expectedNonce);
    if (rejection) {
      logger.warn({ reason: rejection }, "device attestation: Play Integrity verdict rejected");
      return { passed: false, provider: "play_integrity", rejectionReason: rejection };
    }

    return { passed: true, provider: "play_integrity" };
  }
}

function evaluateVerdict(decoded: PlayIntegrityDecodedToken, expectedNonce: string): string | null {
  const requestDetails = decoded.requestDetails;
  if (!requestDetails) return "missing_request_details";

  if (requestDetails.requestPackageName !== ANDROID_PACKAGE_NAME) {
    return "package_name_mismatch";
  }

  if (requestDetails.nonce !== expectedNonce) {
    // The single most important check in this whole flow: proves the token
    // being redeemed was generated for THIS backend-issued challenge, not
    // captured from a different (possibly already-successful) registration
    // attempt and replayed here.
    return "nonce_mismatch";
  }

  const timestampMillis = Number(requestDetails.timestampMillis ?? "0");
  if (!timestampMillis || Date.now() - timestampMillis > MAX_REQUEST_AGE_MS) {
    return "request_stale";
  }

  const deviceVerdicts = decoded.deviceIntegrity?.deviceRecognitionVerdict ?? [];
  const deviceOk = deviceVerdicts.some((v) => ACCEPTABLE_DEVICE_VERDICTS.has(v));
  if (!deviceOk) {
    return "device_integrity_not_met";
  }

  // appIntegrity.appRecognitionVerdict is deliberately NOT enforced yet: a
  // development-client build distributed via EAS (not the Play Store) will
  // legitimately report "UNRECOGNIZED_VERSION"/"UNEVALUATED" rather than
  // "PLAY_RECOGNIZED" even for a completely genuine device, because the
  // running APK was never installed through Play. Enforcing this verdict
  // before the app is ever distributed via Play Console would make every
  // real device fail regardless of genuineness — see the ADR-003
  // implementation report's "Remaining Limitations" section. This is a
  // deliberate, documented scope choice, not an oversight.

  return null;
}

async function decodeIntegrityToken(
  config: GooglePlayIntegrityConfig,
  integrityToken: string,
): Promise<PlayIntegrityDecodedToken> {
  const accessToken = await getGoogleAccessToken(config);

  const url = `https://playintegrity.googleapis.com/v1/${encodeURIComponent(ANDROID_PACKAGE_NAME)}:decodeIntegrityToken`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ integrity_token: integrityToken }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Play Integrity decodeIntegrityToken failed: ${response.status} ${body.slice(0, 200)}`,
    );
  }

  const json = (await response.json()) as { tokenPayloadExternal?: PlayIntegrityDecodedToken };
  return json.tokenPayloadExternal ?? {};
}

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

/** Standard OAuth2 service-account JWT-bearer flow (RFC 7523) — no
 * `google-auth-library` dependency added for one narrow use, since `jose` is
 * already a dependency (used by lib/auth/jwt.ts) and this is the entire flow:
 * sign a short-lived assertion with the service account's private key, trade
 * it for an access token at Google's token endpoint. */
async function getGoogleAccessToken(config: GooglePlayIntegrityConfig): Promise<string> {
  const key = JSON.parse(config.serviceAccountKeyJson) as ServiceAccountKey;
  const privateKey = await importPKCS8(key.private_key, "RS256");

  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/playintegrity",
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(key.client_email)
    .setSubject(key.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 600)
    .sign(privateKey);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Google OAuth token exchange failed: ${response.status} ${body.slice(0, 200)}`);
  }

  const json = (await response.json()) as { access_token: string };
  return json.access_token;
}
