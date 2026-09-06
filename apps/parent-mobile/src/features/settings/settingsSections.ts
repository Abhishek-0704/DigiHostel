import type { Href } from "expo-router";

/**
 * Settings hierarchy (Prompt 11) — no React/RN import (`Href` is type-only,
 * erased at compile time, same pattern as `dashboardQuickActions.ts`).
 *
 * Every route below is real — either already existing (`/(app)/notifications/settings`,
 * Prompt 8; `/(app)/help`, `/(app)/about`, rewritten in this prompt) or newly
 * built in this prompt (`settings/account`, `settings/security`,
 * `settings/privacy`, `settings/legal`). Notifications intentionally routes
 * to the EXISTING Notification Settings screen rather than a new duplicate
 * — see that screen's own doc comment for what it covers.
 */
export interface SettingsRow {
  id: string;
  title: string;
  description: string;
  route: Href;
  accessibilityHint: string;
}

export interface SettingsSectionConfig {
  id: string;
  title: string;
  rows: SettingsRow[];
}

export const SETTINGS_SECTIONS: SettingsSectionConfig[] = [
  {
    id: "account",
    title: "Account",
    rows: [
      {
        id: "account",
        title: "Account",
        description: "Session information and logout",
        route: "/(app)/settings/account",
        accessibilityHint: "Opens account and session settings",
      },
    ],
  },
  {
    id: "notifications",
    title: "Notifications",
    rows: [
      {
        id: "notifications",
        title: "Notification settings",
        description: "Push permission and category preferences",
        route: "/(app)/notifications/settings",
        accessibilityHint: "Opens notification settings",
      },
    ],
  },
  {
    id: "security",
    title: "Security",
    rows: [
      {
        id: "security",
        title: "Security",
        description: "Biometrics, trusted devices, and session security",
        route: "/(app)/settings/security",
        accessibilityHint: "Opens security settings",
      },
    ],
  },
  {
    id: "privacy",
    title: "Privacy",
    rows: [
      {
        id: "privacy",
        title: "Privacy",
        description: "How your information is used and protected",
        route: "/(app)/settings/privacy",
        accessibilityHint: "Opens privacy information",
      },
    ],
  },
  {
    id: "help",
    title: "Help & Support",
    rows: [
      {
        id: "help",
        title: "Help & Support",
        description: "FAQs, contact information, and feedback",
        route: "/(app)/help",
        accessibilityHint: "Opens help and support",
      },
    ],
  },
  {
    id: "about",
    title: "About",
    rows: [
      {
        id: "about",
        title: "About",
        description: "App version and build information",
        route: "/(app)/about",
        accessibilityHint: "Opens app information",
      },
    ],
  },
  {
    id: "legal",
    title: "Legal",
    rows: [
      {
        id: "legal",
        title: "Legal",
        description: "Terms, policies, and licenses",
        route: "/(app)/settings/legal",
        accessibilityHint: "Opens legal information",
      },
    ],
  },
];

/**
 * Local, in-memory search over the settings hierarchy — prepared for a
 * future settings-search UI (per this prompt's own `<optional_settings_search>`
 * instructions) without adding a search dependency or a visible search
 * input today (7 top-level rows don't need one yet). Matches title or
 * description, case-insensitively.
 */
export function searchSettingsSections(
  sections: SettingsSectionConfig[],
  query: string,
): SettingsRow[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length === 0) return sections.flatMap((section) => section.rows);
  return sections
    .flatMap((section) => section.rows)
    .filter(
      (row) =>
        row.title.toLowerCase().includes(trimmed) ||
        row.description.toLowerCase().includes(trimmed),
    );
}
