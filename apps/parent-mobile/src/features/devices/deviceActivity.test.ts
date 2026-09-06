import { describe, it, expect } from "vitest";
import { DEVICE_ACTIVITY_UNAVAILABLE } from "./deviceActivity";

describe("DEVICE_ACTIVITY_UNAVAILABLE", () => {
  it("has a non-empty title and description", () => {
    expect(DEVICE_ACTIVITY_UNAVAILABLE.title.length).toBeGreaterThan(0);
    expect(DEVICE_ACTIVITY_UNAVAILABLE.description.length).toBeGreaterThan(0);
  });

  it("never fabricates a specific past event (e.g. dates, 'last seen', 'signed in')", () => {
    const text =
      `${DEVICE_ACTIVITY_UNAVAILABLE.title} ${DEVICE_ACTIVITY_UNAVAILABLE.description}`.toLowerCase();
    expect(text).not.toContain("last seen");
    expect(text).not.toContain("signed in");
    expect(text).not.toContain("logged in");
  });
});
