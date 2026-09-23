import { sql, db } from "@digihostel/db";
import type { SupabaseAuthProbePort } from "./authProbe.js";
import type { HealthSignal, HealthState } from "./types.js";

/** Tables this codebase has deliberately added to the `supabase_realtime`
 * publication (F-08, F-QG02-04, and every business-table subscription
 * built since — see `docs/current-state.md`). A fixed, hand-maintained
 * list, not derived automatically, so a genuine regression (a migration
 * accidentally dropping a table from the publication) is detected rather
 * than the check silently re-deriving "whatever is currently there" as its
 * own baseline. */
export const EXPECTED_REALTIME_TABLES = [
  "leave_requests",
  "leave_approval_events",
  "leave_exit_authorizations",
  "movements",
  "notifications",
  "security_incidents",
  "security_incident_events",
  "health_cases",
  "health_case_events",
] as const;

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; latencyMs: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, latencyMs: Date.now() - start };
}

/** Bounded execution — a hung dependency must produce a timely `unavailable`
 * signal, never a request that never resolves (Prompt 18 §17.7/§32). */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

const DIAGNOSTIC_TIMEOUT_MS = 5_000;

export interface MonitoringRepository {
  checkDatabaseConnectivity(): Promise<HealthSignal>;
  checkSupabaseAuth(): Promise<HealthSignal>;
  checkRealtimePublication(): Promise<HealthSignal>;
  checkStaffRoleEnumIntegrity(): Promise<HealthSignal>;
  countRecentAuditAction(action: string, sinceIso: string): Promise<number>;
  countRecentAuditActions(actions: string[], sinceIso: string): Promise<number>;
  countSuspendedStaff(): Promise<number>;
}

/**
 * Read-only signal-gathering layer for the Enterprise Operations Monitoring
 * Center (Phase 7, Prompt 18). Every method here performs a genuine,
 * directly-measured check — no fabricated value, no invented percentage
 * (§38's explicit "no fake infrastructure" rule). Shared by both
 * `GET /monitoring/overview`'s infrastructure signals and
 * `POST /monitoring/diagnostics/{id}/run`'s allow-listed checks, so the two
 * surfaces can never silently disagree about what a given check found.
 */
export class DrizzleMonitoringRepository implements MonitoringRepository {
  constructor(private readonly authProbe: SupabaseAuthProbePort | null) {}

  async checkDatabaseConnectivity(): Promise<HealthSignal> {
    const measuredAt = new Date().toISOString();
    try {
      const { latencyMs } = await timed(() =>
        withTimeout(db.execute(sql`select 1`), DIAGNOSTIC_TIMEOUT_MS),
      );
      const state: HealthState = latencyMs > 1_000 ? "degraded" : "healthy";
      return {
        id: "database",
        label: "Database",
        state,
        detail: state === "healthy" ? "Connected" : `Slow response (${latencyMs}ms)`,
        measuredAt,
        latencyMs,
      };
    } catch {
      return {
        id: "database",
        label: "Database",
        state: "unavailable",
        detail: "Connectivity check failed",
        measuredAt,
        latencyMs: null,
      };
    }
  }

  async checkSupabaseAuth(): Promise<HealthSignal> {
    const measuredAt = new Date().toISOString();
    if (!this.authProbe) {
      return {
        id: "supabase-auth",
        label: "Supabase Auth",
        state: "unknown",
        detail: "Admin API credentials not configured in this environment",
        measuredAt,
        latencyMs: null,
      };
    }
    try {
      const { latencyMs } = await timed(() =>
        withTimeout(this.authProbe!.ping(), DIAGNOSTIC_TIMEOUT_MS),
      );
      return {
        id: "supabase-auth",
        label: "Supabase Auth",
        state: "healthy",
        detail: "Admin API reachable",
        measuredAt,
        latencyMs,
      };
    } catch {
      return {
        id: "supabase-auth",
        label: "Supabase Auth",
        state: "unavailable",
        detail: "Admin API check failed",
        measuredAt,
        latencyMs: null,
      };
    }
  }

