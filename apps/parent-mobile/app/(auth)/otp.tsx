import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { PageHeader } from "@/src/components/layout/PageHeader";
import { OTPInput } from "@/src/components/ui/OTPInput";
import { Button } from "@/src/components/ui/Button";
import { useAuth } from "@/src/hooks/useAuth";
import { useTheme } from "@/src/hooks/useTheme";
import { maskPhoneNumber } from "@/src/utils/phone";
import { toAppError, type AppError } from "@/src/types/errors";
import { OTP_LENGTH, isCompleteOtp } from "@/src/features/authentication/validation";

/**
 * Conservative UI-only resend cooldown. This is presentation state, not
 * proof of anything: it never asserts the OTP is still valid, and Supabase
 * Auth remains the sole authority on that. 30s comfortably clears the local
 * Supabase config's own SMS `max_frequency` floor (5s — supabase/config.toml)
 * with real margin for a production SMS provider's typical delivery
 * latency; a standard, unremarkable value for this class of flow. If a
 * product requirement ever specifies a different interval, replace this
 * one constant, not the mechanism.
 */
const RESEND_COOLDOWN_SECONDS = 30;

/**
 * OTP verification screen (Prompt 4A). Consumes `useAuth().verifyOtp`
 * (Prompt 3) exclusively — no Supabase call happens directly here. On
 * success, this screen does NOT navigate itself: AuthContext's own
 * device-check effect and AuthGate's redirect (src/navigation/AuthGate.tsx)
 * take over automatically once the real session exists, exactly like
 * (auth)'s own internal welcome -> login -> otp navigation is handled by
 * this screen while everything past OTP is handled by the existing
 * infrastructure.
 */
export default function Otp() {
  const router = useRouter();
  const { theme } = useTheme();
  const { phone } = useLocalSearchParams<{ phone?: string }>();
  const { verifyOtp, sendOtp } = useAuth();

  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [verifyError, setVerifyError] = useState<AppError | null>(null);
  const [verified, setVerified] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    // No phone param means this screen was reached without going through
    // Login (e.g. a stale deep link) — there is nothing to verify against,
    // so send the user back rather than showing a broken form.
    if (!phone) {
      router.replace("/(auth)/login");
    }
  }, [phone, router]);

  const handleVerify = async (submittedCode: string) => {
    if (!phone || !isCompleteOtp(submittedCode) || isVerifying) return;
    setIsVerifying(true);
    setVerifyError(null);
    try {
      await verifyOtp(phone, submittedCode);
      setVerified(true);
    } catch (err) {
      setVerifyError(toAppError(err));
      setCode("");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!phone || cooldown > 0 || isResending) return;
    setIsResending(true);
    setVerifyError(null);
    try {
      await sendOtp(phone);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setCode("");
    } catch (err) {
      setVerifyError(toAppError(err));
    } finally {
      setIsResending(false);
    }
  };

  if (!phone) return null; // brief frame before the redirect effect above fires

  return (
    <PageContainer>
      <PageHeader title="Enter verification code" subtitle={`Sent to ${maskPhoneNumber(phone)}`} />

      {verified ? (
        <View accessibilityLiveRegion="polite" style={styles.successRow}>
          <Text
            style={[styles.successText, { color: theme.colors.success }]}
            accessibilityRole="text"
          >
            ✓ Verified
          </Text>
        </View>
      ) : (
        <>
          <OTPInput
            length={OTP_LENGTH}
            value={code}
            onChange={setCode}
            onComplete={handleVerify}
            disabled={isVerifying}
            errorMessage={verifyError?.userMessage}
          />

          <View style={{ marginTop: theme.spacing.lg }}>
            <Button
              label="Verify"
              fullWidth
              loading={isVerifying}
              disabled={!isCompleteOtp(code)}
              onPress={() => handleVerify(code)}
              accessibilityHint="Confirms the code you entered"
            />
          </View>

          <View style={styles.resendRow}>
            {cooldown > 0 ? (
              <Text
                style={[typographySmall, { color: theme.colors.textSecondary }]}
                accessibilityLiveRegion="polite"
              >
                {`Resend code in 0:${cooldown.toString().padStart(2, "0")}`}
              </Text>
            ) : (
              <Button
                label={isResending ? "Sending…" : "Resend code"}
                variant="ghost"
                loading={isResending}
                onPress={handleResend}
                accessibilityHint="Sends a new verification code to your mobile number"
              />
            )}
          </View>
        </>
      )}
    </PageContainer>
  );
}

const typographySmall = { fontSize: 13 } as const;

const styles = StyleSheet.create({
  resendRow: { marginTop: 20, alignItems: "center" },
  successRow: { alignItems: "center", justifyContent: "center", paddingVertical: 48 },
  successText: { fontSize: 20, fontWeight: "700" },
});
