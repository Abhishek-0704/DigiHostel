import { describe, it, expect } from "vitest";
import { formatRemainingTime } from "./formatRemainingTime";

describe("formatRemainingTime", () => {
  it("formats whole minutes", () => {
    expect(formatRemainingTime(120_000)).toBe("2:00");
  });

  it("pads seconds under 10", () => {
    expect(formatRemainingTime(65_000)).toBe("1:05");
  });

  it("rounds up a partial second rather than truncating to 0:00 early", () => {
    expect(formatRemainingTime(500)).toBe("0:01");
  });

  it("never returns a negative value", () => {
    expect(formatRemainingTime(-1000)).toBe("0:00");
  });
});
