import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useThemeContext } from "../../../contexts/ThemeContext";
import { Card } from "../../../components/ui/Card";
import { DeviceStatusBadge } from "./DeviceStatusBadge";
import { deviceDisplayName } from "../deviceDisplay";
import {
  deviceIdentityService,
  type DeviceMetadata,
} from "../../../services/deviceIdentity/deviceIdentity";
import type { TrustedDeviceSummary } from "../../../services/devices/devices";

export interface CurrentDeviceBannerProps {
  devices: TrustedDeviceSummary[];
}

/**
 * "This device" summary for the Security Center Home (Prompt 6). Uses the
 * existing `deviceIdentityService` — no second device-identity mechanism —
 * for real, local, non-sensitive platform info (never the raw installation
 * UUID), and cross-references the already-fetched trusted-device list to
 * determine trust state.
 *
 * Deliberately distinguishes two different facts, per this prompt's own
 * instruction: "this is the current device" (locally true, always) is NOT
 * the same claim as "this device is trusted" (only true if a matching row
 * exists in `devices`, which — honestly — will be false for every real
 * user today, since no registration flow has ever succeeded; see
 * devices.ts's doc comment).
 */
export function CurrentDeviceBanner({ devices }: CurrentDeviceBannerProps) {
  const { theme } = useThemeContext();
  const [metadata, setMetadata] = useState<DeviceMetadata | null>(null);

  useEffect(() => {
    let mounted = true;
    deviceIdentityService
      .getMetadata()
      .then((result) => {
        if (mounted) setMetadata(result);
      })
      .catch(() => {
        // Leaves metadata null — this component already renders nothing
        // until metadata resolves, so this is a safe, silent no-op.
      });
    return () => {
      mounted = false;
    };
  }, []);

  const trustedMatch = devices.find((device) => device.isCurrentDevice);

  if (!metadata) return null;

  const platformLabel =
    metadata.platform === "ios" || metadata.platform === "android"
      ? deviceDisplayName(metadata.platform)
      : "This device";

  return (
    <Card>
      <View style={styles.row}>
        <View style={styles.textColumn}>
          <Text style={[styles.eyebrow, { color: theme.colors.textSecondary }]}>This device</Text>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>{platformLabel}</Text>
        </View>
        {trustedMatch ? (
          <DeviceStatusBadge device={trustedMatch} />
        ) : (
          <Text style={[styles.notTrusted, { color: theme.colors.textSecondary }]}>
            Not verified
          </Text>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  textColumn: { flex: 1 },
  eyebrow: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4 },
  title: { fontSize: 16, fontWeight: "600", marginTop: 2 },
  notTrusted: { fontSize: 13 },
});
