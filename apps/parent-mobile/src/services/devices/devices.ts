import { getSupabaseClient } from "../supabase/client";
import { deviceIdentityService } from "../deviceIdentity/deviceIdentity";
import { DeviceServiceNotImplementedError } from "./deviceServiceErrors";

export { DeviceServiceNotImplementedError } from "./deviceServiceErrors";

/**
 * Trusted-device service (Prompt 2 foundation; extended in Prompt 3;
 * extended again in Prompt 4B for device-management presentation).
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
 * device is marked trusted. There is no longer even an RLS policy that
 * would let this app self-INSERT a `trusted_devices` row — `authenticated`
 * has no INSERT policy on this table at all (PRR Phase 13, Finding F-01
 * remediation: the previous `trusted_devices_insert_own` policy let any
 * authenticated parent self-insert a fully active row with no attestation
 * check, which this comment used to (accurately, at the time) call "technically
 * permissive" — it has since been removed, `supabase/migrations/0003_f01_trusted_devices_rls_remediation.sql`).
 * Real device registration, once implemented, must go through the backend's
 * own privileged connection after verifying attestation server-side — RLS
 * cannot verify a Play Integrity/App Attest result, so no client-facing
 * INSERT policy on this table can ever be correct. This stays unimplemented
 * until a real attestation-verification integration point exists (backend
 * and/or mobile SDK work neither of which exists yet — see docs/current-state.md).
 *
 * `revokeDevice()` also remains unimplemented (Prompt 4B): revoking one's
 * own device only *reduces* access and could, in principle, be a direct
 * RLS-scoped UPDATE via `trusted_devices_revoke_own` — but a raw client
 * UPDATE would let this app revoke a device with no audit trail, no
 * confirmation the backend has consistent state, and no coordination with
 * `device_attestation_events`. Implementing it as a bare UPDATE here would
 * be exactly the kind of "backend security logic in the client" Prompt 4B's
 * own instructions forbid inventing. It stays fail-closed until a real,
 * backend-owned removal endpoint exists (tracked the same way as
 * registration — see docs/authentication.md §15).
 */

export type DeviceTrustState = "active" | "revoked";

export interface TrustedDeviceSummary {
  id: string;
  platform: "ios" | "android";
  registeredAt: string;
  /** Null for an active device. */
  revokedAt: string | null;
  /** Null for an active device, or a revoked device with no reason on record. */
  revokedReason: string | null;
  /** True only when this row's stored `device_fingerprint` matches this
   * installation's own id (`deviceIdentityService`) — a real comparison,
   * not a hardcoded value. Will be false for every device until a real
   * registration flow exists to ever set a matching fingerprint (see
   * `registerCurrentDevice` above) — that is expected, not a bug. */
  isCurrentDevice: boolean;
}

export interface DeviceService {
  /** Cheap, real, RLS-backed check: does the current parent have at least
   * one non-revoked trusted device? Used by AuthContext to decide between
   * "authenticated" and "device_verification_required" — a UX routing
   * signal only, never itself a grant of access to a protected operation. */
  hasActiveTrustedDevice(): Promise<boolean>;
  /** Real, RLS-backed list of every trusted-device row belonging to the
   * current parent — active AND revoked, newest first. Revoked rows are
   * included deliberately (unlike `hasActiveTrustedDevice`) so a
   * device-management UI can show real history rather than silently
   * hiding a device the moment it's revoked. */
  listTrustedDevices(): Promise<TrustedDeviceSummary[]>;
  registerCurrentDevice(): Promise<TrustedDeviceSummary>;
  revokeDevice(deviceId: string): Promise<void>;
}

interface TrustedDeviceRow {
  id: string;
  platform: string;
  registered_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
  device_fingerprint: string;
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
    const [{ data, error }, currentInstallationId] = await Promise.all([
      getSupabaseClient()
        .from("trusted_devices")
        .select("id, platform, registered_at, revoked_at, revoked_reason, device_fingerprint")
        .order("registered_at", { ascending: false }),
      deviceIdentityService.getInstallationId(),
    ]);
    if (error) throw error;
    return ((data ?? []) as TrustedDeviceRow[]).map((row) => ({
      id: row.id,
      platform: row.platform === "ios" ? "ios" : "android",
      registeredAt: row.registered_at,
      revokedAt: row.revoked_at,
      revokedReason: row.revoked_reason,
      isCurrentDevice: row.device_fingerprint === currentInstallationId,
    }));
  },

  async registerCurrentDevice(): Promise<never> {
    throw new DeviceServiceNotImplementedError("registration");
  },

  async revokeDevice(): Promise<never> {
    throw new DeviceServiceNotImplementedError("removal");
  },
};