  async checkRealtimePublication(): Promise<HealthSignal> {
    const measuredAt = new Date().toISOString();
    try {
      const { result: rows, latencyMs } = await timed(() =>
        withTimeout(
          db.execute<{ tablename: string }>(
            sql`select tablename from pg_publication_tables where pubname = 'supabase_realtime'`,
          ),
          DIAGNOSTIC_TIMEOUT_MS,
        ),
      );
      const present = new Set(rows.map((r) => r.tablename));
      const missing = EXPECTED_REALTIME_TABLES.filter((t) => !present.has(t));
      if (missing.length === 0) {
        return {
          id: "realtime-publication",
          label: "Realtime Publication",
          state: "healthy",
          detail: `All ${EXPECTED_REALTIME_TABLES.length} expected tables present`,
          measuredAt,
          latencyMs,
        };
      }
      return {
        id: "realtime-publication",
        label: "Realtime Publication",
        state: "degraded",
        detail: `Missing from publication: ${missing.join(", ")}`,
        measuredAt,
        latencyMs,
      };
    } catch {
      return {
        id: "realtime-publication",
        label: "Realtime Publication",
        state: "unavailable",
        detail: "Publication membership check failed",
        measuredAt,
        latencyMs: null,
      };
    }
  }

  async checkStaffRoleEnumIntegrity(): Promise<HealthSignal> {
    const measuredAt = new Date().toISOString();
    const expected = ["reception_warden", "hostel_admin", "library_incharge", "super_admin"];
    try {
      const { result: rows, latencyMs } = await timed(() =>
        withTimeout(
          db.execute<{ enumlabel: string }>(
            sql`select enumlabel from pg_enum where enumtypid = 'staff_role'::regtype`,
          ),
          DIAGNOSTIC_TIMEOUT_MS,
        ),
      );
      const actual = new Set(rows.map((r) => r.enumlabel));
      const missing = expected.filter((e) => !actual.has(e));
      const unexpected = [...actual].filter((e) => !expected.includes(e));
      if (missing.length === 0 && unexpected.length === 0) {
        return {
          id: "staff-role-enum",
          label: "Staff Role Enum Integrity",
          state: "healthy",
          detail: "Database enum matches application role set",
          measuredAt,
          latencyMs,
        };
      }
      return {
        id: "staff-role-enum",
        label: "Staff Role Enum Integrity",
        state: "warning",
        detail: `Mismatch — missing: [${missing.join(", ")}], unexpected: [${unexpected.join(", ")}]`,
        measuredAt,
        latencyMs,
      };
    } catch {
      return {
        id: "staff-role-enum",
        label: "Staff Role Enum Integrity",
        state: "unavailable",
        detail: "Enum check failed",
        measuredAt,
        latencyMs: null,
      };
    }
  }

  async countRecentAuditAction(action: string, sinceIso: string): Promise<number> {
    return this.countRecentAuditActions([action], sinceIso);
  }

  async countRecentAuditActions(actions: string[], sinceIso: string): Promise<number> {
    if (actions.length === 0) return 0;
    const rows = await db.execute<{ count: string }>(sql`
      select count(*) as count from audit_logs
      where action in (${sql.join(actions, sql`, `)}) and occurred_at >= ${sinceIso}
    `);
    return Number(rows[0]?.count ?? 0);
  }

  /** A direct, read-only count against `staff` — deliberately NOT routed
   * through `StaffAdminService`/`DrizzleStaffRepository`, which requires a
   * live Supabase Auth Admin API client (a real service-role credential)
   * just to construct, even though this figure needs nothing from that
   * API. Reusing it here would make the whole Monitoring Center's
   * registration fail whenever Admin API credentials are absent — exactly
   * the kind of unconditional external dependency §5/§38 warn against for
   * a signal this database can already answer directly. */
  async countSuspendedStaff(): Promise<number> {
    const rows = await db.execute<{ count: string }>(
      sql`select count(*) as count from staff where status = 'suspended'`,
    );
    return Number(rows[0]?.count ?? 0);
  }
}
