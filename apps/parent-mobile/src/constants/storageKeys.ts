/**
 * Central registry of secure-storage keys (Prompt 2 foundation). Prevents
 * key-name collisions/typos across features — every feature that needs
 * secure storage adds its key here rather than inlining a string literal
 * at the call site.
 */
export const STORAGE_KEYS = {
  /** Reserved for the Supabase session persistence adapter (auth
   * implementation is out of this prompt's scope — see
   * src/services/supabase/client.ts's doc comment). */
  supabaseSession: "digihostel.parent.supabase-session",
  themePreference: "digihostel.parent.theme-preference",
} as const;
