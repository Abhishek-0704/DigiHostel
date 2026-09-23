import { describe, it, expect, beforeAll } from "vitest";
import type { KeyLike } from "jose";
import { buildApp } from "../app.js";
import { FakeAuthDbPort } from "../lib/auth/__fixtures__/fake-db-port.js";
import { generateTestKeyPair, signTestJwt } from "../lib/auth/__fixtures__/test-jwt.js";
import { createJwtVerifier } from "../lib/auth/jwt.js";
import { FakeProfileRepository } from "../domain/profile/__fixtures__/fake-repository.js";
import { FakeOtpSender } from "../domain/auth/__fixtures__/fake-otp-sender.js";

// Phase 7, Prompt 17 — Administrative Profile & Personal Preferences
// Center. Every route is self-scoped only: the acting staff id always
// comes from the verified JWT + live staff-row lookup, never a
// client-supplied field. No AAL2 requirement (personal, non-privileged
// preference changes) and no hostel scoping (nothing to scope).
describe("profile routes (end-to-end through the real app)", () => {
  let privateKey: KeyLike;
  let publicKey: KeyLike;

  const RECEPTION_AUTH = "profile-reception-auth";
  const LIBRARY_AUTH = "profile-library-auth";
  const OTHER_RECEPTION_AUTH = "profile-other-reception-auth";
  const SUPER_ADMIN_AUTH = "profile-super-admin-auth";

  const RECEPTION_STAFF_ID = "71000000-0000-0000-0000-000000000001";
  const LIBRARY_STAFF_ID = "71000000-0000-0000-0000-000000000002";
  const OTHER_RECEPTION_STAFF_ID = "71000000-0000-0000-0000-000000000003";
  const SUPER_ADMIN_STAFF_ID = "71000000-0000-0000-0000-000000000004";
  const HOSTEL_A = "71000000-0000-0000-0000-0000000000a1";

  beforeAll(async () => {
    const pair = await generateTestKeyPair();
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;
  });

  async function buildTestApp() {
    const authDb = new FakeAuthDbPort()
      .addStaff(RECEPTION_AUTH, RECEPTION_STAFF_ID, "reception_warden", HOSTEL_A)
      .addStaff(LIBRARY_AUTH, LIBRARY_STAFF_ID, "library_incharge", null)
      .addStaff(OTHER_RECEPTION_AUTH, OTHER_RECEPTION_STAFF_ID, "reception_warden", HOSTEL_A)
      .addStaff(SUPER_ADMIN_AUTH, SUPER_ADMIN_STAFF_ID, "super_admin", null);

    const repo = new FakeProfileRepository()
      .addStaff({
        id: RECEPTION_STAFF_ID,
        fullName: "Reception One",
        role: "reception_warden",
        hostelId: HOSTEL_A,
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
      })
      .addStaff({
        id: LIBRARY_STAFF_ID,
        fullName: "Library One",
        role: "library_incharge",
        hostelId: null,
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
      })
      .addStaff({
        id: OTHER_RECEPTION_STAFF_ID,
        fullName: "Reception Two",
        role: "reception_warden",
        hostelId: HOSTEL_A,
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
      })
      .addStaff({
        id: SUPER_ADMIN_STAFF_ID,
        fullName: "Super Admin",
        role: "super_admin",
        hostelId: null,
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
      });

    const jwtVerifier = createJwtVerifier(
      { supabaseUrl: "http://127.0.0.1:9999" },
      async () => publicKey,
    );

    const app = await buildApp({
      authOverrides: { jwtVerifier, authDbPort: authDb },
      profileOverrides: { profileRepository: repo },
      staffOverrides: { staffRepository: {} as never },
      otpAuthOverrides: { otpSender: new FakeOtpSender() },
    });
    return { app, repo };
  }

  async function tokenFor(sub: string, aal?: string) {
    return signTestJwt({ sub, privateKey, aal });
  }

  // ==========================================================================
  // Authentication / role boundary
  // ==========================================================================
  it("A. unauthenticated: GET /profile -> 401", async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/profile" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("A2. unauthenticated: PATCH /profile -> 401 (not merely GET)", async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/profile",
      payload: { bio: "should never be applied" },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("B. AAL1 reception_warden: GET /profile -> 200 (no AAL2 required for personal preferences)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_AUTH, "aal1");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/profile",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("C. library_incharge (excluded from /audit and /configuration): GET /profile -> 200", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(LIBRARY_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/profile",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  // ==========================================================================
  // Self-scoping — the core security property of this whole module
  // ==========================================================================
  it("D. GET /profile returns ONLY the caller's own identity/preferences, never accepts a target id", async () => {
    const { app, repo } = await buildTestApp();
    repo.preferences.set(RECEPTION_STAFF_ID, {
      ...(await repo.getOrCreate(RECEPTION_STAFF_ID)).preferences,
      phoneNumber: "+911111111111",
    });
    const token = await tokenFor(RECEPTION_AUTH, "aal1");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/profile",
      headers: { authorization: `Bearer ${token}` },
    });
    const body = res.json();
    expect(body.identity.id).toBe(RECEPTION_STAFF_ID);
    expect(body.preferences.phoneNumber).toBe("+911111111111");
    await app.close();
  });

  it("E. PATCH /profile with a forged staffId in the body is ignored — the body schema doesn't declare it, .strict() rejects it as unrecognized", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_AUTH, "aal1");
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/profile",
      headers: { authorization: `Bearer ${token}` },
      payload: { staffId: OTHER_RECEPTION_STAFF_ID, phoneNumber: "+919999999999" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("F. PATCH /profile cannot set role/hostelId/status/authUserId — rejected as unrecognized fields (400), never silently ignored or applied", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_AUTH, "aal1");
    for (const forged of [
      { role: "super_admin" },
      { hostelId: "71000000-0000-0000-0000-0000000000b1" },
      { status: "suspended" },
      { authUserId: "00000000-0000-0000-0000-000000000000" },
      { id: "00000000-0000-0000-0000-000000000000" },
    ]) {
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/profile",
        headers: { authorization: `Bearer ${token}` },
        payload: forged,
      });
      expect(res.statusCode).toBe(400);
    }
    await app.close();
  });

  it("F2. a single combined payload forging every identity/ownership field at once, alongside a legitimate field, is rejected wholesale — nothing partially applies", async () => {
    const { app, repo } = await buildTestApp();
    const token = await tokenFor(RECEPTION_AUTH, "aal1");
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/profile",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        bio: "legitimate change riding along with the attack",
        staffId: OTHER_RECEPTION_STAFF_ID,
        id: OTHER_RECEPTION_STAFF_ID,
        authUserId: SUPER_ADMIN_AUTH,
        role: "super_admin",
        hostelId: null,
        status: "suspended",
      },
    });
    expect(res.statusCode).toBe(400);
    // The whole request is rejected at validation — "bio" never applied either,
    // proving there is no partial-apply/best-effort behavior to exploit.
    const after = await repo.getOrCreate(RECEPTION_STAFF_ID);
    expect(after.preferences.bio).toBeNull();
    await app.close();
  });

  it("G. PATCH /profile updates the caller's own fullName and preferences, never another staff member's", async () => {
    const { app, repo } = await buildTestApp();
    const token = await tokenFor(RECEPTION_AUTH, "aal1");
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/profile",
      headers: { authorization: `Bearer ${token}` },
      payload: { fullName: "Updated Name", officeLocation: "Block A, Room 12", theme: "dark" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.identity.fullName).toBe("Updated Name");
    expect(body.preferences.officeLocation).toBe("Block A, Room 12");
    expect(body.preferences.theme).toBe("dark");
    // The other staff member's own row is untouched.
    const other = await repo.getOrCreate(OTHER_RECEPTION_STAFF_ID);
    expect(other.identity.fullName).toBe("Reception Two");
    expect(other.preferences.officeLocation).toBeNull();
    await app.close();
  });

  it("H. mandatory notification categories cannot be disabled — rejected with 400, never silently coerced", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_AUTH, "aal1");
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/profile",
      headers: { authorization: `Bearer ${token}` },
      payload: { notificationPreferences: { emergency_alert: false } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("profile_mandatory_notification");
    await app.close();
  });

  it("I. a non-mandatory notification category CAN be disabled", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_AUTH, "aal1");
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/profile",
      headers: { authorization: `Bearer ${token}` },
      payload: { notificationPreferences: { administrative: false } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().preferences.notificationPreferences.administrative).toBe(false);
    await app.close();
  });

  it("J. a shortcut path must be a relative in-app path, not an absolute URL", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_AUTH, "aal1");
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/profile",
      headers: { authorization: `Bearer ${token}` },
      payload: { shortcuts: [{ id: "s1", label: "Evil", path: "https://evil.example" }] },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("K. PATCH /profile with an empty body is a no-op success, not an error", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_AUTH, "aal1");
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/profile",
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
