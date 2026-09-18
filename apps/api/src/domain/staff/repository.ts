import {
  and,
  asc,
  desc,
  eq,
  inArray,
  or,
  sql,
  db,
  staff,
  hostels,
  auditLogs,
  authUsers,
} from "@digihostel/db";
import type { StaffIdentityAdminPort } from "../../lib/auth/staffIdentityAdmin.js";
import type {
  StaffListInput,
  StaffListItemView,
  StaffListResult,
  StaffStatisticsView,
  StaffCreateInput,
  StaffCreateOutcome,
  StaffRoleChangeInput,
  StaffHostelChangeInput,
  StaffStatusChangeInput,
  StaffMutationOutcome,
  StaffPasswordResetInput,
  StaffForceSignOutInput,
  StaffActionOutcome,
  StaffAdminRole,
} from "./types.js";
import { STAFF_ROLES } from "./types.js";

/**
 * Repository boundary for the Identity & Access Administration Center
 * (Phase 5, Prompt 13). Runs on Fastify's own service-role Postgres
 * connection, same as every other repository (ADR-006/ADR-014) — `staff`
 * RLS (`staff_all_super_admin`) already permits every operation here for a
 * genuine super_admin session, but Fastify's connection bypasses RLS
 * entirely, so authorization is enforced HERE in application code, exactly
 * mirroring every other privileged staff repository's established
 * discipline. RLS remains the database-layer backstop for direct
 * PostgREST access (unaffected, unchanged by this feature).
 *
 * `HOSTEL_REQUIRED_ROLES`: reception_warden/hostel_admin's entire
 * authority is hostel-scoped — the existing `canAccessHostel` frontend
 * helper already documents a null hostel_id for these roles as "a data
 * anomaly... denied, not treated as unscoped." This repository refuses to
 * CREATE that anomaly in the first place, rather than merely tolerating it
 * once it exists.
 */
const HOSTEL_REQUIRED_ROLES: readonly StaffAdminRole[] = ["reception_warden", "hostel_admin"];

