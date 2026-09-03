import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { PageHeader } from "@/src/components/layout/PageHeader";
import { TextField } from "@/src/components/ui/TextField";
import { Button } from "@/src/components/ui/Button";
import { useAuth } from "@/src/hooks/useAuth";
import { useTheme } from "@/src/hooks/useTheme";
import { toAppError, type AppError } from "@/src/types/errors";
import {
  COUNTRY_CODE,
  LOCAL_NUMBER_LENGTH,
  validateLocalPhoneNumber,
} from "@/src/features/authentication/validation";

/**
 * Login screen (Prompt 4A). Presentation + orchestration only — the actual
 * OTP send call is `useAuth().sendOtp`, Prompt 3's existing action. No
 * Supabase call happens directly in this file.
 *
 * Country code is a fixed, non-editable "+91" — the SDD/ADRs specify no
 * multi-country requirement for this KIIT-hostel-specific MVP, and a
 * country picker would be speculative scope; see docs/authentication.md.
 *
 * Security boundary (explicit, per this prompt's constraint): this screen
 * cannot and does not determine whether the entered number belongs to a
 * registered parent — that pre-check has no backend endpoint yet (ADR-020,
 * documented in docs/authentication.md). `sendOtp` is called as Prompt 3
 * implements it today; any resulting error is mapped through the existing
 * safe error taxonomy, never presented as a raw backend/Supabase message.
 */
export default function Login() {
  const router = useRouter();
  const { theme } = useTheme();
  const { sendOtp } = useAuth();

  const [localNumber, setLocalNumber] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<AppError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChangeText = (text: string) => {
    const digits = text.replace(/[^0-9]/g, "").slice(0, LOCAL_NUMBER_LENGTH);
    setLocalNumber(digits);
    if (fieldError) setFieldError(null);
    if (submitError) setSubmitError(null);
  };

  const handleContinue = async () => {
    const validation = validateLocalPhoneNumber(localNumber);
    if (!validation.valid) {
      setFieldError(validation.message);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await sendOtp(validation.fullNumber);
      router.push({ pathname: "/(auth)/otp", params: { phone: validation.fullNumber } });
    } catch (err) {
      setSubmitError(toAppError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const canContinue = localNumber.length === LOCAL_NUMBER_LENGTH && !isSubmitting;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <PageContainer>
        <PageHeader
          title="Enter your mobile number"
          subtitle="We'll send a one-time verification code to confirm it's you."
        />

        <View style={styles.inputRow}>
          <View
            style={[
              styles.codeBox,
              {
                borderColor: theme.colors.border,
                borderRadius: theme.radii.md,
                backgroundColor: theme.colors.surfaceVariant,
              },
            ]}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            <Text style={[styles.codeText, { color: theme.colors.textPrimary }]}>
              {COUNTRY_CODE}
            </Text>
          </View>
          <View style={styles.flex}>
            <TextField
              value={localNumber}
              onChangeText={handleChangeText}
              placeholder="10-digit mobile number"
              keyboardType="number-pad"
              maxLength={LOCAL_NUMBER_LENGTH}
              textContentType="telephoneNumber"
              autoComplete="tel"
              accessibilityLabel={`Mobile number, country code ${COUNTRY_CODE}`}
              errorMessage={fieldError ?? undefined}
              editable={!isSubmitting}
              returnKeyType="done"
              onSubmitEditing={handleContinue}
            />
          </View>
        </View>

        {submitError ? (
          <Text
            accessibilityRole="alert"
            style={[styles.submitError, { color: theme.colors.error, marginTop: theme.spacing.sm }]}
          >
            {submitError.userMessage}
          </Text>
        ) : null}

        <View style={{ marginTop: theme.spacing.lg }}>
          <Button
            label="Continue"
            fullWidth
            loading={isSubmitting}
            disabled={!canContinue}
            onPress={handleContinue}
            accessibilityHint="Sends a verification code to your mobile number"
          />
        </View>
      </PageContainer>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  inputRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  codeBox: {
    height: 44,
    paddingHorizontal: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  codeText: { fontSize: 16, fontWeight: "600" },
  submitError: { fontSize: 13 },
});
