import fs from "fs";
import readline from "readline";

export interface JsonlMessage {
  type: string;
  uuid?: string;
  parentUuid?: string;
  sessionId?: string;
  timestamp?: string;
  slug?: string;
  gitBranch?: string;
  cwd?: string;
  message?: {
    role: string;
    content:
      | string
      | Array<{
          type: string;
          text?: string;
          name?: string;
          id?: string;
          input?: unknown;
          content?: string | Array<{ type: string; text?: string }>;
          tool_use_id?: string;
          is_error?: boolean;
          // Added by pairing utility
          result?: string | Array<{ type: string; text?: string }>;
          _toolName?: string;
        }>;
    model?: string;
    usage?: {
      input_tokens?: number;
      inputTokens?: number;
      prompt_tokens?: number;
      promptTokenCount?: number;
      output_tokens?: number;
      outputTokens?: number;
      completion_tokens?: number;
      candidatesTokenCount?: number;
      cache_read_input_tokens?: number;
      cache_read_tokens?: number;
      cached_input_tokens?: number;
      cacheReadInputTokens?: number;
      cacheReadTokens?: number;
      cachedInputTokens?: number;
      cache_creation_input_tokens?: number;
      cache_creation_tokens?: number;
      cache_write_input_tokens?: number;
      cache_write_tokens?: number;
      cacheCreationInputTokens?: number;
      cacheCreationTokens?: number;
      cacheWriteInputTokens?: number;
      cacheWriteTokens?: number;
    };
  };
  data?: unknown;
  _absorbed?: boolean;
  [key: string]: unknown;
}

export async function parseJsonlFile(
  filePath: string,
): Promise<JsonlMessage[]> {
  const messages: JsonlMessage[] = [];
  const stream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (line.trim()) {
      try {
        messages.push(JSON.parse(line));
      } catch {
        // Skip malformed lines
      }
    }
  }
  return messages;
}

/**
 * Streaming async generator — yields one message at a time.
 * Keeps peak memory proportional to a single message, not the entire file.
 */
export async function* streamJsonlFile(
  filePath: string,
): AsyncGenerator<JsonlMessage> {
  const stream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (line.trim()) {
      try {
        yield JSON.parse(line);
      } catch {
        // Skip malformed lines
      }
    }
  }
}

/**
 * Streaming pagination — single-pass read that only keeps messages in the requested page range.
 * Returns total count for pagination math without buffering the entire file.
 */
export async function parseJsonlPage(
  filePath: string,
  page: number,
  limit: number,
): Promise<{ messages: JsonlMessage[]; total: number; page: number }> {
  // page=-1 means "last page" — single pass with a ring buffer
  const isLastPage = page === -1;

  if (isLastPage && limit > 0) {
    const messages: JsonlMessage[] = [];
    let index = 0;
    const stream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: stream,
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        messages.push(parsed);
        if (messages.length > limit) messages.shift();
        index++;
      } catch {
        // Skip malformed lines
      }
    }
    const totalPages = Math.max(1, Math.ceil(index / limit));
    return { messages, total: index, page: totalPages };
  }

  const start = (page - 1) * limit;
  const end = start + limit;
  const messages: JsonlMessage[] = [];
  let index = 0;

  const stream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (index >= start && index < end) {
        messages.push(parsed);
      }
      index++;
    } catch {
      // Skip malformed lines
    }
  }

  return { messages, total: index, page };
}

