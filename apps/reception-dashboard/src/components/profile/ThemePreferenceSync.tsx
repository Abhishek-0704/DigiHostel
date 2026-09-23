import { useEffect, useRef } from "react";
import { useProfile } from "../../features/profile/useProfile";
import { useTheme } from "../../contexts/ThemeContext";

/**
 * Applies the caller's saved theme/accessibility preferences to the live
 * `ThemeContext` (Phase 7, Prompt 17). Mounted once in `DashboardLayout`,
 * mirroring `SessionTimeoutWarning`'s exact "mounted once, reads
 * already-existing state, renders nothing" pattern — never fetches profile
 * data of its own accord outside the authenticated shell (this component
 * only exists inside `DashboardLayout`, which itself only renders once
 * `RequireAuth` has already confirmed an authenticated, authorized
 * session).
 *
 * Syncs ONE-SHOT on the first successful load, not on every subsequent
 * profile refetch — otherwise a change the user is actively previewing in
 * the Settings page (before clicking Save) could be clobbered by a
 * background refetch of the last-SAVED value mid-edit. The Settings page
 * itself calls `useTheme()`'s setters directly for live preview and after
 * a successful save, so this component's job is only "apply server truth
 * once, at the start of the session."
 */
export function ThemePreferenceSync() {
  const { profile } = useProfile();
  const { setThemePreference, setReducedMotion, setHighContrast, setFontScale } = useTheme();
  const appliedRef = useRef(false);

  useEffect(() => {
    if (appliedRef.current || !profile) return;
    setThemePreference(profile.preferences.theme);
    setReducedMotion(profile.preferences.reducedMotion);
    setHighContrast(profile.preferences.highContrast);
    setFontScale(profile.preferences.fontScale);
    appliedRef.current = true;
  }, [profile, setThemePreference, setReducedMotion, setHighContrast, setFontScale]);

  return null;
}
