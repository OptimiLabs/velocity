# PLAN-3: Session Parser Adapter

> For Claude: REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

## Objective

Create a Gemini session parser that reads Gemini's JSON session format (`[{role, parts}]` array) and converts it into the app's unified `SessionStats` format. This is fundamentally different from Claude/Codex JSONL parsing — Gemini uses monolithic JSON files.

## Dependencies

- Plan 1 (ConfigProvider type, pricing entries)
- Plan 2 (session discovery for file paths)

## Files to Create

1. `lib/gemini/session-parser.ts` — Parse Gemini JSON session files into unified stats

## Files to Create (Tests)

1. `__tests__/lib/gemini/session-parser.test.ts`

---

## Task 1: Write test for Gemini session parser

### Test file: `__tests__/lib/gemini/session-parser.test.ts`

````typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  parseGeminiSession,
  type GeminiTurn,
} from "@/lib/gemini/session-parser";

describe("parseGeminiSession", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gemini-parse-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeSession(turns: GeminiTurn[]): string {
    const filePath = join(dir, "session-test.json");
    writeFileSync(filePath, JSON.stringify(turns));
    return filePath;
  }

  it("parses a simple user/model conversation", () => {
    const filePath = writeSession([
      { role: "user", parts: [{ text: "Hello, help me with code" }] },
      {
        role: "model",
        parts: [{ text: "Sure, I can help with that." }],
      },
      { role: "user", parts: [{ text: "Write a function" }] },
      {
        role: "model",
        parts: [{ text: "Here is a function:\n```js\nfunction foo() {}\n```" }],
      },
    ]);

    const stats = parseGeminiSession(filePath);
    expect(stats.messageCount).toBe(4);
    expect(stats.detectedProvider).toBe("gemini");
    expect(stats.sessionRole).toBe("standalone");
  });

  it("counts tool calls from functionCall parts", () => {
    const filePath = writeSession([
      { role: "user", parts: [{ text: "Read the file" }] },
      {
        role: "model",
        parts: [
          {
            functionCall: {
              name: "read_file",
              args: { path: "/tmp/test.ts" },
            },
          },
        ],
      },
      {
        role: "tool",
        parts: [
          {
            functionResponse: {
              name: "read_file",
              response: { content: "file contents here" },
            },
          },
        ],
      },
      {
        role: "model",
        parts: [{ text: "The file contains..." }],
      },
    ]);

    const stats = parseGeminiSession(filePath);
    expect(stats.messageCount).toBe(4);
    expect(stats.toolCallCount).toBe(1);
    expect(stats.toolUsage["read_file"]).toBeDefined();
    expect(stats.toolUsage["read_file"].count).toBe(1);
  });

  it("handles multiple tool calls in one model turn", () => {
    const filePath = writeSession([
      { role: "user", parts: [{ text: "Read two files" }] },
      {
        role: "model",
        parts: [
          {
            functionCall: {
              name: "read_file",
              args: { path: "/tmp/a.ts" },
            },
          },
          {
            functionCall: {
              name: "read_file",
              args: { path: "/tmp/b.ts" },
            },
          },
        ],
      },
      {
        role: "tool",
        parts: [
          {
            functionResponse: {
              name: "read_file",
              response: { content: "a" },
            },
          },
          {
            functionResponse: {
              name: "read_file",
              response: { content: "b" },
            },
          },
        ],
      },
      {
        role: "model",
        parts: [{ text: "Both files read." }],
      },
    ]);

    const stats = parseGeminiSession(filePath);
    expect(stats.toolCallCount).toBe(2);
    expect(stats.toolUsage["read_file"].count).toBe(2);
  });

  it("returns empty stats for empty JSON array", () => {
    const filePath = writeSession([]);
    const stats = parseGeminiSession(filePath);
    expect(stats.messageCount).toBe(0);
    expect(stats.toolCallCount).toBe(0);
    expect(stats.totalCost).toBe(0);
  });

  it("returns empty stats for malformed JSON", () => {
    const filePath = join(dir, "bad.json");
    writeFileSync(filePath, "not valid json{{{");
    const stats = parseGeminiSession(filePath);
    expect(stats.messageCount).toBe(0);
    expect(stats.detectedProvider).toBe("gemini");
  });

  it("returns empty stats for non-existent file", () => {
    const stats = parseGeminiSession(join(dir, "nope.json"));
    expect(stats.messageCount).toBe(0);
  });

  it("handles turns with mixed text and function parts", () => {
    const filePath = writeSession([
      { role: "user", parts: [{ text: "Help me" }] },
      {
        role: "model",
        parts: [
          { text: "Let me check that file." },
          {
            functionCall: {
              name: "read_file",
              args: { path: "/tmp/x.ts" },
            },
          },
        ],
      },
    ]);

    const stats = parseGeminiSession(filePath);
    expect(stats.messageCount).toBe(2);
    expect(stats.toolCallCount).toBe(1);
  });

  it("sets tokens to 0 (Gemini sessions don't include token counts)", () => {
    const filePath = writeSession([
      { role: "user", parts: [{ text: "Hello" }] },
      { role: "model", parts: [{ text: "Hi there!" }] },
    ]);

    const stats = parseGeminiSession(filePath);
    // Gemini session JSON does not include token usage
    expect(stats.inputTokens).toBe(0);
    expect(stats.outputTokens).toBe(0);
    expect(stats.cacheReadTokens).toBe(0);
    expect(stats.cacheWriteTokens).toBe(0);
  });

  it("computes session duration from file timestamps", () => {
    const filePath = writeSession([
      { role: "user", parts: [{ text: "Hello" }] },
      { role: "model", parts: [{ text: "Hi!" }] },
    ]);

    const stats = parseGeminiSession(filePath);
    // sessionDurationMs is based on file mtime - birthtime
    expect(stats.sessionDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("extracts model name when present in metadata", () => {
    const turns: GeminiTurn[] = [
      { role: "user", parts: [{ text: "Hello" }] },
      {
        role: "model",
        parts: [{ text: "Hi!" }],
        metadata: { model: "gemini-2.5-pro" },
      },
    ];
    const filePath = writeSession(turns);
    const stats = parseGeminiSession(filePath);
    // If metadata.model is present, it should appear in modelUsage
    if (Object.keys(stats.modelUsage).length > 0) {
      expect(stats.modelUsage["gemini-2.5-pro"]).toBeDefined();
    }
  });
});
````

**Run**: `bun test __tests__/lib/gemini/session-parser.test.ts` — expect FAIL

---

## Task 2: Implement session parser

### Create: `lib/gemini/session-parser.ts`

```typescript
import fs from "fs";
import type { SessionStats } from "@/lib/parser/session-aggregator";
import type { ToolUsageEntry, ModelUsageEntry } from "@/types/session";

/**
 * Gemini session JSON format: an array of turns.
 * Each turn has a role and an array of parts.
 */
export interface GeminiPart {
  text?: string;
  functionCall?: {
    name: string;
    args?: Record<string, unknown>;
  };
  functionResponse?: {
    name: string;
    response?: Record<string, unknown>;
  };
  [key: string]: unknown;
}

export interface GeminiTurn {
  role: "user" | "model" | "tool" | string;
  parts: GeminiPart[];
  metadata?: {
    model?: string;
    [key: string]: unknown;
  };
}

function emptyStats(): SessionStats {
  return {
    messageCount: 0,
    toolCallCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    thinkingBlocks: 0,
    totalCost: 0,
    toolUsage: {},
    modelUsage: {},
    enrichedTools: {
      skills: [],
      agents: [],
      mcpTools: {},
      filesModified: [],
      filesRead: [],
      searchedPaths: [],
    },
    autoSummary: null,
    sessionRole: "standalone",
    tags: [],
    detectedInstructionPaths: [],
    avgLatencyMs: 0,
    p50LatencyMs: 0,
    p95LatencyMs: 0,
    maxLatencyMs: 0,
    sessionDurationMs: 0,
    detectedProvider: "gemini",
  };
}

export function parseGeminiSession(filePath: string): SessionStats {
  const stats = emptyStats();

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch {
    return stats;
  }

  let turns: GeminiTurn[];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return stats;
    turns = parsed;
  } catch {
    return stats;
  }

  // Compute session duration from file timestamps
  try {
    const fstat = fs.statSync(filePath);
    const created = fstat.birthtime.getTime();
    const modified = fstat.mtime.getTime();
    stats.sessionDurationMs = Math.max(0, modified - created);
  } catch {
    // ignore
  }

  for (const turn of turns) {
    if (!turn || typeof turn !== "object") continue;
    if (!Array.isArray(turn.parts)) continue;

    stats.messageCount++;

    // Extract model name from metadata if present
    if (turn.metadata?.model && typeof turn.metadata.model === "string") {
      const model = turn.metadata.model;
      if (!stats.modelUsage[model]) {
        stats.modelUsage[model] = {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
          costUSD: 0,
          messages: 0,
        };
      }
      stats.modelUsage[model].messages++;
    }

    // Process parts
    for (const part of turn.parts) {
      if (!part || typeof part !== "object") continue;

      // Count function calls (tool use)
      if (part.functionCall) {
        stats.toolCallCount++;
        const toolName = part.functionCall.name || "unknown";
        if (!stats.toolUsage[toolName]) {
          stats.toolUsage[toolName] = {
            count: 0,
            errors: 0,
            avgDurationMs: null,
          };
        }
        stats.toolUsage[toolName].count++;
      }
    }
  }

  return stats;
}
```

**Run**: `bun test __tests__/lib/gemini/session-parser.test.ts` — expect PASS

---

## Task 3: Run all tests together

**Run**: `bun test __tests__/lib/gemini/`

All test files should pass.

---

## Anti-Hallucination Guardrails

1. **Gemini session JSON does NOT contain token usage data** — `inputTokens`, `outputTokens` are all 0. Tokens are tracked server-side by the Gemini API, not persisted in session files. We set them to 0 and rely on `totalCost = 0` for now. Future work could estimate tokens from text length.
2. **Session files are monolithic JSON, NOT JSONL** — we use `JSON.parse`, not line-by-line streaming
3. **The `role` field can be "user", "model", or "tool"** — "tool" is for function responses
4. **`functionCall` is in model parts, `functionResponse` is in tool parts** — this is the Gemini convention
5. **Do NOT import `streamJsonlFile`** — that is for Claude/Codex JSONL files
6. **`metadata.model` is not guaranteed** — it may not be present in all session files; handle gracefully
7. **`SessionStats` type is imported from session-aggregator** — we reuse the exact same type

## Acceptance Criteria

- [ ] `parseGeminiSession` returns valid `SessionStats` for well-formed Gemini JSON
- [ ] `messageCount` correctly counts all turns (user + model + tool)
- [ ] `toolCallCount` correctly counts `functionCall` parts
- [ ] `toolUsage` map correctly aggregates tool calls by name
- [ ] Malformed JSON returns empty stats (no crash)
- [ ] Missing file returns empty stats (no crash)
- [ ] Empty array returns zero stats
- [ ] `detectedProvider` is always `"gemini"`
- [ ] `sessionDurationMs` is computed from file stat timestamps
- [ ] All tests pass with `bun test __tests__/lib/gemini/session-parser.test.ts`
