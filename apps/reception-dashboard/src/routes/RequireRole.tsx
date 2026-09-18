import type { ReactNode } from "react";
import { useAuthorization } from "../contexts/AuthorizationContext";
import { LoadingIndicator } from "../components/ui";
import { AccessDeniedMessage } from "../components/authorization";
import type { StaffRole } from "../types/roles";

/**
 * RBAC route-guard (Prompt 3 §12 — replaces Prompt 0.2's stub, which always
 * denied via a hardcoded `useStaffRole() => null`, documented at the time as
 * "no real source for role exists yet"). That source now exists
 * (`AuthorizationContext`, backed by `staffProfileService`'s RLS-protected
 * self-row read) — this guard is genuinely functional.
 *
 * Assumes it always renders inside `RequireAuth` (routes/index.tsx composes
 * them together) — it does not re-check authentication/MFA itself, only
 * role. Explicit allow-list, fails closed on loading/error/no-match exactly
 * like `RequireAuth` (Prompt 3 §12's "must not depend on a finite
 * TypeScript union remaining complete forever" applies equally here: only
 * `hasRole(...) === true` renders children, everything else denies).
 *
 * Forbidden (authenticated, MFA-verified, wrong role) renders
 * `AccessDeniedMessage` IN PLACE — never redirects to `/login` (§13's
 * explicit rule; this is the fix for exactly the failure mode that rule
 * warns against).
 */
export function RequireRole({
  roles,
  children,
}: {
  roles: readonly StaffRole[];
  children: ReactNode;
}) {
  const { isAuthorizationLoading, role, hasRole } = useAuthorization();

  if (isAuthorizationLoading) {
    return <LoadingIndicator label="Checking your access…" />;
  }

  if (role && roles.some((r) => hasRole(r))) {
    return children;
  }

  return <AccessDeniedMessage />;
}
