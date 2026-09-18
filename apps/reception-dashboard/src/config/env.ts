/**
 * Typed access to this app's environment configuration (Prompt 0.2
 * foundation). Mirrors apps/parent-mobile/src/config/env.ts's design
 * exactly, adapted from Expo's `process.env.EXPO_PUBLIC_*` inlining to
 * Vite's `import.meta.env.VITE_*` inlining (see env.example).
 *
 * Deliberately lazy, not validated at module-import time: this foundation's
 * placeholder pages don't call Supabase or the API yet, so the app must
 * still boot without a configured .env.local (e.g. a fresh clone before
 * anyone has copied env.example). Validation happens only when a caller
 * actually asks for a value — matching the backend's own
 * fail-fast-at-point-of-use pattern, not fail-fast-at-startup, which would
 * be wrong for a client app whose entry pages don't need this configuration
 * yet.
 */

export class MissingEnvVarError extends Error {
  constructor(readonly variableName: string) {
    super(
      `Missing required environment variable "${variableName}". ` +
        "Copy apps/reception-dashboard/env.example to apps/reception-dashboard/.env.local and fill it in.",
    );
    this.name = "MissingEnvVarError";
  }
}

type RequiredEnvVarName = "VITE_SUPABASE_URL" | "VITE_SUPABASE_ANON_KEY" | "VITE_API_BASE_URL";

function requireEnvVar(name: RequiredEnvVarName): string {
  const value = import.meta.env[name];
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
    supabaseUrl: requireEnvVar("VITE_SUPABASE_URL"),
    supabaseAnonKey: requireEnvVar("VITE_SUPABASE_ANON_KEY"),
    apiBaseUrl: requireEnvVar("VITE_API_BASE_URL"),
  };
}
