import fs from "fs";
import path from "path";
import { calculateCostDetailed } from "@/lib/cost/calculator";
import { categorizeFilePath } from "@/lib/parser/session-utils";
import { isCoreToolForProvider } from "@/lib/tools/provider-tools";
import type { SessionStats } from "@/lib/parser/session-aggregator";
import type {
  AgentEntry,
  SkillEntry,
  ToolUsageEntry,
  ModelUsageEntry,
  EnrichedToolData,
  FileReadEntry,
  FileWriteEntry,
} from "@/types/session";
import { getGeminiAgentDirs, getGeminiSkillDirs } from "@/lib/gemini/paths";
import {
  maybeRecordTurnLatency,
  summarizeLatencies,
} from "@/lib/parser/latency";

export interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response?: Record<string, unknown> };
  [key: string]: unknown;
}

export interface GeminiToolCall {
  name?: string;
  args?: Record<string, unknown>;
  status?: string;
  result?: unknown;
  response?: unknown;
  error?: unknown;
  [key: string]: unknown;
}

export interface GeminiMessage {
  role?: "user" | "model" | "tool" | string;
  type?: "user" | "gemini" | "model" | "assistant" | "tool" | "info" | string;
  parts?: GeminiPart[];
  metadata?: { model?: string; [key: string]: unknown };
  model?: string;
  tokens?: Record<string, unknown>;
  toolCalls?: GeminiToolCall[];
  thoughts?: unknown[];
  content?: unknown;
  timestamp?: string;
  [key: string]: unknown;
}

interface GeminiSessionFile {
  startTime?: string;
  lastUpdated?: string;
  summary?: unknown;
  git_branch?: string;
  gitBranch?: string;
  branch?: string;
  cwd?: string;
  project_path?: string;
  projectPath?: string;
  messages?: GeminiMessage[];
  [key: string]: unknown;
}

function emptyStats(): SessionStats {
  const enrichedTools: EnrichedToolData = {
    skills: [],
    agents: [],
    mcpTools: {},
    coreTools: {},
    otherTools: {},
    filesModified: [],
    filesRead: [],
    searchedPaths: [],
  };

  return {
    messageCount: 0,
    toolCallCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    thinkingBlocks: 0,
    totalCost: 0,
    toolUsage: {},
    modelUsage: {},
    enrichedTools,
    autoSummary: null,
    sessionRole: "standalone",
    tags: [],
    detectedInstructionPaths: [],
    avgLatencyMs: 0,
    p50LatencyMs: 0,
    p95LatencyMs: 0,
    maxLatencyMs: 0,
    latencySampleCount: 0,
    sessionDurationMs: 0,
    pricingStatus: "priced",
    unpricedTokens: 0,
    unpricedMessages: 0,
    detectedProvider: "gemini",
    effortMode: null,
  };
}

function resolveGeminiProjectPath(filePath: string): string | null {
  const sessionDir = path.dirname(filePath);
  const projectDir = path.dirname(sessionDir);
  const markerPath = path.join(projectDir, ".project_root");
  try {
    const raw = fs.readFileSync(markerPath, "utf-8").trim();
    return raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

function getSkillPathCandidates(
  skillName: string,
  projectPath: string | null,
): string[] {
  return getGeminiSkillDirs(projectPath ?? undefined).map((dir) =>
    path.join(dir, `${skillName}.md`),
  );
}

function getAgentPathCandidates(
  agentType: string,
  projectPath: string | null,
): string[] {
  return getGeminiAgentDirs(projectPath ?? undefined).map((dir) =>
    path.join(dir, `${agentType}.md`),
  );
}

const GEMINI_EFFORT_KEYS = [
  "effort",
  "effort_mode",
  "reasoning_effort",
  "reasoningEffort",
  "model_reasoning_effort",
  "modelReasoningEffort",
  "effortLevel",
] as const;

function getStringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeEffortMode(value: unknown): string | null {
  const normalized = getStringValue(value)?.toLowerCase();
  if (!normalized) return null;
  if (!/^[a-z0-9_-]{2,24}$/.test(normalized)) return null;
  return normalized;
}

function extractEffortMode(source: unknown): string | null {
  if (!isRecord(source)) return null;
  const queue: Record<string, unknown>[] = [source];
  const seen = new Set<Record<string, unknown>>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);

    for (const key of GEMINI_EFFORT_KEYS) {
      const mode = normalizeEffortMode(current[key]);
      if (mode) return mode;
    }

    const nested = [
      current.metadata,
      current.context,
      current.settings,
      current.config,
      current.payload,
      current.source,
      current.env,
      current.environment,
      current.collaboration_mode,
      current.collaborationMode,
      current.data,
      current.message,
    ];
    for (const value of nested) {
      if (isRecord(value)) queue.push(value);
    }
  }
  return null;
}

