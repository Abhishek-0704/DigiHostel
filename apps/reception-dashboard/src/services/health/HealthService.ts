import {
  listHealthCases,
  getHealthCase,
  getHealthCaseStatistics,
  reportHealthCase,
  acknowledgeHealthCase,
  cancelHealthCase,
  startHealthCaseMonitoring,
  markHealthCaseAwaitingUpdate,
  resumeHealthCaseMonitoring,
  resolveHealthCase,
  dischargeHealthCase,
  closeHealthCase,
  addHealthCaseNote,
  type HealthCaseList,
  type HealthCaseDetail,
  type HealthCaseStatistics,
  type HealthCaseEvent,
  type HealthCaseCategory,
  type HealthCaseSeverity,
  type HealthCaseStatus,
} from "@digihostel/api-client-react";

export interface HealthCaseQueueParams {
  q?: string;
  /** Prompt 11 closure (Medical History) — restricts the list to one
   * student's own cases. See `HealthCaseListInput.studentId`'s doc comment
   * (backend) for the full reasoning. */
  studentId?: string;
  category?: HealthCaseCategory[];
  severity?: HealthCaseSeverity[];
  status?: HealthCaseStatus[];
  activeOnly?: boolean;
  page: number;
  pageSize: number;
  sortBy: "reportedAt" | "severity";
  sortDir: "asc" | "desc";
}

export interface ReportHealthCaseParams {
  rollNumber: string;
  category: HealthCaseCategory;
  severity: HealthCaseSeverity;
  description: string;
}

/**
 * Health Operations Center service (Phase 4, Prompt 11) — real
 * implementation, replacing Prompt 0.2's interface-only placeholder
 * (`listActiveAlerts(): Promise<HealthAlertSummary[]>`). Calls the
 * generated plain functions directly, matching
 * `EmergencyOperationsService`'s established pattern — a thin transport
 * wrapper. The backend resolves hostel scope entirely server-side from the
 * authenticated caller's own staff identity; this service performs no
 * authorization or scoping of its own.
 */
export interface HealthOperationsService {
  list(params: HealthCaseQueueParams): Promise<HealthCaseList>;
  getStatistics(): Promise<HealthCaseStatistics>;
  getById(caseId: string): Promise<HealthCaseDetail>;
  report(params: ReportHealthCaseParams): Promise<HealthCaseDetail>;
  acknowledge(caseId: string): Promise<HealthCaseDetail>;
  cancel(caseId: string): Promise<HealthCaseDetail>;
  startMonitoring(caseId: string): Promise<HealthCaseDetail>;
  markAwaitingUpdate(caseId: string): Promise<HealthCaseDetail>;
  resumeMonitoring(caseId: string): Promise<HealthCaseDetail>;
  resolve(caseId: string): Promise<HealthCaseDetail>;
  discharge(caseId: string): Promise<HealthCaseDetail>;
  close(caseId: string): Promise<HealthCaseDetail>;
  addNote(caseId: string, note: string): Promise<HealthCaseEvent>;
}

export const healthOperationsService: HealthOperationsService = {
  async list(params) {
    return listHealthCases({
      q: params.q,
      studentId: params.studentId,
      category: params.category,
      severity: params.severity,
      status: params.status,
      activeOnly: params.activeOnly,
      page: params.page,
      pageSize: params.pageSize,
      sortBy: params.sortBy,
      sortDir: params.sortDir,
    });
  },
  async getStatistics() {
    return getHealthCaseStatistics();
  },
  async getById(caseId: string) {
    return getHealthCase(caseId);
  },
  async report(params) {
    return reportHealthCase({
      rollNumber: params.rollNumber,
      category: params.category,
      severity: params.severity,
      description: params.description,
    });
  },
  async acknowledge(caseId: string) {
    return acknowledgeHealthCase(caseId);
  },
  async cancel(caseId: string) {
    return cancelHealthCase(caseId);
  },
  async startMonitoring(caseId: string) {
    return startHealthCaseMonitoring(caseId);
  },
  async markAwaitingUpdate(caseId: string) {
    return markHealthCaseAwaitingUpdate(caseId);
  },
  async resumeMonitoring(caseId: string) {
    return resumeHealthCaseMonitoring(caseId);
  },
  async resolve(caseId: string) {
    return resolveHealthCase(caseId);
  },
  async discharge(caseId: string) {
    return dischargeHealthCase(caseId);
  },
  async close(caseId: string) {
    return closeHealthCase(caseId);
  },
  async addNote(caseId: string, note: string) {
    return addHealthCaseNote(caseId, { note });
  },
};

export type {
  HealthCaseList,
  HealthCaseDetail,
  HealthCaseStatistics,
  HealthCaseEvent,
  HealthCaseCategory,
  HealthCaseSeverity,
  HealthCaseStatus,
};
