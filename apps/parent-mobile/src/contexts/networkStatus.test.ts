import { describe, expect, it } from "vitest";
import { deriveStatus } from "./networkStatus";

describe("deriveStatus", () => {
  it("is unknown when isConnected itself is still unknown", () => {
    expect(deriveStatus({ isConnected: null, isInternetReachable: null })).toBe("unknown");
  });

  it("is offline when isConnected is false", () => {
    expect(deriveStatus({ isConnected: false, isInternetReachable: null })).toBe("offline");
  });

  it("is offline when isInternetReachable is explicitly false", () => {
    expect(deriveStatus({ isConnected: true, isInternetReachable: false })).toBe("offline");
  });

  it("is unknown — never optimistically online — while isInternetReachable is still being probed", () => {
    expect(deriveStatus({ isConnected: true, isInternetReachable: null })).toBe("unknown");
  });

  it("is online only once both isConnected and isInternetReachable are confirmed true", () => {
    expect(deriveStatus({ isConnected: true, isInternetReachable: true })).toBe("online");
  });
});
