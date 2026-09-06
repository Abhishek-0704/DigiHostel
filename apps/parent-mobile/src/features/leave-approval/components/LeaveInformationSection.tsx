import { View } from "react-native";
import { useThemeContext } from "../../../contexts/ThemeContext";
import { Card } from "../../../components/ui/Card";
import { Divider } from "../../../components/ui/Divider";
import { SectionHeader } from "../../../components/ui/SectionHeader";
import { Badge } from "../../../components/ui/Badge";
import { DetailRow } from "../../../components/ui/DetailRow";
import { leaveStatusLabel, leaveStatusTone } from "../leaveStatusFormatter";
import { formatLeaveDate, formatLeaveDuration } from "../leaveDateFormatting";
import type { LeaveRequestPresentation } from "../types";

export interface LeaveInformationSectionProps {
  leaveRequest: LeaveRequestPresentation;
}

/**
 * Leave Information section (Prompt 9A). `leaveType`/`destination` are
 * always `null` today (no backend column, no SDD text —
 * `types.ts`'s doc comment) and render as "Not available" rather than being
 * omitted entirely — this app names every field this prompt asks for and is
 * explicit about which ones it cannot yet populate, rather than silently
 * hiding them (a hidden field could look like an oversight; a labeled
 * "Not available" is an honest, deliberate statement).
 */
export function LeaveInformationSection({ leaveRequest }: LeaveInformationSectionProps) {
  const { theme } = useThemeContext();
  const duration = formatLeaveDuration(leaveRequest.departureDate, leaveRequest.expectedReturnDate);

  return (
    <View style={{ marginTop: theme.spacing.lg }}>
      <SectionHeader title="Leave information" />
      <Card>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingVertical: 8,
          }}
        >
          <Badge
            label={leaveStatusLabel(leaveRequest.status)}
            tone={leaveStatusTone(leaveRequest.status)}
          />
        </View>
        <Divider />
        <DetailRow label="Leave type" value={leaveRequest.leaveType ?? "Not available"} />
        <Divider />
        <DetailRow label="Destination" value={leaveRequest.destination ?? "Not available"} />
        <Divider />
        <DetailRow label="Reason" value={leaveRequest.reason ?? "Not available"} />
        <Divider />
        <DetailRow label="Departure" value={formatLeaveDate(leaveRequest.departureDate)} />
        <Divider />
        <DetailRow
          label="Expected return"
          value={formatLeaveDate(leaveRequest.expectedReturnDate)}
        />
        <Divider />
        <DetailRow label="Duration" value={duration ?? "Not available"} />
        <Divider />
        <DetailRow label="Requested" value={formatLeaveDate(leaveRequest.createdAt)} />
      </Card>
    </View>
  );
}
