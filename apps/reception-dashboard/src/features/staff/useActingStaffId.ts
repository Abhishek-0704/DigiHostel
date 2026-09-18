import { useQuery } from "@tanstack/react-query";
import { staffProfileService } from "../../services/auth/staffProfileService";

export const ACTING_STAFF_PROFILE_QUERY_KEY = ["acting-staff-profile"] as const;

/**
 * The signed-in super_admin's own staff id — used ONLY to disable
 * self-targeting controls in this UI (e.g. "Change Role" on your own row).
 * This is a UX convenience, not a security boundary: every mutation this
 * page can trigger independently re-checks `targetStaffId !== callerStaffId`
 * server-side (`self_target_forbidden`, 403) regardless of what this hook
 * returns — matching this app's own established distinction between
 * `AuthorizationContext` (UX) and Fastify guards/RLS (the real boundary).
 *
 * Reuses `staffProfileService.getMyStaffProfile()` — the exact same
 * RLS-protected own-row read `AuthorizationContext` already performs
 * internally — rather than introducing a second profile-fetch mechanism.
 */
export function useActingStaffId(): string | null {
  const query = useQuery({
    queryKey: ACTING_STAFF_PROFILE_QUERY_KEY,
    queryFn: () => staffProfileService.getMyStaffProfile(),
    staleTime: 5 * 60 * 1000,
  });
  return query.data?.id ?? null;
}
