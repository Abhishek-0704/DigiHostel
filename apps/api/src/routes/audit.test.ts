import { describe, it, expect, beforeAll } from "vitest";
import type { KeyLike } from "jose";
import { buildApp } from "../app.js";
import { FakeAuthDbPort } from "../lib/auth/__fixtures__/fake-db-port.js";
import { generateTestKeyPair, signTestJwt } from "../lib/auth/__fixtures__/test-jwt.js";
import { createJwtVerifier } from "../lib/auth/jwt.js";
import { FakeAuditRepository } from "../domain/audit/__fixtures__/fake-repository.js";
import { FakeOtpSender } from "../domain/auth/__fixtures__/fake-otp-sender.js";
import { FakeStaffRepository } from "../domain/staff/__fixtures__/fake-repository.js";
import type { AuditListItemView } from "../domain/audit/types.js";

// Phase 5, Prompt 12 — Enterprise Audit Center. Full security attack
// matrix, mirroring routes/emergencies.test.ts's established structure.
describe("audit routes (end-to-end through the real app)", () => {
  let privateKey: KeyLike;
  let publicKey: KeyLike;

  const RECEPTION_A_AUTH = "aud-reception-a-auth";
  const RECEPTION_B_AUTH = "aud-reception-b-auth";
  const SUPER_ADMIN_AUTH = "aud-super-admin-auth";
  const LIBRARY_AUTH = "aud-library-auth";
  const RECEPTION_A_STAFF_ID = "aud-reception-a";
  const RECEPTION_B_STAFF_ID = "aud-reception-b";
  const HOSTEL_A = "aud-hostel-a";
  const HOSTEL_B = "aud-hostel-b";

  beforeAll(async () => {
    const pair = await generateTestKeyPair();
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;
  });

  function item(overrides: Partial<AuditListItemView>): AuditListItemView {
    return {
      id: "evt-1",
      occurredAt: "2026-01-01T00:00:00.000Z",
      action: "leave.created",
      module: "leave",
      actorType: "student",
      actorId: "stu-1",
      actorName: "Test Student",
      actorRole: null,
      entityType: "leave_requests",
      entityId: "leave-1",
      studentId: "stu-1",
      studentFullName: "Test Student",
      studentRollNumber: "A001",
      hostelId: HOSTEL_A,
      hostelName: "Hostel A",
      metadata: {},
      ...overrides,
    };
  }

  async function buildTestApp() {
    const authDb = new FakeAuthDbPort()
      .addStaff(RECEPTION_A_AUTH, RECEPTION_A_STAFF_ID, "reception_warden", HOSTEL_A)
      .addStaff(RECEPTION_B_AUTH, RECEPTION_B_STAFF_ID, "reception_warden", HOSTEL_B)
      .addStaff(SUPER_ADMIN_AUTH, "aud-super-admin", "super_admin", null)
      .addStaff(LIBRARY_AUTH, "aud-library", "library_incharge", null);

    const repo = new FakeAuditRepository();
    repo.staffHostels.set(RECEPTION_A_STAFF_ID, HOSTEL_A);
    repo.staffHostels.set(RECEPTION_B_STAFF_ID, HOSTEL_B);
    repo.items.push(
      item({
        id: "evt-a1",
        entityId: "leave-a1",
        hostelId: HOSTEL_A,
        studentFullName: "Alpha One",
      }),
      item({
        id: "evt-b1",
        entityId: "leave-b1",
        hostelId: HOSTEL_B,
        studentFullName: "Beta One",
        studentRollNumber: "B001",
      }),
      item({
        id: "evt-device",
        module: "device",
        action: "device.trusted",
        entityType: "trusted_devices",
        entityId: "device-1",
        actorType: "parent",
        studentId: null,
        studentFullName: null,
        studentRollNumber: null,
        hostelId: null,
        hostelName: null,
      }),
    );

    const jwtVerifier = createJwtVerifier(
      { supabaseUrl: "http://127.0.0.1:9999" },
      async () => publicKey,
    );

    const app = await buildApp({
      authOverrides: { jwtVerifier, authDbPort: authDb },
      auditOverrides: { auditRepository: repo },
      otpAuthOverrides: { otpSender: new FakeOtpSender() },
      staffOverrides: { staffRepository: new FakeStaffRepository() },
    });
    return { app, repo };
  }

  async function tokenFor(sub: string, aal?: string) {
    return signTestJwt({ sub, privateKey, aal });
  }

  it("A. unauthenticated: GET /audit -> 401", async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/audit" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("B. AAL1 (no MFA) staff session: GET /audit -> 403", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal1");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/audit",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("C. library_incharge (no audit:view grant, not in allowed-role list): GET /audit -> 403", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(LIBRARY_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/audit",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("D. reception_warden (Hostel A, AAL2): sees only Hostel A's event, never Hostel B's or the hostel-less device event", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/audit",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(1);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe("evt-a1");
    await app.close();
  });

  it("E. reception_warden (Hostel B, AAL2): sees only Hostel B's event — cross-hostel isolation is bidirectional", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_B_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/audit",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(1);
    expect(body.items[0].id).toBe("evt-b1");
    await app.close();
  });

  it("F. super_admin: sees ALL events including cross-hostel and the hostel-less device event (data-minimization boundary is scope-derived, not role-blanket-denied)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/audit",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(3);
    await app.close();
  });

  it("G. hostel-scoped staff never see the device-trust event (no hostel concept -> excluded, not merely filtered on a client-visible field)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/audit",
      headers: { authorization: `Bearer ${token}` },
    });
    const body = res.json();
    expect(body.items.some((i: { entityType: string }) => i.entityType === "trusted_devices")).toBe(
      false,
    );
    await app.close();
  });

  it("H. malformed query (unrecognized field) -> 400, .strict() rejects rather than silently ignoring", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/audit?forgedHostelId=some-other-hostel",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("I. malformed dateFrom/dateTo (dateFrom after dateTo) -> 400", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/audit?dateFrom=2026-06-01T00:00:00.000Z&dateTo=2026-01-01T00:00:00.000Z",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("J. invalid module enum value -> 400", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/audit?module=not-a-real-module",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("K. pagination: page/pageSize are honored and total reflects the full authorized scope, not just the returned page", async () => {
    const { app, repo } = await buildTestApp();
    for (let i = 0; i < 5; i++) {
      repo.items.push(
        item({ id: `evt-a-extra-${i}`, entityId: `leave-a-extra-${i}`, hostelId: HOSTEL_A }),
      );
    }
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/audit?page=1&pageSize=2",
      headers: { authorization: `Bearer ${token}` },
    });
    const body = res.json();
    expect(body.items).toHaveLength(2);
    expect(body.total).toBe(6);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(2);
    await app.close();
  });

  it("L. module filter narrows results server-side", async () => {
    const { app, repo } = await buildTestApp();
    repo.items.push(
      item({
        id: "evt-a-emergency",
        module: "emergency",
        action: "emergency.incident_reported",
        entityType: "security_incidents",
        entityId: "inc-a1",
        hostelId: HOSTEL_A,
      }),
    );
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/audit?module=emergency",
      headers: { authorization: `Bearer ${token}` },
    });
    const body = res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe("evt-a-emergency");
    await app.close();
  });

  it("M. search (q) matches student name/roll prefix, scoped to caller's own hostel", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/audit?q=Alpha",
      headers: { authorization: `Bearer ${token}` },
    });
    const body = res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe("evt-a1");

    // Searching for the OTHER hostel's student name returns nothing, even
    // though that student genuinely exists in the dataset — scope narrows
    // BEFORE search, not after.
    const res2 = await app.inject({
      method: "GET",
      url: "/api/v1/audit?q=Beta",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res2.json().items).toHaveLength(0);
    await app.close();
  });

  it("N. no client-supplied hostel/role/staffId field has any effect — authorization is entirely server-derived from the session", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    // .strict() also protects against this at the schema level, but confirm
    // explicitly for the audit endpoint's own documented invariant.
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/audit?staffId=aud-reception-b&hostelId=aud-hostel-b&role=super_admin",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400); // rejected outright by .strict(), not silently accepted
    await app.close();
  });

  it("O. GET /audit/statistics requires the same auth chain -> 401 unauthenticated", async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/audit/statistics" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("P. GET /audit/statistics: hostel-scoped counts reflect only the caller's own authorized scope", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/audit/statistics",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.eventsToday).toBe(1);
    await app.close();
  });
});
