import { useCallback, useEffect, useState } from "react";
import {
  biometricService,
  type BiometricAuthResult,
  type BiometricCapabilities,
  type BiometricStepUpResult,
} from "../services/biometric/biometric";
import { biometricPreferenceService } from "../services/biometric/biometricPreference";
import { logger } from "../services/logger/logger";

/**
 * Centralized biometric hook (Prompt 2 foundation — thin wrapper over the
 * then-not-implemented service; made real in Prompt 5). This is the ONLY
 * place any screen should reach for biometric capability/state/actions —
 * screens must never call `expo-local-authentication` or
 * `biometricService`/`biometricPreferenceService` directly.
 *
 * Deliberately NOT part of `AuthContext`/`authStatus` — biometric state is
 * orthogonal to route protection (no accepted ADR/SDD text makes biometric
 * status a routing decision the way trusted-device status is), so this
 * stays a self-contained hook rather than a second authentication state
 * machine layered onto the existing one.
 *
 * `authenticate`/`stepUp` always attempt a real platform authentication
 * when called — they do NOT gate on `isEnabled` themselves. A caller that
 * implements a genuinely SDD-mandated biometric gate (e.g. a future leave
 * approval screen, per SDD Ch.5 §5.2) must call `stepUp` unconditionally;
 * a caller adding an optional, discretionary step-up (as this prompt does
 * for trusted-device removal/replacement) should check `isEnabled` first
 * and only invoke `stepUp` when the user has actually opted in. See
 * docs/authentication.md §16 for the full rationale.
 */
export function useBiometric() {
  const [capabilities, setCapabilities] = useState<BiometricCapabilities | null>(null);
  const [isEnabled, setIsEnabledState] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const refreshStatus = useCallback(async () => {
    setIsLoadingStatus(true);
    try {
      const [nextCapabilities, enabled] = await Promise.all([
        biometricService.getCapabilities(),
        biometricPreferenceService.isEnabled(),
      ]);
      setCapabilities(nextCapabilities);
      setIsEnabledState(enabled);
    } finally {
      setIsLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  /** Requires an actual successful platform authentication before the local
   * preference is ever set — a UI toggle alone can never claim biometrics
   * are enabled. */
  const enable = useCallback(async (): Promise<BiometricAuthResult> => {
    setIsAuthenticating(true);
    try {
      const currentCapabilities = await biometricService.getCapabilities();
      setCapabilities(currentCapabilities);
      if (!currentCapabilities.hardwareAvailable) return { kind: "not_supported" };
      if (!currentCapabilities.enrolled) return { kind: "not_enrolled" };

      const result = await biometricService.authenticate(
        "Confirm it's you to enable biometric authentication",
      );
      if (result.kind === "success") {
        await biometricPreferenceService.setEnabled(true);
        setIsEnabledState(true);
        logger.info("biometric: enabled");
      }
      return result;
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  /** Clears only the local preference — never touches Supabase credentials,
   * trusted-device state, or any backend authorization. */
  const disable = useCallback(async () => {
    await biometricPreferenceService.setEnabled(false);
    setIsEnabledState(false);
    logger.info("biometric: disabled");
  }, []);

  const authenticate = useCallback(async (promptMessage: string): Promise<BiometricAuthResult> => {
    setIsAuthenticating(true);
    try {
      return await biometricService.authenticate(promptMessage);
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  const stepUp = useCallback(
    async (actionId: string, promptMessage: string): Promise<BiometricStepUpResult> => {
      setIsAuthenticating(true);
      try {
        return await biometricService.createAssertion(actionId, promptMessage);
      } finally {
        setIsAuthenticating(false);
      }
    },
    [],
  );

  return {
    capabilities,
    isEnabled,
    isLoadingStatus,
    isAuthenticating,
    refreshStatus,
    enable,
    disable,
    authenticate,
    stepUp,
  };
}
