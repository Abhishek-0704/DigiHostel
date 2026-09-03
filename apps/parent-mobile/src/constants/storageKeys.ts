/**
 * Central registry of secure-storage keys (Prompt 2 foundation). Prevents
 * key-name collisions/typos across features — every feature that needs
 * secure storage adds its key here rather than inlining a string literal
 * at the call site.
 */
export const STORAGE_KEYS = {
  /** NOT directly read/written by application code — Supabase's own SDK
   * manages its own internal key name(s) via the `storage` adapter passed
   * to `createClient` (src/services/supabase/client.ts); this constant is
   * kept only as a documentation anchor for "this is where the session
   * lives," not an actual lookup key. */
  supabaseSession: "digihostel.parent.supabase-session",
  themePreference: "digihostel.parent.theme-preference",
  /** App-generated installation identifier (Prompt 3) — see
   * src/services/deviceIdentity/deviceIdentity.ts. Never a hardware
   * identifier (no IMEI/serial/MAC), never sent anywhere until a real
   * device-registration endpoint exists. */
  deviceInstallationId: "digihostel.parent.device-installation-id",
} as const;
