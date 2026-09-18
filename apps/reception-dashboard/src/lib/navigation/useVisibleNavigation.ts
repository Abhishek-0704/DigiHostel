import { useMemo } from "react";
import { useAuthorization } from "../../contexts/AuthorizationContext";
import {
  NAVIGATION_ITEMS,
  NAVIGATION_GROUPS,
  type NavigationItem,
  type NavigationGroup,
} from "./navigationConfig";

export interface ResolvedNavigationGroup {
  group: NavigationGroup;
  items: readonly NavigationItem[];
}

export interface VisibleNavigation {
  topLevelItems: readonly NavigationItem[];
  groups: readonly ResolvedNavigationGroup[];
}

/**
 * RBAC-aware navigation resolution (Prompt 4 §10) — the ONE place
 * `NAVIGATION_ITEMS` is filtered by permission, consumed by `Sidebar` (and
 * available to any future navigation surface, e.g. a command palette) so
 * they can never disagree about what's visible. Defers entirely to
 * `useAuthorization().hasPermission` — the exact same check
 * `RequirePermission` (route guards) uses (Prompt 3's own "navigation
 * visibility must derive from the same centralized authorization model,"
 * unchanged by this prompt, only now sourced from a shared config instead
 * of a hand-written array inside `Sidebar.tsx`).
 *
 * Fails closed on the loading state (§29/§17 — "authorization loading
 * failure -> deny"): while authorization is still resolving, this returns
 * no items at all rather than flashing every item and then hiding most of
 * them, exactly matching the prior inline behavior in `Sidebar.tsx`.
 *
 * This is UX-layer navigation visibility only — hiding an item here is
 * never itself authorization (§10's own explicit reminder, restated):
 * `RequireAuth`/`RequirePermission` (unchanged, untouched by this prompt)
 * remain the actual client-side gate, and Fastify/RLS remain the real
 * security boundary regardless of what this hook renders.
 */
export function useVisibleNavigation(): VisibleNavigation {
  const { hasPermission, isAuthorizationLoading } = useAuthorization();

  return useMemo(() => {
    if (isAuthorizationLoading) {
      return { topLevelItems: [], groups: [] };
    }

    const visible = NAVIGATION_ITEMS.filter(
      (item) => !item.requiredPermission || hasPermission(item.requiredPermission),
    );

    const topLevelItems = visible.filter((item) => !item.group);
    const groups = NAVIGATION_GROUPS.map((group) => ({
      group,
      items: visible.filter((item) => item.group === group.id),
    })).filter((resolved) => resolved.items.length > 0);

    return { topLevelItems, groups };
  }, [hasPermission, isAuthorizationLoading]);
}
