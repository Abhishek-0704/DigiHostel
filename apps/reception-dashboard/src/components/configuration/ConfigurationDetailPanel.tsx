import { useEffect, useRef, useState } from "react";
import { Button, EmptyState, ConfirmationDialog, StatusBadge } from "../ui";
import { configurationDomainLabel } from "./ConfigurationDomainLabel";
import { ConfigurationValueInput } from "./ConfigurationValueInput";
import type { ConfigurationEntry } from "@digihostel/api-client-react";
import styles from "./ConfigurationDetailPanel.module.css";

export interface ConfigurationDetailPanelProps {
  entry: ConfigurationEntry | null;
  canEdit: boolean;
  onClose: () => void;
  onUpdate: (
    entryId: string,
    input: {
      expectedVersion: number;
      value?: unknown;
      description?: string | null;
      isActive?: boolean;
    },
  ) => Promise<boolean>;
  errorMessage: string | null;
  clearError: () => void;
  busy: boolean;
}

function formatValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

/**
 * Enterprise Configuration Center detail/action panel (Phase 5, Prompt 14)
 * — mirrors `StaffDetailPanel`'s split-pane detail pattern and identical
 * focus-management discipline. Implements the prompt's own required
 * "Current Value / Proposed Value / Validation Result / Save Status /
 * Audit Status" distinction: edit mode shows both the current (read-only)
 * and proposed (editable) value at once, never silently replacing one with
 * the other. `canEdit` is a UX convenience only — the server independently
 * re-verifies hostel-scope authorization on every `PATCH` regardless.
 */
export function ConfigurationDetailPanel({
  entry,
  canEdit,
  onClose,
  onUpdate,
  errorMessage,
  clearError,
  busy,
}: ConfigurationDetailPanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const [proposedValue, setProposedValue] = useState<unknown>(null);
  const [proposedDescription, setProposedDescription] = useState("");
  const [confirmingToggle, setConfirmingToggle] = useState(false);

  useEffect(() => {
    if (entry) closeButtonRef.current?.focus();
    setEditing(false);
    setConfirmingToggle(false);
  }, [entry?.id]);

  if (!entry) {
    return (
      <div className={styles.placeholder}>
        <EmptyState
          title="No configuration entry selected"
          description="Select an entry from the directory to view or manage it."
        />
      </div>
    );
  }

  function startEdit() {
    clearError();
    setProposedValue(entry!.value);
    setProposedDescription(entry!.description ?? "");
    setEditing(true);
  }

  async function handleSave() {
    const ok = await onUpdate(entry!.id, {
      expectedVersion: entry!.version,
      value: proposedValue,
      description: proposedDescription.trim() === "" ? null : proposedDescription.trim(),
    });
    if (ok) setEditing(false);
  }

  async function handleToggleActive() {
    const ok = await onUpdate(entry!.id, {
      expectedVersion: entry!.version,
      isActive: !entry!.isActive,
    });
    if (ok) setConfirmingToggle(false);
  }

  return (
    <div
      className={styles.panel}
      role="region"
      aria-label={`Configuration entry detail: ${entry.key}`}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !editing && !confirmingToggle) onClose();
      }}
    >
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>{entry.key}</h2>
          <div className={styles.badges}>
            <StatusBadge
              label={entry.isActive ? "Active" : "Inactive"}
              tone={entry.isActive ? "success" : "neutral"}
            />
            <span className={styles.domainBadge}>{configurationDomainLabel(entry.domain)}</span>
          </div>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close configuration entry detail"
        >
          ×
        </button>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionHeading}>Identity</h3>
        <dl className={styles.metaList}>
          <div className={styles.metaRow}>
            <dt>Domain</dt>
            <dd>{configurationDomainLabel(entry.domain)}</dd>
          </div>
          <div className={styles.metaRow}>
            <dt>Scope</dt>
            <dd>{entry.scope === "global" ? "Global" : (entry.hostelName ?? "Hostel-scoped")}</dd>
          </div>
          <div className={styles.metaRow}>
            <dt>Value type</dt>
            <dd className={styles.mono}>{entry.valueType}</dd>
          </div>
          <div className={styles.metaRow}>
            <dt>Version</dt>
            <dd>{entry.version}</dd>
          </div>
        </dl>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionHeading}>Current Value</h3>
        <pre className={styles.valueBlock}>{formatValue(entry.value)}</pre>
        {entry.description && <p className={styles.description}>{entry.description}</p>}
      </div>

      {editing && (
        <div className={styles.section}>
          <h3 className={styles.sectionHeading}>Proposed Value</h3>
          <ConfigurationValueInput
            id="edit-config-value"
            valueType={entry.valueType}
            value={proposedValue}
            onChange={setProposedValue}
            disabled={busy}
          />
          <label className={styles.descriptionLabel} htmlFor="edit-config-description">
            Description
          </label>
          <input
            id="edit-config-description"
            type="text"
            className={styles.descriptionInput}
            value={proposedDescription}
            onChange={(e) => setProposedDescription(e.target.value)}
            disabled={busy}
          />
        </div>
      )}

      <div className={styles.section}>
        <h3 className={styles.sectionHeading}>Audit</h3>
        <dl className={styles.metaList}>
          <div className={styles.metaRow}>
            <dt>Created</dt>
            <dd>
              {new Date(entry.createdAt).toLocaleString()}
              {entry.createdByName ? ` · ${entry.createdByName}` : ""}
            </dd>
          </div>
          <div className={styles.metaRow}>
            <dt>Last Updated</dt>
            <dd>
              {new Date(entry.updatedAt).toLocaleString()}
              {entry.updatedByName ? ` · ${entry.updatedByName}` : ""}
            </dd>
          </div>
        </dl>
        <p className={styles.note}>
          Every change here also writes an entry to the Enterprise Audit Center.
        </p>
      </div>

      {errorMessage && (
        <p className={styles.errorNote} role="alert">
          {errorMessage}
        </p>
      )}

      <div className={styles.actionsGrid}>
        {editing ? (
          <>
            <Button variant="primary" loading={busy} onClick={() => void handleSave()}>
              Save Changes
            </Button>
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={busy}>
              Discard
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={startEdit} disabled={!canEdit}>
              Edit Value
            </Button>
            <Button
              variant={entry.isActive ? "danger" : "primary"}
              onClick={() => {
                clearError();
                setConfirmingToggle(true);
              }}
              disabled={!canEdit}
            >
              {entry.isActive ? "Deactivate" : "Activate"}
            </Button>
          </>
        )}
      </div>

      {confirmingToggle && (
        <ConfirmationDialog
          open
          title={entry.isActive ? "Deactivate Configuration Entry" : "Activate Configuration Entry"}
          description={
            entry.isActive
              ? `Deactivate "${entry.key}"? Consumers that read this entry will no longer see it as active.`
              : `Reactivate "${entry.key}"?`
          }
          confirmLabel={entry.isActive ? "Deactivate" : "Activate"}
          destructive={entry.isActive}
          onConfirm={() => void handleToggleActive()}
          onCancel={() => setConfirmingToggle(false)}
        />
      )}
    </div>
  );
}
