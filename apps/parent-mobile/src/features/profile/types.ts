/**
 * Profile presentation types (Prompt 11) — no React/RN import. Distinct
 * from `services/profile/profile.ts`'s raw record shapes for the same
 * reason `leave-approval`/`notifications` keep their own presentation
 * layers separate from the backend/DB shape they're built from.
 */

export interface ParentProfilePresentation {
  /** From `parents.full_name` (real, RLS-scoped) — `null` only if the
   * profile row itself could not be loaded. */
  name: string | null;
  /** From `parents.phone_number` (real) — read-only in this app (see
   * `services/profile/profile.ts`'s doc comment on why). */
  phoneNumber: string | null;
  /** From the Supabase Auth session's own `user.email` — real when
   * present, but expected to be `null` for every account today: this app's
   * only sign-in method is phone OTP (ADR-020), so no email is ever
   * collected. Shown as "Not available," not omitted, so the field's
   * absence reads as a fact, not an oversight. */
  email: string | null;
  /** From `session.user.created_at` — real, already available via the
   * existing `useSession()` (no new fetch). */
  accountCreatedAt: string | null;
  /** From `session.user.last_sign_in_at` — real; Supabase updates this on
   * each successful sign-in (a rotated OTP re-verification counts). */
  lastLoginAt: string | null;
}

export type ParentRelationshipType = "father" | "mother" | "guardian";

export interface LinkedStudentPresentation {
  /** Opaque key/nav-param only — never rendered as visible text. */
  id: string;
  name: string;
  rollNumber: string;
  hostel: string | null;
  room: string | null;
  relationship: ParentRelationshipType;
}

/**
 * A linked student paired with a leave-activity summary derived from the
 * SAME leave data source `usePendingApprovals()` already fetches
 * (`leave-approval/hooks/usePendingApprovals.ts`) — never a second leave
 * query. `pendingCount` counts requests currently awaiting a parent
 * response; `recentActivityCount` counts every request (any status) for
 * this student the app has currently fetched.
 */
export interface LinkedStudentSummary {
  student: LinkedStudentPresentation;
  pendingCount: number;
  recentActivityCount: number;
}
