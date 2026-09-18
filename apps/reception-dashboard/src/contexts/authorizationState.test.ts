import { describe, it, expect } from "vitest";
import { deriveAuthorizationState } from "./authorizationState";

const STAFF = {
  id: "staff-1",
  fullName: "Test Staff",
  role: "reception_warden" as const,
  hostelId: "hostel-a",
};

describe("deriveAuthorizationState", () => {
  it("does not attempt to load authorization while authentication itself is incomplete", () => {
    expect(
      deriveAuthorizationState({
        authStatus: "mfa_required",
        profileLoading: false,
        staff: undefined,
      }),
    ).toEqual({ isAuthorizationLoading: false, staff: null, isAuthorized: false });
  });

  it("does not attempt to load authorization while unauthenticated", () => {
    expect(
      deriveAuthorizationState({
        authStatus: "unauthenticated",
        profileLoading: false,
        staff: undefined,
      }),
    ).toEqual({ isAuthorizationLoading: false, staff: null, isAuthorized: false });
  });

  it("reports loading once authenticated and the profile fetch is in flight", () => {
    expect(
      deriveAuthorizationState({
        authStatus: "authenticated",
        profileLoading: true,
        staff: undefined,
      }),
    ).toEqual({ isAuthorizationLoading: true, staff: null, isAuthorized: false });
  });

  it("fails closed when authenticated but no staff row exists for this account", () => {
    expect(
      deriveAuthorizationState({ authStatus: "authenticated", profileLoading: false, staff: null }),
    ).toEqual({ isAuthorizationLoading: false, staff: null, isAuthorized: false });
  });

  it("reports authorized once a real staff profile is resolved", () => {
    expect(
      deriveAuthorizationState({
        authStatus: "authenticated",
        profileLoading: false,
        staff: STAFF,
      }),
    ).toEqual({ isAuthorizationLoading: false, staff: STAFF, isAuthorized: true });
  });
});
