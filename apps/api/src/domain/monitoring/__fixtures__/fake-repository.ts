import type { MonitoringRepository } from "../repository.js";
import type { HealthSignal, HealthState } from "../types.js";

function signal(id: string, label: string, state: HealthState, detail: string): HealthSignal {
  return { id, label, state, detail, measuredAt: new Date().toISOString(), latencyMs: 1 };
}

/** In-memory double for route/service unit tests — every check is
 * independently overridable so a test can force a specific health state
 * without a real database/Supabase Admin API. */
export class FakeMonitoringRepository implements MonitoringRepository {
  databaseState: HealthState = "healthy";
  supabaseAuthState: HealthState = "healthy";
  realtimeState: HealthState = "healthy";
  staffRoleEnumState: HealthState = "healthy";
  auditCounts = new Map<string, number>();
  suspendedStaffCount = 0;

  async checkDatabaseConnectivity(): Promise<HealthSignal> {
    return signal("database", "Database", this.databaseState, "Connected");
  }

  async checkSupabaseAuth(): Promise<HealthSignal> {
    return signal("supabase-auth", "Supabase Auth", this.supabaseAuthState, "Admin API reachable");
  }

  async checkRealtimePublication(): Promise<HealthSignal> {
    return signal(
      "realtime-publication",
      "Realtime Publication",
      this.realtimeState,
      "All expected tables present",
    );
  }

  async checkStaffRoleEnumIntegrity(): Promise<HealthSignal> {
    return signal(
      "staff-role-enum",
      "Staff Role Enum Integrity",
      this.staffRoleEnumState,
      "Database enum matches application role set",
    );
  }

  async countRecentAuditAction(action: string): Promise<number> {
    return this.auditCounts.get(action) ?? 0;
  }

  async countRecentAuditActions(actions: string[]): Promise<number> {
    return actions.reduce((sum, a) => sum + (this.auditCounts.get(a) ?? 0), 0);
  }

  async countSuspendedStaff(): Promise<number> {
    return this.suspendedStaffCount;
  }
}
