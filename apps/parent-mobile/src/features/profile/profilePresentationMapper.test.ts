import { describe, expect, it } from "vitest";
import {
  buildParentProfilePresentation,
  mapLinkedStudentRecord,
  relationshipLabel,
} from "./profilePresentationMapper";

describe("buildParentProfilePresentation", () => {
  it("combines the parent record and session fields into one presentation", () => {
    const result = buildParentProfilePresentation(
      {
        id: "parent-1",
        fullName: "Asha Rao",
        phoneNumber: "+919876543210",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-02T00:00:00Z",
      },
      { email: null, created_at: "2026-01-01T00:00:00Z", last_sign_in_at: "2026-09-01T08:00:00Z" },
    );
    expect(result).toEqual({
      name: "Asha Rao",
      phoneNumber: "+919876543210",
      email: null,
      accountCreatedAt: "2026-01-01T00:00:00Z",
      lastLoginAt: "2026-09-01T08:00:00Z",
    });
  });

  it("returns all-null fields when both inputs are null, rather than a fabricated default", () => {
    const result = buildParentProfilePresentation(null, null);
    expect(result).toEqual({
      name: null,
      phoneNumber: null,
      email: null,
      accountCreatedAt: null,
      lastLoginAt: null,
    });
  });

  it("treats email as honestly unavailable when the session has none (the OTP-only sign-in case)", () => {
    const result = buildParentProfilePresentation(null, { email: undefined });
    expect(result.email).toBeNull();
  });
});

describe("mapLinkedStudentRecord", () => {
  it("maps every field 1:1 into the presentation shape", () => {
    const result = mapLinkedStudentRecord({
      id: "student-1",
      fullName: "Ravi Kumar",
      rollNumber: "21CS001",
      hostelName: "Kalam Hostel",
      roomNumber: "204",
      relationshipType: "father",
    });
    expect(result).toEqual({
      id: "student-1",
      name: "Ravi Kumar",
      rollNumber: "21CS001",
      hostel: "Kalam Hostel",
      room: "204",
      relationship: "father",
    });
  });
});

describe("relationshipLabel", () => {
  it("has a distinct, capitalized label for every relationship type", () => {
    expect(relationshipLabel("father")).toBe("Father");
    expect(relationshipLabel("mother")).toBe("Mother");
    expect(relationshipLabel("guardian")).toBe("Guardian");
  });
});
