import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { parseCodexSession } from "@/lib/codex/session-parser";
import { calculateCostDetailed } from "@/lib/cost/calculator";

function iso(base: Date, offsetMs: number): string {
  return new Date(base.getTime() + offsetMs).toISOString();
}

describe("parseCodexSession", () => {
  const tempFiles: string[] = [];

  function writeFixture(lines: unknown[]): string {
    const filePath = path.join(
      os.tmpdir(),
      `codex-session-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`,
    );
    fs.writeFileSync(
      filePath,
      lines.map((line) => JSON.stringify(line)).join("\n") + "\n",
      "utf-8",
    );
    tempFiles.push(filePath);
    return filePath;
  }

  afterEach(() => {
    for (const filePath of tempFiles) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    tempFiles.length = 0;
  });

  it("parses codex model usage, provider, tools, and patch-modified files", async () => {
    const t0 = new Date("2026-02-24T12:00:00.000Z");
    const filePath = writeFixture([
      {
        timestamp: iso(t0, 0),
        type: "session_meta",
        payload: {
          source: {
            subagent: { thread_spawn: { parent_thread_id: "parent-1", depth: 1 } },
          },
          model_provider: "openai",
        },
      },
      {
        timestamp: iso(t0, 10),
        type: "turn_context",
        payload: { model: "gpt-5.3-codex", effort: "xhigh" },
      },
      {
        timestamp: iso(t0, 100),
        type: "event_msg",
        payload: { type: "user_message", message: "Please patch this file." },
      },
      {
        timestamp: iso(t0, 120),
        type: "response_item",
        payload: {
          type: "function_call",
          name: "exec_command",
          call_id: "call-1",
          arguments: JSON.stringify({ cmd: "rg parseCodexSession lib" }),
        },
      },
      {
        timestamp: iso(t0, 130),
        type: "response_item",
        payload: {
          type: "function_call_output",
          call_id: "call-1",
          output:
            "Chunk ID: x\nProcess exited with code 0\nOutput:\nlib/codex/session-parser.ts",
        },
      },
      {
        timestamp: iso(t0, 140),
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: {
              input_tokens: 100,
              cached_input_tokens: 10,
              cache_creation_input_tokens: 5,
              output_tokens: 40,
              reasoning_output_tokens: 0,
              total_tokens: 140,
            },
            last_token_usage: {
              input_tokens: 100,
              cached_input_tokens: 10,
              cache_creation_input_tokens: 5,
              output_tokens: 40,
              reasoning_output_tokens: 0,
              total_tokens: 140,
            },
            model_context_window: 258400,
          },
        },
      },
      {
        timestamp: iso(t0, 500),
        type: "event_msg",
        payload: { type: "agent_message", message: "Running patch now." },
      },
      {
        timestamp: iso(t0, 520),
        type: "response_item",
        payload: {
          type: "custom_tool_call",
          name: "apply_patch",
          status: "completed",
          call_id: "call-2",
          input:
            "*** Begin Patch\n*** Update File: lib/foo.ts\n@@\n-export const x = 1;\n+export const x = 2;\n*** Add File: notes/todo.md\n+todo\n*** End Patch\n",
        },
      },
      {
        timestamp: iso(t0, 540),
        type: "response_item",
        payload: {
          type: "custom_tool_call_output",
          call_id: "call-2",
          output: JSON.stringify({
            output: "failed",
            metadata: { exit_code: 1 },
          }),
        },
      },
      {
        timestamp: iso(t0, 560),
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: {
              input_tokens: 180,
              cached_input_tokens: 20,
              cache_creation_input_tokens: 8,
              output_tokens: 70,
              reasoning_output_tokens: 0,
              total_tokens: 250,
            },
            last_token_usage: {
              input_tokens: 80,
              cached_input_tokens: 10,
              cache_creation_input_tokens: 3,
              output_tokens: 30,
              reasoning_output_tokens: 0,
              total_tokens: 110,
            },
            model_context_window: 258400,
          },
        },
      },
      {
        timestamp: iso(t0, 900),
        type: "event_msg",
        payload: { type: "agent_message", message: "Done." },
      },
      {
        timestamp: iso(t0, 910),
        type: "event_msg",
        payload: { type: "task_complete", last_agent_message: "Done." },
      },
    ]);

    const stats = await parseCodexSession(filePath);

    expect(stats.detectedProvider).toBe("codex");
    expect(stats.effortMode).toBe("xhigh");
    expect(stats.sessionRole).toBe("subagent");
    expect(stats.messageCount).toBe(3);
    expect(stats.toolCallCount).toBe(2);

    expect(stats.inputTokens).toBe(180);
    expect(stats.outputTokens).toBe(70);
    expect(stats.cacheReadTokens).toBe(20);
    expect(stats.cacheWriteTokens).toBe(8);
    expect(stats.totalCost).toBeCloseTo(0.0012985, 10);
    expect(stats.pricingStatus).toBe("priced");
    expect(stats.unpricedTokens).toBe(0);

    expect(stats.modelUsage["gpt-5.3-codex"]).toBeDefined();
    expect(stats.modelUsage["gpt-5.3-codex"].inputTokens).toBe(180);
    expect(stats.modelUsage["gpt-5.3-codex"].outputTokens).toBe(70);
    expect(stats.modelUsage["gpt-5.3-codex"].cacheReadTokens).toBe(20);
    expect(stats.modelUsage["gpt-5.3-codex"].cacheWriteTokens).toBe(8);

    expect(stats.toolUsage.exec_command?.count).toBe(1);
    expect(stats.toolUsage.apply_patch?.count).toBe(1);
    expect(stats.toolUsage.apply_patch?.errorCount).toBe(1);
    expect(stats.enrichedTools.coreTools.exec_command).toBe(1);
    expect(stats.enrichedTools.coreTools.apply_patch).toBe(1);

    const modifiedPaths = stats.enrichedTools.filesModified.map((f) => f.path);
    expect(modifiedPaths).toContain("lib/foo.ts");
    expect(modifiedPaths).toContain("notes/todo.md");

    expect(stats.autoSummary).toBe("Done.");
    expect(stats.sessionDurationMs).toBeGreaterThan(0);
  });

  it("handles token_count events without token info while preserving model/provider", async () => {
    const t0 = new Date("2026-02-24T13:00:00.000Z");
    const filePath = writeFixture([
      {
        timestamp: iso(t0, 0),
        type: "turn_context",
        payload: { model: "gpt-5.1-codex-mini" },
      },
      {
        timestamp: iso(t0, 100),
        type: "event_msg",
        payload: { type: "user_message", message: "hello" },
      },
      {
        timestamp: iso(t0, 200),
        type: "event_msg",
        payload: { type: "token_count", info: null },
      },
      {
        timestamp: iso(t0, 600),
        type: "event_msg",
        payload: { type: "agent_message", message: "ok" },
      },
    ]);

    const stats = await parseCodexSession(filePath);

    expect(stats.detectedProvider).toBe("codex");
    expect(stats.messageCount).toBe(2);
    expect(stats.modelUsage["gpt-5.1-codex-mini"]).toBeDefined();
    expect(stats.modelUsage["gpt-5.1-codex-mini"].inputTokens).toBe(0);
    expect(stats.modelUsage["gpt-5.1-codex-mini"].outputTokens).toBe(0);
    expect(stats.inputTokens).toBe(0);
    expect(stats.outputTokens).toBe(0);
    expect(stats.toolCallCount).toBe(0);
  });

  it("uses last_token_usage when cumulative totals reset and counts reasoning blocks", async () => {
    const t0 = new Date("2026-02-24T14:00:00.000Z");
    const filePath = writeFixture([
      {
        timestamp: iso(t0, 0),
        type: "turn_context",
        payload: { model: "gpt-5.2-codex" },
      },
      {
        timestamp: iso(t0, 100),
        type: "event_msg",
        payload: { type: "user_message", message: "start" },
      },
      {
        timestamp: iso(t0, 200),
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: {
              input_tokens: 1000,
              cached_input_tokens: 100,
              cache_creation_input_tokens: 12,
              output_tokens: 500,
              reasoning_output_tokens: 0,
              total_tokens: 1500,
            },
            last_token_usage: {
              input_tokens: 1000,
              cached_input_tokens: 100,
              cache_creation_input_tokens: 12,
              output_tokens: 500,
              reasoning_output_tokens: 0,
              total_tokens: 1500,
            },
            model_context_window: 258400,
          },
        },
      },
      {
        timestamp: iso(t0, 250),
        type: "event_msg",
        payload: { type: "agent_reasoning", text: "thinking..." },
      },
      {
        timestamp: iso(t0, 300),
        type: "event_msg",
        payload: { type: "agent_message", message: "phase 1" },
      },
      {
        timestamp: iso(t0, 400),
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: {
              input_tokens: 100,
              cached_input_tokens: 30,
              cache_creation_input_tokens: 4,
              output_tokens: 40,
              reasoning_output_tokens: 0,
              total_tokens: 140,
            },
            last_token_usage: {
              input_tokens: 70,
              cached_input_tokens: 20,
              cache_creation_input_tokens: 7,
              output_tokens: 30,
              reasoning_output_tokens: 0,
              total_tokens: 100,
            },
            model_context_window: 258400,
          },
        },
      },
      {
        timestamp: iso(t0, 500),
        type: "event_msg",
        payload: { type: "agent_message", message: "phase 2" },
      },
    ]);

    const stats = await parseCodexSession(filePath);

    // First token event + reset event fallback from last_token_usage.
    expect(stats.inputTokens).toBe(1070);
    expect(stats.outputTokens).toBe(530);
    expect(stats.cacheReadTokens).toBe(120);
    expect(stats.cacheWriteTokens).toBe(19);
    expect(stats.thinkingBlocks).toBe(1);
    expect(stats.modelUsage["gpt-5.2-codex"]).toBeDefined();
    expect(stats.modelUsage["gpt-5.2-codex"].inputTokens).toBe(1070);
  });

  it("parses cache-write camelCase token keys", async () => {
    const t0 = new Date("2026-02-24T15:00:00.000Z");
    const filePath = writeFixture([
      {
        timestamp: iso(t0, 0),
        type: "turn_context",
        payload: { model: "gpt-5.2-codex" },
      },
      {
        timestamp: iso(t0, 50),
        type: "event_msg",
        payload: { type: "user_message", message: "start" },
      },
      {
        timestamp: iso(t0, 100),
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: {
              inputTokens: 300,
              cachedInputTokens: 20,
              cacheCreationInputTokens: 11,
              outputTokens: 120,
            },
            last_token_usage: {
              inputTokens: 300,
              cachedInputTokens: 20,
              cacheCreationInputTokens: 11,
              outputTokens: 120,
            },
          },
        },
      },
      {
        timestamp: iso(t0, 200),
        type: "event_msg",
        payload: { type: "agent_message", message: "done" },
      },
    ]);

    const stats = await parseCodexSession(filePath);

    expect(stats.inputTokens).toBe(300);
    expect(stats.cacheReadTokens).toBe(20);
    expect(stats.cacheWriteTokens).toBe(11);
    expect(stats.modelUsage["gpt-5.2-codex"].cacheWriteTokens).toBe(11);
  });

  it("extracts effort mode from collaboration_mode settings", async () => {
    const t0 = new Date("2026-02-24T15:30:00.000Z");
    const filePath = writeFixture([
      {
        timestamp: iso(t0, 0),
        type: "turn_context",
        payload: {
          model: "gpt-5.3-codex",
          collaboration_mode: {
            mode: "default",
            settings: { model: "gpt-5.3-codex", reasoning_effort: "high" },
          },
        },
      },
      {
        timestamp: iso(t0, 50),
        type: "event_msg",
        payload: { type: "user_message", message: "hello" },
      },
      {
        timestamp: iso(t0, 200),
        type: "event_msg",
        payload: { type: "agent_message", message: "ok" },
      },
    ]);

    const stats = await parseCodexSession(filePath);
    expect(stats.effortMode).toBe("high");
  });

  it("uses reasoning output tokens in billable output + cost when separated in totals", async () => {
    const t0 = new Date("2026-02-24T16:00:00.000Z");
    const filePath = writeFixture([
      {
        timestamp: iso(t0, 0),
        type: "turn_context",
        payload: { model: "gpt-5.3-codex" },
      },
      {
        timestamp: iso(t0, 20),
        type: "event_msg",
        payload: { type: "user_message", message: "hello" },
      },
      {
        timestamp: iso(t0, 80),
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: {
              input_tokens: 100,
              output_tokens: 40,
              reasoning_output_tokens: 10,
              cached_input_tokens: 0,
              cache_creation_input_tokens: 0,
              total_tokens: 150,
            },
            last_token_usage: {
              input_tokens: 100,
              output_tokens: 40,
              reasoning_output_tokens: 10,
              cached_input_tokens: 0,
              cache_creation_input_tokens: 0,
              total_tokens: 150,
            },
          },
        },
      },
      {
        timestamp: iso(t0, 200),
        type: "event_msg",
        payload: { type: "agent_message", message: "done" },
      },
    ]);

    const stats = await parseCodexSession(filePath);
    const expected = calculateCostDetailed("gpt-5.3-codex", 100, 50, 0, 0);

    expect(stats.inputTokens).toBe(100);
    expect(stats.outputTokens).toBe(50);
    expect(stats.modelUsage["gpt-5.3-codex"].outputTokens).toBe(50);
    expect(stats.modelUsage["gpt-5.3-codex"].reasoningTokens).toBe(10);
    expect(stats.totalCost).toBeCloseTo(expected.cost, 12);
  });
});
