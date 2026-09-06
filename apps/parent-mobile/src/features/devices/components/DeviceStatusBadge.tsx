import { Badge, type BadgeTone } from "../../../components/ui/Badge";
import { getDeviceTrustState } from "../deviceStatus";
import type { TrustedDeviceSummary } from "../../../services/devices/devices";

const TONE_FOR_STATE: Record<ReturnType<typeof getDeviceTrustState>, BadgeTone> = {
  active: "success",
  revoked: "error",
};

const LABEL_FOR_STATE: Record<ReturnType<typeof getDeviceTrustState>, string> = {
  active: "Trusted",
  revoked: "Revoked",
};

/** Thin device-domain wrapper around the generic `Badge` — the extension
 * point that primitive's own doc comment anticipates ("intended for the
 * future LeaveRequestCard's status indicator... stays reusable beyond that
 * one feature"). Carries the trust-state -> tone/label mapping so no screen
 * has to repeat it. */
export function DeviceStatusBadge({ device }: { device: TrustedDeviceSummary }) {
  const state = getDeviceTrustState(device);
  return <Badge label={LABEL_FOR_STATE[state]} tone={TONE_FOR_STATE[state]} />;
}
