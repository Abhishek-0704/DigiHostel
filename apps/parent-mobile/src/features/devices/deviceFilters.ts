import type { TrustedDeviceSummary } from "../../services/devices/devices";
import { getDeviceTrustState } from "./deviceStatus";

/**
 * Pure, client-side device-list filtering/sorting (Prompt 6) — no React/RN
 * import, independently unit-tested.
 *
 * This exists as prepared architecture, not a wired-up search/filter UI:
 * the current device list is small and the backend has no server-side
 * query/filter support to integrate with (a raw RLS-scoped `select` — see
 * `devices.ts`), so building a full search/filter/sort UI now would be the
 * "unnecessary complexity" this prompt's own instructions warn against.
 * These functions operate on an already-fully-loaded, authoritative
 * collection (never a partial page) — exactly the "client-side filtering
 * on an already-loaded collection is acceptable" case that same guidance
 * permits. A future screen can compose these without any change here.
 */

export type DeviceStatusFilter = "all" | "active" | "revoked";
export type DevicePlatformFilter = "all" | "ios" | "android";
export type DeviceSortOrder = "registered-desc" | "registered-asc" | "current-first";

export interface DeviceFilterOptions {
  status?: DeviceStatusFilter;
  platform?: DevicePlatformFilter;
}

export function filterDevices(
  devices: TrustedDeviceSummary[],
  options: DeviceFilterOptions = {},
): TrustedDeviceSummary[] {
  const status = options.status ?? "all";
  const platform = options.platform ?? "all";
  return devices.filter((device) => {
    const trustState = getDeviceTrustState(device);
    if (status === "active" && trustState !== "active") return false;
    if (status === "revoked" && trustState !== "revoked") return false;
    if (platform !== "all" && device.platform !== platform) return false;
    return true;
  });
}

/** Registered-date comparisons are string-lexicographic on ISO timestamps
 * (safe and correct for this format — no Date parsing needed). */
export function sortDevices(
  devices: TrustedDeviceSummary[],
  order: DeviceSortOrder,
): TrustedDeviceSummary[] {
  const copy = [...devices];
  switch (order) {
    case "registered-desc":
      return copy.sort((a, b) => b.registeredAt.localeCompare(a.registeredAt));
    case "registered-asc":
      return copy.sort((a, b) => a.registeredAt.localeCompare(b.registeredAt));
    case "current-first":
      return copy.sort((a, b) => Number(b.isCurrentDevice) - Number(a.isCurrentDevice));
  }
}
