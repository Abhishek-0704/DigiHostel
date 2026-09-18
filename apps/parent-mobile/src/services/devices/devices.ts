import { Platform } from "react-native";
import {
  requestDeviceChallenge,
  registerDevice as registerDeviceRequest,
} from "@digihostel/api-client-react";
import { getSupabaseClient } from "../supabase/client";
import { deviceIdentityService } from "../deviceIdentity/deviceIdentity";
import { getGoogleCloudProjectNumber } from "../../config/env";
import { DeviceServiceNotImplementedError } from "./deviceServiceErrors";
import {
  orchestrateAndroidDeviceRegistration,
  DeviceAttestationNotConfiguredError,
} from "./registerDeviceOrchestration";
import PlayIntegrityModule from "../../../modules/play-integrity/src/DigihostelPlayIntegrityModule";

export { DeviceServiceNotImplementedError } from "./deviceServiceErrors";

/**
 * Trusted-device service (Prompt 2 foundation; extended in Prompt 3;
 * extended again in Prompt 4B for device-management presentation; ADR-003
 * implementation task — real registerCurrentDevice()).
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
 * `registerCurrentDevice()` is now REAL on Android: it performs the full
 * server-controlled flow (ADR-003 implementation task §6/§10) —
 *   1. POST /devices/challenge — obtain a server-issued, single-use nonce.
 *   2. Native Play Integrity call, bound to that exact nonce.
 *   3. POST /devices/register — submit the resulting token; the backend
 *      (apps/api/src/domain/device/) verifies it server-side and only THEN
 *      creates the trusted_devices row. This app never writes to
 *      trusted_devices directly — there is still no INSERT policy granting
 *      `authenticated` that access at all (F-01 remediation,
 *      `supabase/migrations/0003_f01_trusted_devices_rls_remediation.sql`),
 *      matching this table's own schema comment.
 * On iOS/web, or if the native call/network call fails for any reason, this
 * throws — never falls back to a locally-declared trust state. iOS App
 * Attest is a separate, not-yet-implemented integration (see the ADR-003
 * implementation report's "iOS Attestation Status" section).
 *
 * `revokeDevice()` remains unimplemented (Prompt 4B, unchanged by this
 * task): revoking one's own device only *reduces* access and could, in
 * principle, be a direct RLS-scoped UPDATE via `trusted_devices_revoke_own`
 * — but a raw client UPDATE would let this app revoke a device with no audit
 * trail, no confirmation the backend has consistent state, and no
 * coordination with `device_attestation_events`. It stays fail-closed until
 * a real, backend-owned removal endpoint exists (tracked the same way
 * registration used to be — see docs/authentication.md §15).
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
   * not a hardcoded value. */
  isCurrentDevice: boolean;
}

export interface DeviceService {
  /** Cheap, real, RLS-backed check: does the current parent have at least
   * one non-revoked trusted device? Used by AuthContext to decide between
   * "authenticated" and "device_verification_required" — a UX routing
   * signal only, never itself the authorization decision. */
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

  async registerCurrentDevice() {
    if (Platform.OS !== "android") {
      // iOS App Attest/DeviceCheck is a separate, not-yet-implemented
      // integration — see the ADR-003 implementation report. Honest
      // fail-closed, not a fabricated success.
      throw new DeviceServiceNotImplementedError("registration");
    }

    let device;
    try {
      device = await orchestrateAndroidDeviceRegistration({
        requestChallenge: (platform) => requestDeviceChallenge({ platform }),
        requestIntegrityToken: (nonce, cloudProjectNumber) =>
          PlayIntegrityModule.requestIntegrityToken(nonce, cloudProjectNumber),
        submitRegistration: (input) => registerDeviceRequest(input),
        getInstallationId: () => deviceIdentityService.getInstallationId(),
        getCloudProjectNumber: getGoogleCloudProjectNumber,
      });
    } catch (err) {
      if (err instanceof DeviceAttestationNotConfiguredError) {
        // No Google Play Console/Cloud Project exists in this environment
        // yet (see the ADR-003 implementation report) — surfaced as the same
        // honest "not implemented" error the caller already knows how to
        // handle, rather than a new, undocumented failure mode.
        throw new DeviceServiceNotImplementedError("registration");
      }
      throw err;
    }

    return {
      id: device.id,
      platform: device.platform,
      registeredAt: device.registeredAt,
      revokedAt: null,
      revokedReason: null,
      isCurrentDevice: true,
    };
  },

  async revokeDevice(): Promise<never> {
    throw new DeviceServiceNotImplementedError("removal");
  },
};
