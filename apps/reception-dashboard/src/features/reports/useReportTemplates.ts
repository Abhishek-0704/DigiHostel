import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  reportService,
  type ReportTemplate,
  type ReportTemplateCreateRequest,
  type ReportTemplateUpdateRequest,
} from "../../services/reports/ReportService";
import { AppError } from "../../lib/errors/errors";
import { mapReportsError } from "./useReportCatalog";

export const REPORT_TEMPLATES_QUERY_KEY = ["reports-templates"] as const;

export interface ReportTemplatesState {
  templates: ReportTemplate[];
  isLoading: boolean;
  error: AppError | null;
  refresh: () => Promise<void>;
  create: (request: ReportTemplateCreateRequest) => Promise<ReportTemplate>;
  update: (templateId: string, request: ReportTemplateUpdateRequest) => Promise<ReportTemplate>;
  remove: (templateId: string) => Promise<void>;
}

/** The caller's own saved report templates (Phase 6, Prompt 16 §15) —
 * personal, never organization-wide/shared. Favourites are the same
 * template row with `isFavorite: true`, not a second query. */
export function useReportTemplates(): ReportTemplatesState {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: REPORT_TEMPLATES_QUERY_KEY,
    queryFn: async () => (await reportService.listTemplates()).templates,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: REPORT_TEMPLATES_QUERY_KEY });
  }, [queryClient]);

  const create = useCallback(
    async (request: ReportTemplateCreateRequest) => {
      const template = await reportService.createTemplate(request);
      await refresh();
      return template;
    },
    [refresh],
  );

  const update = useCallback(
    async (templateId: string, request: ReportTemplateUpdateRequest) => {
      const template = await reportService.updateTemplate(templateId, request);
      await refresh();
      return template;
    },
    [refresh],
  );

  const remove = useCallback(
    async (templateId: string) => {
      await reportService.deleteTemplate(templateId);
      await refresh();
    },
    [refresh],
  );

  return {
    templates: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ? mapReportsError(query.error) : null,
    refresh,
    create,
    update,
    remove,
  };
}
