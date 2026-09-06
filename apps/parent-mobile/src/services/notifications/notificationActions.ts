/**
 * Notification mutation actions (Prompt 8) — Mark as Read, Mark All Read,
 * Delete, Archive.
 *
 * None of these has a real backend counterpart:
 * - No read/unread column exists on `notifications` at all
 *   (`packages/db/src/schema/notification.ts`'s full column list — see
 *   `src/features/notifications/notificationClassification.ts`'s `isUnread`
 *   doc comment).
 * - No RLS UPDATE/DELETE policy is granted to the `authenticated` role on
 *   `notifications` — only Fastify's service-role writes it (RLS policy
 *   list in the same schema file).
 * - No Fastify route exists for any of these operations
 *   (`apps/api/src/routes/` contains only `leave.ts`/`health.ts`/`test-auth.ts`).
 *
 * Per this prompt's explicit rule ("If mark-as-read or deletion APIs do not
 * exist: do not create fake mutations, do not pretend the operation
 * succeeded, expose a truthful unavailable/error state"), every method here
 * always rejects with `NotificationActionNotSupportedError` — mirroring the
 * exact fail-closed pattern already established by
 * `ApprovalServiceNotImplementedError` (`src/services/approvals/approvals.ts`)
 * and `DeviceServiceNotImplementedError`
 * (`src/services/devices/deviceServiceErrors.ts`). UI consumers (see
 * `src/hooks/useNotificationCenter.ts`) render this as a disabled action with
 * an explanatory message, never a working toggle.
 */
export type NotificationActionKind = "mark_read" | "mark_all_read" | "delete" | "archive";

const ACTION_LABELS: Record<NotificationActionKind, string> = {
  mark_read: "marking a notification as read",
  mark_all_read: "marking all notifications as read",
  delete: "deleting a notification",
  archive: "archiving a notification",
};

export class NotificationActionNotSupportedError extends Error {
  constructor(readonly action: NotificationActionKind) {
    super(
      `DigiHostel doesn't support ${ACTION_LABELS[action]} yet. This will be available in a future update.`,
    );
    this.name = "NotificationActionNotSupportedError";
  }
}

export interface NotificationActionsService {
  markAsRead(notificationId: string): Promise<void>;
  markAllAsRead(): Promise<void>;
  deleteNotification(notificationId: string): Promise<void>;
  archiveNotification(notificationId: string): Promise<void>;
}

export const notificationActionsService: NotificationActionsService = {
  async markAsRead(): Promise<never> {
    throw new NotificationActionNotSupportedError("mark_read");
  },
  async markAllAsRead(): Promise<never> {
    throw new NotificationActionNotSupportedError("mark_all_read");
  },
  async deleteNotification(): Promise<never> {
    throw new NotificationActionNotSupportedError("delete");
  },
  async archiveNotification(): Promise<never> {
    throw new NotificationActionNotSupportedError("archive");
  },
};
