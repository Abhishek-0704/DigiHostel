import { forwardRef, useId, useState, type InputHTMLAttributes } from "react";
import styles from "./PasswordInput.module.css";

export interface PasswordInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "id"
> {
  id?: string;
  invalid?: boolean;
}

/**
 * Reusable password-field primitive (Prompt 2 §12) — masked by default with
 * an accessible show/hide toggle. A real `<button type="button">` (not a
 * clickable icon with no semantics) so it's keyboard-operable and its
 * pressed state is exposed via `aria-pressed`; the toggle only ever changes
 * the input's `type`, it never reads, copies, or logs the value itself.
 *
 * Deliberately still a plain, uncontrolled-friendly `<input>` wrapper (value/
 * onChange come from the caller, same as every other form primitive in this
 * app) — no new form-state abstraction is introduced.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ id, invalid, className, ...rest }, ref) {
    const [visible, setVisible] = useState(false);
    const generatedId = useId();
    const inputId = id ?? generatedId;

    return (
      <div className={styles.wrapper}>
        <input
          ref={ref}
          id={inputId}
          type={visible ? "text" : "password"}
          className={[styles.input, invalid ? styles.invalid : "", className]
            .filter(Boolean)
            .join(" ")}
          autoComplete="current-password"
          {...rest}
        />
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setVisible((v) => !v)}
          disabled={rest.disabled}
          aria-pressed={visible}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    );
  },
);
