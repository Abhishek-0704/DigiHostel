import type { TrustedDeviceSummary } from "../../services/devices/devices";

/**
 * Pure device-status/destructive-action logic (Prompt 4B) — no React/RN
 * import, independently unit-tested.
 */

export type DeviceTrustState = "active" | "revoked";

export function getDeviceTrustState(device: TrustedDeviceSummary): DeviceTrustState {
  return device.revokedAt === null ? "active" : "revoked";
}

/** A device can only be offered for removal/replacement while it's still
 * active — an already-revoked device has nothing left to remove, and
 * "replacing" it would really mean registering a new one (a separate,
 * unimplemented flow), not acting on this row. */
export function canRemoveDevice(device: TrustedDeviceSummary): boolean {
  return getDeviceTrustState(device) === "active";
}

export function canReplaceDevice(device: TrustedDeviceSummary): boolean {
  return getDeviceTrustState(device) === "active";
}
