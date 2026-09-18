import { useState } from "react";
import { Dialog, Button, FormField } from "../ui";
import { staffRoleLabel } from "./StaffRoleLabel";
import type { StaffAdmin, StaffAdminRole } from "@digihostel/api-client-react";
import styles from "./StaffDialogs.module.css";

const ROLE_OPTIONS: StaffAdminRole[] = [
  "reception_warden",
  "hostel_admin",
  "library_incharge",
  "super_admin",
];

export interface RoleChangeDialogProps {
  open: boolean;
  target: StaffAdmin;
  onClose: () => void;
  onSubmit: (role: StaffAdminRole) => Promise<void>;
  submitting: boolean;
  errorMessage: string | null;
}

/**
 * Changes a staff member's role — `PATCH /staff/{id}/role`. The server
 * independently re-verifies self-target and last-active-super_admin
 * protection regardless of what this dialog allows to be submitted; this
 * dialog's own restrictions are UX guidance, not the security boundary.
 */
export function RoleChangeDialog({
  open,
  target,
  onClose,
  onSubmit,
  submitting,
  errorMessage,
}: RoleChangeDialogProps) {
  const [role, setRole] = useState<StaffAdminRole>(target.role);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSubmit(role);
  }

  return (
    <Dialog open={open} title={`Change Role — ${target.fullName}`} onClose={onClose}>
      <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
        <p className={styles.note}>
          Current role: {staffRoleLabel(target.role)}. Reception Warden and Hostel Administrator
          both require this staff member to already have a hostel assignment.
        </p>
        <FormField label="New role" htmlFor="role-change-select">
          <select
            id="role-change-select"
            className={styles.input}
            value={role}
            onChange={(e) => setRole(e.target.value as StaffAdminRole)}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {staffRoleLabel(r)}
              </option>
            ))}
          </select>
        </FormField>
        {errorMessage && (
          <p className={styles.error} role="alert">
            {errorMessage}
          </p>
        )}
        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={submitting}
            disabled={role === target.role}
          >
            Save Role
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
