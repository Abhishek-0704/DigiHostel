import { SignJWT, generateKeyPair, type KeyLike } from "jose";

/**
 * Deterministic, offline JWT test fixtures. Generates a real ES256 keypair
 * (matching the algorithm our local Supabase instance was empirically
 * confirmed to publish via its JWKS endpoint — see jwt.ts's header comment)
 * and signs test tokens with it directly, entirely in-process. No network
 * call, no remote or local Supabase project involved.
 */

export const TEST_SUPABASE_URL = "http://127.0.0.1:9999"; // never actually dialed in tests
export const TEST_ISSUER = `${TEST_SUPABASE_URL}/auth/v1`;
export const TEST_AUDIENCE = "authenticated";

export async function generateTestKeyPair() {
  return generateKeyPair("ES256", { extractable: true });
}

export interface SignTestJwtOptions {
  sub: string;
  privateKey: KeyLike;
  issuer?: string;
  audience?: string;
  expiresInSeconds?: number; // default: 1 hour from now
  issuedAtSecondsAgo?: number; // for constructing already-expired tokens
  kid?: string;
}

export async function signTestJwt(opts: SignTestJwtOptions): Promise<string> {
  const now = Math.floor(Date.now() / 1000) - (opts.issuedAtSecondsAgo ?? 0);
  const exp = now + (opts.expiresInSeconds ?? 3600);

  return new SignJWT({
    role: "authenticated",
    email: `${opts.sub}@example.test`,
  })
    .setProtectedHeader({ alg: "ES256", kid: opts.kid ?? "test-key" })
    .setSubject(opts.sub)
    .setIssuer(opts.issuer ?? TEST_ISSUER)
    .setAudience(opts.audience ?? TEST_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(opts.privateKey);
}
