import path from "path";
import { streamJsonlFile, type JsonlMessage } from "./jsonl";
import { calculateCost } from "../cost/calculator";
import { generateAutoSummary } from "./summary-generator";
import { categorizeFilePath, normalizeFilesModified } from "./session-utils";
import { isCoreToolForProvider } from "@/lib/tools/provider-tools";
import type { SkillEntry, AgentEntry, EnrichedToolData, FileReadEntry, FileWriteEntry, ToolUsageEntry, ModelUsageEntry } from "@/types/session";
import type { ConfigProvider } from "@/types/provider";
import { detectSessionProvider } from "@/lib/providers/session-registry";
import { AGENTS_DIR, LEGACY_SKILLS_DIR, SKILLS_DIR } from "@/lib/claude-paths";
import { CODEX_VELOCITY_AGENTS_DIR } from "@/lib/codex/paths";
import { getCodexInstructionDirs } from "@/lib/codex/skills";
import { GEMINI_AGENTS_DIR, GEMINI_SKILLS_DIR } from "@/lib/gemini/paths";

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
  sessionDurationMs: number;
  detectedProvider: ConfigProvider;
}

const SUMMARY_HEAD = 5;
const SUMMARY_TAIL = 5;

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
    return [path.join(GEMINI_SKILLS_DIR, `${skillName}.md`)];
  }
  return [
    path.join(SKILLS_DIR, skillName, "SKILL.md"),
    path.join(LEGACY_SKILLS_DIR, `${skillName}.md`),
  ];
}

function getAgentPathCandidate(
  provider: ConfigProvider,
  agentType: string,
): string {
  if (provider === "codex") {
    return path.join(CODEX_VELOCITY_AGENTS_DIR, `${agentType}.md`);
  }
  if (provider === "gemini") {
    return path.join(GEMINI_AGENTS_DIR, `${agentType}.md`);
  }
  return path.join(AGENTS_DIR, `${agentType}.md`);
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

  // Latency tracking
  const turnLatencies: number[] = [];
   
  let lastUserTimestamp: number | null = null;
   
  let firstMessageTimestamp: number | null = null;
   
  let lastMessageTimestamp: number | null = null;

  // Collect first N + last N messages for auto-summary (ring buffer for tail)
  const headMessages: JsonlMessage[] = [];
  const tailMessages: JsonlMessage[] = [];

  for await (const msg of streamJsonlFile(jsonlPath)) {
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
          if (delta > 0 && delta < 600_000) {
            // Cap at 10 minutes to filter outliers
            turnLatencies.push(delta);
          }
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
      if (model) {
        msgCost = calculateCost(model, inp, out, cache, cacheWrite);
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
          };
        }
        modelUsage[model].inputTokens += inp;
        modelUsage[model].outputTokens += out;
        modelUsage[model].cacheReadTokens += cache;
        modelUsage[model].cacheWriteTokens += cacheWrite;
        modelUsage[model].cost += msgCost;
        modelUsage[model].messageCount++;
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
    detectedInstructionPathSet.add(
      getAgentPathCandidate(detectedProvider, a.type),
    );
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

  // Compute latency percentiles
  let avgLatencyMs = 0;
  let p50LatencyMs = 0;
  let p95LatencyMs = 0;
  let maxLatencyMs = 0;
  if (turnLatencies.length > 0) {
    turnLatencies.sort((a, b) => a - b);
    avgLatencyMs =
      turnLatencies.reduce((sum, v) => sum + v, 0) / turnLatencies.length;
    p50LatencyMs =
      turnLatencies[Math.floor(turnLatencies.length * 0.5)] ?? 0;
    p95LatencyMs =
      turnLatencies[Math.min(Math.ceil(turnLatencies.length * 0.95) - 1, turnLatencies.length - 1)] ?? 0;
    maxLatencyMs = turnLatencies[turnLatencies.length - 1] ?? 0;
  }
  const sessionDurationMs =
    firstMessageTimestamp !== null && lastMessageTimestamp !== null
      ? lastMessageTimestamp - firstMessageTimestamp
      : 0;

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
    avgLatencyMs,
    p50LatencyMs,
    p95LatencyMs,
    maxLatencyMs,
    sessionDurationMs,
    detectedProvider,
  };
}
