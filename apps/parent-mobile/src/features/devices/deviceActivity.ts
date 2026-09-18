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
 *   (`dae_select_own` — `packages/db/src/schema/device.ts`), and — since the
 *   ADR-003 implementation task — a real "pass" row is now written on every
 *   successful Android device registration (`DrizzleTrustedDeviceRepository
 *   .createTrustedDevice()`, `apps/api/src/domain/device/`). It still only
 *   ever records attestation pass/fail checks, not the general event types
 *   above (biometric enabled/disabled, replaced, removed, authenticated,
 *   session restored/expired, revoked) — so wiring up a real query against
 *   it today would be technically real but would misrepresent one narrow
 *   event type as "the" activity feed, not fabricate data. Building a genuine
 *   multi-event-type activity timeline remains out of scope, unchanged by
 *   the ADR-003 work.
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
