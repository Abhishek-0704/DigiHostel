import { useEffect, useId, useMemo, useState } from "react";
import { ContentLayout } from "../layouts/ContentLayout";
import { Card, FormField, Button, Toggle, useToast } from "../components/ui";
import { PersonalActivityPanel } from "../components/profile/PersonalActivityPanel";
import { useProfile } from "../features/profile/useProfile";
import { useAuthContext } from "../contexts";
import { getBreadcrumbTrail } from "../lib/navigation/navigationConfig";
import { useTheme, type ThemePreference, type FontScalePreference } from "../contexts/ThemeContext";
import { authService } from "../services/auth/authService";
import { staffAuthAuditService } from "../services/auth/staffAuthAuditService";
import {
  NOTIFICATION_CATEGORIES,
  MANDATORY_NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_LABELS,
} from "../lib/profile/notificationCategories";
import type { Profile, ProfileUpdateBody } from "../services/profile/ProfileService";
import styles from "./SettingsPage.module.css";

const SECTIONS = [
  { id: "section-profile", label: "Profile" },
  { id: "section-notifications", label: "Notifications" },
  { id: "section-dashboard", label: "Dashboard" },
  { id: "section-theme", label: "Theme & Accessibility" },
  { id: "section-sessions", label: "Sessions" },
  { id: "section-activity", label: "Personal Activity" },
] as const;

/** Administrative Profile & Personal Preferences Center (Phase 7, Prompt
 * 17) — replaces the Phase 0.2 placeholder. A secure personal workspace
 * for the currently-authenticated administrator: this page never reads or
 * writes any OTHER staff member's data (every call goes through `/profile`,
 * which is unconditionally self-scoped server-side — see routes/profile.ts's
 * own doc comment). Role/permission/hostel-assignment/account-status remain
 * entirely read-only here and owned by Identity & Access Administration
 * (Prompt 13) — this page has no control that could touch any of them. */
export default function SettingsPage() {
  const { profile, isLoading, error, update, isSaving } = useProfile();
  const [query, setQuery] = useState("");

  const visibleSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.filter((s) => s.label.toLowerCase().includes(q));
  }, [query]);

  return (
    <ContentLayout
      title="Settings"
      description="Manage your own profile, preferences, and sessions. These settings affect only your account."
      breadcrumb={getBreadcrumbTrail("settings")}
      loading={isLoading}
      loadingLabel="Loading your profile"
      error={error ? { message: error.userMessage } : undefined}
    >
      <div className={styles.searchRow}>
        <label htmlFor="settings-search" className={styles.searchLabel}>
          Find a setting
        </label>
        <input
          id="settings-search"
          type="search"
          className={styles.searchInput}
          placeholder="e.g. theme, notifications, sessions…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {profile && (
        <div className={styles.sections}>
          {visibleSections.some((s) => s.id === "section-profile") && (
            <ProfileSection profile={profile} onSave={update} isSaving={isSaving} />
          )}
          {visibleSections.some((s) => s.id === "section-notifications") && (
            <NotificationsSection profile={profile} onSave={update} isSaving={isSaving} />
          )}
          {visibleSections.some((s) => s.id === "section-dashboard") && (
            <DashboardSection profile={profile} onSave={update} isSaving={isSaving} />
          )}
          {visibleSections.some((s) => s.id === "section-theme") && (
            <ThemeSection profile={profile} onSave={update} isSaving={isSaving} />
          )}
          {visibleSections.some((s) => s.id === "section-sessions") && <SessionsSection />}
          {visibleSections.some((s) => s.id === "section-activity") && (
            <PersonalActivityPanel
              staffId={profile.identity.id}
              staffRole={profile.identity.role}
            />
          )}
        </div>
      )}
    </ContentLayout>
  );
}

interface SectionProps {
  profile: Profile;
  onSave: (body: ProfileUpdateBody) => Promise<Profile>;
  isSaving: boolean;
}

