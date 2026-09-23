import type { ProfileRepository } from "./repository.js";
import type { ProfileView, ProfileUpdateInput } from "./types.js";
import { MANDATORY_NOTIFICATION_CATEGORIES } from "./types.js";
import { ProfileMandatoryNotificationError } from "./errors.js";

/**
 * Service boundary for the Administrative Profile & Personal Preferences
 * Center (Phase 7, Prompt 17). Thin, matching `ConfigurationService`'s
 * established shape — the one piece of real business logic it owns is the
 * mandatory-notification-category guard (§10: "a user preference MUST NOT
 * disable mandatory safety/security notifications"), enforced here so it
 * cannot be bypassed by any future second caller of the repository.
 */
export class ProfileService {
  constructor(private readonly repository: ProfileRepository) {}

  async getOrCreate(staffId: string): Promise<ProfileView> {
    return this.repository.getOrCreate(staffId);
  }

  async update(staffId: string, input: ProfileUpdateInput): Promise<ProfileView> {
    if (input.notificationPreferences) {
      for (const category of MANDATORY_NOTIFICATION_CATEGORIES) {
        if (input.notificationPreferences[category] === false) {
          throw new ProfileMandatoryNotificationError(category);
        }
      }
    }
    return this.repository.update(staffId, input);
  }
}
