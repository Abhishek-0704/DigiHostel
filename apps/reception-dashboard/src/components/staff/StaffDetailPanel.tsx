import { useEffect, useRef, useState } from "react";
import { Button, EmptyState, ConfirmationDialog, StatusBadge } from "../ui";
import { RoleChangeDialog } from "./RoleChangeDialog";
import { HostelChangeDialog } from "./HostelChangeDialog";
import { staffRoleLabel } from "./StaffRoleLabel";
import type { StaffAdmin, StaffAdminRole } from "@digihostel/api-client-react";
import styles from "./StaffDetailPanel.module.css";

export interface StaffDetailPanelProps {
  staff: StaffAdmin | null;
  actingStaffId: string | null;
  onClose: () => void;
  onChangeRole: (staffId: string, role: StaffAdminRole) => Promise<boolean>;
  onChangeHostel: (staffId: string, hostelId: string | null) => Promise<boolean>;
  onChangeStatus: (staffId: string, status: "active" | "suspended") => Promise<boolean>;
  onResetPassword: (staffId: string) => Promise<boolean>;
  onForceSignOut: (staffId: string) => Promise<boolean>;
  errorMessage: string | null;
  clearError: () => void;
  busy: boolean;
}

type DialogKind = "role" | "hostel" | "status" | "reset-password" | "force-sign-out" | null;

/**
 * Identity & Access Administration Center detail/action panel (Phase 5,
 * Prompt 13) — mirrors `AuditDetailPanel`'s/`HealthCaseDetailPanel`'s split-
 * pane detail pattern and identical focus-management discipline. Every
 * mutating action here calls the backend, which independently re-verifies
 * self-target and last-active-super_admin protection — `actingStaffId` is
 * used ONLY to disable a self-targeting control up front for a better UX
 * (never as the actual security check).
 */
