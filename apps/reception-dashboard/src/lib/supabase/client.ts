import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "../../config/env";

/**
 * Supabase client foundation (Prompt 0.2 — ADR-014). Infrastructure only:
 * client instantiation and session-storage wiring. It does NOT implement
 * any sign-in mechanism — the staff authentication mechanism itself is an
 * explicitly open decision (docs/reception-dashboard-architecture.md §16,
 * REQUIRES DECISION), not finalized by this scaffolding pass. Whatever
 * mechanism is chosen (email+password, magic link, etc.) will call methods
 * on this same client via src/services/auth/authService.ts.
 *
 * Architectural boundary, matching apps/parent-mobile's own client.ts and
 * ADR-014: this client is used ONLY for session management via Supabase
 * Auth. All business data flows through the Fastify REST API
 * (@digihostel/api-client-react), never a direct Supabase table query from
 * this client. No business query is written against this client anywhere
 * in this foundation.
 *
 * No generated `Database` type currently exists in this repository
 * (packages/db uses Drizzle's schema types, not a Supabase-CLI-generated TS
 * type) — intentionally untyped-for-tables rather than fabricating a
 * Database type that doesn't exist, matching apps/parent-mobile's own
 * client.ts note. If/when one is generated, `createClient<Database>(...)`
 * is the only line that needs to change, here and there.
 *
 * Browser default storage (localStorage, via supabase-js itself) is used
 * rather than a custom storage adapter — apps/parent-mobile needed
 * expo-secure-store because React Native has no built-in persistent web
 * storage; a browser already has one, and supabase-js's browser build
 * already pauses/resumes token auto-refresh on tab visibility changes
 * internally, so no manual visibility-listener wiring (the RN app's
 * AppState-based equivalent) is needed here either.
 *
 * Lazily created and memoized (not a top-level singleton): matches
 * src/config/env.ts's fail-fast-at-point-of-use design so the app can still
 * boot without a configured .env.local for pages that don't need Supabase yet.
 */

let client: SupabaseClient | undefined;

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const env = getEnv();
  client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
    },
  });

  return client;
}
