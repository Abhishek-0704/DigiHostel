import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ContentLayout } from "../layouts/ContentLayout";
import { getBreadcrumbTrail } from "../lib/navigation/navigationConfig";
import { useStudentProfile } from "../features/students";
import {
  useReportEmergency,
  EMERGENCY_CATEGORIES,
  EMERGENCY_SEVERITIES,
} from "../features/emergency";
import { emergencyCategoryLabel } from "../components/emergency";
import { Button, Card, ConfirmationDialog, StatusBadge } from "../components/ui";
import { emergencyDetailPath } from "../constants/routes";
import type { EmergencyCategory, EmergencySeverity } from "@digihostel/api-client-react";
import styles from "./StudentReportEmergencyPage.module.css";

const SEVERITY_LABEL: Record<EmergencySeverity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  informational: "Informational",
};

/**
 * Student Profile's real "Report Emergency" quick action destination (Phase
 * 4, Prompt 10) — replaces the "Emergency Response" disabled placeholder in
 * `StudentProfilePage`'s `FUTURE_QUICK_ACTIONS` list. Reuses
 * `useStudentProfile` (Student Operations Center, Prompt 8) for student
 * identification — no second search/lookup path. This is the genuine,
 * honest staff-reporting capability this task's own reconnaissance
 * established as the real incident-creation mechanism (the Student
 * Application "Emergency Trigger" producer this prompt's own roadmap
 * language describes does not exist anywhere in this repository).
 */
export default function StudentReportEmergencyPage() {
  const { rollNumber } = useParams<{ rollNumber: string }>();
  const navigate = useNavigate();
  const { profile, isLoading, error } = useStudentProfile(rollNumber);

  const [category, setCategory] = useState<EmergencyCategory>("medical");
  const [severity, setSeverity] = useState<EmergencySeverity>("high");
  const [description, setDescription] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const report = useReportEmergency();

  const breadcrumb = getBreadcrumbTrail(
    "students",
    rollNumber ? `Report — ${rollNumber}` : undefined,
  );

  if (!rollNumber) {
    return (
      <ContentLayout title="Report Emergency" breadcrumb={breadcrumb}>
        {null}
      </ContentLayout>
    );
  }

  if (isLoading) {
    return (
      <ContentLayout title={`Report Emergency — ${rollNumber}`} breadcrumb={breadcrumb} loading>
        {null}
      </ContentLayout>
    );
  }

  if (error || !profile) {
    return (
      <ContentLayout
        title={`Report Emergency — ${rollNumber}`}
        breadcrumb={breadcrumb}
        error={{ message: error?.userMessage ?? "This student could not be found." }}
      >
        {null}
      </ContentLayout>
    );
  }

  const canSubmit = description.trim().length > 0 && !report.isPending;

  if (report.data) {
    return (
      <ContentLayout title={`Report Emergency — ${profile.fullName}`} breadcrumb={breadcrumb}>
        <Card className={styles.card}>
          <div role="status" className={styles.successBanner}>
            <StatusBadge label="Incident reported" tone="success" />
            <p>
              A {emergencyCategoryLabel(category).toLowerCase()} incident has been reported for{" "}
              {profile.fullName} and is now visible in the Emergency Operations Center.
            </p>
          </div>
          <Button variant="primary" onClick={() => navigate(emergencyDetailPath(report.data!.id))}>
            Open Incident
          </Button>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout
      title={`Report Emergency — ${profile.fullName}`}
      description={profile.rollNumber}
      breadcrumb={breadcrumb}
    >
      <div className={styles.page}>
        <Card className={styles.card}>
          <h2 className={styles.heading}>Student</h2>
          <dl className={styles.metaList}>
            <div className={styles.metaRow}>
              <dt>Name</dt>
              <dd>{profile.fullName}</dd>
            </div>
            <div className={styles.metaRow}>
              <dt>Hostel</dt>
              <dd>{profile.hostelName ?? "Not assigned"}</dd>
            </div>
            <div className={styles.metaRow}>
              <dt>Room</dt>
              <dd>{profile.roomNumber ?? "Not assigned"}</dd>
            </div>
          </dl>
        </Card>

        <Card className={styles.card}>
          <h2 className={styles.heading}>Incident Details</h2>
          <div className={styles.form}>
            <label className={styles.field}>
              Category
              <select
                className={styles.select}
                value={category}
                onChange={(e) => setCategory(e.target.value as EmergencyCategory)}
              >
                {EMERGENCY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {emergencyCategoryLabel(c)}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              Priority
              <select
                className={styles.select}
                value={severity}
                onChange={(e) => setSeverity(e.target.value as EmergencySeverity)}
              >
                {EMERGENCY_SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {SEVERITY_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              Description
              <textarea
                className={styles.textarea}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What happened, where, and any immediate action already taken."
                aria-label="Incident description"
              />
            </label>

            <Button
              type="button"
              variant="primary"
              disabled={!canSubmit}
              loading={report.isPending}
              onClick={() => setConfirmOpen(true)}
            >
              Report Emergency
            </Button>

            {report.error && (
              <div role="alert" className={styles.formError}>
                {report.error.userMessage}
              </div>
            )}
          </div>
        </Card>

        <ConfirmationDialog
          open={confirmOpen}
          title="Confirm Emergency Report"
          description={`This will report a ${SEVERITY_LABEL[severity].toLowerCase()}-priority ${emergencyCategoryLabel(category).toLowerCase()} incident for ${profile.fullName} and make it immediately visible to Emergency Operations Center staff.`}
          confirmLabel="Report Emergency"
          onConfirm={() => {
            setConfirmOpen(false);
            report.report({ rollNumber, category, severity, description: description.trim() });
          }}
          onCancel={() => setConfirmOpen(false)}
        />
      </div>
    </ContentLayout>
  );
}
