import { useSessionContext } from "../../contexts/SessionContext";
import { useAuthorization } from "../../contexts/AuthorizationContext";
import { RoleBadge } from "./RoleBadge";
import styles from "./StaffIdentity.module.css";

/**
 * Header identity block (Prompt 4 §7). Reads the already-resolved
 * `AuthorizationContext` (role, staff name) and `SessionContext` (email) —
 * no second identity/profile fetch is introduced (§33's explicit rule).
 *
 * Hostel scope is deliberately NOT shown as a hostel NAME: this app has no
 * hostel-name lookup service (`hostels` is a business table this shell
 * does not query — building one would be a business API, out of this
 * prompt's scope §2). What IS shown is honestly derived from data already
 * available: whether the caller is scoped to one hostel at all
 * (`hostelId !== null`) versus unscoped (`super_admin`/`library_incharge`).
 * A future module that adds a real hostel-name lookup can replace this
 * with the actual name without changing this component's contract.
 */
export function StaffIdentity() {
  const { session } = useSessionContext();
  const { role, hostelId, staffName, isAuthorizationLoading } = useAuthorization();

  if (isAuthorizationLoading || !role) return null;

  return (
    <div className={styles.wrapper}>
      <div className={styles.nameRow}>
        <span className={styles.name}>{staffName ?? session?.user.email ?? "Signed in"}</span>
        <RoleBadge role={role} />
      </div>
      <span className={styles.scope}>{hostelId ? "Hostel-scoped" : "All hostels"}</span>
    </div>
  );
}
