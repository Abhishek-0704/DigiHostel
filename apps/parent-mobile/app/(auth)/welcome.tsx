import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { Button } from "@/src/components/ui/Button";
import { useTheme } from "@/src/hooks/useTheme";
import { typography } from "@/src/styles/typography";

/**
 * Welcome screen (Prompt 4A — SDD Ch.4's documented entry point). Purely
 * presentational: a short explanation and one CTA into the Login flow. No
 * onboarding carousel, no Terms/Privacy page — neither is named in the
 * authoritative SDD/ADRs, and inventing one (with content this task has no
 * source for) is out of scope; see docs/authentication.md for this
 * decision.
 */
export default function Welcome() {
  const router = useRouter();
  const { theme } = useTheme();

  return (
    <PageContainer style={styles.container}>
      <View style={styles.content}>
        <Text
          style={[typography.headlineLarge, { color: theme.colors.textPrimary }]}
          accessibilityRole="header"
        >
          DigiHostel Parent
        </Text>
        <Text
          style={[
            typography.bodyLarge,
            { color: theme.colors.textSecondary, marginTop: theme.spacing.md },
          ]}
        >
          Securely review and approve your child&apos;s hostel leave requests — verified, auditable,
          and fast.
        </Text>
      </View>

      <View>
        <Text
          style={[
            typography.bodySmall,
            { color: theme.colors.textSecondary, marginBottom: theme.spacing.md },
          ]}
        >
          Your information is protected and used only to verify hostel leave requests for your
          linked student.
        </Text>
        <Button
          label="Continue"
          fullWidth
          onPress={() => router.push("/(auth)/login")}
          accessibilityHint="Proceed to sign in with your mobile number"
        />
      </View>
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  container: { justifyContent: "space-between", paddingVertical: 32 },
  content: { flex: 1, justifyContent: "center" },
});
