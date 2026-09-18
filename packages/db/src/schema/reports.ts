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
} from "drizzle-orm/pg-core";
import { hostels } from "./hostel.js";
import { staff } from "./identity.js";

/**
 * Phase 6, Prompt 16 — Enterprise Reporting Platform.
 *
 * Reconnaissance before this migration (full grep of every
 * `packages/db/src/schema/*.ts` file for "template|favourite|favorite|report_history")
 * confirmed no existing table represents a staff member's own saved report
 * configuration, or a record of when a report was generated — genuinely new
 * schema, not an extension of something pre-existing. Two small, focused
 * tables, mirroring `configuration_entries`'s own precedent exactly (RLS,
 * versioning discipline, `jsonb` for a validated-at-the-application-layer
 * shape) rather than the larger multi-table model this prompt's own text
 * merely lists as a *possible* structure.
 *
 * `report_templates` — a staff member's own saved, reusable report
 * configuration (report id + selected fields + filters + a name), with an
 * `is_favorite` flag doing double duty as "favourites" (Prompt 16 §15) so a
 * second table isn't needed for that distinct-sounding but structurally
 * identical concept. Templates are PERSONAL, never organization-wide/shared
 * (§15's explicit "do NOT implement organization-wide sharing unless already
 * required" instruction) — scoped by `staff_id` alone, not by hostel (a
 * staff member's saved report configuration is not itself hostel-scoped
 * data; the REPORT that configuration generates is hostel-scoped at
 * execution time, via the same server-derived scope every other report
 * route already enforces).
 *
 * `report_executions` — a minimal execution-history record (Prompt 16 §14),
 * deliberately distinct from both a saved template (a configuration, not an
 * event) and a generated artifact (no PDF/XLSX/CSV file is ever produced by
 * this platform — see Prompt 16 §16). One row per successful preview/
 * generate call: which report, who requested it, their hostel scope at that
 * time, a filter summary, and how many rows it returned. This is NOT a
 * second audit system — `audit_logs` (service-role-only) remains this
 * codebase's one compliance-grade mutation record; report generation is a
 * READ, not a mutation, and reusing `audit_logs` for it would require a
 * fabricated `entity_id` (that table's `entity_id` column is `NOT NULL uuid`
 * and has no natural "this report definition" entity to reference).
 *
 * RLS: deliberately ZERO policies for any client role on both tables —
 * mirrors `audit_logs`'s/`configuration_entries`'s own established pattern
 * exactly (no SELECT/INSERT/UPDATE/DELETE grant for anon or authenticated;
 * only Fastify's service-role connection, which bypasses RLS entirely,
 * reads/writes these tables). Every authorization decision (role, AAL2,
 * `reports:view`/`reports:generate` permission, hostel scope, and —
 * uniquely to these two tables — "is this staff member the owner of this
 * template") is made exactly once, in `apps/api/src/domain/reports/`, not
 * duplicated as a second RLS-layer copy of the same logic.
 */
export const reportTemplates = pgTable(
  "report_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id),
    // Validated server-side against the fixed report catalog
    // (`apps/api/src/domain/reports/types.ts`'s `REPORT_DEFINITIONS`) —
    // plain `text`, not a `pgEnum`, mirroring `configuration_entries.domain`'s
    // own "free-form text, application-validated allow-list" precedent, so a
    // future report can be added without a schema migration.
    reportId: text("report_id").notNull(),
    name: text("name").notNull(),
    // The report's own pre-declared filter values this template saves
    // (never arbitrary SQL/field/table names — see the reports domain's own
    // doc comment on why the builder stays field-selection-over-a-fixed-
    // report rather than a dynamic query engine).
    filters: jsonb("filters").notNull().default({}),
    // Which of the report's own pre-declared columns this template selects
    // — an array of field ids, validated server-side against that report's
    // own `availableFields` list on every write.
    selectedFields: jsonb("selected_fields").notNull().default([]),
    isFavorite: boolean("is_favorite").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("report_templates_staff_name_key").on(t.staffId, t.name),
    index("report_templates_staff_id_idx").on(t.staffId),
    index("report_templates_report_id_idx").on(t.reportId),
  ],
).enableRLS();

export const reportExecutions = pgTable(
  "report_executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: text("report_id").notNull(),
    requestedByStaffId: uuid("requested_by_staff_id")
      .notNull()
      .references(() => staff.id),
    // The requesting staff member's own hostel at generation time — null for
    // an unscoped `super_admin` request, matching every other report's own
    // scope-resolution shape. Snapshot, not a live join: a later hostel
    // reassignment must not silently rewrite past history.
    hostelScopeId: uuid("hostel_scope_id").references(() => hostels.id),
    filtersSummary: jsonb("filters_summary").notNull().default({}),
    rowCount: integer("row_count").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("report_executions_staff_generated_idx").on(t.requestedByStaffId, t.generatedAt),
    index("report_executions_report_id_idx").on(t.reportId),
  ],
).enableRLS();
