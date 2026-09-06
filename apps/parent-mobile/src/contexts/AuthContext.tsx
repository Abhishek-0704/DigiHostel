import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { authService } from "../services/supabase/auth";
import { deviceService } from "../services/devices/devices";
import {
  otpEligibilityService,
  type ParentRelationshipType,
} from "../services/auth/otpEligibility";
import { mapOtpError } from "../features/authentication/otpErrors";
import { AppError } from "../types/errors";
import { logger } from "../services/logger/logger";
import { useSessionContext } from "./SessionContext";
import { deriveAuthStatus, type AuthStatus, type DeviceCheckStatus } from "./authStatus";

/**
 * Canonical authentication + application-authorization state (Prompt 3).
 *
 * This is the ONE place route protection (AuthGate) and any future screen
 * should read auth state from — it does not compete with SessionContext
 * (Prompt 2, unchanged): SessionContext remains the single source of raw
 * Supabase session truth; AuthContext derives a richer, routing-relevant
 * status from it plus the device-trust check, and exposes the OTP
 * request/verify/sign-out actions. See src/contexts/authStatus.ts for the
 * pure decision logic this wraps.
 *
 * Authentication (a valid Supabase session exists) is explicitly NOT the
 * same thing as application authorization (a trusted device exists) — see
 * `status`'s possible values. Neither is itself the real authorization
 * boundary: Fastify's guards + RLS remain authoritative regardless of what
 * this context believes (apps/parent-mobile/docs/authentication.md).
 */
interface AuthContextValue {
  status: AuthStatus;
  error: AppError | null;
  /** Resolves eligibility server-side and, if eligible, dispatches an OTP —
   * always resolves with a challenge id regardless of eligibility
   * (anti-enumeration, F-02 remediation). Never accepts or returns a phone
   * number. */
  requestOtp: (
    rollNumber: string,
    relationshipType: ParentRelationshipType,
  ) => Promise<{ challengeId: string }>;
  /** Verifies the code against the given challenge and, on success, adopts
   * the resulting backend-issued Supabase session locally. */
  verifyOtp: (challengeId: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-runs the device-trust check — e.g. after a future device
   * registration flow (Prompt 5/6) completes, or a manual pull-to-refresh
   * on the "device verification required" screen. */
  refreshDeviceStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function classifyDeviceCheckError(err: unknown): DeviceCheckStatus {
  // Supabase's postgrest-js client throws a plain TypeError when the
  // underlying fetch itself fails (no connectivity) — distinct from a
  // PostgrestError, which means the request reached the server. This is a
  // best-effort classification, not a guarantee, and is only used for a
  // routing/UX signal, never a security decision.
  if (err instanceof TypeError) return { kind: "network_error" };
  return { kind: "error" };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { session, isLoading: sessionLoading, configError } = useSessionContext();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [deviceCheck, setDeviceCheck] = useState<DeviceCheckStatus>({ kind: "idle" });
  const [error, setError] = useState<AppError | null>(null);

  // Tracks whether the app itself just initiated a sign-out, to distinguish
  // an intentional logout from an unexpected session loss (refresh
  // failure, remote revocation) — see authStatus.ts's doc comment on why
  // this heuristic exists and its known limitation.
  const isSigningOutRef = useRef(false);
  const hadSessionRef = useRef(false);
  const [unexpectedSessionLoss, setUnexpectedSessionLoss] = useState(false);

  useEffect(() => {
    if (session) {
      hadSessionRef.current = true;
      setUnexpectedSessionLoss(false);
    } else if (hadSessionRef.current) {
      setUnexpectedSessionLoss(!isSigningOutRef.current);
      hadSessionRef.current = false;
    }
    isSigningOutRef.current = false;
  }, [session]);

  const checkDeviceStatus = useCallback(async () => {
    setDeviceCheck({ kind: "loading" });
    try {
      const trusted = await deviceService.hasActiveTrustedDevice();
      setDeviceCheck({ kind: trusted ? "trusted" : "untrusted" });
      logger.info("device: trust check completed", { trusted });
    } catch (err) {
      const classified = classifyDeviceCheckError(err);
      setDeviceCheck(classified);
      logger.warn("device: trust check failed", { kind: classified.kind });
    }
  }, []);

  useEffect(() => {
    if (session) {
      void checkDeviceStatus();
    } else {
      setDeviceCheck({ kind: "idle" });
    }
  }, [session, checkDeviceStatus]);

  const requestOtp = useCallback(
    async (rollNumber: string, relationshipType: ParentRelationshipType) => {
      setIsAuthenticating(true);
      setError(null);
      try {
        return await otpEligibilityService.requestOtp(rollNumber, relationshipType);
      } catch (err) {
        const mapped = mapOtpError(err);
        setError(mapped);
        throw mapped;
      } finally {
        setIsAuthenticating(false);
      }
    },
    [],
  );

  const verifyOtp = useCallback(async (challengeId: string, code: string) => {
    setIsAuthenticating(true);
    setError(null);
    try {
      const { accessToken, refreshToken } = await otpEligibilityService.verifyOtp(
        challengeId,
        code,
      );
      await authService.adoptSession(accessToken, refreshToken);
      // Session/device-check effects above react to the resulting session
      // change automatically — no extra state update needed here.
    } catch (err) {
      const mapped = mapOtpError(err);
      setError(mapped);
      throw mapped;
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    isSigningOutRef.current = true;
    setError(null);
    await authService.signOut();
  }, []);

  const status = deriveAuthStatus({
    sessionLoading,
    configError,
    hasSession: session !== null,
    isAuthenticating,
    deviceCheck,
    unexpectedSessionLoss,
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      error,
      requestOtp,
      verifyOtp,
      signOut,
      refreshDeviceStatus: checkDeviceStatus,
    }),
    [status, error, requestOtp, verifyOtp, signOut, checkDeviceStatus],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used within an AuthProvider");
  return ctx;
}
