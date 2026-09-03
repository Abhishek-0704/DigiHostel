import { useEffect, type ReactNode } from "react";
import { useRouter, useSegments } from "expo-router";
import { useAuth } from "../hooks/useAuth";
import { resolveRedirect } from "./routeGuard";

/**
 * Route-protection wiring (Prompt 3) — the React/expo-router glue around
 * src/navigation/routeGuard.ts's pure decision logic. Rendered once in the
 * root layout, wrapping the whole `<Stack>`.
 *
 * Deliberately renders `children` unconditionally and only ever *redirects*
 * via `router.replace()` in an effect — never blocks rendering on auth
 * state — so a screen already on screen doesn't flash/unmount while a
 * redirect is merely being decided. `useSegments()` gives the current
 * top-level route group; `resolveRedirect` returns `null` (no-op) once the
 * segment already matches the target, which is what prevents this from
 * looping or fighting in-group navigation (e.g. (auth)/welcome ->
 * (auth)/login -> (auth)/otp never triggers a redirect, since the group
 * doesn't change).
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const currentGroup = segments[0] as string | undefined;
    const destination = resolveRedirect(status, currentGroup);
    if (destination) {
      router.replace(destination);
    }
  }, [status, segments, router]);

  return <>{children}</>;
}