function ProfileSection({ profile, onSave, isSaving }: SectionProps) {
  const { showToast } = useToast();
  const [fullName, setFullName] = useState(profile.identity.fullName);
  const [phoneNumber, setPhoneNumber] = useState(profile.preferences.phoneNumber ?? "");
  const [officeLocation, setOfficeLocation] = useState(profile.preferences.officeLocation ?? "");
  const [bio, setBio] = useState(profile.preferences.bio ?? "");
  const [preferredContactMethod, setPreferredContactMethod] = useState(
    profile.preferences.preferredContactMethod,
  );
  const ids = {
    fullName: useId(),
    phone: useId(),
    office: useId(),
    bio: useId(),
    contact: useId(),
  };

  async function handleSave() {
    try {
      await onSave({
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim() || null,
        officeLocation: officeLocation.trim() || null,
        bio: bio.trim() || null,
        preferredContactMethod,
      });
      showToast({ message: "Profile updated.", variant: "success" });
    } catch {
      showToast({ message: "Couldn't save your profile. Please try again.", variant: "error" });
    }
  }

  return (
    <Card id="section-profile" className={styles.section}>
      <h2 className={styles.sectionTitle}>Profile</h2>
      <dl className={styles.readOnlyGrid}>
        <div>
          <dt>Role</dt>
          <dd>{profile.identity.role.replace("_", " ")}</dd>
        </div>
        <div>
          <dt>Assigned hostel</dt>
          <dd>{profile.identity.hostelId ? "Assigned" : "All hostels"}</dd>
        </div>
        <div>
          <dt>Account status</dt>
          <dd>{profile.identity.status}</dd>
        </div>
        <div>
          <dt>Member since</dt>
          <dd>{new Date(profile.identity.createdAt).toLocaleDateString()}</dd>
        </div>
      </dl>
      <p className={styles.hint}>
        Role, hostel assignment, and account status are managed by an administrator and cannot be
        changed here.
      </p>

      <FormField label="Full name" htmlFor={ids.fullName}>
        <input
          id={ids.fullName}
          className={styles.input}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          maxLength={200}
        />
      </FormField>
      <FormField label="Phone number" htmlFor={ids.phone}>
        <input
          id={ids.phone}
          className={styles.input}
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          maxLength={30}
        />
      </FormField>
      <FormField label="Office location" htmlFor={ids.office}>
        <input
          id={ids.office}
          className={styles.input}
          value={officeLocation}
          onChange={(e) => setOfficeLocation(e.target.value)}
          maxLength={200}
        />
      </FormField>
      <FormField label="Bio" htmlFor={ids.bio}>
        <textarea
          id={ids.bio}
          className={styles.textarea}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={1000}
          rows={3}
        />
      </FormField>
      <FormField label="Preferred contact method" htmlFor={ids.contact}>
        <select
          id={ids.contact}
          className={styles.input}
          value={preferredContactMethod}
          onChange={(e) =>
            setPreferredContactMethod(e.target.value as typeof preferredContactMethod)
          }
        >
          <option value="email">Email</option>
          <option value="phone">Phone</option>
          <option value="in_app">In-app only</option>
        </select>
      </FormField>
      <Button onClick={handleSave} disabled={isSaving || fullName.trim().length === 0}>
        {isSaving ? "Saving…" : "Save profile"}
      </Button>
    </Card>
  );
}

function NotificationsSection({ profile, onSave, isSaving }: SectionProps) {
  const { showToast } = useToast();
  const [prefs, setPrefs] = useState(profile.preferences.notificationPreferences);

  function isEnabled(category: string): boolean {
    return prefs[category] !== false;
  }

  async function handleSave() {
    try {
      await onSave({ notificationPreferences: prefs });
      showToast({ message: "Notification preferences updated.", variant: "success" });
    } catch {
      showToast({ message: "Couldn't save notification preferences.", variant: "error" });
    }
  }

  return (
    <Card id="section-notifications" className={styles.section}>
      <h2 className={styles.sectionTitle}>Notifications</h2>
      <p className={styles.hint}>
        These preferences are stored on your account. No staff-facing notification delivery channel
        exists in this system yet, so they do not change what is sent today — they will apply
        automatically once one does.
      </p>
      {NOTIFICATION_CATEGORIES.map((category) => {
        const mandatory = (MANDATORY_NOTIFICATION_CATEGORIES as readonly string[]).includes(
          category,
        );
        return (
          <Toggle
            key={category}
            id={`notif-${category}`}
            label={NOTIFICATION_CATEGORY_LABELS[category]}
            checked={mandatory ? true : isEnabled(category)}
            disabled={mandatory}
            description={mandatory ? "Mandatory — cannot be disabled" : undefined}
            onChange={(checked) => setPrefs((p) => ({ ...p, [category]: checked }))}
          />
        );
      })}
      <Button onClick={handleSave} disabled={isSaving}>
        {isSaving ? "Saving…" : "Save notification preferences"}
      </Button>
    </Card>
  );
}

function DashboardSection({ profile, onSave, isSaving }: SectionProps) {
  const { showToast } = useToast();
  const [defaultLandingPage, setDefaultLandingPage] = useState(
    profile.preferences.defaultLandingPage,
  );
  const [compactMode, setCompactMode] = useState(
    profile.preferences.dashboardPreferences.compactMode ?? false,
  );
  const landingId = useId();

  async function handleSave() {
    try {
      await onSave({
        defaultLandingPage,
        dashboardPreferences: {
          ...profile.preferences.dashboardPreferences,
          compactMode,
        },
      });
      showToast({ message: "Dashboard preferences updated.", variant: "success" });
    } catch {
      showToast({ message: "Couldn't save dashboard preferences.", variant: "error" });
    }
  }

  return (
    <Card id="section-dashboard" className={styles.section}>
      <h2 className={styles.sectionTitle}>Dashboard</h2>
      <FormField label="Default landing page" htmlFor={landingId}>
        <select
          id={landingId}
          className={styles.input}
          value={defaultLandingPage}
          onChange={(e) => setDefaultLandingPage(e.target.value as typeof defaultLandingPage)}
        >
          <option value="dashboard">Dashboard</option>
          <option value="leave">Leave Queue</option>
          <option value="students">Student Operations</option>
          <option value="notifications">Notifications</option>
          <option value="emergency">Emergency Operations</option>
          <option value="health">Health Operations</option>
          <option value="audit">Audit Center</option>
        </select>
      </FormField>
      <Toggle
        id="compact-mode"
        label="Compact mode"
        checked={compactMode}
        onChange={setCompactMode}
        description="Denser spacing in tables and lists."
      />
      <Button onClick={handleSave} disabled={isSaving}>
        {isSaving ? "Saving…" : "Save dashboard preferences"}
      </Button>
    </Card>
  );
}

