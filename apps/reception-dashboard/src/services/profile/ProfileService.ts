import { getMyProfile, updateMyProfile } from "@digihostel/api-client-react";
import type { Profile, ProfileUpdateBody } from "@digihostel/api-client-react";

/**
 * Administrative Profile & Personal Preferences Center (Phase 7, Prompt
 * 17) — thin transport wrapper, matching `AuditService`'s/
 * `ConfigurationService`'s established shape. Performs no authorization or
 * ownership logic of its own: the backend always resolves the caller's own
 * staff id from the authenticated session, never from anything this
 * service sends. `PATCH` is a partial update — only the fields present in
 * `body` are sent (`undefined` fields are omitted by the generated client,
 * matching every other PATCH call in this app).
 */
export interface ProfileService {
  getMyProfile(): Promise<Profile>;
  updateMyProfile(body: ProfileUpdateBody): Promise<Profile>;
}

export const profileService: ProfileService = {
  async getMyProfile() {
    return getMyProfile();
  },
  async updateMyProfile(body) {
    return updateMyProfile(body);
  },
};

export type { Profile, ProfileUpdateBody } from "@digihostel/api-client-react";
