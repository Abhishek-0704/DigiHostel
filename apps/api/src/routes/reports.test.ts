import { describe, it, expect, beforeAll } from "vitest";
import type { KeyLike } from "jose";
import { buildApp } from "../app.js";
import { FakeAuthDbPort } from "../lib/auth/__fixtures__/fake-db-port.js";
import { generateTestKeyPair, signTestJwt } from "../lib/auth/__fixtures__/test-jwt.js";
import { createJwtVerifier } from "../lib/auth/jwt.js";
import { FakeReportsService } from "../domain/reports/__fixtures__/fake-service.js";
import { FakeStaffRepository } from "../domain/staff/__fixtures__/fake-repository.js";
import { FakeOtpSender } from "../domain/auth/__fixtures__/fake-otp-sender.js";

// Phase 6, Prompt 16 — Enterprise Reporting Platform. Reuses the identical
// `reports:view`/`reports:generate` permission boundary Analytics (Phase 6,
// Prompt 15) already established — hostel_admin/super_admin only, NOT
// reception_warden or library_incharge. The backend enforces this by ROLE
// (`requireStaffRole`), matching every other domain in this codebase.
describe("reports routes (end-to-end through the real app)", () => {
  let privateKey: KeyLike;
  let publicKey: KeyLike;

  const RECEPTION_AUTH = "rp-reception-auth";
  const LIBRARY_AUTH = "rp-library-auth";
  const HOSTEL_ADMIN_AUTH = "rp-hostel-admin-auth";
  const SUPER_ADMIN_AUTH = "rp-super-admin-auth";
  const HOSTEL_ADMIN_STAFF_ID = "rp-hostel-admin";
  const HOSTEL_A = "rp-hostel-a";

  beforeAll(async () => {
    const pair = await generateTestKeyPair();
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;
  });

  async function buildTestApp() {
    const authDb = new FakeAuthDbPort()
      .addStaff(RECEPTION_AUTH, "rp-reception", "reception_warden", HOSTEL_A)
      .addStaff(LIBRARY_AUTH, "rp-library", "library_incharge", null)
      .addStaff(HOSTEL_ADMIN_AUTH, HOSTEL_ADMIN_STAFF_ID, "hostel_admin", HOSTEL_A)
      .addStaff(SUPER_ADMIN_AUTH, "rp-super-admin", "super_admin", null);

    const service = new FakeReportsService();

    const jwtVerifier = createJwtVerifier(
      { supabaseUrl: "http://127.0.0.1:9999" },
      async () => publicKey,
    );

    const app = await buildApp({
      authOverrides: { jwtVerifier, authDbPort: authDb },
      reportsOverrides: { reportsService: service },
      staffOverrides: { staffRepository: new FakeStaffRepository() },
      otpAuthOverrides: { otpSender: new FakeOtpSender() },
    });
    return { app, service };
  }

  async function tokenFor(sub: string, aal?: string) {
    return signTestJwt({ sub, privateKey, aal });
  }

  // ==========================================================================
  // Authentication / role boundary
  // ==========================================================================
  it("A. unauthenticated: GET /reports/catalog -> 401", async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/reports/catalog" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("B. AAL1 hostel_admin session: GET /reports/catalog -> 403 (AAL2 required)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_AUTH, "aal1");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/reports/catalog",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("C. reception_warden (AAL2): GET /reports/catalog -> 403 — reports:view is not granted to this role", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/reports/catalog",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("D. library_incharge (AAL2): GET /reports/catalog -> 403", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(LIBRARY_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/reports/catalog",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("E. hostel_admin (AAL2): GET /reports/catalog -> 200, includes an honestly-unavailable report", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/reports/catalog",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.reports.length).toBeGreaterThan(0);
    const occupancy = body.reports.find((r: { id: string }) => r.id === "hostel_occupancy");
    expect(occupancy.status).toBe("unavailable");
    expect(occupancy.unavailableReason).toBeTruthy();
    await app.close();
  });

  it("F. super_admin (AAL2): GET /reports/catalog -> 200", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/reports/catalog",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("G. reception_warden (AAL2): POST /reports/leave_authorization/preview -> 403 (same role matrix)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/reports/leave_authorization/preview",
      headers: { authorization: `Bearer ${token}` },
      payload: { reportId: "leave_authorization" },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  // ==========================================================================
  // Preview: happy path, identity resolution, unavailable reports
  // ==========================================================================
  it("H. hostel_admin (AAL2): POST /reports/leave_authorization/preview -> 200, real data reaches the response", async () => {
    const { app, service } = await buildTestApp();
    service.nextPreview = {
      ...service.nextPreview,
      rows: [{ studentRollNumber: "22CS001" }],
      total: 1,
    };
    const token = await tokenFor(HOSTEL_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/reports/leave_authorization/preview",
      headers: { authorization: `Bearer ${token}` },
      payload: { reportId: "leave_authorization" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().rows).toEqual([{ studentRollNumber: "22CS001" }]);
    await app.close();
  });

  it("I. the service always receives the AUTHENTICATED caller's own staffId/staffRole, never a client-supplied one", async () => {
    const { app, service } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_AUTH, "aal2");
    await app.inject({
      method: "POST",
      url: "/api/v1/reports/leave_authorization/preview",
      headers: { authorization: `Bearer ${token}` },
      payload: { reportId: "leave_authorization" },
    });
    expect(service.previewCalls).toHaveLength(1);
    expect(service.previewCalls[0]!.staffId).toBe(HOSTEL_ADMIN_STAFF_ID);
    expect(service.previewCalls[0]!.staffRole).toBe("hostel_admin");
    await app.close();
  });

  it("J. requesting an unavailable report (hostel_occupancy) -> 409 with an honest reason", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/reports/hostel_occupancy/preview",
      headers: { authorization: `Bearer ${token}` },
      payload: { reportId: "hostel_occupancy" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.message).toMatch(/capacity/i);
    await app.close();
  });

  it("K. an unknown reportId in the URL -> 400 (not part of the fixed enum)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/reports/some_forged_report/preview",
      headers: { authorization: `Bearer ${token}` },
      payload: { reportId: "some_forged_report" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("L. reportId in the path and body must match -> 400 otherwise", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/reports/leave_authorization/preview",
      headers: { authorization: `Bearer ${token}` },
      payload: { reportId: "operational_summary" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("M. a filter value not in the report's own declared allow-list -> 400 (no fabricated field is ever accepted)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/reports/leave_authorization/preview",
      headers: { authorization: `Bearer ${token}` },
      payload: { reportId: "leave_authorization", filters: { statuses: ["forged_status"] } },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("N. a filter key the report does not declare at all -> 400", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/reports/leave_authorization/preview",
      headers: { authorization: `Bearer ${token}` },
      payload: { reportId: "leave_authorization", filters: { categories: ["fire"] } },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("O. a selectedFields entry not in the report's own availableFields -> 400", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/reports/leave_authorization/preview",
      headers: { authorization: `Bearer ${token}` },
      payload: { reportId: "leave_authorization", selectedFields: ["forged_field"] },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("P. no date range supplied -> a default range is applied (never an unbounded/all-time query)", async () => {
    const { app, service } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_AUTH, "aal2");
    await app.inject({
      method: "POST",
      url: "/api/v1/reports/leave_authorization/preview",
      headers: { authorization: `Bearer ${token}` },
      payload: { reportId: "leave_authorization" },
    });
    const call = service.previewCalls[0]!;
    expect(call.filters.dateFrom).toBeDefined();
    expect(call.filters.dateTo).toBeDefined();
    expect(new Date(call.filters.dateFrom!).getTime()).toBeLessThan(
      new Date(call.filters.dateTo!).getTime(),
    );
    await app.close();
  });

  it("Q. malformed date (not ISO datetime) -> 400", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/reports/leave_authorization/preview",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        reportId: "leave_authorization",
        filters: { dateFrom: "not-a-date", dateTo: "2026-01-01T00:00:00.000Z" },
      },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("R. a date range longer than the maximum allowed span -> 400", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/reports/leave_authorization/preview",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        reportId: "leave_authorization",
        filters: {
          dateFrom: "2020-01-01T00:00:00.000Z",
          dateTo: "2026-01-01T00:00:00.000Z",
        },
      },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("S. a forged extra field in the preview body -> 400 (.strict() rejects it)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/reports/leave_authorization/preview",
      headers: { authorization: `Bearer ${token}` },
      payload: { reportId: "leave_authorization", forgedField: "x" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("T. a successful preview records exactly one execution-history entry, scoped to the caller's own hostel", async () => {
    const { app, service } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_AUTH, "aal2");
    await app.inject({
      method: "POST",
      url: "/api/v1/reports/leave_authorization/preview",
      headers: { authorization: `Bearer ${token}` },
      payload: { reportId: "leave_authorization" },
    });
    expect(service.recordExecutionCalls).toHaveLength(1);
    expect(service.recordExecutionCalls[0]!.scope.staffId).toBe(HOSTEL_ADMIN_STAFF_ID);
    expect(service.recordExecutionCalls[0]!.scope.hostelScopeId).toBe(HOSTEL_A);
    expect(service.recordExecutionCalls[0]!.reportId).toBe("leave_authorization");
    await app.close();
  });

  // ==========================================================================
  // Templates — personal, owner-scoped CRUD
  // ==========================================================================
  it("U. GET /reports/templates -> 200, an empty list initially", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/reports/templates",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().templates).toEqual([]);
    await app.close();
  });

  it("V. POST /reports/templates -> 201, then GET reflects it", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_AUTH, "aal2");
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/reports/templates",
      headers: { authorization: `Bearer ${token}` },
      payload: { reportId: "leave_authorization", name: "My weekly leave report" },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().name).toBe("My weekly leave report");

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/reports/templates",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.json().templates).toHaveLength(1);
    await app.close();
  });

  it("W. creating a second template with a duplicate name -> 409", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_AUTH, "aal2");
    await app.inject({
      method: "POST",
      url: "/api/v1/reports/templates",
      headers: { authorization: `Bearer ${token}` },
      payload: { reportId: "leave_authorization", name: "Dup" },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/reports/templates",
      headers: { authorization: `Bearer ${token}` },
      payload: { reportId: "leave_authorization", name: "Dup" },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it("X. creating a template for an unavailable report -> 400", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/reports/templates",
      headers: { authorization: `Bearer ${token}` },
      payload: { reportId: "hostel_occupancy", name: "Occupancy" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("Y. PATCH a nonexistent template -> 404", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/reports/templates/00000000-0000-0000-0000-000000000000",
      headers: { authorization: `Bearer ${token}` },
      payload: { isFavorite: true },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("Z. PATCH toggling isFavorite on a real template -> 200", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_AUTH, "aal2");
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/reports/templates",
      headers: { authorization: `Bearer ${token}` },
      payload: { reportId: "leave_authorization", name: "Favme" },
    });
    const id = create.json().id;
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/reports/templates/${id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { isFavorite: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().isFavorite).toBe(true);
    await app.close();
  });

  it("AA. DELETE a real template -> 204, then it is gone", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_AUTH, "aal2");
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/reports/templates",
      headers: { authorization: `Bearer ${token}` },
      payload: { reportId: "leave_authorization", name: "ToDelete" },
    });
    const id = create.json().id;
    const del = await app.inject({
      method: "DELETE",
      url: `/api/v1/reports/templates/${id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(del.statusCode).toBe(204);

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/reports/templates",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.json().templates).toEqual([]);
    await app.close();
  });

  it("AB. DELETE a nonexistent template -> 404", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/reports/templates/00000000-0000-0000-0000-000000000000",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  // ==========================================================================
  // History
  // ==========================================================================
  it("AC. GET /reports/history -> 200, an empty list initially", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/reports/history",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().history).toEqual([]);
    await app.close();
  });

  it("AD. reception_warden (AAL2): GET /reports/templates -> 403 (same role matrix)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/reports/templates",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
