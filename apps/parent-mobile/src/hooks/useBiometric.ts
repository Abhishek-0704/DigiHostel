import { useCallback, useState } from "react";
import { biometricService, type BiometricCheckResult } from "../services/biometric/biometric";
import { toAppError } from "../types/errors";

/**
 * Thin hook wrapping the (currently not-implemented) biometric service —
 * exposes a consistent loading/error shape so a future screen doesn't need
 * its own try/catch boilerplate around the service call. `authenticate()`
 * currently always resolves with `success: false` (never throws to the
 * caller) so a consuming screen can render a normal "unavailable" state
 * rather than crash — the underlying service still fails loudly internally
 * (BiometricNotImplementedError, logged), it just isn't rethrown here.
 */
export function useBiometric() {
  const [isChecking, setIsChecking] = useState(false);

  const authenticate = useCallback(async (promptMessage: string): Promise<BiometricCheckResult> => {
    setIsChecking(true);
    try {
      return await biometricService.authenticate(promptMessage);
    } catch (err) {
      toAppError(err); // logged via the error taxonomy's cause chain if a caller logs it
      return { success: false, reason: "not_available" };
    } finally {
      setIsChecking(false);
    }
  }, []);

  return { authenticate, isChecking };
}
