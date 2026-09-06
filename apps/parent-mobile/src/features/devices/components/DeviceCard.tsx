import { Pressable, StyleSheet, Text, View } from "react-native";
import { useThemeContext } from "../../../contexts/ThemeContext";
import { Card } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import { DeviceStatusBadge } from "./DeviceStatusBadge";
import { deviceDisplayName, formatDeviceDate } from "../deviceDisplay";
import { getDeviceTrustState } from "../deviceStatus";
import type { TrustedDeviceSummary } from "../../../services/devices/devices";

export interface DeviceCardProps {
  device: TrustedDeviceSummary;
  onPress: () => void;
}

/** One row in the trusted-device list. Deliberately shows only fields the
 * backend actually provides (platform, registration date, trust status,
 * current-device indicator) — no "last active" (no such column exists —
 * see devices.ts's doc comment) and no raw device id. */
export function DeviceCard({ device, onPress }: DeviceCardProps) {
  const { theme } = useThemeContext();
  const registeredLabel = formatDeviceDate(device.registeredAt);
  const name = deviceDisplayName(device.platform);

  const accessibilityLabel = [
    name,
    device.isCurrentDevice ? "this device" : null,
    getDeviceTrustState(device) === "revoked" ? "revoked" : "trusted",
    registeredLabel ? `registered ${registeredLabel}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Opens device details"
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Card style={styles.card}>
        <View style={styles.row}>
          <View style={styles.textColumn}>
            <View style={styles.nameRow}>
              <Text style={[styles.name, { color: theme.colors.textPrimary }]}>{name}</Text>
              {device.isCurrentDevice ? <Badge label="This device" tone="primary" /> : null}
            </View>
            {registeredLabel ? (
              <Text
                style={[
                  styles.meta,
                  { color: theme.colors.textSecondary, marginTop: theme.spacing.xs },
                ]}
              >
                Registered {registeredLabel}
              </Text>
            ) : null}
          </View>
          <DeviceStatusBadge device={device} />
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  textColumn: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  name: { fontSize: 16, fontWeight: "600" },
  meta: { fontSize: 13 },
});
