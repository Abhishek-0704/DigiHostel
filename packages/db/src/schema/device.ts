import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, uniqueIndex, index, pgPolicy } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { devicePlatform, attestationProvider, attestationResult } from "./enums.js";
import { parents } from "./identity.js";
import { callerParentId, isSuperAdmin } from "./rls-helpers.js";

// docs/database-schema-design.md — Device/Security Domain.
// No raw biometric data is stored anywhere in this schema — biometric
// confirmation is a boolean+timestamp assertion on the relevant event row
// (leave_approval_events.biometricConfirmed, journeyEvents.biometricConfirmed),
// never a template/image/vendor payload.

export const trustedDevices = pgTable(
  "trusted_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentId: uuid("parent_id")
      .notNull()
      .references(() => parents.id),
    platform: devicePlatform("platform").notNull(),
    deviceFingerprint: text("device_fingerprint").notNull(),
    registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: text("revoked_reason"),
  },
  (t) => [
    uniqueIndex("trusted_devices_parent_fingerprint_key").on(t.parentId, t.deviceFingerprint),
    index("trusted_devices_parent_id_idx").on(t.parentId),
    index("trusted_devices_active_idx")
      .on(t.parentId)
      .where(sql`${t.revokedAt} is null`),

    pgPolicy("trusted_devices_select_own", {
      for: "select",
      to: authenticatedRole,
      using: sql`${t.parentId} = ${callerParentId}`,
    }),
    pgPolicy("trusted_devices_insert_own", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${t.parentId} = ${callerParentId}`,
    }),
    pgPolicy("trusted_devices_revoke_own", {
      for: "update",
      to: authenticatedRole,
      using: sql`${t.parentId} = ${callerParentId}`,
      withCheck: sql`${t.parentId} = ${callerParentId}`,
    }),
    pgPolicy("trusted_devices_all_super_admin", {
      for: "all",
      to: authenticatedRole,
      using: isSuperAdmin,
      withCheck: isSuperAdmin,
    }),
  ],
).enableRLS();

export const deviceAttestationEvents = pgTable(
  "device_attestation_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trustedDeviceId: uuid("trusted_device_id")
      .notNull()
      .references(() => trustedDevices.id),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
    result: attestationResult("result").notNull(),
    provider: attestationProvider("provider").notNull(),
  },
  (t) => [
    index("dae_trusted_device_id_idx").on(t.trustedDeviceId),
    index("dae_checked_at_idx").on(t.checkedAt),

    // Insert-only, backend-authored (Fastify service-role bypasses RLS
    // entirely) — no INSERT policy is granted to any client role here.
    pgPolicy("dae_select_own", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from ${trustedDevices} td where td.id = ${t.trustedDeviceId} and td.parent_id = ${callerParentId})`,
    }),
  ],
).enableRLS();
