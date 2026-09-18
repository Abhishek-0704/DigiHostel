import { useState } from "react";
import { Dialog, Button, FormField } from "../ui";
import { staffRoleLabel } from "./StaffRoleLabel";
import type { StaffAdminRole } from "@digihostel/api-client-react";
import styles from "./StaffDialogs.module.css";

const HOSTEL_REQUIRED_ROLES: StaffAdminRole[] = ["reception_warden", "hostel_admin"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CreateStaffDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: {
    fullName: string;
    email: string;
    role: StaffAdminRole;
    hostelId: string | null;
  }) => Promise<void>;
  submitting: boolean;
  errorMessage: string | null;
}

/**
 * Provisions a new staff account (Phase 5, Prompt 13) — `POST /staff`,
 * which creates a real `auth.users` row via the Admin API and sends
 * Supabase's own invite email. This form never collects, generates, or
 * displays a password — there is no password field anywhere on it.
 *
 * `hostelId` is a plain UUID text field, not a hostel-name dropdown:
 * this application has no hostel-listing capability anywhere (confirmed by
 * `StaffIdentity.tsx`'s own established, repeatedly-reused precedent —
 * "this app has no hostel-name lookup service... building one would be a
 * business API, out of scope"). The server independently re-validates the
 * hostel id and the role/hostel requirement regardless of this form's own
 * client-side checks.
 */
export function CreateStaffDialog({
  open,
  onClose,
  onSubmit,
  submitting,
  errorMessage,
}: CreateStaffDialogProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffAdminRole>("reception_warden");
  const [hostelId, setHostelId] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const hostelRequired = HOSTEL_REQUIRED_ROLES.includes(role);

  function reset() {
    setFullName("");
    setEmail("");
    setRole("reception_warden");
    setHostelId("");
    setLocalError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);

    if (fullName.trim() === "") {
      setLocalError("Full name is required.");
      return;
    }
    if (email.trim() === "") {
      setLocalError("Email is required.");
      return;
    }
    const trimmedHostelId = hostelId.trim();
    if (hostelRequired && trimmedHostelId === "") {
      setLocalError(`${staffRoleLabel(role)} requires a hostel assignment.`);
      return;
    }
    if (trimmedHostelId !== "" && !UUID_PATTERN.test(trimmedHostelId)) {
      setLocalError("Hostel ID must be a valid UUID.");
      return;
    }

    await onSubmit({
      fullName: fullName.trim(),
      email: email.trim(),
      role,
      hostelId: trimmedHostelId === "" ? null : trimmedHostelId,
    });
  }

  const displayedError = localError ?? errorMessage;

  return (
    <Dialog open={open} title="Provision New Staff Account" onClose={handleClose}>
      <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
        <p className={styles.note}>
          An invite email is sent by Supabase Auth to set up their own password — this form never
          creates or displays one.
        </p>

        <FormField label="Full name" htmlFor="create-staff-full-name">
          <input
            id="create-staff-full-name"
            type="text"
            className={styles.input}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={200}
            required
          />
        </FormField>

        <FormField label="Email" htmlFor="create-staff-email">
          <input
            id="create-staff-email"
            type="email"
            className={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={255}
            required
          />
        </FormField>

        <FormField label="Role" htmlFor="create-staff-role">
          <select
            id="create-staff-role"
            className={styles.input}
            value={role}
            onChange={(e) => setRole(e.target.value as StaffAdminRole)}
          >
            <option value="reception_warden">{staffRoleLabel("reception_warden")}</option>
            <option value="hostel_admin">{staffRoleLabel("hostel_admin")}</option>
            <option value="library_incharge">{staffRoleLabel("library_incharge")}</option>
            <option value="super_admin">{staffRoleLabel("super_admin")}</option>
          </select>
        </FormField>

        <FormField
          label={`Hostel ID (UUID)${hostelRequired ? " — required for this role" : " — optional"}`}
          htmlFor="create-staff-hostel-id"
        >
          <input
            id="create-staff-hostel-id"
            type="text"
            className={styles.input}
            value={hostelId}
            onChange={(e) => setHostelId(e.target.value)}
            placeholder="e.g. a0000000-0000-0000-0000-000000000001"
          />
        </FormField>

        {displayedError && (
          <p className={styles.error} role="alert">
            {displayedError}
          </p>
        )}

        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting}>
            Create Account
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
