import { defineConfig } from "drizzle-kit";

// DATABASE_URL is the Supabase Postgres connection string (ADR-006/ADR-014),
// backend-privileged. Schema is now implemented under ./src/schema per
// docs/database-schema-design.md and docs/adr/ADR-002/ADR-015. Migration
// output is pointed at ../../supabase/migrations (not ./migrations) so
// generated SQL lands where the Supabase CLI expects it (supabase db reset,
// supabase start) — see docs/database-schema-design.md and the Phase 6
// migration-structure requirement.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "../../supabase/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
