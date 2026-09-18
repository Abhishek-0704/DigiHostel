import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  configurationService,
  type CreateConfigurationParams,
  type UpdateConfigurationParams,
  type ValidateConfigurationParams,
} from "../../services/configuration/ConfigurationService";
import { mapConfigurationError } from "./useConfigurationList";
import { CONFIGURATION_STATISTICS_QUERY_KEY } from "./useConfigurationStatistics";

/**
 * The configuration domain's own error classes
 * (`apps/api/src/domain/configuration/errors.ts`) already carry a
 * pre-written, safe, user-facing sentence as their `message` (e.g. "A
 * configuration entry for ... already exists at this scope.", "This
 * configuration entry was changed by someone else since you loaded it."),
 * sent verbatim in the response body's `error.message` field — the same
 * established pattern `useStaffMutations.ts`'s `extractServerErrorMessage`
 * already relies on for the identical reason.
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
 * Mutation layer for the Enterprise Configuration Center (Phase 5,
 * Prompt 14). Every create/update invalidates both the entry list and the
 * statistics strip. `validate` never invalidates anything — it is a
 * stateless preview that persists nothing (matches the backend's own
 * `POST /configuration/validate`, which never writes a row).
 */
export function useConfigurationMutations() {
  const queryClient = useQueryClient();

  const invalidateAll = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["configuration-list"] }),
      queryClient.invalidateQueries({ queryKey: CONFIGURATION_STATISTICS_QUERY_KEY }),
    ]);

  const create = useMutation({
    mutationFn: (params: CreateConfigurationParams) => configurationService.create(params),
    onSuccess: () => invalidateAll(),
  });

  const update = useMutation({
    mutationFn: ({ entryId, params }: { entryId: string; params: UpdateConfigurationParams }) =>
      configurationService.update(entryId, params),
    onSuccess: () => invalidateAll(),
  });

  const validate = useMutation({
    mutationFn: (params: ValidateConfigurationParams) => configurationService.validate(params),
  });

  return { create, update, validate, mapError: mapConfigurationError, extractServerErrorMessage };
}
