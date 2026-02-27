import path from "path";
import { calculateCostDetailed } from "@/lib/cost/calculator";
import { CODEX_VELOCITY_AGENTS_DIR } from "@/lib/codex/paths";
import { getCodexInstructionDirs } from "@/lib/codex/skills";
import {
  getCodexModel,
  getCodexTokenTotals,
  inferCodexToolError,
  parseCodexToolInput,
} from "@/lib/parser/codex";
import { streamJsonlFile } from "@/lib/parser/jsonl";
import { categorizeFilePath } from "@/lib/parser/session-utils";
import { isCoreToolForProvider } from "@/lib/tools/provider-tools";
import type { SessionStats } from "@/lib/parser/session-aggregator";
import type {
  AgentEntry,
  EnrichedToolData,
  FileReadEntry,
  FileWriteEntry,
  ModelUsageEntry,
  SkillEntry,
  ToolUsageEntry,
} from "@/types/session";
import {
  maybeRecordTurnLatency,
  summarizeLatencies,
} from "@/lib/parser/latency";

interface TokenSnapshot {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
}

const EMPTY_SNAPSHOT: TokenSnapshot = {
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 0,
};

function createEmptyToolUsage(name: string): ToolUsageEntry {
  return {
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

function createEmptyModelUsage(model: string): ModelUsageEntry {
  return {
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

function createEmptyStats(): SessionStats {
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
    detectedProvider: "codex",
    effortMode: null,
  };
}

function getSkillPathCandidates(skillName: string, projectPath: string | null): string[] {
  const dirs = projectPath
    ? [...getCodexInstructionDirs(projectPath), ...getCodexInstructionDirs()]
    : getCodexInstructionDirs();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const dir of dirs) {
    for (const candidate of [
      path.join(dir, skillName, "SKILL.md"),
      path.join(dir, `${skillName}.md`),
    ]) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      out.push(candidate);
    }
  }
  return out;
}

function getAgentPathCandidates(
  agentType: string,
  projectPath: string | null,
): string[] {
  const out = [path.join(CODEX_VELOCITY_AGENTS_DIR, `${agentType}.md`)];
  if (projectPath) {
    out.unshift(path.join(projectPath, ".codex", "agents", `${agentType}.md`));
  }
  return out;
}

function incrementPathCount(map: Map<string, number>, path: string) {
  if (!path.trim()) return;
  map.set(path, (map.get(path) || 0) + 1);
}

function extractApplyPatchPaths(rawPatch: string): string[] {
  const paths: string[] = [];
  const re = /\*\*\*\s+(?:Add|Update|Delete)\s+File:\s+(.+)/g;
  let match: RegExpExecArray | null = null;
  while ((match = re.exec(rawPatch)) !== null) {
    const filePath = match[1]?.trim();
    if (filePath) paths.push(filePath);
  }
  return paths;
}

function parseToolOutputError(rawOutput: unknown): boolean {
  if (typeof rawOutput !== "string" || rawOutput.length === 0) return false;

  try {
    const parsed = JSON.parse(rawOutput) as {
      metadata?: { exit_code?: number };
      error?: unknown;
      status?: string;
    };
    if (
      parsed.metadata &&
      typeof parsed.metadata.exit_code === "number" &&
      parsed.metadata.exit_code !== 0
    ) {
      return true;
    }
    if (parsed.error) return true;
    if (typeof parsed.status === "string") {
      return inferCodexToolError(rawOutput, parsed.status);
    }
  } catch {
    // fall through to text-based detection
  }

  if (inferCodexToolError(rawOutput)) return true;
  return /process exited with code\s+(-?\d+)/i.test(rawOutput) &&
    !/process exited with code\s+0/i.test(rawOutput);
}

function getRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  return value as Record<string, unknown>;
}

function getString(
  value: unknown,
): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function normalizeEffortMode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (!/^[a-z0-9_-]{2,24}$/.test(normalized)) return null;
  return normalized;
}

function normalizeTagValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "");
  if (!normalized) return null;
  if (normalized.length > 40) return normalized.slice(0, 40);
  return normalized;
}

function extractCodexEffortMode(
  payload: Record<string, unknown> | undefined,
): string | null {
  if (!payload) return null;

  const direct =
    normalizeEffortMode(payload.effort) ??
    normalizeEffortMode(payload.effort_mode) ??
    normalizeEffortMode(payload.model_reasoning_effort) ??
    normalizeEffortMode(payload.reasoning_effort) ??
    normalizeEffortMode(payload.reasoningEffort);
  if (direct) return direct;

  const collaborationMode = getRecord(payload.collaboration_mode);
  const settings = getRecord(collaborationMode?.settings);
  return (
    normalizeEffortMode(settings?.reasoning_effort) ??
    normalizeEffortMode(settings?.reasoningEffort) ??
    normalizeEffortMode(settings?.model_reasoning_effort) ??
    normalizeEffortMode(settings?.modelReasoningEffort) ??
    normalizeEffortMode(settings?.effort)
  );
}

