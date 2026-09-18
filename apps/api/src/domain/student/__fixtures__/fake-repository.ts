import type { StudentRepository } from "../repository.js";
import type {
  StaffScopeInput,
  StudentSearchInput,
  StudentSearchResult,
  StudentProfileView,
} from "../types.js";

interface FakeStudentRow {
  id: string;
  rollNumber: string;
  fullName: string;
  hostelId: string | null;
  hostelName: string | null;
  roomId: string | null;
  roomNumber: string | null;
}

/** Deterministic in-memory fake of StudentRepository — no live database
 * connection. Mirrors the real repository's core invariant (hostel-scoped
 * visibility, anti-enumeration via a single `null` for "not found or not
 * yours") so unit tests of StudentService's error handling stay meaningful
 * without needing real Postgres — same convention as
 * domain/leave/__fixtures__/fake-repository.ts. */
export class FakeStudentRepository implements StudentRepository {
  students: FakeStudentRow[] = [];
  staffHostels = new Map<string, string>(); // staffId -> hostelId
  profiles = new Map<string, StudentProfileView>(); // rollNumber -> full profile

  private isInScope(hostelId: string | null, scope: StaffScopeInput): boolean {
    if (scope.staffRole === "super_admin") return true;
    const staffHostel = this.staffHostels.get(scope.staffId) ?? null;
    return staffHostel !== null && staffHostel === hostelId;
  }

  async search(input: StudentSearchInput): Promise<StudentSearchResult> {
    const inScope = this.students.filter((s) => this.isInScope(s.hostelId, input));
    const query = input.query?.trim().toLowerCase();
    const filtered = query
      ? inScope.filter(
          (s) =>
            s.fullName.toLowerCase().startsWith(query) ||
            s.rollNumber.toLowerCase().startsWith(query),
        )
      : inScope;

    const sorted = [...filtered].sort((a, b) => {
      const primary =
        input.sortBy === "rollNumber"
          ? a.rollNumber.localeCompare(b.rollNumber)
          : a.fullName.localeCompare(b.fullName);
      const directed = input.sortDir === "desc" ? -primary : primary;
      return directed !== 0 ? directed : a.id.localeCompare(b.id);
    });

    const start = (input.page - 1) * input.pageSize;
    const items = sorted.slice(start, start + input.pageSize);

    return { items, total: sorted.length, page: input.page, pageSize: input.pageSize };
  }

  async getProfileByRollNumber(
    rollNumber: string,
    scope: StaffScopeInput,
  ): Promise<StudentProfileView | null> {
    const student = this.students.find((s) => s.rollNumber === rollNumber);
    if (!student) return null;
    if (!this.isInScope(student.hostelId, scope)) return null;

    return (
      this.profiles.get(rollNumber) ?? {
        id: student.id,
        rollNumber: student.rollNumber,
        fullName: student.fullName,
        hostelId: student.hostelId,
        hostelName: student.hostelName,
        roomId: student.roomId,
        roomNumber: student.roomNumber,
        guardians: [],
        currentLeave: null,
        timeline: [],
        hostelPresence: "inside_hostel",
      }
    );
  }
}
