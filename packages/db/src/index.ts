import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

// Re-exported so consuming apps never need their own direct `drizzle-orm`
// dependency (and therefore never resolve their own peer-suffixed instance
// of it — pnpm gives a package a DIFFERENT drizzle-orm instance depending on
// which optional peers, e.g. `pg`, are visible in its own dependency
// subtree, which silently broke `apps/api` when `pg-boss` — a `pg` consumer
// unrelated to this ORM — was added there; only this package's instance
// (peer-scoped to `postgres` alone, matching the `db` export above) is ever
// used anywhere in this workspace).
export { eq, and, or, desc, asc, inArray, isNull, isNotNull, lt, sql } from "drizzle-orm";

// Backend-privileged connection (ADR-006) — DATABASE_URL is Supabase's direct
// Postgres connection string, not the Supabase JS SDK. Any direct client-side
// access must instead go through RLS-scoped Supabase Realtime, never this module.
const connectionString = process.env.DATABASE_URL ?? "";

const client = postgres(connectionString);

export const db = drizzle(client, { schema });

/**
 * Closes the underlying postgres-js connection pool. Consuming apps' own
 * graceful-shutdown sequences (e.g. `apps/api/src/index.ts`'s SIGTERM/SIGINT
 * handler) call this after stopping Fastify/pg-boss, so no connection is
 * left open when the process exits (F-06 production-runnable hardening —
 * `db` itself has no lifecycle hook of its own to piggyback on).
 */
export async function closeDb(): Promise<void> {
  await client.end();
}

export * from "./schema/index.js";
