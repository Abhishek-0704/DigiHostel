import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { studentOperationsService } from "../../services/students/StudentService";
import { AppError, toAppError, safeMessageFor } from "../../lib/errors/errors";
import type { StudentProfile } from "@digihostel/api-client-react";

function mapStudentProfileError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status: unknown }).status;
    if (status === 401)
      return new AppError("unauthenticated", safeMessageFor("unauthenticated"), err);
    if (status === 403) return new AppError("forbidden", safeMessageFor("forbidden"), err);
    // 404 is deliberately indistinguishable from "outside your hostel scope"
    // (anti-enumeration, backend's own routes/students.ts doc comment) — the
    // UI must show the same honest "not found" message either way, never a
    // different one that would let a caller infer the student actually
    // exists elsewhere.
    if (status === 404) return new AppError("not_found", safeMessageFor("not_found"), err);
  }
  return toAppError(err);
}

export const studentProfileQueryKey = (rollNumber: string) =>
  ["student-profile", rollNumber] as const;

export interface StudentProfileState {
  profile: StudentProfile | null;
  isLoading: boolean;
  error: AppError | null;
  refresh: () => Promise<void>;
}

/**
 * Server-state layer for the Student Operations Center profile (Phase 4,
 * Prompt 8) — thin `useQuery` wrapper, matching `useLeaveQueue`'s
 * established convention. `enabled: false` when `rollNumber` is falsy lets
 * the profile page render its own "no student selected" state without an
 * unnecessary request.
 */
export function useStudentProfile(rollNumber: string | undefined): StudentProfileState {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: studentProfileQueryKey(rollNumber ?? ""),
    queryFn: () => studentOperationsService.getProfile(rollNumber!),
    enabled: Boolean(rollNumber),
  });

  const refresh = useCallback(async () => {
    if (!rollNumber) return;
    await queryClient.invalidateQueries({ queryKey: studentProfileQueryKey(rollNumber) });
  }, [queryClient, rollNumber]);

  return {
    profile: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error ? mapStudentProfileError(query.error) : null,
    refresh,
  };
}
