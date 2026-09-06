import { useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { PageHeader } from "@/src/components/layout/PageHeader";
import { Card } from "@/src/components/ui/Card";
import { Divider } from "@/src/components/ui/Divider";
import { Button } from "@/src/components/ui/Button";
import { Loader } from "@/src/components/feedback/Loader";
import { ErrorState } from "@/src/components/feedback/ErrorState";
import { DeviceStatusBadge } from "@/src/features/devices/components/DeviceStatusBadge";
import { SecurityBanner } from "@/src/components/ui/SecurityBanner";
import { deviceDisplayName, formatDeviceDate } from "@/src/features/devices/deviceDisplay";
import {
  getDeviceTrustState,
  canRemoveDevice,
  canReplaceDevice,
} from "@/src/features/devices/deviceStatus";
import { useDevice } from "@/src/hooks/useDevice";
import { useBiometric } from "@/src/hooks/useBiometric";
import { useTheme } from "@/src/hooks/useTheme";
import { AppError } from "@/src/types/errors";
import { biometricResultMessage } from "@/src/features/biometric/biometricMessages";
import { DEVICE_ACTIVITY_UNAVAILABLE } from "@/src/features/devices/deviceActivity";
import type { BiometricResultKind } from "@/src/services/biometric/biometric";

type DetailUiState = "viewing" | "confirm-remove" | "confirm-replace";

/**
 * Device Details (Prompt 4B). Shows only fields the backend actually
 * provides for this row (platform, registration date, revocation
 * date/reason, current-device indicator, trust status) — never the raw
 * `trusted_devices.id` UUID as visible text (it's used only as a React
 * key / route param, never rendered).
 *
 * Remove and Replace are both implemented as state-driven panels on this
 * one screen rather than separate routes (per this prompt's own "don't
 * create a route for every visual state" instruction) — both ultimately
 * call the same fail-closed `deviceService` operations `useDevice` already
 * wraps, so neither can succeed today (see devices.ts's doc comment); the
 * UI still implements the full confirm → in-progress → success/failure
 * shape correctly for when a real backend operation exists.
 *
 * Prompt 5 addition: if the user has opted in to biometric authentication
 * (`useBiometric().isEnabled`), Remove/Replace require a successful
 * biometric step-up FIRST, before `revoke`/`register` is ever called. This
 * is a discretionary, this-prompt's-own judgment call (removing/replacing
 * trusted-device access is a sensitive action, analogous to the SDD's
 * biometric-gated leave-approval requirement) — it is not a literal SDD
 * mandate for this specific screen, and it is deliberately gated behind the
 * opt-in preference rather than unconditional, unlike a genuinely
 * SDD-mandated gate (e.g. a future leave-approval screen) would be. See
 * docs/authentication.md §16. If the user has not enabled biometrics, this
 * screen behaves exactly as it did in Prompt 4B — unchanged.
 *
 * Prompt 6 additions: the device list now comes from `useDevice()`'s
 * TanStack-Query-backed cache (shared with the Security Center Home and
 * Trusted Devices List screens — no manual refetch-on-mount needed here
 * anymore, `useQuery` does that automatically). An honest "Activity"
 * section was added — see `deviceActivity.ts`'s doc comment for exactly
 * why no real per-device activity feed exists to show instead.
 */
export default function DeviceDetail() {
  const { deviceId } = useLocalSearchParams<{ deviceId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const {
    devices,
    isLoading,
    error,
    refresh,
    revoke,
    isRevoking,
    revocationError,
    register,
    isRegistering,
    registrationError,
  } = useDevice();
  const {
    isEnabled: biometricEnabled,
    isAuthenticating: isBiometricPending,
    stepUp,
  } = useBiometric();
  const [uiState, setUiState] = useState<DetailUiState>("viewing");
  const [biometricFailure, setBiometricFailure] = useState<Exclude<
    BiometricResultKind,
    "success"
  > | null>(null);

  const device = devices.find((candidate) => candidate.id === deviceId);

  if (isLoading && devices.length === 0) {
    return (
      <PageContainer>
        <Loader fullPage />
      </PageContainer>
    );
  }

  if (error && devices.length === 0) {
    return (
      <PageContainer>
        <ErrorState error={error} onRetry={refresh} />
      </PageContainer>
    );
  }

  if (!device) {
    return (
      <PageContainer>
        <ErrorState
          error={new AppError("not_found", "We couldn't find that device.")}
          onRetry={refresh}
        />
      </PageContainer>
    );
  }

  const trustState = getDeviceTrustState(device);
  const registeredLabel = formatDeviceDate(device.registeredAt);
  const revokedLabel = device.revokedAt ? formatDeviceDate(device.revokedAt) : null;

  const handleRemove = async () => {
    setBiometricFailure(null);
    if (biometricEnabled) {
      const stepUpResult = await stepUp(
        `trusted-device:${device.id}:remove`,
        "Confirm it's you to remove this device",
      );
      if (stepUpResult.kind !== "success") {
        setBiometricFailure(stepUpResult.kind);
        return;
      }
    }
    revoke(device.id)
      .then(() => setUiState("viewing"))
      .catch(() => {
        // revocationError already carries the mapped AppError; the panel
        // below renders it.
      });
  };

  const handleReplace = async () => {
    setBiometricFailure(null);
    if (biometricEnabled) {
      const stepUpResult = await stepUp(
        `trusted-device:${device.id}:replace`,
        "Confirm it's you to replace this device",
      );
      if (stepUpResult.kind !== "success") {
        setBiometricFailure(stepUpResult.kind);
        return;
      }
    }
    register()
      .then(() => {
        setUiState("viewing");
        router.back();
      })
      .catch(() => {
        // registrationError already carries the mapped AppError.
      });
  };

  const dismissConfirm = (target: DetailUiState) => {
    setBiometricFailure(null);
    setUiState(target);
  };

  return (
    <PageContainer>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <PageHeader title={deviceDisplayName(device.platform)} />

        {device.isCurrentDevice ? (
          <View style={{ marginBottom: theme.spacing.md }}>
            <SecurityBanner tone="info" message="You're currently using this device." />
          </View>
        ) : null}

        {trustState === "revoked" ? (
          <View style={{ marginBottom: theme.spacing.md }}>
            <SecurityBanner
              tone="warning"
              message="This device is no longer trusted and can't approve leave requests. Verify a device again from the sign-in flow if you need to use it."
            />
          </View>
        ) : null}

        <Card>
          <DetailRow label="Platform" value={deviceDisplayName(device.platform)} />
          <Divider />
          <DetailRow label="Registered" value={registeredLabel ?? "Unknown"} />
          <Divider />
          <DetailRow label="Trust status" value={<DeviceStatusBadge device={device} />} />
          {revokedLabel ? (
            <>
              <Divider />
              <DetailRow label="Removed" value={revokedLabel} />
            </>
          ) : null}
          {device.revokedReason ? (
            <>
              <Divider />
              <DetailRow label="Reason" value={device.revokedReason} />
            </>
          ) : null}
        </Card>

        <View style={{ marginTop: theme.spacing.md }}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Activity</Text>
          <Card style={{ marginTop: theme.spacing.xs }}>
            <Text style={[styles.detailLabel, { color: theme.colors.textPrimary }]}>
              {DEVICE_ACTIVITY_UNAVAILABLE.title}
            </Text>
            <Text
              style={[
                styles.activityDescription,
                { color: theme.colors.textSecondary, marginTop: theme.spacing.xs },
              ]}
            >
              {DEVICE_ACTIVITY_UNAVAILABLE.description}
            </Text>
          </Card>
        </View>

        {uiState === "viewing" && trustState === "active" ? (
          <View style={styles.actions}>
            {canReplaceDevice(device) ? (
              <Button
                label="Replace this device"
                variant="secondary"
                fullWidth
                onPress={() => setUiState("confirm-replace")}
                accessibilityHint="Starts verifying your current device in place of this one"
              />
            ) : null}
            {canRemoveDevice(device) ? (
              <Button
                label="Remove this device"
                variant="danger"
                fullWidth
                onPress={() => setUiState("confirm-remove")}
                accessibilityHint="Removes this device's trusted access"
              />
            ) : null}
          </View>
        ) : null}

        {uiState === "confirm-remove" ? (
          <View style={styles.actions}>
            {isBiometricPending || isRevoking ? (
              <View style={styles.centerBlock}>
                <Loader />
                {isBiometricPending ? (
                  <Text
                    style={[
                      styles.statusText,
                      { color: theme.colors.textSecondary, marginTop: theme.spacing.sm },
                    ]}
                  >
                    Confirm it's you…
                  </Text>
                ) : null}
              </View>
            ) : biometricFailure ? (
              <SecurityBanner
                tone="warning"
                message={biometricResultMessage(biometricFailure).description}
              />
            ) : revocationError ? (
              <ErrorState error={revocationError} onRetry={handleRemove} />
            ) : (
              <SecurityBanner
                tone="warning"
                message="This device will no longer be trusted and won't be able to approve leave requests. This can't be undone."
              />
            )}
            {!isBiometricPending && !isRevoking ? (
              <View style={styles.actionRow}>
                <View style={styles.actionFlex}>
                  <Button
                    label="Cancel"
                    variant="secondary"
                    fullWidth
                    onPress={() => dismissConfirm("viewing")}
                  />
                </View>
                <View style={styles.actionFlex}>
                  <Button
                    label={biometricFailure ? "Try again" : "Remove device"}
                    variant="danger"
                    fullWidth
                    onPress={handleRemove}
                  />
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {uiState === "confirm-replace" ? (
          <View style={styles.actions}>
            {isBiometricPending || isRegistering ? (
              <View style={styles.centerBlock}>
                <Loader />
                <Text
                  style={[
                    styles.statusText,
                    { color: theme.colors.textSecondary, marginTop: theme.spacing.sm },
                  ]}
                >
                  {isBiometricPending ? "Confirm it's you…" : "Verifying your device…"}
                </Text>
              </View>
            ) : biometricFailure ? (
              <SecurityBanner
                tone="warning"
                message={biometricResultMessage(biometricFailure).description}
              />
            ) : registrationError ? (
              <ErrorState error={registrationError} onRetry={handleReplace} />
            ) : (
              <SecurityBanner
                tone="info"
                message="This will verify your current device in place of this one. It won't automatically remove this device's access — you can remove it separately once your new device is verified."
              />
            )}
            {!isBiometricPending && !isRegistering ? (
              <View style={styles.actionRow}>
                <View style={styles.actionFlex}>
                  <Button
                    label="Cancel"
                    variant="secondary"
                    fullWidth
                    onPress={() => dismissConfirm("viewing")}
                  />
                </View>
                <View style={styles.actionFlex}>
                  <Button
                    label={biometricFailure ? "Try again" : "Start verification"}
                    fullWidth
                    onPress={handleReplace}
                  />
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </PageContainer>
  );
}

function DetailRow({ label, value }: { label: string; value: string | ReactNode }) {
  const { theme } = useTheme();
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>{label}</Text>
      {typeof value === "string" ? (
        <Text style={[styles.detailValue, { color: theme.colors.textPrimary }]}>{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 32 },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  detailLabel: { fontSize: 14 },
  detailValue: { fontSize: 14, fontWeight: "600" },
  sectionTitle: { fontSize: 13, fontWeight: "600" },
  activityDescription: { fontSize: 13, lineHeight: 18 },
  actions: { marginTop: 20, gap: 12 },
  actionRow: { flexDirection: "row", gap: 12 },
  actionFlex: { flex: 1 },
  centerBlock: { alignItems: "center", paddingVertical: 16 },
  statusText: { fontSize: 14 },
});
