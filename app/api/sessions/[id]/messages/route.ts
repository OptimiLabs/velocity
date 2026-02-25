import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { parseJsonlFile, parseJsonlPage } from "@/lib/parser/jsonl";
import { pairToolCallsWithResults } from "@/lib/parser/pair-tool-calls";
import { jsonWithCache } from "@/lib/api/cache-headers";
import type { Session } from "@/types/session";
import {
  getCodexModel,
  getCodexTokenTotals,
  normalizeCodexContent,
} from "@/lib/parser/codex";
import { calculateCostDetailed } from "@/lib/cost/calculator";
import {
  getUsageBreakdownFromRecord,
  getUsageCostUsd,
} from "@/lib/sessions/transcript-normalizer";
import fs from "fs";
import path from "path";

interface TranscriptContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  name?: string;
  id?: string;
  input?: unknown;
  content?: string | Array<{ type: string; text?: string }>;
  tool_use_id?: string;
  is_error?: boolean;
  _toolName?: string;
}

interface TranscriptMessage {
  type: "user" | "assistant";
  timestamp?: string;
  message: {
    role: "user" | "assistant";
    content: string | TranscriptContentBlock[];
    model?: string;
    usage?: Record<string, unknown>;
  };
  cost?: {
    usd: number | null;
    confidence: "reported" | "estimated" | "unpriced" | "none";
    pricingStatus: "priced" | "unpriced" | "none";
    reason?: "model_not_found" | "missing_rate_fields";
    totalTokens: number;
    model?: string;
  };
  _absorbed?: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function toText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function createTextMessage(
  role: "user" | "assistant",
  text: string,
  timestamp?: string,
): TranscriptMessage | null {
  if (!text.trim()) return null;
  return {
    type: role,
    timestamp,
    message: {
      role,
      content: text,
    },
  };
}

function normalizeCodexTranscript(rawMessages: unknown[]): TranscriptMessage[] {
  const normalized: TranscriptMessage[] = [];
  const fallbackResponseMessages: TranscriptMessage[] = [];
  let sawEventConversation = false;
  let currentModel: string | undefined;
  let previousTokenTotals = {
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
  };
  let pendingAssistantUsage: Record<string, unknown> | null = null;

  function mergeUsage(
    current: Record<string, unknown> | undefined,
    incoming: Record<string, unknown>,
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...(current || {}) };
    for (const [key, value] of Object.entries(incoming)) {
      const next = typeof value === "number" && Number.isFinite(value) ? value : 0;
      const existing =
        typeof merged[key] === "number" && Number.isFinite(merged[key])
          ? (merged[key] as number)
          : 0;
      merged[key] = existing + next;
    }
    return merged;
  }

  function attachUsageToMessage(
    message: TranscriptMessage,
    usage: Record<string, unknown> | null,
  ) {
    if (!usage) return;
    message.message.usage = mergeUsage(message.message.usage, usage);
    if (!message.message.model && currentModel) {
      message.message.model = currentModel;
    }
  }

  function attachUsageToLatestAssistant(
    usage: Record<string, unknown>,
  ): boolean {
    for (let i = normalized.length - 1; i >= 0; i--) {
      const candidate = normalized[i];
      if (candidate.message.role !== "assistant") continue;
      attachUsageToMessage(candidate, usage);
      return true;
    }
    return false;
  }

