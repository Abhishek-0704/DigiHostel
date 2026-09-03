import { useCallback, useState } from "react";
import { deviceService, type TrustedDeviceSummary } from "../services/devices/devices";
import { AppError, toAppError } from "../types/errors";

/** Thin hook wrapping the (currently not-implemented) device service — same
 * consistent loading/error shape as useBiometric. Unlike useBiometric, this
 * one surfaces the AppError to the caller (via a returned error state)
 * rather than swallowing it, since device management has no safe
 * default result to fall back to. */
export function useDevice() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [devices, setDevices] = useState<TrustedDeviceSummary[]>([]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setDevices(await deviceService.listTrustedDevices());
    } catch (err) {
      setError(toAppError(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { devices, isLoading, error, refresh };
}
