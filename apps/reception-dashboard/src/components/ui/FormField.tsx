import type { ReactNode } from "react";
import styles from "./FormField.module.css";

export interface FormFieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
}

/** Reusable form-control wrapper (Prompt 0.2 §16) — pairs a label and an
 * optional error message with any input, matching the accessible-forms
 * requirement (§26): every control has a real associated `<label>`, and an
 * error is exposed via `role="alert"` so it is announced when it appears.
 *
 * The error span's `id` follows a predictable `${htmlFor}-error` convention
 * (Prompt 2 §21) so a caller's own input can wire `aria-describedby={error ?
 * "${htmlFor}-error" : undefined}` and `aria-invalid` without this component
 * needing to clone/inject props into an opaque `children`. */
export function FormField({ label, htmlFor, error, children }: FormFieldProps) {
  return (
    <div className={styles.wrapper}>
      <label htmlFor={htmlFor} className={styles.label}>
        {label}
      </label>
      {children}
      {error && (
        <span id={`${htmlFor}-error`} role="alert" className={styles.error}>
          {error}
        </span>
      )}
    </div>
  );
}
