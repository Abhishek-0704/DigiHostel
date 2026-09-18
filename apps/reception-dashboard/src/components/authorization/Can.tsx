import type { ReactNode } from "react";
import { useAuthorization } from "../../contexts/AuthorizationContext";
import type { Permission } from "../../lib/authorization/permissions";
import type { StaffRole } from "../../types/roles";

export interface CanProps {
  /** Render `children` only if the current staff member holds this
   * permission. Mutually exclusive with `role`/`anyPermission` — pass
   * exactly one. */
  permission?: Permission;
  /** Render `children` only if the current staff member holds ANY of
   * these permissions. */
  anyPermission?: readonly Permission[];
  /** Render `children` only if the current staff member has this exact
   * role. Prefer `permission` in almost every case (§10: avoid scattered
   * role checks) — this exists for the rare case a control is genuinely
   * role-specific rather than permission-specific. */
  role?: StaffRole;
  /** Rendered instead of `children` when the check fails. Defaults to
   * nothing (silent hide) — the common case for conditional UI
   * (§14: "disabled restricted actions"). Pass `<AccessDeniedMessage />`
   * explicitly where an explicit denial message is wanted instead. */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Component-level authorization primitive (Prompt 3 §14). One flexible
 * component rather than separate `PermissionGuard`/`RoleGuard` duplicates
 * (§14: "do not create unnecessary duplicate patterns") — every check
 * defers to the same `AuthorizationContext` (and, beneath it, the same
 * `lib/authorization/policy.ts` functions) route guards use, so navigation,
 * routes, and inline UI can never disagree about whether something is
 * allowed.
 *
 * UX only, same as every authorization primitive in this app — never a
 * substitute for server-side authorization (§14's own explicit statement).
 * No business control exists yet to actually wrap with this; this is the
 * primitive future feature work will use.
 */
export function Can({ permission, anyPermission, role, fallback = null, children }: CanProps) {
  const { hasPermission, hasAnyPermission, hasRole } = useAuthorizationChecks();

  let allowed = false;
  if (permission) {
    allowed = hasPermission(permission);
  } else if (anyPermission) {
    allowed = hasAnyPermission(anyPermission);
  } else if (role) {
    allowed = hasRole(role);
  }

  return allowed ? children : fallback;
}

/** Small internal adapter: AuthorizationContext exposes `hasPermission`
 * directly but not `hasAnyPermission` (route/nav code hasn't needed it
 * yet) — computed here from the exposed `permissions` list rather than
 * growing the context's public API for one component's convenience. */
function useAuthorizationChecks() {
  const { hasPermission, hasRole, permissions } = useAuthorization();
  return {
    hasPermission,
    hasRole,
    hasAnyPermission: (candidates: readonly Permission[]) =>
      candidates.some((p) => permissions.includes(p)),
  };
}
