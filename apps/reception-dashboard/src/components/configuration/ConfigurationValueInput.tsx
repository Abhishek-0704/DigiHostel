import { useState } from "react";
import type { ConfigurationValueType } from "@digihostel/api-client-react";
import styles from "./ConfigurationValueInput.module.css";

export interface ConfigurationValueInputProps {
  id: string;
  valueType: ConfigurationValueType;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}

/**
 * Type-aware value editor (Phase 5, Prompt 14's own "Configuration Editor"
 * section — "the editor must clearly distinguish Current Value/Proposed
 * Value"). Renders the correct native control for each `valueType` rather
 * than one generic text box for everything, and always propagates a
 * correctly-typed JS value up (never a raw string the caller would have to
 * re-parse) — server-side validation (`domain/configuration/validation.ts`)
 * remains the actual authority regardless of what this control produces.
 */
export function ConfigurationValueInput({
  id,
  valueType,
  value,
  onChange,
  disabled,
}: ConfigurationValueInputProps) {
  const [jsonText, setJsonText] = useState(() =>
    valueType === "json" ? JSON.stringify(value ?? null, null, 2) : "",
  );
  const [jsonError, setJsonError] = useState<string | null>(null);

  if (valueType === "boolean") {
    return (
      <select
        id={id}
        className={styles.input}
        value={value === true ? "true" : "false"}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === "true")}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  if (valueType === "number") {
    return (
      <input
        id={id}
        type="number"
        className={styles.input}
        value={typeof value === "number" ? value : ""}
        disabled={disabled}
        onChange={(e) => {
          const parsed = e.target.valueAsNumber;
          onChange(Number.isNaN(parsed) ? "" : parsed);
        }}
      />
    );
  }

  if (valueType === "json") {
    return (
      <div className={styles.jsonWrapper}>
        <textarea
          id={id}
          className={[styles.input, styles.jsonTextarea].join(" ")}
          value={jsonText}
          disabled={disabled}
          rows={6}
          onChange={(e) => {
            const text = e.target.value;
            setJsonText(text);
            try {
              const parsed = JSON.parse(text);
              setJsonError(null);
              onChange(parsed);
            } catch {
              setJsonError("Not valid JSON — the value shown below is the last valid state.");
            }
          }}
        />
        {jsonError && (
          <p className={styles.jsonError} role="alert">
            {jsonError}
          </p>
        )}
      </div>
    );
  }

  // "string" — the default.
  return (
    <input
      id={id}
      type="text"
      className={styles.input}
      value={typeof value === "string" ? value : ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
