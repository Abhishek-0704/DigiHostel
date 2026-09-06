import { describe, expect, it } from "vitest";
import {
  formatFullDate,
  WELCOME_GREETING,
  STUDENT_SUMMARY_UNAVAILABLE,
  PENDING_ACTIONS_UNAVAILABLE,
  RECENT_ACTIVITY_UNAVAILABLE,
  FUTURE_INSIGHT_PLACEHOLDERS,
} from "./dashboardContent";

describe("formatFullDate", () => {
  it("formats a known date with weekday, day, month, and year", () => {
    // 2026-09-04 is a Friday.
    expect(formatFullDate(new Date(2026, 8, 4))).toBe("Friday, 4 September 2026");
  });

  it("formats a different month/weekday correctly", () => {
    // 2026-01-01 is a Thursday.
    expect(formatFullDate(new Date(2026, 0, 1))).toBe("Thursday, 1 January 2026");
  });
});

describe("WELCOME_GREETING", () => {
  it("is generic — never a fabricated name", () => {
    expect(WELCOME_GREETING).toBe("Welcome back");
    expect(WELCOME_GREETING.toLowerCase()).not.toMatch(/mr\.|mrs\.|dear/);
  });
});

describe("unavailable-state content", () => {
  it.each([
    ["STUDENT_SUMMARY_UNAVAILABLE", STUDENT_SUMMARY_UNAVAILABLE],
    ["PENDING_ACTIONS_UNAVAILABLE", PENDING_ACTIONS_UNAVAILABLE],
    ["RECENT_ACTIVITY_UNAVAILABLE", RECENT_ACTIVITY_UNAVAILABLE],
  ])("%s has a non-empty title and description, and never claims 'No data'", (_name, content) => {
    expect(content.title.length).toBeGreaterThan(0);
    expect(content.description.length).toBeGreaterThan(0);
    expect(content.title.toLowerCase()).not.toBe("no data");
  });

  it("never fabricates a pending-approval count", () => {
    const joined = JSON.stringify(PENDING_ACTIONS_UNAVAILABLE);
    expect(joined).not.toMatch(/\d+ pending/i);
  });
});

describe("FUTURE_INSIGHT_PLACEHOLDERS", () => {
  it("contains only labels — no numeric values or computed stats", () => {
    expect(FUTURE_INSIGHT_PLACEHOLDERS.length).toBeGreaterThan(0);
    for (const item of FUTURE_INSIGHT_PLACEHOLDERS) {
      expect(item.id.length).toBeGreaterThan(0);
      expect(item.label.length).toBeGreaterThan(0);
      expect(item).not.toHaveProperty("value");
      expect(item).not.toHaveProperty("count");
    }
  });

  it("has unique ids", () => {
    const ids = FUTURE_INSIGHT_PLACEHOLDERS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