function extractGitBranch(source: unknown): string | null {
  if (!isRecord(source)) return null;
  return (
    getStringValue(source.git_branch) ??
    getStringValue(source.gitBranch) ??
    (isRecord(source.git) ? getStringValue(source.git.branch) : null) ??
    (isRecord(source.metadata) ? extractGitBranch(source.metadata) : null)
  );
}

function extractProjectPathHint(source: unknown): string | null {
  if (!isRecord(source)) return null;
  return (
    getStringValue(source.project_path) ??
    getStringValue(source.projectPath) ??
    getStringValue(source.cwd) ??
    getStringValue(source.working_directory) ??
    getStringValue(source.workspace) ??
    (isRecord(source.metadata) ? extractProjectPathHint(source.metadata) : null)
  );
}

function readSessionSummary(session: GeminiSessionFile | null): string | null {
  if (!session) return null;
  const summary = session.summary;

  if (typeof summary === "string") {
    const normalized = summary.trim();
    return normalized ? normalizeGeminiInvalidCommandHelp(normalized) : null;
  }

  if (Array.isArray(summary)) {
    const chunks = summary
      .map((item) => {
        if (typeof item === "string") return item;
        if (isRecord(item)) {
          return (
            getStringValue(item.text) ??
            getStringValue(item.summary) ??
            getStringValue(item.content) ??
            ""
          );
        }
        return "";
      })
      .filter(Boolean);
    if (chunks.length > 0) {
      return normalizeGeminiInvalidCommandHelp(chunks.join("\n").trim());
    }
  }

  if (isRecord(summary)) {
    const normalized =
      getStringValue(summary.text) ??
      getStringValue(summary.summary) ??
      getStringValue(summary.content) ??
      getStringValue(summary.message);
    if (normalized) return normalizeGeminiInvalidCommandHelp(normalized);
  }

  return null;
}

function hasToolResultError(result: unknown): boolean {
  if (result === null || typeof result === "undefined") return false;

  if (typeof result === "string") {
    const normalized = result.toLowerCase();
    if (/process exited with code\s+0/i.test(normalized)) return false;
    return /\b(error|failed|failure|exception|timeout|denied)\b/i.test(
      normalized,
    );
  }

  if (isRecord(result)) {
    const status = getStringValue(result.status)?.toLowerCase();
    if (
      status &&
      ["error", "failed", "failure", "timeout", "cancelled"].includes(status)
    ) {
      return true;
    }
    if (result.error) return true;
    if (result.is_error === true) return true;
    if (result.ok === false) return true;
    if (result.success === false) return true;

    if ("response" in result && hasToolResultError(result.response)) return true;
    if ("result" in result && hasToolResultError(result.result)) return true;
  }

  return false;
}

