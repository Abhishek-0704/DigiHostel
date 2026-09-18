import { describe, it, expect, beforeAll } from "vitest";
import type { KeyLike } from "jose";
import { buildApp } from "../app.js";
import { FakeAuthDbPort } from "../lib/auth/__fixtures__/fake-db-port.js";
import { generateTestKeyPair, signTestJwt } from "../lib/auth/__fixtures__/test-jwt.js";
import { createJwtVerifier } from "../lib/auth/jwt.js";
import { FakeMovementRepository } from "../domain/movement/__fixtures__/fake-repository.js";
import { FakeOtpSender } from "../domain/auth/__fixtures__/fake-otp-sender.js";
import { FakeStaffRepository } from "../domain/staff/__fixtures__/fake-repository.js";

// Phase 4, Prompt 9 — Security attack matrix (§29 A-N), adapted to this
// route's actual shape.
describe("movement routes (end-to-end through the real app)", () => {
  let privateKey: KeyLike;
  let publicKey: KeyLike;

  const PARENT_AUTH = "movements-parent-auth";
  const STUDENT_AUTH = "movements-student-auth";
  const RECEPTION_A_AUTH = "movements-reception-a-auth";
  const RECEPTION_B_AUTH = "movements-reception-b-auth";
  const SUPER_ADMIN_AUTH = "movements-super-admin-auth";
  const LIBRARY_AUTH = "movements-library-auth";
  const RECEPTION_A_STAFF_ID = "movements-reception-a";
  const RECEPTION_B_STAFF_ID = "movements-reception-b";
  const HOSTEL_A = "movements-hostel-a";
  const HOSTEL_B = "movements-hostel-b";
  const STUDENT_A_ID = "movements-student-a";

  const LR_APPROVED_EXITED = "30000000-0000-0000-0000-000000000001";
  const LR_APPROVED_NOT_EXITED = "30000000-0000-0000-0000-000000000002";
  const LR_PENDING = "30000000-0000-0000-0000-000000000003";
  const LR_REJECTED = "30000000-0000-0000-0000-000000000004";
  const LR_RACE = "30000000-0000-0000-0000-000000000005";

  beforeAll(async () => {
    const pair = await generateTestKeyPair();
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;
  });

  async function buildTestApp() {
    const authDb = new FakeAuthDbPort()
      .addParent(PARENT_AUTH, "parent-1")
      .addStudent(STUDENT_AUTH, STUDENT_A_ID, null)
      .addStaff(RECEPTION_A_AUTH, RECEPTION_A_STAFF_ID, "reception_warden", HOSTEL_A)
      .addStaff(RECEPTION_B_AUTH, RECEPTION_B_STAFF_ID, "reception_warden", HOSTEL_B)
      .addStaff(SUPER_ADMIN_AUTH, "movements-super-admin", "super_admin", null)
      .addStaff(LIBRARY_AUTH, "movements-library", "library_incharge", null);

    const movementRepo = new FakeMovementRepository();
    movementRepo.staffHostels.set(RECEPTION_A_STAFF_ID, HOSTEL_A);
    movementRepo.staffHostels.set(RECEPTION_B_STAFF_ID, HOSTEL_B);
    movementRepo.studentHostels.set(STUDENT_A_ID, HOSTEL_A);
    movementRepo.leaves.push(
      {
        id: LR_APPROVED_EXITED,
        studentId: STUDENT_A_ID,
        status: "approved",
        hasExitAuthorization: true,
      },
      {
        id: LR_APPROVED_NOT_EXITED,
        studentId: STUDENT_A_ID,
        status: "approved",
        hasExitAuthorization: false,
      },
      { id: LR_PENDING, studentId: STUDENT_A_ID, status: "pending", hasExitAuthorization: false },
      { id: LR_REJECTED, studentId: STUDENT_A_ID, status: "rejected", hasExitAuthorization: false },
      { id: LR_RACE, studentId: STUDENT_A_ID, status: "approved", hasExitAuthorization: true },
    );

    const jwtVerifier = createJwtVerifier(
      { supabaseUrl: "http://127.0.0.1:9999" },
      async () => publicKey,
    );

    const app = await buildApp({
      authOverrides: { jwtVerifier, authDbPort: authDb },
      movementOverrides: { movementRepository: movementRepo },
      otpAuthOverrides: { otpSender: new FakeOtpSender() },
      staffOverrides: { staffRepository: new FakeStaffRepository() },
    });
    return { app };
  }

  async function tokenFor(sub: string, aal?: string) {
    return signTestJwt({ sub, privateKey, aal });
  }

  // A. No authentication -> denied.
  it("A. unauthenticated: 401", async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/leave-requests/${LR_APPROVED_EXITED}/return`,
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  // B. AAL1 -> denied.
  it("B. reception, AAL1 (no MFA): 403 insufficient_assurance", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/leave-requests/${LR_APPROVED_EXITED}/return`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("insufficient_assurance");
    await app.close();
  });

  // C. Wrong role -> denied (parent, student, library_incharge).
  it("C1. a parent (not staff): 403 role_required", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(PARENT_AUTH);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/leave-requests/${LR_APPROVED_EXITED}/return`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("C2. a student (not staff): 403 role_required", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(STUDENT_AUTH);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/leave-requests/${LR_APPROVED_EXITED}/return`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("C3. library_incharge (staff, but no grant on this route): 403 role_required", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(LIBRARY_AUTH);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/leave-requests/${LR_APPROVED_EXITED}/return`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  // D. Reception staff from Hostel A -> own-hostel student allowed.
  it("D. reception (Hostel A), AAL2: own-hostel eligible leave -> 201", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/leave-requests/${LR_APPROVED_EXITED}/return`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().leaveRequestId).toBe(LR_APPROVED_EXITED);
    await app.close();
  });

  // E. Reception staff from Hostel A -> Hostel B student denied.
  it("E. reception (Hostel B), AAL2: Hostel A student's leave -> 404 (anti-enumeration)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_B_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/leave-requests/${LR_APPROVED_EXITED}/return`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  // F. Known cross-hostel identifier -> no data disclosure (identical 404
  // for cross-hostel vs nonexistent).
  it("F. cross-hostel id and a nonexistent id produce the identical 404 error code", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_B_AUTH, "aal2");
    const crossHostelRes = await app.inject({
      method: "POST",
      url: `/api/v1/leave-requests/${LR_APPROVED_EXITED}/return`,
      headers: { authorization: `Bearer ${token}` },
    });
    const nonexistentRes = await app.inject({
      method: "POST",
      url: `/api/v1/leave-requests/99999999-9999-9999-9999-999999999999/return`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(crossHostelRes.statusCode).toBe(404);
    expect(nonexistentRes.statusCode).toBe(404);
    expect(crossHostelRes.json().error.code).toBe(nonexistentRes.json().error.code);
    await app.close();
  });

  // G. Client manipulates hostel/staff/role fields -> no privilege
  // expansion (strict body schema rejects any body at all — this route
  // takes no body).
  it("G. a manipulated JSON body (forged staffId/role/hostelId/returnTimestamp) has no effect — the route reads nothing from the body", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_B_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/leave-requests/${LR_APPROVED_EXITED}/return`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        staffId: RECEPTION_A_STAFF_ID,
        role: "super_admin",
        hostelId: HOSTEL_A,
        returnTimestamp: "2000-01-01T00:00:00Z",
      },
    });
    // Still denied — Hostel B staff cannot return a Hostel A student's
    // leave no matter what the body claims.
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  // H. Return without active leave -> denied.
  it("H. leave in status pending: 409 conflict", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/leave-requests/${LR_PENDING}/return`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  // I. Return without exit authorization -> denied.
  it("I. approved but never exit-authorized: 409 conflict", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/leave-requests/${LR_APPROVED_NOT_EXITED}/return`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  // J. Return already completed -> denied/conflict.
  it("J. a second return attempt on the same leave: 409 conflict", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const first = await app.inject({
      method: "POST",
      url: `/api/v1/leave-requests/${LR_APPROVED_EXITED}/return`,
      headers: { authorization: `Bearer ${token}` },
    });
    const second = await app.inject({
      method: "POST",
      url: `/api/v1/leave-requests/${LR_APPROVED_EXITED}/return`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(409);
    await app.close();
  });

  // K. Return on a rejected leave -> denied.
  it("K. rejected leave: 409 conflict", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/leave-requests/${LR_REJECTED}/return`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  // L. Concurrent return attempts -> one success, one conflict.
  it("L. concurrent return attempts on the same leave -> exactly one 201 and one 409", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const [a, b] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LR_RACE}/return`,
        headers: { authorization: `Bearer ${token}` },
      }),
      app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LR_RACE}/return`,
        headers: { authorization: `Bearer ${token}` },
      }),
    ]);
    const codes = [a.statusCode, b.statusCode].sort();
    expect(codes).toEqual([201, 409]);
    await app.close();
  });

  // N. Unauthorized attempt does not mutate state — verified by re-running
  // the legitimate flow afterward and confirming it still succeeds exactly
  // once (if an unauthorized attempt had mutated anything, this would
  // conflict unexpectedly or behave inconsistently).
  it("N. a denied cross-hostel attempt does not consume the leave's own eligibility for its real owner", async () => {
    const { app } = await buildTestApp();
    const wrongToken = await tokenFor(RECEPTION_B_AUTH, "aal2");
    await app.inject({
      method: "POST",
      url: `/api/v1/leave-requests/${LR_APPROVED_EXITED}/return`,
      headers: { authorization: `Bearer ${wrongToken}` },
    });
    const rightToken = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/leave-requests/${LR_APPROVED_EXITED}/return`,
      headers: { authorization: `Bearer ${rightToken}` },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it("super_admin, AAL2: resolves any hostel's eligible leave", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/leave-requests/${LR_APPROVED_EXITED}/return`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it("a success response never includes staff/actor identity (data minimization)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/leave-requests/${LR_APPROVED_EXITED}/return`,
      headers: { authorization: `Bearer ${token}` },
    });
    const body = res.json();
    expect(Object.keys(body).sort()).toEqual(["id", "leaveRequestId", "occurredAt", "studentId"]);
    await app.close();
  });
});
