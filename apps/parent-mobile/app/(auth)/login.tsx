import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { ParentRelationshipType } from "@digihostel/api-client-react";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { PageHeader } from "@/src/components/layout/PageHeader";
import { TextField } from "@/src/components/ui/TextField";
import { Button } from "@/src/components/ui/Button";
import { SelectableChip } from "@/src/components/ui/SelectableChip";
import { useAuth } from "@/src/hooks/useAuth";
import { useTheme } from "@/src/hooks/useTheme";
import { toAppError, type AppError } from "@/src/types/errors";
import { RELATIONSHIP_OPTIONS, isValidRollNumber } from "@/src/features/authentication/validation";

/**
 * Login screen (F-02 remediation, PRR Phase 13). Presentation + orchestration
 * only — the actual eligibility/OTP-request call is `useAuth().requestOtp`.
 * No Supabase call happens directly in this file, and no phone number field
 * exists anywhere on this screen: the client submits a roll number +
 * relationship, and the backend resolves the authoritative parent phone
 * number entirely server-side (ADR-020's required pre-check), never
 * returning it to this app.
 *
 * This screen cannot and does not determine whether the entered roll
 * number/relationship is actually registered — the backend's response is
 * deliberately identical either way (anti-enumeration); any resulting error
 * is mapped through the existing safe error taxonomy, never presented as a
 * raw backend message.
 */
export default function Login() {
  const router = useRouter();
  const { theme } = useTheme();
  const { requestOtp } = useAuth();

  const [rollNumber, setRollNumber] = useState("");
  const [relationshipType, setRelationshipType] = useState<ParentRelationshipType | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<AppError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChangeText = (text: string) => {
    setRollNumber(text);
    if (fieldError) setFieldError(null);
    if (submitError) setSubmitError(null);
  };

  const handleContinue = async () => {
    const trimmedRollNumber = rollNumber.trim();
    if (!isValidRollNumber(trimmedRollNumber)) {
      setFieldError("Enter your ward's roll number.");
      return;
    }
    if (!relationshipType) {
      setFieldError("Select your relationship to the student.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const { challengeId } = await requestOtp(trimmedRollNumber, relationshipType);
      router.push({
        pathname: "/(auth)/otp",
        params: { challengeId, rollNumber: trimmedRollNumber, relationshipType },
      });
    } catch (err) {
      setSubmitError(toAppError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const canContinue = isValidRollNumber(rollNumber) && relationshipType !== null && !isSubmitting;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <PageContainer>
        <PageHeader
          title="Sign in as a parent or guardian"
          subtitle="Enter your ward's roll number and your relationship to them. We'll send a one-time verification code to the registered mobile number."
        />

        <TextField
          value={rollNumber}
          onChangeText={handleChangeText}
          placeholder="Roll number"
          autoCapitalize="characters"
          autoComplete="off"
          accessibilityLabel="Ward's roll number"
          editable={!isSubmitting}
          returnKeyType="done"
        />

        <View style={[styles.chipRow, { marginTop: theme.spacing.md }]}>
          {RELATIONSHIP_OPTIONS.map((option) => (
            <SelectableChip
              key={option.value}
              label={option.label}
              selected={relationshipType === option.value}
              onPress={() => {
                setRelationshipType(option.value);
                if (fieldError) setFieldError(null);
                if (submitError) setSubmitError(null);
              }}
            />
          ))}
        </View>

        {fieldError ? (
          <Text
            accessibilityRole="alert"
            style={[styles.submitError, { color: theme.colors.error, marginTop: theme.spacing.sm }]}
          >
            {fieldError}
          </Text>
        ) : null}

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
            accessibilityHint="Sends a verification code to the registered mobile number"
          />
        </View>
      </PageContainer>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chipRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  submitError: { fontSize: 13 },
});
