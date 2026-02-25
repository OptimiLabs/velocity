import type { ConfigProvider } from "@/types/provider";

export interface Session {
  id: string;
  project_id: string;
  slug: string | null;
  first_prompt: string | null;
  summary: string | null;
  message_count: number;
  tool_call_count: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  thinking_blocks: number;
  total_cost: number;
  git_branch: string | null;
  project_path: string | null;
  created_at: string;
  modified_at: string;
  compressed_at?: string | null;
  jsonl_path: string;
  tool_usage: string;
  model_usage: string;
  enriched_tools: string; // JSON-encoded EnrichedToolData
  session_role: "subagent" | "standalone";
  tags: string; // JSON-encoded string[]
  parent_session_id: string | null;
  subagent_type: string | null;
  avg_latency_ms: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  max_latency_ms: number;
  latency_sample_count?: number;
  session_duration_ms: number;
  pricing_status?: "priced" | "mixed" | "unpriced";
  unpriced_tokens?: number;
  unpriced_messages?: number;
  provider?: ConfigProvider;
  effort_mode?: string | null;
}

export interface Project {
  id: string;
  path: string;
  name: string;
  session_count: number;
  total_tokens: number;
  total_cost: number;
  last_activity_at: string | null;
  created_at: string;
}

export interface DailyStats {
  date: string;
  message_count: number;
  session_count: number;
  tool_call_count: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  total_cost: number;
  avg_latency_ms?: number;
  avg_p95_latency_ms?: number;
}

export interface OverallStats {
  total_sessions: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost: number;
}

export interface SkillEntry {
  name: string;
  count: number;
}

export interface AgentEntry {
  type: string;
  description: string;
}

export interface TaskSession extends Session {
  children: Session[];
}

export type FileCategory =
  | "knowledge"
  | "instruction"
  | "agent"
  | "code"
  | "config"
  | "other";

export interface FileReadEntry {
  path: string;
  count: number;
  category: FileCategory;
}

export interface FileWriteEntry {
  path: string;
  count: number;
  category: FileCategory;
}

export interface EnrichedToolData {
  skills: SkillEntry[];
  agents: AgentEntry[];
  mcpTools: Record<string, number>;
  coreTools: Record<string, number>;
  otherTools: Record<string, number>;
  filesModified: FileWriteEntry[];
  filesRead: FileReadEntry[];
  searchedPaths: string[];
}

export interface ScopeOptions {
  metrics: boolean;
  userPrompts: boolean;
  assistantResponses: boolean;
  summaries: boolean;
  toolDetails: boolean;
  messageLimit?: number; // 25|50|100|250|-1(all). Default: 50
  samplingStrategy?: "first" | "first-last"; // Default: "first"
  multiRoundSummarization?: boolean; // Default: false
}

export interface ComparisonMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  tokensUsed?: number;
  cost?: number;
}

export interface AnalysisConversation {
  id: string;
  title: string;
  sessionIds: string[];
  enabledSessionIds: string[];
  scope: ScopeOptions;
  model: string;
  messages: ComparisonMessage[];
  totalCost: number;
  totalTokens: number;
  messageCount: number;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface ToolUsageEntry {
  name: string;
  count: number;
  totalTokens: number; // sum of all token types attributed to this tool
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCost: number;
  errorCount: number;
}

export interface ModelUsageEntry {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cost: number;
  messageCount: number;
  pricingStatus?: "priced" | "unpriced";
  pricingReason?: "model_not_found" | "missing_rate_fields";
  unpricedTokens?: number;
  reasoningTokens?: number;
}
