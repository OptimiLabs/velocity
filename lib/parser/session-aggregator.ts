import path from "path";
import { streamJsonlFile, type JsonlMessage } from "./jsonl";
import { calculateCostDetailed } from "../cost/calculator";
import { generateAutoSummary } from "./summary-generator";
import { categorizeFilePath, normalizeFilesModified } from "./session-utils";
import { isCoreToolForProvider } from "@/lib/tools/provider-tools";
import type { SkillEntry, AgentEntry, EnrichedToolData, FileReadEntry, FileWriteEntry, ToolUsageEntry, ModelUsageEntry } from "@/types/session";
import type { ConfigProvider } from "@/types/provider";
import { detectSessionProvider } from "@/lib/providers/session-registry";
import { AGENTS_DIR, LEGACY_SKILLS_DIR, SKILLS_DIR } from "@/lib/claude-paths";
import { CODEX_VELOCITY_AGENTS_DIR } from "@/lib/codex/paths";
import { getCodexInstructionDirs } from "@/lib/codex/skills";
import { getGeminiAgentDirs, getGeminiSkillDirs } from "@/lib/gemini/paths";
import { maybeRecordTurnLatency, summarizeLatencies } from "./latency";

export { categorizeFilePath, normalizeFilesModified };
export type { ToolUsageEntry, ModelUsageEntry };

// Provider detection delegated to session registry
export { detectSessionProvider as detectProvider };

export interface SessionStats {
  messageCount: number;
  toolCallCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  thinkingBlocks: number;
  totalCost: number;
  toolUsage: Record<string, ToolUsageEntry>;
  modelUsage: Record<string, ModelUsageEntry>;
  enrichedTools: EnrichedToolData;
  autoSummary: string | null;
  sessionRole: "subagent" | "standalone";
  tags: string[];
  detectedInstructionPaths: string[];
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  maxLatencyMs: number;
  latencySampleCount: number;
  sessionDurationMs: number;
  pricingStatus: "priced" | "mixed" | "unpriced";
  unpricedTokens: number;
  unpricedMessages: number;
  detectedProvider: ConfigProvider;
  effortMode: string | null;
  firstPrompt?: string | null;
  gitBranch?: string | null;
  projectPath?: string | null;
}

const SUMMARY_HEAD = 5;
const SUMMARY_TAIL = 5;
const EFFORT_KEYS = [
  "effort",
  "effort_mode",
  "reasoning_effort",
  "reasoningEffort",
  "model_reasoning_effort",
  "modelReasoningEffort",
  "effortLevel",
] as const;
const ENV_EFFORT_KEYS = [
  "CLAUDE_CODE_EFFORT_LEVEL",
  "claude_code_effort_level",
  "MODEL_REASONING_EFFORT",
  "model_reasoning_effort",
] as const;

function getUsageTokenValue(
  usage: Record<string, unknown>,
  keys: string[],
): number {
  for (const key of keys) {
    const value = usage[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeEffortMode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (!/^[a-z0-9_-]{2,24}$/.test(normalized)) return null;
  return normalized;
}

function getStringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function extractEffortModeFromRecord(
  root: Record<string, unknown>,
): string | null {
  const queue: Record<string, unknown>[] = [root];
  const seen = new Set<Record<string, unknown>>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);

    for (const key of EFFORT_KEYS) {
      const mode = normalizeEffortMode(current[key]);
      if (mode) return mode;
    }

    for (const key of ENV_EFFORT_KEYS) {
      const mode = normalizeEffortMode(current[key]);
      if (mode) return mode;
    }

    const nested = [
      asRecord(current.data),
      asRecord(current.message),
      asRecord(current.metadata),
      asRecord(current.settings),
      asRecord(current.config),
      asRecord(current.context),
      asRecord(current.source),
      asRecord(current.payload),
      asRecord(current.env),
      asRecord(current.environment),
      asRecord(current.environment_variables),
      asRecord(current.vars),
      asRecord(current.turn_context),
      asRecord(current.turnContext),
      asRecord(current.collaboration_mode),
      asRecord(current.collaborationMode),
    ];

    for (const candidate of nested) {
      if (candidate) queue.push(candidate);
    }
  }

  return null;
}

