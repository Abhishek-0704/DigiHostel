import { describe, it, expect } from "vitest";
import {
  createAuthenticate,
  requireStudent,
  requireParentOrGuardian,
  requireStaffRole,
  requireAal2,
  requireLinkedToStudent,
  requireActiveTrustedDevice,
} from "./guards.js";
import type { JwtVerifier } from "./jwt.js";
import type { SupabaseJwtClaims, AuthContext } from "./types.js";
import { FakeAuthDbPort } from "./__fixtures__/fake-db-port.js";
import { createMockReply, createMockRequest } from "./__fixtures__/fastify-mocks.js";

const CLAIMS: SupabaseJwtClaims = {
  sub: "user-1",
  iss: "http://test/auth/v1",
  aud: "authenticated",
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
  role: "authenticated",
};

function alwaysValidVerifier(claims: SupabaseJwtClaims = CLAIMS): JwtVerifier {
  return { verify: async () => claims };
}

describe("createAuthenticate", () => {
  it("scenario 7: valid JWT, no matching app profile -> 401 (distinct code, not 403)", async () => {
    const db = new FakeAuthDbPort(); // deliberately empty — no profile anywhere
    const authenticate = createAuthenticate(alwaysValidVerifier(), db);
    const request = createMockRequest(undefined, "Bearer whatever");
    const { reply, state } = createMockReply();

    await authenticate(request, reply);

    expect(state.statusCode).toBe(401);
    expect((state.body as { error: { code: string } }).error.code).toBe("no_app_profile");
    expect(request.auth).toBeUndefined();
  });

  it("valid JWT with a matching student profile -> populates request.auth", async () => {
    const db = new FakeAuthDbPort().addStudent("user-1", "student-1", "hostel-1");
    const authenticate = createAuthenticate(alwaysValidVerifier(), db);
    const request = createMockRequest(undefined, "Bearer whatever");
    const { reply, state } = createMockReply();

    await authenticate(request, reply);

    expect(state.statusCode).toBeNull(); // never rejected
    expect(request.auth?.profile).toEqual({
      kind: "student",
      id: "student-1",
      hostelId: "hostel-1",
    });
  });

  it("missing header -> 401 before even calling the verifier", async () => {
    const db = new FakeAuthDbPort();
    const authenticate = createAuthenticate(alwaysValidVerifier(), db);
    const request = createMockRequest(undefined, undefined);
    const { reply, state } = createMockReply();

    await authenticate(request, reply);

    expect(state.statusCode).toBe(401);
    expect((state.body as { error: { code: string } }).error.code).toBe("unauthenticated");
  });
});

function authedRequest(profile: AuthContext["profile"]) {
  return createMockRequest({ userId: "user-1", claims: CLAIMS, profile });
}

describe("role guards", () => {
  it("scenario 8: role mismatch -> 403", async () => {
    const guard = requireStudent();
    const request = authedRequest({ kind: "parent", id: "parent-1" });
    const { reply, state } = createMockReply();

    await guard(request, reply);

    expect(state.statusCode).toBe(403);
    expect((state.body as { error: { code: string } }).error.code).toBe("role_required");
  });

  it("matching role -> not rejected", async () => {
    const guard = requireStudent();
    const request = authedRequest({ kind: "student", id: "student-1", hostelId: null });
    const { reply, state } = createMockReply();

    await guard(request, reply);

    expect(state.statusCode).toBeNull();
  });

  it("parent-or-guardian guard accepts a parent profile regardless of relationship_type", async () => {
    const guard = requireParentOrGuardian();
    const request = authedRequest({ kind: "parent", id: "parent-1" });
    const { reply, state } = createMockReply();

    await guard(request, reply);

    expect(state.statusCode).toBeNull();
  });

  it("scenario 11: privileged staff route without required role -> 403", async () => {
    const guard = requireStaffRole("super_admin");
    const request = authedRequest({
      kind: "staff",
      id: "staff-1",
      role: "reception_warden",
      hostelId: "hostel-1",
    });
    const { reply, state } = createMockReply();

    await guard(request, reply);

    expect(state.statusCode).toBe(403);
    expect((state.body as { error: { code: string } }).error.code).toBe("role_required");
  });

  it("matching staff role -> not rejected", async () => {
    const guard = requireStaffRole("super_admin");
    const request = authedRequest({
      kind: "staff",
      id: "staff-1",
      role: "super_admin",
      hostelId: null,
    });
    const { reply, state } = createMockReply();

    await guard(request, reply);

    expect(state.statusCode).toBeNull();
  });
});

