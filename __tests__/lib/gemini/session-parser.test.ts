import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { parseGeminiSession } from "@/lib/gemini/session-parser";

describe("parseGeminiSession", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gemini-parser-"));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeSession(name: string, data: unknown): string {
    const filePath = path.join(tmpDir, name);
    fs.writeFileSync(filePath, JSON.stringify(data), "utf-8");
    return filePath;
  }

  it("parses simple user/model conversation", () => {
    const filePath = writeSession("simple.json", [
      { role: "user", parts: [{ text: "Hello" }] },
      { role: "model", parts: [{ text: "Hi there!" }] },
      { role: "user", parts: [{ text: "How are you?" }] },
      { role: "model", parts: [{ text: "I'm doing well." }] },
    ]);

    const stats = parseGeminiSession(filePath);

    expect(stats.messageCount).toBe(4);
    expect(stats.toolCallCount).toBe(0);
    expect(stats.detectedProvider).toBe("gemini");
    expect(stats.sessionRole).toBe("standalone");
  });

  it("parses modern Gemini CLI session files with messages[] and token usage", () => {
    const filePath = writeSession("modern.json", {
      sessionId: "abc123",
      projectHash: "proj",
      startTime: "2026-02-24T03:27:23.761Z",
      lastUpdated: "2026-02-24T03:29:13.937Z",
      messages: [
        {
          id: "m1",
          timestamp: "2026-02-24T03:27:23.761Z",
          type: "user",
          content: [{ text: "cli" }],
        },
        {
          id: "m2",
          timestamp: "2026-02-24T03:27:34.497Z",
          type: "info",
          content: "update available",
        },
        {
          id: "m3",
          timestamp: "2026-02-24T03:29:05.433Z",
          type: "gemini",
          content: "Tooling details...",
          model: "gemini-3-pro-preview",
          toolCalls: [
            {
              id: "call_1",
              name: "cli_help",
              args: { question: "what is cli" },
              status: "success",
            },
          ],
          tokens: {
            input: 7015,
            output: 19,
            cached: 2945,
            total: 7563,
          },
        },
        {
          id: "m4",
          timestamp: "2026-02-24T03:29:13.936Z",
          type: "gemini",
          content: "The Gemini CLI is...",
          model: "gemini-3-pro-preview",
          tokens: {
            input: 7586,
            output: 182,
            cached: 5709,
            total: 7768,
          },
        },
      ],
    });

    const stats = parseGeminiSession(filePath);

    // info/system events are ignored in conversational message count
    expect(stats.messageCount).toBe(3);
    expect(stats.toolCallCount).toBe(1);
    expect(stats.toolUsage["cli_help"]?.count).toBe(1);
    expect(stats.detectedProvider).toBe("gemini");
    expect(stats.modelUsage["gemini-3-pro-preview"]).toBeDefined();
    expect(stats.modelUsage["gemini-3-pro-preview"].messageCount).toBe(2);
    expect(stats.inputTokens).toBe(14601);
    expect(stats.outputTokens).toBe(201);
    expect(stats.cacheReadTokens).toBe(8654);
    expect(stats.totalCost).toBeGreaterThan(0);
    expect(stats.autoSummary).toContain("Gemini CLI");
    expect(stats.sessionDurationMs).toBeGreaterThan(0);
    expect(stats.avgLatencyMs).toBeGreaterThan(0);
    expect(stats.p50LatencyMs).toBeGreaterThan(0);
    expect(stats.p95LatencyMs).toBeGreaterThan(0);
    expect(stats.maxLatencyMs).toBeGreaterThan(0);
  });

  it("computes latency from user->model message turns", () => {
    const filePath = writeSession("latency-turns.json", {
      messages: [
        {
          type: "user",
          timestamp: "2026-02-24T00:00:00.000Z",
          content: "first",
        },
        {
          type: "gemini",
          timestamp: "2026-02-24T00:00:01.000Z",
          content: "first reply",
          model: "gemini-2.5-pro",
        },
        {
          type: "user",
          timestamp: "2026-02-24T00:00:10.000Z",
          content: "second",
        },
        {
          type: "gemini",
          timestamp: "2026-02-24T00:00:13.000Z",
          content: "second reply",
          model: "gemini-2.5-pro",
        },
      ],
    });

    const stats = parseGeminiSession(filePath);

    expect(stats.avgLatencyMs).toBe(2000);
    expect(stats.p50LatencyMs).toBe(3000);
    expect(stats.p95LatencyMs).toBe(3000);
    expect(stats.maxLatencyMs).toBe(3000);
  });

  it("counts tool calls from functionCall parts", () => {
    const filePath = writeSession("tools.json", [
      { role: "user", parts: [{ text: "Read file.txt" }] },
      {
        role: "model",
        parts: [
          { text: "Let me read that." },
          { functionCall: { name: "readFile", args: { path: "file.txt" } } },
        ],
      },
      {
        role: "tool",
        parts: [
          {
            functionResponse: {
              name: "readFile",
              response: { content: "hello" },
            },
          },
        ],
      },
    ]);

    const stats = parseGeminiSession(filePath);

    expect(stats.toolCallCount).toBe(1);
    expect(stats.toolUsage["readFile"]).toBeDefined();
    expect(stats.toolUsage["readFile"].count).toBe(1);
    expect(stats.toolUsage["readFile"].name).toBe("readFile");
  });

  it("parses cache write tokens when present in token snapshots", () => {
    const filePath = writeSession("cache-write.json", {
      messages: [
        {
          type: "user",
          content: "hi",
        },
        {
          type: "gemini",
          model: "gemini-2.5-pro",
          content: "hello",
          tokens: {
            input: 1000,
            output: 100,
            cached: 250,
            cache_write_tokens: 40,
          },
        },
        {
          type: "gemini",
          model: "gemini-2.5-pro",
          content: "follow up",
          tokens: {
            input: 500,
            output: 50,
            cached: 100,
            cacheCreation: 10,
          },
        },
      ],
    });

    const stats = parseGeminiSession(filePath);

    expect(stats.inputTokens).toBe(1500);
    expect(stats.outputTokens).toBe(150);
    expect(stats.cacheReadTokens).toBe(350);
    expect(stats.cacheWriteTokens).toBe(50);
    expect(stats.modelUsage["gemini-2.5-pro"]).toBeDefined();
    expect(stats.modelUsage["gemini-2.5-pro"].cacheWriteTokens).toBe(50);
  });

  it("handles multiple functionCalls in one model turn", () => {
    const filePath = writeSession("multi-tools.json", [
      { role: "user", parts: [{ text: "Search and read" }] },
      {
        role: "model",
        parts: [
          { functionCall: { name: "search", args: { q: "test" } } },
          { functionCall: { name: "readFile", args: { path: "a.txt" } } },
          { functionCall: { name: "search", args: { q: "other" } } },
        ],
      },
    ]);

    const stats = parseGeminiSession(filePath);

    expect(stats.toolCallCount).toBe(3);
    expect(stats.toolUsage["search"].count).toBe(2);
    expect(stats.toolUsage["readFile"].count).toBe(1);
  });

  it("returns zero stats for empty JSON array", () => {
    const filePath = writeSession("empty.json", []);

    const stats = parseGeminiSession(filePath);

    expect(stats.messageCount).toBe(0);
    expect(stats.toolCallCount).toBe(0);
    expect(stats.detectedProvider).toBe("gemini");
  });

  it("returns empty stats for malformed JSON (no crash)", () => {
    const filePath = path.join(tmpDir, "malformed.json");
    fs.writeFileSync(filePath, "this is not json {{{", "utf-8");

    const stats = parseGeminiSession(filePath);

    expect(stats.messageCount).toBe(0);
    expect(stats.toolCallCount).toBe(0);
    expect(stats.detectedProvider).toBe("gemini");
  });

  it("returns empty stats for non-existent file (no crash)", () => {
    const stats = parseGeminiSession("/tmp/does-not-exist-gemini-12345.json");

    expect(stats.messageCount).toBe(0);
    expect(stats.toolCallCount).toBe(0);
    expect(stats.detectedProvider).toBe("gemini");
  });

  it("handles mixed text and functionCall parts", () => {
    const filePath = writeSession("mixed.json", [
      { role: "user", parts: [{ text: "Do something" }] },
      {
        role: "model",
        parts: [
          { text: "I will call a tool." },
          { functionCall: { name: "execute", args: {} } },
          { text: "And another thing." },
          { functionCall: { name: "compile", args: {} } },
        ],
      },
    ]);

    const stats = parseGeminiSession(filePath);

    expect(stats.messageCount).toBe(2);
    expect(stats.toolCallCount).toBe(2);
    expect(stats.toolUsage["execute"].count).toBe(1);
    expect(stats.toolUsage["compile"].count).toBe(1);
  });

  it("keeps all token fields at 0", () => {
    const filePath = writeSession("no-tokens.json", [
      { role: "user", parts: [{ text: "Hello" }] },
      { role: "model", parts: [{ text: "Hi" }] },
    ]);

    const stats = parseGeminiSession(filePath);

    expect(stats.inputTokens).toBe(0);
    expect(stats.outputTokens).toBe(0);
    expect(stats.cacheReadTokens).toBe(0);
    expect(stats.cacheWriteTokens).toBe(0);
    expect(stats.thinkingBlocks).toBe(0);
    expect(stats.totalCost).toBe(0);
  });

  it("computes sessionDurationMs from file timestamps", () => {
    const filePath = writeSession("duration.json", [
      { role: "user", parts: [{ text: "Hi" }] },
    ]);

    const stats = parseGeminiSession(filePath);

    // sessionDurationMs should be >= 0 (mtime - birthtime)
    expect(stats.sessionDurationMs).toBeGreaterThanOrEqual(0);
    expect(typeof stats.sessionDurationMs).toBe("number");
  });

  it("extracts model name from metadata if present", () => {
    const filePath = writeSession("with-model.json", [
      { role: "user", parts: [{ text: "Hi" }] },
      {
        role: "model",
        parts: [{ text: "Hello" }],
        metadata: { model: "gemini-2.5-pro" },
      },
      {
        role: "model",
        parts: [{ text: "More" }],
        metadata: { model: "gemini-2.5-pro" },
      },
      {
        role: "model",
        parts: [{ text: "Flash" }],
        metadata: { model: "gemini-2.5-flash" },
      },
    ]);

    const stats = parseGeminiSession(filePath);

    expect(stats.modelUsage["gemini-2.5-pro"]).toBeDefined();
    expect(stats.modelUsage["gemini-2.5-pro"].messageCount).toBe(2);
    expect(stats.modelUsage["gemini-2.5-pro"].model).toBe("gemini-2.5-pro");
    expect(stats.modelUsage["gemini-2.5-flash"]).toBeDefined();
    expect(stats.modelUsage["gemini-2.5-flash"].messageCount).toBe(1);
  });

  it("normalizes invalid-command help hints to `gemini help`", () => {
    const filePath = writeSession("invalid-command-help.json", {
      messages: [
        {
          type: "user",
          content: "Run /nope",
        },
        {
          type: "gemini",
          content: "Unknown command: /nope. For usage, run gemini --help.",
          model: "gemini-2.5-pro",
        },
      ],
    });

    const stats = parseGeminiSession(filePath);

    expect(stats.autoSummary).toContain("gemini help");
    expect(stats.autoSummary).not.toContain("gemini --help");
  });

  it("reads project path marker and git branch metadata", () => {
    const hashDir = path.join(tmpDir, "hash-project-a");
    const chatsDir = path.join(hashDir, "chats");
    fs.mkdirSync(chatsDir, { recursive: true });
    fs.writeFileSync(
      path.join(hashDir, ".project_root"),
      "/Users/test/workspace/project-a",
      "utf-8",
    );
    const filePath = path.join(chatsDir, "session-meta.json");
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        git: { branch: "feature/gemini-metadata" },
        messages: [
          { type: "user", content: "hello" },
          { type: "gemini", model: "gemini-2.5-pro", content: "hi" },
        ],
      }),
      "utf-8",
    );

    const stats = parseGeminiSession(filePath);

    expect(stats.projectPath).toBe("/Users/test/workspace/project-a");
    expect(stats.gitBranch).toBe("feature/gemini-metadata");
  });

  it("captures reasoning token snapshots and effort mode", () => {
    const filePath = writeSession("reasoning-effort.json", {
      messages: [
        { type: "user", content: "think deeply" },
        {
          type: "gemini",
          model: "gemini-2.5-pro",
          metadata: { reasoning_effort: "high" },
          content: "done",
          tokens: {
            input: 120,
            thoughts: 40,
            tool: 10,
          },
        },
      ],
    });

    const stats = parseGeminiSession(filePath);

    expect(stats.outputTokens).toBe(40);
    expect(stats.modelUsage["gemini-2.5-pro"].reasoningTokens).toBe(40);
    expect(stats.effortMode).toBe("high");
    expect(stats.thinkingBlocks).toBeGreaterThan(0);
  });

  it("marks tool calls as failed when result payload indicates an error", () => {
    const filePath = writeSession("tool-result-error.json", {
      messages: [
        { type: "user", content: "read config" },
        {
          type: "gemini",
          model: "gemini-2.5-pro",
          content: "attempting",
          toolCalls: [
            {
              name: "read_file",
              status: "success",
              result: { status: "failed", error: "permission denied" },
            },
          ],
        },
      ],
    });

    const stats = parseGeminiSession(filePath);

    expect(stats.toolUsage["read_file"]).toBeDefined();
    expect(stats.toolUsage["read_file"].count).toBe(1);
    expect(stats.toolUsage["read_file"].errorCount).toBe(1);
  });
});
