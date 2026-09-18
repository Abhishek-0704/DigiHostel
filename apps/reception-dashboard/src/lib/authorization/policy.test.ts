import { describe, it, expect } from "vitest";
import {
  hasRole,
  hasPermission,
  can,
  hasAnyPermission,
  hasAllPermissions,
  canAccessHostel,
  permissionsForRole,
  ROLE_PERMISSIONS,
} from "./policy";
import { PERMISSIONS } from "./permissions";

describe("hasRole", () => {
  it("fails closed when authorization is null (not yet loaded / no staff profile)", () => {
    expect(hasRole(null, "reception_warden")).toBe(false);
  });

  it("returns true only for an exact role match", () => {
    const staff = { role: "reception_warden" as const, hostelId: "hostel-a" };
    expect(hasRole(staff, "reception_warden")).toBe(true);
    expect(hasRole(staff, "hostel_admin")).toBe(false);
  });
});

describe("hasPermission / can", () => {
  it("fails closed when authorization is null", () => {
    expect(hasPermission(null, "leave:queue:view")).toBe(false);
    expect(can(null, "leave:queue:view")).toBe(false);
  });

  it("reception_warden has operational permissions but not user management", () => {
    const staff = { role: "reception_warden" as const, hostelId: "hostel-a" };
    expect(hasPermission(staff, "leave:queue:view")).toBe(true);
    expect(hasPermission(staff, "student:verify")).toBe(true);
    expect(hasPermission(staff, "users:manage")).toBe(false);
    expect(hasPermission(staff, "configuration:manage")).toBe(false);
  });

  it("hostel_admin has reception_warden's permissions plus reports/configuration, but not user management", () => {
    const staff = { role: "hostel_admin" as const, hostelId: "hostel-a" };
    expect(hasPermission(staff, "leave:queue:view")).toBe(true);
    expect(hasPermission(staff, "reports:generate")).toBe(true);
    expect(hasPermission(staff, "configuration:manage")).toBe(true);
    expect(hasPermission(staff, "users:manage")).toBe(false);
  });

  it("super_admin has every declared permission", () => {
    const staff = { role: "super_admin" as const, hostelId: null };
    for (const permission of PERMISSIONS) {
      expect(hasPermission(staff, permission)).toBe(true);
    }
  });

  it("library_incharge has zero Reception Dashboard permissions — not a dashboard role (ADR-001)", () => {
    const staff = { role: "library_incharge" as const, hostelId: null };
    for (const permission of PERMISSIONS) {
      expect(hasPermission(staff, permission)).toBe(false);
    }
  });
});

describe("hasAnyPermission / hasAllPermissions", () => {
  const receptionWarden = { role: "reception_warden" as const, hostelId: "hostel-a" };

  it("hasAnyPermission is true if at least one permission matches", () => {
    expect(hasAnyPermission(receptionWarden, ["users:manage", "leave:queue:view"])).toBe(true);
  });

  it("hasAnyPermission is false if none match", () => {
    expect(hasAnyPermission(receptionWarden, ["users:manage", "configuration:manage"])).toBe(false);
  });

  it("hasAllPermissions requires every permission to match", () => {
    expect(hasAllPermissions(receptionWarden, ["leave:queue:view", "student:verify"])).toBe(true);
    expect(hasAllPermissions(receptionWarden, ["leave:queue:view", "users:manage"])).toBe(false);
  });
});

describe("canAccessHostel", () => {
  it("fails closed when authorization is null", () => {
    expect(canAccessHostel(null, "hostel-a")).toBe(false);
  });

  it("super_admin can access any hostel, including null target", () => {
    const staff = { role: "super_admin" as const, hostelId: null };
    expect(canAccessHostel(staff, "hostel-a")).toBe(true);
    expect(canAccessHostel(staff, "hostel-b")).toBe(true);
  });

  it("a hostel-scoped role can access only its own hostel", () => {
    const staff = { role: "reception_warden" as const, hostelId: "hostel-a" };
    expect(canAccessHostel(staff, "hostel-a")).toBe(true);
    expect(canAccessHostel(staff, "hostel-b")).toBe(false);
  });

  it("fails closed when a non-super_admin staff member has no hostel assignment (data anomaly, never treated as unscoped)", () => {
    const staff = { role: "reception_warden" as const, hostelId: null };
    expect(canAccessHostel(staff, "hostel-a")).toBe(false);
  });

  it("fails closed when the target hostel id is null for a scoped role", () => {
    const staff = { role: "reception_warden" as const, hostelId: "hostel-a" };
    expect(canAccessHostel(staff, null)).toBe(false);
  });
});

describe("permissionsForRole / ROLE_PERMISSIONS", () => {
  it("every role in the policy table maps only to declared permissions", () => {
    for (const role of Object.keys(ROLE_PERMISSIONS) as Array<keyof typeof ROLE_PERMISSIONS>) {
      for (const permission of permissionsForRole(role)) {
        expect(PERMISSIONS).toContain(permission);
      }
    }
  });
});
