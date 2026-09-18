/**
 * Route path constants (Prompt 0.2 §9 — routing foundation only). One
 * constant per placeholder route this prompt enumerates. Consumed by
 * src/routes/index.tsx (router definition) and any future navigation
 * component (src/components/layout/Sidebar.tsx) so a path never needs to be
 * retyped as a literal string in more than one place.
 *
 * These are route PLACEHOLDERS — the pages they point to render no business
 * data (see src/pages/*).
 */
export const ROUTES = {
  login: "/login",
  dashboard: "/dashboard",
  notifications: "/notifications",
  leaveQueue: "/leave",
  leaveDetail: "/leave/:id",
  students: "/students",
  studentProfile: "/students/:rollNumber",
  studentVerification: "/students/:rollNumber/verification",
  studentReturn: "/students/:rollNumber/return",
  studentReportEmergency: "/students/:rollNumber/report-emergency",
  studentReportHealthCase: "/students/:rollNumber/report-health-case",
  emergency: "/emergency",
  emergencyDetail: "/emergency/:incidentId",
  health: "/health",
  healthDetail: "/health/:caseId",
  approvalHistory: "/approval-history",
  audit: "/audit",
  reports: "/reports",
  analytics: "/analytics",
  users: "/users",
  configuration: "/configuration",
  settings: "/settings",
  help: "/help",
  system: "/system",
} as const;

export function leaveDetailPath(id: string): string {
  return `/leave/${id}`;
}

export function studentProfilePath(rollNumber: string): string {
  return `/students/${rollNumber}`;
}

export function studentVerificationPath(rollNumber: string): string {
  return `/students/${rollNumber}/verification`;
}

export function studentReturnPath(rollNumber: string): string {
  return `/students/${rollNumber}/return`;
}

export function studentReportEmergencyPath(rollNumber: string): string {
  return `/students/${rollNumber}/report-emergency`;
}

export function emergencyDetailPath(incidentId: string): string {
  return `/emergency/${incidentId}`;
}

export function studentReportHealthCasePath(rollNumber: string): string {
  return `/students/${rollNumber}/report-health-case`;
}

export function healthCaseDetailPath(caseId: string): string {
  return `/health/${caseId}`;
}
