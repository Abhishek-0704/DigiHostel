import { describe, it, expect, beforeAll } from "vitest";
import type { KeyLike } from "jose";
import { buildApp } from "../app.js";
import { FakeAuthDbPort } from "../lib/auth/__fixtures__/fake-db-port.js";
import { generateTestKeyPair, signTestJwt } from "../lib/auth/__fixtures__/test-jwt.js";
import { createJwtVerifier } from "../lib/auth/jwt.js";
import { FakeEmergencyRepository } from "../domain/emergency/__fixtures__/fake-repository.js";
import { FakeOtpSender } from "../domain/auth/__fixtures__/fake-otp-sender.js";
import { FakeStaffRepository } from "../domain/staff/__fixtures__/fake-repository.js";

// Phase 4, Prompt 10 — full security attack matrix, adapted to this route's
// actual shape (mirrors routes/movements.test.ts's/routes/students.test.ts's
// established structure).
describe("emergency routes (end-to-end through the real app)", () => {
  let privateKey: KeyLike;
  let publicKey: KeyLike;

  const RECEPTION_A_AUTH = "emg-reception-a-auth";
  const RECEPTION_B_AUTH = "emg-reception-b-auth";
  const HOSTEL_ADMIN_A_AUTH = "emg-hostel-admin-a-auth";
  const SUPER_ADMIN_AUTH = "emg-super-admin-auth";
  const LIBRARY_AUTH = "emg-library-auth";
  const RECEPTION_A_STAFF_ID = "emg-reception-a";
  const RECEPTION_B_STAFF_ID = "emg-reception-b";
  const HOSTEL_A = "emg-hostel-a";
  const HOSTEL_B = "emg-hostel-b";
  const STUDENT_A = "emg-student-a";
  const STUDENT_A_ROLL = "EMG-A001";

  const INCIDENT_OPEN_A = "60000000-0000-0000-0000-000000000001";
  const INCIDENT_ACK_A = "60000000-0000-0000-0000-000000000002";
  const INCIDENT_IN_PROGRESS_A = "60000000-0000-0000-0000-000000000003";
  const INCIDENT_RESOLVED_A = "60000000-0000-0000-0000-000000000004";
  const INCIDENT_CLOSED_A = "60000000-0000-0000-0000-000000000005";
  const NONEXISTENT_ID = "60000000-0000-0000-0000-000000000099";

  beforeAll(async () => {
    const pair = await generateTestKeyPair();
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;
  });

  function baseIncident(
    id: string,
    status: "open" | "acknowledged" | "in_progress" | "resolved" | "closed",
  ) {
    return {
      id,
      studentId: STUDENT_A,
      studentFullName: "Emergency Test Student",
      studentRollNumber: STUDENT_A_ROLL,
      hostelId: HOSTEL_A,
      hostelName: "Hostel A",
      roomNumber: "101",
      category: "medical" as const,
      severity: "high" as const,
      status,
      reportedAt: "2026-01-01T00:00:00.000Z",
      assignedStaffId: status === "open" ? null : RECEPTION_A_STAFF_ID,
      assignedStaffName: status === "open" ? null : "Reception A",
      description: "Test incident",
      resolvedAt: status === "resolved" || status === "closed" ? "2026-01-01T01:00:00.000Z" : null,
      closedAt: status === "closed" ? "2026-01-01T02:00:00.000Z" : null,
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
      .addStaff(HOSTEL_ADMIN_A_AUTH, "emg-hostel-admin-a", "hostel_admin", HOSTEL_A)
      .addStaff(SUPER_ADMIN_AUTH, "emg-super-admin", "super_admin", null)
      .addStaff(LIBRARY_AUTH, "emg-library", "library_incharge", null);

    const repo = new FakeEmergencyRepository();
    repo.staffHostels.set(RECEPTION_A_STAFF_ID, HOSTEL_A);
    repo.staffHostels.set("emg-hostel-admin-a", HOSTEL_A);
    repo.staffHostels.set(RECEPTION_B_STAFF_ID, HOSTEL_B);
    repo.studentHostels.set(STUDENT_A, HOSTEL_A);
    repo.studentsByRollNumber.set(STUDENT_A_ROLL, STUDENT_A);
    repo.incidents.push(
      baseIncident(INCIDENT_OPEN_A, "open"),
      baseIncident(INCIDENT_ACK_A, "acknowledged"),
      baseIncident(INCIDENT_IN_PROGRESS_A, "in_progress"),
      baseIncident(INCIDENT_RESOLVED_A, "resolved"),
      baseIncident(INCIDENT_CLOSED_A, "closed"),
    );

    const jwtVerifier = createJwtVerifier(
      { supabaseUrl: "http://127.0.0.1:9999" },
      async () => publicKey,
    );

    const app = await buildApp({
      authOverrides: { jwtVerifier, authDbPort: authDb },
      emergencyOverrides: { emergencyRepository: repo },
      otpAuthOverrides: { otpSender: new FakeOtpSender() },
      staffOverrides: { staffRepository: new FakeStaffRepository() },
    });
    return { app, repo };
  }

  async function tokenFor(sub: string, aal?: string) {
    return signTestJwt({ sub, privateKey, aal });
  }

  // A. Unauthenticated -> 401.
  it("A. unauthenticated: GET /emergencies -> 401", async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/emergencies" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
  it("A. unauthenticated: POST /emergencies -> 401", async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/emergencies",
      payload: {
        rollNumber: STUDENT_A_ROLL,
        category: "medical",
        severity: "high",
        description: "x",
      },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  // B. AAL1 (no MFA) -> 403.
  it("B. reception, AAL1: GET /emergencies -> 403 insufficient_assurance", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal1");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/emergencies",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  // C. Wrong role (library_incharge) -> 403.
  it("C. library_incharge, AAL2: GET /emergencies -> 403", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(LIBRARY_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/emergencies",
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
      url: `/api/v1/emergencies/${INCIDENT_OPEN_A}/acknowledge`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  // D. Correct role, own hostel -> 200/201.
  it("D. reception A, AAL2, own hostel: GET /emergencies -> 200 with incidents", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/emergencies",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(5);
    await app.close();
  });

  // E. Wrong hostel -> reception B never sees hostel A incidents.
  it("E. reception B (Hostel B), AAL2: GET /emergencies -> 200 but zero Hostel A incidents", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_B_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/emergencies",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(0);
    await app.close();
  });
  it("E. reception B (Hostel B), AAL2: GET a Hostel A incident by id -> 404 (anti-enumeration)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_B_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/emergencies/${INCIDENT_OPEN_A}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
  it("E. nonexistent incident id -> the identical 404 (same anti-enumeration shape)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/emergencies/${NONEXISTENT_ID}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
  it("E. reception B (Hostel B), AAL2: acknowledge a Hostel A incident -> 404", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_B_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/emergencies/${INCIDENT_OPEN_A}/acknowledge`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  // F. super_admin: unscoped.
  it("F. super_admin, AAL2: GET /emergencies -> sees every hostel's incidents", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/emergencies",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(5);
    await app.close();
  });

  // G. Client-supplied identity/status/timestamp fields have no effect —
  // strict schema rejects any unrecognized field outright.
  it("G. client-supplied staffId/status/hostelId/assignedStaffId in the create body: 400, strict schema rejects it", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/emergencies",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        rollNumber: STUDENT_A_ROLL,
        category: "medical",
        severity: "high",
        description: "x",
        staffId: "forged-staff-id",
        status: "resolved",
        assignedStaffId: "forged-assignee",
      },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
  it("G. reported incident is always created as status=open, assignedStaffId=null, regardless of any request body field", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/emergencies",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        rollNumber: STUDENT_A_ROLL,
        category: "medical",
        severity: "high",
        description: "x",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe("open");
    expect(body.assignedStaffId).toBeNull();
    await app.close();
  });

  // H. Invalid state transitions -> 409.
  it("H. acknowledge an already-acknowledged incident -> 409 (duplicate acknowledgement)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/emergencies/${INCIDENT_ACK_A}/acknowledge`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.currentStatus).toBe("acknowledged");
    await app.close();
  });
  it("H. start-response on an open (not yet acknowledged) incident -> 409", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/emergencies/${INCIDENT_OPEN_A}/start-response`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });
  it("H. resolve an open incident -> 409 (cannot skip acknowledged/in_progress)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/emergencies/${INCIDENT_OPEN_A}/resolve`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });
  it("H. close an incident that is not yet resolved -> 409", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/emergencies/${INCIDENT_IN_PROGRESS_A}/close`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  // I. Unauthorized closure/note on a closed incident.
  it("I. adding a note to a closed incident -> 409 (immutable once closed)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/emergencies/${INCIDENT_CLOSED_A}/notes`,
      headers: { authorization: `Bearer ${token}` },
      payload: { note: "too late" },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });
  it("I. acknowledging an already-closed incident -> 409, never a second success", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/emergencies/${INCIDENT_CLOSED_A}/acknowledge`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  // J. Full legitimate lifecycle, in scope.
  it("J. reception A, own hostel: full legitimate lifecycle open -> acknowledged -> in_progress -> resolved -> closed", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");

    const ack = await app.inject({
      method: "POST",
      url: `/api/v1/emergencies/${INCIDENT_OPEN_A}/acknowledge`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(ack.statusCode).toBe(200);
    expect(ack.json().status).toBe("acknowledged");
    expect(ack.json().assignedStaffId).toBe(RECEPTION_A_STAFF_ID);

    const note = await app.inject({
      method: "POST",
      url: `/api/v1/emergencies/${INCIDENT_OPEN_A}/notes`,
      headers: { authorization: `Bearer ${token}` },
      payload: { note: "Ambulance called." },
    });
    expect(note.statusCode).toBe(201);

    const start = await app.inject({
      method: "POST",
      url: `/api/v1/emergencies/${INCIDENT_OPEN_A}/start-response`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(start.statusCode).toBe(200);
    expect(start.json().status).toBe("in_progress");

    const resolve = await app.inject({
      method: "POST",
      url: `/api/v1/emergencies/${INCIDENT_OPEN_A}/resolve`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(resolve.statusCode).toBe(200);
    expect(resolve.json().status).toBe("resolved");

    const close = await app.inject({
      method: "POST",
      url: `/api/v1/emergencies/${INCIDENT_OPEN_A}/close`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(close.statusCode).toBe(200);
    expect(close.json().status).toBe("closed");

    await app.close();
  });

  // K. Roll number that doesn't resolve (nonexistent or cross-hostel) -> 404.
  it("K. reporting an incident for a cross-hostel roll number -> 404 (anti-enumeration)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_B_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/emergencies",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        rollNumber: STUDENT_A_ROLL,
        category: "medical",
        severity: "high",
        description: "x",
      },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  // L. Statistics endpoint respects the same scope.
  it("L. reception A: statistics reflect only Hostel A's own incidents", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/emergencies/statistics",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const stats = res.json();
    expect(stats.active).toBe(3); // open + acknowledged + in_progress
    expect(stats.open).toBe(1);
    await app.close();
  });

  // M. hostel_admin: same hostel-scoped shape as reception.
  it("M. hostel_admin (Hostel A), AAL2: sees Hostel A incidents, same as reception", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(HOSTEL_ADMIN_A_AUTH, "aal2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/emergencies",
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
      url: "/api/v1/emergencies?hostelId=forged-hostel",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
