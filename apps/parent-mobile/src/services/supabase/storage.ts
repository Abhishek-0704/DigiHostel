import { getSupabaseClient } from "./client";

/**
 * Supabase Storage abstraction (Prompt 2 foundation). No bucket is
 * configured anywhere in this repository yet, and no current SDD
 * requirement for the Parent app MVP needs one (Prompt 1's analysis: no
 * profile-photo/attachment requirement exists in the MVP functional
 * requirements). This exists only so a future feature that DOES need
 * Storage has one place to get a scoped client from, rather than reaching
 * into the raw Supabase client directly.
 */
export function getStorageBucket(bucketName: string) {
  return getSupabaseClient().storage.from(bucketName);
}
