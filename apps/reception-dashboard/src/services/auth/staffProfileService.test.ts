import { describe, it, expect, vi, beforeEach } from "vitest";
import { staffProfileService } from "./staffProfileService";
import { getSupabaseClient } from "../../lib/supabase/client";

vi.mock("../../lib/supabase/client", () => ({
  getSupabaseClient: vi.fn(),
}));

function mockClient(options: { sessionUserId: string | null; select: ReturnType<typeof vi.fn> }) {
  const eq = vi.fn().mockReturnValue({ maybeSingle: options.select });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  const getSession = vi.fn().mockResolvedValue({
    data: { session: options.sessionUserId ? { user: { id: options.sessionUserId } } : null },
  });
  vi.mocked(getSupabaseClient).mockReturnValue({
    from,
    auth: { getSession },
  } as never);
  return { from, select, eq };
}

describe("staffProfileService.getMyStaffProfile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("explicitly filters by the caller's own auth_user_id, not just RLS", async () => {
    const { eq } = mockClient({
      sessionUserId: "auth-user-1",
      select: vi.fn().mockResolvedValue({
        data: {
          id: "staff-1",
          full_name: "Test Super Admin",
          role: "super_admin",
          hostel_id: null,
        },
        error: null,
      }),
    });

    const result = await staffProfileService.getMyStaffProfile();

    expect(eq).toHaveBeenCalledWith("auth_user_id", "auth-user-1");
    expect(result).toEqual({
      id: "staff-1",
      fullName: "Test Super Admin",
      role: "super_admin",
      hostelId: null,
    });
  });

  it("returns null with no query at all when there is no session yet", async () => {
    const { from } = mockClient({ sessionUserId: null, select: vi.fn() });

    const result = await staffProfileService.getMyStaffProfile();

    expect(result).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("returns null for a signed-in user with no staff row (e.g. a parent/student account)", async () => {
    mockClient({
      sessionUserId: "auth-user-2",
      select: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    const result = await staffProfileService.getMyStaffProfile();

    expect(result).toBeNull();
  });

  it("throws when the query itself errors", async () => {
    mockClient({
      sessionUserId: "auth-user-1",
      select: vi.fn().mockResolvedValue({ data: null, error: new Error("db unreachable") }),
    });

    await expect(staffProfileService.getMyStaffProfile()).rejects.toThrow("db unreachable");
  });
});
