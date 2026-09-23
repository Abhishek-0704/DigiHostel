/**
 * Administrative Profile & Personal Preferences Center (Phase 7, Prompt 17)
 * domain types. Owns ONLY the currently-authenticated staff member's own
 * personal profile/preference fields — never role, permission, hostel
 * assignment, account status, or any other identity/authorization
 * attribute (those remain Identity & Access Administration's, Prompt 13,
 * untouched by this domain).
 */

export const PREFERRED_CONTACT_METHODS = ["email", "phone", "in_app"] as const;
export type PreferredContactMethod = (typeof PREFERRED_CONTACT_METHODS)[number];

export const THEME_PREFERENCES = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const DENSITY_PREFERENCES = ["comfortable", "compact"] as const;
export type DensityPreference = (typeof DENSITY_PREFERENCES)[number];

export const FONT_SCALE_PREFERENCES = ["default", "large", "larger"] as const;
export type FontScalePreference = (typeof FONT_SCALE_PREFERENCES)[number];

export const DATE_FORMAT_PREFERENCES = ["DD_MM_YYYY", "MM_DD_YYYY", "YYYY_MM_DD"] as const;
export type DateFormatPreference = (typeof DATE_FORMAT_PREFERENCES)[number];

/** A deliberately small, curated set of real top-level dashboard
 * destinations — not an exhaustive mirror of every nav id in
 * `lib/navigation/navigationConfig.ts` (a stale/invalid stored value is
 * harmless: the frontend falls back to "dashboard" rather than trusting
 * this list to be exhaustive; this is a personalization preference, not a
 * navigation authority — RequireRole/RequirePermission still gate the
 * actual destination regardless of what a caller stores here). */
export const DEFAULT_LANDING_PAGE_OPTIONS = [
  "dashboard",
  "leave",
  "students",
  "notifications",
  "emergency",
  "health",
  "audit",
] as const;
export type DefaultLandingPage = (typeof DEFAULT_LANDING_PAGE_OPTIONS)[number];

/** Every category this task's own "Notification Preferences" section names,
 * kept as this domain's own explicit allow-list (mirrors
 * `CONFIGURATION_DOMAINS`'s established "small, curated, app-owned list"
 * precedent) — advisory only. No staff-facing notification delivery
 * mechanism exists anywhere in this repository today
 * (docs/current-state.md's long-standing, unchanged finding, re-confirmed
 * during this task's own reconnaissance), so this preference is genuinely
 * STORED, RUNTIME CONSUMPTION DEFERRED — never claimed as live-consumed. */
export const NOTIFICATION_CATEGORIES = [
  "emergency_alert",
  "health_alert",
  "parent_approval",
  "leave_authorization",
  "student_movement",
  "administrative",
  "audit",
  "system_maintenance",
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** `emergency_alert`/`health_alert` are safety-critical categories this
 * platform's own operational discipline (Emergency/Health Operations
 * Centers) treats as mandatory — a personal preference must never be able
 * to disable them, matching this task's own explicit "a user preference
 * MUST NOT disable mandatory safety/security notifications" requirement.
 * Enforced in service.ts on every write, never merely in the UI. */
export const MANDATORY_NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
  "emergency_alert",
  "health_alert",
];

export type NotificationPreferenceMap = Partial<Record<NotificationCategory, boolean>>;

export interface DashboardPreferences {
  compactMode?: boolean;
  widgetVisibility?: Record<string, boolean>;
  savedFilters?: Record<string, unknown>;
}

export interface PersonalShortcut {
  id: string;
  label: string;
  /** Must be an in-app relative path — a shortcut is a personalization
   * convenience, never an authorization mechanism: it navigates to an
   * existing route, which RequireRole/RequirePermission still gate exactly
   * as if the user had used the sidebar (service.ts's own validation
   * rejects any non-relative value, closing the one way this field could
   * otherwise be misused as an open-redirect-shaped string). */
  path: string;
}

export const MAX_SHORTCUTS = 20;

export interface StaffIdentityView {
  id: string;
  fullName: string;
  role: "reception_warden" | "hostel_admin" | "library_incharge" | "super_admin";
  hostelId: string | null;
  status: "active" | "suspended";
  createdAt: string;
}

export interface ProfilePreferencesView {
  phoneNumber: string | null;
  officeLocation: string | null;
  bio: string | null;
  preferredContactMethod: PreferredContactMethod;
  theme: ThemePreference;
  density: DensityPreference;
  fontScale: FontScalePreference;
  dateFormat: DateFormatPreference;
  reducedMotion: boolean;
  highContrast: boolean;
  defaultLandingPage: DefaultLandingPage;
  notificationPreferences: NotificationPreferenceMap;
  dashboardPreferences: DashboardPreferences;
  shortcuts: PersonalShortcut[];
  updatedAt: string;
}

export interface ProfileView {
  identity: StaffIdentityView;
  preferences: ProfilePreferencesView;
}

/** Every field a PATCH may touch — all optional (partial update); `fullName`
 * writes to `staff.full_name` (the existing `staff_update_own_limited`
 * self-update authority, Prompt QG-01), everything else to
 * `staff_preferences`. Role/hostelId/status/id/authUserId are deliberately
 * NOT declared here at all — a `.strict()` Zod schema built from this shape
 * therefore rejects them outright as unrecognized fields, the same
 * discipline `configuration.ts`'s `updateBodySchema` already established. */
export interface ProfileUpdateInput {
  fullName?: string;
  phoneNumber?: string | null;
  officeLocation?: string | null;
  bio?: string | null;
  preferredContactMethod?: PreferredContactMethod;
  theme?: ThemePreference;
  density?: DensityPreference;
  fontScale?: FontScalePreference;
  dateFormat?: DateFormatPreference;
  reducedMotion?: boolean;
  highContrast?: boolean;
  defaultLandingPage?: DefaultLandingPage;
  notificationPreferences?: NotificationPreferenceMap;
  dashboardPreferences?: DashboardPreferences;
  shortcuts?: PersonalShortcut[];
}
