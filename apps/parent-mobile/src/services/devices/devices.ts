import { getSupabaseClient } from "../supabase/client";

/**
 * Trusted-device service (Prompt 2 foundation; extended in Prompt 3).
 *
 * `hasActiveTrustedDevice()` and `listTrustedDevices()` are REAL — they
 * read `trusted_devices` directly via the Supabase client, relying entirely
 * on that table's own RLS policies (`trusted_devices_select_own`,
 * `supabase/migrations/0000_cute_korvac.sql:370` — `parent_id =
 * current_parent_id()`) to scope results to the caller's own rows. This is
 * the same read-only pattern this table's own schema comment documents as
 * intended (`packages/db/src/schema/device.ts`), and mirrors exactly what
 * the backend's own `requireActiveTrustedDevice` guard checks
 * (`apps/api/src/lib/auth/db-port.ts`'s `hasActiveTrustedDevice`) — this is
 * a read-only UX signal for routing, never itself the authorization
 * decision. The backend independently re-checks device trust on every
 * approve/reject call regardless of what this returns.
 *
 * `registerCurrentDevice()` remains fail-closed and unimplemented: ADR-003
 * requires platform attestation (Play Integrity / App Attest) *before* a
 * device is marked trusted, and RLS's `trusted_devices_insert_own` policy
 * — while technically permissive — has no way to verify attestation
 * happened. Implementing registration as a raw INSERT would let this app
 * mark itself trusted without ever satisfying ADR-003's mandatory gate;
 * that is exactly the "fabricate a successful registration" failure mode
 * this prompt's G-04 constraint forbids. This stays unimplemented until a
 * real attestation-verification integration point exists (backend and/or
 * mobile SDK work neither of which exists yet — see docs/current-state.md).
 *
 * `revokeDevice()` also remains unimplemented in this prompt — not because
 * it's unsafe (revoking one's own device only *reduces* access and could,
 * in principle, be a direct RLS-scoped UPDATE via `trusted_devices_revoke_own`),
 * but because "Full Device Management" is explicitly Prompt 6's scope, not
 * this one's. Documented here as a scoping decision, not a technical block.
 */

export interface TrustedDeviceSummary {
  id: string;
  platform: "ios" | "android";
  registeredAt: string;
  isCurrentDevice: boolean;
}

export interface DeviceService {
  /** Cheap, real, RLS-backed check: does the current parent have at least
   * one non-revoked trusted device? Used by AuthContext to decide between
   * "authenticated" and "device_verification_required" — a UX routing
   * signal only, never itself a grant of access to a protected operation. */
  hasActiveTrustedDevice(): Promise<boolean>;
  /** Real, RLS-backed list of the current parent's trusted devices.
   * `isCurrentDevice` is always false today — no device this app is running
   * on has ever been registered (registration is unimplemented), so there
   * is nothing yet to match against `deviceIdentityService`'s installation id. */
  listTrustedDevices(): Promise<TrustedDeviceSummary[]>;
  registerCurrentDevice(): Promise<TrustedDeviceSummary>;
  revokeDevice(deviceId: string): Promise<void>;
}

export class DeviceServiceNotImplementedError extends Error {
  constructor(operation: string) {
    super(
      `Trusted-device ${operation} is not implemented yet in the Parent app. ` +
        "See docs/current-state.md's G-04 status and apps/parent-mobile/docs/authentication.md.",
    );
    this.name = "DeviceServiceNotImplementedError";
  }
}

interface TrustedDeviceRow {
  id: string;
  platform: string;
  registered_at: string;
}

export const deviceService: DeviceService = {
  async hasActiveTrustedDevice() {
    const { data, error } = await getSupabaseClient()
      .from("trusted_devices")
      .select("id")
      .is("revoked_at", null)
      .limit(1);
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  },

  async listTrustedDevices() {
    const { data, error } = await getSupabaseClient()
      .from("trusted_devices")
      .select("id, platform, registered_at")
      .is("revoked_at", null)
      .order("registered_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as TrustedDeviceRow[]).map((row) => ({
      id: row.id,
      platform: row.platform === "ios" ? "ios" : "android",
      registeredAt: row.registered_at,
      isCurrentDevice: false,
    }));
  },

  async registerCurrentDevice(): Promise<never> {
    throw new DeviceServiceNotImplementedError("registration");
  },

  async revokeDevice(): Promise<never> {
    throw new DeviceServiceNotImplementedError("revocation (Prompt 6 scope)");
  },
};