function toListItem(row: {
  id: string;
  fullName: string;
  email: string | null;
  role: string;
  hostelId: string | null;
  hostelName: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): StaffListItemView {
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    role: row.role as StaffAdminRole,
    hostelId: row.hostelId,
    hostelName: row.hostelName,
    status: row.status as StaffListItemView["status"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function loadOne(staffId: string): Promise<StaffListItemView | null> {
  const rows = await db
    .select({
      id: staff.id,
      fullName: staff.fullName,
      email: authUsers.email,
      role: staff.role,
      hostelId: staff.hostelId,
      hostelName: hostels.name,
      status: staff.status,
      createdAt: staff.createdAt,
      updatedAt: staff.updatedAt,
    })
    .from(staff)
    .leftJoin(authUsers, eq(authUsers.id, staff.authUserId))
    .leftJoin(hostels, eq(hostels.id, staff.hostelId))
    .where(eq(staff.id, staffId))
    .limit(1);
  return rows[0] ? toListItem(rows[0]) : null;
}

function searchCondition(query: string | undefined) {
  if (!query || query.trim() === "") return sql`true`;
  const prefix = `${query.trim()}%`;
  return sql`(lower(${staff.fullName}) like lower(${prefix}) or lower(${authUsers.email}) like lower(${prefix}))`;
}

export interface StaffRepository {
  list(input: StaffListInput): Promise<StaffListResult>;
  getStatistics(): Promise<StaffStatisticsView>;
  getById(staffId: string): Promise<StaffListItemView | null>;
  create(input: StaffCreateInput): Promise<StaffCreateOutcome>;
  changeRole(input: StaffRoleChangeInput): Promise<StaffMutationOutcome>;
  changeHostel(input: StaffHostelChangeInput): Promise<StaffMutationOutcome>;
  changeStatus(input: StaffStatusChangeInput): Promise<StaffMutationOutcome>;
  resetPassword(input: StaffPasswordResetInput): Promise<StaffActionOutcome>;
  forceSignOut(input: StaffForceSignOutInput): Promise<StaffActionOutcome>;
}

export class DrizzleStaffRepository implements StaffRepository {
  constructor(private readonly identityAdmin: StaffIdentityAdminPort) {}

  async list(input: StaffListInput): Promise<StaffListResult> {
    const conditions = [searchCondition(input.q)];
    if (input.role && input.role.length > 0) {
      conditions.push(inArray(staff.role, input.role));
    }
    if (input.status && input.status.length > 0) {
      conditions.push(inArray(staff.status, input.status));
    }
    if (input.hostelId && input.hostelId.length > 0) {
      conditions.push(inArray(staff.hostelId, input.hostelId));
    }
    const condition = and(...conditions);
    const orderFn = input.sortDir === "asc" ? asc : desc;

    const [rows, countRows] = await Promise.all([
      db
        .select({
          id: staff.id,
          fullName: staff.fullName,
          email: authUsers.email,
          role: staff.role,
          hostelId: staff.hostelId,
          hostelName: hostels.name,
          status: staff.status,
          createdAt: staff.createdAt,
          updatedAt: staff.updatedAt,
        })
        .from(staff)
        .leftJoin(authUsers, eq(authUsers.id, staff.authUserId))
        .leftJoin(hostels, eq(hostels.id, staff.hostelId))
        .where(condition)
        .orderBy(orderFn(staff.createdAt), asc(staff.id))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      db
        .select({ count: sql<string>`count(*)` })
        .from(staff)
        .leftJoin(authUsers, eq(authUsers.id, staff.authUserId))
        .where(condition),
    ]);

    return {
      items: rows.map(toListItem),
      total: Number(countRows[0]?.count ?? 0),
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  async getStatistics(): Promise<StaffStatisticsView> {
    const rows = await db
      .select({ role: staff.role, status: staff.status, count: sql<string>`count(*)` })
      .from(staff)
      .groupBy(staff.role, staff.status);

    const byRole = Object.fromEntries(STAFF_ROLES.map((r) => [r, 0])) as Record<
      StaffAdminRole,
      number
    >;
    let totalStaff = 0;
    let activeStaff = 0;
    let suspendedStaff = 0;
    for (const row of rows) {
      const count = Number(row.count);
      totalStaff += count;
      if (row.status === "active") activeStaff += count;
      else suspendedStaff += count;
      byRole[row.role as StaffAdminRole] += count;
    }
    return { totalStaff, activeStaff, suspendedStaff, byRole };
  }

  async getById(staffId: string): Promise<StaffListItemView | null> {
    return loadOne(staffId);
  }

  async create(input: StaffCreateInput): Promise<StaffCreateOutcome> {
    if (HOSTEL_REQUIRED_ROLES.includes(input.role) && !input.hostelId) {
      return { kind: "hostel_required_for_role" };
    }
    if (input.hostelId) {
      const hostelRows = await db
        .select({ id: hostels.id })
        .from(hostels)
        .where(eq(hostels.id, input.hostelId))
        .limit(1);
      if (hostelRows.length === 0) return { kind: "invalid_hostel" };
    }
    const existing = await db
      .select({ id: authUsers.id })
      .from(authUsers)
      .where(eq(authUsers.email, input.email))
      .limit(1);
    if (existing.length > 0) return { kind: "duplicate_email" };

    // The Admin API call cannot participate in the Postgres transaction
    // below — it is an external HTTP call to Supabase Auth, not a SQL
    // statement. This is the one place in this repository where a
    // partial-failure compensating action (§14) is genuinely required,
    // rather than avoidable via a single atomic transaction.
    const { authUserId } = await this.identityAdmin.inviteStaffUser(input.email);
    try {
      const inserted = await db
        .insert(staff)
        .values({
          authUserId,
          fullName: input.fullName,
          role: input.role,
          hostelId: input.hostelId,
        })
        .returning({ id: staff.id });
      const newStaffId = inserted[0]!.id;

      await writeAuditLog({
        actorType: "staff",
        actorId: input.actingStaffId,
        action: "staff.created",
        entityType: "staff",
        entityId: newStaffId,
        metadata: { role: input.role, hostelId: input.hostelId },
      });

      const created = await loadOne(newStaffId);
      return { kind: "success", staff: created! };
    } catch (err) {
      // Compensating action: the auth.users row was created but the staff
      // row insert failed (e.g. a genuine race on the unique authUserId
      // index) — delete the orphaned auth user rather than leaving an
      // identity with no staff record. Failure to compensate is logged by
      // the port itself, never thrown further (would mask the original
      // error).
      await this.identityAdmin.deleteAuthUser(authUserId).catch(() => {});
      throw err;
    }
  }

  async changeRole(input: StaffRoleChangeInput): Promise<StaffMutationOutcome> {
    if (input.targetStaffId === input.actingStaffId) return { kind: "self_target_forbidden" };
    // Fast, non-authoritative pre-transaction guard only — a friendly early
    // rejection for the common case, never trusted for the actual
    // concurrency-sensitive decision below (QG-04 remediation, F-QG04-01).
    const target = await loadOne(input.targetStaffId);
    if (!target) return { kind: "not_found" };
    if (HOSTEL_REQUIRED_ROLES.includes(input.newRole) && !target.hostelId) {
      return { kind: "hostel_required_for_role" };
    }

    const txOutcome = await db.transaction(async (tx) => {
      // F-QG04-01 fix: ONE single-query row lock, covering the target row
      // UNIONED with every currently active super_admin row, ordered
      // deterministically by id. This is the AUTHORITATIVE read — the
      // pre-transaction `target` above is stale the instant this callback
      // starts and is never used for the actual decision below.
      //
      // This single-query shape is deliberate, not incidental: an EARLIER
      // version of this fix issued two SEPARATE `FOR UPDATE` queries (lock
      // the target row, THEN separately lock the active-super_admin set)
      // and was found, by this remediation's own real-Postgres concurrency
      // test, to deadlock — two transactions each already holding their
      // own target row's lock while trying to ALSO acquire a row the OTHER
      // transaction already holds is the textbook lock-order-inversion
      // deadlock, and Postgres correctly detected and aborted one side
      // with a raw `40P01` error. A single query that locks the FULL
      // relevant row set at once, in one consistent `ORDER BY id`, cannot
      // deadlock this way: two concurrent transactions targeting the last
      // two active super_admins both resolve to the IDENTICAL row set
      // (each target is itself a member of "every active super_admin"),
      // so both transactions request the same rows in the same order —
      // whichever transaction's query executes first simply acquires all
      // needed locks; the second blocks entirely until the first commits,
      // then re-reads the now-committed state under its own lock
      // acquisition. This is what actually prevents the race the pre-
      // transaction COUNT alone could not: without it, two requests each
      // targeting a different one of the last two active super_admins
      // could both observe "1 other active super_admin" simultaneously
      // and both commit, leaving zero.
      const lockedRows = await tx
        .select({ id: staff.id, role: staff.role, status: staff.status })
        .from(staff)
        .where(
          or(
            eq(staff.id, input.targetStaffId),
            and(eq(staff.role, "super_admin"), eq(staff.status, "active")),
          ),
        )
        .orderBy(asc(staff.id))
        .for("update");
      const lockedTarget = lockedRows.find((r) => r.id === input.targetStaffId);
      if (!lockedTarget) return { kind: "not_found" as const };

      if (
        lockedTarget.role === "super_admin" &&
        input.newRole !== "super_admin" &&
        lockedTarget.status === "active"
      ) {
        const others = lockedRows.filter(
          (r) => r.role === "super_admin" && r.status === "active" && r.id !== input.targetStaffId,
        ).length;
        if (others === 0) return { kind: "last_super_admin_protected" as const };
      }

      await tx.update(staff).set({ role: input.newRole }).where(eq(staff.id, input.targetStaffId));
      await tx.insert(auditLogs).values({
        actorType: "staff",
        actorId: input.actingStaffId,
        action: "staff.role_changed",
        entityType: "staff",
        entityId: input.targetStaffId,
        metadata: { fromRole: lockedTarget.role, toRole: input.newRole },
      });
      return { kind: "success" as const };
    });

    if (txOutcome.kind !== "success") return txOutcome;
    const updated = await loadOne(input.targetStaffId);
    return { kind: "success", staff: updated! };
  }

  async changeHostel(input: StaffHostelChangeInput): Promise<StaffMutationOutcome> {
    if (input.targetStaffId === input.actingStaffId) return { kind: "self_target_forbidden" };
    const target = await loadOne(input.targetStaffId);
    if (!target) return { kind: "not_found" };
    if (HOSTEL_REQUIRED_ROLES.includes(target.role) && !input.newHostelId) {
      return { kind: "hostel_required_for_role" };
    }
    if (input.newHostelId) {
      const hostelRows = await db
        .select({ id: hostels.id })
        .from(hostels)
        .where(eq(hostels.id, input.newHostelId))
        .limit(1);
      if (hostelRows.length === 0) return { kind: "invalid_hostel" };
    }

    await db.transaction(async (tx) => {
      await tx
        .update(staff)
        .set({ hostelId: input.newHostelId })
        .where(eq(staff.id, input.targetStaffId));
      await tx.insert(auditLogs).values({
        actorType: "staff",
        actorId: input.actingStaffId,
        action: "staff.hostel_changed",
        entityType: "staff",
        entityId: input.targetStaffId,
        metadata: { fromHostelId: target.hostelId, toHostelId: input.newHostelId },
      });
    });

    const updated = await loadOne(input.targetStaffId);
    return { kind: "success", staff: updated! };
  }

  async changeStatus(input: StaffStatusChangeInput): Promise<StaffMutationOutcome> {
    if (input.targetStaffId === input.actingStaffId) return { kind: "self_target_forbidden" };
    // Fast, non-authoritative pre-transaction guard only — see changeRole()'s
    // identical comment (QG-04 remediation, F-QG04-01).
    const target = await loadOne(input.targetStaffId);
    if (!target) return { kind: "not_found" };

    const txOutcome = await db.transaction(async (tx) => {
      // F-QG04-01 fix — see changeRole()'s identical, fully-commented
      // single-query lock pattern above (including why a two-step
      // lock-the-target-then-lock-the-set approach deadlocks and this
      // one-shot unioned query does not).
      const lockedRows = await tx
        .select({ id: staff.id, role: staff.role, status: staff.status })
        .from(staff)
        .where(
          or(
            eq(staff.id, input.targetStaffId),
            and(eq(staff.role, "super_admin"), eq(staff.status, "active")),
          ),
        )
        .orderBy(asc(staff.id))
        .for("update");
      const lockedTarget = lockedRows.find((r) => r.id === input.targetStaffId);
      if (!lockedTarget) return { kind: "not_found" as const };

      if (
        lockedTarget.role === "super_admin" &&
        input.newStatus === "suspended" &&
        lockedTarget.status === "active"
      ) {
        const others = lockedRows.filter(
          (r) => r.role === "super_admin" && r.status === "active" && r.id !== input.targetStaffId,
        ).length;
        if (others === 0) return { kind: "last_super_admin_protected" as const };
      }

      await tx
        .update(staff)
        .set({ status: input.newStatus })
        .where(eq(staff.id, input.targetStaffId));
      await tx.insert(auditLogs).values({
        actorType: "staff",
        actorId: input.actingStaffId,
        action: input.newStatus === "suspended" ? "staff.suspended" : "staff.reactivated",
        entityType: "staff",
        entityId: input.targetStaffId,
        metadata: { fromStatus: lockedTarget.status, toStatus: input.newStatus },
      });
      return { kind: "success" as const };
    });

    if (txOutcome.kind !== "success") return txOutcome;
    const updated = await loadOne(input.targetStaffId);
    return { kind: "success", staff: updated! };
  }

  async resetPassword(input: StaffPasswordResetInput): Promise<StaffActionOutcome> {
    if (input.targetStaffId === input.actingStaffId) return { kind: "self_target_forbidden" };
    const target = await loadOne(input.targetStaffId);
    if (!target || !target.email) return { kind: "not_found" };

    await this.identityAdmin.sendPasswordResetEmail(target.email);
    await writeAuditLog({
      actorType: "staff",
      actorId: input.actingStaffId,
      action: "staff.password_reset_triggered",
      entityType: "staff",
      entityId: input.targetStaffId,
      metadata: {},
    });
    return { kind: "success" };
  }

  /**
   * QG-04 remediation, F-QG04-02: redesigned from a broken Supabase Admin
   * API call (`auth.admin.signOut(authUserId, "global")` — that SDK method
   * requires a session access-token JWT, which this backend never has for
   * an already-issued staff session; no user-id-keyed equivalent exists in
   * the installed Admin API surface, see migration 0023's header comment
   * for the full evidence) into a genuine, fully backend-owned,
   * DB-verified session-invalidation mechanism.
   *
   * Now a plain, atomic DB-only mutation — moved to the SAME
   * transactional-inline audit convention `changeRole`/`changeHostel`/
   * `changeStatus` already use above, rather than the fire-and-forget
   * external-API convention this method previously needed. This also
   * directly satisfies the "failure must not produce a false success audit
   * record" requirement: if the UPDATE fails for any reason, the whole
   * transaction (including the audit insert) rolls back — there is no
   * window where an audit row exists without the actual invalidation
   * having committed, unlike the old fire-and-forget-after-an-external-call
   * shape.
   */
  async forceSignOut(input: StaffForceSignOutInput): Promise<StaffActionOutcome> {
    if (input.targetStaffId === input.actingStaffId) return { kind: "self_target_forbidden" };

    const txOutcome = await db.transaction(async (tx) => {
      const lockedRows = await tx
        .select({ id: staff.id })
        .from(staff)
        .where(eq(staff.id, input.targetStaffId))
        .for("update");
      if (lockedRows.length === 0) return { kind: "not_found" as const };

      await tx
        .update(staff)
        .set({ sessionsInvalidatedBefore: new Date() })
        .where(eq(staff.id, input.targetStaffId));
      await tx.insert(auditLogs).values({
        actorType: "staff",
        actorId: input.actingStaffId,
        action: "staff.force_signed_out",
        entityType: "staff",
        entityId: input.targetStaffId,
        metadata: {},
      });
      return { kind: "success" as const };
    });

    return txOutcome;
  }
}

/** Fire-and-forget audit write, mirroring `staffAuthAudit.ts`'s established
 * "a write failure must never block or fail a security decision that has
 * already been made" pattern — used here for the two mutations that
 * involve an external Admin API call (create, resetPassword, forceSignOut),
 * where the primary action has ALREADY succeeded by the time this runs.
 * The three purely-internal mutations (role/hostel/status) instead write
 * their audit row INSIDE the same DB transaction as the state change
 * (see above) — the stronger, transactional-inline convention
 * leave/emergency/health already established, used here wherever the
 * operation is DB-only and can genuinely be atomic. */
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
    // Deliberately swallowed — matches the established fire-and-forget
    // audit convention; a logging failure must never surface as a failure
    // of the (already-succeeded) administrative action itself.
  }
}
