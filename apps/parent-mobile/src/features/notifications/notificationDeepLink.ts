import type { Href } from "expo-router";

/**
 * Notification deep-link validation (Prompt 8) — no React/RN runtime import
 * (`Href` is type-only, erased at compile time — same pattern as
 * `src/navigation/routeGuard.ts`).
 *
 * Deliberately defensive: a notification payload (an Expo Push `data`
 * field, or a payload this app constructs itself from a real DB row) is
 * untrusted input until validated here. This function only ever produces an
 * in-app `Href` into the already-existing, already-`AuthGate`-protected
 * `(app)` route group — never an arbitrary/external URL, and never a claim
 * of authorization: whatever screen `href` points to (`leave/[id]`) remains
 * responsible for its own authorization exactly as it already is for
 * in-app navigation (this prompt's own `<security_boundary>` and
 * `<notification_taps>` rules).
 *
 * IMPORTANT CAPABILITY NOTE: `apps/api/src/lib/push/expoPush.ts`'s
 * `ExpoPushSender.send()` sends only `{ to, title, body }` — no `data`
 * field at all. No real push this backend sends today carries ANY payload
 * this function could validate; every push tap is (for now) genuinely
 * `"invalid"` per this function's own rules. Deep-linking works today only
 * from an in-app notification-card tap, where this app constructs the
 * payload itself from a real, already-fetched `ParentNotification` — see
 * `docs/notifications.md`'s capability matrix for the full picture. This
 * function is written to validate a future push `data` payload the moment
 * the backend adds one, without requiring any client-side redesign.
 */
export type NotificationDeepLinkResult =
  | { kind: "leave_approval"; leaveRequestId: string; href: Href }
  | { kind: "unsupported" }
  | { kind: "invalid" };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KNOWN_TYPES = new Set(["leave_approval"]);

export function resolveNotificationDeepLink(payload: unknown): NotificationDeepLinkResult {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { kind: "invalid" };
  }

  const record = payload as Record<string, unknown>;
  const type = record.type;

  if (typeof type !== "string") {
    return { kind: "invalid" };
  }
  if (!KNOWN_TYPES.has(type)) {
    return { kind: "unsupported" };
  }

  const leaveRequestId = record.leaveRequestId;
  if (typeof leaveRequestId !== "string" || !UUID_PATTERN.test(leaveRequestId)) {
    return { kind: "invalid" };
  }

  return {
    kind: "leave_approval",
    leaveRequestId,
    href: { pathname: "/(app)/leave/[id]", params: { id: leaveRequestId } },
  };
}
