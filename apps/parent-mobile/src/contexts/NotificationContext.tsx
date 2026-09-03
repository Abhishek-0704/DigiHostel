import { createContext, useContext, type ReactNode } from "react";
import type { NotificationPermissionStatus } from "../services/notifications/notifications";

/**
 * Notification-state foundation (Prompt 2). Notification handling is not
 * implemented yet (see src/services/notifications/notifications.ts) — this
 * context exists so future screens can read a notification-availability
 * state without every consumer needing to know whether the underlying
 * service is implemented. Fixed "unavailable" value today, honestly
 * represented, not a fabricated "granted"/"denied" guess.
 */
interface NotificationContextValue {
  permissionStatus: NotificationPermissionStatus | "unavailable";
}

const NotificationContext = createContext<NotificationContextValue>({
  permissionStatus: "unavailable",
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  return (
    <NotificationContext.Provider value={{ permissionStatus: "unavailable" }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationContext(): NotificationContextValue {
  return useContext(NotificationContext);
}
