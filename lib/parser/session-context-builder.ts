import type { Session, ScopeOptions, EnrichedToolData, FileWriteEntry } from "@/types/session";
import { normalizeFilesModified } from "@/lib/parser/session-aggregator";
import {
  computeCostBreakdown,
  computeCacheEfficiency,
  computeToolCostEstimates,
} from "@/lib/cost/analysis";
import { streamJsonlFile } from "./jsonl";
import fs from "fs";

export interface ScopedProfile {
  label: string;
  id: string;
  slug: string;
  metrics?: {
    messageCount: number;
    toolCallCount: number;
    thinkingBlocks: number;
    tokens: {
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
    };
    cost: ReturnType<typeof computeCostBreakdown>;
    cache: ReturnType<typeof computeCacheEfficiency>;
    topTools: Array<{
      name: string;
      calls: number;
      tokens: number;
      cost: number;
      pct: number;
    }>;
    models: Record<string, unknown>;
    duration: { created: string; modified: string };
  };
  summaries?: {
    summary: string;
    firstPrompt: string;
  };
  userPrompts?: string[];
  assistantResponses?: string[];
  toolDetails?: {
    filesRead: string[];
    filesModified: string[];
    skills: Array<{ name: string; count: number }>;
    agents: Array<{ type: string; description: string }>;
    mcpTools: Record<string, number>;
  };
}

const MAX_MESSAGES_PER_SESSION = 50;

function extractTextFromContent(
  content: unknown,
  role: "user" | "assistant",
): string | null {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const textParts = content
      .filter((block) => {
        if (role === "user") return block.type === "text";
        return block.type === "text";
      })
      .map((block) => block.text || "")
      .filter(Boolean);
    return textParts.length > 0 ? textParts.join("\n") : null;
  }
  return null;
}

async function extractAllMessages(
  jsonlPath: string,
  role: "user" | "assistant",
): Promise<string[]> {
  const messages: string[] = [];
  if (!fs.existsSync(jsonlPath)) return messages;
  for await (const entry of streamJsonlFile(jsonlPath)) {
    if (entry.message?.role !== role) continue;
    const text = extractTextFromContent(entry.message.content, role);
    if (text) messages.push(text);
  }
  return messages;
}

async function extractMessages(
  jsonlPath: string,
  role: "user" | "assistant",
  limit = MAX_MESSAGES_PER_SESSION,
  sampling: "first" | "first-last" = "first",
): Promise<string[]> {
  const effectiveLimit = limit === -1 ? Infinity : limit;

  if (sampling === "first-last" && effectiveLimit !== Infinity) {
    const all = await extractAllMessages(jsonlPath, role);
    if (all.length <= effectiveLimit) return all;

    const firstCount = Math.ceil(effectiveLimit / 2);
    const lastCount = Math.floor(effectiveLimit / 2);
    const first = all.slice(0, firstCount);
    const last = all.slice(-lastCount);
    return [...first, "--- (messages omitted) ---", ...last];
  }

  // "first" strategy or unlimited — stream and stop at limit
  const messages: string[] = [];
  if (!fs.existsSync(jsonlPath)) return messages;
  for await (const entry of streamJsonlFile(jsonlPath)) {
    if (messages.length >= effectiveLimit) break;
    if (entry.message?.role !== role) continue;
    const text = extractTextFromContent(entry.message.content, role);
    if (text) messages.push(text);
  }
  return messages;
}

export async function buildScopedContext(
  sessions: Session[],
  scope: ScopeOptions,
): Promise<{ profiles: ScopedProfile[]; estimatedInputTokens: number }> {
  const profiles: ScopedProfile[] = [];

  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    const profile: ScopedProfile = {
      label: `Session ${i + 1}`,
      id: s.id,
      slug: s.slug || s.id.slice(0, 12),
    };

    if (scope.metrics) {
      const cost = computeCostBreakdown(s);
      const cache = computeCacheEfficiency(s);
      const tools = computeToolCostEstimates(s);
      let modelBreakdown: Record<string, unknown> = {};
      try {
        modelBreakdown = JSON.parse(s.model_usage);
      } catch {}

      profile.metrics = {
        messageCount: s.message_count,
        toolCallCount: s.tool_call_count,
        thinkingBlocks: s.thinking_blocks,
        tokens: {
          input: s.input_tokens,
          output: s.output_tokens,
          cacheRead: s.cache_read_tokens,
          cacheWrite: s.cache_write_tokens,
        },
        cost,
        cache,
        topTools: tools.slice(0, 10).map((t) => ({
          name: t.name,
          calls: t.count,
          tokens: t.totalTokens,
          cost: t.estimatedCost,
          pct: t.pctOfTotal,
        })),
        models: modelBreakdown,
        duration: { created: s.created_at, modified: s.modified_at },
      };
    }

    if (scope.summaries) {
      profile.summaries = {
        summary: s.summary || "(no summary)",
        firstPrompt: s.first_prompt || "(no first prompt)",
      };
    }

    const messageLimit = scope.messageLimit ?? MAX_MESSAGES_PER_SESSION;
    const samplingStrategy = scope.samplingStrategy ?? "first";

    if (scope.userPrompts) {
      profile.userPrompts = await extractMessages(
        s.jsonl_path,
        "user",
        messageLimit,
        samplingStrategy,
      );
    }

    if (scope.assistantResponses) {
      profile.assistantResponses = await extractMessages(
        s.jsonl_path,
        "assistant",
        messageLimit,
        samplingStrategy,
      );
    }

    if (scope.toolDetails) {
      try {
        const parsed = JSON.parse(s.enriched_tools) as EnrichedToolData & { filesModified: string[] | FileWriteEntry[] };
        const normalized = normalizeFilesModified(parsed.filesModified || []);
        profile.toolDetails = {
          filesRead: (parsed.filesRead || []).map((f) => f.path),
          filesModified: normalized.map((f) => f.path),
          skills: parsed.skills || [],
          agents: parsed.agents || [],
          mcpTools: parsed.mcpTools || {},
        };
      } catch {
        profile.toolDetails = {
          filesRead: [],
          filesModified: [],
          skills: [],
          agents: [],
          mcpTools: {},
        };
      }
    }

    profiles.push(profile);
  }

  const estimatedInputTokens = Math.ceil(JSON.stringify(profiles).length / 4);

  return { profiles, estimatedInputTokens };
}
