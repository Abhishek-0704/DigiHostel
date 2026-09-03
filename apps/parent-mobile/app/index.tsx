import { PageContainer } from "@/src/components/layout/PageContainer";
import { Loader } from "@/src/components/feedback/Loader";
import { ErrorState } from "@/src/components/feedback/ErrorState";
import { useAuth } from "@/src/hooks/useAuth";
import { AppError } from "@/src/types/errors";

/**
 * Splash screen (Prompt 2 — SDD Ch.4's documented entry point; wired to
 * real auth state in Prompt 3). AuthGate (src/navigation/AuthGate.tsx)
 * handles the actual redirect once status resolves — this screen only
 * needs to render something reasonable for the states where no redirect
 * happens (initializing/authenticating: loading; offline/error: a safe,
 * generic message — Prompt 4 owns any richer error UI). For every other
 * status, a redirect is imminent, so a brief loading frame is correct here
 * too rather than a dead end.
 */
export default function Splash() {
  const { status, error } = useAuth();

  if (status === "error" || status === "offline") {
    return (
      <PageContainer>
        <ErrorState
          error={
            error ??
            new AppError(
              status === "offline" ? "network" : "unknown",
              status === "offline"
                ? "You appear to be offline. Please check your connection and try again."
                : "Something went wrong. Please try again.",
            )
          }
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Loader fullPage />
    </PageContainer>
  );
}
