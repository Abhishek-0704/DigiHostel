import { randomUUID } from "expo-crypto";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { secureStorage } from "../storage/secureStorage";
import { STORAGE_KEYS } from "../../constants/storageKeys";

/**
 * Device-identity abstraction (Prompt 3). Provides only what a future
 * device-registration endpoint would plausibly need — nothing more.
 *
 * Deliberately does NOT collect: IMEI, serial number, MAC address, Android
 * ID, or iOS identifierForVendor — none of those are used anywhere in this
 * file. The "device fingerprint" this app can offer is a random,
 * app-generated UUID, persisted locally, with no relationship to the
 * physical hardware at all (uninstalling and reinstalling the app produces
 * a new one — this is a feature, not a bug, for privacy). This matches
 * `packages/db/src/schema/device.ts`'s own `device_fingerprint` column,
 * which the schema documents as client-supplied, not server-derived.
 *
 * This abstraction is intentionally swappable: nothing outside this file
 * needs to change if the identifier-generation strategy changes later.
 */
export interface DeviceMetadata {
  installationId: string;
  platform: "ios" | "android" | "web";
  appVersion: string | null;
  osVersion: string | null;
}

async function getOrCreateInstallationId(): Promise<string> {
  const existing = await secureStorage.getItem(STORAGE_KEYS.deviceInstallationId);
  if (existing) return existing;

  const generated = randomUUID();
  await secureStorage.setItem(STORAGE_KEYS.deviceInstallationId, generated);
  return generated;
}

export interface DeviceIdentityService {
  getInstallationId(): Promise<string>;
  getMetadata(): Promise<DeviceMetadata>;
}

export const deviceIdentityService: DeviceIdentityService = {
  getInstallationId: getOrCreateInstallationId,
  async getMetadata() {
    return {
      installationId: await getOrCreateInstallationId(),
      platform: Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web",
      appVersion: Constants.expoConfig?.version ?? null,
      osVersion: Platform.Version ? String(Platform.Version) : null,
    };
  },
};
