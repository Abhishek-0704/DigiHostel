import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

// Backend-privileged connection (ADR-006) — DATABASE_URL is Supabase's direct
// Postgres connection string, not the Supabase JS SDK. Any direct client-side
// access must instead go through RLS-scoped Supabase Realtime, never this module.
const connectionString = process.env.DATABASE_URL ?? "";

const client = postgres(connectionString);

export const db = drizzle(client, { schema });

export * from "./schema/index.js";
