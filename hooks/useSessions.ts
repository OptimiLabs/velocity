import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { toast } from "sonner";
import type { Session, TaskSession, ScopeOptions } from "@/types/session";

export interface CompareResult {
  analysis: string;
  tokensUsed: number;
  cost: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCost: number;
}

export interface ComparePreview {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCost: number;
  promptLength: number;
  scopeBreakdown: Record<string, number>;
  requiresMultiRound?: boolean;
  estimatedChunks?: number;
}

export type CompareProvider =
  | "claude-cli"
  | "anthropic"
  | "openai"
  | "google"
  | "openrouter"
  | "local"
  | "custom";
/** Model ID from lib/compare/models.ts registry */
export type CompareModel = string;

export function useComparePreview() {
  return useMutation({
    mutationFn: async ({
      sessionIds,
      question,
      preset,
      scope,
      model,
    }: {
      sessionIds: string[];
      question?: string;
      preset?: string;
      scope?: ScopeOptions;
      model?: CompareModel;
    }): Promise<ComparePreview> => {
      const res = await fetch("/api/sessions/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionIds,
          question,
          preset,
          scope,
          preview: true,
          provider: model,
        }),
        signal: AbortSignal.timeout(150_000),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Preview failed");
      }
      return res.json();
    },
  });
}

