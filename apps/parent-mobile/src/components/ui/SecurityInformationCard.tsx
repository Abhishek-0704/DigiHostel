import { StyleSheet, Text, View } from "react-native";
import { useThemeContext } from "../../contexts/ThemeContext";
import { Card } from "./Card";
import { Divider } from "./Divider";
import type { InfoSection } from "../../types/content";

export interface SecurityInformationCardProps {
  sections: InfoSection[];
}

/** Generic title/body section-list renderer inside a `Card` (Prompt 4B,
 * relocated here in Prompt 5 once a second feature — biometric — needed the
 * exact same renderer for its own education copy). Originally lived under
 * `features/devices/components/`; moved to `components/ui` once it proved
 * to carry no device-specific knowledge at all, matching this directory's
 * "generic, reusable primitives only" convention. */
export function SecurityInformationCard({ sections }: SecurityInformationCardProps) {
  const { theme } = useThemeContext();
  return (
    <Card>
      {sections.map((section, index) => (
        <View key={section.title}>
          {index > 0 ? (
            <View style={{ marginVertical: theme.spacing.sm }}>
              <Divider />
            </View>
          ) : null}
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>{section.title}</Text>
          <Text
            style={[
              styles.body,
              { color: theme.colors.textSecondary, marginTop: theme.spacing.xs },
            ]}
          >
            {section.body}
          </Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 14, fontWeight: "600" },
  body: { fontSize: 13, lineHeight: 18 },
});
