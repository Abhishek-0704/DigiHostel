import { StyleSheet, Text, View } from "react-native";
import { useThemeContext } from "../../../contexts/ThemeContext";
import { Card } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import { BiometricMethodBadge } from "./BiometricMethodBadge";
import { canAuthenticate } from "../biometricCapability";
import type { BiometricCapabilities } from "../../../services/biometric/biometric";

export interface BiometricStatusCardProps {
  capabilities: BiometricCapabilities;
  isEnabled: boolean;
}

/** Current biometric status summary — used at the top of the Biometric
 * Settings screen. Never claims "enabled" unless the local preference is
 * actually set (§ enablement boundary — a UI toggle alone never implies
 * this), and never claims a method is available unless the platform
 * capability check actually reported it. */
export function BiometricStatusCard({ capabilities, isEnabled }: BiometricStatusCardProps) {
  const { theme } = useThemeContext();
  const usable = canAuthenticate(capabilities);

  return (
    <Card>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
          Biometric authentication
        </Text>
        <Badge
          label={isEnabled ? "Enabled" : "Disabled"}
          tone={isEnabled ? "success" : "neutral"}
        />
      </View>

      {usable ? (
        <View style={[styles.methodRow, { marginTop: theme.spacing.sm }]}>
          {capabilities.supportedMethods.map((method) => (
            <BiometricMethodBadge key={method} method={method} />
          ))}
        </View>
      ) : (
        <Text
          style={[
            styles.unavailableText,
            { color: theme.colors.textSecondary, marginTop: theme.spacing.sm },
          ]}
        >
          {!capabilities.hardwareAvailable
            ? "This device doesn't support biometric authentication."
            : "Set up a fingerprint, face unlock, or passcode in your device settings to use this."}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  title: { fontSize: 16, fontWeight: "600" },
  methodRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  unavailableText: { fontSize: 13, lineHeight: 18 },
});
