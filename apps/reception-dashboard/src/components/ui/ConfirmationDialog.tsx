import { Dialog } from "./Dialog";
import { Button } from "./Button";
import styles from "./ConfirmationDialog.module.css";

export interface ConfirmationDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Reusable confirmation pattern (Prompt 0.2 §16/§20) for destructive or
 * high-consequence actions (e.g. a future "deny exit" or "expire this leave
 * request" action) — established now so every later feature reuses one
 * consistent confirm/cancel pattern instead of inventing its own. */
export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  return (
    <Dialog open={open} title={title} onClose={onCancel}>
      <p className={styles.description}>{description}</p>
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={destructive ? "danger" : "primary"} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
