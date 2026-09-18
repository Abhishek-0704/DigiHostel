import type { ReactNode } from "react";
import { useAuthorization } from "../contexts/AuthorizationContext";
import { LoadingIndicator } from "../components/ui";
import { AccessDeniedMessage } from "../components/authorization";
import type { Permission } from "../lib/authorization/permissions";

/**
 * Permission-based route guard (Prompt 3 §5/§12) — the primary route-level
 * authorization primitive for Reception Dashboard pages; prefer this over
 * `RequireRole` in almost every case, matching §10's "avoid scattered role
 * checks" applied at the routing layer too. Same fail-closed/explicit
 * allow-list shape and same "forbidden renders in place, never redirects
 * to login" rule as `RequireRole` — see that file's doc comment for the
 * shared reasoning, not repeated here.
 */
export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const { isAuthorizationLoading, can } = useAuthorization();

  if (isAuthorizationLoading) {
    return <LoadingIndicator label="Checking your access…" />;
  }

  if (can(permission)) {
    return children;
  }

  return <AccessDeniedMessage />;
}
