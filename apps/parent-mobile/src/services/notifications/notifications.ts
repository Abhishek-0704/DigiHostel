import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { getSupabaseClient } from "../supabase/client";
import {
  isValidRawNotificationRow,
  mapRowToNotification,
} from "../../features/notifications/notificationClassification";
import type { ParentNotification } from "../../features/notifications/notificationTypes";
import { logger } from "../logger/logger";

/**
 * Notification service (Prompt 2 foundation; made real in Prompt 8).
 *
 * `listNotifications()` is REAL: `notifications` has a genuine RLS SELECT
 * policy scoped to the caller's own parent/student id
 * (`notifications_select_own_parent`/`_own_student` —
 * `packages/db/src/schema/notification.ts`), read directly via the Supabase
 * client exactly like `deviceService.listTrustedDevices()`
 * (`src/services/devices/devices.ts`) — a read-only, RLS-scoped UX signal,
 * the same established pattern, not a new architecture. Bounded to the most
 * recent `MAX_NOTIFICATIONS` rows rather than unbounded history, so this
 * app never needs to defensively cap anything downstream (search, sort) —
 * see `docs/notifications.md`'s capability matrix.
 *
 * `getPermissionStatus()`/`requestPermission()`/`getPushToken()` are REAL —
 * `expo-notifications` (added in Prompt 8) provides genuine OS-level
 * permission/capability detection with no backend dependency.
 *
 * `registerPushToken()` remains fail-closed: `trusted_devices.expo_push_token`
 * (the column the notification worker actually reads —
 * `apps/api/src/domain/notification/repository.ts`'s `getPushTokensForRecipient`)
 * has no Fastify endpoint to write it through. `trusted_devices` does have an
 * RLS UPDATE policy (`trusted_devices_revoke_own`) that would technically
 * permit a raw client UPDATE, but this app deliberately never performs
 * backend-owned device mutations as raw RLS writes (the same principle
 * `deviceService.registerCurrentDevice()`/`revokeDevice()` already
 * establish) — see docs/notifications.md's capability matrix for why this
 * is classified MISSING, not merely unwired.
 */

export type NotificationPermissionStatus = "undetermined" | "granted" | "denied";

const MAX_NOTIFICATIONS = 200;

export interface NotificationService {
  listNotifications(): Promise<ParentNotification[]>;
  getPermissionStatus(): Promise<NotificationPermissionStatus>;
  requestPermission(): Promise<NotificationPermissionStatus>;
  /** Attempts to acquire a real Expo push token for this device. Returns
   * `null` (never throws) when acquisition genuinely isn't possible in this
   * environment — no EAS `projectId` configured, no physical
   * push-capable device, or a network/provider failure — since "no token
   * available" is an ordinary capability outcome, not an application error. */
  getPushToken(): Promise<string | null>;
  registerPushToken(): Promise<void>;
}

export class NotificationServiceNotImplementedError extends Error {
  constructor() {
    super(
      "Registering this device for push notifications isn't available yet. " +
        "Please check the app for updates instead.",
    );
    this.name = "NotificationServiceNotImplementedError";
  }
}

/** Foreground presentation behavior — required by `expo-notifications` even
 * though no real remote push has ever been delivered in this environment
 * (see docs/notifications.md's native-verification limitations). Sound/badge
 * are left off: this app has no sound asset and no verified badge-count
 * source to set automatically. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function mapPermissionStatus(status: string): NotificationPermissionStatus {
  if (status === "granted") return "granted";
  if (status === "denied") return "denied";
  return "undetermined";
}

export const notificationService: NotificationService = {
  async listNotifications() {
    const { data, error } = await getSupabaseClient()
      .from("notifications")
      .select("id, related_leave_request_id, related_library_pass_id, status, created_at")
      .order("created_at", { ascending: false })
      .limit(MAX_NOTIFICATIONS);
    if (error) throw error;
    const rows = data ?? [];
    const validRows = rows.filter(isValidRawNotificationRow);
    if (validRows.length !== rows.length) {
      logger.warn("notifications: skipped malformed row(s) in list response", {
        skipped: rows.length - validRows.length,
      });
    }
    return validRows.map(mapRowToNotification);
  },

  async getPermissionStatus() {
    const result = await Notifications.getPermissionsAsync();
    return mapPermissionStatus(result.status);
  },

  async requestPermission() {
    const result = await Notifications.requestPermissionsAsync();
    return mapPermissionStatus(result.status);
  },

  async getPushToken() {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (typeof projectId !== "string") {
      logger.warn("push: no EAS projectId configured — cannot acquire an Expo push token");
      return null;
    }
    try {
      const token = await Notifications.getExpoPushTokenAsync({ projectId });
      return token.data;
    } catch (err) {
      logger.warn("push: failed to acquire a push token", {
        message: err instanceof Error ? err.message : "unknown",
      });
      return null;
    }
  },

  async registerPushToken(): Promise<never> {
    throw new NotificationServiceNotImplementedError();
  },
};
