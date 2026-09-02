import { describe, it, expect, beforeAll } from "vitest";
import { createRemoteJWKSet } from "jose";
import {
  createJwtVerifier,
  extractBearerToken,
  AuthConfigError,
  JwtVerificationError,
} from "./jwt.js";
import {
  generateTestKeyPair,
  signTestJwt,
  TEST_SUPABASE_URL,
  TEST_ISSUER,
} from "./__fixtures__/test-jwt.js";
import type { KeyLike } from "jose";

describe("extractBearerToken", () => {
  it("scenario 1: missing Authorization header -> rejected", () => {
    expect(() => extractBearerToken(undefined)).toThrow(JwtVerificationError);
    try {
      extractBearerToken(undefined);
    } catch (err) {
      expect((err as JwtVerificationError).code).toBe("missing_token");
    }
  });

  it("scenario 2: malformed Authorization header -> rejected", () => {
    for (const bad of ["not-a-bearer-token", "Basic abc123", "Bearer"]) {
      try {
        extractBearerToken(bad);
        expect.unreachable(`expected "${bad}" to throw`);
      } catch (err) {
        expect(err).toBeInstanceOf(JwtVerificationError);
        expect((err as JwtVerificationError).code).toBe("malformed_token");
      }
    }
  });

  it("extracts the token from a well-formed Bearer header", () => {
    expect(extractBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });
});

describe("createJwtVerifier — fail-secure configuration", () => {
  it("throws AuthConfigError when supabaseUrl is missing/empty", () => {
    expect(() => createJwtVerifier({ supabaseUrl: "" })).toThrow(AuthConfigError);
  });
});

describe("createJwtVerifier — token verification (offline, real ES256 crypto)", () => {
  let privateKey: KeyLike;
  let publicKey: KeyLike;

  beforeAll(async () => {
    const pair = await generateTestKeyPair();
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;
  });

  it("scenario 6: valid JWT -> returns verified claims", async () => {
    const verifier = createJwtVerifier({ supabaseUrl: TEST_SUPABASE_URL }, async () => publicKey);
    const token = await signTestJwt({ sub: "11111111-1111-1111-1111-111111111111", privateKey });

    const claims = await verifier.verify(token);

    expect(claims.sub).toBe("11111111-1111-1111-1111-111111111111");
    expect(claims.iss).toBe(TEST_ISSUER);
    expect(claims.aud).toBe("authenticated");
  });

  it("scenario 3: invalid signature (signed by a different key) -> rejected", async () => {
    const verifier = createJwtVerifier({ supabaseUrl: TEST_SUPABASE_URL }, async () => publicKey);
    const otherPair = await generateTestKeyPair();
    const tokenSignedByWrongKey = await signTestJwt({
      sub: "11111111-1111-1111-1111-111111111111",
      privateKey: otherPair.privateKey, // NOT the key the verifier trusts
    });

    await expect(verifier.verify(tokenSignedByWrongKey)).rejects.toMatchObject({
      code: "invalid_signature",
    });
  });

  it("scenario 4: expired JWT -> rejected", async () => {
    const verifier = createJwtVerifier({ supabaseUrl: TEST_SUPABASE_URL }, async () => publicKey);
    const expiredToken = await signTestJwt({
      sub: "11111111-1111-1111-1111-111111111111",
      privateKey,
      issuedAtSecondsAgo: 7200,
      expiresInSeconds: 3600, // issued 2h ago, expired 1h ago
    });

    await expect(verifier.verify(expiredToken)).rejects.toMatchObject({ code: "expired" });
  });

  it("scenario 5: invalid issuer -> rejected", async () => {
    const verifier = createJwtVerifier({ supabaseUrl: TEST_SUPABASE_URL }, async () => publicKey);
    const wrongIssuerToken = await signTestJwt({
      sub: "11111111-1111-1111-1111-111111111111",
      privateKey,
      issuer: "http://evil.example/auth/v1",
    });

    await expect(verifier.verify(wrongIssuerToken)).rejects.toMatchObject({
      code: "invalid_issuer",
    });
  });

  it("rejects an invalid audience", async () => {
    const verifier = createJwtVerifier({ supabaseUrl: TEST_SUPABASE_URL }, async () => publicKey);
    const wrongAudToken = await signTestJwt({
      sub: "11111111-1111-1111-1111-111111111111",
      privateKey,
      audience: "anon",
    });

    await expect(verifier.verify(wrongAudToken)).rejects.toMatchObject({
      code: "invalid_audience",
    });
  });

  it("malformed token string -> rejected", async () => {
    const verifier = createJwtVerifier({ supabaseUrl: TEST_SUPABASE_URL }, async () => publicKey);
    await expect(verifier.verify("not-a-real-jwt")).rejects.toBeInstanceOf(JwtVerificationError);
  });
});

// Sanity check that createRemoteJWKSet (the production code path) is at
// least constructible with a well-formed URL — actual network verification
// against a live JWKS endpoint is exercised manually against the local
// Supabase instance (documented in docs/backend-auth-implementation.md),
// not in this offline unit suite.
describe("createJwtVerifier — production JWKS path is constructible", () => {
  it("does not throw when building the default (network-backed) verifier", () => {
    expect(() => createJwtVerifier({ supabaseUrl: "http://127.0.0.1:55321" })).not.toThrow();
  });
  it("createRemoteJWKSet accepts the expected Supabase JWKS URL shape", () => {
    expect(() =>
      createRemoteJWKSet(new URL("http://127.0.0.1:55321/auth/v1/.well-known/jwks.json")),
    ).not.toThrow();
  });
});
