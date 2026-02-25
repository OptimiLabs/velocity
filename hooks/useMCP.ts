import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ConfigProvider } from "@/types/provider";

export interface MCPToolEntry {
  name: string;
  description?: string;
  inputSchema?: object;
}

export interface MCPServerCache {
  tools: MCPToolEntry[];
  fetchedAt: number;
  error?: string;
}

export type MCPToolCacheMap = Record<string, MCPServerCache>;

export interface MCPUsageEntry {
  totalCalls: number;
  lastUsed: string | null;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCost: number;
  avgTokensPerCall: number;
  avgCostPerCall: number;
}

export type MCPUsageMap = Record<string, MCPUsageEntry>;

const MCP_KEY = ["mcp"] as const;

export function useMCPDiscover(provider: ConfigProvider = "claude") {
  return useQuery({
    queryKey: [...MCP_KEY, "discover", provider],
    queryFn: async (): Promise<MCPToolCacheMap> => {
      const res = await fetch(`/api/tools/mcp/discover?provider=${provider}`);
      if (!res.ok) throw new Error("Failed to fetch MCP discover");
      return res.json();
    },
  });
}

export function useMCPUsage(provider: ConfigProvider = "claude") {
  return useQuery({
    queryKey: [...MCP_KEY, "usage", provider],
    queryFn: async (): Promise<MCPUsageMap> => {
      const res = await fetch(`/api/tools/mcp/usage?provider=${provider}`);
      if (!res.ok) throw new Error("Failed to fetch MCP usage");
      return res.json();
    },
  });
}

export function useRefreshMCPDiscover(provider: ConfigProvider = "claude") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params?: { server?: string }) => {
      const query = new URLSearchParams({
        refresh: "true",
        provider,
      });
      if (params?.server?.trim()) {
        query.set("server", params.server.trim());
      }
      const res = await fetch(`/api/tools/mcp/discover?${query.toString()}`);
      if (!res.ok) throw new Error("Failed to refresh MCP discover");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...MCP_KEY, "discover", provider],
      });
    },
  });
}
