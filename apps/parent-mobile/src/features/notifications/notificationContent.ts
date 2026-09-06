import type { NotificationCategory } from "./notificationTypes";

/**
 * Notification display copy (Prompt 8) — no React/RN import.
 *
 * The `notifications` table stores no title/body text of its own (see
 * `notificationTypes.ts`'s doc comment) — the real push text is built
 * server-side, per notification, by
 * `apps/api/src/workers/notificationContent.ts`'s `buildLeaveNotificationContent`,
 * which personalizes the body with the student's name and roll number. This
 * app has no way to fetch that student data (no `/profile` route, no
 * `services/students` — see `docs/foundation.md` §13's Student Summary
 * boundary), so it cannot reproduce that personalized body. The title below
 * is the exact, already-approved static text the backend puts in the real
 * push notification (`buildLeaveNotificationContent`'s `title` is
 * hard-coded and identical regardless of stage/student) — reusing it here
 * is honest consistency, not a guess. The description is deliberately
 * generic instead.
 */
export function buildNotificationDisplayContent(category: NotificationCategory): {
  title: string;
  description: string;
} {
  switch (category) {
    case "leave_approval":
      return {
        title: "Leave request awaiting your response",
        description: "A linked student has a pending leave request. Open it to review details.",
      };
    case "library":
      return {
        title: "Library update",
        description: "A library pass update is available.",
      };
    default:
      return {
        title: "Notification",
        description: "Open this notification for more information.",
      };
  }
}
