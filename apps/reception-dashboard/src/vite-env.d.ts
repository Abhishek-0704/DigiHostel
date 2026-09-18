/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_API_BASE_URL: string;
  /** Optional — Prompt 1 §16 session-timeout tuning, INFERRED defaults
   * (lib/sessionTimeout/config.ts). Unlike the three vars above, these are
   * never required — a safe default applies when unset. */
  readonly VITE_SESSION_IDLE_TIMEOUT_MINUTES?: string;
  readonly VITE_SESSION_IDLE_WARNING_MINUTES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Inlined at build time from package.json's `version` field
 * (vite.config.ts's `define`) — the actual application-version source for
 * the login footer (Prompt 2 §34), not a hardcoded/fabricated number. */
declare const __APP_VERSION__: string;
