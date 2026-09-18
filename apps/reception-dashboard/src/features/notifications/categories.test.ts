import { describe, it, expect } from "vitest";
import { NOTIFICATION_CATEGORY_META } from "./categories";
import { NOTIFICATION_PRIORITY_META } from "./priorities";
import { NOTIFICATION_CATEGORIES, NOTIFICATION_PRIORITIES } from "./types";

describe("NOTIFICATION_CATEGORY_META", () => {
  it("has a label and icon for every declared category (extensibility check, Prompt 6 §8)", () => {
    for (const category of NOTIFICATION_CATEGORIES) {
      const meta = NOTIFICATION_CATEGORY_META[category];
      expect(meta.label).toBeTruthy();
      expect(meta.icon).toBeTruthy();
    }
  });
});

describe("NOTIFICATION_PRIORITY_META", () => {
  it("has a label, tone, and weight for every declared priority", () => {
    for (const priority of NOTIFICATION_PRIORITIES) {
      const meta = NOTIFICATION_PRIORITY_META[priority];
      expect(meta.label).toBeTruthy();
      expect(meta.tone).toBeTruthy();
      expect(typeof meta.weight).toBe("number");
    }
  });

  it("orders weights from critical (most urgent) to informational (least)", () => {
    expect(NOTIFICATION_PRIORITY_META.critical.weight).toBeLessThan(
      NOTIFICATION_PRIORITY_META.high.weight,
    );
    expect(NOTIFICATION_PRIORITY_META.high.weight).toBeLessThan(
      NOTIFICATION_PRIORITY_META.medium.weight,
    );
    expect(NOTIFICATION_PRIORITY_META.medium.weight).toBeLessThan(
      NOTIFICATION_PRIORITY_META.low.weight,
    );
    expect(NOTIFICATION_PRIORITY_META.low.weight).toBeLessThan(
      NOTIFICATION_PRIORITY_META.informational.weight,
    );
  });
});
