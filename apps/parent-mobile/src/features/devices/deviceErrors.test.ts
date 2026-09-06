import { describe, it, expect } from "vitest";
import { mapDeviceError } from "./deviceErrors";
import { DeviceServiceNotImplementedError } from "../../services/devices/deviceServiceErrors";
import { AppError } from "../../types/errors";

describe("mapDeviceError", () => {
  it("maps DeviceServiceNotImplementedError to device_registration_unavailable in register context", () => {
    const result = mapDeviceError(new DeviceServiceNotImplementedError("registration"), "register");
    expect(result).toBeInstanceOf(AppError);
    expect(result.kind).toBe("device_registration_unavailable");
    expect(result.userMessage).toBe(
      "Device verification isn't available yet. Please try again later.",
    );
  });

  it("maps DeviceServiceNotImplementedError to device_removal_unavailable in revoke context", () => {
    const result = mapDeviceError(new DeviceServiceNotImplementedError("removal"), "revoke");
    expect(result.kind).toBe("device_removal_unavailable");
    expect(result.userMessage).toBe(
      "Removing this device isn't available yet. Please try again later.",
    );
  });

  it("passes an existing AppError through unchanged", () => {
    const original = new AppError(
      "network",
      "You appear to be offline. Please check your connection and try again.",
    );
    expect(mapDeviceError(original, "register")).toBe(original);
  });

  it("falls back to the generic unknown mapping for an unrecognized error", () => {
    const result = mapDeviceError(new Error("boom"), "register");
    expect(result.kind).toBe("unknown");
  });

  it("never surfaces the raw underlying error message as the user-facing message", () => {
    const result = mapDeviceError(new DeviceServiceNotImplementedError("registration"), "register");
    expect(result.userMessage).not.toContain("Trusted-device");
    expect(result.userMessage).not.toContain("docs/current-state.md");
  });
});
