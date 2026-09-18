import { useQuery } from "@tanstack/react-query";
import { configurationService } from "../../services/configuration/ConfigurationService";
import type { ConfigurationDomain } from "@digihostel/api-client-react";

export const CONFIGURATION_DOMAINS_QUERY_KEY = ["configuration-domains"] as const;

/** The real, server-owned domain allow-list — never a hard-coded frontend
 * copy (`GET /configuration/domains`'s own doc comment). Effectively
 * static, so a long `staleTime` avoids re-fetching it on every page visit. */
export function useConfigurationDomains(): {
  domains: ConfigurationDomain[];
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: CONFIGURATION_DOMAINS_QUERY_KEY,
    queryFn: () => configurationService.listDomains(),
    staleTime: 10 * 60 * 1000,
  });
  return { domains: query.data ?? [], isLoading: query.isLoading };
}
