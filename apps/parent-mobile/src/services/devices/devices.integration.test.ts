import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * Real-Supabase integration test (Prompt 3) — verifies the actual RLS
 * behavior `deviceService.hasActiveTrustedDevice()`/`listTrustedDevices()`
 * depend on, against the local Supabase instance's real Postgrest API and
 * real seed data (supabase/seed.sql), not a mock.
 *
 * Deliberately does NOT go through `deviceService`/`getSupabaseClient()`
 * directly: those depend on `expo-secure-store` (a native module with no
 * implementation under plain Node/Vitest) via src/services/storage. This
 * file constructs its own minimal, memory-session Supabase client instead —
 * the RLS policy behavior being verified is identical either way, since
 * `trusted_devices_select_own` scopes by the JWT's `auth.uid()`, not by
 * which storage adapter the client happens to use.
 *
 * Skipped automatically unless SUPABASE_URL/SUPABASE_ANON_KEY are set (same
 * gating convention as apps/api's own DATABASE_URL-gated integration
 * suite) — run explicitly with the local Supabase stack up:
 *   SUPABASE_URL=http://127.0.0.1:55321 SUPABASE_ANON_KEY=<local anon key> pnpm run test
 *
 * Credentials used below are supabase/seed.sql's own fixtures — synthetic
 * test accounts on the example.test domain, not real user data (see that
 * file's own header comment).
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const RUN = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

async function signInAndCountActiveTrustedDevices(email: string): Promise<number> {
  // Fresh client per sign-in — avoids one test's session leaking into
  // another's via a shared in-memory store.
  const client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: "test-password",
  });
  if (signInError) throw signInError;

  // The exact query devices.ts's hasActiveTrustedDevice() performs.
  const { data, error } = await client.from("trusted_devices").select("id").is("revoked_at", null);
  if (error) throw error;
  return data?.length ?? 0;
}

interface AllDevicesRow {
  id: string;
  revoked_at: string | null;
  revoked_reason: string | null;
}

async function signInAndListAllTrustedDevices(email: string): Promise<AllDevicesRow[]> {
  const client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: "test-password",
  });
  if (signInError) throw signInError;

  // The exact query devices.ts's listTrustedDevices() performs (Prompt 4B —
  // no revoked_at filter, unlike hasActiveTrustedDevice above).
  const { data, error } = await client
    .from("trusted_devices")
    .select("id, revoked_at, revoked_reason")
    .order("registered_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AllDevicesRow[];
}

describe.skipIf(!RUN)("trusted_devices RLS (real Supabase integration)", () => {
  beforeAll(() => {
    if (!RUN) return;
    // Sanity: fail loudly if pointed at something that isn't local dev.
    expect(SUPABASE_URL).toMatch(/127\.0\.0\.1|localhost/);
  });

  it("a parent with one active trusted device (parent1-father) sees exactly 1 active row", async () => {
    const count = await signInAndCountActiveTrustedDevices("parent1-father@example.test");
    expect(count).toBe(1);
  });

  it("a parent whose only device is revoked (parent1-mother) sees 0 active rows — the revoked device is correctly excluded, not just hidden by the app", async () => {
    const count = await signInAndCountActiveTrustedDevices("parent1-mother@example.test");
    expect(count).toBe(0);
  });

  it("an unrelated parent with no devices at all sees 0 active rows, not an error", async () => {
    const count = await signInAndCountActiveTrustedDevices("parent-unrelated@example.test");
    expect(count).toBe(0);
  });

  it("a student identity (no parents row) sees 0 rows via this query — current_parent_id() resolves to null, not an error, matching the app's honest 'no parent profile' limitation documented in docs/authentication.md", async () => {
    const count = await signInAndCountActiveTrustedDevices("student1@example.test");
    expect(count).toBe(0);
  });
});

describe.skipIf(!RUN)(
  "trusted_devices — full list including revoked (Prompt 4B, real Supabase)",
  () => {
    it("a parent whose only device is revoked (parent1-mother) DOES see it via the unfiltered list query — RLS permits reading the caller's own revoked rows, only the app's own hasActiveTrustedDevice query chose to filter them out", async () => {
      const rows = await signInAndListAllTrustedDevices("parent1-mother@example.test");
      expect(rows).toHaveLength(1);
      expect(rows[0].revoked_at).not.toBeNull();
      expect(rows[0].revoked_reason).toBe("test: device removed by user");
    });

    it("a parent with one active trusted device (parent1-father) sees it with revoked_at null via the same unfiltered query", async () => {
      const rows = await signInAndListAllTrustedDevices("parent1-father@example.test");
      expect(rows).toHaveLength(1);
      expect(rows[0].revoked_at).toBeNull();
    });
  },
);
