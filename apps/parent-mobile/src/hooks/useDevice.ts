import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deviceService, type TrustedDeviceSummary } from "../services/devices/devices";
import { mapDeviceError } from "../features/devices/deviceErrors";
import { toAppError } from "../types/errors";
import { useAuth } from "./useAuth";

/**
 * Hook wrapping `deviceService` (Prompt 2 foundation; extended Prompt 3 for
 * the now-real list; extended Prompt 4B with register/revoke; migrated to
 * TanStack Query in Prompt 6). `register`/`revoke` both call through to
 * `deviceService` operations that are currently fail-closed and always
 * reject (see devices.ts's own doc comment) — this hook does not change
 * that; it only gives screens a consistent shape around whatever the
 * service actually does, success or failure.
 *
 * Prompt 6 migration rationale: three separate screens
 * (`security/index.tsx`, `security/devices.tsx`, `security/[deviceId].tsx`,
 * `(onboarding)/devices.tsx`) all call this hook. Under the previous plain
 * `useState`-based implementation each mounted its own independent copy of
 * the device list, re-fetching from scratch on every screen visit — flagged
 * as a real, evidence-based inefficiency in the Prompt 4B quality-gate
 * review (finding PERF-001). `useQuery` with a shared `queryKey` fixes this
 * for free: every screen reads the same cached list, and any screen's
 * `refresh()` (pull-to-refresh) updates what every other mounted screen
 * sees. Mutations invalidate that same cache on success — the backend
 * response, once one exists, is still what determines the final state
 * (`refetch`), never the mutation's own optimistic result.
 */
export const TRUSTED_DEVICES_QUERY_KEY = ["parent-mobile", "trusted-devices"] as const;

export function useDevice() {
  const { refreshDeviceStatus } = useAuth();
  const queryClient = useQueryClient();

  const listQuery = useQuery<TrustedDeviceSummary[]>({
    queryKey: TRUSTED_DEVICES_QUERY_KEY,
    queryFn: () => deviceService.listTrustedDevices(),
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: TRUSTED_DEVICES_QUERY_KEY }),
      refreshDeviceStatus(),
    ]);
  };

  const registerMutation = useMutation({
    mutationFn: () => deviceService.registerCurrentDevice(),
    onSuccess: invalidate,
  });

  const revokeMutation = useMutation({
    mutationFn: (deviceId: string) => deviceService.revokeDevice(deviceId),
    onSuccess: invalidate,
  });

  return {
    devices: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    /** True only for a background refetch of already-loaded data (e.g.
     * pull-to-refresh) — distinct from `isLoading`, the initial fetch. */
    isRefreshing: listQuery.isFetching && !listQuery.isLoading,
    error: listQuery.error ? toAppError(listQuery.error) : null,
    refresh: async () => {
      await listQuery.refetch();
    },
    register: () => registerMutation.mutateAsync(),
    isRegistering: registerMutation.isPending,
    registrationError: registerMutation.error
      ? mapDeviceError(registerMutation.error, "register")
      : null,
    revoke: (deviceId: string) => revokeMutation.mutateAsync(deviceId),
    isRevoking: revokeMutation.isPending,
    revocationError: revokeMutation.error ? mapDeviceError(revokeMutation.error, "revoke") : null,
  };
}
