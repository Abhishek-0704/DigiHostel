import {
  listConfigurationDomains,
  getConfigurationStatistics,
  listConfiguration,
  getConfigurationEntry,
  validateConfiguration,
  createConfigurationEntry,
  updateConfigurationEntry,
  type ConfigurationList,
  type ConfigurationStatistics,
  type ConfigurationEntry,
  type ConfigurationDomain,
  type ConfigurationScope,
  type ConfigurationValueType,
  type ConfigurationValidationResult,
} from "@digihostel/api-client-react";

export interface ConfigurationListParams {
  domain?: ConfigurationDomain[];
  scope?: ConfigurationScope[];
  hostelId?: string[];
  isActive?: boolean;
  q?: string;
  page: number;
  pageSize: number;
  sortDir: "asc" | "desc";
}

export interface CreateConfigurationParams {
  domain: ConfigurationDomain;
  key: string;
  value: unknown;
  valueType: ConfigurationValueType;
  description: string | null;
  scope: ConfigurationScope;
  hostelId: string | null;
}

export interface ValidateConfigurationParams {
  domain: ConfigurationDomain;
  key: string;
  value: unknown;
  valueType: ConfigurationValueType;
  scope: ConfigurationScope;
  hostelId: string | null;
}

export interface UpdateConfigurationParams {
  expectedVersion: number;
  value?: unknown;
  description?: string | null;
  isActive?: boolean;
}

/**
 * Enterprise Configuration Center service (Phase 5, Prompt 14) — real
 * implementation, matching `AuditService`'s/`StaffAdminService`'s
 * established thin-transport-wrapper pattern. The backend independently
 * re-resolves the caller's own hostel scope and re-verifies
 * `configuration:manage` authorization on every call — this service
 * performs no authorization of its own.
 */
export interface ConfigurationService {
  listDomains(): Promise<ConfigurationDomain[]>;
  getStatistics(): Promise<ConfigurationStatistics>;
  list(params: ConfigurationListParams): Promise<ConfigurationList>;
  getById(entryId: string): Promise<ConfigurationEntry>;
  validate(params: ValidateConfigurationParams): Promise<ConfigurationValidationResult>;
  create(params: CreateConfigurationParams): Promise<ConfigurationEntry>;
  update(entryId: string, params: UpdateConfigurationParams): Promise<ConfigurationEntry>;
}

export const configurationService: ConfigurationService = {
  async listDomains() {
    const result = await listConfigurationDomains();
    return result.domains;
  },
  async getStatistics() {
    return getConfigurationStatistics();
  },
  async list(params) {
    return listConfiguration({
      domain: params.domain,
      scope: params.scope,
      hostelId: params.hostelId,
      isActive: params.isActive,
      q: params.q,
      page: params.page,
      pageSize: params.pageSize,
      sortDir: params.sortDir,
    });
  },
  async getById(entryId) {
    return getConfigurationEntry(entryId);
  },
  async validate(params) {
    return validateConfiguration({
      domain: params.domain,
      key: params.key,
      value: params.value,
      valueType: params.valueType,
      scope: params.scope,
      hostelId: params.hostelId,
    });
  },
  async create(params) {
    return createConfigurationEntry({
      domain: params.domain,
      key: params.key,
      value: params.value,
      valueType: params.valueType,
      description: params.description,
      scope: params.scope,
      hostelId: params.hostelId,
    });
  },
  async update(entryId, params) {
    return updateConfigurationEntry(entryId, {
      expectedVersion: params.expectedVersion,
      value: params.value,
      description: params.description,
      isActive: params.isActive,
    });
  },
};

export type {
  ConfigurationList,
  ConfigurationStatistics,
  ConfigurationEntry,
  ConfigurationDomain,
  ConfigurationScope,
  ConfigurationValueType,
  ConfigurationValidationResult,
};
