import { StyleSheet, Text, View } from "react-native";
import { useThemeContext } from "../../contexts/ThemeContext";
import { useNetworkContext } from "../../contexts/NetworkContext";

/** Renders only when connectivity is known to be offline — stays hidden for
 * "unknown" (see NetworkContext's doc comment on why "unknown" is not
 * treated as "online" for write-blocking purposes, but IS treated as
 * "don't alarm the user" for this purely-informational banner). No real
 * detector is wired up yet, so this never actually renders in this
 * foundation pass — included so the visual slot exists for when one is. */
export function OfflineBanner() {
  const { theme } = useThemeContext();
  const { status } = useNetworkContext();

  if (status !== "offline") return null;

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.warning }]}
      accessibilityRole="alert"
    >
      <Text style={[styles.text, { color: theme.colors.onWarning }]}>You're offline</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 6, alignItems: "center" },
  text: { fontSize: 13, fontWeight: "600" },
});
