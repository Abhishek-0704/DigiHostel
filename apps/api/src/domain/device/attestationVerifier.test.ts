import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
  PlayIntegrityVerifier,
  AttestationProviderNotConfiguredError,
} from "./attestationVerifier.js";

// A real RSA keypair generated once per test file — exercises the actual
// RS256 service-account JWT-signing code path (jose's SignJWT/importPKCS8),
// not a stub of that logic. Only Google's own HTTP endpoints are mocked
// below; everything this backend does locally (assembling and signing the
// assertion, decoding Google's response, applying this codebase's own
// acceptance policy) runs for real.
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const SERVICE_ACCOUNT_KEY_JSON = JSON.stringify({
  client_email: "test-sa@example-project.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
});

const PACKAGE_NAME = "com.digihostel.parent";
const VALID_NONCE = "test-nonce-abc123";

function mockGoogleResponses(decodedTokenPayload: Record<string, unknown> | null) {
  return vi.fn(async (url: string | URL | Request) => {
    const urlStr = url.toString();
    if (urlStr.includes("oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "fake-google-access-token" }), {
        status: 200,
      });
    }
    if (urlStr.includes("decodeIntegrityToken")) {
      if (decodedTokenPayload === null) {
        return new Response("invalid token", { status: 400 });
      }
      return new Response(JSON.stringify({ tokenPayloadExternal: decodedTokenPayload }), {
        status: 200,
      });
    }
    throw new Error(`unexpected fetch to ${urlStr}`);
  });
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    requestDetails: {
      requestPackageName: PACKAGE_NAME,
      nonce: VALID_NONCE,
      timestampMillis: String(Date.now()),
    },
    appIntegrity: { appRecognitionVerdict: "UNRECOGNIZED_VERSION", packageName: PACKAGE_NAME },
    deviceIntegrity: { deviceRecognitionVerdict: ["MEETS_DEVICE_INTEGRITY"] },
    ...overrides,
  };
}

describe("PlayIntegrityVerifier", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.GOOGLE_PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER = "123456789";
    process.env.GOOGLE_PLAY_INTEGRITY_SERVICE_ACCOUNT_KEY = SERVICE_ACCOUNT_KEY_JSON;
    process.env.ANDROID_PACKAGE_NAME = PACKAGE_NAME;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it("throws AttestationProviderNotConfiguredError when Google credentials are absent — fails closed, never silently passes", async () => {
    delete process.env.GOOGLE_PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER;
    delete process.env.GOOGLE_PLAY_INTEGRITY_SERVICE_ACCOUNT_KEY;
    const verifier = new PlayIntegrityVerifier();

    await expect(
      verifier.verify({ platform: "android", attestationToken: "tok", expectedNonce: VALID_NONCE }),
    ).rejects.toBeInstanceOf(AttestationProviderNotConfiguredError);
  });

  it("throws AttestationProviderNotConfiguredError for iOS — this verifier only ever handles Android", async () => {
    const verifier = new PlayIntegrityVerifier();

    await expect(
      verifier.verify({ platform: "ios", attestationToken: "tok", expectedNonce: VALID_NONCE }),
    ).rejects.toBeInstanceOf(AttestationProviderNotConfiguredError);
  });

  it("a genuine, matching verdict passes", async () => {
    vi.stubGlobal("fetch", mockGoogleResponses(validPayload()));
    const verifier = new PlayIntegrityVerifier();

    const result = await verifier.verify({
      platform: "android",
      attestationToken: "real-token",
      expectedNonce: VALID_NONCE,
    });

    expect(result).toEqual({ passed: true, provider: "play_integrity" });
  });

  it("a nonce mismatch is rejected — the core replay/substitution defense", async () => {
    vi.stubGlobal(
      "fetch",
      mockGoogleResponses(
        validPayload({
          requestDetails: {
            requestPackageName: PACKAGE_NAME,
            nonce: "a-different-nonce-entirely",
            timestampMillis: String(Date.now()),
          },
        }),
      ),
    );
    const verifier = new PlayIntegrityVerifier();

    const result = await verifier.verify({
      platform: "android",
      attestationToken: "captured-and-replayed-token",
      expectedNonce: VALID_NONCE,
    });

    expect(result.passed).toBe(false);
    expect(result.rejectionReason).toBe("nonce_mismatch");
  });

  it("a package-name mismatch is rejected — a token issued for a different app can never be accepted", async () => {
    vi.stubGlobal(
      "fetch",
      mockGoogleResponses(
        validPayload({
          requestDetails: {
            requestPackageName: "com.attacker.otherapp",
            nonce: VALID_NONCE,
            timestampMillis: String(Date.now()),
          },
        }),
      ),
    );
    const verifier = new PlayIntegrityVerifier();

    const result = await verifier.verify({
      platform: "android",
      attestationToken: "tok",
      expectedNonce: VALID_NONCE,
    });

    expect(result.passed).toBe(false);
    expect(result.rejectionReason).toBe("package_name_mismatch");
  });

  it("a stale request timestamp is rejected, independent of Google's own verdict", async () => {
    vi.stubGlobal(
      "fetch",
      mockGoogleResponses(
        validPayload({
          requestDetails: {
            requestPackageName: PACKAGE_NAME,
            nonce: VALID_NONCE,
            timestampMillis: String(Date.now() - 10 * 60_000), // 10 minutes old
          },
        }),
      ),
    );
    const verifier = new PlayIntegrityVerifier();

    const result = await verifier.verify({
      platform: "android",
      attestationToken: "tok",
      expectedNonce: VALID_NONCE,
    });

    expect(result.passed).toBe(false);
    expect(result.rejectionReason).toBe("request_stale");
  });

  it("an unmet device-integrity verdict (e.g. rooted/emulated/unlicensed device) is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      mockGoogleResponses(validPayload({ deviceIntegrity: { deviceRecognitionVerdict: [] } })),
    );
    const verifier = new PlayIntegrityVerifier();

    const result = await verifier.verify({
      platform: "android",
      attestationToken: "tok",
      expectedNonce: VALID_NONCE,
    });

    expect(result.passed).toBe(false);
    expect(result.rejectionReason).toBe("device_integrity_not_met");
  });

  it("a malformed/undecodable attestation token surfaces as a thrown error, not a silent pass", async () => {
    vi.stubGlobal("fetch", mockGoogleResponses(null));
    const verifier = new PlayIntegrityVerifier();

    await expect(
      verifier.verify({
        platform: "android",
        attestationToken: "garbage",
        expectedNonce: VALID_NONCE,
      }),
    ).rejects.toThrow();
  });
});
