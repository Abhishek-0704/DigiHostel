import { useAuthorization } from "../../contexts/AuthorizationContext";
import { getVisibleQuickActions } from "../../features/dashboard";
import { QuickActionCard } from "./QuickActionCard";
import { EmptyState } from "../ui";
import styles from "./QuickActions.module.css";

/**
 * Quick Actions section (Prompt 5 §9/§27). Filters through the SAME
 * `AuthorizationContext.hasPermission` every route guard and the sidebar
 * already use — no new permission, no client-controlled role check, no
 * `localStorage`-derived visibility (§27's explicit "AuthorizationContext →
 * Quick Action Resolver → Visible Actions → Existing Route Guard" chain).
 */
export function QuickActions() {
  const { hasPermission } = useAuthorization();
  const visible = getVisibleQuickActions(hasPermission);

  return (
    <section aria-labelledby="quick-actions-heading">
      <h2 id="quick-actions-heading" className={styles.heading}>
        Quick Actions
      </h2>
      {visible.length === 0 ? (
        <EmptyState
          title="No quick actions available"
          description="Your role has no shortcuts configured here."
        />
      ) : (
        <div className={styles.grid}>
          {visible.map((action) => (
            <QuickActionCard key={action.id} action={action} />
          ))}
        </div>
      )}
    </section>
  );
}
