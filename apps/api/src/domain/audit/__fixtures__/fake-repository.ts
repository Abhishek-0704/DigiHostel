import type { AuditRepository } from "../repository.js";
import type {
  AuditListInput,
  AuditListItemView,
  AuditListResult,
  AuditStatistics,
  AuditModule,
} from "../types.js";
import { AUDIT_MODULES } from "../types.js";

/**
 * In-memory fake, mirroring `FakeEmergencyRepository`'s established shape —
 * used by routes/audit.test.ts to exercise the route/auth layer without a
 * real Postgres connection. The real hostel-resolution SQL is exercised
 * separately, against real Postgres, by repository.integration.test.ts —
 * this fake performs the equivalent scoping in plain JS so route-level
 * tests can set up simple, explicit fixtures.
 */
export class FakeAuditRepository implements AuditRepository {
  items: AuditListItemView[] = [];
  staffHostels = new Map<string, string | null>();

  async list(input: AuditListInput): Promise<AuditListResult> {
    const callerHostel =
      input.staffRole === "super_admin" ? null : this.staffHostels.get(input.staffId);
    let filtered = this.items.filter((item) => {
      if (input.staffRole === "super_admin") return true;
      return item.hostelId !== null && item.hostelId === callerHostel;
    });
    if (input.modules && input.modules.length > 0) {
      filtered = filtered.filter((i) => input.modules!.includes(i.module));
    }
    if (input.actorTypes && input.actorTypes.length > 0) {
      filtered = filtered.filter((i) => input.actorTypes!.includes(i.actorType));
    }
    if (input.entityTypes && input.entityTypes.length > 0) {
      filtered = filtered.filter((i) => (input.entityTypes as string[]).includes(i.entityType));
    }
    if (input.dateFrom) {
      filtered = filtered.filter((i) => i.occurredAt >= input.dateFrom!);
    }
    if (input.dateTo) {
      filtered = filtered.filter((i) => i.occurredAt <= input.dateTo!);
    }
    if (input.q && input.q.trim() !== "") {
      const prefix = input.q.trim().toLowerCase();
      filtered = filtered.filter(
        (i) =>
          (i.studentFullName ?? "").toLowerCase().startsWith(prefix) ||
          (i.studentRollNumber ?? "").toLowerCase().startsWith(prefix) ||
          (i.actorName ?? "").toLowerCase().startsWith(prefix),
      );
    }
    filtered.sort((a, b) => {
      const cmp = a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id);
      return input.sortDir === "asc" ? cmp : -cmp;
    });
    const total = filtered.length;
    const start = (input.page - 1) * input.pageSize;
    const items = filtered.slice(start, start + input.pageSize);
    return { items, total, page: input.page, pageSize: input.pageSize };
  }

  async getStatistics(scope: {
    staffId: string;
    staffRole: "reception_warden" | "hostel_admin" | "super_admin";
  }): Promise<AuditStatistics> {
    const result = await this.list({
      staffId: scope.staffId,
      staffRole: scope.staffRole,
      page: 1,
      pageSize: 10_000,
      sortDir: "desc",
    });
    const byModule = Object.fromEntries(AUDIT_MODULES.map((m) => [m, 0])) as Record<
      AuditModule,
      number
    >;
    for (const item of result.items) {
      byModule[item.module] += 1;
    }
    return { eventsToday: result.items.length, byModule };
  }
}
