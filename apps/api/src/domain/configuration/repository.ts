import {
  and,
  asc,
  desc,
  eq,
  inArray,
  sql,
  db,
  alias,
  configurationEntries,
  hostels,
  staff,
  auditLogs,
} from "@digihostel/db";
import { validateKey, validateValueShape, validateScopeHostelConsistency } from "./validation.js";
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
} from "./types.js";
import { CONFIGURATION_DOMAINS } from "./types.js";

/**
 * Repository boundary for the Enterprise Configuration Center (Phase 5,
 * Prompt 14). Runs on Fastify's own service-role Postgres connection
 * (ADR-006/ADR-014) — `configuration_entries` has ZERO client-facing RLS by
 * design (mirrors `audit_logs`), so every authorization decision (role,
 * hostel scope) is enforced HERE in application code, exactly mirroring
 * `domain/staff/repository.ts`'s established discipline for the same class
 * of privileged, RLS-empty table.
 *
 * Hostel-scope enforcement: a `hostel_admin` acting caller may only create
 * or edit an entry whose `scope = 'hostel'` AND `hostelId` equals their OWN
 * resolved `staff.hostel_id` (never a client-supplied value) — they may
 * never create/edit a GLOBAL entry, and never another hostel's entry. A
 * `super_admin` acting caller is unscoped (may create/edit global or any
 * hostel's entries) — mirrors `hostelScopedForStaff`'s established
 * "`actingRole === 'super_admin' ? true : <own-hostel check>`" shape used
 * throughout `domain/leave/repository.ts`, adapted here to a column this
 * table already carries directly (`hostelId`) rather than one requiring a
 * join through `students`.
 */
const createdByStaff = alias(staff, "created_by_staff");
const updatedByStaff = alias(staff, "updated_by_staff");

