import styles from "./Toggle.module.css";

export interface ToggleProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Shown below the label — e.g. "Cannot be disabled" for a mandatory
   * notification category (§10). Purely descriptive; disabling the control
   * itself (via `disabled`) is what actually prevents the change. */
  description?: string;
}

/**
 * Accessible switch primitive (Phase 7, Prompt 17 — Administrative Profile
 * & Personal Preferences Center's first consumer: notification-category
 * toggles, accessibility toggles, compact-mode). No shared toggle/switch
 * component existed anywhere in this workspace before this feature.
 *
 * A native `<input type="checkbox">` under the hood, not a styled `<div
 * role="switch">` — native checkboxes already have correct keyboard
 * behavior (Space toggles), correct screen-reader semantics, and a real
 * `<label>` association via `htmlFor`/`id`, matching every other control
 * in this design system (`FormField`'s own established discipline) rather
 * than reimplementing ARIA switch semantics by hand.
 */
export function Toggle({ id, label, checked, onChange, disabled, description }: ToggleProps) {
  return (
    <div className={styles.row}>
      <div className={styles.labelGroup}>
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
        {description && <span className={styles.description}>{description}</span>}
      </div>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className={styles.switch}
        checked={checked}
        disabled={disabled}
        // Belt-and-suspenders alongside the native `disabled` attribute:
        // guarantees the "disabled means onChange never fires" contract
        // holds regardless of a given browser/test environment's exact
        // disabled-input click semantics (jsdom, for one, does not
        // uniformly suppress the change event the same way every real
        // browser does).
        onChange={(e) => {
          if (disabled) return;
          onChange(e.target.checked);
        }}
        aria-checked={checked}
      />
    </div>
  );
}
