import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import styles from "./Toast.module.css";

export type ToastVariant = "info" | "success" | "warning" | "error";

export interface ToastOptions {
  message: string;
  variant?: ToastVariant;
  /** Milliseconds before auto-dismiss. Defaults to 5000 — long enough to
   * read a short confirmation, short enough not to accumulate a stack a
   * reception operator has to manually clear during a busy shift. */
  durationMs?: number;
}

interface ToastEntry {
  id: string;
  message: string;
  variant: ToastVariant;
  durationMs: number;
}

interface ToastContextValue {
  showToast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

function generateId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Global toast layer (Prompt 4 §17/§26/§31 — "GlobalToastRegion... reuse
 * existing shared UI primitives... establish the correct layering model").
 * Mounted once at the composition root (`AppProviders.tsx`) so any future
 * feature can call `useToast().showToast(...)` without re-plumbing a
 * provider itself — infrastructure only; no current caller exists yet
 * (no business mutation exists to report success/failure for), matching
 * §2's "do not implement business functionality" — this is the mechanism
 * a future one will use.
 *
 * One `aria-live="polite"` region (not `"assertive"` — a toast is a
 * courtesy notice, not an interruption demanding immediate attention) with
 * each toast auto-dismissing on its own independent timer (`ToastItem`
 * below) so adding a second toast never resets the first one's countdown.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((options: ToastOptions) => {
    const entry: ToastEntry = {
      id: generateId(),
      message: options.message,
      variant: options.variant ?? "info",
      durationMs: options.durationMs ?? 5000,
    };
    setToasts((prev) => [...prev, entry]);
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.region} role="status" aria-live="polite">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastEntry; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), toast.durationMs);
    return () => clearTimeout(timer);
    // Deliberately keyed only on the toast's own stable id — this timer
    // must start once, at mount, and never restart because a sibling
    // toast was added or removed elsewhere in the region.
  }, [toast.id]);

  return (
    <div className={[styles.toast, styles[toast.variant]].join(" ")}>
      <span>{toast.message}</span>
      <button
        type="button"
        className={styles.dismiss}
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
