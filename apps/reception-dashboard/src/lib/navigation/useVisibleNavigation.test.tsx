// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { useVisibleNavigation } from "./useVisibleNavigation";
import { useAuthorization } from "../../contexts/AuthorizationContext";
import type { Permission } from "../authorization/permissions";

vi.mock("../../contexts/AuthorizationContext", () => ({
  useAuthorization: vi.fn(),
}));

const mockUseAuthorization = vi.mocked(useAuthorization);

afterEach(cleanup);

function authValue(overrides: Partial<ReturnType<typeof useAuthorization>> = {}) {
  return {
    role: null,
    hostelId: null,
    staffName: null,
    permissions: [],
    isAuthorizationLoading: false,
    isAuthorized: false,
    authorizationError: null,
    hasRole: () => false,
    hasPermission: () => false,
    can: () => false,
    canAccessHostel: () => false,
    refreshAuthorization: vi.fn(),
    ...overrides,
  };
}

describe("useVisibleNavigation", () => {
  it("returns nothing while authorization is loading (fail closed)", () => {
    mockUseAuthorization.mockReturnValue(authValue({ isAuthorizationLoading: true }));
    const { result } = renderHook(() => useVisibleNavigation());
    expect(result.current.topLevelItems).toEqual([]);
    expect(result.current.groups).toEqual([]);
  });

  it("shows only top-level items the caller has permission for", () => {
    const granted = new Set<Permission>(["dashboard:view", "student:search"]);
    mockUseAuthorization.mockReturnValue(authValue({ hasPermission: (p) => granted.has(p) }));
    const { result } = renderHook(() => useVisibleNavigation());
    const ids = result.current.topLevelItems.map((i) => i.id);
    expect(ids).toContain("dashboard");
    expect(ids).toContain("students");
    expect(ids).not.toContain("emergency");
  });

  it("omits an entire group when none of its items are permitted", () => {
    mockUseAuthorization.mockReturnValue(authValue({ hasPermission: () => false }));
    const { result } = renderHook(() => useVisibleNavigation());
    expect(result.current.groups).toEqual([]);
  });

  it("includes a group only with the items actually permitted, not the full group", () => {
    const granted = new Set<Permission>(["leave:queue:view"]);
    mockUseAuthorization.mockReturnValue(authValue({ hasPermission: (p) => granted.has(p) }));
    const { result } = renderHook(() => useVisibleNavigation());
    const leaveGroup = result.current.groups.find((g) => g.group.id === "leave");
    expect(leaveGroup).toBeDefined();
    expect(leaveGroup?.items.map((i) => i.id)).toEqual(["leave-queue"]);
  });

  it("a super_admin-equivalent grant (every permission) sees every item and every group", () => {
    mockUseAuthorization.mockReturnValue(authValue({ hasPermission: () => true }));
    const { result } = renderHook(() => useVisibleNavigation());
    expect(result.current.topLevelItems.length).toBeGreaterThan(0);
    expect(result.current.groups.length).toBe(3); // leave, reports, administration
  });
});
