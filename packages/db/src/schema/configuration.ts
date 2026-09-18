import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  jsonb,
  boolean,
  integer,
  timestamp,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { configurationScope, configurationValueType } from "./enums.js";
import { hostels } from "./hostel.js";
import { staff } from "./identity.js";

/**
 * Phase 5, Prompt 14 — Enterprise Configuration Center. The minimum viable
 * configuration data model this task's own reconnaissance justified: no
 * settings/configuration/feature-flag table existed anywhere in this schema
 * before this migration (a full grep of every `packages/db/src/schema/*.ts`
 * file and every `supabase/migrations/*.sql` file for
 * "config|setting|feature_flag|parameter" returned zero matches), so this is
 * new schema, not an extension of something pre-existing — but it is
 * deliberately ONE generic table, not the four-table
 * `configuration_domains`/`configuration_entries`/`configuration_metadata`/
 * `configuration_validation_rules` model the prompt's own text merely lists
 * as a *possible* shape ("Do not automatically create every table listed
 * above. First determine whether an existing configuration/settings
 * architecture can be extended" — none exists, and a single row already
 * carries every field the prompt's own "Configuration data should support"
 * list names, so a `configuration_domains` table would only ever hold a
 * small, effectively-static list of domain names with no independent
 * lifecycle of its own — `domain` therefore stays a plain, app-validated
 * `text` column here, exactly like `audit_logs.entityType`'s own established
 * "free-form text, validated by the application layer, not a Postgres enum"
 * precedent immediately below).
 *
 * `domain` is intentionally `text`, not a `pgEnum`, mirroring
 * `audit_logs.action`/`entity_type`'s own precedent: the set of valid
 * domains (`apps/api/src/domain/configuration/types.ts`'s
 * `CONFIGURATION_DOMAINS`) is an application-layer allow-list a future
 * domain can extend without an `ALTER TYPE` migration, while still being
 * fully validated server-side on every write — never client-trusted.
 *
 * `value` is a single `jsonb` column (not `value_string`/`value_number`/
 * `value_boolean` columns) because `valueType` already names which JSON
 * shape it must hold, and the application layer validates that
 * correspondence on every write (`domain/configuration/validation.ts`) —
 * duplicating the same fact as four mutually-exclusive nullable columns
 * would add schema complexity with no additional safety.
 *
 * RLS: deliberately ZERO policies for any client role, mirroring
 * `audit_logs`'s own established "no SELECT/INSERT/UPDATE/DELETE grant
 * exists for anon or authenticated; only Fastify's service-role connection
 * (bypasses RLS) reads/writes this table" pattern exactly — configuration
 * data is privileged and every authorization decision (role, AAL2, hostel
 * scope) is made once, in `apps/api/src/domain/configuration/`, not
 * duplicated as a second, RLS-layer copy of the same logic. A direct
 * PostgREST/Supabase-client read or write from any authenticated role
 * returns zero rows / is rejected — verified by
 * `supabase/tests/database/26_prompt14_configuration_center_rls.sql`.
 */
export const configurationEntries = pgTable(
  "configuration_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    domain: text("domain").notNull(),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    valueType: configurationValueType("value_type").notNull(),
    description: text("description"),
    scope: configurationScope("scope").notNull().default("global"),
    hostelId: uuid("hostel_id").references(() => hostels.id),
    isActive: boolean("is_active").notNull().default(true),
    // Optimistic-concurrency token (Prompt 14's own "CONCURRENT EDITING"
    // section: "prevent obviously stale administrative edits from silently
    // overwriting newer values" — the minimum real mechanism for that,
    // without a full version-history table; see this migration's own header
    // comment in the generated .sql file for why a separate history table
    // was NOT added). Incremented by exactly one on every successful
    // `PATCH` (`domain/configuration/repository.ts`'s `update()`); a caller
    // must supply the version it last read, or the write is rejected with
    // `409 stale_version` rather than silently overwriting a concurrent
    // change.
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by").references(() => staff.id),
    updatedBy: uuid("updated_by").references(() => staff.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Two partial unique indexes rather than one plain unique constraint on
    // (domain, key, hostel_id): a plain unique constraint treats NULL as
    // distinct from every other NULL in Postgres, so it would silently
    // allow unlimited duplicate GLOBAL (hostel_id IS NULL) rows for the same
    // domain/key — exactly the case that most needs uniqueness enforced.
    uniqueIndex("configuration_entries_global_key")
      .on(t.domain, t.key)
      .where(sql`${t.scope} = 'global'`),
    uniqueIndex("configuration_entries_hostel_key")
      .on(t.domain, t.key, t.hostelId)
      .where(sql`${t.scope} = 'hostel'`),
    index("configuration_entries_domain_idx").on(t.domain),
    index("configuration_entries_hostel_id_idx").on(t.hostelId),

    // A hostel-scoped entry must name a hostel; a global entry must not —
    // enforced at the database layer, not only in application validation
    // (defense in depth, matching this schema's established discipline of
    // never relying on the application layer alone for a structural
    // invariant it can express directly).
    check(
      "configuration_entries_scope_hostel_consistency",
      sql`(${t.scope} = 'hostel' and ${t.hostelId} is not null) or (${t.scope} = 'global' and ${t.hostelId} is null)`,
    ),
  ],
).enableRLS();
