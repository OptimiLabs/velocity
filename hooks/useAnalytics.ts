import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { useLeaderRefetchInterval } from "@/hooks/useLeaderRefetchInterval";
import type { DailyStats } from "@/types/session";
import type { Project } from "@/types/session";
import type { ConfigProvider } from "@/types/provider";

export interface AnalyticsFilters {
  projectId?: string;
  roles?: string[];
  models?: string[];
  modelOp?: "and" | "or";
  agentTypes?: string[];
  billingPlan?: string;
  provider?: string;
}

function filtersToParams(filters: AnalyticsFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.projectId) params.set("projectId", filters.projectId);
  if (filters.roles?.length) params.set("role", filters.roles.join(","));
  if (filters.models?.length) {
    params.set("model", filters.models.join(","));
    if (filters.modelOp) params.set("modelOp", filters.modelOp);
  }
  if (filters.agentTypes?.length)
    params.set("agentType", filters.agentTypes.join(","));
  if (filters.billingPlan) params.set("billingPlan", filters.billingPlan);
  if (filters.provider) params.set("provider", filters.provider);
  return params;
}

interface AnalyticsTotals {
  total_cost: number;
  total_messages: number;
  total_sessions: number;
  total_tool_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read_tokens: number;
  total_cache_write_tokens: number;
  avg_latency_ms: number;
  avg_p95_latency_ms: number;
  avg_session_duration_ms: number;
}

export interface CostDistribution {
  p50: number;
  p75: number;
  p90: number;
  p99: number;
  max: number;
  histogram: { bucket: string; count: number }[];
}

interface AnalyticsData {
  daily: DailyStats[];
  totals: AnalyticsTotals;
  previousTotals: AnalyticsTotals;
  costDistribution?: CostDistribution;
  weekly: {
    week: string;
    total_cost: number;
    total_messages: number;
    total_sessions: number;
  }[];
}

