import { describe, it, expect } from "vitest";
import {
  fuzzyMatch,
  getGroupedCommands,
  getCommandsForProvider,
  COMMAND_REGISTRY,
  CATEGORY_LABELS,
  type CommandHandler,
  type CommandCategory,
} from "@/lib/console/commands";

describe("fuzzyMatch", () => {
  it("matches exact substring", () => {
    expect(fuzzyMatch("clear", "clear")).toBe(true);
  });

  it("matches partial substring", () => {
    expect(fuzzyMatch("cl", "clear")).toBe(true);
  });

  it("matches fuzzy (chars in order)", () => {
    expect(fuzzyMatch("clr", "clear")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(fuzzyMatch("CLEAR", "clear")).toBe(true);
    expect(fuzzyMatch("clear", "CLEAR")).toBe(true);
  });

  it("rejects non-matching query", () => {
    expect(fuzzyMatch("xyz", "clear")).toBe(false);
  });

  it("rejects out-of-order chars", () => {
    expect(fuzzyMatch("rlc", "clear")).toBe(false);
  });

  it("handles empty query", () => {
    expect(fuzzyMatch("", "clear")).toBe(true);
  });
});

describe("getGroupedCommands", () => {
  it("returns all commands when query is empty", () => {
    const groups = getGroupedCommands("");
    const totalCommands = groups.reduce((sum, g) => sum + g.commands.length, 0);
    expect(totalCommands).toBe(COMMAND_REGISTRY.length);
  });

  it("filters by command name", () => {
    const groups = getGroupedCommands("clear");
    const allCommands = groups.flatMap((g) => g.commands);
    expect(allCommands.some((c) => c.name === "clear")).toBe(true);
  });

  it("filters by description", () => {
    const groups = getGroupedCommands("clipboard");
    const allCommands = groups.flatMap((g) => g.commands);
    expect(allCommands.some((c) => c.name === "copy")).toBe(true);
  });

  it("groups are in expected order", () => {
    const groups = getGroupedCommands("");
    const categories = groups.map((g) => g.category);
    const expectedOrder: CommandCategory[] = [
      "session",
      "config",
      "info",
      "navigation",
      "tools",
    ];
    // Each category in groups should appear in the expected order
    for (let i = 1; i < categories.length; i++) {
      expect(expectedOrder.indexOf(categories[i])).toBeGreaterThanOrEqual(
        expectedOrder.indexOf(categories[i - 1]),
      );
    }
  });

  it("includes extra commands when provided", () => {
    const extra = [
      {
        name: "custom",
        description: "Custom command",
        category: "tools" as CommandCategory,
        handler: "client" as CommandHandler,
      },
    ];
    const groups = getGroupedCommands("custom", extra);
    const allCommands = groups.flatMap((g) => g.commands);
    expect(allCommands.some((c) => c.name === "custom")).toBe(true);
  });

  it("returns empty groups for non-matching query", () => {
    const groups = getGroupedCommands("zzzzzzzzzzz");
    const totalCommands = groups.reduce((sum, g) => sum + g.commands.length, 0);
    expect(totalCommands).toBe(0);
  });
});

describe("COMMAND_REGISTRY stale routes", () => {
  it("has no command named 'swarm'", () => {
    expect(COMMAND_REGISTRY.find((c) => c.name === "swarm")).toBeUndefined();
  });

  it("has no route pointing to /instructions", () => {
    const stale = COMMAND_REGISTRY.filter((c) => c.route === "/instructions");
    expect(stale).toHaveLength(0);
  });

  it("has no route pointing to /library", () => {
    const stale = COMMAND_REGISTRY.filter((c) => c.route?.startsWith("/library"));
    expect(stale).toHaveLength(0);
  });

  it("memory command routes to /skills", () => {
    const mem = COMMAND_REGISTRY.find((c) => c.name === "memory");
    expect(mem?.route).toBe("/skills");
  });

  it("plugin command routes to /mcp", () => {
    const plugin = COMMAND_REGISTRY.find((c) => c.name === "plugin");
    expect(plugin?.route).toBe("/mcp");
  });

  it("marketplace command routes to /marketplace", () => {
    const mp = COMMAND_REGISTRY.find((c) => c.name === "marketplace");
    expect(mp?.route).toBe("/marketplace");
  });
});

describe("COMMAND_REGISTRY completeness", () => {
  const validHandlers: CommandHandler[] = [
    "client",
    "server",
    "navigation",
    "dialog",
  ];
  const validCategories: CommandCategory[] = [
    "session",
    "config",
    "info",
    "tools",
    "navigation",
  ];

  it("every command has a valid handler type", () => {
    for (const cmd of COMMAND_REGISTRY) {
      expect(validHandlers).toContain(cmd.handler);
    }
  });

  it("every command has a valid category", () => {
    for (const cmd of COMMAND_REGISTRY) {
      expect(validCategories).toContain(cmd.category);
    }
  });

  it("navigation handlers all have routes", () => {
    const navCommands = COMMAND_REGISTRY.filter(
      (c) => c.handler === "navigation",
    );
    for (const cmd of navCommands) {
      expect(cmd.route).toBeDefined();
      expect(cmd.route).toMatch(/^\//);
    }
  });

  it("no duplicate command names", () => {
    const names = COMMAND_REGISTRY.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every category has a label", () => {
    for (const cat of validCategories) {
      expect(CATEGORY_LABELS[cat]).toBeDefined();
      expect(typeof CATEGORY_LABELS[cat]).toBe("string");
    }
  });
});

describe("getCommandsForProvider parity", () => {
  it("returns grouped registry commands for codex and gemini", () => {
    const codex = getCommandsForProvider("codex", "clear");
    const gemini = getCommandsForProvider("gemini", "clear");

    const codexNames = codex.flatMap((g) => g.commands.map((c) => c.name));
    const geminiNames = gemini.flatMap((g) => g.commands.map((c) => c.name));

    expect(codexNames).toContain("clear");
    expect(geminiNames).toContain("clear");
  });

  it("excludes Claude-only config/navigation commands for non-Claude providers", () => {
    const codexNames = getCommandsForProvider("codex")
      .flatMap((g) => g.commands.map((c) => c.name));
    const geminiNames = getCommandsForProvider("gemini")
      .flatMap((g) => g.commands.map((c) => c.name));

    for (const names of [codexNames, geminiNames]) {
      expect(names).not.toContain("hooks");
      expect(names).not.toContain("add-hook");
      expect(names).not.toContain("plugin");
    }
  });

  it("localizes memory/init command copy for each provider entrypoint file", () => {
    const claudeMemory = getCommandsForProvider("claude", "memory")
      .flatMap((g) => g.commands)
      .find((c) => c.name === "memory");
    const codexMemory = getCommandsForProvider("codex", "memory")
      .flatMap((g) => g.commands)
      .find((c) => c.name === "memory");
    const geminiMemory = getCommandsForProvider("gemini", "memory")
      .flatMap((g) => g.commands)
      .find((c) => c.name === "memory");

    expect(claudeMemory?.description).toContain("CLAUDE.md");
    expect(codexMemory?.description).toContain("AGENTS.md");
    expect(geminiMemory?.description).toContain("GEMINI.md");
  });

  it("does not leak Claude phrasing in Codex/Gemini command copy", () => {
    const codexCommands = getCommandsForProvider("codex").flatMap(
      (g) => g.commands,
    );
    const geminiCommands = getCommandsForProvider("gemini").flatMap(
      (g) => g.commands,
    );

    for (const cmd of [...codexCommands, ...geminiCommands]) {
      expect(cmd.description).not.toContain("Claude");
      if (cmd.details) expect(cmd.details).not.toContain("Claude");
    }
  });
});
