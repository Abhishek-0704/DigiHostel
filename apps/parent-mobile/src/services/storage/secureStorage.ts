import * as SecureStore from "expo-secure-store";

/**
 * Secure local storage abstraction (Prompt 2 foundation) — wraps
 * `expo-secure-store` (iOS Keychain / Android Keystore-backed), per
 * docs/auth-database-security-model.md §19's documented expectation that
 * session material is persisted via SecureStore, not AsyncStorage/plain
 * storage.
 *
 * This is generic key/value infrastructure only. It does not know about
 * Supabase sessions, auth tokens, or any specific stored value — callers
 * (e.g. the future Supabase client's storage adapter) supply their own keys
 * from src/constants/storageKeys.ts.
 */
export interface SecureStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const secureStorage: SecureStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};
