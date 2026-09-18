import type { ConfigurationRepository } from "../repository.js";
import { validateKey, validateValueShape, validateScopeHostelConsistency } from "../validation.js";
import type {
  ConfigurationListInput,
  ConfigurationListResult,
  ConfigurationEntryView,
  ConfigurationStatisticsView,
  ConfigurationCreateInput,
  ConfigurationCreateOutcome,
  ConfigurationUpdateInput,
  ConfigurationMutationOutcome,
  ConfigurationValidateInput,
  ConfigurationValidateOutcome,
  ConfigurationDomain,
} from "../types.js";
import { CONFIGURATION_DOMAINS } from "../types.js";

/**
 * In-memory fake, mirroring `FakeStaffRepository`'s established shape —
 * used by routes/configuration.test.ts to exercise the route/auth/hostel-
 * scope/concurrency layer without a real Postgres connection. The real
 * SQL/RLS-absence behavior is exercised separately by
 * repository.integration.test.ts.
 */
export class FakeConfigurationRepository implements ConfigurationRepository {
  items: ConfigurationEntryView[] = [];
  validHostelIds = new Set<string>();
  nextId = 1;

  private freshId(): string {
    return `fake-config-${this.nextId++}`;
  }

  async list(input: ConfigurationListInput): Promise<ConfigurationListResult> {
    let filtered = this.items.filter(
      (i) =>
        input.actingRole === "super_admin" ||
        i.scope === "global" ||
        i.hostelId === input.actingHostelId,
    );
    if (input.domain && input.domain.length > 0) {
      filtered = filtered.filter((i) => input.domain!.includes(i.domain as ConfigurationDomain));
    }
    if (input.scope && input.scope.length > 0) {
      filtered = filtered.filter((i) => input.scope!.includes(i.scope));
    }
    if (input.hostelId && input.hostelId.length > 0) {
      filtered = filtered.filter(
        (i) => i.hostelId !== null && input.hostelId!.includes(i.hostelId),
      );
    }
    if (input.isActive !== undefined) {
      filtered = filtered.filter((i) => i.isActive === input.isActive);
    }
    if (input.q && input.q.trim() !== "") {
      const prefix = input.q.trim().toLowerCase();
      filtered = filtered.filter(
        (i) => i.key.toLowerCase().startsWith(prefix) || i.domain.toLowerCase().startsWith(prefix),
      );
    }
    filtered.sort((a, b) => {
      const cmp = a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id);
      return input.sortDir === "asc" ? cmp : -cmp;
    });
    const total = filtered.length;
    const start = (input.page - 1) * input.pageSize;
    return {
      items: filtered.slice(start, start + input.pageSize),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  async getStatistics(
    actingRole: "hostel_admin" | "super_admin",
    actingHostelId: string | null,
  ): Promise<ConfigurationStatisticsView> {
    const visible = this.items.filter(
      (i) => actingRole === "super_admin" || i.scope === "global" || i.hostelId === actingHostelId,
    );
    const byDomain = Object.fromEntries(CONFIGURATION_DOMAINS.map((d) => [d, 0])) as Record<
      ConfigurationDomain,
      number
    >;
    let activeEntries = 0;
    let inactiveEntries = 0;
    for (const item of visible) {
      byDomain[item.domain as ConfigurationDomain] += 1;
      if (item.isActive) activeEntries += 1;
      else inactiveEntries += 1;
    }
    return { totalEntries: visible.length, activeEntries, inactiveEntries, byDomain };
  }

  async getById(
    entryId: string,
    actingRole: "hostel_admin" | "super_admin",
    actingHostelId: string | null,
  ): Promise<ConfigurationEntryView | null> {
    const item = this.items.find((i) => i.id === entryId);
    if (!item) return null;
    if (
      actingRole === "super_admin" ||
      item.scope === "global" ||
      item.hostelId === actingHostelId
    ) {
      return item;
    }
    return null;
  }

  async validateFull(input: ConfigurationValidateInput): Promise<ConfigurationValidateOutcome> {
    const keyCheck = validateKey(input.domain, input.key);
    if (!keyCheck.ok) return { kind: "invalid_key", reason: keyCheck.reason! };
    const scopeCheck = validateScopeHostelConsistency(input.scope, input.hostelId);
    if (!scopeCheck.ok) {
      return input.scope === "hostel"
        ? { kind: "hostel_required_for_scope" }
        : { kind: "hostel_not_permitted_for_scope" };
    }
    const valueCheck = validateValueShape(input.value, input.valueType);
    if (!valueCheck.ok) return { kind: "invalid_value", reason: valueCheck.reason! };
    if (input.hostelId && !this.validHostelIds.has(input.hostelId)) {
      return { kind: "invalid_hostel" };
    }
    return { kind: "valid" };
  }

  async create(input: ConfigurationCreateInput): Promise<ConfigurationCreateOutcome> {
    if (input.actingRole === "hostel_admin") {
      if (input.scope !== "hostel" || input.hostelId !== input.actingHostelId) {
        return { kind: "hostel_scope_forbidden" };
      }
    }
    const validated = await this.validateFull({
      domain: input.domain,
      key: input.key,
      value: input.value,
      valueType: input.valueType,
      scope: input.scope,
      hostelId: input.hostelId,
    });
    if (validated.kind !== "valid") {
      if (validated.kind === "invalid_hostel") return { kind: "invalid_hostel" };
      if (validated.kind === "hostel_required_for_scope")
        return { kind: "hostel_required_for_scope" };
      if (validated.kind === "hostel_not_permitted_for_scope") {
        return { kind: "hostel_not_permitted_for_scope" };
      }
      return { kind: "invalid_value" };
    }
    const duplicate = this.items.some(
      (i) =>
        i.domain === input.domain &&
        i.key === input.key &&
        i.scope === input.scope &&
        i.hostelId === input.hostelId,
    );
    if (duplicate) return { kind: "duplicate_key" };

    const now = new Date().toISOString();
    const created: ConfigurationEntryView = {
      id: this.freshId(),
      domain: input.domain,
      key: input.key,
      value: input.value,
      valueType: input.valueType,
      description: input.description,
      scope: input.scope,
      hostelId: input.hostelId,
      hostelName: input.hostelId ? "Fake Hostel" : null,
      isActive: true,
      version: 1,
      createdBy: input.actingStaffId,
      createdByName: "Fake Staff",
      updatedBy: input.actingStaffId,
      updatedByName: "Fake Staff",
      createdAt: now,
      updatedAt: now,
    };
    this.items.push(created);
    return { kind: "success", entry: created };
  }

  async update(input: ConfigurationUpdateInput): Promise<ConfigurationMutationOutcome> {
    const target = this.items.find((i) => i.id === input.entryId);
    if (!target) return { kind: "not_found" };
    if (input.actingRole === "hostel_admin") {
      if (target.scope !== "hostel" || target.hostelId !== input.actingHostelId) {
        return { kind: "hostel_scope_forbidden" };
      }
    }
    if (input.value !== undefined) {
      const valueCheck = validateValueShape(input.value, target.valueType);
      if (!valueCheck.ok) return { kind: "invalid_value" };
    }
    if (target.version !== input.expectedVersion) {
      return { kind: "stale_version", currentVersion: target.version };
    }
    if (input.value !== undefined) target.value = input.value;
    if (input.description !== undefined) target.description = input.description;
    if (input.isActive !== undefined) target.isActive = input.isActive;
    target.updatedBy = input.actingStaffId;
    target.updatedAt = new Date().toISOString();
    target.version += 1;
    return { kind: "success", entry: target };
  }
}
