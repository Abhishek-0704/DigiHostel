import { describe, expect, it } from "vitest";
import { DASHBOARD_QUICK_ACTIONS } from "./dashboardQuickActions";

describe("DASHBOARD_QUICK_ACTIONS", () => {
  it("has unique ids", () => {
    const ids = DASHBOARD_QUICK_ACTIONS.map((action) => action.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique routes", () => {
    const routes = DASHBOARD_QUICK_ACTIONS.map((action) => action.route);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it("every entry has non-empty title, description, route, and accessibility hint", () => {
    for (const action of DASHBOARD_QUICK_ACTIONS) {
      expect(action.title.length).toBeGreaterThan(0);
      expect(action.description.length).toBeGreaterThan(0);
      expect(String(action.route).length).toBeGreaterThan(0);
      expect(action.accessibilityHint.length).toBeGreaterThan(0);
    }
  });

  it("only points at already-implemented routes (tabs or existing route groups)", () => {
    for (const action of DASHBOARD_QUICK_ACTIONS) {
      expect(String(action.route)).toMatch(/^\/\(app\)\//);
    }
  });
});
