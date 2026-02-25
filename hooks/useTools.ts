import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLeaderRefetchInterval } from "@/hooks/useLeaderRefetchInterval";
import type { ToolInfo } from "@/types/tools";
import type { ConfigProvider } from "@/types/provider";
export type { ToolInfo } from "@/types/tools";

const TOOLS_KEY = "tools";

interface UseToolsOptions {
  refetchIntervalMs?: number | false;
  refetchOnWindowFocus?: boolean;
}

export function useTools(
  provider: ConfigProvider = "claude",
  options?: UseToolsOptions,
) {
  const pollIntervalMs =
    typeof options?.refetchIntervalMs === "number"
      ? options.refetchIntervalMs
      : 30_000;
  const leaderRefetchInterval = useLeaderRefetchInterval(pollIntervalMs);
  const refetchInterval =
    options?.refetchIntervalMs === false ? false : leaderRefetchInterval;
  return useQuery({
    queryKey: [TOOLS_KEY, provider],
    queryFn: async (): Promise<ToolInfo[]> => {
      const res = await fetch(`/api/tools?provider=${provider}`);
      if (!res.ok) throw new Error("Failed to fetch tools");
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    refetchInterval,
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? true,
  });
}

export function useRefreshTools(provider: ConfigProvider = "claude") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await fetch(`/api/tools/mcp/discover?refresh=true&provider=${provider}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [TOOLS_KEY, provider] });
    },
  });
}

export function useInvalidateTools(provider?: ConfigProvider) {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      queryKey: provider ? [TOOLS_KEY, provider] : [TOOLS_KEY],
    });
}
