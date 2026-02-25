import fs from "fs";
import { calculateCost } from "@/lib/cost/calculator";
import { categorizeFilePath } from "@/lib/parser/session-utils";
import { isCoreToolForProvider } from "@/lib/tools/provider-tools";
import type { SessionStats } from "@/lib/parser/session-aggregator";
import type {
  ToolUsageEntry,
  ModelUsageEntry,
  EnrichedToolData,
  FileReadEntry,
  FileWriteEntry,
} from "@/types/session";

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
  content?: unknown;
  timestamp?: string;
  [key: string]: unknown;
}

interface GeminiSessionFile {
  startTime?: string;
  lastUpdated?: string;
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
    sessionDurationMs: 0,
    detectedProvider: "gemini",
  };
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

  const toolUsage: Record<string, ToolUsageEntry> = {};
  const modelUsage: Record<string, ModelUsageEntry> = {};
  const filesReadMap = new Map<string, number>();
  const filesModifiedMap = new Map<string, number>();
  const searchedPaths = new Set<string>();
  const detectedInstructionPaths: string[] = [];

  const sessionObject = isRecord(parsedSession)
    ? (parsedSession as GeminiSessionFile)
    : null;
  const sessionStartTs = toTimestampMs(sessionObject?.startTime);
  const sessionEndTs = toTimestampMs(sessionObject?.lastUpdated);
  let firstMessageTs: number | null = sessionStartTs;
  let lastMessageTs: number | null = sessionEndTs;
  let firstUserMessage: string | null = null;
  let lastModelMessage: string | null = null;
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
        if (delta > 0 && delta < 600_000) {
          turnLatencies.push(delta);
        }
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
      const cost = calculateCost(
        modelForTokens,
        tokenSnapshot.inputTokens,
        tokenSnapshot.outputTokens,
        tokenSnapshot.cacheReadTokens,
        tokenSnapshot.cacheWriteTokens,
      );
      modelEntry.cost += cost;

      stats.inputTokens += tokenSnapshot.inputTokens;
      stats.outputTokens += tokenSnapshot.outputTokens;
      stats.cacheReadTokens += tokenSnapshot.cacheReadTokens;
      stats.cacheWriteTokens += tokenSnapshot.cacheWriteTokens;
      stats.totalCost += cost;
    }

    for (const call of extractToolCalls(msg)) {
      if (!call.name) continue;
      const entry = ensureTool(call.name);
      entry.count++;
      stats.toolCallCount++;
      if (isErrorStatus(call.status)) {
        entry.errorCount++;
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
      detectedInstructionPaths.push(fr.path);
    }
  }

  const coreTools: Record<string, number> = {};
  const otherTools: Record<string, number> = {};
  for (const [name, entry] of Object.entries(toolUsage)) {
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

  stats.toolUsage = toolUsage;
  stats.modelUsage = modelUsage;
  stats.enrichedTools = {
    skills: [],
    agents: [],
    mcpTools: {},
    coreTools,
    otherTools,
    filesModified,
    filesRead,
    searchedPaths: [...searchedPaths],
  };
  stats.detectedInstructionPaths = detectedInstructionPaths;
  stats.autoSummary = lastModelMessage || firstUserMessage;

  if (turnLatencies.length > 0) {
    turnLatencies.sort((a, b) => a - b);
    stats.avgLatencyMs =
      turnLatencies.reduce((sum, value) => sum + value, 0) /
      turnLatencies.length;
    stats.p50LatencyMs = turnLatencies[Math.floor(turnLatencies.length * 0.5)] ?? 0;
    stats.p95LatencyMs =
      turnLatencies[
        Math.min(
          Math.ceil(turnLatencies.length * 0.95) - 1,
          turnLatencies.length - 1,
        )
      ] ?? 0;
    stats.maxLatencyMs = turnLatencies[turnLatencies.length - 1] ?? 0;
  }

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

function extractMessageText(content: unknown, parts?: GeminiPart[]): string | null {
  if (typeof content === "string" && content.trim().length > 0) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const chunks = content
      .map((item) => {
        if (typeof item === "string") return item;
        if (isRecord(item) && typeof item.text === "string") return item.text;
        return "";
      })
      .filter(Boolean);
    if (chunks.length > 0) return chunks.join("\n").trim();
  }

  if (Array.isArray(parts)) {
    const chunks = parts
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .filter(Boolean);
    if (chunks.length > 0) return chunks.join("\n").trim();
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
} | null {
  if (!isRecord(tokens)) return null;
  const inputTokens =
    asNumber(tokens.input) ??
    asNumber(tokens.inputTokens) ??
    asNumber(tokens.input_tokens) ??
    asNumber(tokens.promptTokenCount) ??
    asNumber(tokens.prompt_tokens) ??
    0;
  const outputTokens =
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

  if (
    inputTokens === 0 &&
    outputTokens === 0 &&
    cacheReadTokens === 0 &&
    cacheWriteTokens === 0
  ) {
    return null;
  }
  return { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens };
}

function extractToolCalls(msg: GeminiMessage): Array<{
  name: string;
  args?: Record<string, unknown>;
  status?: string;
}> {
  const calls: Array<{
    name: string;
    args?: Record<string, unknown>;
    status?: string;
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
      calls.push({ name, args, status });
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
  const candidates = ["file_path", "path", "filePath", "target", "dir"];
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
