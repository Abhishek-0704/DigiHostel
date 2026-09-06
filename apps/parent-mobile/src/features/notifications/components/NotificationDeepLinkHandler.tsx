import { useNotificationDeepLinkRouting } from "../../../hooks/useNotificationDeepLinkRouting";

/** Renders nothing — mounts `useNotificationDeepLinkRouting()` once at the
 * root (`app/_layout.tsx`), inside `AuthGate` so it shares the same
 * `useAuth()`/provider tree. A component (not a bare hook call in
 * `RootLayout`) because `RootLayout` itself renders `AppProviders`, so it is
 * outside the provider tree this hook needs — this is placed as a sibling to
 * `<Stack>`, inside `<AuthGate>`, exactly like `AuthGate` itself needs to be
 * inside the providers it reads from. */
export function NotificationDeepLinkHandler() {
  useNotificationDeepLinkRouting();
  return null;
}