  for (const entry of rawMessages) {
    const row = asRecord(entry);
    if (!row) continue;

    const modelFromContext = getCodexModel(
      row as unknown as Parameters<typeof getCodexModel>[0],
    );
    if (modelFromContext) {
      currentModel = modelFromContext;
    }

    const timestamp = asString(row.timestamp);
    const type = asString(row.type);
    const payload = asRecord(row.payload);
    const payloadType = asString(payload?.type);

    if (type === "event_msg" && payloadType === "user_message") {
      sawEventConversation = true;
      const text = asString(payload?.message) || "";
      const msg = createTextMessage("user", text, timestamp);
      if (msg) normalized.push(msg);
      continue;
    }

    if (type === "event_msg" && payloadType === "agent_message") {
      sawEventConversation = true;
      const text = asString(payload?.message) || "";
      const msg = createTextMessage("assistant", text, timestamp);
      if (msg) {
        msg.message.model = currentModel;
        attachUsageToMessage(msg, pendingAssistantUsage);
        pendingAssistantUsage = null;
        normalized.push(msg);
      }
      continue;
    }

    if (type === "event_msg" && payloadType === "agent_reasoning") {
      const text = asString(payload?.text) || "";
      if (!text.trim()) continue;
      normalized.push({
        type: "assistant",
        timestamp,
        message: {
          role: "assistant",
          content: [{ type: "thinking", thinking: text }],
          model: currentModel,
          usage: pendingAssistantUsage || undefined,
        },
      });
      pendingAssistantUsage = null;
      continue;
    }

    if (type === "response_item" && payloadType === "reasoning") {
      const summary = Array.isArray(payload?.summary)
        ? payload.summary
            .map((item) => asString(asRecord(item)?.text) || "")
            .filter(Boolean)
            .join("\n")
        : "";
      const text = summary || asString(payload?.text) || "";
      if (!text.trim()) continue;
      normalized.push({
        type: "assistant",
        timestamp,
        message: {
          role: "assistant",
          content: [{ type: "thinking", thinking: text }],
          model: currentModel,
          usage: pendingAssistantUsage || undefined,
        },
      });
      pendingAssistantUsage = null;
      continue;
    }

    if (type === "event_msg" && payloadType === "token_count") {
      const totals = getCodexTokenTotals(
        row as unknown as Parameters<typeof getCodexTokenTotals>[0],
      );
      if (!totals) continue;

      const inputDiff = totals.inputTokens - previousTokenTotals.inputTokens;
      const outputDiff = totals.outputTokens - previousTokenTotals.outputTokens;
      const reasoningDiff =
        totals.reasoningOutputTokens - previousTokenTotals.reasoningTokens;
      const cacheReadDiff =
        totals.cacheReadTokens - previousTokenTotals.cacheReadTokens;
      const cacheWriteDiff =
        totals.cacheWriteTokens - previousTokenTotals.cacheWriteTokens;
      const totalDiff = totals.totalTokens - previousTokenTotals.totalTokens;
      const sawCounterReset =
        inputDiff < 0 ||
        outputDiff < 0 ||
        reasoningDiff < 0 ||
        cacheReadDiff < 0 ||
        cacheWriteDiff < 0 ||
        totalDiff < 0;
      const canUseLastUsageFallback =
        totals.lastInputTokens > 0 ||
        totals.lastOutputTokens > 0 ||
        totals.lastReasoningOutputTokens > 0 ||
        totals.lastCacheReadTokens > 0 ||
        totals.lastCacheWriteTokens > 0 ||
        totals.lastTotalTokens > 0;

      const rawDelta = sawCounterReset && canUseLastUsageFallback
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
            cacheReadTokens: Math.max(0, cacheReadDiff),
            cacheWriteTokens: Math.max(0, cacheWriteDiff),
            totalTokens: Math.max(0, totalDiff),
          };
      const outputFromTotal = Math.max(
        0,
        rawDelta.totalTokens - rawDelta.inputTokens,
      );
      const delta = {
        ...rawDelta,
        outputTokens: Math.max(rawDelta.outputTokens, outputFromTotal),
      };

      previousTokenTotals = {
        inputTokens: totals.inputTokens,
        outputTokens: totals.outputTokens,
        reasoningTokens: totals.reasoningOutputTokens,
        cacheReadTokens: totals.cacheReadTokens,
        cacheWriteTokens: totals.cacheWriteTokens,
        totalTokens: totals.totalTokens,
      };

      const tokenTotal =
        delta.inputTokens +
        delta.outputTokens +
        delta.cacheReadTokens +
        delta.cacheWriteTokens;
      if (tokenTotal <= 0) continue;

      const usage: Record<string, unknown> = {
        input_tokens: delta.inputTokens,
        output_tokens: delta.outputTokens,
        cached_input_tokens: delta.cacheReadTokens,
      };
      if (delta.reasoningTokens > 0) {
        usage.reasoning_output_tokens = delta.reasoningTokens;
      }
      if (delta.cacheWriteTokens > 0) {
        usage.cache_creation_input_tokens = delta.cacheWriteTokens;
      }

      if (!attachUsageToLatestAssistant(usage)) {
        pendingAssistantUsage = mergeUsage(pendingAssistantUsage || undefined, usage);
      }
      continue;
    }

