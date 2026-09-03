import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState } from "react-native";
import { getEnv } from "../../config/env";
import { secureStorage } from "../storage/secureStorage";

/**
 * Supabase client foundation (Prompt 2 — ADR-014). This is infrastructure
 * only: client instantiation, session storage wiring, and auto-refresh
 * lifecycle plumbing. It does NOT implement login, OTP, registration, or
 * any business query — see src/services/supabase/auth.ts for the (equally
 * minimal) session-lifecycle abstraction, and the module boundaries note
 * below for what this client is and isn't for.
 *
 * Architectural boundary (unchanged from Prompt 1, restated here since this
 * is where it matters most): this client is used ONLY for session
 * management (sign-in, refresh, sign-out) via Supabase Auth, exactly as
 * ADR-014 specifies. All business data (leave requests, approvals) flows
 * through the Fastify REST API (@digihostel/api-client-react), never a
 * direct Supabase table query from this client. No business query is
 * written against this client anywhere in this foundation.
 *
 * No generated `Database` type currently exists in this repository
 * (packages/db uses Drizzle's schema types, not a Supabase-CLI-generated
 * TS type) — the client below is intentionally untyped-for-tables rather
 * than fabricating a Database type that doesn't exist. If/when one is
 * generated, `createClient<Database>(...)` is the only line that needs to
 * change.
 *
 * Lazily created and memoized (not a top-level singleton): matches
 * src/config/env.ts's fail-fast-at-point-of-use design so the app can still
 * boot without a configured .env for screens that don't need Supabase yet.
 *
 * A Supabase-recommended AppState listener drives `startAutoRefresh`/
 * `stopAutoRefresh` so token refresh pauses while the app is backgrounded
 * (https://supabase.com/docs/reference/javascript/initializing —
 * React Native guidance), rather than assumed without verification.
 */

let client: SupabaseClient | undefined;

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const env = getEnv();
  client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      storage: secureStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      client?.auth.startAutoRefresh();
    } else {
      client?.auth.stopAutoRefresh();
    }
  });

  return client;
}
