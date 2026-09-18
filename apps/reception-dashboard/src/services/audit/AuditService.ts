import {
  listAuditEvents,
  getAuditStatistics,
  type AuditList,
  type AuditStatistics,
  type AuditModule,
  type AuditActorType,
  type AuditEntityType,
} from "@digihostel/api-client-react";

export interface AuditListParams {
  q?: string;
  module?: AuditModule[];
  actorType?: AuditActorType[];
  entityType?: AuditEntityType[];
  dateFrom?: string;
  dateTo?: string;
  page: number;
  pageSize: number;
  sortDir: "asc" | "desc";
}

/**
 * Enterprise Audit Center service (Phase 5, Prompt 12) — real
 * implementation, replacing Prompt 0.2's interface-only placeholder
 * (`list(): Promise<AuditLogEntry[]>`). Calls the generated plain
 * functions directly, matching `HealthOperationsService`'s/
 * `EmergencyOperationsService`'s established thin-transport-wrapper
 * pattern. The backend resolves hostel scope entirely server-side from the
 * authenticated caller's own staff identity; this service performs no
 * authorization or scoping of its own. Strictly read-only: no mutation
 * method exists on this interface, by design.
 */
export interface AuditService {
  list(params: AuditListParams): Promise<AuditList>;
  getStatistics(): Promise<AuditStatistics>;
}

export const auditService: AuditService = {
  async list(params) {
    return listAuditEvents({
      q: params.q,
      module: params.module,
      actorType: params.actorType,
      entityType: params.entityType,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      page: params.page,
      pageSize: params.pageSize,
      sortDir: params.sortDir,
    });
  },
  async getStatistics() {
    return getAuditStatistics();
  },
};

export type { AuditList, AuditStatistics, AuditModule, AuditActorType, AuditEntityType };
export type { AuditListItem } from "@digihostel/api-client-react";