    if (type === "response_item" && payloadType === "function_call") {
      const name = asString(payload?.name) || "unknown";
      const callId = asString(payload?.call_id);
      const argsRaw = asString(payload?.arguments);
      let input: unknown = undefined;
      if (argsRaw) {
        try {
          input = JSON.parse(argsRaw);
        } catch {
          input = argsRaw;
        }
      }
      normalized.push({
        type: "assistant",
        timestamp,
        message: {
          role: "assistant",
          content: [{ type: "tool_use", name, id: callId, input }],
          model: currentModel,
          usage: pendingAssistantUsage || undefined,
        },
      });
      pendingAssistantUsage = null;
      continue;
    }

    if (type === "response_item" && payloadType === "custom_tool_call") {
      const name = asString(payload?.name) || "unknown";
      const callId = asString(payload?.call_id);
      const input = payload?.input;
      normalized.push({
        type: "assistant",
        timestamp,
        message: {
          role: "assistant",
          content: [{ type: "tool_use", name, id: callId, input }],
          model: currentModel,
          usage: pendingAssistantUsage || undefined,
        },
      });
      pendingAssistantUsage = null;
      continue;
    }

    if (type === "response_item" && payloadType === "web_search_call") {
      const callId = asString(payload?.call_id);
      normalized.push({
        type: "assistant",
        timestamp,
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              name: "web_search_call",
              id: callId,
              input: payload?.action,
            },
          ],
          model: currentModel,
          usage: pendingAssistantUsage || undefined,
        },
      });
      pendingAssistantUsage = null;
      continue;
    }

    if (
      type === "response_item" &&
      (payloadType === "function_call_output" ||
        payloadType === "custom_tool_call_output")
    ) {
      const callId = asString(payload?.call_id);
      const output = toText(payload?.output);
      normalized.push({
        type: "user",
        timestamp,
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: callId,
              content: output,
            },
          ],
        },
      });
      continue;
    }

    if (type === "response_item" && payloadType === "message") {
      const role = asString(payload?.role);
      if (role !== "user" && role !== "assistant") continue;
      const normalizedContent = normalizeCodexContent(payload?.content);
      const blocks: TranscriptContentBlock[] = normalizedContent.map((block) => ({
        type: block.type,
        text: block.text,
      }));
      if (blocks.length === 0) continue;
      fallbackResponseMessages.push({
        type: role,
        timestamp,
        message: {
          role,
          content: blocks,
          model: asString(payload?.model) || currentModel,
          usage: asRecord(payload?.usage) ?? undefined,
        },
      });
    }
  }

  if (!sawEventConversation && fallbackResponseMessages.length > 0) {
    normalized.push(...fallbackResponseMessages);
  }

  return normalized;
}

function parseGeminiParts(
  parts: unknown[],
): { blocks: TranscriptContentBlock[]; fallbackText: string[] } {
  const blocks: TranscriptContentBlock[] = [];
  const fallbackText: string[] = [];

  for (const partRaw of parts) {
    const part = asRecord(partRaw);
    if (!part) continue;
    const text = asString(part.text);
    if (text && text.trim()) {
      blocks.push({ type: "text", text });
      continue;
    }

    const functionCall = asRecord(part.functionCall);
    if (functionCall) {
      const name = asString(functionCall.name) || "unknown";
      blocks.push({
        type: "tool_use",
        name,
        id: asString(functionCall.id),
        input: functionCall.args,
      });
      continue;
    }

    const functionResponse = asRecord(part.functionResponse);
    if (functionResponse) {
      const toolName = asString(functionResponse.name);
      blocks.push({
        type: "tool_result",
        tool_use_id: asString(functionResponse.id),
        content: toText(functionResponse.response),
        _toolName: toolName,
      });
      continue;
    }

    fallbackText.push(toText(part));
  }

  return { blocks, fallbackText };
}

