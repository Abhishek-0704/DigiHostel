import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map<string, string>();
vi.mock("../storage/secureStorage", () => ({
  secureStorage: {
    getItem: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
  },
}));

const { biometricPreferenceService } = await import("./biometricPreference");
const { STORAGE_KEYS } = await import("../../constants/storageKeys");

describe("biometricPreferenceService", () => {
  beforeEach(() => {
    store.clear();
  });

  it("isEnabled() returns false when nothing has been persisted (safe default)", async () => {
    await expect(biometricPreferenceService.isEnabled()).resolves.toBe(false);
  });

  it("setEnabled(true) persists the preference, then isEnabled() reflects it — restoration round-trips correctly", async () => {
    await biometricPreferenceService.setEnabled(true);
    expect(store.get(STORAGE_KEYS.biometricEnabled)).toBe("true");
    await expect(biometricPreferenceService.isEnabled()).resolves.toBe(true);
  });

  it("setEnabled(false) clears the stored key entirely rather than writing a 'false' string", async () => {
    await biometricPreferenceService.setEnabled(true);
    await biometricPreferenceService.setEnabled(false);
    expect(store.has(STORAGE_KEYS.biometricEnabled)).toBe(false);
    await expect(biometricPreferenceService.isEnabled()).resolves.toBe(false);
  });

  it("persists only the plain string 'true' — never a JSON blob or any structured/sensitive payload", async () => {
    await biometricPreferenceService.setEnabled(true);
    expect(store.get(STORAGE_KEYS.biometricEnabled)).toBe("true");
    expect(store.size).toBe(1);
  });
});
