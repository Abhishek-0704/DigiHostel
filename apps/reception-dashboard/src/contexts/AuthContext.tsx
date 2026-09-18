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
import { authService } from "../services/auth/authService";
import { mfaService } from "../services/auth/mfaService";
import { staffAuthAuditService } from "../services/auth/staffAuthAuditService";
import { useInactivityTimer } from "../hooks/useInactivityTimer";
import { SESSION_TIMEOUT_CONFIG } from "../lib/sessionTimeout/config";
import type { InactivityStatus } from "../lib/sessionTimeout/inactivityStatus";
import { logger } from "../lib/logging/logger";
import { useSessionContext } from "./SessionContext";
import { deriveAuthStatus, type AuthStatus } from "./authStatus";

type AssuranceLevel = { currentLevel: string | null; nextLevel: string | null } | null | undefined;

/** Why the current sign-out happened — the §17 "session expired / signed
 * out" UX-contract distinction, as data, not UI. `null` until the first
 * sign-out of this page load. Prompt 2's UI reads this to explain WHY the
 * user landed back on the login screen, instead of a generic message every
 * time. */
export type SignOutReason = "user_initiated" | "inactivity_timeout" | "session_invalid" | null;

/**
 * Authentication-state boundary (Prompt 0.2 §11/§13/§14/§15, completed
 * Prompt 1 — Authentication Infrastructure). This is the ONE place route
 * protection (RequireAuth) reads auth state from — it does not compete with
 * SessionContext (unchanged): SessionContext remains the single source of
 * raw Supabase session truth; AuthContext derives a routing-relevant status
 * from it (MFA-aware, per ADR-024) and now owns the full session lifecycle:
 * sign-out (with reason tracking), inactivity timeout, and reactive
 * authentication-event audit reporting.
 *
 * Still deliberately does NOT expose a `signIn`/`verifyMfa` method here —
 * Prompt 1 §7's own instruction is that the UI calls `authService`/
 * `mfaService` directly (Prompt 2's login/MFA screen), and this context's
 * derived `status` reacts automatically once the underlying session/
 * assurance-level changes via SessionContext's `onAuthStateChange`
 * subscription. Keeping the imperative call and the reactive state
 * derivation in different places is intentional, not an oversight — it's
 * what lets `sign_in_success`/`mfa_success` audit events (below) be
 * detected from the actual resulting state change rather than requiring
 * every future call site to remember to report them.
 *
 * `mfa_failure` is the one audit event NOT fired reactively here — a failed
 * `mfaService.verify()` call leaves the session's assurance level exactly
 * as it was (no observable state transition to react to), so it must be
 * reported explicitly by whichever screen catches that error
 * (`staffAuthAuditService.record("mfa_failure")`, Prompt 2).
 *
 * Authentication (even MFA-verified) is not the same thing as
 * authorization. Neither is itself the real authorization boundary:
 * Fastify's guards + RLS remain authoritative regardless of what this
 * context believes (Prompt 0.2 §27 — "client-side authorization is never
 * the security boundary").
 */
interface AuthContextValue {
  status: AuthStatus;
  /** Defaults to `"user_initiated"` when no reason is given — matches
   * calling `signOut()` from an explicit "Sign out" button. Pass
   * `"inactivity_timeout"` only from the inactivity-timer wiring below;
   * nothing else should ever pass it. */
  signOut: (reason?: SignOutReason) => Promise<void>;
  /** Re-runs the assurance-level check — e.g. after a future MFA challenge
   * screen (Prompt 2) completes and the session's AAL has just changed. */
  refreshAssuranceLevel: () => Promise<void>;
  lastSignOutReason: SignOutReason;
  inactivityStatus: InactivityStatus;
  inactivityRemainingMs: number;
  /** Lets Prompt 2's "you're about to be signed out" prompt's own "stay
   * signed in" button reset the clock without waiting for a tracked
   * browser event. */
  resetInactivityTimer: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { session, isLoading: sessionLoading, configError } = useSessionContext();
  const [assuranceLevel, setAssuranceLevel] = useState<AssuranceLevel>(undefined);
  const [lastSignOutReason, setLastSignOutReason] = useState<SignOutReason>(null);

