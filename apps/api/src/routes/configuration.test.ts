import { describe, it, expect, beforeAll } from "vitest";
import type { KeyLike } from "jose";
import { buildApp } from "../app.js";
import { FakeAuthDbPort } from "../lib/auth/__fixtures__/fake-db-port.js";
import { generateTestKeyPair, signTestJwt } from "../lib/auth/__fixtures__/test-jwt.js";
import { createJwtVerifier } from "../lib/auth/jwt.js";
import { FakeConfigurationRepository } from "../domain/configuration/__fixtures__/fake-repository.js";
import { FakeOtpSender } from "../domain/auth/__fixtures__/fake-otp-sender.js";
import type { ConfigurationEntryView } from "../domain/configuration/types.js";

// Phase 5, Prompt 14 — Enterprise Configuration Center. Reuses
// `configuration:manage` (hostel_admin/super_admin only — never
// reception_warden/library_incharge, per
// lib/authorization/policy.ts's real role grants) and the identical
// AAL2-required staff-route boundary every other privileged route in this
// API already establishes.
describe("configuration routes (end-to-end through the real app)", () => {
  let privateKey: KeyLike;
  let publicKey: KeyLike;

  const RECEPTION_AUTH = "cfg-reception-auth";
  const LIBRARY_AUTH = "cfg-library-auth";
  const HOSTEL_ADMIN_A_AUTH = "cfg-hostel-admin-a-auth";
  const HOSTEL_ADMIN_B_AUTH = "cfg-hostel-admin-b-auth";
  const SUPER_ADMIN_AUTH = "cfg-super-admin-auth";
  const SUSPENDED_AUTH = "cfg-suspended-auth"; // never registered in staffMembers

  const HOSTEL_ADMIN_A_STAFF_ID = "70000000-0000-0000-0000-000000000021";
  const HOSTEL_ADMIN_B_STAFF_ID = "70000000-0000-0000-0000-000000000022";
  const SUPER_ADMIN_STAFF_ID = "70000000-0000-0000-0000-000000000023";
  const HOSTEL_A = "70000000-0000-0000-0000-0000000000a1";
  const HOSTEL_B = "70000000-0000-0000-0000-0000000000b1";

  beforeAll(async () => {
    const pair = await generateTestKeyPair();
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;
  });

  function fixtureEntry(overrides: Partial<ConfigurationEntryView> = {}): ConfigurationEntryView {
    const now = "2026-01-01T00:00:00.000Z";
    return {
      id: "70000000-0000-0000-0000-000000000f01",
      domain: "system",
      key: "maintenance_banner_text",
      value: "Scheduled maintenance tonight.",
      valueType: "string",
      description: "Shown on the dashboard when active.",
      scope: "global",
      hostelId: null,
      hostelName: null,
      isActive: true,
      version: 1,
      createdBy: SUPER_ADMIN_STAFF_ID,
      createdByName: "Super Admin",
      updatedBy: SUPER_ADMIN_STAFF_ID,
      updatedByName: "Super Admin",
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  async function buildTestApp() {
    const authDb = new FakeAuthDbPort()
      .addStaff(RECEPTION_AUTH, "cfg-reception", "reception_warden", HOSTEL_A)
      .addStaff(LIBRARY_AUTH, "cfg-library", "library_incharge", null)
      .addStaff(HOSTEL_ADMIN_A_AUTH, HOSTEL_ADMIN_A_STAFF_ID, "hostel_admin", HOSTEL_A)
      .addStaff(HOSTEL_ADMIN_B_AUTH, HOSTEL_ADMIN_B_STAFF_ID, "hostel_admin", HOSTEL_B)
      .addStaff(SUPER_ADMIN_AUTH, SUPER_ADMIN_STAFF_ID, "super_admin", null);

    const repo = new FakeConfigurationRepository();
    repo.validHostelIds.add(HOSTEL_A).add(HOSTEL_B);
    repo.items.push(
      fixtureEntry(),
      fixtureEntry({
        id: "70000000-0000-0000-0000-000000000f02",
        domain: "hostel",
        key: "warden_contact_note",
        value: "Ring the front desk.",
        scope: "hostel",
        hostelId: HOSTEL_A,
        hostelName: "Hostel A",
      }),
      fixtureEntry({
        id: "70000000-0000-0000-0000-000000000f03",
        domain: "hostel",
        key: "warden_contact_note",
        value: "Ask at reception.",
        scope: "hostel",
        hostelId: HOSTEL_B,
        hostelName: "Hostel B",
      }),
    );

    const jwtVerifier = createJwtVerifier(
      { supabaseUrl: "http://127.0.0.1:9999" },
      async () => publicKey,
    );

    const app = await buildApp({
      authOverrides: { jwtVerifier, authDbPort: authDb },
      configurationOverrides: { configurationRepository: repo },
      staffOverrides: { staffRepository: {} as never },
      otpAuthOverrides: { otpSender: new FakeOtpSender() },
    });
    return { app, repo };
  }

  async function tokenFor(sub: string, aal?: string) {
    return signTestJwt({ sub, privateKey, aal });
  }

  // ==========================================================================
  // Authentication / role / AAL2 boundary
  // ==========================================================================
  it("A. unauthenticated: GET /configuration -> 401", async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/configuration" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("B. AAL1 super_admin session: GET /configuration -> 403 (AAL2 required)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal1");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/configuration",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("C. reception_warden (AAL2): GET /configuration -> 403 — configuration:manage is not granted to this role", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/configuration",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("D. library_incharge (AAL2): GET /configuration -> 403", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(LIBRARY_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/configuration",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("E. a suspended/never-provisioned staff auth id: GET /configuration -> 401 no_app_profile (reuses the existing findStaffByAuthUserId enforcement, no new code path)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(SUSPENDED_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/configuration",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("no_app_profile");
    await app.close();
  });

  it("F. super_admin (AAL2): GET /configuration -> 200, sees every entry across every hostel", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/configuration",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(3);
    await app.close();
  });

  // ==========================================================================
  // Hostel scope — read
  // ==========================================================================
  it("G. hostel_admin A (AAL2): GET /configuration -> sees the global entry + only Hostel A's entry, not Hostel B's", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_A_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/configuration",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(2);
    expect(body.items.some((i: ConfigurationEntryView) => i.hostelId === HOSTEL_B)).toBe(false);
    await app.close();
  });

  it("H. hostel_admin A: GET a specific Hostel B entry by id -> 404 (cross-hostel anti-enumeration, same shape as every other staff resource)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_A_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/configuration/70000000-0000-0000-0000-000000000f03",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  // ==========================================================================
  // Hostel scope — write (create)
  // ==========================================================================
  it("I. hostel_admin A creates a hostel-scoped entry for their OWN hostel -> 201", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_A_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/configuration",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        domain: "hostel",
        key: "emergency_contact_note",
        value: "Call the warden on duty.",
        valueType: "string",
        description: null,
        scope: "hostel",
        hostelId: HOSTEL_A,
      },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it("J. hostel_admin A attempts to create a GLOBAL entry -> 403 hostel_scope_forbidden (never trusted to touch platform-wide state)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_A_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/configuration",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        domain: "system",
        key: "some_global_setting",
        value: "x",
        valueType: "string",
        description: null,
        scope: "global",
        hostelId: null,
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("configuration_hostel_scope_forbidden");
    await app.close();
  });

  it("K. hostel_admin A attempts to create an entry for Hostel B (a forged/other hostel id) -> 403, even though the id is a real, valid hostel", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_A_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/configuration",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        domain: "hostel",
        key: "spoofed_scope",
        value: "x",
        valueType: "string",
        description: null,
        scope: "hostel",
        hostelId: HOSTEL_B,
      },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("L. super_admin creates a GLOBAL entry -> 201 (unscoped)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/configuration",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        domain: "notification",
        key: "reminder_lead_minutes",
        value: 30,
        valueType: "number",
        description: null,
        scope: "global",
        hostelId: null,
      },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it("M. duplicate domain+key at the same scope -> 409", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/configuration",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        domain: "system",
        key: "maintenance_banner_text",
        value: "dup",
        valueType: "string",
        description: null,
        scope: "global",
        hostelId: null,
      },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  // ==========================================================================
  // Value/key validation
  // ==========================================================================
  it("N. value does not match valueType -> 400", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/configuration",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        domain: "system",
        key: "some_number_setting",
        value: "not-a-number",
        valueType: "number",
        description: null,
        scope: "global",
        hostelId: null,
      },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("O. a key/domain resembling a secret is rejected -> 400, never stored", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/configuration",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        domain: "system",
        key: "admin_api_key",
        value: "whatever",
        valueType: "string",
        description: null,
        scope: "global",
        hostelId: null,
      },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("P. an unrecognized domain -> 400 (.strict() enum rejects it before it ever reaches validation)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/configuration",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        domain: "academic",
        key: "some_key",
        value: "x",
        valueType: "string",
        description: null,
        scope: "global",
        hostelId: null,
      },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  // ==========================================================================
  // Update / optimistic concurrency
  // ==========================================================================
  it("Q. update with the correct expectedVersion -> 200, version increments", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/configuration/70000000-0000-0000-0000-000000000f01",
      headers: { authorization: `Bearer ${token}` },
      payload: { expectedVersion: 1, value: "Updated banner text." },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().version).toBe(2);
    await app.close();
  });

  it("R. update with a STALE expectedVersion -> 409 stale_version, value unchanged", async () => {
    const { app, repo } = await buildTestApp();
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/configuration/70000000-0000-0000-0000-000000000f01",
      headers: { authorization: `Bearer ${token}` },
      payload: { expectedVersion: 999, value: "Should not apply." },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("configuration_stale_version");
    expect(repo.items.find((i) => i.id === "70000000-0000-0000-0000-000000000f01")!.value).not.toBe(
      "Should not apply.",
    );
    await app.close();
  });

  it("S. hostel_admin A cannot update the GLOBAL entry -> 403", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_A_AUTH, "aal2");
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/configuration/70000000-0000-0000-0000-000000000f01",
      headers: { authorization: `Bearer ${token}` },
      payload: { expectedVersion: 1, value: "attempted" },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("T. hostel_admin A cannot update Hostel B's entry -> 403 (not merely 404 — proves it's a scope check, not just anti-enumeration on read)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_A_AUTH, "aal2");
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/configuration/70000000-0000-0000-0000-000000000f03",
      headers: { authorization: `Bearer ${token}` },
      payload: { expectedVersion: 1, value: "attempted" },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("U. hostel_admin A can update their OWN hostel's entry -> 200", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_A_AUTH, "aal2");
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/configuration/70000000-0000-0000-0000-000000000f02",
      headers: { authorization: `Bearer ${token}` },
      payload: { expectedVersion: 1, value: "Updated note." },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("V. PATCH a nonexistent entry -> 404", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/configuration/00000000-0000-0000-0000-000000000099",
      headers: { authorization: `Bearer ${token}` },
      payload: { expectedVersion: 1, value: "x" },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  // ==========================================================================
  // Validate / preview (stateless — never persists)
  // ==========================================================================
  it("W. POST /configuration/validate — valid input -> 200 {valid:true}, and never creates a row", async () => {
    const { app, repo } = await buildTestApp();
    const before = repo.items.length;
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/configuration/validate",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        domain: "system",
        key: "some_new_key",
        value: true,
        valueType: "boolean",
        scope: "global",
        hostelId: null,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().valid).toBe(true);
    expect(repo.items.length).toBe(before);
    await app.close();
  });

  it("X. POST /configuration/validate — invalid value/type mismatch -> 200 {valid:false, kind:'invalid_value'}", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/configuration/validate",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        domain: "system",
        key: "some_key",
        value: "not-a-boolean",
        valueType: "boolean",
        scope: "global",
        hostelId: null,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.valid).toBe(false);
    expect(body.kind).toBe("invalid_value");
    await app.close();
  });

  // ==========================================================================
  // IDOR / forged parameters
  // ==========================================================================
  it("Y. forged extra field on create body -> 400 (.strict() rejects it)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/configuration",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        domain: "system",
        key: "forged_test",
        value: "x",
        valueType: "string",
        description: null,
        scope: "global",
        hostelId: null,
        actingStaffId: "forged",
      },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("Z. malformed entry id (not a UUID) -> 400", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/configuration/not-a-uuid",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("AA. GET /configuration/domains — real, fixed allow-list", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/configuration/domains",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().domains).toContain("hostel");
    await app.close();
  });

  it("AB. GET /configuration/statistics — hostel_admin sees only their own scope's totals", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_A_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/configuration/statistics",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().totalEntries).toBe(2);
    await app.close();
  });
});
