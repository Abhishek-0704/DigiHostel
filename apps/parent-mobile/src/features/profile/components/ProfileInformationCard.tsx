import { View } from "react-native";
import { useThemeContext } from "../../../contexts/ThemeContext";
import { Card } from "../../../components/ui/Card";
import { Divider } from "../../../components/ui/Divider";
import { DetailRow } from "../../../components/ui/DetailRow";
import { formatLeaveDate } from "../../leave-approval/leaveDateFormatting";
import type { ParentProfilePresentation } from "../types";

export interface ProfileInformationCardProps {
  profile: ParentProfilePresentation;
}

/**
 * Profile Home's information card (Prompt 11). Every row shows either a
 * real value or an explicit "Not available" — never a blank/omitted row,
 * so an unavailable field reads as a known fact, not a rendering gap. Date
 * fields reuse `leave-approval`'s existing `formatLeaveDate()` (a calendar
 * date formatter) rather than duplicating date-formatting logic — both
 * `accountCreatedAt`/`lastLoginAt` come through as full ISO timestamps, but
 * this app has no compelling need to show more than the date here (unlike
 * `notificationFormatting.ts`'s time-of-day-sensitive case).
 */
export function ProfileInformationCard({ profile }: ProfileInformationCardProps) {
  const { theme } = useThemeContext();

  return (
    <View style={{ marginTop: theme.spacing.lg }}>
      <Card>
        <DetailRow label="Registered mobile" value={profile.phoneNumber ?? "Not available"} />
        <Divider />
        <DetailRow label="Registered email" value={profile.email ?? "Not available"} />
        <Divider />
        <DetailRow label="Account created" value={formatLeaveDate(profile.accountCreatedAt)} />
        <Divider />
        <DetailRow label="Last login" value={formatLeaveDate(profile.lastLoginAt)} />
      </Card>
    </View>
  );
}
