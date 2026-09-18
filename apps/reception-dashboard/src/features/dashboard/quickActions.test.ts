import { describe, it, expect } from "vitest";
import { QUICK_ACTIONS, getVisibleQuickActions } from "./quickActions";
import { ROUTES } from "../../constants/routes";

describe("QUICK_ACTIONS", () => {
  it("has unique ids", () => {
    const ids = QUICK_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only references routes that exist in ROUTES", () => {
    const knownRoutes = new Set<string>(Object.values(ROUTES));
    for (const action of QUICK_ACTIONS) {
      expect(knownRoutes.has(action.route)).toBe(true);
    }
  });

  it("does not include a generic 'Verify Student' or 'Announcements' action (no standalone destination exists)", () => {
    const ids = QUICK_ACTIONS.map((a) => a.id);
    expect(ids).not.toContain("verify-student");
    expect(ids).not.toContain("announcements");
  });
});

describe("getVisibleQuickActions", () => {
  it("returns every action when every permission is granted", () => {
    const visible = getVisibleQuickActions(() => true);
    expect(visible.length).toBe(QUICK_ACTIONS.length);
  });

  it("returns no actions when no permission is granted", () => {
    const visible = getVisibleQuickActions(() => false);
    expect(visible.length).toBe(0);
  });

  it("filters to only the actions whose specific permission is granted", () => {
    const visible = getVisibleQuickActions((p) => p === "leave:queue:view");
    expect(visible.map((a) => a.id)).toEqual(["open-leave-queue"]);
  });
});