function applyModelDelta(
  modelUsage: Record<string, ModelUsageEntry>,
  model: string,
  delta: TokenSnapshot,
): { cost: number; unpricedTokens: number } {
  const costResult = calculateCostDetailed(
    model,
    delta.inputTokens,
    delta.outputTokens,
    delta.cacheReadTokens,
    delta.cacheWriteTokens,
  );
  const entry = modelUsage[model] ?? createEmptyModelUsage(model);
  entry.inputTokens += delta.inputTokens;
  entry.outputTokens += delta.outputTokens;
  entry.cacheReadTokens += delta.cacheReadTokens;
  entry.cacheWriteTokens += delta.cacheWriteTokens;
  entry.reasoningTokens = (entry.reasoningTokens || 0) + delta.reasoningTokens;
  entry.cost += costResult.cost;
  if (costResult.status === "unpriced" && costResult.totalBillableTokens > 0) {
    entry.pricingStatus = "unpriced";
    entry.pricingReason = costResult.reason ?? "model_not_found";
    entry.unpricedTokens =
      (entry.unpricedTokens || 0) + costResult.totalBillableTokens;
  }
  modelUsage[model] = entry;
  return {
    cost: costResult.cost,
    unpricedTokens:
      costResult.status === "unpriced" ? costResult.totalBillableTokens : 0,
  };
}

