import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  staffAdminService,
  type CreateStaffParams,
  type StaffAdminRole,
  type StaffAdminStatus,
} from "../../services/staff/StaffService";
import { mapStaffError } from "./useStaffDirectory";
import { STAFF_STATISTICS_QUERY_KEY } from "./useStaffStatistics";

/**
 * The staff-admin domain's own error classes (`apps/api/src/domain/staff/errors.ts`)
 * already carry a pre-written, safe, user-facing sentence as their `message`
 * (e.g. "A staff account with this email already exists.", "Cannot suspend
 * the only remaining active super_admin..."), sent verbatim in the response
 * body's `error.message` field (`sendStaffAdminError`). That text is
 * intended for exactly this display, unlike an unhandled 500's raw detail
 * (which the backend's global error handler already sanitizes before it
 * ever reaches this client) — so it is safe to surface directly rather than
 * collapsing every 4xx down to one generic sentence.
 */
export function extractServerErrorMessage(err: unknown): string | null {
  if (typeof err !== "object" || err === null || !("message" in err)) return null;
  const raw = (err as { message: unknown }).message;
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: unknown } };
    return typeof parsed.error?.message === "string" ? parsed.error.message : null;
  } catch {
    return null;
  }
}

/**
 * Mutation layer for the Identity & Access Administration Center (Phase 5,
 * Prompt 13). Every mutation invalidates both the directory list and the
 * statistics strip — a role/status change can move a row between filtered
 * views and always changes the aggregate counts. No mutation here performs
 * any authorization or self-target/last-admin check of its own — the
 * backend re-verifies every one of those independently (403/409), and this
 * layer only surfaces whatever the server decided.
 */
export function useStaffMutations() {
  const queryClient = useQueryClient();

  const invalidateAll = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["staff-directory"] }),
      queryClient.invalidateQueries({ queryKey: STAFF_STATISTICS_QUERY_KEY }),
    ]);

  const create = useMutation({
    mutationFn: (params: CreateStaffParams) => staffAdminService.create(params),
    onSuccess: () => invalidateAll(),
  });

  const changeRole = useMutation({
    mutationFn: ({ staffId, role }: { staffId: string; role: StaffAdminRole }) =>
      staffAdminService.changeRole(staffId, role),
    onSuccess: () => invalidateAll(),
  });

  const changeHostel = useMutation({
    mutationFn: ({ staffId, hostelId }: { staffId: string; hostelId: string | null }) =>
      staffAdminService.changeHostel(staffId, hostelId),
    onSuccess: () => invalidateAll(),
  });

  const changeStatus = useMutation({
    mutationFn: ({ staffId, status }: { staffId: string; status: StaffAdminStatus }) =>
      staffAdminService.changeStatus(staffId, status),
    onSuccess: () => invalidateAll(),
  });

  const resetPassword = useMutation({
    mutationFn: (staffId: string) => staffAdminService.resetPassword(staffId),
  });

  const forceSignOut = useMutation({
    mutationFn: (staffId: string) => staffAdminService.forceSignOut(staffId),
  });

  return {
    create,
    changeRole,
    changeHostel,
    changeStatus,
    resetPassword,
    forceSignOut,
    mapError: mapStaffError,
    extractServerErrorMessage,
  };
}
