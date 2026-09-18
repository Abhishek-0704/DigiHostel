import {
  searchStudents,
  getStudentProfile,
  type StudentSearchResult,
  type StudentProfile,
} from "@digihostel/api-client-react";

export interface StudentSearchParams {
  q?: string;
  page: number;
  pageSize: number;
  sortBy: "fullName" | "rollNumber";
  sortDir: "asc" | "desc";
}

/**
 * Student Operations Center service (Phase 4, Prompt 8) — real
 * implementation, replacing Prompt 0.2's interface-only placeholder
 * (`searchByRollNumber(rollNumber): Promise<StudentSummary | null>`).
 * Calls the generated plain function directly, matching
 * `LeaveService.ts`'s/`approvals.ts`'s established pattern — a thin
 * transport wrapper. The backend (`GET /api/v1/students`,
 * `GET /api/v1/students/{rollNumber}`) resolves hostel scope entirely
 * server-side from the authenticated caller's own staff identity; this
 * service performs no authorization or scoping of its own.
 */
export interface StudentOperationsService {
  search(params: StudentSearchParams): Promise<StudentSearchResult>;
  getProfile(rollNumber: string): Promise<StudentProfile>;
}

export const studentOperationsService: StudentOperationsService = {
  async search(params: StudentSearchParams) {
    return searchStudents({
      q: params.q,
      page: params.page,
      pageSize: params.pageSize,
      sortBy: params.sortBy,
      sortDir: params.sortDir,
    });
  },
  async getProfile(rollNumber: string) {
    return getStudentProfile(rollNumber);
  },
};

export type { StudentSearchResult, StudentProfile };
