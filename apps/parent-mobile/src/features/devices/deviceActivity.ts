/**
 * Device Activity Timeline content (Prompt 6) — honest "unavailable" copy,
 * not a fabricated event feed.
 *
 * Repository reconnaissance confirmed there is no backend data source this
 * app can read for the event types a device activity timeline would need
 * (device registered/verified, biometric enabled/disabled, replaced,
 * removed, authenticated, session restored/expired, revoked):
 *
 * - `audit_logs` (`packages/db/src/schema/audit.ts`) has ZERO RLS policies
 *   for the `authenticated` role — no SELECT grant exists for any client
 *   role at all. Only Fastify's service-role connection (which bypasses
 *   RLS entirely) can read it. This is not a gap in this app's query code;
 *   the database itself does not permit a mobile client to read this table,
 *   by design (`packages/db/src/schema/audit.ts`'s own comment: "Deliberately
 *   NO policies at all for any client role").
 * - `device_attestation_events` IS readable by the owning parent
 *   (`dae_select_own` — `packages/db/src/schema/device.ts`), but it only
 *   ever records attestation pass/fail checks, not the general event types
 *   above — and since ADR-003 attestation is unimplemented (see
 *   docs/current-state.md's G-04), nothing has ever written a row to it
 *   either. Wiring up a real query against it would be technically real
 *   but would always return zero rows and would misrepresent a narrow,
 *   unrelated table as "the" activity feed.
 *
 * Neither table can honestly back the feature this section's name implies.
 * This is therefore an authoritative "unavailable" state, not a loading
 * state, not an empty-but-queryable state — there is nothing to query.
 */
export const DEVICE_ACTIVITY_UNAVAILABLE = {
  title: "Activity history isn't available yet",
  description:
    "DigiHostel doesn't yet keep a history of activity for this device. This will appear here once that capability is added.",
} as const;
