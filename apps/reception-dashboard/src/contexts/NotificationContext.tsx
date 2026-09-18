import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { notificationService } from "../services/notifications/NotificationService";
import { isUnread } from "../features/notifications/lifecycle";
import type { Notification } from "../features/notifications/types";
import { AppError, toAppError } from "../lib/errors/errors";
import { logger } from "../lib/logging/logger";

export const NOTIFICATION_QUERY_KEY = ["notifications"] as const;

/**
 * Canonical client-side notification state (Prompt 6 §15/§28/§40). This is
 * the ONE source Header's unread badge, Dashboard Home's "Active
 * Notifications" metric, and the Notification Center page all read from —
 * none of them computes its own count or holds its own copy (§40's explicit
 * "do not independently calculate unread counts in Header and Dashboard
 * Home... do not allow counts to drift").
 *
 * Server/query state: `notificationService.list()` via TanStack Query,
 * exactly like every other data-fetch in this app — today it always
 * resolves to `[]` (see that service's doc comment for the full,
 * evidence-based reason no real notification exists yet).
 *
 * Local lifecycle state: `markAsRead`/`acknowledge`/`dismiss`/`archive`/
 * `markAllAsRead` mutate the in-memory `notifications` array directly —
 * they are NOT backend-persisted mutations (there is no backend to persist
 * to). This is a deliberate, documented choice, not an oversight: with the
 * query always returning zero rows in production, these transitions are
 * currently unreachable in real use, but the code path is real, tested, and
 * ready to be swapped for a genuine mutation once a producer/backend exists
 * (§10 — "where the UI needs lifecycle simulation for component behavior,
 * isolate it in... local presentation state and document it"; §41 — "a UI
 * action must not claim success unless the operation actually succeeded" —
 * satisfied here by never presenting these as server-persisted in the
 * first place, e.g. no "saved" toast implying persistence).
 */
export interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  error: AppError | null;
  refresh: () => void;
  markAsRead: (ids: string[]) => void;
  acknowledge: (ids: string[]) => void;
  dismiss: (ids: string[]) => void;
  archive: (ids: string[]) => void;
  markAllAsRead: () => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const {
    data: fetched,
    isLoading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: NOTIFICATION_QUERY_KEY,
    queryFn: () => notificationService.list(),
  });

  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Re-sync local state whenever the underlying query resolves (initial
  // load and every refetch) — local lifecycle edits are layered on top of,
  // not a replacement for, the real (if currently always-empty) query
  // result, matching the same "query state vs. local UI state" separation
  // Prompt 5 established (§28).
  useEffect(() => {
    if (fetched) setNotifications(fetched);
  }, [fetched]);

  useEffect(() => {
    if (queryError) {
      logger.warn("notifications: list query failed", {
        err: queryError instanceof Error ? queryError.message : String(queryError),
      });
    }
  }, [queryError]);

  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const transition = useCallback((ids: string[], apply: (n: Notification) => Notification) => {
    const idSet = new Set(ids);
    setNotifications((prev) => prev.map((n) => (idSet.has(n.id) ? apply(n) : n)));
  }, []);

  const markAsRead = useCallback(
    (ids: string[]) => {
      const now = new Date().toISOString();
      transition(ids, (n) => (n.state === "unread" ? { ...n, state: "read", readAt: now } : n));
    },
    [transition],
  );

  const acknowledge = useCallback(
    (ids: string[]) => {
      const now = new Date().toISOString();
      transition(ids, (n) => ({
        ...n,
        state: "acknowledged",
        readAt: n.readAt ?? now,
        acknowledgedAt: now,
      }));
    },
    [transition],
  );

  const dismiss = useCallback(
    (ids: string[]) => {
      transition(ids, (n) => ({ ...n, state: "dismissed" }));
    },
    [transition],
  );

  const archive = useCallback(
    (ids: string[]) => {
      transition(ids, (n) => ({ ...n, state: "archived" }));
    },
    [transition],
  );

  const markAllAsRead = useCallback(() => {
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => (n.state === "unread" ? { ...n, state: "read", readAt: now } : n)),
    );
  }, []);

  const unreadCount = useMemo(
    () => notifications.filter((n) => isUnread(n.state)).length,
    [notifications],
  );

  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications,
      unreadCount,
      isLoading,
      error: queryError ? toAppError(queryError) : null,
      refresh,
      markAsRead,
      acknowledge,
      dismiss,
      archive,
      markAllAsRead,
    }),
    [
      notifications,
      unreadCount,
      isLoading,
      queryError,
      refresh,
      markAsRead,
      acknowledge,
      dismiss,
      archive,
      markAllAsRead,
    ],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotificationCenter(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotificationCenter must be used within a NotificationProvider");
  return ctx;
}
