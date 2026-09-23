import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  monitoringService,
  type DiagnosticDefinition,
  type DiagnosticResult,
} from "../../services/monitoring/MonitoringService";
import { mapMonitoringError } from "./useMonitoringOverview";
import type { AppError } from "../../lib/errors/errors";

export const DIAGNOSTICS_QUERY_KEY = ["monitoring-diagnostics"] as const;

export interface DiagnosticsState {
  diagnostics: DiagnosticDefinition[];
  isLoading: boolean;
  error: AppError | null;
  results: Record<string, DiagnosticResult>;
  runningId: string | null;
  runError: AppError | null;
  run: (diagnosticId: string) => Promise<void>;
}

/**
 * Diagnostics Center (Phase 7, Prompt 18 §17). `diagnosticId` values here
 * only ever come from the server's own fixed catalog (`diagnostics` below)
 * — never client-constructed — so there is no path through this hook that
 * could submit an arbitrary string the backend hasn't already allow-listed.
 * `results` keeps every diagnostic's most recent outcome visible at once
 * (rather than replacing a single "last result" slot), matching §17's
 * "identify what it checked, identify the result" requirement for each
 * check independently.
 */
export function useDiagnostics(): DiagnosticsState {
  const [results, setResults] = useState<Record<string, DiagnosticResult>>({});
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runError, setRunError] = useState<AppError | null>(null);

  const query = useQuery({
    queryKey: DIAGNOSTICS_QUERY_KEY,
    queryFn: () => monitoringService.listDiagnostics(),
  });

  const mutation = useMutation({
    mutationFn: (diagnosticId: string) => monitoringService.runDiagnostic(diagnosticId),
  });

  async function run(diagnosticId: string) {
    setRunningId(diagnosticId);
    setRunError(null);
    try {
      const result = await mutation.mutateAsync(diagnosticId);
      setResults((prev) => ({ ...prev, [diagnosticId]: result }));
    } catch (err) {
      setRunError(mapMonitoringError(err));
    } finally {
      setRunningId(null);
    }
  }

  return {
    diagnostics: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ? mapMonitoringError(query.error) : null,
    results,
    runningId,
    runError,
    run,
  };
}
