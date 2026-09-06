import { describe, it, expect } from "vitest";
import { deviceDisplayName, formatDeviceDate } from "./deviceDisplay";

describe("deviceDisplayName", () => {
  it("returns a human label for ios", () => {
    expect(deviceDisplayName("ios")).toBe("iOS Device");
  });

  it("returns a human label for android", () => {
    expect(deviceDisplayName("android")).toBe("Android Device");
  });
});

describe("formatDeviceDate", () => {
  it("formats a valid ISO timestamp as 'D Mon YYYY'", () => {
    expect(formatDeviceDate("2026-09-03T15:11:56.003Z")).toBe("3 Sep 2026");
  });

  it("returns null for an unparseable value rather than 'Invalid Date'", () => {
    expect(formatDeviceDate("not-a-date")).toBeNull();
  });
});
