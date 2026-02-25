interface TranscriptUsage {
  [key: string]: unknown;
}

interface TranscriptBlock {
  type: string;
  text?: string;
  thinking?: string;
  name?: string;
  id?: string;
  input?: unknown;
  content?: string | Array<{ type: string; text?: string }>;
  tool_use_id?: string;
  result?: string | Array<{ type: string; text?: string }>;
  is_error?: boolean;
  [key: string]: unknown;
}

interface TranscriptMessageBody {
  id?: string;
  role: string;
  content: string | TranscriptBlock[];
  model?: string;
  usage?: TranscriptUsage;
  [key: string]: unknown;
}

export interface TranscriptMessageShape {
  type: string;
  uuid?: string;
  timestamp?: string;
  _absorbed?: boolean;
  message?: TranscriptMessageBody;
  [key: string]: unknown;
}

export interface UsageBreakdown {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

const INPUT_KEYS = [
  "input_tokens",
  "inputTokens",
  "prompt_tokens",
  "promptTokenCount",
];
const OUTPUT_KEYS = [
  "output_tokens",
  "outputTokens",
  "completion_tokens",
  "candidatesTokenCount",
];
const CACHE_READ_KEYS = [
  "cache_read_input_tokens",
  "cache_read_tokens",
  "cached_input_tokens",
  "cacheReadInputTokens",
  "cacheReadTokens",
  "cachedInputTokens",
];
const CACHE_WRITE_KEYS = [
  "cache_creation_input_tokens",
  "cache_creation_tokens",
  "cache_write_input_tokens",
  "cache_write_tokens",
  "cacheCreationInputTokens",
  "cacheCreationTokens",
  "cacheWriteInputTokens",
  "cacheWriteTokens",
];
const COST_KEYS = [
  "cost_usd",
  "costUSD",
  "total_cost_usd",
  "totalCostUsd",
  "total_cost",
  "totalCost",
  "usd_cost",
  "usdCost",
];

function getUsageTokenValue(
  usage: TranscriptUsage | undefined,
  keys: string[],
): number {
  if (!usage) return 0;
  for (const key of keys) {
    const value = usage[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

export function getUsageBreakdownFromRecord(
  usage: TranscriptUsage | undefined,
): UsageBreakdown {
  return {
    input: getUsageTokenValue(usage, INPUT_KEYS),
    output: getUsageTokenValue(usage, OUTPUT_KEYS),
    cacheRead: getUsageTokenValue(usage, CACHE_READ_KEYS),
    cacheWrite: getUsageTokenValue(usage, CACHE_WRITE_KEYS),
  };
}

export function getUsageTotalTokens(usage: TranscriptUsage | undefined): number {
  const breakdown = getUsageBreakdownFromRecord(usage);
  return (
    breakdown.input +
    breakdown.output +
    breakdown.cacheRead +
    breakdown.cacheWrite
  );
}

export function getUsageCostUsd(usage: TranscriptUsage | undefined): number | null {
  if (!usage) return null;
  for (const key of COST_KEYS) {
    const value = usage[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return value;
    }
  }
  return null;
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

function getBlockKey(block: TranscriptBlock): string {
  if (block.type === "tool_use" && typeof block.id === "string") {
    return `tool_use:${block.id}`;
  }
  if (
    block.type === "tool_result" &&
    typeof block.tool_use_id === "string"
  ) {
    return `tool_result:${block.tool_use_id}`;
  }
  if (block.type === "text" && typeof block.text === "string") {
    return `text:${block.text}`;
  }
  if (block.type === "thinking") {
    const content =
      typeof block.thinking === "string"
        ? block.thinking
        : typeof block.text === "string"
          ? block.text
          : "";
    if (content) return `thinking:${content}`;
  }
  if (block.type === "tool_use" && typeof block.name === "string") {
    return `tool_use:${block.name}:${stableStringify(block.input)}`;
  }
  if (typeof block.id === "string") return `${block.type}:${block.id}`;
  return `${block.type}:${stableStringify(block)}`;
}

function cloneBlock(block: TranscriptBlock): TranscriptBlock {
  return { ...block };
}

function toBlocks(content: string | TranscriptBlock[]): TranscriptBlock[] {
  if (Array.isArray(content)) return content.map(cloneBlock);
  if (typeof content === "string" && content.length > 0) {
    return [{ type: "text", text: content }];
  }
  return [];
}

function mergeDuplicateBlock(
  current: TranscriptBlock,
  incoming: TranscriptBlock,
): TranscriptBlock {
  const next = { ...current };
  if (!next.text && incoming.text) next.text = incoming.text;
  if (!next.thinking && incoming.thinking) next.thinking = incoming.thinking;
  if (!next.name && incoming.name) next.name = incoming.name;
  if (!next.id && incoming.id) next.id = incoming.id;
  if (!next.input && incoming.input !== undefined) next.input = incoming.input;
  if (!next.content && incoming.content !== undefined) {
    next.content = incoming.content;
  }
  if (!next.result && incoming.result !== undefined) next.result = incoming.result;
  if (incoming.is_error === true) next.is_error = true;
  return next;
}

function mergeBlocks(
  current: TranscriptBlock[],
  incoming: TranscriptBlock[],
): TranscriptBlock[] {
  const merged = current.map(cloneBlock);
  const index = new Map<string, number>();
  for (let i = 0; i < merged.length; i++) {
    index.set(getBlockKey(merged[i]), i);
  }
  for (const block of incoming) {
    const key = getBlockKey(block);
    const existingIndex = index.get(key);
    if (existingIndex === undefined) {
      index.set(key, merged.length);
      merged.push(cloneBlock(block));
      continue;
    }
    merged[existingIndex] = mergeDuplicateBlock(merged[existingIndex], block);
  }
  return merged;
}

function cloneMessage<T extends TranscriptMessageShape>(msg: T): T {
  const body = msg.message
    ? {
        ...msg.message,
        usage: msg.message.usage ? { ...msg.message.usage } : msg.message.usage,
        content: Array.isArray(msg.message.content)
          ? msg.message.content.map(cloneBlock)
          : msg.message.content,
      }
    : msg.message;
  return {
    ...msg,
    message: body,
  };
}

function getMessageStreamKey(msg: TranscriptMessageShape): string | null {
  if (!msg.message) return null;
  const messageId = msg.message.id;
  if (!messageId || typeof messageId !== "string") return null;
  const role =
    typeof msg.message.role === "string" ? msg.message.role : "unknown";
  return `${msg.type}:${role}:${messageId}`;
}

function pickBetterUsage(
  current: TranscriptUsage | undefined,
  incoming: TranscriptUsage | undefined,
): TranscriptUsage | undefined {
  if (!current) return incoming;
  if (!incoming) return current;

  const currentCost = getUsageCostUsd(current);
  const incomingCost = getUsageCostUsd(incoming);
  const currentTokens = getUsageTotalTokens(current);
  const incomingTokens = getUsageTotalTokens(incoming);

  if (incomingTokens > currentTokens) return incoming;
  if (incomingTokens < currentTokens) return current;

  if (incomingCost !== null && currentCost === null) return incoming;
  if (incomingCost !== null && currentCost !== null && incomingCost > currentCost) {
    return incoming;
  }
  return current;
}

function mergeAbsorbedFlag(
  current: boolean | undefined,
  incoming: boolean | undefined,
): boolean | undefined {
  if (current === false || incoming === false) return false;
  if (current === true || incoming === true) return true;
  return undefined;
}

function mergeMessage(
  target: TranscriptMessageShape,
  incoming: TranscriptMessageShape,
): void {
  if (!target.message || !incoming.message) return;

  const targetBlocks = toBlocks(target.message.content);
  const incomingBlocks = toBlocks(incoming.message.content);
  target.message.content = mergeBlocks(targetBlocks, incomingBlocks);

  if (!target.message.model && incoming.message.model) {
    target.message.model = incoming.message.model;
  }
  target.message.usage = pickBetterUsage(
    target.message.usage,
    incoming.message.usage,
  );
  target._absorbed = mergeAbsorbedFlag(target._absorbed, incoming._absorbed);

  if (!target.timestamp && incoming.timestamp) {
    target.timestamp = incoming.timestamp;
  }
}

export function mergeStreamingTranscriptMessages<T extends TranscriptMessageShape>(
  messages: T[],
): T[] {
  const merged: T[] = [];
  const indexByKey = new Map<string, number>();

  for (const raw of messages) {
    const msg = cloneMessage(raw);
    const streamKey = getMessageStreamKey(msg);
    if (!streamKey) {
      merged.push(msg);
      continue;
    }

    const existingIndex = indexByKey.get(streamKey);
    if (existingIndex === undefined) {
      indexByKey.set(streamKey, merged.length);
      merged.push(msg);
      continue;
    }

    mergeMessage(merged[existingIndex], msg);
  }

  return merged;
}