function extractGitBranchFromRecord(
  root: Record<string, unknown>,
): string | null {
  const queue: Record<string, unknown>[] = [root];
  const seen = new Set<Record<string, unknown>>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);

    const branch =
      getStringValue(current.git_branch) ??
      getStringValue(current.gitBranch) ??
      (asRecord(current.git) ? getStringValue(asRecord(current.git)?.branch) : null);
    if (branch) return branch;

    const nested = [
      asRecord(current.data),
      asRecord(current.message),
      asRecord(current.metadata),
      asRecord(current.settings),
      asRecord(current.config),
      asRecord(current.context),
      asRecord(current.payload),
      asRecord(current.turn_context),
      asRecord(current.turnContext),
      asRecord(current.source),
      asRecord(current.git),
    ];

    for (const candidate of nested) {
      if (candidate) queue.push(candidate);
    }
  }

  return null;
}

function extractProjectPathFromRecord(
  root: Record<string, unknown>,
): string | null {
  const queue: Record<string, unknown>[] = [root];
  const seen = new Set<Record<string, unknown>>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);

    const projectPath =
      getStringValue(current.project_path) ??
      getStringValue(current.projectPath) ??
      getStringValue(current.cwd) ??
      getStringValue(current.working_directory) ??
      getStringValue(current.workspace);
    if (projectPath) return projectPath;

    const nested = [
      asRecord(current.data),
      asRecord(current.message),
      asRecord(current.metadata),
      asRecord(current.settings),
      asRecord(current.config),
      asRecord(current.context),
      asRecord(current.payload),
      asRecord(current.turn_context),
      asRecord(current.turnContext),
      asRecord(current.source),
    ];

    for (const candidate of nested) {
      if (candidate) queue.push(candidate);
    }
  }

  return null;
}

