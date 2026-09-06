import { describe, it, expect, vi, beforeEach } from "vitest";

const fakeFrom = vi.fn();
vi.mock("../supabase/client", () => ({
  getSupabaseClient: () => ({ from: fakeFrom }),
}));

const { profileService } = await import("./profile");

/** Mimics postgrest-js's own "thenable" query builder: awaiting the builder
 * directly (no further `.in()`/`.single()` chained — e.g. a bare
 * `.select("...")` with implicit RLS scoping) resolves to `result`, exactly
 * like `listLinkedStudents()`'s relationships query does in production. */
function makeBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.update = vi.fn(() => builder);
  builder.in = vi.fn(() => Promise.resolve(result));
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.then = (
    onFulfilled: (value: typeof result) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

describe("profileService.getParentProfile", () => {
  beforeEach(() => fakeFrom.mockReset());

  it("maps the row into camelCase, RLS-scoped to the caller's own row", async () => {
    fakeFrom.mockReturnValue(
      makeBuilder({
        data: {
          id: "parent-1",
          full_name: "Asha Rao",
          phone_number: "+919876543210",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-02T00:00:00Z",
        },
        error: null,
      }),
    );
    const result = await profileService.getParentProfile();
    expect(result).toEqual({
      id: "parent-1",
      fullName: "Asha Rao",
      phoneNumber: "+919876543210",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z",
    });
    expect(fakeFrom).toHaveBeenCalledWith("parents");
  });

  it("propagates a query error to the caller", async () => {
    const queryError = { message: "permission denied", code: "42501" };
    fakeFrom.mockReturnValue(makeBuilder({ data: null, error: queryError }));
    await expect(profileService.getParentProfile()).rejects.toBe(queryError);
  });
});

describe("profileService.updateParentProfile", () => {
  beforeEach(() => fakeFrom.mockReset());

  it("trims the name before writing and returns the mapped result", async () => {
    const builder = makeBuilder({
      data: {
        id: "parent-1",
        full_name: "Asha Rao",
        phone_number: "+919876543210",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-03T00:00:00Z",
      },
      error: null,
    });
    fakeFrom.mockReturnValue(builder);

    const result = await profileService.updateParentProfile({ fullName: "  Asha Rao  " });

    expect(builder.update).toHaveBeenCalledWith({ full_name: "Asha Rao" });
    expect(result.fullName).toBe("Asha Rao");
  });

  it("propagates a write error rather than reporting a fake success", async () => {
    const queryError = { message: "row-level security violation", code: "42501" };
    fakeFrom.mockReturnValue(makeBuilder({ data: null, error: queryError }));
    await expect(profileService.updateParentProfile({ fullName: "New Name" })).rejects.toBe(
      queryError,
    );
  });
});

describe("profileService.listLinkedStudents", () => {
  beforeEach(() => fakeFrom.mockReset());

  it("returns an empty array when the parent has no linked students", async () => {
    fakeFrom.mockReturnValue(makeBuilder({ data: [], error: null }));
    await expect(profileService.listLinkedStudents()).resolves.toEqual([]);
  });

  it("joins relationships, students, hostels, and rooms into one record per student", async () => {
    const tables: Record<string, ReturnType<typeof makeBuilder>> = {
      parent_student_relationships: makeBuilder({
        data: [{ student_id: "student-1", relationship_type: "father" }],
        error: null,
      }),
      students: makeBuilder({
        data: [
          {
            id: "student-1",
            full_name: "Ravi Kumar",
            roll_number: "21CS001",
            hostel_id: "hostel-1",
            room_id: "room-1",
          },
        ],
        error: null,
      }),
      hostels: makeBuilder({ data: [{ id: "hostel-1", name: "Kalam Hostel" }], error: null }),
      rooms: makeBuilder({ data: [{ id: "room-1", room_number: "204" }], error: null }),
    };
    fakeFrom.mockImplementation((table: string) => tables[table]);

    const result = await profileService.listLinkedStudents();
    expect(result).toEqual([
      {
        id: "student-1",
        fullName: "Ravi Kumar",
        rollNumber: "21CS001",
        hostelName: "Kalam Hostel",
        roomNumber: "204",
        relationshipType: "father",
      },
    ]);
  });

  it("uses null hostel/room names rather than fabricating a value when a student has no hostel/room assigned", async () => {
    const tables: Record<string, ReturnType<typeof makeBuilder>> = {
      parent_student_relationships: makeBuilder({
        data: [{ student_id: "student-2", relationship_type: "guardian" }],
        error: null,
      }),
      students: makeBuilder({
        data: [
          {
            id: "student-2",
            full_name: "Priya Singh",
            roll_number: "21CS002",
            hostel_id: null,
            room_id: null,
          },
        ],
        error: null,
      }),
    };
    fakeFrom.mockImplementation((table: string) => tables[table]);

    const result = await profileService.listLinkedStudents();
    expect(result).toEqual([
      {
        id: "student-2",
        fullName: "Priya Singh",
        rollNumber: "21CS002",
        hostelName: null,
        roomNumber: null,
        relationshipType: "guardian",
      },
    ]);
  });
});
