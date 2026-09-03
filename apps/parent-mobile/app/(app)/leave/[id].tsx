import { useLocalSearchParams } from "expo-router";
import { PlaceholderScreen } from "@/src/components/layout/PlaceholderScreen";

/** Approval Details (Prompt 1's Navigation Flow). Reads the `id` route
 * param already, since Expo Router's typed routes generate this for free —
 * nothing is fetched with it yet (leave-approval feature work, out of this
 * prompt's scope). */
export default function LeaveRequestDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <PlaceholderScreen
      title="Approval Details"
      description={`Leave request detail + biometric-gated approve/reject for id "${id}" — not implemented in this foundation pass.`}
    />
  );
}
