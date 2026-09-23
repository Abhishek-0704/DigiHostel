import type { ProfileRepository } from "../repository.js";
import type {
  ProfileView,
  ProfileUpdateInput,
  StaffIdentityView,
  ProfilePreferencesView,
} from "../types.js";

function defaultPreferences(): ProfilePreferencesView {
  return {
    phoneNumber: null,
    officeLocation: null,
    bio: null,
    preferredContactMethod: "email",
    theme: "system",
    density: "comfortable",
    fontScale: "default",
    dateFormat: "DD_MM_YYYY",
    reducedMotion: false,
    highContrast: false,
    defaultLandingPage: "dashboard",
    notificationPreferences: {},
    dashboardPreferences: {},
    shortcuts: [],
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

/** In-memory ProfileRepository double for route-level unit tests — mirrors
 * `FakeConfigurationRepository`'s established shape. Real-Postgres/real-RLS
 * behavior is covered separately by `repository.integration.test.ts` and
 * `supabase/tests/database/29_prompt17_staff_preferences_rls.sql`. */
export class FakeProfileRepository implements ProfileRepository {
  identities = new Map<string, StaffIdentityView>();
  preferences = new Map<string, ProfilePreferencesView>();

  addStaff(identity: StaffIdentityView): this {
    this.identities.set(identity.id, identity);
    return this;
  }

  async getOrCreate(staffId: string): Promise<ProfileView> {
    const identity = this.identities.get(staffId);
    if (!identity) throw new Error(`FakeProfileRepository: unknown staffId ${staffId}`);
    if (!this.preferences.has(staffId)) {
      this.preferences.set(staffId, defaultPreferences());
    }
    return { identity, preferences: this.preferences.get(staffId)! };
  }

  async update(staffId: string, input: ProfileUpdateInput): Promise<ProfileView> {
    const { identity } = await this.getOrCreate(staffId);
    if (input.fullName !== undefined) {
      this.identities.set(staffId, { ...identity, fullName: input.fullName });
    }
    const current = this.preferences.get(staffId)!;
    const next: ProfilePreferencesView = {
      ...current,
      ...(input.phoneNumber !== undefined ? { phoneNumber: input.phoneNumber } : {}),
      ...(input.officeLocation !== undefined ? { officeLocation: input.officeLocation } : {}),
      ...(input.bio !== undefined ? { bio: input.bio } : {}),
      ...(input.preferredContactMethod !== undefined
        ? { preferredContactMethod: input.preferredContactMethod }
        : {}),
      ...(input.theme !== undefined ? { theme: input.theme } : {}),
      ...(input.density !== undefined ? { density: input.density } : {}),
      ...(input.fontScale !== undefined ? { fontScale: input.fontScale } : {}),
      ...(input.dateFormat !== undefined ? { dateFormat: input.dateFormat } : {}),
      ...(input.reducedMotion !== undefined ? { reducedMotion: input.reducedMotion } : {}),
      ...(input.highContrast !== undefined ? { highContrast: input.highContrast } : {}),
      ...(input.defaultLandingPage !== undefined
        ? { defaultLandingPage: input.defaultLandingPage }
        : {}),
      ...(input.notificationPreferences !== undefined
        ? {
            notificationPreferences: {
              ...current.notificationPreferences,
              ...input.notificationPreferences,
            },
          }
        : {}),
      ...(input.dashboardPreferences !== undefined
        ? { dashboardPreferences: input.dashboardPreferences }
        : {}),
      ...(input.shortcuts !== undefined ? { shortcuts: input.shortcuts } : {}),
      updatedAt: new Date().toISOString(),
    };
    this.preferences.set(staffId, next);
    return { identity: this.identities.get(staffId)!, preferences: next };
  }
}
