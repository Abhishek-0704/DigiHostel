/**
 * Typed access to this app's environment configuration (Prompt 2 foundation).
 *
 * Only EXPO_PUBLIC_-prefixed variables are read here — those are the only
 * ones Expo inlines into the client bundle (see apps/parent-mobile/env.example).
 * Never add a variable here that isn't safe to ship inside the compiled app.
 *
 * Deliberately lazy, not validated at module-import time: this foundation's
 * placeholder screens don't call Supabase or the API yet, so the app must
 * still boot without a configured .env (e.g. a fresh clone before anyone has
 * copied env.example to .env). Validation happens only when a caller actually
 * asks for a value, matching the backend's own fail-fast-at-point-of-use
 * pattern (apps/api/src/plugins/auth.ts's buildDefaultJwtVerifier) rather
 * than fail-fast-at-startup, which would be wrong for a client app whose
 * entry screens don't need this configuration yet.
 */

export class MissingEnvVarError extends Error {
  constructor(readonly variableName: string) {
    super(
      `Missing required environment variable "${variableName}". ` +
        "Copy apps/parent-mobile/env.example to apps/parent-mobile/.env and fill it in.",
    );
    this.name = "MissingEnvVarError";
  }
}

function requireEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new MissingEnvVarError(name);
  }
  return value;
}

export interface AppEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  apiBaseUrl: string;
}

/** Reads and validates every required env var. Call this only at the point
 * a feature actually needs configuration (e.g. inside a Supabase client
 * factory), never eagerly at module load. */
export function getEnv(): AppEnv {
  return {
    supabaseUrl: requireEnvVar("EXPO_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: requireEnvVar("EXPO_PUBLIC_SUPABASE_ANON_KEY"),
    apiBaseUrl: requireEnvVar("EXPO_PUBLIC_API_BASE_URL"),
  };
}

/**
 * ADR-003 implementation — the numeric Google Cloud project number linked to
 * this app's Play Console registration, required by the Play Integrity
 * Standard API request (`IntegrityTokenRequest.setCloudProjectNumber`). This
 * is a public identifier, not a secret (same sensitivity class as a package
 * name) — safe to inline via EXPO_PUBLIC_, unlike a service-role/API key.
 *
 * Deliberately a separate, OPTIONAL accessor rather than part of `getEnv()`:
 * no Google Play Console project exists in any environment this app has run
 * in yet (see the ADR-003 implementation report's "Remaining Limitations"),
 * so treating it as required would break every OTHER feature that calls
 * `getEnv()` too. `registerCurrentDevice()` is the only caller, and it must
 * surface a clear, honest "not configured" failure — never fall back to
 * skipping attestation. */
export function getGoogleCloudProjectNumber(): string | null {
  return process.env.EXPO_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER ?? null;
}
