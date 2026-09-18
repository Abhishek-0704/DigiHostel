import type { StudentRepository } from "./repository.js";
import type {
  StudentSearchInput,
  StudentSearchResult,
  StaffScopeInput,
  StudentProfileView,
} from "./types.js";
import { StudentNotFoundError } from "./errors.js";

/**
 * Service boundary for the Student Operations Center (Phase 4, Prompt 8) —
 * thin pass-through over the repository, mirroring `LeaveService`'s own
 * shape. The only logic beyond delegation is turning a `null` profile
 * result into the typed `StudentNotFoundError` the route maps to a 404 —
 * anti-enumeration is the repository's job (a single `null` for both "no
 * such student" and "outside scope"), this layer just converts that
 * absence into the same error shape every other domain uses.
 */
export class StudentService {
  constructor(private readonly repository: StudentRepository) {}

  async search(input: StudentSearchInput): Promise<StudentSearchResult> {
    return this.repository.search(input);
  }

  async getProfileByRollNumber(
    rollNumber: string,
    scope: StaffScopeInput,
  ): Promise<StudentProfileView> {
    const profile = await this.repository.getProfileByRollNumber(rollNumber, scope);
    if (!profile) throw new StudentNotFoundError(rollNumber);
    return profile;
  }
}
