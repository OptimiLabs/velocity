/**
 * Pairs tool_use blocks (in assistant messages) with their corresponding
 * tool_result blocks (in user messages) by matching id ↔ tool_use_id.
 *
 * After pairing, each tool_use ContentBlock gains:
 *   - result: the tool_result content
 *   - is_error: whether the result was an error
 *
 * User messages whose content blocks are ALL paired get _absorbed: true
 * so the renderer can hide them (the result is shown inline with the tool_use).
 */

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  name?: string;
  id?: string;
  input?: unknown;
  content?: string | Array<{ type: string; text?: string }>;
  tool_use_id?: string;
  is_error?: boolean;
  result?: string | Array<{ type: string; text?: string }>;
  _toolName?: string;
}

interface Message {
  type: string;
  uuid?: string;
  message?: {
    role: string;
    content: string | ContentBlock[];
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
  timestamp?: string;
  slug?: string;
  _absorbed?: boolean;
}

export function pairToolCallsWithResults<T extends Message>(
  messages: T[],
): T[] {
  // Clone messages so we never mutate the originals
  const cloned: T[] = messages.map((msg) => ({
    ...msg,
    message: msg.message
      ? {
          ...msg.message,
          content: Array.isArray(msg.message.content)
            ? msg.message.content.map((block) => ({ ...block }))
            : msg.message.content,
        }
      : msg.message,
  }));

  // Pass 1: Build index of tool_use blocks by their id
  const toolUseIndex = new Map<
    string,
    { msgIndex: number; blockIndex: number; toolName: string }
  >();

  for (let i = 0; i < cloned.length; i++) {
    const msg = cloned[i];
    if (msg.type !== "assistant" || !msg.message) continue;
    const blocks = Array.isArray(msg.message.content)
      ? msg.message.content
      : [];
    for (let j = 0; j < blocks.length; j++) {
      const block = blocks[j];
      if (block.type === "tool_use" && block.id) {
        toolUseIndex.set(block.id, {
          msgIndex: i,
          blockIndex: j,
          toolName: block.name || "unknown",
        });
      }
    }
  }

  // Pass 2: Walk user messages, pair tool_result blocks with their tool_use
  for (let i = 0; i < cloned.length; i++) {
    const msg = cloned[i];
    if (msg.type !== "user" || !msg.message) continue;
    const blocks = Array.isArray(msg.message.content)
      ? msg.message.content
      : [];
    if (blocks.length === 0) continue;

    let allPaired = true;

    for (const block of blocks) {
      if (block.type !== "tool_result" || !block.tool_use_id) {
        allPaired = false;
        continue;
      }

      const match = toolUseIndex.get(block.tool_use_id);
      if (!match) {
        allPaired = false;
        continue;
      }

      // Attach result to the cloned tool_use block
      const targetMsg = cloned[match.msgIndex];
      const targetBlocks = Array.isArray(targetMsg.message!.content)
        ? targetMsg.message!.content
        : [];
      const targetBlock = targetBlocks[match.blockIndex] as ContentBlock;

      targetBlock.result = block.content;
      targetBlock.is_error = block.is_error ?? false;
    }

    // If every block in this user message was a paired tool_result, absorb it
    if (
      allPaired &&
      blocks.length > 0 &&
      blocks.every((b) => b.type === "tool_result")
    ) {
      (msg as Message)._absorbed = true;
    }
  }

  return cloned;
}
