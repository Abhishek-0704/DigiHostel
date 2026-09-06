import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  notificationService,
  type NotificationPermissionStatus,
} from "../services/notifications/notifications";
import { logger } from "../services/logger/logger";

/**
 * Push-permission state (Prompt 2 foundation; made real in Prompt 8).
 *
 * Checks (never requests) the OS notification permission on mount via
 * `notificationService.getPermissionStatus()` (real, `expo-notifications`
 * — Prompt 8). `requestPermission()` is exposed as an explicit action for a
 * screen to call from a genuine user gesture (e.g. Notification Settings'
 * "Enable notifications" control) — never called automatically, matching
 * platform convention (a permission prompt must be user-initiated).
 *
 * This is permission/capability state only — it says nothing about whether
 * a push token has been registered with the backend (it hasn't; no endpoint
 * exists — see `docs/notifications.md`) or whether any push has ever
 * actually been delivered.
 */
interface NotificationContextValue {
  permissionStatus: NotificationPermissionStatus;
  isLoadingPermissionStatus: boolean;
  refreshPermissionStatus: () => Promise<void>;
  requestPermission: () => Promise<NotificationPermissionStatus>;
}

const NotificationContext = createContext<NotificationContextValue>({
  permissionStatus: "undetermined",
  isLoadingPermissionStatus: true,
  refreshPermissionStatus: async () => {},
  requestPermission: async () => "undetermined",
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [permissionStatus, setPermissionStatus] =
    useState<NotificationPermissionStatus>("undetermined");
  const [isLoadingPermissionStatus, setIsLoadingPermissionStatus] = useState(true);

  const refreshPermissionStatus = useCallback(async () => {
    setIsLoadingPermissionStatus(true);
    try {
      const status = await notificationService.getPermissionStatus();
      setPermissionStatus(status);
    } catch (err) {
      logger.warn("notifications: failed to read permission status", {
        message: err instanceof Error ? err.message : "unknown",
      });
    } finally {
      setIsLoadingPermissionStatus(false);
    }
  }, []);

  useEffect(() => {
    void refreshPermissionStatus();
  }, [refreshPermissionStatus]);

  const requestPermission = useCallback(async () => {
    const status = await notificationService.requestPermission();
    setPermissionStatus(status);
    return status;
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        permissionStatus,
        isLoadingPermissionStatus,
        refreshPermissionStatus,
        requestPermission,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationContext(): NotificationContextValue {
  return useContext(NotificationContext);
}
