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
    // Nullable: a device is trusted (registered) before push permission is
    // necessarily granted/obtained on it. Populated by the parent-mobile app's
    // own device-registration flow (ADR-004/ADR-001 — out of scope here); the
    // notification worker (ADR-018) simply finds none until that flow exists.
    expoPushToken: text("expo_push_token"),
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
    // No INSERT policy is granted to `authenticated` here — deliberately,
    // per the PRR F-01 remediation. `docs/rls-policy-matrix.md` always
    // documented device creation as "post-attestation, via Fastify-mediated
    // flow, not a raw client insert," but the previous
    // `trusted_devices_insert_own` policy (WITH CHECK parent_id = caller
    // only) did not actually enforce that — it let any authenticated parent
    // self-insert a fully active device row with no attestation whatsoever,
    // directly defeating `requireActiveTrustedDevice()`'s purpose. A real,
    // attestation-gated registration flow now exists (ADR-003 implementation
    // — `apps/api/src/domain/device/`), and it writes through the backend's
    // own privileged connection exactly as anticipated here (which bypasses
    // RLS by design, exactly like `device_attestation_events`' insert path
    // below), never through a client-facing RLS policy — RLS cannot itself
    // verify a Play Integrity/App Attest result, so no `authenticated`-role
    // INSERT policy on this table can ever be correct, regardless of what
    // registration capability exists above the database layer.
    //
    // Self-revocation (below) is the only authenticated-client mutation
    // this table now permits, and it is restricted to the one-way
    // active -> revoked transition, on `revoked_at`/`revoked_reason` only.
    pgPolicy("trusted_devices_revoke_own", {
      for: "update",
      to: authenticatedRole,
      // Can only act on a currently-active row of your own — an
      // already-revoked device is a dead end for this policy, so there is
      // nothing left for a client to legitimately do to it.
      using: sql`${t.parentId} = ${callerParentId} and ${t.revokedAt} is null`,
      // The resulting row must belong to the same parent (ownership can
      // never change) and must be revoked (never un-revoked back to
      // active) — a one-way transition, never the reverse. Column-level
      // protection (device_fingerprint/platform/expo_push_token/parent_id
      // cannot be smuggled into this same UPDATE) is enforced by the
      // `trusted_devices_revoke_only` trigger (see the companion migration
      // SQL for F-01 — Drizzle's schema DSL has no trigger primitive).
      withCheck: sql`${t.parentId} = ${callerParentId} and ${t.revokedAt} is not null`,
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

// ADR-003 implementation — device-registration challenge/nonce storage.
// Purely backend-internal: a client never reads or writes this table
// directly (no policy grants any access to `authenticated` at all, matching
// `audit_logs`' own "no client role, ever" pattern) — the client only ever
// learns the nonce via the `POST /devices/challenge` HTTP response body, and
// the backend's own privileged connection (bypasses RLS by design) is the
// only writer, exactly like `device_attestation_events` above.
//
// Deliberately a distinct table from `trusted_devices`/`device_attestation_events`
// rather than a "pending" sub-state on `trusted_devices`: a rejected/expired
// challenge must never create a `trusted_devices` row at all (that table's
// mere existence, revoked or not, currently has meaning elsewhere — e.g.
// `isCurrentDevice` fingerprint matching), and `device_attestation_events`'s
// `trusted_device_id` FK is NOT NULL, so it structurally cannot record a
// pre-device-creation attempt. Failed/expired challenges are recorded in
// `audit_logs` instead (action `device_attestation_rejected` /
// `device_registration_challenge_expired`), never here or in
// `device_attestation_events`.
export const deviceRegistrationChallenges = pgTable(
  "device_registration_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentId: uuid("parent_id")
      .notNull()
      .references(() => parents.id),
    platform: devicePlatform("platform").notNull(),
    // Cryptographically random, base64url-encoded — bound into the Play
    // Integrity/App Attest request itself so a token obtained for one
    // challenge cannot be replayed against another (§6/§17 of the ADR-003
    // implementation task).
    nonce: text("nonce").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Short-lived by policy (apps/api/src/config/deviceAttestation.ts) — a
    // stale challenge must never be usable, per the fail-closed requirement.
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    // Set exactly once, on the single attempt to redeem this challenge
    // (success OR failure) — enforces single-use regardless of outcome, so a
    // rejected attestation cannot simply be retried against the same nonce.
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (t) => [
    index("drc_parent_id_idx").on(t.parentId),
    index("drc_expires_at_idx").on(t.expiresAt),
    // No pgPolicy entries at all — see the table-level comment above.
  ],
).enableRLS();
