import { eq, db, staff, staffPreferences, auditLogs } from "@digihostel/db";
import type {
  ProfileView,
  ProfilePreferencesView,
  StaffIdentityView,
  ProfileUpdateInput,
  NotificationPreferenceMap,
  DashboardPreferences,
  PersonalShortcut,
} from "./types.js";

interface StaffRow {
  id: string;
  fullName: string;
  role: StaffIdentityView["role"];
  hostelId: string | null;
  status: StaffIdentityView["status"];
  createdAt: Date;
}

interface PreferencesRow {
  phoneNumber: string | null;
  officeLocation: string | null;
  bio: string | null;
  preferredContactMethod: string;
  theme: string;
  density: string;
  fontScale: string;
  dateFormat: string;
  reducedMotion: boolean;
  highContrast: boolean;
  defaultLandingPage: string;
  notificationPreferences: unknown;
  dashboardPreferences: unknown;
  shortcuts: unknown;
  updatedAt: Date;
}

function toIdentityView(row: StaffRow): StaffIdentityView {
  return {
    id: row.id,
    fullName: row.fullName,
    role: row.role,
    hostelId: row.hostelId,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

function toPreferencesView(row: PreferencesRow): ProfilePreferencesView {
  return {
    phoneNumber: row.phoneNumber,
    officeLocation: row.officeLocation,
    bio: row.bio,
    preferredContactMethod:
      row.preferredContactMethod as ProfilePreferencesView["preferredContactMethod"],
    theme: row.theme as ProfilePreferencesView["theme"],
    density: row.density as ProfilePreferencesView["density"],
    fontScale: row.fontScale as ProfilePreferencesView["fontScale"],
    dateFormat: row.dateFormat as ProfilePreferencesView["dateFormat"],
    reducedMotion: row.reducedMotion,
    highContrast: row.highContrast,
    defaultLandingPage: row.defaultLandingPage as ProfilePreferencesView["defaultLandingPage"],
    notificationPreferences: (row.notificationPreferences as NotificationPreferenceMap) ?? {},
    dashboardPreferences: (row.dashboardPreferences as DashboardPreferences) ?? {},
    shortcuts: (row.shortcuts as PersonalShortcut[]) ?? [],
    updatedAt: row.updatedAt.toISOString(),
  };
}

const DEFAULT_PREFERENCES_ROW: Omit<PreferencesRow, "updatedAt"> = {
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
};

export interface ProfileRepository {
  /** Reads the caller's own identity + preferences, transparently creating
   * a default preferences row on first access (§37 — "a missing preference
   * record must not cause the application to fail"). Never reads or
   * creates a row for any staff id other than `staffId`. */
  getOrCreate(staffId: string): Promise<ProfileView>;
  /** Applies a partial update, in one transaction, writing exactly one
   * `audit_logs` row describing what changed. `staffId` is always the
   * caller's own server-resolved id — this method has no parameter through
   * which a different staff member's row could ever be targeted. */
  update(staffId: string, input: ProfileUpdateInput): Promise<ProfileView>;
}

export class DrizzleProfileRepository implements ProfileRepository {
  async getOrCreate(staffId: string): Promise<ProfileView> {
    const [staffRow] = await db
      .select({
        id: staff.id,
        fullName: staff.fullName,
        role: staff.role,
        hostelId: staff.hostelId,
        status: staff.status,
        createdAt: staff.createdAt,
      })
      .from(staff)
      .where(eq(staff.id, staffId))
      .limit(1);
    if (!staffRow) {
      throw new Error(`getOrCreate called with an unresolvable staffId: ${staffId}`);
    }

    const [existing] = await db
      .select()
      .from(staffPreferences)
      .where(eq(staffPreferences.staffId, staffId))
      .limit(1);

    if (existing) {
      return { identity: toIdentityView(staffRow), preferences: toPreferencesView(existing) };
    }

    const [created] = await db
      .insert(staffPreferences)
      .values({ staffId, ...DEFAULT_PREFERENCES_ROW })
      // A concurrent first-access race (two requests both find no row and
      // both attempt to create one) is resolved by the table's own unique
      // constraint — `onConflictDoNothing` lets the loser simply re-read
      // rather than erroring, since both callers agree on defaults anyway.
      .onConflictDoNothing({ target: staffPreferences.staffId })
      .returning();

    const row =
      created ??
      (
        await db
          .select()
          .from(staffPreferences)
          .where(eq(staffPreferences.staffId, staffId))
          .limit(1)
      )[0]!;

    return { identity: toIdentityView(staffRow), preferences: toPreferencesView(row) };
  }

  async update(staffId: string, input: ProfileUpdateInput): Promise<ProfileView> {
    return db.transaction(async (tx) => {
      const before = await this.getOrCreate(staffId);

      const staffUpdates: Partial<{ fullName: string; updatedAt: Date }> = {};
      if (input.fullName !== undefined) {
        staffUpdates.fullName = input.fullName;
        staffUpdates.updatedAt = new Date();
      }
      if (Object.keys(staffUpdates).length > 0) {
        await tx.update(staff).set(staffUpdates).where(eq(staff.id, staffId));
      }

      const prefUpdates: Record<string, unknown> = { updatedAt: new Date() };
      const changedKeys: string[] = [];
      for (const [key, column] of [
        ["phoneNumber", "phoneNumber"],
        ["officeLocation", "officeLocation"],
        ["bio", "bio"],
        ["preferredContactMethod", "preferredContactMethod"],
        ["theme", "theme"],
        ["density", "density"],
        ["fontScale", "fontScale"],
        ["dateFormat", "dateFormat"],
        ["reducedMotion", "reducedMotion"],
        ["highContrast", "highContrast"],
        ["defaultLandingPage", "defaultLandingPage"],
        ["notificationPreferences", "notificationPreferences"],
        ["dashboardPreferences", "dashboardPreferences"],
        ["shortcuts", "shortcuts"],
      ] as const) {
        const value = (input as Record<string, unknown>)[key];
        if (value !== undefined) {
          prefUpdates[column] = value;
          changedKeys.push(key);
        }
      }
      if (changedKeys.length > 0) {
        await tx
          .update(staffPreferences)
          .set(prefUpdates)
          .where(eq(staffPreferences.staffId, staffId));
      }

      if (input.fullName !== undefined || changedKeys.length > 0) {
        await tx.insert(auditLogs).values({
          actorType: "staff",
          actorId: staffId,
          action: "profile.updated",
          entityType: "staff",
          entityId: staffId,
          metadata: {
            changedFields: [...(input.fullName !== undefined ? ["fullName"] : []), ...changedKeys],
            before: {
              fullName: before.identity.fullName,
              ...before.preferences,
            },
          },
        });
      }

      const [staffRow] = await tx
        .select({
          id: staff.id,
          fullName: staff.fullName,
          role: staff.role,
          hostelId: staff.hostelId,
          status: staff.status,
          createdAt: staff.createdAt,
        })
        .from(staff)
        .where(eq(staff.id, staffId))
        .limit(1);
      const [prefRow] = await tx
        .select()
        .from(staffPreferences)
        .where(eq(staffPreferences.staffId, staffId))
        .limit(1);

      return { identity: toIdentityView(staffRow!), preferences: toPreferencesView(prefRow!) };
    });
  }
}
