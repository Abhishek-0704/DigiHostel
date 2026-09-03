import { Text } from "react-native";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { Loader } from "@/src/components/feedback/Loader";
import { useSession } from "@/src/hooks/useSession";
import { useTheme } from "@/src/hooks/useTheme";

/**
 * Splash screen (Prompt 2 — SDD Ch.4's documented entry point). Shows a
 * loading state while the initial session check resolves. Does NOT
 * redirect anywhere yet — routing based on session/device-trust state is
 * explicitly out of this prompt's scope (auth/onboarding business logic);
 * a future prompt wires the actual `router.replace(...)` decision here.
 */
export default function Splash() {
  const { isLoading } = useSession();
  const { theme } = useTheme();

  if (isLoading) {
    return (
      <PageContainer>
        <Loader fullPage />
      </PageContainer>
    );
  }

  return (
    <PageContainer style={{ alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: theme.colors.textSecondary, fontSize: 14 }}>
        DigiHostel Parent — foundation scaffold, routing not yet implemented
      </Text>
    </PageContainer>
  );
}
