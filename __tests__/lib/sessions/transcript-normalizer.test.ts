import { describe, expect, it } from "vitest";
import {
  getUsageBreakdownFromRecord,
  getUsageCostUsd,
  getUsageReasoningTokens,
  getUsageTotalTokens,
  mergeStreamingTranscriptMessages,
} from "@/lib/sessions/transcript-normalizer";

describe("transcript-normalizer", () => {
  it("merges streamed assistant chunks with the same message id", () => {
    const merged = mergeStreamingTranscriptMessages([
      {
        type: "assistant",
        uuid: "a-1",
        message: {
          id: "msg_1",
          role: "assistant",
          model: "claude-opus-4-6",
          content: [{ type: "text", text: "Let me check that." }],
          usage: { input_tokens: 100, output_tokens: 30 },
        },
      },
      {
        type: "assistant",
        uuid: "a-2",
        message: {
          id: "msg_1",
          role: "assistant",
          model: "claude-opus-4-6",
          content: [
            {
              type: "tool_use",
              id: "tool_1",
              name: "Read",
              input: { file_path: "README.md" },
            },
          ],
          usage: { input_tokens: 120, output_tokens: 42 },
        },
      },
      {
        type: "user",
        uuid: "u-1",
        message: {
          id: "msg_u1",
          role: "user",
          content: "Continue",
        },
      },
    ]);

    expect(merged).toHaveLength(2);
    const assistant = merged[0].message;
    expect(assistant?.role).toBe("assistant");
    const blocks = Array.isArray(assistant?.content) ? assistant.content : [];
    expect(blocks).toHaveLength(2);
    expect(blocks.some((b) => b.type === "text")).toBe(true);
    expect(blocks.some((b) => b.type === "tool_use" && b.id === "tool_1")).toBe(
      true,
    );
    expect(assistant?.usage?.input_tokens).toBe(120);
    expect(assistant?.usage?.output_tokens).toBe(42);
  });

  it("keeps enriched tool_use fields from later streamed chunks", () => {
    const merged = mergeStreamingTranscriptMessages([
      {
        type: "assistant",
        message: {
          id: "msg_2",
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "tool_2",
              name: "WebSearch",
              input: { query: "today news" },
            },
          ],
        },
      },
      {
        type: "assistant",
        message: {
          id: "msg_2",
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "tool_2",
              name: "WebSearch",
              input: { query: "today news" },
              result: "found results",
              is_error: true,
            },
          ],
        },
      },
    ]);

    expect(merged).toHaveLength(1);
    const blocks = Array.isArray(merged[0].message?.content)
      ? merged[0].message?.content
      : [];
    expect(blocks).toHaveLength(1);
    const tool = blocks[0];
    expect(tool.result).toBe("found results");
    expect(tool.is_error).toBe(true);
  });

  it("leaves messages without ids untouched", () => {
    const merged = mergeStreamingTranscriptMessages([
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: "first",
        },
      },
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: "second",
        },
      },
    ]);

    expect(merged).toHaveLength(2);
  });

  it("extracts usage tokens and cost aliases", () => {
    const usage = {
      inputTokens: 10,
      outputTokens: 5,
      reasoningOutputTokens: 4,
      cacheReadTokens: 2,
      cacheCreationInputTokens: 3,
      costUSD: 0.0123,
    };

    const breakdown = getUsageBreakdownFromRecord(usage);
    expect(breakdown).toEqual({
      input: 10,
      output: 5,
      cacheRead: 2,
      cacheWrite: 3,
    });
    expect(getUsageTotalTokens(usage)).toBe(20);
    expect(getUsageReasoningTokens(usage)).toBe(4);
    expect(getUsageCostUsd(usage)).toBe(0.0123);
  });

  it("extracts Gemini-style token aliases", () => {
    const usage = {
      input: 120,
      output: 30,
      cached: 50,
      cacheWrite: 7,
    };

    const breakdown = getUsageBreakdownFromRecord(usage);
    expect(breakdown).toEqual({
      input: 120,
      output: 30,
      cacheRead: 50,
      cacheWrite: 7,
    });
    expect(getUsageTotalTokens(usage)).toBe(207);
  });
});
