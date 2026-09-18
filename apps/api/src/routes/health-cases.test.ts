import { describe, it, expect, beforeAll } from "vitest";
import type { KeyLike } from "jose";
import { buildApp } from "../app.js";
import { FakeAuthDbPort } from "../lib/auth/__fixtures__/fake-db-port.js";
import { generateTestKeyPair, signTestJwt } from "../lib/auth/__fixtures__/test-jwt.js";
import { createJwtVerifier } from "../lib/auth/jwt.js";
import { FakeHealthRepository } from "../domain/health/__fixtures__/fake-repository.js";
import { FakeOtpSender } from "../domain/auth/__fixtures__/fake-otp-sender.js";
import { FakeStaffRepository } from "../domain/staff/__fixtures__/fake-repository.js";

// Phase 4, Prompt 11 — full security attack matrix, adapted from
// routes/emergencies.test.ts's established structure to this domain's own,
// richer state machine.
describe("health case routes (end-to-end through the real app)", () => {
  let privateKey: KeyLike;
  let publicKey: KeyLike;

  const RECEPTION_A_AUTH = "hlt-reception-a-auth";
  const RECEPTION_B_AUTH = "hlt-reception-b-auth";
  const HOSTEL_ADMIN_A_AUTH = "hlt-hostel-admin-a-auth";
  const SUPER_ADMIN_AUTH = "hlt-super-admin-auth";
  const LIBRARY_AUTH = "hlt-library-auth";
  const RECEPTION_A_STAFF_ID = "hlt-reception-a";
  const RECEPTION_B_STAFF_ID = "hlt-reception-b";
  const HOSTEL_A = "hlt-hostel-a";
  const HOSTEL_B = "hlt-hostel-b";
  const STUDENT_A = "80000000-0000-0000-0000-000000000001";
  const STUDENT_A_ROLL = "HLT-A001";

  const CASE_NEW_A = "70000000-0000-0000-0000-000000000001";
  const CASE_ACK_A = "70000000-0000-0000-0000-000000000002";
  const CASE_MONITORING_A = "70000000-0000-0000-0000-000000000003";
  const CASE_RESOLVED_A = "70000000-0000-0000-0000-000000000004";
  const CASE_CLOSED_A = "70000000-0000-0000-0000-000000000005";
  const NONEXISTENT_ID = "70000000-0000-0000-0000-000000000099";

  beforeAll(async () => {
    const pair = await generateTestKeyPair();
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;
  });

  function baseCase(
    id: string,
    status: "new" | "acknowledged" | "monitoring" | "resolved" | "closed",
  ) {
    return {
      id,
      studentId: STUDENT_A,
      studentFullName: "Health Test Student",
      studentRollNumber: STUDENT_A_ROLL,
      hostelId: HOSTEL_A,
      hostelName: "Hostel A",
      roomNumber: "101",
      category: "medical_observation" as const,
      severity: "high" as const,
      status,
      reportedAt: "2026-01-01T00:00:00.000Z",
      admittedAt: null,
      latestUpdateAt: "2026-01-01T00:00:00.000Z",
      assignedStaffId: status === "new" ? null : RECEPTION_A_STAFF_ID,
      assignedStaffName: status === "new" ? null : "Reception A",
      description: "Test case",
      resolvedAt: status === "resolved" || status === "closed" ? "2026-01-01T01:00:00.000Z" : null,
      dischargedAt: null,
      closedAt: status === "closed" ? "2026-01-01T02:00:00.000Z" : null,
      cancelledAt: null,
      timeline: [
        {
          id: "evt-1",
          eventType: "created" as const,
          note: null,
          actorStaffName: null,
          occurredAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
  }

  async function buildTestApp() {
    const authDb = new FakeAuthDbPort()
      .addStaff(RECEPTION_A_AUTH, RECEPTION_A_STAFF_ID, "reception_warden", HOSTEL_A)
      .addStaff(RECEPTION_B_AUTH, RECEPTION_B_STAFF_ID, "reception_warden", HOSTEL_B)
      .addStaff(HOSTEL_ADMIN_A_AUTH, "hlt-hostel-admin-a", "hostel_admin", HOSTEL_A)
      .addStaff(SUPER_ADMIN_AUTH, "hlt-super-admin", "super_admin", null)
      .addStaff(LIBRARY_AUTH, "hlt-library", "library_incharge", null);

    const repo = new FakeHealthRepository();
    repo.staffHostels.set(RECEPTION_A_STAFF_ID, HOSTEL_A);
    repo.staffHostels.set("hlt-hostel-admin-a", HOSTEL_A);
    repo.staffHostels.set(RECEPTION_B_STAFF_ID, HOSTEL_B);
    repo.studentHostels.set(STUDENT_A, HOSTEL_A);
    repo.studentsByRollNumber.set(STUDENT_A_ROLL, STUDENT_A);
    repo.cases.push(
      baseCase(CASE_NEW_A, "new"),
      baseCase(CASE_ACK_A, "acknowledged"),
      baseCase(CASE_MONITORING_A, "monitoring"),
      baseCase(CASE_RESOLVED_A, "resolved"),
      baseCase(CASE_CLOSED_A, "closed"),
    );

    const jwtVerifier = createJwtVerifier(
      { supabaseUrl: "http://127.0.0.1:9999" },
      async () => publicKey,
    );

    const app = await buildApp({
      authOverrides: { jwtVerifier, authDbPort: authDb },
      healthCaseOverrides: { healthRepository: repo },
      otpAuthOverrides: { otpSender: new FakeOtpSender() },
      staffOverrides: { staffRepository: new FakeStaffRepository() },
    });
    return { app, repo };
  }

  async function tokenFor(sub: string, aal?: string) {
    return signTestJwt({ sub, privateKey, aal });
  }

  // A. Unauthenticated -> 401.
  it("A. unauthenticated: GET /health-cases -> 401", async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/health-cases" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
  it("A. unauthenticated: POST /health-cases -> 401", async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/health-cases",
      payload: {
        rollNumber: STUDENT_A_ROLL,
        category: "medical_observation",
        severity: "high",
        description: "x",
      },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  // B. AAL1 (no MFA) -> 403.
  it("B. reception, AAL1: GET /health-cases -> 403 insufficient_assurance", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal1");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/health-cases",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  // C. Wrong role (library_incharge) -> 403.
  it("C. library_incharge, AAL2: GET /health-cases -> 403", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(LIBRARY_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/health-cases",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
  it("C. library_incharge, AAL2: POST acknowledge -> 403", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(LIBRARY_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/health-cases/${CASE_NEW_A}/acknowledge`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  // D. Correct role, own hostel -> 200/201.
  it("D. reception A, AAL2, own hostel: GET /health-cases -> 200 with cases", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/health-cases",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(5);
    await app.close();
  });

  // E. Wrong hostel -> reception B never sees hostel A cases.
  it("E. reception B (Hostel B), AAL2: GET /health-cases -> 200 but zero Hostel A cases", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_B_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/health-cases",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(0);
    await app.close();
  });
  it("E. reception B (Hostel B), AAL2: GET a Hostel A case by id -> 404 (anti-enumeration)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_B_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/health-cases/${CASE_NEW_A}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
  it("E. nonexistent case id -> the identical 404 (same anti-enumeration shape)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/health-cases/${NONEXISTENT_ID}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
  it("E. reception B (Hostel B), AAL2: acknowledge a Hostel A case -> 404", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_B_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/health-cases/${CASE_NEW_A}/acknowledge`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  // F. super_admin: unscoped.
  it("F. super_admin, AAL2: GET /health-cases -> sees every hostel's cases", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/health-cases",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(5);
    await app.close();
  });

  // G. Client-supplied identity/status/timestamp fields have no effect.
  it("G. client-supplied staffId/status/assignedStaffId/admittedAt in the create body: 400, strict schema rejects it", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/health-cases",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        rollNumber: STUDENT_A_ROLL,
        category: "medical_observation",
        severity: "high",
        description: "x",
        staffId: "forged-staff-id",
        status: "resolved",
        assignedStaffId: "forged-assignee",
        admittedAt: "2020-01-01T00:00:00.000Z",
      },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
  it("G. reported case is always created as status=new, assignedStaffId=null, regardless of any request body field", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/health-cases",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        rollNumber: STUDENT_A_ROLL,
        category: "medical_observation",
        severity: "high",
        description: "x",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe("new");
    expect(body.assignedStaffId).toBeNull();
    expect(body.admittedAt).toBeNull();
    await app.close();
  });
  it("G. an admission-type category sets admittedAt automatically, never client-supplied", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/health-cases",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        rollNumber: STUDENT_A_ROLL,
        category: "hospital_admission",
        severity: "critical",
        description: "x",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().admittedAt).not.toBeNull();
    await app.close();
  });

  // H. Invalid state transitions -> 409.
  it("H. acknowledge an already-acknowledged case -> 409 (duplicate acknowledgement)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/health-cases/${CASE_ACK_A}/acknowledge`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.currentStatus).toBe("acknowledged");
    await app.close();
  });
  it("H. start-monitoring on a new (not yet acknowledged) case -> 409", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/health-cases/${CASE_NEW_A}/start-monitoring`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });
  it("H. resolve a new case -> 409 (cannot skip acknowledged/monitoring)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/health-cases/${CASE_NEW_A}/resolve`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });
  it("H. close a case that is not yet resolved/discharged -> 409", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/health-cases/${CASE_MONITORING_A}/close`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });
  it("H. cancel a case that is not `new` -> 409", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/health-cases/${CASE_ACK_A}/cancel`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  // I. Unauthorized note/transition on a closed case.
  it("I. adding a note to a closed case -> 409 (immutable once closed)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/health-cases/${CASE_CLOSED_A}/notes`,
      headers: { authorization: `Bearer ${token}` },
      payload: { note: "too late" },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });
  it("I. acknowledging an already-closed case -> 409, never a second success", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/health-cases/${CASE_CLOSED_A}/acknowledge`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  // J. Full legitimate lifecycle, in scope.
  it("J. reception A, own hostel: full legitimate lifecycle new -> acknowledged -> monitoring -> awaiting_update -> monitoring -> resolved -> closed", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const headers = { authorization: `Bearer ${token}` };

    const ack = await app.inject({
      method: "POST",
      url: `/api/v1/health-cases/${CASE_NEW_A}/acknowledge`,
      headers,
    });
    expect(ack.statusCode).toBe(200);
    expect(ack.json().status).toBe("acknowledged");
    expect(ack.json().assignedStaffId).toBe(RECEPTION_A_STAFF_ID);

    const note = await app.inject({
      method: "POST",
      url: `/api/v1/health-cases/${CASE_NEW_A}/notes`,
      headers,
      payload: { note: "Sent to infirmary for observation." },
    });
    expect(note.statusCode).toBe(201);

    const monitor = await app.inject({
      method: "POST",
      url: `/api/v1/health-cases/${CASE_NEW_A}/start-monitoring`,
      headers,
    });
    expect(monitor.statusCode).toBe(200);
    expect(monitor.json().status).toBe("monitoring");

    const awaiting = await app.inject({
      method: "POST",
      url: `/api/v1/health-cases/${CASE_NEW_A}/mark-awaiting-update`,
      headers,
    });
    expect(awaiting.statusCode).toBe(200);
    expect(awaiting.json().status).toBe("awaiting_update");

    const resumed = await app.inject({
      method: "POST",
      url: `/api/v1/health-cases/${CASE_NEW_A}/resume-monitoring`,
      headers,
    });
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json().status).toBe("monitoring");

    const resolve = await app.inject({
      method: "POST",
      url: `/api/v1/health-cases/${CASE_NEW_A}/resolve`,
      headers,
    });
    expect(resolve.statusCode).toBe(200);
    expect(resolve.json().status).toBe("resolved");

    const close = await app.inject({
      method: "POST",
      url: `/api/v1/health-cases/${CASE_NEW_A}/close`,
      headers,
    });
    expect(close.statusCode).toBe(200);
    expect(close.json().status).toBe("closed");

    await app.close();
  });

  // K. Roll number that doesn't resolve (nonexistent or cross-hostel) -> 404.
  it("K. reporting a case for a cross-hostel roll number -> 404 (anti-enumeration)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_B_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/health-cases",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        rollNumber: STUDENT_A_ROLL,
        category: "medical_observation",
        severity: "high",
        description: "x",
      },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  // L. Statistics endpoint respects the same scope.
  it("L. reception A: statistics reflect only Hostel A's own cases", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/health-cases/statistics",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const stats = res.json();
    expect(stats.active).toBe(3); // new + acknowledged + monitoring
    expect(stats.newCases).toBe(1);
    await app.close();
  });

  // M. hostel_admin: same hostel-scoped shape as reception.
  it("M. hostel_admin (Hostel A), AAL2: sees Hostel A cases, same as reception", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_A_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/health-cases",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(5);
    await app.close();
  });

  // N. Unrecognized query/body field rejected outright.
  it("N. unrecognized query parameter -> 400, strict schema rejects it", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/health-cases?hostelId=forged-hostel",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  // O. Prompt 11 closure (Medical History condition): the studentId filter
  // narrows the list to one student's cases, still fully hostel-scoped.
  it("O. reception A: GET /health-cases?studentId=<Student A> -> 200 with all 5 fixture cases (all belong to Student A)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/health-cases?studentId=${STUDENT_A}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(5);
    await app.close();
  });
  it("O. reception B (Hostel B): studentId filter for a cross-hostel student -> 200 with zero results, never another hostel's data", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_B_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/health-cases?studentId=${STUDENT_A}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(0);
    await app.close();
  });
  it("O. a non-UUID studentId -> 400, strict schema rejects it", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/health-cases?studentId=not-a-uuid",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
