/**
 * Service boundary (Prompt 0.2 §18) — interface only, no implementation.
 * No aggregation/report endpoints exist in the backend and no SDD-specified
 * report definitions exist beyond the Ch.7 §7.2 module name itself. Future
 * scope (Phase 6), not MVP (docs/reception-dashboard-architecture.md §5).
 */
export interface ReportDefinition {
  id: string;
  name: string;
}

export interface ReportService {
  list(): Promise<ReportDefinition[]>;
}
