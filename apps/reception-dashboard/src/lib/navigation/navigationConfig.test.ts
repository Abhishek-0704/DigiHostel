import { describe, it, expect } from "vitest";
import {
  NAVIGATION_ITEMS,
  NAVIGATION_GROUPS,
  UNGATED_NAVIGATION_ITEMS,
  getBreadcrumbTrail,
} from "./navigationConfig";

describe("NAVIGATION_ITEMS", () => {
  it("every item id is unique", () => {
    const ids = NAVIGATION_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every item route is unique", () => {
    const routes = NAVIGATION_ITEMS.map((item) => item.route);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it("every grouped item references a real declared group", () => {
    const groupIds = new Set(NAVIGATION_GROUPS.map((g) => g.id));
    for (const item of NAVIGATION_ITEMS) {
      if (item.group) expect(groupIds.has(item.group)).toBe(true);
    }
  });

  it("never references a parameterized route (contextual, not a global destination)", () => {
    for (const item of NAVIGATION_ITEMS) {
      expect(item.route).not.toContain(":");
    }
  });
});

describe("UNGATED_NAVIGATION_ITEMS", () => {
  it("carries no permission requirement (always visible)", () => {
    for (const item of UNGATED_NAVIGATION_ITEMS) {
      expect("requiredPermission" in item).toBe(false);
    }
  });
});

describe("getBreadcrumbTrail", () => {
  it("returns just 'Dashboard' for the dashboard item itself (no self-referential trail)", () => {
    expect(getBreadcrumbTrail("dashboard")).toEqual([{ label: "Dashboard" }]);
  });

  it("prefixes every non-dashboard item with a link back to Dashboard", () => {
    const trail = getBreadcrumbTrail("students");
    expect(trail[0]).toEqual({ label: "Dashboard", to: "/dashboard" });
    expect(trail[trail.length - 1]).toEqual({ label: "Students" });
  });

  it("includes the group label for a grouped item, between Dashboard and the item", () => {
    const trail = getBreadcrumbTrail("leave-queue");
    expect(trail).toEqual([
      { label: "Dashboard", to: "/dashboard" },
      { label: "Leave Management" },
      { label: "Leave Queue" },
    ]);
  });

  it("appends a dynamic label as the final current segment, turning the item itself into a link", () => {
    const trail = getBreadcrumbTrail("students", "TEST-S001");
    expect(trail).toEqual([
      { label: "Dashboard", to: "/dashboard" },
      { label: "Students", to: "/students" },
      { label: "TEST-S001" },
    ]);
  });

  it("returns just the dynamic label for an unknown item id (fails soft, never throws)", () => {
    expect(getBreadcrumbTrail("nonexistent-item", "Fallback")).toEqual([{ label: "Fallback" }]);
  });

  it("returns an empty trail for an unknown item id with no dynamic label", () => {
    expect(getBreadcrumbTrail("nonexistent-item")).toEqual([]);
  });
});
