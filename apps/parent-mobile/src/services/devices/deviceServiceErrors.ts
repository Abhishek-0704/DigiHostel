/**
 * `DeviceServiceNotImplementedError` lives in its own file, separate from
 * `devices.ts`, deliberately: `devices.ts` imports `deviceIdentityService`,
 * which imports `expo-crypto`/`react-native`/`expo-constants` — none of
 * which are parseable under a plain Vitest/Node run outside a real React
 * Native transform. Any pure-logic module that only needs to reference this
 * error class (e.g. `features/devices/deviceErrors.ts`) should import it
 * from here, not from `./devices`, so it stays testable without needing to
 * mock the whole service module's dependency chain.
 */
export class DeviceServiceNotImplementedError extends Error {
  constructor(operation: string) {
    super(
      `Trusted-device ${operation} is not implemented yet in the Parent app. ` +
        "See docs/current-state.md's G-04 status and apps/parent-mobile/docs/authentication.md.",
    );
    this.name = "DeviceServiceNotImplementedError";
  }
}
