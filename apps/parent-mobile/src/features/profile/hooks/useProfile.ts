import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { profileService } from "../../../services/profile/profile";
import { useSession } from "../../../hooks/useSession";
import { buildParentProfilePresentation } from "../profilePresentationMapper";
import { mapProfileError } from "../profileErrors";

export const PARENT_PROFILE_QUERY_KEY = ["parent-mobile", "profile", "parent"] as const;

/**
 * Parent Profile state (Prompt 11). `parents.full_name`/`phone_number` come
 * from a real, RLS-scoped Supabase read (`profileService.getParentProfile()`,
 * mirroring `useDevice()`'s established TanStack Query pattern);
 * `email`/`accountCreatedAt`/`lastLoginAt` come from the ALREADY-loaded
 * Supabase Auth session (`useSession()`, Prompt 2 — no new fetch).
 *
 * `updateProfile()` is a REAL mutation (`parents_update_own` RLS grant) —
 * unlike every other "write" in this app's history, this one is not
 * fail-closed: changing your own display name has no security-decision
 * implication the way device trust/attestation does, so a direct RLS-scoped
 * write is the correct, minimal architecture here (see
 * `services/profile/profile.ts`'s own doc comment).
 */
export function useProfile() {
  const queryClient = useQueryClient();
  const { session, isLoading: isSessionLoading } = useSession();

  const parentQuery = useQuery({
    queryKey: PARENT_PROFILE_QUERY_KEY,
    queryFn: () => profileService.getParentProfile(),
    retry: false,
  });

  const updateMutation = useMutation({
    mutationFn: (fullName: string) => profileService.updateParentProfile({ fullName }),
    onSuccess: (updated) => {
      queryClient.setQueryData(PARENT_PROFILE_QUERY_KEY, updated);
    },
  });

  const presentation = buildParentProfilePresentation(
    parentQuery.data ?? null,
    session?.user ?? null,
  );

  return {
    profile: presentation,
    isLoading: parentQuery.isLoading || isSessionLoading,
    isRefreshing: parentQuery.isFetching && !parentQuery.isLoading,
    error: parentQuery.error ? mapProfileError(parentQuery.error, "read") : null,
    refresh: async () => {
      await parentQuery.refetch();
    },
    updateProfile: (fullName: string) => updateMutation.mutateAsync(fullName),
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error ? mapProfileError(updateMutation.error, "write") : null,
    resetUpdateState: () => updateMutation.reset(),
  };
}
