import { useState } from "react";
import { Dialog, Button, FormField } from "../ui";
import { configurationDomainLabel } from "./ConfigurationDomainLabel";
import { ConfigurationValueInput } from "./ConfigurationValueInput";
import type {
  ConfigurationDomain,
  ConfigurationScope,
  ConfigurationValueType,
  ConfigurationValidationResult,
} from "@digihostel/api-client-react";
import styles from "./ConfigurationDialogs.module.css";

const VALUE_TYPES: ConfigurationValueType[] = ["string", "number", "boolean", "json"];
const DEFAULT_VALUE_BY_TYPE: Record<ConfigurationValueType, unknown> = {
  string: "",
  number: 0,
  boolean: false,
  json: {},
};

export interface CreateConfigurationDialogProps {
  open: boolean;
  onClose: () => void;
  domains: ConfigurationDomain[];
  /** `hostel_admin` may only ever create a `"hostel"`-scoped entry for
   * their own hostel — this dialog enforces that in the UI as a courtesy;
   * the server independently re-verifies it regardless (`403` otherwise). */
  actingRole: "hostel_admin" | "super_admin";
  actingHostelId: string | null;
  onValidate: (input: {
    domain: ConfigurationDomain;
    key: string;
    value: unknown;
    valueType: ConfigurationValueType;
    scope: ConfigurationScope;
    hostelId: string | null;
  }) => Promise<ConfigurationValidationResult>;
  onSubmit: (input: {
    domain: ConfigurationDomain;
    key: string;
    value: unknown;
    valueType: ConfigurationValueType;
    description: string | null;
    scope: ConfigurationScope;
    hostelId: string | null;
  }) => Promise<void>;
  submitting: boolean;
  errorMessage: string | null;
}

/**
 * Provisions a new configuration entry (Phase 5, Prompt 14) — the
 * "Load -> Edit -> Validate -> Preview -> Confirm -> Persist" workflow's
 * create-side form. "Validate" calls the real, stateless
 * `POST /configuration/validate` (never persists anything) so a caller can
 * see the exact server verdict before committing.
 */
export function CreateConfigurationDialog({
  open,
  onClose,
  domains,
  actingRole,
  actingHostelId,
  onValidate,
  onSubmit,
  submitting,
  errorMessage,
}: CreateConfigurationDialogProps) {
  const [domain, setDomain] = useState<ConfigurationDomain>(domains[0] ?? "system");
  const [key, setKey] = useState("");
  const [valueType, setValueType] = useState<ConfigurationValueType>("string");
  const [value, setValue] = useState<unknown>("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<ConfigurationScope>(
    actingRole === "hostel_admin" ? "hostel" : "global",
  );
  const [validation, setValidation] = useState<ConfigurationValidationResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const hostelId = scope === "hostel" ? actingHostelId : null;

  function reset() {
    setDomain(domains[0] ?? "system");
    setKey("");
    setValueType("string");
    setValue("");
    setDescription("");
    setScope(actingRole === "hostel_admin" ? "hostel" : "global");
    setValidation(null);
    setLocalError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleValueTypeChange(nextType: ConfigurationValueType) {
    setValueType(nextType);
    setValue(DEFAULT_VALUE_BY_TYPE[nextType]);
    setValidation(null);
  }

  async function handleValidate() {
    setLocalError(null);
    if (key.trim() === "") {
      setLocalError("Key is required before validating.");
      return;
    }
    setValidating(true);
    try {
      const result = await onValidate({
        domain,
        key: key.trim(),
        value,
        valueType,
        scope,
        hostelId,
      });
      setValidation(result);
    } finally {
      setValidating(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (key.trim() === "") {
      setLocalError("Key is required.");
      return;
    }
    await onSubmit({
      domain,
      key: key.trim(),
      value,
      valueType,
      description: description.trim() === "" ? null : description.trim(),
      scope,
      hostelId,
    });
  }

  const displayedError = localError ?? errorMessage;

  return (
    <Dialog open={open} title="Create Configuration Entry" onClose={handleClose}>
      <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
        <FormField label="Domain" htmlFor="create-config-domain">
          <select
            id="create-config-domain"
            className={styles.input}
            value={domain}
            onChange={(e) => {
              setDomain(e.target.value as ConfigurationDomain);
              setValidation(null);
            }}
          >
            {domains.map((d) => (
              <option key={d} value={d}>
                {configurationDomainLabel(d)}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Key" htmlFor="create-config-key">
          <input
            id="create-config-key"
            type="text"
            className={styles.input}
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setValidation(null);
            }}
            placeholder="e.g. stage_timeout_minutes"
            maxLength={100}
          />
        </FormField>

        <FormField label="Value type" htmlFor="create-config-value-type">
          <select
            id="create-config-value-type"
            className={styles.input}
            value={valueType}
            onChange={(e) => handleValueTypeChange(e.target.value as ConfigurationValueType)}
          >
            {VALUE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Value" htmlFor="create-config-value">
          <ConfigurationValueInput
            id="create-config-value"
            valueType={valueType}
            value={value}
            onChange={(v) => {
              setValue(v);
              setValidation(null);
            }}
          />
        </FormField>

        <FormField label="Description (optional)" htmlFor="create-config-description">
          <input
            id="create-config-description"
            type="text"
            className={styles.input}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
          />
        </FormField>

        {actingRole === "super_admin" ? (
          <FormField label="Scope" htmlFor="create-config-scope">
            <select
              id="create-config-scope"
              className={styles.input}
              value={scope}
              onChange={(e) => {
                setScope(e.target.value as ConfigurationScope);
                setValidation(null);
              }}
            >
              <option value="global">Global</option>
              <option value="hostel">This hostel only</option>
            </select>
          </FormField>
        ) : (
          <p className={styles.note}>
            As a Hostel Administrator, this entry will be scoped to your own hostel only — you
            cannot create a global (platform-wide) entry.
          </p>
        )}

        <div className={styles.validationRow}>
          <Button
            type="button"
            variant="secondary"
            loading={validating}
            onClick={() => void handleValidate()}
          >
            Validate
          </Button>
          {validation && (
            <span
              className={validation.valid ? styles.validationOk : styles.validationFail}
              role="status"
            >
              {validation.valid ? "✓ Valid" : `✕ ${validation.reason ?? validation.kind}`}
            </span>
          )}
        </div>

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
            Create Entry
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
