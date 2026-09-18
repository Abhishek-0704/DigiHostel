/**
 * Enterprise Configuration Center (Phase 5, Prompt 14) domain types.
 *
 * Scope discipline (see `apps/reception-dashboard/docs/configuration-center.md`
 * for the full reasoning): this reconnaissance-driven task found NO
 * configuration/settings/feature-flag table anywhere in the existing schema
 * — `CONFIGURATION_DOMAINS` below is this task's own application-layer
 * allow-list (mirroring `audit_logs.entity_type`'s own "free-form text,
 * app-validated" precedent), not a value copied from an existing enum. Every
 * domain listed is one this prompt's own text explicitly named AND that has
 * a real, existing certified module it could plausibly relate to — no
 * domain for academic/library/visitor/reporting configuration is included,
 * since reconnaissance found no existing academic/library/visitor/reporting
 * business logic in this repository for such a domain to configure (see the
 * architecture doc's "deferred domains" section).
 */

export const CONFIGURATION_DOMAINS = [
  "hostel",
  "approval",
  "movement",
  "emergency",
  "health",
  "notification",
  "system",
  "feature_flags",
] as const;
export type ConfigurationDomain = (typeof CONFIGURATION_DOMAINS)[number];

export const CONFIGURATION_SCOPES = ["global", "hostel"] as const;
export type ConfigurationScope = (typeof CONFIGURATION_SCOPES)[number];

export const CONFIGURATION_VALUE_TYPES = ["string", "number", "boolean", "json"] as const;
export type ConfigurationValueType = (typeof CONFIGURATION_VALUE_TYPES)[number];

/** Only the two roles `configuration:manage` is actually granted to
 * (`apps/reception-dashboard/src/lib/authorization/policy.ts`) — never
 * trusted from the client; always the caller's own server-resolved role. */
export type ConfigurationActorRole = "hostel_admin" | "super_admin";

export interface ActorScope {
  actingStaffId: string;
  actingRole: ConfigurationActorRole;
  /** The acting hostel_admin's OWN hostel id (null for super_admin, who is
   * unscoped) — resolved server-side from the authenticated session, never
   * client-supplied. A hostel_admin may only create/edit a hostel-scoped
   * entry naming THIS hostel; a super_admin may name any hostel or none
   * (global). */
  actingHostelId: string | null;
}

export interface ConfigurationEntryView {
  id: string;
  domain: string;
  key: string;
  value: unknown;
  valueType: ConfigurationValueType;
  description: string | null;
  scope: ConfigurationScope;
  hostelId: string | null;
  hostelName: string | null;
  isActive: boolean;
  version: number;
  createdBy: string | null;
  createdByName: string | null;
  updatedBy: string | null;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConfigurationListInput extends ActorScope {
  domain?: ConfigurationDomain[];
  scope?: ConfigurationScope[];
  hostelId?: string[];
  isActive?: boolean;
  q?: string;
  page: number;
  pageSize: number;
  sortDir: "asc" | "desc";
}

export interface ConfigurationListResult {
  items: ConfigurationEntryView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ConfigurationStatisticsView {
  totalEntries: number;
  activeEntries: number;
  inactiveEntries: number;
  byDomain: Record<ConfigurationDomain, number>;
}

export interface ConfigurationCreateInput extends ActorScope {
  domain: ConfigurationDomain;
  key: string;
  value: unknown;
  valueType: ConfigurationValueType;
  description: string | null;
  scope: ConfigurationScope;
  hostelId: string | null;
}

export type ConfigurationCreateOutcome =
  | { kind: "success"; entry: ConfigurationEntryView }
  | { kind: "duplicate_key" }
  | { kind: "invalid_hostel" }
  | { kind: "hostel_scope_forbidden" }
  | { kind: "hostel_required_for_scope" }
  | { kind: "hostel_not_permitted_for_scope" }
  | { kind: "invalid_value" };

export interface ConfigurationUpdateInput extends ActorScope {
  entryId: string;
  /** The version the caller last read — required for every update (optimistic
   * concurrency, see `configuration.ts`'s own doc comment). */
  expectedVersion: number;
  value?: unknown;
  description?: string | null;
  isActive?: boolean;
}

export type ConfigurationMutationOutcome =
  | { kind: "success"; entry: ConfigurationEntryView }
  | { kind: "not_found" }
  | { kind: "hostel_scope_forbidden" }
  | { kind: "stale_version"; currentVersion: number }
  | { kind: "invalid_value" };

export interface ConfigurationValidateInput {
  domain: ConfigurationDomain;
  key: string;
  value: unknown;
  valueType: ConfigurationValueType;
  scope: ConfigurationScope;
  hostelId: string | null;
}

export type ConfigurationValidateOutcome =
  | { kind: "valid" }
  | { kind: "invalid_hostel" }
  | { kind: "hostel_required_for_scope" }
  | { kind: "hostel_not_permitted_for_scope" }
  | { kind: "invalid_value"; reason: string }
  | { kind: "invalid_key"; reason: string };
