import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { aggregateSession } from "@/lib/parser/session-aggregator";
import {
  CODEX_SKILLS_DIR,
  CODEX_VELOCITY_AGENTS_DIR,
} from "@/lib/codex/paths";
import {
  createMockJsonlMessage,
  createMockHumanMessage,
  createMockToolUseMessage,
  writeTempJsonl,
} from "../../helpers/factories";

describe("aggregateSession", () => {
  const tempFiles: string[] = [];

  function writeFixture(messages: Parameters<typeof writeTempJsonl>[0]) {
    const p = writeTempJsonl(messages);
    tempFiles.push(p);
    return p;
  }

  afterEach(() => {
    for (const f of tempFiles) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    tempFiles.length = 0;
  });

  it("counts messages and tokens from a basic conversation", async () => {
    const jsonlPath = writeFixture([
      createMockHumanMessage("Hello"),
      createMockJsonlMessage({
        message: {
          role: "assistant",
          content: "Hi there!",
          model: "claude-sonnet-4-5-20250929",
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_read_input_tokens: 10,
            cache_creation_input_tokens: 5,
          },
        },
      }),
    ]);

    const stats = await aggregateSession(jsonlPath);
    expect(stats.messageCount).toBe(2); // human + assistant
    expect(stats.inputTokens).toBe(100);
    expect(stats.outputTokens).toBe(50);
    expect(stats.cacheReadTokens).toBe(10);
    expect(stats.cacheWriteTokens).toBe(5);
    expect(stats.totalCost).toBeGreaterThan(0);
  });

  it("parses cache token aliases from usage blocks", async () => {
    const jsonlPath = writeFixture([
      createMockHumanMessage("Hello"),
      createMockJsonlMessage({
        message: {
          role: "assistant",
          content: "Hi there!",
          model: "claude-sonnet-4-5-20250929",
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_read_tokens: 12,
            cache_write_tokens: 7,
          },
        },
      }),
    ]);

    const stats = await aggregateSession(jsonlPath);
    expect(stats.inputTokens).toBe(100);
    expect(stats.outputTokens).toBe(50);
    expect(stats.cacheReadTokens).toBe(12);
    expect(stats.cacheWriteTokens).toBe(7);
  });

  it("counts tool calls and attributes tokens proportionally", async () => {
    const jsonlPath = writeFixture([
      createMockHumanMessage("Edit a file"),
      createMockToolUseMessage(
        "Read",
        { file_path: "/tmp/test.ts" },
        {
          input_tokens: 200,
          output_tokens: 100,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      ),
    ]);

    const stats = await aggregateSession(jsonlPath);
    expect(stats.toolCallCount).toBe(1);
    expect(stats.toolUsage["Read"]).toBeDefined();
    expect(stats.toolUsage["Read"].count).toBe(1);
    expect(stats.toolUsage["Read"].inputTokens).toBe(200);
    expect(stats.toolUsage["Read"].outputTokens).toBe(100);
  });

  it("tracks model usage breakdown", async () => {
    const jsonlPath = writeFixture([
      createMockHumanMessage("Hi"),
      createMockJsonlMessage({
        message: {
          role: "assistant",
          content: "Hello",
          model: "claude-opus-4-6",
          usage: { input_tokens: 500, output_tokens: 200 },
        },
      }),
      createMockJsonlMessage({
        message: {
          role: "assistant",
          content: "More",
          model: "claude-sonnet-4-5-20250929",
          usage: { input_tokens: 300, output_tokens: 100 },
        },
      }),
    ]);

    const stats = await aggregateSession(jsonlPath);
    expect(Object.keys(stats.modelUsage)).toHaveLength(2);
    expect(stats.modelUsage["claude-opus-4-6"].inputTokens).toBe(500);
    expect(stats.modelUsage["claude-sonnet-4-5-20250929"].inputTokens).toBe(
      300,
    );
  });

  it("detects skills and agents in tool use", async () => {
    const jsonlPath = writeFixture([
      createMockHumanMessage("Run skill"),
      {
        type: "assistant",
        uuid: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        message: {
          role: "assistant",
          content: [
            { type: "tool_use", name: "Skill", input: { skill: "commit" } },
            {
              type: "tool_use",
              name: "Task",
              input: { subagent_type: "Bash", description: "run tests" },
            },
          ],
          model: "claude-sonnet-4-5-20250929",
          usage: { input_tokens: 100, output_tokens: 50 },
        },
      },
    ]);

    const stats = await aggregateSession(jsonlPath);
    expect(stats.enrichedTools.skills).toEqual([{ name: "commit", count: 1 }]);
    expect(stats.enrichedTools.agents).toEqual([
      { type: "Bash", description: "run tests" },
    ]);
  });

  it("maps detected skill/agent instruction paths to the detected provider", async () => {
    const jsonlPath = writeFixture([
      createMockHumanMessage("Run codex helpers"),
      createMockJsonlMessage({
        message: {
          role: "assistant",
          content: [
            { type: "tool_use", name: "Skill", input: { skill: "plan" } },
            {
              type: "tool_use",
              name: "Task",
              input: { subagent_type: "reviewer", description: "check plan" },
            },
          ],
          model: "gpt-5.2-codex",
          usage: { input_tokens: 100, output_tokens: 40 },
        },
      }),
    ]);

    const stats = await aggregateSession(jsonlPath);

    expect(stats.detectedProvider).toBe("codex");
    expect(stats.detectedInstructionPaths).toContain(
      path.join(CODEX_SKILLS_DIR, "plan", "SKILL.md"),
    );
    expect(stats.detectedInstructionPaths).toContain(
      path.join(CODEX_VELOCITY_AGENTS_DIR, "reviewer.md"),
    );
    expect(
      stats.detectedInstructionPaths.some((entry) =>
        entry.includes(".claude/commands"),
      ),
    ).toBe(false);
  });

  it("detects MCP tools", async () => {
    const jsonlPath = writeFixture([
      createMockHumanMessage("Use MCP"),
      createMockToolUseMessage("mcp__serena__find_symbol", { name: "Foo" }),
    ]);

    const stats = await aggregateSession(jsonlPath);
    expect(stats.enrichedTools.mcpTools["serena"]).toBe(1);
  });

  it("counts thinking blocks", async () => {
    const jsonlPath = writeFixture([
      createMockHumanMessage("Think"),
      {
        type: "assistant",
        uuid: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        message: {
          role: "assistant",
          content: [
            { type: "thinking", text: "Hmm..." },
            { type: "text", text: "Done" },
          ],
          model: "claude-sonnet-4-5-20250929",
          usage: { input_tokens: 100, output_tokens: 50 },
        },
      },
    ]);

    const stats = await aggregateSession(jsonlPath);
    expect(stats.thinkingBlocks).toBe(1);
  });

  it("extracts effort mode from nested Claude metadata records", async () => {
    const jsonlPath = writeFixture([
      {
        type: "meta",
        uuid: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        data: {
          turn_context: {
            collaboration_mode: {
              settings: {
                reasoning_effort: "xhigh",
              },
            },
          },
        },
      },
      createMockHumanMessage("Think harder"),
      createMockJsonlMessage({
        message: {
          role: "assistant",
          content: "Done",
          model: "claude-sonnet-4-5-20250929",
          usage: { input_tokens: 120, output_tokens: 60 },
        },
      }),
    ]);

    const stats = await aggregateSession(jsonlPath);
    expect(stats.effortMode).toBe("xhigh");
  });

  it("extracts effort mode from CLAUDE_CODE_EFFORT_LEVEL env metadata", async () => {
    const jsonlPath = writeFixture([
      {
        type: "meta",
        uuid: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        data: {
          env: {
            CLAUDE_CODE_EFFORT_LEVEL: "medium",
          },
        },
      },
      createMockHumanMessage("Think"),
      createMockJsonlMessage(),
    ]);

    const stats = await aggregateSession(jsonlPath);
    expect(stats.effortMode).toBe("medium");
  });

  it("captures first prompt, git branch, and project path hints", async () => {
    const jsonlPath = writeFixture([
      {
        type: "meta",
        uuid: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        data: {
          git: { branch: "feature/session-metadata" },
          cwd: "/Users/test/workspace/project-a",
        },
      },
      createMockHumanMessage("Please summarize this repository state."),
      createMockJsonlMessage({
        message: {
          role: "assistant",
          content: "Done",
          model: "claude-sonnet-4-5-20250929",
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      }),
    ]);

    const stats = await aggregateSession(jsonlPath);
    expect(stats.firstPrompt).toBe("Please summarize this repository state.");
    expect(stats.gitBranch).toBe("feature/session-metadata");
    expect(stats.projectPath).toBe("/Users/test/workspace/project-a");
  });

  it("handles empty file", async () => {
    const jsonlPath = writeFixture([]);
    const stats = await aggregateSession(jsonlPath);
    expect(stats.messageCount).toBe(0);
    expect(stats.totalCost).toBe(0);
    expect(stats.toolCallCount).toBe(0);
  });

  it("skips malformed lines gracefully", async () => {
    const filePath = writeTempJsonl([createMockHumanMessage("Hi")]);
    tempFiles.push(filePath);
    // Append a malformed line
    fs.appendFileSync(filePath, "this is not json\n");
    fs.appendFileSync(
      filePath,
      JSON.stringify(createMockJsonlMessage()) + "\n",
    );

    const stats = await aggregateSession(filePath);
    // Should still have parsed the valid messages
    expect(stats.messageCount).toBe(2); // human + assistant
  });

  it("handles messages without usage blocks", async () => {
    const jsonlPath = writeFixture([
      createMockHumanMessage("System message without usage"),
      {
        type: "assistant",
        uuid: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        message: {
          role: "assistant",
          content: "No usage here",
          model: "claude-sonnet-4-5-20250929",
          // No usage block
        },
      },
    ]);

    const stats = await aggregateSession(jsonlPath);
    expect(stats.messageCount).toBe(2);
    expect(stats.inputTokens).toBe(0);
  });

  it("tracks files modified by Write/Edit tools as FileWriteEntry[]", async () => {
    const jsonlPath = writeFixture([
      createMockHumanMessage("Edit files"),
      createMockToolUseMessage("Write", { file_path: "/tmp/new.ts" }),
      createMockToolUseMessage("Edit", { file_path: "/tmp/existing.ts" }),
      createMockToolUseMessage("Edit", { file_path: "/tmp/existing.ts" }),
    ]);

    const stats = await aggregateSession(jsonlPath);
    const modified = stats.enrichedTools.filesModified;
    expect(modified).toHaveLength(2);

    const newFile = modified.find((f) => f.path === "/tmp/new.ts");
    expect(newFile).toBeDefined();
    expect(newFile!.count).toBe(1);
    expect(newFile!.category).toBe("code");

    const existingFile = modified.find((f) => f.path === "/tmp/existing.ts");
    expect(existingFile).toBeDefined();
    expect(existingFile!.count).toBe(2); // edited twice
    expect(existingFile!.category).toBe("code");
  });
});
