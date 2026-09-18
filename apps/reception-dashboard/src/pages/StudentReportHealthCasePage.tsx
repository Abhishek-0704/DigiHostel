import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ContentLayout } from "../layouts/ContentLayout";
import { getBreadcrumbTrail } from "../lib/navigation/navigationConfig";
import { useStudentProfile } from "../features/students";
import {
  useReportHealthCase,
  HEALTH_CASE_CATEGORIES,
  HEALTH_CASE_SEVERITIES,
} from "../features/health";
import { healthCaseCategoryLabel } from "../components/health";
import { Button, Card, ConfirmationDialog, StatusBadge } from "../components/ui";
import { healthCaseDetailPath } from "../constants/routes";
import type { HealthCaseCategory, HealthCaseSeverity } from "@digihostel/api-client-react";
import styles from "./StudentReportHealthCasePage.module.css";

const SEVERITY_LABEL: Record<HealthCaseSeverity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  informational: "Informational",
};

/**
 * Student Profile's real "Report Health Case" quick action destination
 * (Phase 4, Prompt 11) — replaces the "Health Alert" disabled placeholder in
 * `StudentProfilePage`'s `FUTURE_QUICK_ACTIONS` list. Reuses
 * `useStudentProfile` (Student Operations Center, Prompt 8) for student
 * identification — no second search/lookup path. No real KIIMS/hospital-
 * system producer exists anywhere in this repository — this is the real,
 * honest staff-reporting capability this domain's own reconnaissance
 * established, mirroring `StudentReportEmergencyPage`'s identical pattern.
 */
export default function StudentReportHealthCasePage() {
  const { rollNumber } = useParams<{ rollNumber: string }>();
  const navigate = useNavigate();
  const { profile, isLoading, error } = useStudentProfile(rollNumber);

  const [category, setCategory] = useState<HealthCaseCategory>("medical_observation");
  const [severity, setSeverity] = useState<HealthCaseSeverity>("medium");
  const [description, setDescription] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const report = useReportHealthCase();

  const breadcrumb = getBreadcrumbTrail(
    "students",
    rollNumber ? `Report Health Case — ${rollNumber}` : undefined,
  );

  if (!rollNumber) {
    return (
      <ContentLayout title="Report Health Case" breadcrumb={breadcrumb}>
        {null}
      </ContentLayout>
    );
  }

  if (isLoading) {
    return (
      <ContentLayout title={`Report Health Case — ${rollNumber}`} breadcrumb={breadcrumb} loading>
        {null}
      </ContentLayout>
    );
  }

  if (error || !profile) {
    return (
      <ContentLayout
        title={`Report Health Case — ${rollNumber}`}
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
      <ContentLayout title={`Report Health Case — ${profile.fullName}`} breadcrumb={breadcrumb}>
        <Card className={styles.card}>
          <div role="status" className={styles.successBanner}>
            <StatusBadge label="Case reported" tone="success" />
            <p>
              A {healthCaseCategoryLabel(category).toLowerCase()} case has been reported for{" "}
              {profile.fullName} and is now visible in the Health Operations Center.
            </p>
          </div>
          <Button variant="primary" onClick={() => navigate(healthCaseDetailPath(report.data!.id))}>
            Open Case
          </Button>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout
      title={`Report Health Case — ${profile.fullName}`}
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
          <h2 className={styles.heading}>Case Details</h2>
          <div className={styles.form}>
            <label className={styles.field}>
              Category
              <select
                className={styles.select}
                value={category}
                onChange={(e) => setCategory(e.target.value as HealthCaseCategory)}
              >
                {HEALTH_CASE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {healthCaseCategoryLabel(c)}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              Priority
              <select
                className={styles.select}
                value={severity}
                onChange={(e) => setSeverity(e.target.value as HealthCaseSeverity)}
              >
                {HEALTH_CASE_SEVERITIES.map((s) => (
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
                placeholder="What happened, current condition, and any action already taken."
                aria-label="Case description"
              />
            </label>

            <Button
              type="button"
              variant="primary"
              disabled={!canSubmit}
              loading={report.isPending}
              onClick={() => setConfirmOpen(true)}
            >
              Report Health Case
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
          title="Confirm Health Case Report"
          description={`This will report a ${SEVERITY_LABEL[severity].toLowerCase()}-priority ${healthCaseCategoryLabel(category).toLowerCase()} case for ${profile.fullName} and make it immediately visible to Health Operations Center staff.`}
          confirmLabel="Report Health Case"
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