function normalizeGeminiTranscript(filePath: string): TranscriptMessage[] {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  const rows = Array.isArray(parsed)
    ? parsed
    : Array.isArray(asRecord(parsed)?.messages)
      ? (asRecord(parsed)?.messages as unknown[])
      : [];

  const messages: TranscriptMessage[] = [];
  for (const rowRaw of rows) {
    const row = asRecord(rowRaw);
    if (!row) continue;

    const roleRaw = (
      asString(row.type) ||
      asString(row.role) ||
      "assistant"
    ).toLowerCase();

    const role: "user" | "assistant" =
      roleRaw === "user" ? "user" : "assistant";

    const parts = Array.isArray(row.parts) ? row.parts : [];
    const { blocks, fallbackText } = parseGeminiParts(parts);
    const contentRaw = row.content;
    let content: string | TranscriptContentBlock[] = blocks;

    if (blocks.length === 0) {
      if (typeof contentRaw === "string" && contentRaw.trim()) {
        content = contentRaw;
      } else if (Array.isArray(contentRaw)) {
        const text = contentRaw
          .map((item) => asString(asRecord(item)?.text) || toText(item))
          .filter(Boolean)
          .join("\n");
        if (text.trim()) content = text;
        else continue;
      } else {
        const text = fallbackText.join("\n").trim();
        if (!text) continue;
        content = text;
      }
    }

    const metadata = asRecord(row.metadata);
    messages.push({
      type: role,
      timestamp: asString(row.timestamp),
      message: {
        role,
        content,
        model: asString(row.model) || asString(metadata?.model),
        usage: asRecord(row.tokens) ?? undefined,
      },
    });
  }

  return messages;
}

function paginateMessages(
  messages: TranscriptMessage[],
  page: number,
  limit: number,
): { messages: TranscriptMessage[]; total: number; page: number; totalPages: number } {
  const total = messages.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const resolvedPage = page === -1 ? totalPages : Math.min(Math.max(page, 1), totalPages);
  const start = (resolvedPage - 1) * limit;
  const pageMessages = messages.slice(start, start + limit);
  return { messages: pageMessages, total, page: resolvedPage, totalPages };
}

function annotateMessageCosts(messages: TranscriptMessage[]): TranscriptMessage[] {
  return messages.map((msg) => {
    const usage =
      msg.message?.usage && typeof msg.message.usage === "object"
        ? (msg.message.usage as Record<string, unknown>)
        : undefined;
    if (!usage) {
      return {
        ...msg,
        cost: {
          usd: null,
          confidence: "none",
          pricingStatus: "none",
          totalTokens: 0,
          model: msg.message?.model,
        },
      };
    }

    const breakdown = getUsageBreakdownFromRecord(usage);
    const totalTokens =
      breakdown.input +
      breakdown.output +
      breakdown.cacheRead +
      breakdown.cacheWrite;
    const reportedCost = getUsageCostUsd(usage);
    const model = msg.message?.model;

    if (reportedCost !== null) {
      return {
        ...msg,
        cost: {
          usd: reportedCost,
          confidence: "reported",
          pricingStatus: "priced",
          totalTokens,
          model,
        },
      };
    }

    if (!model || totalTokens <= 0) {
      return {
        ...msg,
        cost: {
          usd: null,
          confidence: totalTokens > 0 ? "unpriced" : "none",
          pricingStatus: totalTokens > 0 ? "unpriced" : "none",
          reason: totalTokens > 0 ? "model_not_found" : undefined,
          totalTokens,
          model,
        },
      };
    }

    const estimate = calculateCostDetailed(
      model,
      breakdown.input,
      breakdown.output,
      breakdown.cacheRead,
      breakdown.cacheWrite,
    );

    if (estimate.status === "unpriced") {
      return {
        ...msg,
        cost: {
          usd: null,
          confidence: "unpriced",
          pricingStatus: "unpriced",
          reason: estimate.reason ?? "model_not_found",
          totalTokens,
          model,
        },
      };
    }

    return {
      ...msg,
      cost: {
        usd: estimate.cost,
        confidence: "estimated",
        pricingStatus: "priced",
        totalTokens,
        model,
      },
    };
  });
}