function ThemeSection({ profile, onSave, isSaving }: SectionProps) {
  const { showToast } = useToast();
  const { setThemePreference, setReducedMotion, setHighContrast, setFontScale } = useTheme();
  const [themePreference, setLocalThemePreference] = useState<ThemePreference>(
    profile.preferences.theme,
  );
  const [reducedMotion, setLocalReducedMotion] = useState(profile.preferences.reducedMotion);
  const [highContrast, setLocalHighContrast] = useState(profile.preferences.highContrast);
  const [fontScale, setLocalFontScale] = useState<FontScalePreference>(
    profile.preferences.fontScale,
  );
  const themeId = useId();
  const fontScaleId = useId();

  // Live preview: every change here is applied to the real ThemeContext
  // immediately, before Save — the same "let the user see the result of
  // their choice" pattern a color picker uses. If they navigate away
  // without saving, the NEXT session still resolves from server truth
  // (ThemePreferenceSync's one-shot sync), so an unsaved preview never
  // persists incorrectly. The destructured setters (plain `useState`
  // setters under the hood) are referentially stable, so each effect's
  // dependency array is genuinely exhaustive as written.
  useEffect(() => {
    setThemePreference(themePreference);
  }, [themePreference, setThemePreference]);
  useEffect(() => {
    setReducedMotion(reducedMotion);
  }, [reducedMotion, setReducedMotion]);
  useEffect(() => {
    setHighContrast(highContrast);
  }, [highContrast, setHighContrast]);
  useEffect(() => {
    setFontScale(fontScale);
  }, [fontScale, setFontScale]);

  async function handleSave() {
    try {
      await onSave({ theme: themePreference, reducedMotion, highContrast, fontScale });
      showToast({ message: "Display preferences updated.", variant: "success" });
    } catch {
      showToast({ message: "Couldn't save display preferences.", variant: "error" });
    }
  }

  return (
    <Card id="section-theme" className={styles.section}>
      <h2 className={styles.sectionTitle}>Theme & Accessibility</h2>
      <FormField label="Theme" htmlFor={themeId}>
        <select
          id={themeId}
          className={styles.input}
          value={themePreference}
          onChange={(e) => setLocalThemePreference(e.target.value as ThemePreference)}
        >
          <option value="system">Match system</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </FormField>
      <FormField label="Text size" htmlFor={fontScaleId}>
        <select
          id={fontScaleId}
          className={styles.input}
          value={fontScale}
          onChange={(e) => setLocalFontScale(e.target.value as FontScalePreference)}
        >
          <option value="default">Default</option>
          <option value="large">Large</option>
          <option value="larger">Larger</option>
        </select>
      </FormField>
      <Toggle
        id="reduced-motion"
        label="Reduce motion"
        checked={reducedMotion}
        onChange={setLocalReducedMotion}
        description="Minimizes animations and transitions."
      />
      <Toggle
        id="high-contrast"
        label="High contrast"
        checked={highContrast}
        onChange={setLocalHighContrast}
        description="Increases border and text contrast."
      />
      <Button onClick={handleSave} disabled={isSaving}>
        {isSaving ? "Saving…" : "Save display preferences"}
      </Button>
    </Card>
  );
}

function SessionsSection() {
  const { signOut } = useAuthContext();
  const { showToast } = useToast();
  const [isSigningOutOthers, setIsSigningOutOthers] = useState(false);

  async function handleSignOutOthers() {
    setIsSigningOutOthers(true);
    try {
      await authService.signOutOtherSessions();
      void staffAuthAuditService.record("sessions_signed_out_others");
      showToast({ message: "Every other session has been signed out.", variant: "success" });
    } catch {
      showToast({
        message: "Couldn't sign out other sessions. Please try again.",
        variant: "error",
      });
    } finally {
      setIsSigningOutOthers(false);
    }
  }

  return (
    <Card id="section-sessions" className={styles.section}>
      <h2 className={styles.sectionTitle}>Sessions</h2>
      <p className={styles.hint}>
        Recent session/device history is not available — this platform does not maintain a
        per-session log beyond the current session itself.
      </p>
      <div className={styles.sessionActions}>
        <Button variant="secondary" onClick={handleSignOutOthers} disabled={isSigningOutOthers}>
          {isSigningOutOthers ? "Signing out…" : "Sign out of all other sessions"}
        </Button>
        <Button variant="secondary" onClick={() => void signOut("user_initiated")}>
          Sign out of this session
        </Button>
      </div>
    </Card>
  );
}