  // Tracks whether THIS sign-out was initiated by us (a deliberate
  // signOut() call, for any reason) vs. the session disappearing on its
  // own (token refresh failure, remote revocation, another tab signing
  // out) — mirrors the exact pattern apps/parent-mobile's own AuthContext
  // already validated for the identical "distinguish intentional logout
  // from unexpected session loss" problem.
  const isSigningOutRef = useRef(false);
  const hadSessionRef = useRef(false);
  const hasInitializedSessionRef = useRef(false);
  // Guards mfa_success against firing on a page reload that happens to
  // already be at aal2 (no MFA action actually just occurred) — only a
  // genuine non-aal2 -> aal2 TRANSITION observed after this component's
  // first resolved check fires the event.
  const wasAal2Ref = useRef(false);
  const hasInitializedAalRef = useRef(false);

  const checkAssuranceLevel = useCallback(async () => {
    setAssuranceLevel(undefined);
    try {
      const data = await mfaService.getAssuranceLevel();
      setAssuranceLevel(
        data ? { currentLevel: data.currentLevel, nextLevel: data.nextLevel } : null,
      );
    } catch (err) {
      // Fail closed (never treat an unreadable assurance level as
      // sufficient) — authStatus.ts maps `null` to "mfa_required".
      setAssuranceLevel(null);
      logger.warn("mfa: assurance-level check failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  useEffect(() => {
    if (session) {
      void checkAssuranceLevel();
    } else {
      setAssuranceLevel(undefined);
    }
  }, [session, checkAssuranceLevel]);

  // Reactive: sign_in_success audit + unexpected-session-loss detection.
  useEffect(() => {
    if (sessionLoading) return; // initial restoration still in flight

    if (session) {
      if (hasInitializedSessionRef.current && !hadSessionRef.current) {
        void staffAuthAuditService.record("sign_in_success");
      }
      hadSessionRef.current = true;
    } else if (hadSessionRef.current) {
      hadSessionRef.current = false;
      if (!isSigningOutRef.current) {
        setLastSignOutReason("session_invalid");
      }
      isSigningOutRef.current = false;
    }
    hasInitializedSessionRef.current = true;
  }, [session, sessionLoading]);

  // Reactive: mfa_success audit on a genuine aal1(or unknown)->aal2 transition.
  useEffect(() => {
    if (assuranceLevel === undefined) return; // still checking
    const isAal2 = assuranceLevel?.currentLevel === "aal2";
    if (hasInitializedAalRef.current && isAal2 && !wasAal2Ref.current) {
      void staffAuthAuditService.record("mfa_success");
    }
    wasAal2Ref.current = isAal2;
    hasInitializedAalRef.current = true;
  }, [assuranceLevel]);

  const status = deriveAuthStatus({
    sessionLoading,
    configError,
    hasSession: session !== null,
    assuranceLevel,
  });

  const signOut = useCallback(
    async (reason: SignOutReason = "user_initiated") => {
      isSigningOutRef.current = true;
      setLastSignOutReason(reason);
      if (session) {
        // Reported BEFORE the call below, while the bearer token is still
        // valid — signOut() itself invalidates it.
        void staffAuthAuditService.record("sign_out");
      }
      await authService.signOut();
    },
    [session],
  );

  const inactivity = useInactivityTimer(SESSION_TIMEOUT_CONFIG, status === "authenticated");

  useEffect(() => {
    if (inactivity.status === "expired" && status === "authenticated") {
      void signOut("inactivity_timeout");
    }
  }, [inactivity.status, status, signOut]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      signOut,
      refreshAssuranceLevel: checkAssuranceLevel,
      lastSignOutReason,
      inactivityStatus: inactivity.status,
      inactivityRemainingMs: inactivity.remainingMs,
      resetInactivityTimer: inactivity.resetActivity,
    }),
    [
      status,
      signOut,
      checkAssuranceLevel,
      lastSignOutReason,
      inactivity.status,
      inactivity.remainingMs,
      inactivity.resetActivity,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used within an AuthProvider");
  return ctx;
}