function extractUserPrompt(content: unknown): string | null {
  if (typeof content === "string") {
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (!Array.isArray(content)) return null;

  const chunks = content
    .map((block) => {
      if (!block || typeof block !== "object") return "";
      const record = block as Record<string, unknown>;
      if (record.type !== "text") return "";
      return getStringValue(record.text) ?? "";
    })
    .filter(Boolean);

  if (chunks.length === 0) return null;
  return chunks.join("\n").trim();
}

function getSkillPathCandidates(
  provider: ConfigProvider,
  skillName: string,
): string[] {
  if (provider === "codex") {
    return getCodexInstructionDirs().flatMap((dir) => [
      path.join(dir, skillName, "SKILL.md"),
      path.join(dir, `${skillName}.md`),
    ]);
  }
  if (provider === "gemini") {
    return getGeminiSkillDirs().map((dir) => path.join(dir, `${skillName}.md`));
  }
  return [
    path.join(SKILLS_DIR, skillName, "SKILL.md"),
    path.join(LEGACY_SKILLS_DIR, `${skillName}.md`),
  ];
}

function getAgentPathCandidates(
  provider: ConfigProvider,
  agentType: string,
): string[] {
  if (provider === "codex") {
    return [path.join(CODEX_VELOCITY_AGENTS_DIR, `${agentType}.md`)];
  }
  if (provider === "gemini") {
    return getGeminiAgentDirs().map((dir) => path.join(dir, `${agentType}.md`));
  }
  return [path.join(AGENTS_DIR, `${agentType}.md`)];
}

export async function aggregateSession(
  jsonlPath: string,
): Promise<SessionStats> {
  let messageCount = 0;
  let toolCallCount = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let thinkingBlocks = 0;
  let totalCost = 0;
  let unpricedTokens = 0;
  let unpricedMessages = 0;
  const toolUsage: Record<string, ToolUsageEntry> = {};
  const modelUsage: Record<string, ModelUsageEntry> = {};
  const skills: SkillEntry[] = [];
  const agents: AgentEntry[] = [];
  const mcpTools: Record<string, number> = {};
  const filesModifiedMap = new Map<string, number>(); // path → write count
  const filesReadMap = new Map<string, number>(); // path → read count
  const searchedPaths = new Set<string>();
  const toolUseIdToName = new Map<string, string>(); // tool_use id → tool name (for error tracking)
  let isSidechain = false;
  let detectedEffortMode: string | null = null;
  let detectedGitBranch: string | null = null;
  let detectedProjectPath: string | null = null;
  let firstPrompt: string | null = null;

  // Latency tracking
  const turnLatencies: number[] = [];
   
  let lastUserTimestamp: number | null = null;
   
  let firstMessageTimestamp: number | null = null;
   
  let lastMessageTimestamp: number | null = null;

  // Collect first N + last N messages for auto-summary (ring buffer for tail)
  const headMessages: JsonlMessage[] = [];
  const tailMessages: JsonlMessage[] = [];

  for await (const msg of streamJsonlFile(jsonlPath)) {
    const msgRecord = msg as Record<string, unknown>;
    const effortMode = extractEffortModeFromRecord(
      msgRecord,
    );
    if (effortMode) {
      detectedEffortMode = effortMode;
    }
    const gitBranch = extractGitBranchFromRecord(msgRecord);
    if (gitBranch) detectedGitBranch = gitBranch;
    const projectPath = extractProjectPathFromRecord(msgRecord);
    if (projectPath) detectedProjectPath = projectPath;

    // Collect for summary
    if (headMessages.length < SUMMARY_HEAD) {
      headMessages.push(msg);
    } else {
      tailMessages.push(msg);
      if (tailMessages.length > SUMMARY_TAIL) {
        tailMessages.shift();
      }
    }

    if ((msg as Record<string, unknown>)["isSidechain"] === true) {
      isSidechain = true;
    }

    if (!msg.message) continue;

    const { role, content, model, usage } = msg.message;
    if (!firstPrompt && role === "user") {
      const prompt = extractUserPrompt(content);
      if (prompt) firstPrompt = prompt.slice(0, 500);
    }

    // Track timestamps for latency computation
    if (msg.timestamp) {
      const ts = new Date(msg.timestamp).getTime();
      if (!isNaN(ts)) {
        if (firstMessageTimestamp === null) firstMessageTimestamp = ts;
        lastMessageTimestamp = ts;

        if (role === "user") {
          lastUserTimestamp = ts;
        } else if (role === "assistant" && lastUserTimestamp !== null) {
          const delta = ts - lastUserTimestamp;
          maybeRecordTurnLatency(turnLatencies, delta);
          lastUserTimestamp = null;
        }
      }
    }

    if (role === "user" || role === "assistant") {
      messageCount++;
    }

    // Collect tool names from this message for token attribution
    const msgToolNames: string[] = [];

    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === "thinking") thinkingBlocks++;
        if (block.type === "tool_use" && block.name) {
          toolCallCount++;
          msgToolNames.push(block.name);
          if (!toolUsage[block.name]) {
            toolUsage[block.name] = {
              name: block.name,
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
          toolUsage[block.name].count++;

          // Track tool_use id for error correlation with tool_result
          if (block.id) {
            toolUseIdToName.set(block.id as string, block.name);
          }

          const input = block.input as Record<string, unknown> | undefined;

          // Skill detection
          if (block.name === "Skill" && input?.skill) {
            const skillName = String(input.skill);
            const existing = skills.find((s) => s.name === skillName);
            if (existing) {
              existing.count++;
            } else {
              skills.push({ name: skillName, count: 1 });
            }
          }

          // Agent detection
          if (block.name === "Task" && input?.subagent_type) {
            agents.push({
              type: String(input.subagent_type),
              description: String(input.description || ""),
            });
          }

          // MCP tool detection
          if (block.name.startsWith("mcp__")) {
            const segments = block.name.split("__");
            const serverName = segments[1] || block.name;
            mcpTools[serverName] = (mcpTools[serverName] || 0) + 1;
          }

          // File tracking
          if (
            (block.name === "Write" || block.name === "Edit") &&
            input?.file_path
          ) {
            const fp = String(input.file_path);
            filesModifiedMap.set(fp, (filesModifiedMap.get(fp) || 0) + 1);
          }

          // File read tracking
          if (block.name === "Read" && input?.file_path) {
            const fp = String(input.file_path);
            filesReadMap.set(fp, (filesReadMap.get(fp) || 0) + 1);
          }
          // Search path tracking
          if (
            (block.name === "Grep" || block.name === "Glob") &&
            input?.path
          ) {
            searchedPaths.add(String(input.path));
          }
        }

        // Error tracking: correlate tool_result errors with their tool_use
        if (
          block.type === "tool_result" &&
          block.is_error === true &&
          block.tool_use_id
        ) {
          const linkedToolName = toolUseIdToName.get(
            block.tool_use_id as string,
          );
          if (linkedToolName && toolUsage[linkedToolName]) {
            toolUsage[linkedToolName].errorCount++;
          }
        }
      }
    }

    if (usage) {
      const usageRecord = usage as Record<string, unknown>;
      const inp = getUsageTokenValue(usageRecord, [
        "input_tokens",
        "inputTokens",
        "prompt_tokens",
        "promptTokenCount",
      ]);
      const out = getUsageTokenValue(usageRecord, [
        "output_tokens",
        "outputTokens",
        "completion_tokens",
        "candidatesTokenCount",
      ]);
      const cache = getUsageTokenValue(usageRecord, [
        "cache_read_input_tokens",
        "cache_read_tokens",
        "cached_input_tokens",
        "cacheReadInputTokens",
        "cacheReadTokens",
        "cachedInputTokens",
      ]);
      const cacheWrite = getUsageTokenValue(usageRecord, [
        "cache_creation_input_tokens",
        "cache_creation_tokens",
        "cache_write_input_tokens",
        "cache_write_tokens",
        "cacheCreationInputTokens",
        "cacheCreationTokens",
        "cacheWriteInputTokens",
        "cacheWriteTokens",
      ]);

      inputTokens += inp;
      outputTokens += out;
      cacheReadTokens += cache;
      cacheWriteTokens += cacheWrite;

      let msgCost = 0;
      let messageWasUnpriced = false;
      if (model) {
        const costResult = calculateCostDetailed(
          model,
          inp,
          out,
          cache,
          cacheWrite,
        );
        msgCost = costResult.cost;
        totalCost += msgCost;

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
          };
        }
        modelUsage[model].inputTokens += inp;
        modelUsage[model].outputTokens += out;
        modelUsage[model].cacheReadTokens += cache;
        modelUsage[model].cacheWriteTokens += cacheWrite;
        modelUsage[model].cost += msgCost;
        modelUsage[model].messageCount++;
        if (costResult.status === "unpriced" && costResult.totalBillableTokens > 0) {
          messageWasUnpriced = true;
          const modelEntry = modelUsage[model];
          modelEntry.pricingStatus = "unpriced";
          modelEntry.pricingReason = costResult.reason ?? "model_not_found";
          modelEntry.unpricedTokens =
            (modelEntry.unpricedTokens || 0) + costResult.totalBillableTokens;
        }
      } else if (inp + out + cache + cacheWrite > 0) {
        messageWasUnpriced = true;
      }

      if (messageWasUnpriced) {
        unpricedTokens += inp + out + cache + cacheWrite;
        unpricedMessages += 1;
      }

      // Attribute message tokens proportionally across tool calls in this message
      if (msgToolNames.length > 0) {
        const share = 1 / msgToolNames.length;
        for (const toolName of msgToolNames) {
          const entry = toolUsage[toolName];
          entry.inputTokens += Math.round(inp * share);
          entry.outputTokens += Math.round(out * share);
          entry.cacheReadTokens += Math.round(cache * share);
          entry.cacheWriteTokens += Math.round(cacheWrite * share);
          entry.totalTokens += Math.round(
            (inp + out + cache + cacheWrite) * share,
          );
          entry.estimatedCost += msgCost * share;
        }
      }
    }
  }

  // Merge head + tail for summary generation (preserves order)
  const summaryMessages = [...headMessages, ...tailMessages];
  const autoSummary = generateAutoSummary(summaryMessages);

  const detectedProvider = detectSessionProvider(modelUsage);

  const coreTools: Record<string, number> = {};
  const otherTools: Record<string, number> = {};

  for (const [name, entry] of Object.entries(toolUsage)) {
    if (name === "Skill" || name === "Task" || name.startsWith("mcp__"))
      continue;
    if (isCoreToolForProvider(name, detectedProvider)) {
      coreTools[name] = entry.count;
    } else {
      otherTools[name] = entry.count;
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

  const enrichedTools: EnrichedToolData = {
    skills,
    agents,
    mcpTools,
    coreTools,
    otherTools,
    filesModified,
    filesRead,
    searchedPaths: [...searchedPaths],
  };

  // Collect detected instruction file paths from enriched data
  const detectedInstructionPathSet = new Set<string>();
  for (const fr of filesRead) {
    if (fr.category === "knowledge" || fr.category === "instruction") {
      detectedInstructionPathSet.add(fr.path);
    }
  }
  for (const s of skills) {
    for (const candidate of getSkillPathCandidates(detectedProvider, s.name)) {
      detectedInstructionPathSet.add(candidate);
    }
  }
  for (const a of agents) {
    for (const candidate of getAgentPathCandidates(detectedProvider, a.type)) {
      detectedInstructionPathSet.add(candidate);
    }
  }
  const detectedInstructionPaths = [...detectedInstructionPathSet];

  // Determine session role
  const sessionRole: "subagent" | "standalone" = isSidechain
    ? "subagent"
    : "standalone";

  // Auto-generate tags
  const tags: string[] = [];
  if (agents.length > 0) {
    const spawnedTypes = new Set(agents.map((a) => a.type));
    for (const t of spawnedTypes) tags.push(`spawns:${t}`);
  }
  for (const s of skills) tags.push(`skill:${s.name}`);

  const latency = summarizeLatencies(turnLatencies);
  const sessionDurationMs =
    firstMessageTimestamp !== null && lastMessageTimestamp !== null
      ? lastMessageTimestamp - firstMessageTimestamp
      : 0;
  const billableTokensTotal =
    inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;
  const pricedTokens = Math.max(0, billableTokensTotal - unpricedTokens);
  const pricingStatus: SessionStats["pricingStatus"] =
    unpricedTokens <= 0
      ? "priced"
      : pricedTokens > 0
        ? "mixed"
        : "unpriced";

  return {
    messageCount,
    toolCallCount,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    thinkingBlocks,
    totalCost,
    toolUsage,
    modelUsage,
    enrichedTools,
    autoSummary,
    sessionRole,
    tags,
    detectedInstructionPaths,
    avgLatencyMs: latency.avgLatencyMs,
    p50LatencyMs: latency.p50LatencyMs,
    p95LatencyMs: latency.p95LatencyMs,
    maxLatencyMs: latency.maxLatencyMs,
    latencySampleCount: latency.sampleCount,
    sessionDurationMs,
    pricingStatus,
    unpricedTokens,
    unpricedMessages,
    detectedProvider,
    effortMode: detectedEffortMode,
    firstPrompt,
    gitBranch: detectedGitBranch,
    projectPath: detectedProjectPath,
  };
}
