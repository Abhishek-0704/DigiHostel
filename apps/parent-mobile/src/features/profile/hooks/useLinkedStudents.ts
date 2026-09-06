import { useQuery, useQueryClient } from "@tanstack/react-query";
import { profileService } from "../../../services/profile/profile";
import { usePendingApprovals } from "../../leave-approval/hooks/usePendingApprovals";
import { mapLinkedStudentRecord } from "../profilePresentationMapper";
import { mapProfileError } from "../profileErrors";
import type { LinkedStudentSummary } from "../types";

export const LINKED_STUDENTS_QUERY_KEY = ["parent-mobile", "profile", "linked-students"] as const;

/**
 * Linked Student list state (Prompt 11). Students come from
 * `profileService.listLinkedStudents()` (real, RLS-scoped — see that
 * service's own doc comment). The leave-activity summary reuses
 * `usePendingApprovals()` — the SAME hook/query the Pending Approval screen
 * uses (Prompt 9B) — filtered client-side by `studentId`, per this prompt's
 * explicit "reuse existing leave/history data... rather than creating
 * another leave-data source" instruction. No second leave query is issued.
 */
export function useLinkedStudents() {
  const queryClient = useQueryClient();
  const studentsQuery = useQuery({
    queryKey: LINKED_STUDENTS_QUERY_KEY,
    queryFn: () => profileService.listLinkedStudents(),
    retry: false,
  });
  const { leaveRequests, isLoading: isLoadingLeave } = usePendingApprovals();

  const students = (studentsQuery.data ?? []).map(mapLinkedStudentRecord);

  const summaries: LinkedStudentSummary[] = students.map((student) => {
    const forStudent = leaveRequests.filter((request) => request.studentId === student.id);
    return {
      student,
      pendingCount: forStudent.filter((request) => request.status === "awaiting_response").length,
      recentActivityCount: forStudent.length,
    };
  });

  return {
    students: summaries,
    isLoading: studentsQuery.isLoading || isLoadingLeave,
    isRefreshing: studentsQuery.isFetching && !studentsQuery.isLoading,
    error: studentsQuery.error ? mapProfileError(studentsQuery.error, "read") : null,
    refresh: async () => {
      await Promise.all([
        studentsQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ["parent-mobile", "leave-approval"] }),
      ]);
    },
  };
}
