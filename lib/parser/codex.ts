import type { JsonlMessage } from "./jsonl";

export interface CodexTokenTotals {
  inputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  contextWindow: number | null;
  lastInputTokens: number;
  lastOutputTokens: number;
  lastReasoningOutputTokens: number;
  lastCacheReadTokens: number;
  lastCacheWriteTokens: number;
  lastTotalTokens: number;
}

export function isCodexEvent(msg: JsonlMessage): boolean {
  return !msg.message && typeof msg.type === "string" && "payload" in msg;
}

function normalizeCodexModelName(model: string): string {
  const normalized = model.trim().toLowerCase();
  if (/^gpt-5(\.\d+)?$/.test(normalized)) {
    return `${normalized}-codex`;
  }
  return normalized;
}

export function getCodexModel(msg: JsonlMessage): string | null {
  const payload = (msg as { payload?: Record<string, unknown> }).payload;
  if (!payload || typeof payload !== "object") return null;
  if (msg.type === "turn_context" && typeof payload.model === "string") {
    return normalizeCodexModelName(payload.model);
  }
  const payloadType = String(payload.type || "");
  if (payloadType === "turn_context" && typeof payload.model === "string") {
    return normalizeCodexModelName(payload.model);
  }
  return null;
}

export function getCodexTokenTotals(msg: JsonlMessage): CodexTokenTotals | null {
  const payload = (msg as { payload?: Record<string, unknown> }).payload;
  if (!payload || typeof payload !== "object") return null;
  if (msg.type !== "event_msg") return null;
  if (payload.type !== "token_count") return null;
  const info = payload.info as Record<string, unknown> | null | undefined;
  if (!info || typeof info !== "object") return null;
  const totals = info.total_token_usage as
    | Record<string, number | null | undefined>
    | undefined;
  const last = info.last_token_usage as
    | Record<string, number | null | undefined>
    | undefined;
  const usage = totals && typeof totals === "object" ? totals : last;
  if (!usage || typeof usage !== "object") return null;

  const num = (
    obj: Record<string, number | null | undefined>,
    keys: string[],
  ): number => {
    for (const key of keys) {
      const value = obj[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
    }
    return 0;
  };

  const inputTokens = num(usage, [
    "input_tokens",
    "inputTokens",
    "prompt_tokens",
    "promptTokenCount",
  ]);
  const outputTokens = num(usage, [
    "output_tokens",
    "outputTokens",
    "completion_tokens",
    "candidatesTokenCount",
  ]);
  const reasoningOutputTokens = num(usage, [
    "reasoning_output_tokens",
    "reasoningOutputTokens",
  ]);
  const cacheReadTokens = num(usage, [
    "cached_input_tokens",
    "cache_read_input_tokens",
    "cache_read_tokens",
    "cachedInputTokens",
    "cacheReadInputTokens",
    "cacheReadTokens",
  ]);
  const cacheWriteTokens = num(usage, [
    "cache_creation_input_tokens",
    "cache_creation_tokens",
    "cache_write_input_tokens",
    "cache_write_tokens",
    "cacheCreationInputTokens",
    "cacheCreationTokens",
    "cacheWriteInputTokens",
    "cacheWriteTokens",
  ]);
  const totalTokens = num(usage, ["total_tokens", "totalTokens"]);
  const contextWindow =
    typeof info.model_context_window === "number"
      ? info.model_context_window
      : null;
  const lastUsage =
    last && typeof last === "object"
      ? (last as Record<string, number | null | undefined>)
      : {};
  const lastInputTokens = num(lastUsage, [
    "input_tokens",
    "inputTokens",
    "prompt_tokens",
    "promptTokenCount",
  ]);
  const lastOutputTokens = num(lastUsage, [
    "output_tokens",
    "outputTokens",
    "completion_tokens",
    "candidatesTokenCount",
  ]);
  const lastReasoningOutputTokens = num(lastUsage, [
    "reasoning_output_tokens",
    "reasoningOutputTokens",
  ]);
  const lastCacheReadTokens = num(lastUsage, [
    "cached_input_tokens",
    "cache_read_input_tokens",
    "cache_read_tokens",
    "cachedInputTokens",
    "cacheReadInputTokens",
    "cacheReadTokens",
  ]);
  const lastCacheWriteTokens = num(lastUsage, [
    "cache_creation_input_tokens",
    "cache_creation_tokens",
    "cache_write_input_tokens",
    "cache_write_tokens",
    "cacheCreationInputTokens",
    "cacheCreationTokens",
    "cacheWriteInputTokens",
    "cacheWriteTokens",
  ]);
  const lastTotalTokens = num(lastUsage, ["total_tokens", "totalTokens"]);

  return {
    inputTokens,
    outputTokens,
    reasoningOutputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens,
    contextWindow,
    lastInputTokens,
    lastOutputTokens,
    lastReasoningOutputTokens,
    lastCacheReadTokens,
    lastCacheWriteTokens,
    lastTotalTokens,
  };
}

export function normalizeCodexContent(
  content: unknown,
): Array<{ type: string; text?: string }> {
  if (!Array.isArray(content)) return [];
  return content
    .map((block) => {
      if (!block || typeof block !== "object") return null;
      const b = block as { type?: string; text?: string };
      if (!b.type) return null;
      if (b.type === "input_text" || b.type === "output_text") {
        return { type: "text", text: b.text || "" };
      }
      if (b.type === "text") return { type: "text", text: b.text || "" };
      return null;
    })
    .filter(Boolean) as Array<{ type: string; text?: string }>;
}

export function extractCodexSummaryText(payload: Record<string, unknown>): string {
  const summary = payload.summary;
  if (Array.isArray(summary)) {
    const parts = summary
      .map((s) =>
        typeof s === "object" && s && "text" in s ? String((s as { text?: string }).text || "") : "",
      )
      .filter(Boolean);
    if (parts.length > 0) return parts.join("\n");
  }
  if (typeof payload.text === "string") return payload.text;
  return "";
}

export function parseCodexToolInput(payload: Record<string, unknown>): unknown {
  if (payload.input !== undefined) return payload.input;
  const args = payload.arguments;
  if (typeof args === "string") {
    try {
      return JSON.parse(args);
    } catch {
      return { raw: args };
    }
  }
  return undefined;
}

export function inferCodexToolError(output: string, status?: string): boolean {
  if (status && status !== "completed" && status !== "success") return true;
  const match = output.match(/Exit code:\s*(\d+)/i);
  if (match) return match[1] !== "0";
  return false;
}
