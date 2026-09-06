import { Badge } from "../../../components/ui/Badge";
import { describeMethod } from "../biometricCapability";
import type { BiometricAuthenticationMethod } from "../../../services/biometric/biometric";

/** One small badge per supported authentication method (e.g. "Fingerprint",
 * "Face recognition") — mirrors `DeviceStatusBadge`'s thin-wrapper pattern
 * around the generic `Badge`. */
export function BiometricMethodBadge({ method }: { method: BiometricAuthenticationMethod }) {
  return <Badge label={describeMethod(method)} tone="neutral" />;
}
