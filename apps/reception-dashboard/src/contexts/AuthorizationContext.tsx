import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { staffProfileService, type StaffProfile } from "../services/auth/staffProfileService";
import {
  hasRole as hasRolePolicy,
  hasPermission as hasPermissionPolicy,
  can as canPolicy,
  canAccessHostel as canAccessHostelPolicy,
  permissionsForRole,
} from "../lib/authorization/policy";
import type { Permission } from "../lib/authorization/permissions";
import type { StaffRole } from "../types/roles";
import { AppError, safeMessageFor } from "../lib/errors/errors";
import { logger } from "../lib/logging/logger";
import { useAuthContext } from "./AuthContext";
import { deriveAuthorizationState } from "./authorizationState";

/**
 * Authorization boundary (Prompt 3 §5/§17/§18) — deliberately a SEPARATE
 * context from AuthContext, consuming it rather than duplicating its
 * state (§17: "do not duplicate the Supabase authentication session
 * inside an unrelated authorization state store"). Authentication answers
 * "who are you" (AuthContext); this answers "what are you allowed to do."
 *
 * Only attempts to resolve a staff profile once AuthContext's own `status`
 * reaches `"authenticated"` (password + MFA/AAL2-verified, per ADR-024) —
 * an incomplete authentication has nothing to authorize yet.
 *
 * Every check exposed here (`hasRole`, `hasPermission`, `can`,
 * `canAccessHostel`) is a thin wrapper over the pure, unit-tested functions
 * in `lib/authorization/policy.ts` — this context owns WHERE the staff
 * profile comes from and WHEN it's (re)fetched, never the authorization
 * LOGIC itself, so route guards, `Can`, and any future consumer all defer
 * to the exact same policy.
 *
 * This is a UX-layer convenience, same as every guard/context in this app:
 * Fastify's guards (`apps/api/src/lib/auth/guards.ts`) and PostgreSQL RLS
 * remain the actual security boundary regardless of what this context
 * believes (Prompt 0.2 §27, restated by this prompt's own §5/§19/§21).
 */
interface AuthorizationContextValue {
  role: StaffRole | null;
  hostelId: string | null;
  /** The resolved staff profile's own name (Prompt 4 §7/§33 — "use the
   * existing authenticated staff identity... do not create another identity
   * source"). Reuses the exact same `staffProfileService` read this context
   * already performs; no second profile fetch is introduced. `null` in
   * every state where `role`/`hostelId` are also `null`. */
  staffName: string | null;
  permissions: readonly Permission[];
  isAuthorizationLoading: boolean;
  isAuthorized: boolean;
  authorizationError: AppError | null;
  hasRole: (role: StaffRole) => boolean;
  hasPermission: (permission: Permission) => boolean;
  can: (permission: Permission) => boolean;
  canAccessHostel: (targetHostelId: string | null) => boolean;
  refreshAuthorization: () => Promise<void>;
}

const AuthorizationContext = createContext<AuthorizationContextValue | undefined>(undefined);

export function AuthorizationProvider({ children }: { children: ReactNode }) {
  const { status: authStatus } = useAuthContext();
  const [profileLoading, setProfileLoading] = useState(false);
  const [staff, setStaff] = useState<StaffProfile | null | undefined>(undefined);
  const [authorizationError, setAuthorizationError] = useState<AppError | null>(null);

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    setAuthorizationError(null);
    try {
      const profile = await staffProfileService.getMyStaffProfile();
      setStaff(profile);
      if (profile === null) {
        // Prompt 1 §20/§21: a valid, MFA-verified Supabase identity that
        // simply has no staff row — distinct from a fetch FAILURE
        // (`authorization_unavailable`, below). The read itself succeeded;
        // it correctly says "no access." Fails closed either way
        // (isAuthorized stays false — deriveAuthorizationState), but this
        // makes the reason diagnosable rather than silently absent.
        setAuthorizationError(
          new AppError("unauthorized_staff", safeMessageFor("unauthorized_staff")),
        );
      }
    } catch (err) {
      // Fail closed: a failed profile fetch clears any previous profile
      // rather than leaving a stale one in place (§21/§23 — "fail closed
      // whenever... permissions cannot be loaded").
      setStaff(null);
      const mapped =
        err instanceof AppError
          ? err
          : new AppError(
              "authorization_unavailable",
              safeMessageFor("authorization_unavailable"),
              err,
            );
      setAuthorizationError(mapped);
      logger.warn("authorization: staff profile fetch failed", { kind: mapped.kind });
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authStatus === "authenticated") {
      void loadProfile();
    } else {
      setStaff(undefined);
      setAuthorizationError(null);
    }
  }, [authStatus, loadProfile]);

  const {
    isAuthorizationLoading,
    staff: resolvedStaff,
    isAuthorized,
  } = deriveAuthorizationState({
    authStatus,
    profileLoading,
    staff,
  });

  const staffAuthorization = resolvedStaff
    ? { role: resolvedStaff.role, hostelId: resolvedStaff.hostelId }
    : null;

  const value = useMemo<AuthorizationContextValue>(
    () => ({
      role: resolvedStaff?.role ?? null,
      hostelId: resolvedStaff?.hostelId ?? null,
      staffName: resolvedStaff?.fullName ?? null,
      permissions: staffAuthorization ? permissionsForRole(staffAuthorization.role) : [],
      isAuthorizationLoading,
      isAuthorized,
      authorizationError,
      hasRole: (role) => hasRolePolicy(staffAuthorization, role),
      hasPermission: (permission) => hasPermissionPolicy(staffAuthorization, permission),
      can: (permission) => canPolicy(staffAuthorization, permission),
      canAccessHostel: (targetHostelId) =>
        canAccessHostelPolicy(staffAuthorization, targetHostelId),
      refreshAuthorization: loadProfile,
    }),
    [
      resolvedStaff,
      isAuthorizationLoading,
      isAuthorized,
      authorizationError,
      loadProfile,
      staffAuthorization,
    ],
  );

  return <AuthorizationContext.Provider value={value}>{children}</AuthorizationContext.Provider>;
}

export function useAuthorization(): AuthorizationContextValue {
  const ctx = useContext(AuthorizationContext);
  if (!ctx) throw new Error("useAuthorization must be used within an AuthorizationProvider");
  return ctx;
}
