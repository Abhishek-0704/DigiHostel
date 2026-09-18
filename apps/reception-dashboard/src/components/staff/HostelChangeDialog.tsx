import { useState } from "react";
import { Dialog, Button, FormField } from "../ui";
import type { StaffAdmin } from "@digihostel/api-client-react";
import styles from "./StaffDialogs.module.css";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface HostelChangeDialogProps {
  open: boolean;
  target: StaffAdmin;
  onClose: () => void;
  onSubmit: (hostelId: string | null) => Promise<void>;
  submitting: boolean;
  errorMessage: string | null;
}

/**
 * Changes a staff member's hostel assignment — `PATCH /staff/{id}/hostel`.
 * A plain UUID text field, not a hostel-name dropdown, matching
 * `CreateStaffDialog`'s identical, already-explained reasoning — no
 * hostel-listing capability exists anywhere in this application.
 */
export function HostelChangeDialog({
  open,
  target,
  onClose,
  onSubmit,
  submitting,
  errorMessage,
}: HostelChangeDialogProps) {
  const [hostelId, setHostelId] = useState(target.hostelId ?? "");
  const [noHostel, setNoHostel] = useState(target.hostelId === null);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);

    if (noHostel) {
      await onSubmit(null);
      return;
    }
    const trimmed = hostelId.trim();
    if (trimmed === "" || !UUID_PATTERN.test(trimmed)) {
      setLocalError("Hostel ID must be a valid UUID.");
      return;
    }
    await onSubmit(trimmed);
  }

  const displayedError = localError ?? errorMessage;

  return (
    <Dialog open={open} title={`Change Hostel — ${target.fullName}`} onClose={onClose}>
      <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
        <p className={styles.note}>
          Current hostel: {target.hostelName ?? "None (unscoped)"}. Reception Warden and Hostel
          Administrator require a hostel assignment — the server rejects a null hostel for either
          role.
        </p>
        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={noHostel}
            onChange={(e) => setNoHostel(e.target.checked)}
          />
          No hostel assignment (Library In-charge / Super Administrator only)
        </label>
        {!noHostel && (
          <FormField label="Hostel ID (UUID)" htmlFor="hostel-change-input">
            <input
              id="hostel-change-input"
              type="text"
              className={styles.input}
              value={hostelId}
              onChange={(e) => setHostelId(e.target.value)}
              placeholder="e.g. a0000000-0000-0000-0000-000000000001"
            />
          </FormField>
        )}
        {displayedError && (
          <p className={styles.error} role="alert">
            {displayedError}
          </p>
        )}
        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting}>
            Save Hostel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
