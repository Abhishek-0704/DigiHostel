import { useState, type FormEvent } from "react";
import { Dialog, Button, FormField } from "../ui";
import styles from "./SaveTemplateDialog.module.css";

export interface SaveTemplateDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (name: string, isFavorite: boolean) => Promise<void>;
  saving?: boolean;
  error?: string;
}

/** Saves the current report configuration (report id + selected fields +
 * filters, supplied by the caller) as a named, personal template (Phase 6,
 * Prompt 16 §15) — never arbitrary SQL/field/table names, just the
 * already-validated configuration the caller already generated a preview
 * from. */
export function SaveTemplateDialog({
  open,
  onClose,
  onSave,
  saving,
  error,
}: SaveTemplateDialogProps) {
  const [name, setName] = useState("");
  const [isFavorite, setIsFavorite] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await onSave(name.trim(), isFavorite);
    setName("");
    setIsFavorite(false);
  }

  return (
    <Dialog open={open} title="Save Report as Template" onClose={onClose}>
      <form onSubmit={(e) => void handleSubmit(e)} className={styles.form}>
        <FormField label="Template name" htmlFor="save-template-name" error={error}>
          <input
            id="save-template-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={styles.input}
            maxLength={120}
            required
          />
        </FormField>
        <label htmlFor="save-template-favorite" className={styles.favoriteRow}>
          <input
            id="save-template-favorite"
            type="checkbox"
            checked={isFavorite}
            onChange={(e) => setIsFavorite(e.target.checked)}
          />
          Mark as favourite
        </label>
        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving || !name.trim()}>
            {saving ? "Saving…" : "Save Template"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
