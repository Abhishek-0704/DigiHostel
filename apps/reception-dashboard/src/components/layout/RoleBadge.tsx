import type { StaffRole } from "../../types/roles";
import styles from "./RoleBadge.module.css";

/** Human-readable label for each real `staff_role` enum value
 * (`packages/db/src/schema/enums.ts`) — the authoritative source for which
 * roles exist, unchanged by this prompt. "Head Warden" is deliberately
 * absent, matching `types/roles.ts`'s own long-standing documented
 * reasoning (no schema/RLS/guard basis — REQUIRES DECISION, not fabricated
 * here either). */
const ROLE_LABELS: Record<StaffRole, string> = {
  reception_warden: "Reception Warden",
  library_incharge: "Library In-charge",
  hostel_admin: "Hostel Administrator",
  super_admin: "Super Administrator",
};

export interface RoleBadgeProps {
  role: StaffRole;
}

/** Small identity chip (Prompt 4 §7/§31) — reads the authenticated staff
 * member's own resolved role from `AuthorizationContext` (never a second
 * identity source). Text-based, not color-coded-only (§27 — role
 * distinction must not rely on color alone; the label itself IS the
 * distinguishing signal). */
export function RoleBadge({ role }: RoleBadgeProps) {
  return <span className={styles.badge}>{ROLE_LABELS[role]}</span>;
}