export async function parseCodexSession(filePath: string): Promise<SessionStats> {
  const stats = createEmptyStats();

  const toolUsage: Record<string, ToolUsageEntry> = {};
  const modelUsage: Record<string, ModelUsageEntry> = {};
  const skills: SkillEntry[] = [];
  const agents: AgentEntry[] = [];
  const mcpTools: Record<string, number> = {};
  const filesModifiedMap = new Map<string, number>();
  const filesReadMap = new Map<string, number>();
  const searchedPaths = new Set<string>();
  const toolCallIdToName = new Map<string, string>();
  const modelMessageCounts = new Map<string, number>();

  let currentModel: string | null = null;
  let firstUserMessage: string | null = null;
  let lastAgentMessage: string | null = null;
  let isSubagent = false;
  let detectedEffortMode: string | null = null;
  let detectedProjectPath: string | null = null;
  let detectedGitBranch: string | null = null;
  let detectedApprovalPolicy: string | null = null;
  let detectedSandboxMode: string | null = null;
  let detectedCollaborationMode: string | null = null;

  // Latency/session duration tracking
  const turnLatencies: number[] = [];
  let lastUserTimestamp: number | null = null;
  let firstMessageTimestamp: number | null = null;
  let lastMessageTimestamp: number | null = null;

  let previousTotals: TokenSnapshot = { ...EMPTY_SNAPSHOT };

  function ensureTool(name: string): ToolUsageEntry {
    if (!toolUsage[name]) toolUsage[name] = createEmptyToolUsage(name);
    return toolUsage[name];
  }

  function ensureModel(model: string): ModelUsageEntry {
    if (!modelUsage[model]) modelUsage[model] = createEmptyModelUsage(model);
    return modelUsage[model];
  }

  function markToolCall(
    name: string,
    callId: string | undefined,
    input: unknown,
    status?: string,
  ) {
    const normalizedName = name.toLowerCase();
    const entry = ensureTool(name);
    entry.count++;
    stats.toolCallCount++;

    if (callId) {
      toolCallIdToName.set(callId, name);
    }

    if (status && inferCodexToolError("", status)) {
      entry.errorCount++;
    }

    if (normalizedName.startsWith("mcp__")) {
      const segments = name.split("__");
      const serverName = segments[1] || name;
      mcpTools[serverName] = (mcpTools[serverName] || 0) + 1;
    }

    const record = getRecord(input);
    if (!record) {
      if (normalizedName === "apply_patch" && typeof input === "string") {
        for (const patchPath of extractApplyPatchPaths(input)) {
          incrementPathCount(filesModifiedMap, patchPath);
        }
      }
      return;
    }

    if (normalizedName === "skill") {
      const skillName = getString(record.skill) ?? getString(record.name);
      if (skillName) {
        const existing = skills.find((s) => s.name === skillName);
        if (existing) existing.count++;
        else skills.push({ name: skillName, count: 1 });
      }
    }

    if (normalizedName === "task" || normalizedName === "spawn_agent") {
      const subagentType =
        getString(record.subagent_type) ??
        getString(record.agent_type) ??
        getString(record.agentType) ??
        getString(record.name);
      if (subagentType) {
        agents.push({
          type: subagentType,
          description: getString(record.description) || "",
        });
      }
    }

    if (normalizedName === "apply_patch") {
      const patchText =
        getString(record.patch) ??
        getString(record.input) ??
        getString(record.diff) ??
        "";
      for (const patchPath of extractApplyPatchPaths(patchText)) {
        incrementPathCount(filesModifiedMap, patchPath);
      }
    }

    if (normalizedName === "read_file" || normalizedName === "read") {
      const readPath =
        getString(record.file_path) ??
        getString(record.filePath) ??
        getString(record.path);
      if (readPath) incrementPathCount(filesReadMap, readPath);
    }

    if (
      (normalizedName === "write_file" ||
        normalizedName === "edit_file" ||
        normalizedName === "write" ||
        normalizedName === "edit")
    ) {
      const writePath =
        getString(record.file_path) ??
        getString(record.filePath) ??
        getString(record.path) ??
        getString(record.target);
      if (writePath) incrementPathCount(filesModifiedMap, writePath);
    }

    if (
      (normalizedName === "search_files" ||
        normalizedName === "grep" ||
        normalizedName === "glob")
    ) {
      const searchPath =
        getString(record.path) ??
        getString(record.dir_path) ??
        getString(record.directory) ??
        getString(record.cwd);
      if (searchPath) searchedPaths.add(searchPath);
    }
  }

  for await (const msg of streamJsonlFile(filePath)) {
    // Track timestamps for latency/duration metrics
    if (msg.timestamp) {
      const ts = new Date(msg.timestamp).getTime();
      if (!Number.isNaN(ts)) {
        if (firstMessageTimestamp === null) firstMessageTimestamp = ts;
        lastMessageTimestamp = ts;
      }
    }

    const modelFromContext = getCodexModel(msg);
    if (modelFromContext) {
      currentModel = modelFromContext;
      ensureModel(modelFromContext);
    }

    if (msg.type === "session_meta") {
      const payload = getRecord((msg as { payload?: unknown }).payload);
      const source = getRecord(payload?.source);
      if (source?.subagent) isSubagent = true;
      const cwd = getString(payload?.cwd);
      if (cwd) detectedProjectPath = cwd;
      const git = getRecord(payload?.git);
      const branch =
        getString(git?.branch) ??
        getString(source?.git_branch) ??
        getString(source?.gitBranch) ??
        (getRecord(source?.git) ? getString(getRecord(source?.git)?.branch) : undefined) ??
        getString(payload?.git_branch) ??
        getString(payload?.gitBranch);
      if (branch) detectedGitBranch = branch;
    }

    const payload = getRecord((msg as { payload?: unknown }).payload);
    const payloadType = getString(payload?.type);

    if (msg.type === "turn_context" || payloadType === "turn_context") {
      const effortMode = extractCodexEffortMode(payload);
      if (effortMode) {
        detectedEffortMode = effortMode;
      }
      const approvalPolicy =
        normalizeTagValue(payload?.approval_policy) ??
        normalizeTagValue(payload?.approvalPolicy);
      if (approvalPolicy) detectedApprovalPolicy = approvalPolicy;
      const sandboxPolicy = getRecord(payload?.sandbox_policy);
      const sandboxMode =
        normalizeTagValue(sandboxPolicy?.type) ??
        normalizeTagValue(payload?.sandbox_mode) ??
        normalizeTagValue(payload?.sandboxMode);
      if (sandboxMode) detectedSandboxMode = sandboxMode;
      const collaborationMode = getRecord(payload?.collaboration_mode);
      const collaborationModeName =
        normalizeTagValue(collaborationMode?.mode) ??
        normalizeTagValue(payload?.collaboration_mode_name) ??
        normalizeTagValue(payload?.collaborationMode);
      if (collaborationModeName) {
        detectedCollaborationMode = collaborationModeName;
      }
      const cwd = getString(payload?.cwd);
      if (cwd) detectedProjectPath = cwd;
      const git = getRecord(payload?.git);
      const branch =
        getString(git?.branch) ??
        getString(payload?.git_branch) ??
        getString(payload?.gitBranch);
      if (branch) detectedGitBranch = branch;
    }

    if (msg.type === "event_msg" && payloadType === "user_message") {
      stats.messageCount++;
      if (!firstUserMessage) {
        const m = getString(payload?.message);
        if (m) firstUserMessage = m.slice(0, 240);
      }

      if (msg.timestamp) {
        const ts = new Date(msg.timestamp).getTime();
        if (!Number.isNaN(ts)) lastUserTimestamp = ts;
      }
    } else if (msg.type === "event_msg" && payloadType === "agent_message") {
      stats.messageCount++;
      const m = getString(payload?.message);
      if (m) lastAgentMessage = m.slice(0, 500);

      if (currentModel) {
        modelMessageCounts.set(
          currentModel,
          (modelMessageCounts.get(currentModel) || 0) + 1,
        );
      }

      if (msg.timestamp && lastUserTimestamp !== null) {
        const ts = new Date(msg.timestamp).getTime();
        if (!Number.isNaN(ts)) {
          const delta = ts - lastUserTimestamp;
          maybeRecordTurnLatency(turnLatencies, delta);
        }
        lastUserTimestamp = null;
      }
    } else if (msg.type === "event_msg" && payloadType === "agent_reasoning") {
      stats.thinkingBlocks++;
    } else if (msg.type === "response_item" && payloadType === "reasoning") {
      stats.thinkingBlocks++;
    } else if (msg.type === "event_msg" && payloadType === "task_complete") {
      const finalMessage = getString(payload?.last_agent_message);
      if (finalMessage) lastAgentMessage = finalMessage.slice(0, 500);
    }

    const totals = getCodexTokenTotals(msg);
    if (totals) {
      const inputDiff = totals.inputTokens - previousTotals.inputTokens;
      const outputDiff = totals.outputTokens - previousTotals.outputTokens;
      const reasoningDiff =
        totals.reasoningOutputTokens - previousTotals.reasoningTokens;
      const cacheDiff = totals.cacheReadTokens - previousTotals.cacheReadTokens;
      const cacheWriteDiff =
        totals.cacheWriteTokens - previousTotals.cacheWriteTokens;
      const totalDiff = totals.totalTokens - previousTotals.totalTokens;
      const sawCounterReset =
        inputDiff < 0 ||
        outputDiff < 0 ||
        reasoningDiff < 0 ||
        cacheDiff < 0 ||
        cacheWriteDiff < 0 ||
        totalDiff < 0;
      const canUseLastUsageFallback =
        totals.lastInputTokens > 0 ||
        totals.lastOutputTokens > 0 ||
        totals.lastReasoningOutputTokens > 0 ||
        totals.lastCacheReadTokens > 0 ||
        totals.lastCacheWriteTokens > 0 ||
        totals.lastTotalTokens > 0;

      const rawDelta: TokenSnapshot =
        sawCounterReset && canUseLastUsageFallback
          ? {
              inputTokens: totals.lastInputTokens,
              outputTokens: totals.lastOutputTokens,
              reasoningTokens: totals.lastReasoningOutputTokens,
              cacheReadTokens: totals.lastCacheReadTokens,
              cacheWriteTokens: totals.lastCacheWriteTokens,
              totalTokens: totals.lastTotalTokens,
            }
          : {
              inputTokens: Math.max(0, inputDiff),
              outputTokens: Math.max(0, outputDiff),
              reasoningTokens: Math.max(0, reasoningDiff),
              cacheReadTokens: Math.max(0, cacheDiff),
              cacheWriteTokens: Math.max(0, cacheWriteDiff),
              totalTokens: Math.max(0, totalDiff),
            };
      // Codex logs may emit reasoning tokens separately from output tokens.
      // Derive billable output from total-input when available, then keep the max
      // to avoid undercounting while preventing double-charge if output already
      // includes reasoning.
      const outputFromTotal = Math.max(
        0,
        rawDelta.totalTokens - rawDelta.inputTokens,
      );
      const delta: TokenSnapshot = {
        ...rawDelta,
        outputTokens: Math.max(rawDelta.outputTokens, outputFromTotal),
      };
      previousTotals = {
        inputTokens: totals.inputTokens,
        outputTokens: totals.outputTokens,
        reasoningTokens: totals.reasoningOutputTokens,
        cacheReadTokens: totals.cacheReadTokens,
        cacheWriteTokens: totals.cacheWriteTokens,
        totalTokens: totals.totalTokens,
      };

      stats.inputTokens += delta.inputTokens;
      stats.outputTokens += delta.outputTokens;
      stats.cacheReadTokens += delta.cacheReadTokens;
      stats.cacheWriteTokens += delta.cacheWriteTokens;

      const modelForTokens =
        currentModel || Object.keys(modelUsage)[0] || "codex-unknown";
      ensureModel(modelForTokens);
      const deltaResult = applyModelDelta(modelUsage, modelForTokens, delta);
      stats.totalCost += deltaResult.cost;
      if (deltaResult.unpricedTokens > 0) {
        stats.unpricedTokens += deltaResult.unpricedTokens;
        stats.unpricedMessages += 1;
      }
    }

    if (msg.type === "response_item" && payloadType === "function_call") {
      const name = getString(payload?.name);
      if (!name) continue;
      const callId = getString(payload?.call_id);
      const argsRaw = getString(payload?.arguments);
      let parsedArgs: unknown = undefined;
      if (argsRaw) {
        try {
          parsedArgs = JSON.parse(argsRaw);
        } catch {
          parsedArgs = { raw: argsRaw };
        }
      }
      markToolCall(name, callId, parsedArgs);
      continue;
    }

    if (msg.type === "response_item" && payloadType === "custom_tool_call") {
      if (!payload) continue;
      const name = getString(payload?.name);
      if (!name) continue;
      const callId = getString(payload?.call_id);
      const status = getString(payload?.status);
      markToolCall(name, callId, parseCodexToolInput(payload), status);
      continue;
    }

    if (msg.type === "response_item" && payloadType === "web_search_call") {
      const status = getString(payload?.status);
      markToolCall("web_search_call", undefined, payload?.action, status);
      continue;
    }

    if (
      msg.type === "response_item" &&
      (payloadType === "function_call_output" ||
        payloadType === "custom_tool_call_output")
    ) {
      const callId = getString(payload?.call_id);
      if (!callId) continue;
      const toolName = toolCallIdToName.get(callId);
      if (!toolName) continue;
      const output = payload?.output;
      if (parseToolOutputError(output)) {
        ensureTool(toolName).errorCount++;
      }
      continue;
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

  const detectedInstructionPathSet = new Set<string>();
  for (const fr of filesRead) {
    if (fr.category === "knowledge" || fr.category === "instruction") {
      detectedInstructionPathSet.add(fr.path);
    }
  }
  for (const skill of skills) {
    for (const candidate of getSkillPathCandidates(
      skill.name,
      detectedProjectPath,
    )) {
      detectedInstructionPathSet.add(candidate);
    }
  }
  for (const agent of agents) {
    for (const candidate of getAgentPathCandidates(
      agent.type,
      detectedProjectPath,
    )) {
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
      name.startsWith("mcp__")
    ) {
      continue;
    }
    if (isCoreToolForProvider(name, "codex")) coreTools[name] = entry.count;
    else otherTools[name] = entry.count;
  }

  // Token attribution fallback for Codex events where per-call usage is unavailable.
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

  for (const [model, count] of modelMessageCounts.entries()) {
    ensureModel(model).messageCount = count;
  }

  for (const entry of Object.values(modelUsage)) {
    if (entry.messageCount === 0) {
      entry.messageCount = entry.inputTokens + entry.outputTokens > 0 ? 1 : 0;
    }
  }

  const tags: string[] = [];
  if (agents.length > 0) {
    const spawnedTypes = new Set(agents.map((a) => a.type));
    for (const t of spawnedTypes) tags.push(`spawns:${t}`);
  }
  for (const s of skills) tags.push(`skill:${s.name}`);
  if (detectedApprovalPolicy) tags.push(`approval:${detectedApprovalPolicy}`);
  if (detectedSandboxMode) tags.push(`sandbox:${detectedSandboxMode}`);
  if (detectedCollaborationMode) {
    tags.push(`mode:${detectedCollaborationMode}`);
  }

  const latency = summarizeLatencies(turnLatencies);

  const sessionDurationMs =
    firstMessageTimestamp !== null && lastMessageTimestamp !== null
      ? lastMessageTimestamp - firstMessageTimestamp
      : 0;
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

  stats.toolUsage = toolUsage;
  stats.modelUsage = modelUsage;
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
  stats.sessionRole = isSubagent ? "subagent" : "standalone";
  stats.tags = tags;
  stats.autoSummary = lastAgentMessage || firstUserMessage;
  stats.firstPrompt = firstUserMessage;
  stats.avgLatencyMs = latency.avgLatencyMs;
  stats.p50LatencyMs = latency.p50LatencyMs;
  stats.p95LatencyMs = latency.p95LatencyMs;
  stats.maxLatencyMs = latency.maxLatencyMs;
  stats.latencySampleCount = latency.sampleCount;
  stats.sessionDurationMs = Math.max(0, sessionDurationMs);
  stats.detectedProvider = "codex";
  stats.effortMode = detectedEffortMode;
  stats.projectPath = detectedProjectPath;
  stats.gitBranch = detectedGitBranch;

  return stats;
}
