import { useEffect, useRef, type ReactNode } from "react";
import styles from "./Dialog.module.css";

export interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Reusable modal/dialog primitive (Prompt 0.2 §16), built on the native
 * `<dialog>` element for built-in focus trapping, Escape-to-close, and
 * accessible modal semantics rather than hand-rolling those (accessibility
 * foundation, Prompt 0.2 §26). ConfirmationDialog composes this. */
export function Dialog({ open, title, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="dialog-title"
      onClose={onClose}
      onCancel={onClose}
    >
      <h2 id="dialog-title" className={styles.title}>
        {title}
      </h2>
      <div className={styles.content}>{children}</div>
    </dialog>
  );
}
