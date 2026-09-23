import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  profileService,
  type Profile,
  type ProfileUpdateBody,
} from "../../services/profile/ProfileService";
import { AppError, toAppError, safeMessageFor } from "../../lib/errors/errors";

export const PROFILE_QUERY_KEY = ["my-profile"] as const;

function mapProfileError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status: unknown }).status;
    if (status === 401)
      return new AppError("unauthenticated", safeMessageFor("unauthenticated"), err);
    if (status === 403) return new AppError("forbidden", safeMessageFor("forbidden"), err);
    if (status === 400) {
      // Best-effort extraction of the backend's own safe message (e.g. the
      // mandatory-notification-category rejection) — falls back to the
      // generic validation message if the body isn't the expected shape,
      // matching this codebase's established "never trust raw error
      // detail, but surface an already-safe backend message when present"
      // discipline (apps/api's own errorHandler.ts only ever emits
      // pre-approved messages, never raw exception text).
      const message = (err as { message?: unknown }).message;
      if (typeof message === "string") {
        try {
          const parsed = JSON.parse(message) as { error?: { message?: string } };
          if (parsed.error?.message) {
            return new AppError("validation", parsed.error.message, err);
          }
        } catch {
          // Not JSON — fall through to the generic message below.
        }
      }
      return new AppError("validation", safeMessageFor("validation"), err);
    }
  }
  return toAppError(err);
}

export interface ProfileState {
  profile: Profile | null;
  isLoading: boolean;
  error: AppError | null;
  update: (body: ProfileUpdateBody) => Promise<Profile>;
  isSaving: boolean;
  saveError: AppError | null;
}

/**
 * Server-state layer for the Administrative Profile & Personal Preferences
 * Center (Phase 7, Prompt 17) — mirrors `useAuditLog`'s established
 * `useQuery` shape. A single canonical query key (`PROFILE_QUERY_KEY`) is
 * shared by every consumer (Settings page, ThemeContext's persistence
 * effect, the Header's own future identity read) so a save in one place is
 * reflected everywhere else without a second, independently-fetched copy
 * of the caller's own profile.
 */
export function useProfile(): ProfileState {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: () => profileService.getMyProfile(),
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: (body: ProfileUpdateBody) => profileService.updateMyProfile(body),
    onSuccess: (updated) => {
      queryClient.setQueryData(PROFILE_QUERY_KEY, updated);
    },
  });

  return {
    profile: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error ? mapProfileError(query.error) : null,
    update: (body) => mutation.mutateAsync(body),
    isSaving: mutation.isPending,
    saveError: mutation.error ? mapProfileError(mutation.error) : null,
  };
}

export { mapProfileError };
