import { AccessibilityInfo, StyleSheet, Text, View } from "react-native";
import { useEffect } from "react";
import { useThemeContext } from "../../contexts/ThemeContext";
import { Card } from "./Card";
import { Button } from "./Button";

export interface ConfirmationPanelProps {
  title: string;
  /** Each bullet is one plain-language consequence of the action — the
   * confirmation must "clearly identify: action, consequences, cancel
   * option, current request" without relying on styling alone, so every
   * bullet is real sentence text, not an icon. */
  bullets: string[];
  confirmLabel: string;
  cancelLabel?: string;
  tone: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
  disabled?: boolean;
}

/**
 * Generic confirmation experience (Prompt 9A) — reused for both Approve and
 * Reject (parameterized by `tone`/labels/bullets) rather than two
 * near-duplicate components, per this app's "avoid unnecessary abstraction"
 * convention. Presentation only: `onConfirm` is supplied by the caller —
 * this component never calls an API or changes any state itself.
 *
 * Relocated here from `features/leave-approval/components/` in Prompt 11
 * once a second feature (Settings' Logout confirmation) needed the
 * identical renderer — same rationale/precedent as `SecurityInformationCard`
 * (Prompt 5) and `SecurityBanner` (Prompt 9A)'s own relocations.
 */
export function ConfirmationPanel({
  title,
  bullets,
  confirmLabel,
  cancelLabel = "Cancel",
  tone,
  onConfirm,
  onCancel,
  disabled = false,
}: ConfirmationPanelProps) {
  const { theme } = useThemeContext();

  // `accessibilityRole="alert"` on a plain View is not reliably announced
  // by VoiceOver/TalkBack the way it would be on the web — this gates a
  // security-sensitive action (approve/reject a leave request, sign out),
  // so a screen-reader user must be told it appeared, not left to discover
  // it by swiping past. Announced once per mount only (deliberately empty
  // deps) — a later re-render with a changed `confirmLabel` (e.g. "Log out"
  // -> "Logging out…") must not re-trigger this announcement.
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`${title} ${bullets.join(". ")}`);
  }, []);

  return (
    <Card accessibilityRole="alert" accessible>
      <Text style={[styles.title, { color: theme.colors.textPrimary }]}>{title}</Text>
      <View style={{ marginTop: theme.spacing.sm, gap: 6 }}>
        {bullets.map((bullet, index) => (
          <Text key={index} style={[styles.bullet, { color: theme.colors.textSecondary }]}>
            {"• "}
            {bullet}
          </Text>
        ))}
      </View>
      <View style={[styles.actionRow, { marginTop: theme.spacing.lg }]}>
        <View style={styles.actionFlex}>
          <Button
            label={cancelLabel}
            variant="secondary"
            fullWidth
            onPress={onCancel}
            disabled={disabled}
          />
        </View>
        <View style={styles.actionFlex}>
          <Button
            label={confirmLabel}
            variant={tone === "danger" ? "danger" : "primary"}
            fullWidth
            onPress={onConfirm}
            disabled={disabled}
          />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 17, fontWeight: "700" },
  bullet: { fontSize: 14, lineHeight: 20 },
  actionRow: { flexDirection: "row", gap: 12 },
  actionFlex: { flex: 1 },
});
