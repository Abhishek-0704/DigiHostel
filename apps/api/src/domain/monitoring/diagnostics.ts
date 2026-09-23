import type { MonitoringRepository } from "./repository.js";
import type { DiagnosticDefinition, DiagnosticStatus } from "./types.js";

/**
 * Fixed, server-owned diagnostic allow-list (Phase 7, Prompt 18 §17/§32).
 * `diagnosticId` in the route is validated against this exact list — there
 * is no code path anywhere that maps a client-supplied string to an
 * arbitrary SQL statement, URL, shell command, or internal service call.
 * Every check below reuses `MonitoringRepository`'s already-read-only
 * methods (the same ones `GET /monitoring/overview` uses for its
 * infrastructure signals) — a diagnostic never mutates state.
 */
export interface DiagnosticDefinitionWithRunner extends DiagnosticDefinition {
  run(repository: MonitoringRepository): Promise<{ status: DiagnosticStatus; detail: string }>;
}

function fromHealthState(state: string): DiagnosticStatus {
  if (state === "healthy") return "pass";
  if (state === "unavailable" || state === "degraded" || state === "warning") return "fail";
  return "unavailable";
}

export const DIAGNOSTIC_DEFINITIONS: readonly DiagnosticDefinitionWithRunner[] = [
  {
    id: "database_connectivity",
    label: "Database Connectivity",
    description: "Runs a trivial query against the primary Postgres connection.",
    async run(repository) {
      const signal = await repository.checkDatabaseConnectivity();
      return { status: fromHealthState(signal.state), detail: signal.detail };
    },
  },
  {
    id: "supabase_auth_admin_api",
    label: "Supabase Auth Admin API Reachability",
    description: "Confirms the Supabase Auth Admin API accepts and authenticates a minimal call.",
    async run(repository) {
      const signal = await repository.checkSupabaseAuth();
      return { status: fromHealthState(signal.state), detail: signal.detail };
    },
  },
  {
    id: "realtime_publication_integrity",
    label: "Realtime Publication Integrity",
    description:
      "Verifies every table this application depends on for live updates is a member of the supabase_realtime publication.",
    async run(repository) {
      const signal = await repository.checkRealtimePublication();
      return { status: fromHealthState(signal.state), detail: signal.detail };
    },
  },
  {
    id: "staff_role_enum_integrity",
    label: "Staff Role Enum Integrity",
    description:
      "Verifies the database's staff_role enum matches this application's own known role set.",
    async run(repository) {
      const signal = await repository.checkStaffRoleEnumIntegrity();
      return { status: fromHealthState(signal.state), detail: signal.detail };
    },
  },
] as const;

export function findDiagnostic(id: string): DiagnosticDefinitionWithRunner | undefined {
  return DIAGNOSTIC_DEFINITIONS.find((d) => d.id === id);
}
