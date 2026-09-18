import { describe, it, expect, beforeAll } from "vitest";
import type { KeyLike } from "jose";
import { buildApp } from "../app.js";
import { FakeAuthDbPort } from "../lib/auth/__fixtures__/fake-db-port.js";
import { generateTestKeyPair, signTestJwt } from "../lib/auth/__fixtures__/test-jwt.js";
import { createJwtVerifier } from "../lib/auth/jwt.js";
import { FakeAnalyticsRepository } from "../domain/analytics/__fixtures__/fake-repository.js";
import { FakeStaffRepository } from "../domain/staff/__fixtures__/fake-repository.js";
import { FakeOtpSender } from "../domain/auth/__fixtures__/fake-otp-sender.js";

// Phase 6, Prompt 15 — Operational Intelligence & Executive Analytics
// Dashboard. This domain reuses the existing `reports:view` permission
// boundary (hostel_admin/super_admin only, NOT reception_warden — the
// dashboard is executive/management-level, not operational-queue-level,
// matching the frontend's own already-established `ROLE_PERMISSIONS`
// grant). The security matrix below specifically proves reception_warden
// and library_incharge are BOTH denied, not merely that "some role" is
// required — mirroring routes/staff.test.ts's identical discipline for its
// own super_admin-only boundary.
describe("analytics routes (end-to-end through the real app)", () => {
  let privateKey: KeyLike;
  let publicKey: KeyLike;

  const RECEPTION_AUTH = "an-reception-auth";
  const LIBRARY_AUTH = "an-library-auth";
  const HOSTEL_ADMIN_AUTH = "an-hostel-admin-auth";
  const SUPER_ADMIN_AUTH = "an-super-admin-auth";
  const HOSTEL_ADMIN_STAFF_ID = "an-hostel-admin";
  const SUPER_ADMIN_STAFF_ID = "an-super-admin";
  const HOSTEL_A = "an-hostel-a";

  beforeAll(async () => {
    const pair = await generateTestKeyPair();
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;
  });

  async function buildTestApp() {
    const authDb = new FakeAuthDbPort()
      .addStaff(RECEPTION_AUTH, "an-reception", "reception_warden", HOSTEL_A)
      .addStaff(LIBRARY_AUTH, "an-library", "library_incharge", null)
      .addStaff(HOSTEL_ADMIN_AUTH, HOSTEL_ADMIN_STAFF_ID, "hostel_admin", HOSTEL_A)
      .addStaff(SUPER_ADMIN_AUTH, SUPER_ADMIN_STAFF_ID, "super_admin", null);

    const repo = new FakeAnalyticsRepository();

    const jwtVerifier = createJwtVerifier(
      { supabaseUrl: "http://127.0.0.1:9999" },
      async () => publicKey,
    );

    const app = await buildApp({
      authOverrides: { jwtVerifier, authDbPort: authDb },
      analyticsOverrides: { analyticsRepository: repo },
      staffOverrides: { staffRepository: new FakeStaffRepository() },
      otpAuthOverrides: { otpSender: new FakeOtpSender() },
    });
    return { app, repo };
  }

  async function tokenFor(sub: string, aal?: string) {
    return signTestJwt({ sub, privateKey, aal });
  }

  // ==========================================================================
  // Authentication / role boundary — every route in this file shares the
  // identical `analyticsOnly` preHandler chain, so proving the matrix once
  // against /analytics/overview is representative; A2/A3 spot-check the
  // other two routes to confirm the SAME chain object is actually composed
  // there too (not merely copy-pasted with a typo).
  // ==========================================================================
  it("A. unauthenticated: GET /analytics/overview -> 401", async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/analytics/overview" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("B. AAL1 hostel_admin session: GET /analytics/overview -> 403 (AAL2 required)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_AUTH, "aal1");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/analytics/overview",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("C. reception_warden (AAL2): GET /analytics/overview -> 403 — reports:view is not granted to this role", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/analytics/overview",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("D. library_incharge (AAL2): GET /analytics/overview -> 403", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(LIBRARY_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/analytics/overview",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("E. hostel_admin (AAL2): GET /analytics/overview -> 200, real data reaches the response", async () => {
    const { app, repo } = await buildTestApp();
    repo.nextOverview = {
      ...repo.nextOverview,
      leave: { ...repo.nextOverview.leave, pendingNow: 3 },
    };
    const token = await tokenFor(HOSTEL_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/analytics/overview",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().leave.pendingNow).toBe(3);
    await app.close();
  });

  it("F. super_admin (AAL2): GET /analytics/overview -> 200", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/analytics/overview",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("G. reception_warden (AAL2): GET /analytics/leave-trend -> 403 (same role matrix as overview)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/analytics/leave-trend",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("H. reception_warden (AAL2): GET /analytics/movement-trend -> 403 (same role matrix as overview)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/analytics/movement-trend",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  // ==========================================================================
  // Identity/scope resolution — the route NEVER accepts a client-supplied
  // staff id or hostel id; it always re-resolves the caller's own profile
  // (Prompt 15 §16/§24's explicit "never trust a client-supplied hostel
  // parameter alone" requirement).
  // ==========================================================================
  it("I. forged hostelId/staffId query parameters are rejected outright — .strict() has no such fields to smuggle them through", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/analytics/overview?hostelId=forged-other-hostel&staffId=forged-other-staff",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400); // .strict() rejects unrecognized query fields
    await app.close();
  });

  it("J. the repository always receives the AUTHENTICATED caller's own staffId/staffRole, never a client-supplied one", async () => {
    const { app, repo } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_AUTH, "aal2");
    await app.inject({
      method: "GET",
      url: "/api/v1/analytics/overview",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(repo.overviewCalls).toHaveLength(1);
    expect(repo.overviewCalls[0]!.staffId).toBe(HOSTEL_ADMIN_STAFF_ID);
    expect(repo.overviewCalls[0]!.staffRole).toBe("hostel_admin");
    await app.close();
  });

  // ==========================================================================
  // Date-range validation
  // ==========================================================================
  it("K. no date range supplied -> a default range is applied (never an unbounded/all-time query)", async () => {
    const { app, repo } = await buildTestApp();
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    await app.inject({
      method: "GET",
      url: "/api/v1/analytics/overview",
      headers: { authorization: `Bearer ${token}` },
    });
    const call = repo.overviewCalls[0]!;
    expect(call.dateFrom).toBeDefined();
    expect(call.dateTo).toBeDefined();
    expect(new Date(call.dateFrom).getTime()).toBeLessThan(new Date(call.dateTo).getTime());
    await app.close();
  });

  it("L. malformed date (not ISO datetime) -> 400", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/analytics/overview?dateFrom=not-a-date&dateTo=2026-01-01T00:00:00.000Z",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("M. only dateFrom supplied, dateTo omitted -> 400 (half-open range rejected)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/analytics/overview?dateFrom=2026-01-01T00:00:00.000Z",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("N. dateFrom after dateTo -> 400", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/analytics/overview?dateFrom=2026-06-01T00:00:00.000Z&dateTo=2026-01-01T00:00:00.000Z",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("O. a range longer than the maximum allowed span -> 400 (bounded aggregation cost, not an evasion of §23's own requirement)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/analytics/overview?dateFrom=2020-01-01T00:00:00.000Z&dateTo=2026-01-01T00:00:00.000Z",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("P. a valid explicit range is passed through to the repository exactly as supplied", async () => {
    const { app, repo } = await buildTestApp();
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/analytics/leave-trend?dateFrom=2026-01-01T00:00:00.000Z&dateTo=2026-01-07T23:59:59.999Z",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(repo.leaveTrendCalls[0]!.dateFrom).toBe("2026-01-01T00:00:00.000Z");
    expect(repo.leaveTrendCalls[0]!.dateTo).toBe("2026-01-07T23:59:59.999Z");
    await app.close();
  });

  it("Q. GET /analytics/movement-trend (AAL2, super_admin) -> 200, real data reaches the response", async () => {
    const { app, repo } = await buildTestApp();
    repo.nextMovementTrend = {
      ...repo.nextMovementTrend,
      returnsByDay: [{ date: "2026-01-01", count: 5 }],
    };
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/analytics/movement-trend",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().returnsByDay).toEqual([{ date: "2026-01-01", count: 5 }]);
    await app.close();
  });

  it("R. forged extra query field on any route -> 400 (.strict() rejects it)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/analytics/leave-trend?forged=1",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
