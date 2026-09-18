import { describe, it, expect } from "vitest";
import { StudentService } from "./service.js";
import { FakeStudentRepository } from "./__fixtures__/fake-repository.js";
import { StudentNotFoundError } from "./errors.js";

const RECEPTION_A = { staffId: "staff-a", staffRole: "reception_warden" as const };
const RECEPTION_B = { staffId: "staff-b", staffRole: "reception_warden" as const };
const SUPER_ADMIN = { staffId: "staff-super", staffRole: "super_admin" as const };

function seed(repo: FakeStudentRepository) {
  repo.staffHostels.set("staff-a", "hostel-a");
  repo.staffHostels.set("staff-b", "hostel-b");
  repo.students.push(
    {
      id: "student-1",
      rollNumber: "A001",
      fullName: "Alice Anand",
      hostelId: "hostel-a",
      hostelName: "Kalinga",
      roomId: "room-1",
      roomNumber: "101",
    },
    {
      id: "student-2",
      rollNumber: "B002",
      fullName: "Bob Bose",
      hostelId: "hostel-b",
      hostelName: "Utkal",
      roomId: "room-2",
      roomNumber: "202",
    },
    {
      id: "student-3",
      rollNumber: "A003",
      fullName: "Amit Ash",
      hostelId: "hostel-a",
      hostelName: "Kalinga",
      roomId: null,
      roomNumber: null,
    },
  );
}

describe("StudentService.search — hostel scope", () => {
  it("reception (Hostel A) sees only Hostel A students", async () => {
    const repo = new FakeStudentRepository();
    seed(repo);
    const service = new StudentService(repo);

    const result = await service.search({
      ...RECEPTION_A,
      page: 1,
      pageSize: 20,
      sortBy: "fullName",
      sortDir: "asc",
    });

    expect(result.items.map((i) => i.rollNumber).sort()).toEqual(["A001", "A003"]);
  });

  it("reception (Hostel B) never sees Hostel A students", async () => {
    const repo = new FakeStudentRepository();
    seed(repo);
    const service = new StudentService(repo);

    const result = await service.search({
      ...RECEPTION_B,
      page: 1,
      pageSize: 20,
      sortBy: "fullName",
      sortDir: "asc",
    });

    expect(result.items.map((i) => i.rollNumber)).toEqual(["B002"]);
  });

  it("super_admin sees every hostel's students", async () => {
    const repo = new FakeStudentRepository();
    seed(repo);
    const service = new StudentService(repo);

    const result = await service.search({
      ...SUPER_ADMIN,
      page: 1,
      pageSize: 20,
      sortBy: "fullName",
      sortDir: "asc",
    });

    expect(result.total).toBe(3);
  });
});

describe("StudentService.search — query, sort, pagination", () => {
  it("prefix-matches full name (case-insensitive)", async () => {
    const repo = new FakeStudentRepository();
    seed(repo);
    const service = new StudentService(repo);

    const result = await service.search({
      ...SUPER_ADMIN,
      query: "al",
      page: 1,
      pageSize: 20,
      sortBy: "fullName",
      sortDir: "asc",
    });

    expect(result.items.map((i) => i.rollNumber)).toEqual(["A001"]);
  });

  it("prefix-matches roll number", async () => {
    const repo = new FakeStudentRepository();
    seed(repo);
    const service = new StudentService(repo);

    const result = await service.search({
      ...SUPER_ADMIN,
      query: "A00",
      page: 1,
      pageSize: 20,
      sortBy: "fullName",
      sortDir: "asc",
    });

    expect(result.items.map((i) => i.rollNumber).sort()).toEqual(["A001", "A003"]);
  });

  it("does NOT match a substring that isn't a prefix", async () => {
    const repo = new FakeStudentRepository();
    seed(repo);
    const service = new StudentService(repo);

    const result = await service.search({
      ...SUPER_ADMIN,
      query: "nand", // "Anand" contains this, but it is not a prefix
      page: 1,
      pageSize: 20,
      sortBy: "fullName",
      sortDir: "asc",
    });

    expect(result.items).toEqual([]);
  });

  it("paginates deterministically with a stable tie-breaker", async () => {
    const repo = new FakeStudentRepository();
    seed(repo);
    const service = new StudentService(repo);

    const page1 = await service.search({
      ...SUPER_ADMIN,
      page: 1,
      pageSize: 2,
      sortBy: "fullName",
      sortDir: "asc",
    });
    const page2 = await service.search({
      ...SUPER_ADMIN,
      page: 2,
      pageSize: 2,
      sortBy: "fullName",
      sortDir: "asc",
    });

    expect(page1.items).toHaveLength(2);
    expect(page2.items).toHaveLength(1);
    const allRollNumbers = [...page1.items, ...page2.items].map((i) => i.rollNumber);
    expect(new Set(allRollNumbers).size).toBe(3); // no duplicate/skipped row across pages
  });
});

describe("StudentService.getProfileByRollNumber — anti-enumeration", () => {
  it("own-hostel roll number: resolves", async () => {
    const repo = new FakeStudentRepository();
    seed(repo);
    const service = new StudentService(repo);

    const profile = await service.getProfileByRollNumber("A001", RECEPTION_A);
    expect(profile.fullName).toBe("Alice Anand");
  });

  it("cross-hostel roll number: StudentNotFoundError (not a different error)", async () => {
    const repo = new FakeStudentRepository();
    seed(repo);
    const service = new StudentService(repo);

    await expect(service.getProfileByRollNumber("B002", RECEPTION_A)).rejects.toBeInstanceOf(
      StudentNotFoundError,
    );
  });

  it("nonexistent roll number: the identical StudentNotFoundError", async () => {
    const repo = new FakeStudentRepository();
    seed(repo);
    const service = new StudentService(repo);

    await expect(service.getProfileByRollNumber("NONEXISTENT", RECEPTION_A)).rejects.toBeInstanceOf(
      StudentNotFoundError,
    );
  });

  it("super_admin resolves any hostel's roll number", async () => {
    const repo = new FakeStudentRepository();
    seed(repo);
    const service = new StudentService(repo);

    const profile = await service.getProfileByRollNumber("B002", SUPER_ADMIN);
    expect(profile.fullName).toBe("Bob Bose");
  });

  it("a student profile with no leave request returns currentLeave: null and an empty timeline", async () => {
    const repo = new FakeStudentRepository();
    seed(repo);
    const service = new StudentService(repo);

    const profile = await service.getProfileByRollNumber("A001", RECEPTION_A);
    expect(profile.currentLeave).toBeNull();
    expect(profile.timeline).toEqual([]);
    expect(profile.guardians).toEqual([]);
  });

  it("a student with no leave request is reported as inside_hostel — never a fabricated outside/unknown state", async () => {
    const repo = new FakeStudentRepository();
    seed(repo);
    const service = new StudentService(repo);

    const profile = await service.getProfileByRollNumber("A001", RECEPTION_A);
    expect(profile.hostelPresence).toBe("inside_hostel");
  });
});
