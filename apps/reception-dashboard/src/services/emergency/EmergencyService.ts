import {
  listEmergencies,
  getEmergency,
  getEmergencyStatistics,
  reportEmergency,
  acknowledgeEmergency,
  startEmergencyResponse,
  resolveEmergency,
  closeEmergency,
  addEmergencyNote,
  type EmergencyList,
  type EmergencyDetail,
  type EmergencyStatistics,
  type EmergencyEvent,
  type EmergencyCategory,
  type EmergencySeverity,
  type EmergencyStatus,
} from "@digihostel/api-client-react";

export interface EmergencyQueueParams {
  q?: string;
  category?: EmergencyCategory[];
  severity?: EmergencySeverity[];
  status?: EmergencyStatus[];
  activeOnly?: boolean;
  page: number;
  pageSize: number;
  sortBy: "reportedAt" | "severity";
  sortDir: "asc" | "desc";
}

export interface ReportEmergencyParams {
  rollNumber: string;
  category: EmergencyCategory;
  severity: EmergencySeverity;
  description: string;
}

/**
 * Emergency Operations Center service (Phase 4, Prompt 10) — real
 * implementation, replacing Prompt 0.2's interface-only placeholder
 * (`listOpenIncidents(): Promise<SecurityIncidentSummary[]>`). Calls the
 * generated plain functions directly, matching `StudentOperationsService`'s/
 * `MovementService`'s established pattern — a thin transport wrapper. The
 * backend resolves hostel scope entirely server-side from the
 * authenticated caller's own staff identity; this service performs no
 * authorization or scoping of its own.
 */
export interface EmergencyOperationsService {
  list(params: EmergencyQueueParams): Promise<EmergencyList>;
  getStatistics(): Promise<EmergencyStatistics>;
  getById(incidentId: string): Promise<EmergencyDetail>;
  report(params: ReportEmergencyParams): Promise<EmergencyDetail>;
  acknowledge(incidentId: string): Promise<EmergencyDetail>;
  startResponse(incidentId: string): Promise<EmergencyDetail>;
  resolve(incidentId: string): Promise<EmergencyDetail>;
  close(incidentId: string): Promise<EmergencyDetail>;
  addNote(incidentId: string, note: string): Promise<EmergencyEvent>;
}

export const emergencyOperationsService: EmergencyOperationsService = {
  async list(params) {
    return listEmergencies({
      q: params.q,
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
    return getEmergencyStatistics();
  },
  async getById(incidentId: string) {
    return getEmergency(incidentId);
  },
  async report(params) {
    return reportEmergency({
      rollNumber: params.rollNumber,
      category: params.category,
      severity: params.severity,
      description: params.description,
    });
  },
  async acknowledge(incidentId: string) {
    return acknowledgeEmergency(incidentId);
  },
  async startResponse(incidentId: string) {
    return startEmergencyResponse(incidentId);
  },
  async resolve(incidentId: string) {
    return resolveEmergency(incidentId);
  },
  async close(incidentId: string) {
    return closeEmergency(incidentId);
  },
  async addNote(incidentId: string, note: string) {
    return addEmergencyNote(incidentId, { note });
  },
};

export type {
  EmergencyList,
  EmergencyDetail,
  EmergencyStatistics,
  EmergencyEvent,
  EmergencyCategory,
  EmergencySeverity,
  EmergencyStatus,
};