function resolveProvider(session: Session): "claude" | "codex" | "gemini" {
  if (session.provider === "codex" || session.project_id === "codex-sessions") {
    return "codex";
  }
  if (
    session.provider === "gemini" ||
    session.project_id === "gemini-sessions"
  ) {
    return "gemini";
  }
  if (session.id.startsWith("codex-")) return "codex";
  if (session.id.startsWith("gemini-")) return "gemini";
  const normalizedPath = session.jsonl_path || "";
  if (normalizedPath.includes(`${path.sep}.codex${path.sep}`)) return "codex";
  if (normalizedPath.includes(`${path.sep}.gemini${path.sep}`)) return "gemini";
  return "claude";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
    | Session
    | undefined;

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  try {
    const url = new URL(request.url);
    const limit = Math.min(
      Math.max(
        parseInt(url.searchParams.get("limit") || "200", 10) || 200,
        1,
      ),
      500,
    );

    // First pass: we need total to compute default page (last page).
    // parseJsonlPage streams the file — only the requested page is kept in memory.
    // If no page param, we need a count-only pass first for the default-to-last-page behavior.
    const rawPage = url.searchParams.get("page");

    // page=-1 tells parseJsonlPage to return the last page in a single pass
    const requestedPage = rawPage
      ? Math.max(parseInt(rawPage, 10) || 1, 1)
      : -1;
    const provider = resolveProvider(session);

    let messages: unknown[] = [];
    let total = 0;
    let page = 1;
    let totalPages = 1;

    if (provider === "gemini") {
      const transcript = normalizeGeminiTranscript(session.jsonl_path);
      const paged = paginateMessages(transcript, requestedPage, limit);
      messages = paged.messages;
      total = paged.total;
      page = paged.page;
      totalPages = paged.totalPages;
    } else if (provider === "codex") {
      const rawTranscript = await parseJsonlFile(session.jsonl_path);
      const transcript = normalizeCodexTranscript(rawTranscript as unknown[]);
      const paged = paginateMessages(transcript, requestedPage, limit);
      messages = paged.messages;
      total = paged.total;
      page = paged.page;
      totalPages = paged.totalPages;
    } else {
      const result = await parseJsonlPage(
        session.jsonl_path,
        requestedPage,
        limit,
      );
      messages = result.messages;
      total = result.total;
      page = result.page;
      totalPages = Math.max(1, Math.ceil(total / limit));

      // Clamp if caller requested a page beyond the end
      if (rawPage && page > totalPages) {
        const clamped = await parseJsonlPage(
          session.jsonl_path,
          totalPages,
          limit,
        );
        messages = clamped.messages;
        page = totalPages;
      }
    }

    // Pair tool_use blocks with their corresponding tool_result blocks
    const pairedMessages = pairToolCallsWithResults(
      messages as Array<{
        type: string;
        message?: {
          role: string;
          content: string | TranscriptContentBlock[];
        };
      }>,
    );
    const pricedMessages = annotateMessageCosts(
      pairedMessages as TranscriptMessage[],
    );

    return jsonWithCache(
      {
        messages: pricedMessages,
        total,
        page,
        pageSize: limit,
        totalPages,
        hasMore: page > 1,
      },
      "detail",
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to read session file" },
      { status: 500 },
    );
  }
}
