import { describe, it, expect, beforeAll } from "vitest";
import type { KeyLike } from "jose";
import { buildApp } from "../app.js";
import { FakeAuthDbPort } from "../lib/auth/__fixtures__/fake-db-port.js";
import { generateTestKeyPair, signTestJwt } from "../lib/auth/__fixtures__/test-jwt.js";
import { createJwtVerifier } from "../lib/auth/jwt.js";
import { FakeOtpSender } from "../domain/auth/__fixtures__/fake-otp-sender.js";
import { MonitoringService } from "../domain/monitoring/service.js";
import { FakeMonitoringRepository } from "../domain/monitoring/__fixtures__/fake-repository.js";
import { AnalyticsService } from "../domain/analytics/service.js";
import { FakeAnalyticsRepository } from "../domain/analytics/__fixtures__/fake-repository.js";
import { EmergencyService } from "../domain/emergency/service.js";
import { FakeEmergencyRepository } from "../domain/emergency/__fixtures__/fake-repository.js";
import { HealthService } from "../domain/health/service.js";
import { FakeHealthRepository } from "../domain/health/__fixtures__/fake-repository.js";
import { FakeStaffRepository } from "../domain/staff/__fixtures__/fake-repository.js";

// Phase 7, Prompt 18 — Enterprise Operations Monitoring Center. Reuses the
// existing `system:view` permission (super_admin-only since Prompt 3) and
// the existing AAL2 staff boundary — no new role/permission/auth mechanism.
describe("monitoring routes (end-to-end through the real app)", () => {
  let privateKey: KeyLike;
  let publicKey: KeyLike;

  const SUPER_ADMIN_AUTH = "monitoring-super-admin-auth";
  const RECEPTION_AUTH = "monitoring-reception-auth";
  const SUPER_ADMIN_STAFF_ID = "72000000-0000-0000-0000-000000000001";
  const RECEPTION_STAFF_ID = "72000000-0000-0000-0000-000000000002";
  const HOSTEL_A = "72000000-0000-0000-0000-0000000000a1";

  beforeAll(async () => {
    const pair = await generateTestKeyPair();
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;
  });

  function buildMonitoringRepo() {
    return new FakeMonitoringRepository();
  }

  async function buildTestApp(monitoringRepo = buildMonitoringRepo()) {
    const authDb = new FakeAuthDbPort()
      .addStaff(SUPER_ADMIN_AUTH, SUPER_ADMIN_STAFF_ID, "super_admin", null)
      .addStaff(RECEPTION_AUTH, RECEPTION_STAFF_ID, "reception_warden", HOSTEL_A);

    const jwtVerifier = createJwtVerifier(
      { supabaseUrl: "http://127.0.0.1:9999" },
      async () => publicKey,
    );

    const monitoringService = new MonitoringService(monitoringRepo, {
      analyticsService: new AnalyticsService(new FakeAnalyticsRepository()),
      emergencyService: new EmergencyService(new FakeEmergencyRepository()),
      healthService: new HealthService(new FakeHealthRepository()),
    });

    const app = await buildApp({
      authOverrides: { jwtVerifier, authDbPort: authDb },
      monitoringOverrides: { monitoringService },
      staffOverrides: { staffRepository: new FakeStaffRepository() },
      otpAuthOverrides: { otpSender: new FakeOtpSender() },
    });
    return { app, monitoringRepo };
  }

  async function tokenFor(sub: string, aal?: string) {
    return signTestJwt({ sub, privateKey, aal });
  }

  it("A. unauthenticated: GET /monitoring/overview -> 401", async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/monitoring/overview" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("B. reception_warden (AAL2): GET /monitoring/overview -> 403 role_required (system:view is super_admin only)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/monitoring/overview",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("role_required");
    await app.close();
  });

  it("C. super_admin AAL1: GET /monitoring/overview -> 403 insufficient_assurance", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal1");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/monitoring/overview",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("insufficient_assurance");
    await app.close();
  });

  it("D. super_admin AAL2: GET /monitoring/overview -> 200 with the full aggregated shape, all signals genuinely measured (healthy fakes)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/monitoring/overview",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.platformStatus).toBe("healthy");
    expect(body.infrastructure).toHaveLength(3);
    expect(body.applicationModules.length).toBeGreaterThan(10);
    expect(body.operational).toMatchObject({
      pendingLeaveAuthorizations: 0,
      studentsOutsideHostel: 0,
      activeEmergencies: 0,
      activeHealthCases: 0,
      libraryOperationsStatus: "future",
    });
    expect(body.security).toMatchObject({ recentMfaFailures24h: 0, suspendedStaffAccounts: 0 });
    expect(typeof body.deployment.version).toBe("string");
    expect(Array.isArray(body.alerts)).toBe(true);
    await app.close();
  });

  it("D2. suspendedStaffAccounts reflects a direct, real repository count — never routed through the Supabase Admin API (no Admin credentials are required for this registration path at all)", async () => {
    const repo = buildMonitoringRepo();
    repo.suspendedStaffCount = 3;
    const { app } = await buildTestApp(repo);
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/monitoring/overview",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().security.suspendedStaffAccounts).toBe(3);
    await app.close();
  });

  it("E. an unavailable database signal produces platformStatus=unavailable and a critical alert — never silently 'healthy'", async () => {
    const repo = buildMonitoringRepo();
    repo.databaseState = "unavailable";
    const { app } = await buildTestApp(repo);
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/monitoring/overview",
      headers: { authorization: `Bearer ${token}` },
    });
    const body = res.json();
    expect(body.platformStatus).toBe("unavailable");
    expect(
      body.alerts.some(
        (a: { source: string; severity: string }) =>
          a.source === "infrastructure" && a.severity === "critical",
      ),
    ).toBe(true);
    await app.close();
  });

  it("F. an unconfigured Supabase Auth check reports 'unknown' on that signal AND rolls the platform aggregate up to 'unknown' — never a fabricated 'healthy' standing in for a dependency this backend could not evaluate", async () => {
    const repo = buildMonitoringRepo();
    repo.supabaseAuthState = "unknown";
    const { app } = await buildTestApp(repo);
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/monitoring/overview",
      headers: { authorization: `Bearer ${token}` },
    });
    const body = res.json();
    const authSignal = body.infrastructure.find((s: { id: string }) => s.id === "supabase-auth");
    expect(authSignal.state).toBe("unknown");
    // Per the Platform Health Model (domain/monitoring/types.ts):
    // unknown > healthy in severity — an unevaluated dependency must never
    // be silently absorbed into an aggregate "healthy" verdict.
    expect(body.platformStatus).toBe("unknown");
    await app.close();
  });

  it("G. GET /monitoring/diagnostics -> the fixed, server-owned allow-list (super_admin/AAL2 only)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/monitoring/diagnostics",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const ids = res.json().diagnostics.map((d: { id: string }) => d.id);
    expect(ids).toContain("database_connectivity");
    expect(ids).toContain("supabase_auth_admin_api");
    expect(ids).toContain("realtime_publication_integrity");
    expect(ids).toContain("staff_role_enum_integrity");
    await app.close();
  });

  it("H. POST /monitoring/diagnostics/{unknown}/run -> 404, never executes an arbitrary id", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/monitoring/diagnostics/drop_table_students/run",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("diagnostic_not_found");
    await app.close();
  });

  it("I. POST /monitoring/diagnostics/database_connectivity/run -> 200 with a real pass/fail result", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/monitoring/diagnostics/database_connectivity/run",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe("database_connectivity");
    expect(["pass", "fail", "unavailable"]).toContain(body.status);
    expect(typeof body.durationMs).toBe("number");
    await app.close();
  });

  it("J. reception_warden (AAL2): every monitoring route -> 403, including diagnostics run", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_AUTH, "aal2");
    const diagnosticsRes = await app.inject({
      method: "GET",
      url: "/api/v1/monitoring/diagnostics",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(diagnosticsRes.statusCode).toBe(403);
    const runRes = await app.inject({
      method: "POST",
      url: "/api/v1/monitoring/diagnostics/database_connectivity/run",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(runRes.statusCode).toBe(403);
    await app.close();
  });
});