// Prompt 3 (RBAC & Authorization Framework) — closes the Prompt 0.3 ASRB
// CRITICAL finding: apps/api previously had zero AAL/AMR awareness anywhere,
// so a password-only (aal1) session with an otherwise-valid JWT could call a
// staff route directly. The `aal`/`aal2` shape asserted below was confirmed
// empirically against a real local Supabase instance (a genuine TOTP
// enroll+verify round-trip) — see types.ts's SupabaseJwtClaims doc comment.
describe("requireAal2", () => {
  const staffProfile: AuthContext["profile"] = {
    kind: "staff",
    id: "staff-1",
    role: "reception_warden",
    hostelId: "hostel-1",
  };

  function requestWithAal(aal: string | undefined) {
    return createMockRequest({
      userId: "user-1",
      claims: { ...CLAIMS, ...(aal ? { aal } : {}) },
      profile: staffProfile,
    });
  }

  it("missing aal claim (never completed any Supabase Auth session) -> 403 insufficient_assurance, fails closed", async () => {
    const guard = requireAal2();
    const request = requestWithAal(undefined);
    const { reply, state } = createMockReply();

    await guard(request, reply);

    expect(state.statusCode).toBe(403);
    expect((state.body as { error: { code: string } }).error.code).toBe("insufficient_assurance");
  });

  it("aal1 (password-only, MFA not completed) -> 403 insufficient_assurance", async () => {
    const guard = requireAal2();
    const request = requestWithAal("aal1");
    const { reply, state } = createMockReply();

    await guard(request, reply);

    expect(state.statusCode).toBe(403);
    expect((state.body as { error: { code: string } }).error.code).toBe("insufficient_assurance");
  });

  it("aal2 (MFA-verified session) -> not rejected", async () => {
    const guard = requireAal2();
    const request = requestWithAal("aal2");
    const { reply, state } = createMockReply();

    await guard(request, reply);

    expect(state.statusCode).toBeNull();
  });

  it("used without authenticate() running first -> throws rather than silently allowing/denying", async () => {
    const guard = requireAal2();
    const request = createMockRequest(undefined, "Bearer whatever");
    const { reply } = createMockReply();

    await expect(guard(request, reply)).rejects.toThrow(/authenticate\(\) running first/);
  });
});

describe("requireLinkedToStudent — relationship, not role", () => {
  it("scenario 9: parent authenticated but relationship does not exist -> 403", async () => {
    const db = new FakeAuthDbPort(); // no linked pairs configured
    const guard = requireLinkedToStudent(db, () => "student-x");
    const request = authedRequest({ kind: "parent", id: "parent-1" });
    const { reply, state } = createMockReply();

    await guard(request, reply);

    expect(state.statusCode).toBe(403);
    expect((state.body as { error: { code: string } }).error.code).toBe("relationship_required");
  });

  it("relationship exists in PostgreSQL -> not rejected", async () => {
    const db = new FakeAuthDbPort().linkParentToStudent("parent-1", "student-x");
    const guard = requireLinkedToStudent(db, () => "student-x");
    const request = authedRequest({ kind: "parent", id: "parent-1" });
    const { reply, state } = createMockReply();

    await guard(request, reply);

    expect(state.statusCode).toBeNull();
  });

  it("a role check alone would have wrongly allowed this — proving role and relationship are independent", async () => {
    // Same profile.kind ("parent") as the passing case above, but for a
    // DIFFERENT, unlinked student — a guard that only checked `kind ===
    // "parent"` would incorrectly allow this. requireLinkedToStudent must not.
    const db = new FakeAuthDbPort().linkParentToStudent("parent-1", "student-x");
    const guard = requireLinkedToStudent(db, () => "student-y"); // not student-x
    const request = authedRequest({ kind: "parent", id: "parent-1" });
    const { reply, state } = createMockReply();

    await guard(request, reply);

    expect(state.statusCode).toBe(403);
  });
});

describe("requireActiveTrustedDevice", () => {
  it("scenario 10: parent's only device is revoked -> denied", async () => {
    const db = new FakeAuthDbPort(); // no active device configured
    const guard = requireActiveTrustedDevice(db);
    const request = authedRequest({ kind: "parent", id: "parent-1" });
    const { reply, state } = createMockReply();

    await guard(request, reply);

    expect(state.statusCode).toBe(403);
    expect((state.body as { error: { code: string } }).error.code).toBe("device_revoked");
  });

  it("parent has an active trusted device -> not rejected", async () => {
    const db = new FakeAuthDbPort().setActiveDevice("parent-1", true);
    const guard = requireActiveTrustedDevice(db);
    const request = authedRequest({ kind: "parent", id: "parent-1" });
    const { reply, state } = createMockReply();

    await guard(request, reply);

    expect(state.statusCode).toBeNull();
  });
});
