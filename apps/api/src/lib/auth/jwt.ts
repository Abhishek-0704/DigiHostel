import { createRemoteJWKSet, jwtVerify, errors as joseErrors, type JWTVerifyGetKey } from "jose";
import type { SupabaseJwtClaims } from "./types.js";

/**
 * Supabase JWT verification (ADR-014, docs/auth-database-security-model.md
 * §10/§13/§16).
 *
 * Verifies against the project's live JWKS endpoint
 * (`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`) rather than a hardcoded
 * algorithm or a shared secret — confirmed empirically against a real local
 * Supabase instance (`supabase start`) to currently publish an ES256
 * asymmetric key. `algorithms` below allow-lists the algorithms this backend
 * accepts (both currently-relevant asymmetric options) without assuming
 * exactly one; `jose`'s `createRemoteJWKSet` resolves whichever key `kid`
 * the token actually names, so a future key-type change on Supabase's side
 * does not require a code change here as long as it stays within the
 * allow-list.
 *
 * Never implements cryptographic verification manually — `jose` (a
 * well-maintained, audited library) does all signature/claim validation.
 */

export class AuthConfigError extends Error {}

export class JwtVerificationError extends Error {
  constructor(
    message: string,
    readonly code:
      | "missing_token"
      | "malformed_token"
      | "invalid_signature"
      | "expired"
      | "invalid_issuer"
      | "invalid_audience"
      | "verification_failed",
  ) {
    super(message);
    this.name = "JwtVerificationError";
  }
}

export interface JwtVerifierConfig {
  /** Supabase project URL, e.g. http://127.0.0.1:55321 (local) or
   * https://<project-ref>.supabase.co (hosted). Required — fails securely
   * (throws at construction, not at first request) if missing/empty. */
  supabaseUrl: string;
  /** Expected `aud` claim. Supabase's default is "authenticated". */
  audience?: string;
  /** Allow-listed signing algorithms. Defaults to the asymmetric algorithms
   * Supabase's JWKS-based model currently supports. Deliberately does not
   * include HS256 (the legacy shared-secret model) — this backend is built
   * against the current JWKS-based signing-key model per this task's
   * requirement; see docs/auth-database-security-model.md for the flagged
   * follow-up if a project still on the legacy model needs support. */
  algorithms?: string[];
  /** JWKS cache tuning, passed through to jose's createRemoteJWKSet. Kept at
   * jose's own defaults unless overridden — they're already reasoned about
   * (a max-age cache plus a short cooldown between re-fetches on unknown
   * `kid`, avoiding both constant refetching and an unboundedly long stale-key
   * window on legitimate key rotation). */
  jwksCacheMaxAgeMs?: number;
  jwksCooldownMs?: number;
}

export interface JwtVerifier {
  verify(token: string): Promise<SupabaseJwtClaims>;
}

const BEARER_PREFIX = "Bearer ";

/** Extracts the raw token from an `Authorization` header value. Throws
 * JwtVerificationError (never returns undefined) so callers have one error
 * path to map to 401. */
export function extractBearerToken(authorizationHeader: string | undefined): string {
  if (!authorizationHeader) {
    throw new JwtVerificationError("Missing Authorization header", "missing_token");
  }
  if (!authorizationHeader.startsWith(BEARER_PREFIX)) {
    throw new JwtVerificationError("Authorization header is not a Bearer token", "malformed_token");
  }
  const token = authorizationHeader.slice(BEARER_PREFIX.length).trim();
  if (!token) {
    throw new JwtVerificationError("Bearer token is empty", "malformed_token");
  }
  return token;
}

export function createJwtVerifier(
  config: JwtVerifierConfig,
  // Injectable for tests — production uses createRemoteJWKSet against the
  // real project; tests pass a static public key directly, avoiding any
  // network dependency and keeping tests deterministic (see jwt.test.ts).
  keyResolver?: JWTVerifyGetKey,
): JwtVerifier {
  if (!config.supabaseUrl || config.supabaseUrl.trim() === "") {
    // Fail securely: refuse to construct a verifier that would silently
    // accept anything, rather than deferring the failure to first request.
    throw new AuthConfigError(
      "SUPABASE_URL is required to verify Supabase Auth JWTs but was not configured",
    );
  }

  const issuer = new URL("/auth/v1", config.supabaseUrl).toString().replace(/\/$/, "");
  const audience = config.audience ?? "authenticated";
  const algorithms = config.algorithms ?? ["ES256", "RS256"];

  const jwks =
    keyResolver ??
    createRemoteJWKSet(new URL("/auth/v1/.well-known/jwks.json", config.supabaseUrl), {
      cacheMaxAge: config.jwksCacheMaxAgeMs,
      cooldownDuration: config.jwksCooldownMs,
    });

  return {
    async verify(token: string): Promise<SupabaseJwtClaims> {
      try {
        const { payload } = await jwtVerify(token, jwks, {
          issuer,
          audience,
          algorithms,
        });
        return payload as unknown as SupabaseJwtClaims;
      } catch (err) {
        throw mapJoseError(err);
      }
    },
  };
}

function mapJoseError(err: unknown): JwtVerificationError {
  if (err instanceof joseErrors.JWTExpired) {
    return new JwtVerificationError("Token expired", "expired");
  }
  if (err instanceof joseErrors.JWTClaimValidationFailed) {
    if (err.claim === "iss") {
      return new JwtVerificationError("Invalid token issuer", "invalid_issuer");
    }
    if (err.claim === "aud") {
      return new JwtVerificationError("Invalid token audience", "invalid_audience");
    }
    return new JwtVerificationError(`Claim validation failed: ${err.claim}`, "verification_failed");
  }
  if (
    err instanceof joseErrors.JWSSignatureVerificationFailed ||
    err instanceof joseErrors.JWSInvalid ||
    err instanceof joseErrors.JWKSNoMatchingKey
  ) {
    return new JwtVerificationError("Invalid token signature", "invalid_signature");
  }
  if (err instanceof joseErrors.JWTInvalid || err instanceof joseErrors.JWSInvalid) {
    return new JwtVerificationError("Malformed token", "malformed_token");
  }
  return new JwtVerificationError("Token verification failed", "verification_failed");
}
