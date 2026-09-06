import { secureStorage } from "../storage/secureStorage";
import { STORAGE_KEYS } from "../../constants/storageKeys";

/**
 * Local biometric-enabled preference (Prompt 5) — the ONLY thing persisted
 * for biometric authentication anywhere in this app. A plain boolean flag,
 * stored via the existing SecureStore-backed `secureStorage` abstraction
 * (no new persistence layer). Never a biometric template, credential, or
 * platform authentication payload — `expo-local-authentication` never
 * exposes any of those to this app in the first place, so there is nothing
 * of that kind this module could persist even if it tried.
 *
 * This preference is a LOCAL UX signal only ("has this user opted in to
 * biometric step-up on this installation") — it is never read by the
 * backend and never itself grants access to anything. See
 * `docs/authentication.md` §16 for the full state-boundary explanation.
 */
export interface BiometricPreferenceService {
  isEnabled(): Promise<boolean>;
  setEnabled(enabled: boolean): Promise<void>;
}

export const biometricPreferenceService: BiometricPreferenceService = {
  async isEnabled() {
    const value = await secureStorage.getItem(STORAGE_KEYS.biometricEnabled);
    return value === "true";
  },
  async setEnabled(enabled) {
    if (enabled) {
      await secureStorage.setItem(STORAGE_KEYS.biometricEnabled, "true");
    } else {
      await secureStorage.removeItem(STORAGE_KEYS.biometricEnabled);
    }
  },
};
