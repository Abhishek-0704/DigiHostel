import { useAuthorization } from "../../contexts/AuthorizationContext";
import { useCurrentDateTime } from "../../hooks/useCurrentDateTime";
import { RoleBadge } from "../layout/RoleBadge";
import styles from "./WelcomeSection.module.css";

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
});

const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * Dashboard Home's welcome/context section (Prompt 5 §6). Every value comes
 * from the existing authoritative staff identity (`AuthorizationContext`) —
 * no second identity source, no editable profile control here (§6/§28/§33).
 *
 * The greeting is deliberately NOT a second `<h1>` — `ContentLayout` already
 * renders "Dashboard" as this page's one `<h1>` (Prompt 4's page-template
 * contract), so the greeting here is a labelled, non-heading lead paragraph
 * (`aria-labelledby` still gives the `<section>` landmark a real accessible
 * name — §29 does not require that name come from a heading element).
 *
 * Shift information is deliberately omitted: no shift/roster concept exists
 * anywhere in this schema or SDD text — inventing one would violate §6's
 * "If shift information does not exist... do not invent it" rule. Hostel
 * assignment reuses `StaffIdentity`'s own honest "Hostel-scoped"/"All
 * hostels" derivation (`hostelId !== null`) rather than a second, competing
 * representation of the same fact.
 *
 * Time: `useCurrentDateTime` is the SAME shared 60s-interval hook
 * `HeaderClock` uses (Prompt 5 §6 — "the dashboard should not unnecessarily
 * create another high-frequency timer"), just formatted for a full
 * greeting instead of a compact header chip.
 */
export function WelcomeSection() {
  const { staffName, role, hostelId, isAuthorizationLoading } = useAuthorization();
  const now = useCurrentDateTime();

  if (isAuthorizationLoading || !role) return null;

  return (
    <section className={styles.section} aria-labelledby="welcome-heading">
      <div>
        <p id="welcome-heading" className={styles.heading}>
          {greetingFor(now.getHours())}
          {staffName ? `, ${staffName}` : ""}
        </p>
        <div className={styles.metaRow}>
          <RoleBadge role={role} />
          <span className={styles.scope}>{hostelId ? "Hostel-scoped" : "All hostels"}</span>
        </div>
      </div>
      <div className={styles.dateTime}>
        <span className={styles.date}>{DATE_FORMATTER.format(now)}</span>
        <span className={styles.time}>{TIME_FORMATTER.format(now)}</span>
      </div>
    </section>
  );
}
