import { describe, expect, it } from "vitest";
import { formatLeaveDate, formatLeaveDuration } from "./leaveDateFormatting";

describe("formatLeaveDate", () => {
  it("formats a valid calendar date", () => {
    expect(formatLeaveDate("2026-09-10")).toBe("10 Sep 2026");
  });

  it("returns a safe fallback for null", () => {
    expect(formatLeaveDate(null)).toBe("Not available");
  });

  it("returns a safe fallback for an unparseable value", () => {
    expect(formatLeaveDate("not-a-date")).toBe("Not available");
  });
});

describe("formatLeaveDuration", () => {
  it("counts an inclusive whole-day span", () => {
    expect(formatLeaveDuration("2026-09-10", "2026-09-12")).toBe("3 days");
  });

  it("uses singular 'day' for a same-day request", () => {
    expect(formatLeaveDuration("2026-09-10", "2026-09-10")).toBe("1 day");
  });

  it("returns null when either date is missing", () => {
    expect(formatLeaveDuration(null, "2026-09-12")).toBeNull();
    expect(formatLeaveDuration("2026-09-10", null)).toBeNull();
  });

  it("returns null for unparseable dates", () => {
    expect(formatLeaveDuration("nope", "2026-09-12")).toBeNull();
  });

  it("returns null when endDate precedes startDate", () => {
    expect(formatLeaveDuration("2026-09-12", "2026-09-10")).toBeNull();
  });
});
