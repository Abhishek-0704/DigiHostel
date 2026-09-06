import { StyleSheet, Text, View } from "react-native";
import { useThemeContext } from "../../../contexts/ThemeContext";
import { EmptyState } from "../../../components/feedback/EmptyState";
import { formatLeaveDate } from "../leaveDateFormatting";
import type { LeaveTimelineEvent, LeaveTimelineEventStatus } from "../types";

export interface LeaveTimelineProps {
  /** `null` renders the "unavailable" state — see `buildMinimalTimelineFromStatus`'s
   * doc comment for why this app never fabricates timeline events. */
  events: LeaveTimelineEvent[] | null;
}

const STATUS_LABEL: Record<LeaveTimelineEventStatus, string> = {
  completed: "Completed",
  current: "In progress",
  upcoming: "Upcoming",
};

/**
 * Leave Request Timeline (Prompt 9A). Distinguishes completed/current/
 * upcoming without relying on color alone — each row's status is spelled
 * out in text (`STATUS_LABEL`) alongside the dot's color, and the dot
 * itself uses a different fill (solid vs. hollow) as a second, non-color
 * signal for current vs. upcoming. Never renders a fabricated timestamp —
 * an event with `timestamp: null` shows no date, not an invented one.
 */
export function LeaveTimeline({ events }: LeaveTimelineProps) {
  const { theme } = useThemeContext();

  if (!events || events.length === 0) {
    return (
      <EmptyState
        title="Timeline isn't available"
        description="A detailed timeline for this request isn't available yet."
      />
    );
  }

  return (
    <View accessibilityRole="list">
      {events.map((event, index) => {
        const dotColor =
          event.status === "completed"
            ? theme.colors.success
            : event.status === "current"
              ? theme.colors.primary
              : theme.colors.border;
        return (
          <View key={event.id} style={styles.row} accessibilityRole="text" accessible>
            <View style={styles.dotColumn}>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: event.status === "upcoming" ? theme.colors.surface : dotColor,
                    borderColor: dotColor,
                  },
                ]}
              />
              {index < events.length - 1 ? (
                <View style={[styles.connector, { backgroundColor: theme.colors.border }]} />
              ) : null}
            </View>
            <View style={styles.textColumn}>
              <Text style={[styles.eventLabel, { color: theme.colors.textPrimary }]}>
                {event.label}
              </Text>
              <Text style={[styles.statusLabel, { color: theme.colors.textSecondary }]}>
                {STATUS_LABEL[event.status]}
                {event.timestamp ? ` · ${formatLeaveDate(event.timestamp)}` : ""}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  dotColumn: { width: 20, alignItems: "center" },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, marginTop: 4 },
  connector: { width: 2, flex: 1, minHeight: 24, marginTop: 2 },
  textColumn: { flex: 1, paddingBottom: 16, paddingLeft: 8 },
  eventLabel: { fontSize: 14, fontWeight: "600" },
  statusLabel: { fontSize: 12, marginTop: 2 },
});
