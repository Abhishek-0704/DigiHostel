import { describe, it, expect } from "vitest";
import { resolveRedirect } from "./routeGuard";

describe("resolveRedirect", () => {
  it("unauthenticated, currently at the root splash (no segment) -> redirect to (auth)", () => {
    expect(resolveRedirect("unauthenticated", undefined)).toBe("/(auth)/welcome");
  });

  it("unauthenticated user hitting a protected (app) route -> redirect to (auth)", () => {
    expect(resolveRedirect("unauthenticated", "(app)")).toBe("/(auth)/welcome");
  });

  it("unauthenticated user already inside (auth) -> no redirect (lets welcome -> login -> otp navigation happen freely)", () => {
    expect(resolveRedirect("unauthenticated", "(auth)")).toBeNull();
  });

  it("authenticated user hitting a public (auth) route -> redirect to (app)", () => {
    expect(resolveRedirect("authenticated", "(auth)")).toBe("/(app)/(tabs)");
  });

  it("authenticated user already inside (app) -> no redirect", () => {
    expect(resolveRedirect("authenticated", "(app)")).toBeNull();
  });

  it("device_verification_required -> redirect to (onboarding)", () => {
    expect(resolveRedirect("device_verification_required", "(app)")).toBe("/(onboarding)/devices");
  });

  it("device_verification_required, already inside (onboarding) -> no redirect", () => {
    expect(resolveRedirect("device_verification_required", "(onboarding)")).toBeNull();
  });

  it("session_expired routes to (auth), same destination as unauthenticated", () => {
    expect(resolveRedirect("session_expired", "(app)")).toBe("/(auth)/welcome");
  });

  it.each(["initializing", "authenticating", "offline", "error"] as const)(
    "status=%s never redirects — the current screen renders its own state instead",
    (status) => {
      expect(resolveRedirect(status, "(app)")).toBeNull();
      expect(resolveRedirect(status, undefined)).toBeNull();
      expect(resolveRedirect(status, "(auth)")).toBeNull();
    },
  );

  it("redirect-loop prevention: calling resolveRedirect again with the group it just redirected to always returns null", () => {
    const first = resolveRedirect("authenticated", "(auth)");
    expect(first).toBe("/(app)/(tabs)");
    // Simulate the guard's effect re-running once segments reflect the new group.
    const second = resolveRedirect("authenticated", "(app)");
    expect(second).toBeNull();
  });
});
