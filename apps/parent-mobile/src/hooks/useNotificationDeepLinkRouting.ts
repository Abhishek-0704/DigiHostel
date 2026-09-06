import { useEffect, useRef } from "react";
import { useRouter, type Href } from "expo-router";
import * as Notifications from "expo-notifications";
import { resolveNotificationDeepLink } from "../features/notifications/notificationDeepLink";
import { logger } from "../services/logger/logger";
import { useAuth } from "./useAuth";

/**
 * Notification tap → deep-link routing (Prompt 8). Mounted once, at the
 * root (`app/_layout.tsx`, via `NotificationDeepLinkHandler`), reusing the
 * existing Expo Router `useRouter()` — no parallel navigation mechanism.
 *
 * Handles all three cases this prompt requires:
 * - foreground/background tap: `addNotificationResponseReceivedListener`
 * - cold-start tap: `getLastNotificationResponseAsync()` on mount
 *
 * Deferred navigation: a tap that arrives before the app is authenticated
 * (e.g. a cold start where the user hasn't signed in yet) is held in
 * `pendingHrefRef` and only actually navigated once `status === "authenticated"`
 * — this app's existing `AuthGate` remains the sole authority for what is
 * reachable before then; this hook never bypasses it.
 *
 * Deduplication: `handledResponseIds` prevents the same notification
 * response (which can otherwise surface through both the cold-start check
 * AND the listener) from triggering navigation twice.
 *
 * IMPORTANT CAPABILITY NOTE: see `notificationDeepLink.ts`'s doc comment —
 * no real push this backend sends today carries a `data` payload, so this
 * hook currently only ever has something to route on when this app itself
 * schedules/receives a notification with structured data (none does yet in
 * production use) — it is real, correct, ADR-consistent infrastructure
 * ready for the moment the backend adds one.
 */
export function useNotificationDeepLinkRouting(): void {
  const router = useRouter();
  const { status } = useAuth();
  const pendingHrefRef = useRef<Href | null>(null);
  const handledResponseIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handleResponse = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const responseId = response.notification.request.identifier;
      if (handledResponseIds.current.has(responseId)) return;
      handledResponseIds.current.add(responseId);

      const result = resolveNotificationDeepLink(response.notification.request.content.data);
      if (result.kind !== "leave_approval") {
        logger.warn("notifications: ignoring unsupported/invalid deep-link payload", {
          kind: result.kind,
        });
        return;
      }
      pendingHrefRef.current = result.href;
    };

    Notifications.getLastNotificationResponseAsync()
      .then(handleResponse)
      .catch((err) => {
        logger.warn("notifications: failed to read the cold-start notification response", { err });
      });
    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (status === "authenticated" && pendingHrefRef.current) {
      const href = pendingHrefRef.current;
      pendingHrefRef.current = null;
      router.push(href);
    }
  }, [status, router]);
}
