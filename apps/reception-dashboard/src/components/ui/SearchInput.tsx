import type { InputHTMLAttributes } from "react";
import styles from "./SearchInput.module.css";

export interface SearchInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

/** Reusable primitive (Prompt 0.2 §16). Always carries a real (visually
 * hidden if needed) label — never a placeholder-only input, per the
 * accessible-forms requirement (§26). */
export function SearchInput({ label, id, className, ...rest }: SearchInputProps) {
  const inputId = id ?? `search-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className={[styles.wrapper, className].filter(Boolean).join(" ")}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
      </label>
      <input id={inputId} type="search" className={styles.input} {...rest} />
    </div>
  );
}