export function useCompareSessions() {
  return useMutation({
    mutationFn: async ({
      sessionIds,
      question,
      preset,
      provider,
      model,
      scope,
    }: {
      sessionIds: string[];
      question?: string;
      preset?: string;
      provider?: CompareProvider;
      model?: CompareModel;
      scope?: ScopeOptions;
    }): Promise<CompareResult> => {
      const res = await fetch("/api/sessions/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionIds,
          question,
          preset,
          provider: model || provider,
          scope,
        }),
        signal: AbortSignal.timeout(150_000),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Comparison failed");
      }
      return res.json();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

export function useCompareChat() {
  return useMutation({
    mutationFn: async (request: {
      sessionIds: string[];
      scope: ScopeOptions;
      provider?: CompareProvider;
      model?: CompareModel;
      messages: Array<{ role: string; content: string }>;
    }): Promise<CompareResult> => {
      const res = await fetch("/api/sessions/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionIds: request.sessionIds,
          scope: request.scope,
          provider: request.model || request.provider,
          messages: request.messages,
        }),
        signal: AbortSignal.timeout(150_000),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Comparison failed");
      }
      return res.json();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

export interface SessionSummary {
  total_sessions: number;
  total_cost: number;
  total_messages: number;
  avg_cost: number;
}

export interface SessionFilters {
  projectId?: string;
  search?: string;
  sortBy?: string;
  sortDir?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
  model?: string;
  modelOp?: "and" | "or";
  costMin?: number;
  costMax?: number;
  minMessages?: number;
  role?: string;
  agentType?: string;
  provider?: string;
  enabled?: boolean;
  includeSummary?: boolean;
}

export interface SessionStorageSummary {
  sessionCount: number;
  sessionFileCount: number;
  missingFileCount: number;
  jsonlBytes: number;
  databaseBytes: number;
  totalBytes: number;
}

function buildSessionParams(filters: SessionFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.projectId) params.set("projectId", filters.projectId);
  if (filters.search) params.set("search", filters.search);
  if (filters.sortBy) params.set("sortBy", filters.sortBy);
  if (filters.sortDir) params.set("sortDir", filters.sortDir);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.offset) params.set("offset", String(filters.offset));
  if (filters.model) params.set("model", filters.model);
  if (filters.modelOp) params.set("modelOp", filters.modelOp);
  if (filters.costMin != null) params.set("costMin", String(filters.costMin));
  if (filters.costMax != null) params.set("costMax", String(filters.costMax));
  if (filters.minMessages != null) params.set("minMessages", String(filters.minMessages));
  if (filters.role) params.set("role", filters.role);
  if (filters.agentType) params.set("agentType", filters.agentType);
  if (filters.provider) params.set("provider", filters.provider);
  if (filters.includeSummary) params.set("includeSummary", "true");
  return params;
}

export function useSessions(filters: SessionFilters = {}) {
  return useQuery({
    queryKey: ["sessions", filters],
    queryFn: async (): Promise<{
      sessions: Session[];
      total: number;
      summary?: SessionSummary;
    }> => {
      const params = buildSessionParams(filters);
      const res = await fetch(`/api/sessions?${params}`);
      if (!res.ok) throw new Error("Failed to fetch sessions");
      return res.json();
    },
    enabled: filters.enabled !== false,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });
}

export function useSessionsByIds(ids: string[]) {
  return useQuery({
    queryKey: ["sessions-by-ids", ids],
    queryFn: async (): Promise<Session[]> => {
      const res = await fetch(`/api/sessions?ids=${ids.join(",")}`);
      if (!res.ok) throw new Error("Failed to fetch sessions");
      const data = await res.json();
      return data.sessions;
    },
    enabled: ids.length > 0,
  });
}

export function useTaskSessions(filters: SessionFilters = {}) {
  const params = buildSessionParams(filters);
  params.set("groupByTask", "true");
  const searchString = params.toString();

  return useQuery({
    queryKey: ["sessions-tasks", filters],
    queryFn: async () => {
      const res = await fetch(`/api/sessions?${searchString}`);
      if (!res.ok) throw new Error("Failed to fetch task sessions");
      return res.json() as Promise<{ sessions: TaskSession[]; total: number }>;
    },
    enabled: filters.enabled !== false,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });
}

export function useSessionStorage(filters: {
  provider?: string;
  projectId?: string;
} = {}) {
  return useQuery({
    queryKey: ["sessions-storage", filters.provider, filters.projectId],
    queryFn: async (): Promise<SessionStorageSummary> => {
      const params = new URLSearchParams();
      if (filters.provider) params.set("provider", filters.provider);
      if (filters.projectId) params.set("projectId", filters.projectId);
      const query = params.toString();
      const res = await fetch(
        `/api/sessions/storage${query ? `?${query}` : ""}`,
      );
      if (!res.ok) throw new Error("Failed to fetch sessions storage");
      return res.json();
    },
    staleTime: 30_000,
  });
}

export function useIndexer() {
  return {
    rebuild: async () => {
      const res = await fetch("/api/index?mode=rebuild", { method: "POST" });
      if (!res.ok) throw new Error("Failed to rebuild index");
      return res.json();
    },
    incrementalSync: async () => {
      const res = await fetch("/api/index?mode=incremental", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to run incremental sync");
      return res.json();
    },
    nukeAndRebuild: async () => {
      const res = await fetch("/api/index?mode=nuke", { method: "POST" });
      if (!res.ok) throw new Error("Failed to nuke and rebuild");
      return res.json();
    },
  };
}

export function useDeleteSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete session");
      return res.json();
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["sessions"] });
      const previous = queryClient.getQueriesData<{
        sessions: Session[];
        total: number;
      }>({ queryKey: ["sessions"] });
      queryClient.setQueriesData<{ sessions: Session[]; total: number }>(
        { queryKey: ["sessions"] },
        (old) =>
          old
            ? {
                sessions: old.sessions.filter((s) => s.id !== id),
                total: old.total - 1,
              }
            : old,
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data);
        }
      }
      toast.error("Failed to delete session");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["sessions-grouped"] });
      queryClient.invalidateQueries({ queryKey: ["sessions-storage"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-projects"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-models"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-tools"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useDeleteSessionsBulk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch("/api/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, deleteFiles: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete sessions");
      }
      return res.json() as Promise<{
        success: boolean;
        deleted: number;
        fileDeletes: { deleted: number; failed: number };
      }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["sessions-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["sessions-storage"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-projects"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-models"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-tools"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });

      toast.success(
        `Deleted ${result.deleted.toLocaleString()} session${result.deleted === 1 ? "" : "s"}`,
      );
      if (result.fileDeletes.failed > 0) {
        toast.warning(
          `Deleted rows, but ${result.fileDeletes.failed.toLocaleString()} session file${result.fileDeletes.failed === 1 ? "" : "s"} could not be removed from disk.`,
        );
      }
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}
