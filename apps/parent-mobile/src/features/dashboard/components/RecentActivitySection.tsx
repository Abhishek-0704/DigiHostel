import { StyleSheet, Text, View } from "react-native";
import { useThemeContext } from "../../../contexts/ThemeContext";
import { Card } from "../../../components/ui/Card";
import { Divider } from "../../../components/ui/Divider";
import { SectionHeader } from "../../../components/ui/SectionHeader";
import { EmptyState } from "../../../components/feedback/EmptyState";
import { RECENT_ACTIVITY_UNAVAILABLE } from "../dashboardContent";

/** Prepared shape for a future unified activity feed — not populated by
 * anything in this prompt. See `dashboardContent.ts`'s doc comment on
 * `RECENT_ACTIVITY_UNAVAILABLE`: `audit_logs` has zero RLS grants for the
 * `authenticated` role, so no real event can be fetched here yet (same
 * evidence `features/devices/deviceActivity.ts` established in Prompt 6).
 * `category` is deliberately narrow — only event kinds this app could ever
 * plausibly attribute to a real source, not a speculative taxonomy. */
export interface ActivityItem {
  id: string;
  label: string;
  timestampIso: string;
  category: "leave" | "security" | "notification";
}

export interface RecentActivitySectionProps {
  /** `undefined` (the only value ever passed today) renders the
   * "unavailable" state — this is distinct from an empty array, which would
   * mean "we asked and there is genuinely nothing," a claim this app cannot
   * make since it has no source to ask. */
  items?: ActivityItem[];
}

export function RecentActivitySection({ items }: RecentActivitySectionProps) {
  const { theme } = useThemeContext();

  return (
    <View style={{ marginTop: theme.spacing.lg }}>
      <SectionHeader title="Recent activity" />
      <Card>
        {items && items.length > 0 ? (
          <View>
            {items.map((item, index) => (
              <View key={item.id}>
                {index > 0 ? <Divider /> : null}
                <View
                  style={[styles.row, index > 0 ? { marginTop: 8 } : null]}
                  accessibilityRole="text"
                  accessible
                >
                  <Text style={[styles.label, { color: theme.colors.textPrimary }]}>
                    {item.label}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <EmptyState
            title={RECENT_ACTIVITY_UNAVAILABLE.title}
            description={RECENT_ACTIVITY_UNAVAILABLE.description}
          />
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 4 },
  label: { fontSize: 14 },
});