function toView(row: {
  id: string;
  domain: string;
  key: string;
  value: unknown;
  valueType: string;
  description: string | null;
  scope: string;
  hostelId: string | null;
  hostelName: string | null;
  isActive: boolean;
  version: number;
  createdBy: string | null;
  createdByName: string | null;
  updatedBy: string | null;
  updatedByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ConfigurationEntryView {
  return {
    id: row.id,
    domain: row.domain,
    key: row.key,
    value: row.value,
    valueType: row.valueType as ConfigurationEntryView["valueType"],
    description: row.description,
    scope: row.scope as ConfigurationEntryView["scope"],
    hostelId: row.hostelId,
    hostelName: row.hostelName,
    isActive: row.isActive,
    version: row.version,
    createdBy: row.createdBy,
    createdByName: row.createdByName,
    updatedBy: row.updatedBy,
    updatedByName: row.updatedByName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const baseSelect = {
  id: configurationEntries.id,
  domain: configurationEntries.domain,
  key: configurationEntries.key,
  value: configurationEntries.value,
  valueType: configurationEntries.valueType,
  description: configurationEntries.description,
  scope: configurationEntries.scope,
  hostelId: configurationEntries.hostelId,
  hostelName: hostels.name,
  isActive: configurationEntries.isActive,
  version: configurationEntries.version,
  createdBy: configurationEntries.createdBy,
  createdByName: createdByStaff.fullName,
  updatedBy: configurationEntries.updatedBy,
  updatedByName: updatedByStaff.fullName,
  createdAt: configurationEntries.createdAt,
  updatedAt: configurationEntries.updatedAt,
};

/** `actingRole === 'super_admin'` sees everything; a `hostel_admin` sees
 * every GLOBAL entry plus only their OWN hostel's entries — never another
 * hostel's. Read access is deliberately broader than write access (a
 * hostel_admin may usefully SEE a global setting even though they cannot
 * change it), matching this codebase's general "read is often less
 * restrictive than write" pattern (e.g. `hostels_select_authenticated` vs.
 * `hostels_all_super_admin`). */
function readScopeCondition(
  actingRole: "hostel_admin" | "super_admin",
  actingHostelId: string | null,
) {
  if (actingRole === "super_admin") return sql`true`;
  return sql`(${configurationEntries.scope} = 'global' or ${configurationEntries.hostelId} = ${actingHostelId})`;
}

async function loadOne(entryId: string): Promise<ConfigurationEntryView | null> {
  const rows = await db
    .select(baseSelect)
    .from(configurationEntries)
    .leftJoin(hostels, eq(hostels.id, configurationEntries.hostelId))
    .leftJoin(createdByStaff, eq(createdByStaff.id, configurationEntries.createdBy))
    .leftJoin(updatedByStaff, eq(updatedByStaff.id, configurationEntries.updatedBy))
    .where(eq(configurationEntries.id, entryId))
    .limit(1);
  return rows[0] ? toView(rows[0]) : null;
}

function searchCondition(query: string | undefined) {
  if (!query || query.trim() === "") return sql`true`;
  const prefix = `${query.trim()}%`;
  return sql`(lower(${configurationEntries.key}) like lower(${prefix}) or lower(${configurationEntries.domain}) like lower(${prefix}))`;
}

export interface ConfigurationRepository {
  list(input: ConfigurationListInput): Promise<ConfigurationListResult>;
  getStatistics(
    actingRole: "hostel_admin" | "super_admin",
    actingHostelId: string | null,
  ): Promise<ConfigurationStatisticsView>;
  getById(
    entryId: string,
    actingRole: "hostel_admin" | "super_admin",
    actingHostelId: string | null,
  ): Promise<ConfigurationEntryView | null>;
  create(input: ConfigurationCreateInput): Promise<ConfigurationCreateOutcome>;
  update(input: ConfigurationUpdateInput): Promise<ConfigurationMutationOutcome>;
  validateFull(input: ConfigurationValidateInput): Promise<ConfigurationValidateOutcome>;
}

export class DrizzleConfigurationRepository implements ConfigurationRepository {
  async list(input: ConfigurationListInput): Promise<ConfigurationListResult> {
    const conditions = [
      readScopeCondition(input.actingRole, input.actingHostelId),
      searchCondition(input.q),
    ];
    if (input.domain && input.domain.length > 0) {
      conditions.push(inArray(configurationEntries.domain, input.domain));
    }
    if (input.scope && input.scope.length > 0) {
      conditions.push(inArray(configurationEntries.scope, input.scope));
    }
    if (input.hostelId && input.hostelId.length > 0) {
      conditions.push(inArray(configurationEntries.hostelId, input.hostelId));
    }
    if (input.isActive !== undefined) {
      conditions.push(eq(configurationEntries.isActive, input.isActive));
    }
    const condition = and(...conditions);
    const orderFn = input.sortDir === "asc" ? asc : desc;

    const [rows, countRows] = await Promise.all([
      db
        .select(baseSelect)
        .from(configurationEntries)
        .leftJoin(hostels, eq(hostels.id, configurationEntries.hostelId))
        .leftJoin(createdByStaff, eq(createdByStaff.id, configurationEntries.createdBy))
        .leftJoin(updatedByStaff, eq(updatedByStaff.id, configurationEntries.updatedBy))
        .where(condition)
        .orderBy(orderFn(configurationEntries.updatedAt), asc(configurationEntries.id))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      db
        .select({ count: sql<string>`count(*)` })
        .from(configurationEntries)
        .where(condition),
    ]);

    return {
      items: rows.map(toView),
      total: Number(countRows[0]?.count ?? 0),
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  async getStatistics(
    actingRole: "hostel_admin" | "super_admin",
    actingHostelId: string | null,
  ): Promise<ConfigurationStatisticsView> {
    const rows = await db
      .select({
        domain: configurationEntries.domain,
        isActive: configurationEntries.isActive,
        count: sql<string>`count(*)`,
      })
      .from(configurationEntries)
      .where(readScopeCondition(actingRole, actingHostelId))
      .groupBy(configurationEntries.domain, configurationEntries.isActive);

    const byDomain = Object.fromEntries(CONFIGURATION_DOMAINS.map((d) => [d, 0])) as Record<
      ConfigurationDomain,
      number
    >;
    let totalEntries = 0;
    let activeEntries = 0;
    let inactiveEntries = 0;
    for (const row of rows) {
      const count = Number(row.count);
      totalEntries += count;
      if (row.isActive) activeEntries += count;
      else inactiveEntries += count;
      if (row.domain in byDomain) byDomain[row.domain as ConfigurationDomain] += count;
    }
    return { totalEntries, activeEntries, inactiveEntries, byDomain };
  }

  async getById(
    entryId: string,
    actingRole: "hostel_admin" | "super_admin",
    actingHostelId: string | null,
  ): Promise<ConfigurationEntryView | null> {
    const rows = await db
      .select(baseSelect)
      .from(configurationEntries)
      .leftJoin(hostels, eq(hostels.id, configurationEntries.hostelId))
      .leftJoin(createdByStaff, eq(createdByStaff.id, configurationEntries.createdBy))
      .leftJoin(updatedByStaff, eq(updatedByStaff.id, configurationEntries.updatedBy))
      .where(
        and(eq(configurationEntries.id, entryId), readScopeCondition(actingRole, actingHostelId)),
      )
      .limit(1);
    return rows[0] ? toView(rows[0]) : null;
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

    if (input.hostelId) {
      const hostelRows = await db
        .select({ id: hostels.id })
        .from(hostels)
        .where(eq(hostels.id, input.hostelId))
        .limit(1);
      if (hostelRows.length === 0) return { kind: "invalid_hostel" };
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
    if (validated.kind === "invalid_key") return { kind: "invalid_value" };
    if (validated.kind === "invalid_value") return { kind: "invalid_value" };
    if (validated.kind === "invalid_hostel") return { kind: "invalid_hostel" };
    if (validated.kind === "hostel_required_for_scope")
      return { kind: "hostel_required_for_scope" };
    if (validated.kind === "hostel_not_permitted_for_scope") {
      return { kind: "hostel_not_permitted_for_scope" };
    }

    const duplicateCondition =
      input.scope === "global"
        ? and(
            eq(configurationEntries.domain, input.domain),
            eq(configurationEntries.key, input.key),
            eq(configurationEntries.scope, "global"),
          )
        : and(
            eq(configurationEntries.domain, input.domain),
            eq(configurationEntries.key, input.key),
            eq(configurationEntries.scope, "hostel"),
            eq(configurationEntries.hostelId, input.hostelId!),
          );
    const existing = await db
      .select({ id: configurationEntries.id })
      .from(configurationEntries)
      .where(duplicateCondition)
      .limit(1);
    if (existing.length > 0) return { kind: "duplicate_key" };

    const inserted = await db
      .insert(configurationEntries)
      .values({
        domain: input.domain,
        key: input.key,
        value: input.value,
        valueType: input.valueType,
        description: input.description,
        scope: input.scope,
        hostelId: input.hostelId,
        createdBy: input.actingStaffId,
        updatedBy: input.actingStaffId,
      })
      .returning({ id: configurationEntries.id });
    const newId = inserted[0]!.id;

    await writeAuditLog({
      actorType: "staff",
      actorId: input.actingStaffId,
      action: "configuration.created",
      entityType: "configuration_entries",
      entityId: newId,
      metadata: {
        domain: input.domain,
        key: input.key,
        scope: input.scope,
        hostelId: input.hostelId,
        valueType: input.valueType,
      },
    });

    const created = await loadOne(newId);
    return { kind: "success", entry: created! };
  }

  async update(input: ConfigurationUpdateInput): Promise<ConfigurationMutationOutcome> {
    const target = await loadOne(input.entryId);
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

    const updates: Record<string, unknown> = {
      updatedBy: input.actingStaffId,
      updatedAt: new Date(),
      version: target.version + 1,
    };
    if (input.value !== undefined) updates.value = input.value;
    if (input.description !== undefined) updates.description = input.description;
    if (input.isActive !== undefined) updates.isActive = input.isActive;

    const result = await db.transaction(async (tx) => {
      const updatedRows = await tx
        .update(configurationEntries)
        .set(updates)
        .where(
          and(
            eq(configurationEntries.id, input.entryId),
            eq(configurationEntries.version, target.version),
          ),
        )
        .returning({ id: configurationEntries.id });
      if (updatedRows.length === 0) return null;

      let action = "configuration.updated";
      if (input.isActive === false) action = "configuration.deactivated";
      else if (input.isActive === true) action = "configuration.activated";

      await tx.insert(auditLogs).values({
        actorType: "staff",
        actorId: input.actingStaffId,
        action,
        entityType: "configuration_entries",
        entityId: input.entryId,
        metadata: {
          domain: target.domain,
          key: target.key,
          before: {
            value: target.value,
            description: target.description,
            isActive: target.isActive,
          },
          after: {
            value: input.value !== undefined ? input.value : target.value,
            description: input.description !== undefined ? input.description : target.description,
            isActive: input.isActive !== undefined ? input.isActive : target.isActive,
          },
        },
      });
      return updatedRows[0]!.id;
    });

    // The conditional UPDATE's WHERE clause races the same way
    // `markExpired()`/`authorizeExit()` already established (Prompt 7C) — a
    // concurrent writer could have changed the version between our read
    // above and this UPDATE; re-check here rather than trusting the
    // pre-check alone (the same "recheck after the atomic operation, don't
    // just trust an earlier read" discipline the leave domain already
    // proved necessary under real concurrency).
    if (result === null) {
      const current = await loadOne(input.entryId);
      return { kind: "stale_version", currentVersion: current?.version ?? target.version };
    }

    const updated = await loadOne(input.entryId);
    return { kind: "success", entry: updated! };
  }
}

async function writeAuditLog(entry: {
  actorType: "staff";
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(auditLogs).values(entry);
  } catch {
    // Deliberately swallowed for the CREATE path only — matches
    // `domain/staff/repository.ts`'s identical fire-and-forget convention
    // for a mutation that cannot be made transactionally atomic with its
    // audit write for another reason (there, an external Admin API call;
    // here, none — but consistency with the established convention is kept
    // since `create()`'s own primary action has already durably succeeded
    // by the time this runs, exactly matching the established "a logging
    // failure must never surface as a failure of an already-succeeded
    // action" rule). `update()` above instead writes its audit row INSIDE
    // the same transaction as the state change, since that mutation IS a
    // pure DB operation with no external call blocking atomicity — the
    // stronger, transactional-inline convention this codebase prefers
    // whenever it's achievable.
  }
}
