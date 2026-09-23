// Service boundaries (Prompt 0.2 §18). Only auth/api/realtime carry a real
// implementation — infrastructure, not business logic. Every business
// service below is an interface only; see each file's doc comment for what
// backend work (or product decision) unblocks its implementation.
export { authService } from "./auth/authService";
export { mfaService } from "./auth/mfaService";
export { registerAuthTokenProvider } from "./api/authTokenProvider";
export { createChannel, removeChannel } from "./realtime/realtimeClient";

export { studentOperationsService } from "./students/StudentService";
export type { StudentOperationsService, StudentSearchParams } from "./students/StudentService";
export { leaveQueueService } from "./leave/LeaveService";
export type { LeaveQueueService, StaffLeaveQueueItem } from "./leave/LeaveService";
export type {
  ParentApprovalService,
  ParentApprovalStatus,
} from "./parent-approval/ParentApprovalService";
export { notificationService } from "./notifications/NotificationService";
export type { NotificationService } from "./notifications/NotificationService";
export { auditService } from "./audit/AuditService";
export type { AuditService, AuditListParams } from "./audit/AuditService";
export { emergencyOperationsService } from "./emergency/EmergencyService";
export type {
  EmergencyOperationsService,
  EmergencyQueueParams,
  ReportEmergencyParams,
} from "./emergency/EmergencyService";
export { healthOperationsService } from "./health/HealthService";
export type {
  HealthOperationsService,
  HealthCaseQueueParams,
  ReportHealthCaseParams,
} from "./health/HealthService";
export type { DashboardService, DashboardSummary } from "./dashboard/DashboardService";
export type { ReportService, ReportDefinition } from "./reports/ReportService";
export { profileService } from "./profile/ProfileService";
export type { ProfileService } from "./profile/ProfileService";