export function parseGeminiSession(filePath: string): SessionStats {
  const stats = emptyStats();

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch {
    return stats;
  }

  let parsedSession: unknown;
  try {
    parsedSession = JSON.parse(raw);
  } catch {
    return stats;
  }

  const messages = extractMessages(parsedSession);
  if (messages.length === 0) return stats;

  const sessionObject = isRecord(parsedSession)
    ? (parsedSession as GeminiSessionFile)
    : null;
  const projectPath =
    resolveGeminiProjectPath(filePath) ?? extractProjectPathHint(sessionObject);
  const toolUsage: Record<string, ToolUsageEntry> = {};
  const modelUsage: Record<string, ModelUsageEntry> = {};
  const skills: SkillEntry[] = [];
  const agents: AgentEntry[] = [];
  const mcpTools: Record<string, number> = {};
  const filesReadMap = new Map<string, number>();
  const filesModifiedMap = new Map<string, number>();
  const searchedPaths = new Set<string>();
  const detectedInstructionPathSet = new Set<string>();

  const sessionStartTs = toTimestampMs(sessionObject?.startTime);
  const sessionEndTs = toTimestampMs(sessionObject?.lastUpdated);
  let firstMessageTs: number | null = sessionStartTs;
  let lastMessageTs: number | null = sessionEndTs;
  let firstUserMessage: string | null = null;
  let lastModelMessage: string | null = null;
  let detectedGitBranch: string | null = extractGitBranch(sessionObject);
  let detectedEffortMode: string | null = extractEffortMode(sessionObject);
  const turnLatencies: number[] = [];
  let lastUserTimestamp: number | null = null;

  function ensureModel(model: string): ModelUsageEntry {
    if (!modelUsage[model]) {
      modelUsage[model] = {
        model,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        cost: 0,
        messageCount: 0,
        pricingStatus: "priced",
        unpricedTokens: 0,
        reasoningTokens: 0,
      };
    }
    return modelUsage[model];
  }

  function ensureTool(name: string): ToolUsageEntry {
    if (!toolUsage[name]) {
      toolUsage[name] = {
        name,
        count: 0,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        estimatedCost: 0,
        errorCount: 0,
      };
    }
    return toolUsage[name];
  }

  for (const msg of messages) {
    if (isCountedMessage(msg)) {
      stats.messageCount++;
    }

    const ts = toTimestampMs(msg.timestamp);
    if (ts !== null) {
      if (firstMessageTs === null || ts < firstMessageTs) firstMessageTs = ts;
      if (lastMessageTs === null || ts > lastMessageTs) lastMessageTs = ts;
    }

    const role = getMessageRole(msg);
    const roleNormalized = role.toLowerCase();
    const model = getModelName(msg);
    if (model) ensureModel(model);
    const effortMode = extractEffortMode(msg);
    if (effortMode) detectedEffortMode = effortMode;
    const gitBranch = extractGitBranch(msg);
    if (gitBranch) detectedGitBranch = gitBranch;
    const thoughtCount = Array.isArray(msg.thoughts) ? msg.thoughts.length : 0;
    if (thoughtCount > 0) {
      stats.thinkingBlocks += thoughtCount;
    }

    if (roleNormalized === "user" && !firstUserMessage) {
      const text = extractMessageText(msg.content, msg.parts);
      if (text) firstUserMessage = text.slice(0, 240);
    }
    if (isModelMessageRole(roleNormalized)) {
      const modelForMessage = model || "gemini-unknown";
      ensureModel(modelForMessage).messageCount++;
      const text = extractMessageText(msg.content, msg.parts);
      if (text) lastModelMessage = text.slice(0, 500);
    }

    if (ts !== null) {
      if (roleNormalized === "user") {
        lastUserTimestamp = ts;
      } else if (isModelMessageRole(roleNormalized) && lastUserTimestamp !== null) {
        const delta = ts - lastUserTimestamp;
        maybeRecordTurnLatency(turnLatencies, delta);
        lastUserTimestamp = null;
      }
    }

    const tokenSnapshot = extractTokens(msg.tokens);
    if (tokenSnapshot) {
      const modelForTokens = model || "gemini-unknown";
      const modelEntry = ensureModel(modelForTokens);
      modelEntry.inputTokens += tokenSnapshot.inputTokens;
      modelEntry.outputTokens += tokenSnapshot.outputTokens;
      modelEntry.cacheReadTokens += tokenSnapshot.cacheReadTokens;
      modelEntry.cacheWriteTokens += tokenSnapshot.cacheWriteTokens;
      modelEntry.reasoningTokens =
        (modelEntry.reasoningTokens || 0) + tokenSnapshot.reasoningTokens;
      if (tokenSnapshot.reasoningTokens > 0 && thoughtCount === 0) {
        stats.thinkingBlocks++;
      }
      const costResult = calculateCostDetailed(
        modelForTokens,
        tokenSnapshot.inputTokens,
        tokenSnapshot.outputTokens,
        tokenSnapshot.cacheReadTokens,
        tokenSnapshot.cacheWriteTokens,
      );
      modelEntry.cost += costResult.cost;
      if (costResult.status === "unpriced" && costResult.totalBillableTokens > 0) {
        modelEntry.pricingStatus = "unpriced";
        modelEntry.pricingReason = costResult.reason ?? "model_not_found";
        modelEntry.unpricedTokens =
          (modelEntry.unpricedTokens || 0) + costResult.totalBillableTokens;
        stats.unpricedTokens += costResult.totalBillableTokens;
        stats.unpricedMessages += 1;
      }

      stats.inputTokens += tokenSnapshot.inputTokens;
      stats.outputTokens += tokenSnapshot.outputTokens;
      stats.cacheReadTokens += tokenSnapshot.cacheReadTokens;
      stats.cacheWriteTokens += tokenSnapshot.cacheWriteTokens;
      stats.totalCost += costResult.cost;
    }

    for (const call of extractToolCalls(msg)) {
      if (!call.name) continue;
      const normalizedName = call.name.toLowerCase();
      const entry = ensureTool(call.name);
      entry.count++;
      stats.toolCallCount++;
      if (isErrorStatus(call.status) || hasToolResultError(call.result)) {
        entry.errorCount++;
      }
      if (normalizedName.startsWith("mcp__")) {
        const segments = call.name.split("__");
        const serverName = segments[1] || call.name;
        mcpTools[serverName] = (mcpTools[serverName] || 0) + 1;
      }
      if (normalizedName === "skill") {
        const skillName =
          getStringValue(call.args?.skill) ?? getStringValue(call.args?.name);
        if (skillName) {
          const existing = skills.find((s) => s.name === skillName);
          if (existing) existing.count++;
          else skills.push({ name: skillName, count: 1 });
        }
      }
      if (normalizedName === "task" || normalizedName === "spawn_agent") {
        const agentType =
          getStringValue(call.args?.subagent_type) ??
          getStringValue(call.args?.agent_type) ??
          getStringValue(call.args?.agentType) ??
          getStringValue(call.args?.name);
        if (agentType) {
          agents.push({
            type: agentType,
            description: getStringValue(call.args?.description) ?? "",
          });
        }
      }
      trackToolPaths(
        call.name,
        call.args,
        filesReadMap,
        filesModifiedMap,
        searchedPaths,
      );
    }
  }

  const filesRead: FileReadEntry[] = [...filesReadMap.entries()].map(
    ([path, count]) => ({
      path,
      count,
      category: categorizeFilePath(path),
    }),
  );
  const filesModified: FileWriteEntry[] = [...filesModifiedMap.entries()].map(
    ([path, count]) => ({
      path,
      count,
      category: categorizeFilePath(path),
    }),
  );

  for (const fr of filesRead) {
    if (fr.category === "knowledge" || fr.category === "instruction") {
      detectedInstructionPathSet.add(fr.path);
    }
  }
  for (const skill of skills) {
    for (const candidate of getSkillPathCandidates(skill.name, projectPath)) {
      detectedInstructionPathSet.add(candidate);
    }
  }
  for (const agent of agents) {
    for (const candidate of getAgentPathCandidates(agent.type, projectPath)) {
      detectedInstructionPathSet.add(candidate);
    }
  }
  const detectedInstructionPaths = [...detectedInstructionPathSet];

  const coreTools: Record<string, number> = {};
  const otherTools: Record<string, number> = {};
  for (const [name, entry] of Object.entries(toolUsage)) {
    const normalizedName = name.toLowerCase();
    if (
      normalizedName === "skill" ||
      normalizedName === "task" ||
      normalizedName === "spawn_agent" ||
      normalizedName.startsWith("mcp__")
    ) {
      continue;
    }
    if (isCoreToolForProvider(name, "gemini")) coreTools[name] = entry.count;
    else otherTools[name] = entry.count;
  }

  const totalToolCalls = Object.values(toolUsage).reduce(
    (sum, t) => sum + t.count,
    0,
  );
  if (totalToolCalls > 0) {
    for (const entry of Object.values(toolUsage)) {
      const share = entry.count / totalToolCalls;
      entry.inputTokens = Math.round(stats.inputTokens * share);
      entry.outputTokens = Math.round(stats.outputTokens * share);
      entry.cacheReadTokens = Math.round(stats.cacheReadTokens * share);
      entry.cacheWriteTokens = Math.round(stats.cacheWriteTokens * share);
      entry.totalTokens =
        entry.inputTokens +
        entry.outputTokens +
        entry.cacheReadTokens +
        entry.cacheWriteTokens;
      entry.estimatedCost = stats.totalCost * share;
    }
  }

  const tags: string[] = [];
  if (agents.length > 0) {
    const spawnedTypes = new Set(agents.map((a) => a.type));
    for (const t of spawnedTypes) tags.push(`spawns:${t}`);
  }
  for (const s of skills) tags.push(`skill:${s.name}`);

  stats.toolUsage = toolUsage;
  stats.modelUsage = modelUsage;
  stats.tags = tags;
  stats.enrichedTools = {
    skills,
    agents,
    mcpTools,
    coreTools,
    otherTools,
    filesModified,
    filesRead,
    searchedPaths: [...searchedPaths],
  };
  stats.detectedInstructionPaths = detectedInstructionPaths;
  stats.autoSummary =
    lastModelMessage || readSessionSummary(sessionObject) || firstUserMessage;
  stats.firstPrompt = firstUserMessage;
  stats.projectPath = projectPath;
  stats.gitBranch = detectedGitBranch;
  stats.effortMode = detectedEffortMode;

  const latency = summarizeLatencies(turnLatencies);
  stats.avgLatencyMs = latency.avgLatencyMs;
  stats.p50LatencyMs = latency.p50LatencyMs;
  stats.p95LatencyMs = latency.p95LatencyMs;
  stats.maxLatencyMs = latency.maxLatencyMs;
  stats.latencySampleCount = latency.sampleCount;

  if (firstMessageTs !== null && lastMessageTs !== null) {
    stats.sessionDurationMs = Math.max(0, lastMessageTs - firstMessageTs);
  } else {
    // Fallback to file timestamps when message timestamps are unavailable.
    try {
      const fileStat = fs.statSync(filePath);
      const duration = fileStat.mtimeMs - fileStat.birthtimeMs;
      stats.sessionDurationMs = Math.max(0, duration);
    } catch {
      // leave at 0
    }
  }

  const billableTokensTotal =
    stats.inputTokens +
    stats.outputTokens +
    stats.cacheReadTokens +
    stats.cacheWriteTokens;
  const pricedTokens = Math.max(0, billableTokensTotal - stats.unpricedTokens);
  stats.pricingStatus =
    stats.unpricedTokens <= 0
      ? "priced"
      : pricedTokens > 0
        ? "mixed"
        : "unpriced";

  return stats;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function extractMessages(parsed: unknown): GeminiMessage[] {
  if (Array.isArray(parsed)) return parsed as GeminiMessage[];
  if (isRecord(parsed) && Array.isArray(parsed.messages)) {
    return parsed.messages as GeminiMessage[];
  }
  return [];
}

function getMessageRole(msg: GeminiMessage): string {
  if (typeof msg.type === "string" && msg.type.length > 0) return msg.type;
  if (typeof msg.role === "string" && msg.role.length > 0) return msg.role;
  return "";
}

function isCountedMessage(msg: GeminiMessage): boolean {
  const role = getMessageRole(msg).toLowerCase();
  if (!role) return true;
  return !["info", "system", "status", "meta"].includes(role);
}

function isModelMessageRole(role: string): boolean {
  const normalized = role.toLowerCase();
  return (
    normalized === "gemini" ||
    normalized === "model" ||
    normalized === "assistant"
  );
}

function getModelName(msg: GeminiMessage): string | null {
  if (typeof msg.model === "string" && msg.model.trim()) return msg.model.trim();
  if (typeof msg.metadata?.model === "string" && msg.metadata.model.trim()) {
    return msg.metadata.model.trim();
  }
  return null;
}

function normalizeGeminiInvalidCommandHelp(text: string): string {
  if (!text.includes("gemini --help")) return text;
  if (!/\b(?:unknown|invalid)\s+command\b/i.test(text)) return text;
  return text.replace(/\bgemini\s+--help\b/g, "gemini help");
}

function extractMessageText(content: unknown, parts?: GeminiPart[]): string | null {
  if (typeof content === "string" && content.trim().length > 0) {
    return normalizeGeminiInvalidCommandHelp(content.trim());
  }

  if (Array.isArray(content)) {
    const chunks = content
      .map((item) => {
        if (typeof item === "string") return item;
        if (isRecord(item) && typeof item.text === "string") return item.text;
        return "";
      })
      .filter(Boolean);
    if (chunks.length > 0) {
      return normalizeGeminiInvalidCommandHelp(chunks.join("\n").trim());
    }
  }

  if (Array.isArray(parts)) {
    const chunks = parts
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .filter(Boolean);
    if (chunks.length > 0) {
      return normalizeGeminiInvalidCommandHelp(chunks.join("\n").trim());
    }
  }

  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function extractTokens(tokens: unknown): {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
} | null {
  if (!isRecord(tokens)) return null;
  const inputTokens =
    asNumber(tokens.input) ??
    asNumber(tokens.inputTokens) ??
    asNumber(tokens.input_tokens) ??
    asNumber(tokens.promptTokenCount) ??
    asNumber(tokens.prompt_tokens) ??
    0;
  const outputTokensExplicit =
    asNumber(tokens.output) ??
    asNumber(tokens.outputTokens) ??
    asNumber(tokens.output_tokens) ??
    asNumber(tokens.candidatesTokenCount) ??
    asNumber(tokens.completion_tokens) ??
    0;
  const cacheReadTokens =
    asNumber(tokens.cached) ??
    asNumber(tokens.cacheRead) ??
    asNumber(tokens.cache_read_tokens) ??
    asNumber(tokens.cached_input_tokens) ??
    asNumber(tokens.cache_read_input_tokens) ??
    asNumber(tokens.cachedContentTokenCount) ??
    asNumber(tokens.cached_content_token_count) ??
    0;
  const cacheWriteTokens =
    asNumber(tokens.cacheWrite) ??
    asNumber(tokens.cache_write) ??
    asNumber(tokens.cacheWriteTokens) ??
    asNumber(tokens.cache_write_tokens) ??
    asNumber(tokens.cacheWriteInputTokens) ??
    asNumber(tokens.cache_write_input_tokens) ??
    asNumber(tokens.cacheCreation) ??
    asNumber(tokens.cacheCreationInputTokens) ??
    asNumber(tokens.cache_creation_input_tokens) ??
    asNumber(tokens.cache_creation) ??
    asNumber(tokens.cacheCreationTokens) ??
    asNumber(tokens.cache_creation_tokens) ??
    0;
  const reasoningTokens =
    asNumber(tokens.thoughts) ??
    asNumber(tokens.reasoning) ??
    asNumber(tokens.reasoningTokens) ??
    asNumber(tokens.reasoning_tokens) ??
    asNumber(tokens.thoughtTokenCount) ??
    asNumber(tokens.thought_tokens) ??
    0;
  const toolTokens =
    asNumber(tokens.tool) ??
    asNumber(tokens.toolTokens) ??
    asNumber(tokens.tool_tokens) ??
    0;
  const outputTokens =
    outputTokensExplicit > 0
      ? outputTokensExplicit
      : Math.max(reasoningTokens, toolTokens);

  if (
    inputTokens === 0 &&
    outputTokens === 0 &&
    cacheReadTokens === 0 &&
    cacheWriteTokens === 0 &&
    reasoningTokens === 0
  ) {
    return null;
  }
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    reasoningTokens,
  };
}

function extractToolCalls(msg: GeminiMessage): Array<{
  name: string;
  args?: Record<string, unknown>;
  status?: string;
  result?: unknown;
}> {
  const calls: Array<{
    name: string;
    args?: Record<string, unknown>;
    status?: string;
    result?: unknown;
  }> = [];

  if (Array.isArray(msg.toolCalls)) {
    for (const call of msg.toolCalls) {
      if (!call || typeof call !== "object") continue;
      const name = typeof call.name === "string" ? call.name : null;
      if (!name) continue;
      const args = isRecord(call.args)
        ? (call.args as Record<string, unknown>)
        : undefined;
      const status = typeof call.status === "string" ? call.status : undefined;
      const result =
        call.result ??
        call.response ??
        (call.error ? { error: call.error } : undefined);
      calls.push({ name, args, status, result });
    }
  }

  if (Array.isArray(msg.parts)) {
    for (const part of msg.parts) {
      const name = part.functionCall?.name;
      if (!name) continue;
      calls.push({
        name,
        args: part.functionCall?.args,
      });
    }
  }

  return calls;
}

function isErrorStatus(status: string | undefined): boolean {
  if (!status) return false;
  const normalized = status.toLowerCase();
  return !["success", "completed", "ok"].includes(normalized);
}

function toTimestampMs(value: unknown): number | null {
  if (typeof value !== "string" || !value) return null;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? null : ts;
}

function incrementPathCount(map: Map<string, number>, path: string) {
  if (!path.trim()) return;
  map.set(path, (map.get(path) || 0) + 1);
}

function getPathFromArgs(args: Record<string, unknown> | undefined): string | null {
  if (!args) return null;
  const candidates = [
    "file_path",
    "path",
    "filePath",
    "target",
    "dir",
    "dir_path",
    "directory",
    "cwd",
    "workspace",
    "root",
  ];
  for (const key of candidates) {
    const value = args[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function trackToolPaths(
  name: string,
  args: Record<string, unknown> | undefined,
  filesReadMap: Map<string, number>,
  filesModifiedMap: Map<string, number>,
  searchedPaths: Set<string>,
) {
  const normalized = name.toLowerCase();
  const path = getPathFromArgs(args);
  if (!path) return;

  if (normalized.includes("read")) {
    incrementPathCount(filesReadMap, path);
    return;
  }
  if (
    normalized.includes("write") ||
    normalized.includes("edit") ||
    normalized.includes("patch")
  ) {
    incrementPathCount(filesModifiedMap, path);
    return;
  }
  if (
    normalized.includes("search") ||
    normalized.includes("grep") ||
    normalized.includes("glob") ||
    normalized.includes("list")
  ) {
    searchedPaths.add(path);
  }
}
