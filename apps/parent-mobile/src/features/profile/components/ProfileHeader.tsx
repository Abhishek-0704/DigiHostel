import { StyleSheet, Text, View } from "react-native";
import { useThemeContext } from "../../../contexts/ThemeContext";
import { Badge } from "../../../components/ui/Badge";

export interface ProfileHeaderProps {
  name: string | null;
  /** Reuses `useDevice()`'s real trusted-device state (see `useProfile`'s
   * consumer screen) — "verified" means "at least one active trusted
   * device," never a fabricated identity-verification claim. */
  verified: boolean;
  isLoadingVerification: boolean;
}

/**
 * Profile Home's header (Prompt 11). No photo/image asset exists anywhere
 * in this app — the avatar is a generic initials circle (first letter of
 * the real name, or a neutral placeholder glyph when the name is
 * unavailable), not a fabricated photo. "Verified" is shown only alongside
 * its own explanatory word, never as a color-only signal (a checkmark-only
 * badge would rely on shape/color alone).
 */
export function ProfileHeader({ name, verified, isLoadingVerification }: ProfileHeaderProps) {
  const { theme } = useThemeContext();
  const initial = name?.trim()?.[0]?.toUpperCase() ?? "?";

  return (
    <View style={styles.container} accessibilityRole="header">
      <View
        style={[
          styles.avatar,
          { backgroundColor: theme.colors.primary, borderRadius: theme.radii.full },
        ]}
        accessible
        accessibilityLabel="Profile picture placeholder"
      >
        <Text style={[styles.avatarText, { color: theme.colors.onPrimary }]}>{initial}</Text>
      </View>
      <View style={styles.textColumn}>
        <Text style={[styles.name, { color: theme.colors.textPrimary }]}>
          {name ?? "Not available"}
        </Text>
        {isLoadingVerification ? null : (
          <View style={{ marginTop: theme.spacing.xs, alignSelf: "flex-start" }}>
            <Badge
              label={verified ? "Verified device" : "Not verified"}
              tone={verified ? "success" : "neutral"}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", gap: 16 },
  avatar: { width: 64, height: 64, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 26, fontWeight: "700" },
  textColumn: { flex: 1 },
  name: { fontSize: 20, fontWeight: "700" },
});