export function useAnalytics(
  from: string,
  to: string,
  filters: AnalyticsFilters = {},
  enabled = true,
  granularity: "day" | "hour" = "day",
) {
  return useQuery({
    queryKey: ["analytics", from, to, filters, granularity],
    queryFn: async (): Promise<AnalyticsData> => {
      const params = new URLSearchParams({ from, to, granularity });
      const fp = filtersToParams(filters);
      fp.forEach((v, k) => params.set(k, v));
      const res = await fetch(`/api/analytics?${params}`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
    enabled,
  });
}

interface ProjectCost {
  name: string;
  total_cost: number;
  session_count: number;
  total_tokens: number;
}

export function useProjectCosts(from: string, to: string) {
  return useQuery({
    queryKey: ["analytics-projects", from, to],
    queryFn: async (): Promise<{ projects: ProjectCost[] }> => {
      const params = new URLSearchParams({ from, to });
      const res = await fetch(`/api/analytics/projects?${params}`);
      if (!res.ok) throw new Error("Failed to fetch project costs");
      return res.json();
    },
  });
}

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: async (): Promise<Project[]> => {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to fetch projects");
      const json = await res.json();
      return json.projects ?? json;
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export interface ModelUsageRow {
  model: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cost: number;
  messageCount: number;
  sessionCount: number;
  unpricedTokens?: number;
}

interface ModelUsageData {
  models: ModelUsageRow[];
  byRole?: {
    standalone: ModelUsageRow[];
    subagent: ModelUsageRow[];
  };
}

export function useModelUsage(
  from: string,
  to: string,
  filters: AnalyticsFilters = {},
  enabled = true,
  includeRoleBreakdown = false,
) {
  return useQuery({
    queryKey: ["analytics-models", from, to, filters, includeRoleBreakdown],
    queryFn: async (): Promise<ModelUsageData> => {
      const params = new URLSearchParams({ from, to });
      const fp = filtersToParams(filters);
      fp.forEach((v, k) => params.set(k, v));
      if (includeRoleBreakdown) params.set("includeRoleBreakdown", "true");
      const res = await fetch(`/api/analytics/models?${params}`);
      if (!res.ok) throw new Error("Failed to fetch model usage");
      return res.json();
    },
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
    enabled,
  });
}

export interface ToolUsageRow {
  name: string;
  totalCalls: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCost: number;
  errorCount: number;
  sessionCount: number;
  category: string;
  group: string;
}

export interface CategorySummaryRow {
  group: string;
  category: string;
  totalCalls: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCost: number;
  toolCount: number;
}

export interface RoleBreakdownRow {
  role: string;
  sessionCount: number;
  messageCount: number;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface RoleDailyRow {
  date: string;
  subagent_cost: number;
  standalone_cost: number;
  subagent_sessions: number;
  standalone_sessions: number;
}

export interface AgentTypeRow {
  type: string;
  sessionCount: number;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

interface RoleAnalyticsData {
  byRole: RoleBreakdownRow[];
  daily: RoleDailyRow[];
  byAgentType: AgentTypeRow[];
}

export function useRoleAnalytics(
  from: string,
  to: string,
  filters: AnalyticsFilters = {},
  enabled = true,
) {
  return useQuery({
    queryKey: ["analytics-roles", from, to, filters],
    queryFn: async (): Promise<RoleAnalyticsData> => {
      const params = new URLSearchParams({ from, to });
      const fp = filtersToParams(filters);
      fp.forEach((v, k) => params.set(k, v));
      const res = await fetch(`/api/analytics/roles?${params}`);
      if (!res.ok) throw new Error("Failed to fetch role analytics");
      return res.json();
    },
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    enabled,
  });
}

export interface DataUtilizationFile {
  path: string;
  shortPath: string;
  category: string;
  totalReads: number;
  sessionCount: number;
  projectPath: string | null;
  projectName: string | null;
  estimatedTokens: number;
  estimatedCost: number;
  sizeBytes: number | null;
}

export interface DataUtilizationCategory {
  category: string;
  label: string;
  fileCount: number;
  totalReads: number;
  sessionCount: number;
  estimatedTokens: number;
  estimatedCost: number;
}

export interface DataUtilizationData {
  topFiles: DataUtilizationFile[];
  categories: DataUtilizationCategory[];
  totals: {
    uniqueFiles: number;
    totalReads: number;
    totalReadTokens: number;
    totalReadCost: number;
    sessionsWithReads: number;
  };
}

export function useDataUtilization(
  from: string,
  to: string,
  filters: AnalyticsFilters = {},
  enabled = true,
) {
  return useQuery({
    queryKey: ["analytics-data-utilization", from, to, filters],
    queryFn: async (): Promise<DataUtilizationData> => {
      const params = new URLSearchParams({ from, to });
      const fp = filtersToParams(filters);
      fp.forEach((v, k) => params.set(k, v));
      const res = await fetch(`/api/analytics/data-utilization?${params}`);
      if (!res.ok) throw new Error("Failed to fetch data utilization");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

// ── Context Breakdown (segmented bar) ────────────────────────────

export interface ContextBreakdownItem {
  name: string;
  tokens: number;
  detail?: string;
}

export interface ContextBreakdownCategory {
  key: string;
  label: string;
  tokens: number;
  items: ContextBreakdownItem[];
}

export interface ContextBreakdownData {
  categories: ContextBreakdownCategory[];
  staticTotal: number;
}

export function useContextBreakdown(
  projectId: string,
  provider: ConfigProvider = "claude",
) {
  return useQuery({
    queryKey: ["context-breakdown", projectId, provider],
    queryFn: async (): Promise<ContextBreakdownData> => {
      const params = new URLSearchParams({ projectId, provider });
      const res = await fetch(`/api/context/breakdown?${params}`);
      if (!res.ok) throw new Error("Failed to fetch context breakdown");
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    enabled: !!projectId,
  });
}

// ── Context Preview (system prompt view) ─────────────────────────

export interface ContextPreviewFile {
  id: string;
  filePath: string;
  shortPath: string;
  fileName: string;
  fileType: string;
  content: string;
  tokenCount: number;
  isGlobal: boolean;
  ingestionMode: "always" | "on-demand";
}

export interface ContextPreviewSection {
  type: string;
  label: string;
  files: ContextPreviewFile[];
  totalTokens: number;
  runtimeTokens: number;
  runtimeFiles: number;
  optionalTokens: number;
  optionalFiles: number;
}

export interface ContextPreviewData {
  sections: ContextPreviewSection[];
  totals: {
    totalFiles: number;
    totalTokens: number;
    runtimeFiles: number;
    runtimeTokens: number;
    runtimeEstimatedTokens: number;
    runtimeBaseTokens: number;
    runtimeSystemPromptTokens: number;
    runtimeSystemToolsTokens: number;
    runtimeBaseSource: "heuristic" | "none";
    optionalFiles: number;
    optionalTokens: number;
    optionalGlobalTokens: number;
    optionalProjectTokens: number;
    indexedGlobalTokens: number;
    indexedProjectTokens: number;
    runtimeGlobalTokens: number;
    runtimeProjectTokens: number;
    globalTokens: number;
    projectTokens: number;
  };
}

export function useContextPreview(
  projectId: string,
  provider?: ConfigProvider,
) {
  return useQuery({
    queryKey: ["context-preview", projectId, provider ?? "claude"],
    queryFn: async (): Promise<ContextPreviewData> => {
      const params = new URLSearchParams({ projectId });
      if (provider) params.set("provider", provider);
      const res = await fetch(`/api/context/preview?${params}`);
      if (!res.ok) throw new Error("Failed to fetch context preview");
      return res.json();
    },
    staleTime: 30_000,
    enabled: !!projectId,
  });
}

// ── Instruction Context ──────────────────────────────────────────

export interface InstructionContextFile {
  filePath: string;
  shortPath: string;
  fileName: string;
  fileType: string;
  tokenCount: number;
  isGlobal: boolean;
  sessionCount: number;
  detectionMethod: string | null;
}

export interface InstructionContextProjectFile {
  shortPath: string;
  fileType: string;
  tokenCount: number;
  isGlobal: boolean;
  sessionCount: number;
  detectionMethod: string | null;
}

export interface InstructionContextProject {
  projectPath: string;
  projectName: string;
  sessionCount: number;
  totalInstructionTokens: number;
  globalTokens: number;
  projectTokens: number;
  fileCount: number;
  files: InstructionContextProjectFile[];
}

export interface InstructionContextData {
  instructionFiles: InstructionContextFile[];
  projectBreakdown: InstructionContextProject[];
  totals: {
    totalInstructionFiles: number;
    usedInstructionFiles: number;
    usedInstructionTokens: number;
    avgTokensPerSession: number;
    totalSessions: number;
  };
}

export function useInstructionContext(
  from: string,
  to: string,
  filters: AnalyticsFilters = {},
  enabled = true,
) {
  return useQuery({
    queryKey: ["analytics-instruction-context", from, to, filters],
    queryFn: async (): Promise<InstructionContextData> => {
      const params = new URLSearchParams({ from, to });
      const fp = filtersToParams(filters);
      fp.forEach((v, k) => params.set(k, v));
      const res = await fetch(`/api/analytics/instruction-context?${params}`);
      if (!res.ok) throw new Error("Failed to fetch instruction context");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

interface ToolAnalyticsData {
  tools: ToolUsageRow[];
  categories: CategorySummaryRow[];
  byRole?: {
    standalone: { tools: ToolUsageRow[]; categories: CategorySummaryRow[] };
    subagent: { tools: ToolUsageRow[]; categories: CategorySummaryRow[] };
  };
  splits?: Record<string, { tools: ToolUsageRow[]; categories: CategorySummaryRow[] }>;
}

export function useFilterOptions(
  from: string,
  to: string,
  projectId?: string,
  provider?: string,
) {
  return useQuery({
    queryKey: ["analytics-filter-options", from, to, projectId, provider],
    queryFn: async () => {
      const params = new URLSearchParams({ from, to });
      if (projectId) params.set("projectId", projectId);
      if (provider) params.set("provider", provider);
      const res = await fetch(`/api/analytics/filter-options?${params}`);
      if (!res.ok) throw new Error("Failed to fetch filter options");
      return res.json() as Promise<{
        models: string[];
        agentTypes: string[];
        providers: string[];
        effortModes: string[];
      }>;
    },
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
  });
}

export function useToolAnalytics(
  from: string,
  to: string,
  filters: AnalyticsFilters = {},
  enabled = true,
  includeRoleBreakdown = false,
  splitBy?: string,
) {
  return useQuery({
    queryKey: ["analytics-tools", from, to, filters, includeRoleBreakdown, splitBy],
    queryFn: async (): Promise<ToolAnalyticsData> => {
      const params = new URLSearchParams({ from, to });
      const fp = filtersToParams(filters);
      fp.forEach((v, k) => params.set(k, v));
      if (splitBy) {
        params.set("splitBy", splitBy);
      } else if (includeRoleBreakdown) {
        params.set("includeRoleBreakdown", "true");
      }
      const res = await fetch(`/api/analytics/tools?${params}`);
      if (!res.ok) throw new Error("Failed to fetch tool analytics");
      return res.json();
    },
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    enabled,
  });
}

// ── Provider Analytics ────────────────────────────────────────────

export interface ProviderBreakdownRow {
  provider: string;
  sessionCount: number;
  messageCount: number;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface ProviderDailyRow {
  date: string;
  [key: string]: string | number; // e.g. claude_cost, codex_cost — dynamic per provider
}

interface ProviderAnalyticsData {
  byProvider: ProviderBreakdownRow[];
  daily: ProviderDailyRow[];
}

export function useProviderAnalytics(
  from: string,
  to: string,
  filters: AnalyticsFilters = {},
  enabled = true,
) {
  return useQuery({
    queryKey: ["analytics-providers", from, to, filters],
    queryFn: async (): Promise<ProviderAnalyticsData> => {
      const params = new URLSearchParams({ from, to });
      const fp = filtersToParams(filters);
      fp.forEach((v, k) => params.set(k, v));
      const res = await fetch(`/api/analytics/providers?${params}`);
      if (!res.ok) throw new Error("Failed to fetch provider analytics");
      return res.json();
    },
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    enabled,
  });
}

// ── Block Usage (billing / statusline) ────────────────────────────

export interface BlockModelUsage {
  model: string;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface BlockSession {
  id: string;
  slug: string | null;
  first_prompt: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  total_cost: number;
  message_count: number;
  tool_call_count: number;
  created_at: string;
  project_path: string | null;
}

export interface BlockUsageData {
  block: {
    sessions: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    cost: number;
    messages: number;
    toolCalls: number;
    startedAt: string | null;
    resetsAt: string | null;
  };
  models: BlockModelUsage[];
  topSessions: BlockSession[];
  plan: string | null;
  resetMinutes: number;
  blockStartOverride: string | null;
  updatedAt: string;
}

export const PLAN_BUDGETS: Record<string, number> = {
  pro: 5,
  max5x: 25,
  max20x: 100,
};

export const PLAN_TOKEN_BUDGETS: Record<string, number> = {
  pro: 19_000,
  max5x: 88_000,
  max20x: 220_000,
};

/** Direct weekly budgets (dollars) — week is the primary entity */
export const PLAN_WEEKLY_BUDGETS: Record<string, number> = {
  pro: 336,       // ~$5/block × 67.2 blocks/week (5h blocks)
  max5x: 1680,    // ~$25/block × 67.2
  max20x: 6720,   // ~$100/block × 67.2
};

/** Direct weekly token budgets (output tokens) — week is the primary entity */
export const PLAN_WEEKLY_TOKEN_BUDGETS: Record<string, number> = {
  pro: 1_276_800,     // ~19k/block × 67.2 blocks/week
  max5x: 5_913_600,   // ~88k/block × 67.2
  max20x: 14_784_000,  // ~220k/block × 67.2
};

export const PLAN_LABELS: Record<string, string> = {
  pro: "Pro",
  max5x: "Max 5x",
  max20x: "Max 20x",
  api: "API",
};

/** Per-tier output token budgets per block (each tier has its own independent limit) */
export const TIER_TOKEN_BUDGETS: Record<string, Record<string, number>> = {
  pro: { opus: 19_000, sonnet: 19_000, haiku: 19_000 },
  max5x: { opus: 88_000, sonnet: 88_000, haiku: 88_000 },
  max20x: { opus: 220_000, sonnet: 220_000, haiku: 220_000 },
};

/** Max plans are rate-limited by tokens, not billed per-token like API */
export const MAX_PLANS = new Set(["pro", "max5x", "max20x"]);

export function useBlockUsage(
  from?: string | null,
  to?: string | null,
  enabled = true,
  provider?: ConfigProvider | null,
) {
  const refetchInterval = useLeaderRefetchInterval(60_000);
  return useQuery({
    queryKey: ["block-usage", from ?? null, to ?? null, provider ?? null],
    queryFn: async (): Promise<BlockUsageData> => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (provider) params.set("provider", provider);
      const qs = params.toString();
      const res = await fetch(`/api/statusline${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch block usage");
      return res.json();
    },
    refetchInterval: enabled ? refetchInterval : false,
    staleTime: 30_000,
    enabled,
  });
}

// ── Real Usage (live from Anthropic via /usage PTY) ───────────────

export interface RealUsageSection {
  label: string;
  percentUsed: number | null;
  resetsAt: string | null;
  timezone: string | null;
}

export interface RealUsageData {
  sections: RealUsageSection[];
  fetchedAt: string;
  error: string | null;
}

export function useRealUsage(enabled = true) {
  const refetchInterval = useLeaderRefetchInterval(120_000);
  return useQuery({
    queryKey: ["real-usage"],
    queryFn: async (): Promise<RealUsageData> => {
      const res = await fetch("/api/usage-live");
      if (!res.ok) throw new Error("Failed to fetch real usage");
      return res.json();
    },
    refetchInterval: enabled ? refetchInterval : false,
    staleTime: 60_000,
    retry: 1,
    enabled,
  });
}

export interface WeekSettings {
  statuslineWeekStartDay?: number;
  statuslineWeekStartHour?: number;
  statuslineWeeklyBudget?: number;
  statuslineWeeklyTokenBudget?: number;
  statuslinePlan?: string;
  statuslineResetMinutes?: number;
}

export function useWeekSettings(enabled = true) {
  return useQuery({
    queryKey: ["week-settings"],
    queryFn: async (): Promise<WeekSettings> => {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
    enabled,
    staleTime: 30_000,
  });
}

export function useUpdateBlockSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      partial: Record<string, unknown>,
    ) => {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      if (!res.ok) throw new Error("Failed to update settings");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["block-usage"] });
      queryClient.invalidateQueries({ queryKey: ["week-settings"] });
    },
  });
}