export function StaffDetailPanel({
  staff,
  actingStaffId,
  onClose,
  onChangeRole,
  onChangeHostel,
  onChangeStatus,
  onResetPassword,
  onForceSignOut,
  errorMessage,
  clearError,
  busy,
}: StaffDetailPanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [dialog, setDialog] = useState<DialogKind>(null);

  useEffect(() => {
    if (staff) closeButtonRef.current?.focus();
    setDialog(null);
  }, [staff?.id]);

  if (!staff) {
    return (
      <div className={styles.placeholder}>
        <EmptyState
          title="No staff member selected"
          description="Select a staff account from the directory to manage it."
        />
      </div>
    );
  }

  const isSelf = actingStaffId !== null && actingStaffId === staff.id;

  function openDialog(kind: DialogKind) {
    clearError();
    setDialog(kind);
  }
  function closeDialog() {
    setDialog(null);
  }

  return (
    <div
      className={styles.panel}
      role="region"
      aria-label={`Staff detail: ${staff.fullName}`}
      onKeyDown={(e) => {
        if (e.key === "Escape" && dialog === null) onClose();
      }}
    >
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>{staff.fullName}</h2>
          {staff.status === "active" ? (
            <StatusBadge label="Active" tone="success" />
          ) : (
            <StatusBadge label="Suspended" tone="error" />
          )}
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close staff detail"
        >
          ×
        </button>
      </div>

      {isSelf && (
        <p className={styles.selfNote}>
          This is your own account. Administrative actions on your own account are not permitted.
        </p>
      )}

      <div className={styles.section}>
        <h3 className={styles.sectionHeading}>Identity</h3>
        <dl className={styles.metaList}>
          <div className={styles.metaRow}>
            <dt>Email</dt>
            <dd>{staff.email ?? "Not available"}</dd>
          </div>
          <div className={styles.metaRow}>
            <dt>Staff ID</dt>
            <dd className={styles.mono}>{staff.id}</dd>
          </div>
          <div className={styles.metaRow}>
            <dt>Role</dt>
            <dd>{staffRoleLabel(staff.role)}</dd>
          </div>
          <div className={styles.metaRow}>
            <dt>Hostel</dt>
            <dd>{staff.hostelName ?? "None (unscoped)"}</dd>
          </div>
          <div className={styles.metaRow}>
            <dt>Created</dt>
            <dd>{new Date(staff.createdAt).toLocaleString()}</dd>
          </div>
          <div className={styles.metaRow}>
            <dt>Last Updated</dt>
            <dd>{new Date(staff.updatedAt).toLocaleString()}</dd>
          </div>
        </dl>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionHeading}>Session &amp; Credentials</h3>
        <p className={styles.note}>
          This backend never generates, stores, or displays a password. Reset Password sends
          Supabase Auth&apos;s own recovery email; Force Sign-Out revokes every active session for
          this account globally.
        </p>
      </div>

      {errorMessage && (
        <p className={styles.note} role="alert">
          {errorMessage}
        </p>
      )}

      <div className={styles.actionsGrid}>
        <Button variant="secondary" onClick={() => openDialog("role")} disabled={isSelf}>
          Change Role
        </Button>
        <Button variant="secondary" onClick={() => openDialog("hostel")} disabled={isSelf}>
          Change Hostel
        </Button>
        <Button
          variant={staff.status === "active" ? "danger" : "primary"}
          onClick={() => openDialog("status")}
          disabled={isSelf}
        >
          {staff.status === "active" ? "Suspend" : "Reactivate"}
        </Button>
        <Button variant="secondary" onClick={() => openDialog("reset-password")} disabled={isSelf}>
          Reset Password
        </Button>
        <Button variant="secondary" onClick={() => openDialog("force-sign-out")} disabled={isSelf}>
          Force Sign-Out
        </Button>
      </div>

      {dialog === "role" && (
        <RoleChangeDialog
          open
          target={staff}
          onClose={closeDialog}
          submitting={busy}
          errorMessage={errorMessage}
          onSubmit={async (role) => {
            const ok = await onChangeRole(staff.id, role);
            if (ok) closeDialog();
          }}
        />
      )}

      {dialog === "hostel" && (
        <HostelChangeDialog
          open
          target={staff}
          onClose={closeDialog}
          submitting={busy}
          errorMessage={errorMessage}
          onSubmit={async (hostelId) => {
            const ok = await onChangeHostel(staff.id, hostelId);
            if (ok) closeDialog();
          }}
        />
      )}

      {dialog === "status" && (
        <ConfirmationDialog
          open
          title={staff.status === "active" ? "Suspend Staff Account" : "Reactivate Staff Account"}
          description={
            staff.status === "active"
              ? `Suspend ${staff.fullName}? Their very next authenticated request will be denied until reactivated.`
              : `Reactivate ${staff.fullName}? They will be able to sign in and authenticate again.`
          }
          confirmLabel={staff.status === "active" ? "Suspend" : "Reactivate"}
          destructive={staff.status === "active"}
          onConfirm={() =>
            void (async () => {
              const ok = await onChangeStatus(
                staff.id,
                staff.status === "active" ? "suspended" : "active",
              );
              if (ok) closeDialog();
            })()
          }
          onCancel={closeDialog}
        />
      )}

      {dialog === "reset-password" && (
        <ConfirmationDialog
          open
          title="Send Password Reset Email"
          description={`Send a password-reset email to ${staff.fullName} (${staff.email ?? "no email on record"})? This backend never generates or displays the new password.`}
          confirmLabel="Send Reset Email"
          onConfirm={() =>
            void (async () => {
              const ok = await onResetPassword(staff.id);
              if (ok) closeDialog();
            })()
          }
          onCancel={closeDialog}
        />
      )}

      {dialog === "force-sign-out" && (
        <ConfirmationDialog
          open
          title="Force Sign-Out"
          description={`Revoke every active session for ${staff.fullName}? They will need to sign in again everywhere.`}
          confirmLabel="Force Sign-Out"
          destructive
          onConfirm={() =>
            void (async () => {
              const ok = await onForceSignOut(staff.id);
              if (ok) closeDialog();
            })()
          }
          onCancel={closeDialog}
        />
      )}
    </div>
  );
}
