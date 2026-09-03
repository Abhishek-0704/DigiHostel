/**
 * Notification service interface (Prompt 2 foundation).
 *
 * Partially blocked on backend capability: push DELIVERY already works
 * server-side (apps/api/src/lib/push/expoPush.ts sends real Expo pushes
 * today), but there is no Fastify endpoint to register a device's Expo push
 * token against (`trusted_devices.expo_push_token` is nullable and has no
 * writer — see docs/current-state.md). Requesting OS notification
 * permission is a client-only capability and could be implemented without
 * a backend dependency, but is deliberately left unimplemented in this
 * foundation pass along with the rest of this interface, per this prompt's
 * explicit scope boundary (no notification business logic yet) — see
 * Prompt 1's roadmap, Phase 6.
 */

export type NotificationPermissionStatus = "undetermined" | "granted" | "denied";

export interface NotificationService {
  getPermissionStatus(): Promise<NotificationPermissionStatus>;
  requestPermission(): Promise<NotificationPermissionStatus>;
  registerPushToken(): Promise<void>;
}

export class NotificationServiceNotImplementedError extends Error {
  constructor() {
    super(
      "Notification handling is not implemented yet in the Parent app foundation. " +
        "Push delivery already works server-side; there is no backend endpoint to " +
        "register a push token against yet.",
    );
    this.name = "NotificationServiceNotImplementedError";
  }
}

export class NotImplementedNotificationService implements NotificationService {
  async getPermissionStatus(): Promise<never> {
    throw new NotificationServiceNotImplementedError();
  }
  async requestPermission(): Promise<never> {
    throw new NotificationServiceNotImplementedError();
  }
  async registerPushToken(): Promise<never> {
    throw new NotificationServiceNotImplementedError();
  }
}

export const notificationService: NotificationService = new NotImplementedNotificationService();
