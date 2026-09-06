import { describe, it, expect } from "vitest";
import { registrationStatusMessage } from "./registrationState";

describe("registrationStatusMessage", () => {
  it("announces progress while registering", () => {
    expect(registrationStatusMessage("registering")).toBe("Verifying your device…");
  });

  it("has nothing to announce when idle", () => {
    expect(registrationStatusMessage("idle")).toBe("");
  });

  it("has nothing to announce on failure — the error UI itself carries the announcement (accessibilityRole=alert)", () => {
    expect(registrationStatusMessage("failed")).toBe("");
  });
});
