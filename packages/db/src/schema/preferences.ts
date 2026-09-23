import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  jsonb,
  boolean,
  timestamp,
  uniqueIndex,
  check,
  pgPolicy,
} from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { staff } from "./identity.js";
import { callerStaffId } from "./rls-helpers.js";

// Phase 7, Prompt 17 — Administrative Profile & Personal Preferences Center.
//
// ONE table, not five (notification_preferences/dashboard_preferences/
// accessibility_preferences/personal_shortcuts as separate tables) — this
// row is always read and written as a single coherent unit (the whole
// Settings page loads/saves together), and 1:1-with-staff, single-row-per-
// owner data has no independent per-category lifecycle that would justify
// fragmentation (mirrors `configuration_entries`'s own "one generic table,
// not four" precedent, Prompt 14). Named, typed columns are used for
// settings with a small closed set of valid values (theme/density/
// font_scale/date_format/preferred_contact_method — CHECK-constrained, not
// a proliferation of single-use pgEnum types); `jsonb` is used only for the
// three genuinely open-ended, extensible shapes (notification category
// preferences, dashboard widget/filter preferences, the shortcuts list) —
// application-layer-validated on every write (domain/profile/types.ts),
// never a generic untyped key-value bag.
//
// Deliberately NO `isSuperAdmin`/`isHostelAdmin` bypass policy — unlike
// `staff` (an identity record `super_admin` legitimately administers),
// this table holds ONLY personal workspace preferences with no
// administrative meaning to anyone but their owner. No role in this
// application has a legitimate product reason to read or write another
// staff member's personal preferences; granting one "for consistency"
// would itself be the backdoor-into-enterprise-administration this
// feature's own architecture explicitly forbids. RLS therefore grants
// exactly three self-only policies and nothing else — verified adversarially
// by supabase/tests/database/29_prompt17_staff_preferences_rls.sql.
export const staffPreferences = pgTable(
  "staff_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id")
      .notNull()
      .unique()
      .references(() => staff.id, { onDelete: "cascade" }),
    // Personal contact fields — deliberately NOT on `staff` itself (which
    // remains an identity/authorization record administered via Identity &
    // Access Administration, Prompt 13). None of these carry any
    // authorization meaning.
    phoneNumber: text("phone_number"),
    officeLocation: text("office_location"),
    bio: text("bio"),
    preferredContactMethod: text("preferred_contact_method").notNull().default("email"),
    // Display/theme — ThemeContext.tsx's own pre-existing doc comment
    // ("no manual override UI yet — that belongs to a future Settings
    // page") names exactly this column as its missing persistence layer.
    theme: text("theme").notNull().default("system"),
    density: text("density").notNull().default("comfortable"),
    fontScale: text("font_scale").notNull().default("default"),
    dateFormat: text("date_format").notNull().default("DD_MM_YYYY"),
    reducedMotion: boolean("reduced_motion").notNull().default(false),
    highContrast: boolean("high_contrast").notNull().default(false),
    defaultLandingPage: text("default_landing_page").notNull().default("dashboard"),
    // Advisory only — never gates delivery of a mandatory safety/security
    // category (enforced in domain/profile/service.ts, not here; see that
    // file's MANDATORY_NOTIFICATION_CATEGORIES). No notification-delivery
    // mechanism reads this column today (this app has no staff-facing
    // notification producer at all — docs/current-state.md's own
    // long-standing, unchanged finding) — STORED, RUNTIME CONSUMPTION
    // DEFERRED, matching Configuration Center's identical honesty
    // convention, never claimed as live-consumed.
    notificationPreferences: jsonb("notification_preferences").notNull().default({}),
    dashboardPreferences: jsonb("dashboard_preferences").notNull().default({}),
    shortcuts: jsonb("shortcuts").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("staff_preferences_staff_id_key").on(t.staffId),

    check(
      "staff_preferences_preferred_contact_method_check",
      sql`${t.preferredContactMethod} in ('email', 'phone', 'in_app')`,
    ),
    check("staff_preferences_theme_check", sql`${t.theme} in ('light', 'dark', 'system')`),
    check("staff_preferences_density_check", sql`${t.density} in ('comfortable', 'compact')`),
    check(
      "staff_preferences_font_scale_check",
      sql`${t.fontScale} in ('default', 'large', 'larger')`,
    ),
    check(
      "staff_preferences_date_format_check",
      sql`${t.dateFormat} in ('DD_MM_YYYY', 'MM_DD_YYYY', 'YYYY_MM_DD')`,
    ),

    pgPolicy("staff_preferences_select_own", {
      for: "select",
      to: authenticatedRole,
      using: sql`${t.staffId} = ${callerStaffId}`,
    }),
    pgPolicy("staff_preferences_insert_own", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${t.staffId} = ${callerStaffId}`,
    }),
    pgPolicy("staff_preferences_update_own", {
      for: "update",
      to: authenticatedRole,
      using: sql`${t.staffId} = ${callerStaffId}`,
      withCheck: sql`${t.staffId} = ${callerStaffId}`,
    }),
  ],
).enableRLS();
