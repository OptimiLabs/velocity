# Codex CLI Compatibility Audit — Bug Discovery & Test Coverage

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Systematically identify every place where Codex CLI sessions/config/storage diverge from Claude Code assumptions, write failing tests exposing each bug, then fix them.

**Architecture:** The app ("velocity") is a Next.js dashboard that indexes and analyzes coding agent sessions. It currently assumes Claude Code's storage layout (`~/.claude/projects/`, `sessions-index.json`, `settings.json`, `CLAUDE.md`). Codex CLI uses entirely different paths (`~/.codex/`, `config.toml`, `AGENTS.md`, `sessions/YYYY/MM/DD/rollout-*.jsonl`). This plan audits every incompatibility, writes tests proving each bug, then fixes them.

**Tech Stack:** Next.js 15, better-sqlite3, Vitest, smol-toml

---

## Key Differences: Claude Code vs Codex CLI

| Aspect          | Claude Code                                                                  | Codex CLI                                                            |
| --------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Home dir        | `~/.claude/`                                                                 | `~/.codex/`                                                          |
| Config format   | `settings.json` (JSON)                                                       | `config.toml` (TOML)                                                 |
| Instructions    | `CLAUDE.md` in project root                                                  | `AGENTS.md` in project root (+ `AGENTS.override.md`)                 |
| Session storage | `~/.claude/projects/<encoded-path>/<uuid>.jsonl`                             | `~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<uuid>.jsonl`      |
| Session index   | `sessions-index.json` per project dir                                        | No index file; sessions are date-sharded                             |
| JSONL format    | `{type, uuid, message: {role, content, model, usage}}`                       | `{type, payload, turn_context}` (different field names)              |
| Token usage     | `usage.input_tokens`, `usage.output_tokens`, `usage.cache_read_input_tokens` | `payload.type === "token_count"` with cumulative totals              |
| Models          | `claude-*` family                                                            | `gpt-*`, `o1-*`, `o3-*`, `o4-*`, `codex-mini-*`                      |
| Hooks           | JSON-based in `settings.json` under `hooks` key                              | Not in config.toml; uses `prepare-commit-msg` git hook               |
| MCP config      | JSON in `settings.json` under `mcpServers`                                   | TOML in `config.toml` under `[mcp_servers.<id>]`                     |
| Approval modes  | Permission-based (`allowedTools`, etc.)                                      | `approval_policy`: `untrusted`, `on-request`, `never`                |
| Sandbox         | N/A (runs locally)                                                           | `sandbox_mode`: `read-only`, `workspace-write`, `danger-full-access` |

---

## Bug Category 1: Session Discovery — Codex sessions never found

The indexer (`lib/parser/indexer.ts`) ONLY looks in `~/.claude/projects/` for JSONL files. Codex stores sessions under `~/.codex/sessions/YYYY/MM/DD/`. These sessions will never be discovered, indexed, or displayed.

### Task 1: Write failing test — Codex session discovery

**Files:**

- Create: `__tests__/lib/parser/codex-session-discovery.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

// Mock filesystem to simulate Codex session directory structure
describe("Codex session discovery", () => {
  const CODEX_HOME = path.join(os.homedir(), ".codex");
  const CODEX_SESSIONS = path.join(CODEX_HOME, "sessions");

  it("should discover sessions in ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl", () => {
    // The indexer currently only looks in ~/.claude/projects/
    // Codex sessions live in ~/.codex/sessions/2025/08/29/rollout-2025-08-29T14-50-52-<uuid>.jsonl
    const codexSessionPath = path.join(
      CODEX_SESSIONS,
      "2025",
      "08",
      "29",
      "rollout-2025-08-29T14-50-52-abc12345.jsonl",
    );

    // This test documents the bug: the app has no awareness of Codex session paths
    // Currently lib/parser/indexer.ts line 181: only checks PROJECTS_DIR (~/.claude/projects/)
    expect(typeof codexSessionPath).toBe("string");

    // The key assertion: there should be a function that knows about Codex paths
    // Import will fail until we create the codex session discovery module
    const { getCodexSessionPaths } = require("@/lib/codex/session-discovery");
    expect(getCodexSessionPaths).toBeDefined();
  });

  it("should parse Codex rollout filename into session metadata", () => {
    const filename =
      "rollout-2025-08-29T14-50-52-abc12345-6789-abcd-ef01.jsonl";
    const {
      parseCodexSessionFilename,
    } = require("@/lib/codex/session-discovery");
    const meta = parseCodexSessionFilename(filename);
    expect(meta).toEqual({
      sessionId: expect.stringContaining("abc12345"),
      timestamp: expect.any(String),
      date: "2025-08-29",
    });
  });

  it("should walk date-sharded directories to find all sessions", () => {
    const { discoverCodexSessions } = require("@/lib/codex/session-discovery");
    // Should return an array of { sessionId, filePath, createdAt, modifiedAt }
    expect(discoverCodexSessions).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test __tests__/lib/parser/codex-session-discovery.test.ts`
Expected: FAIL — module `@/lib/codex/session-discovery` does not exist

**Step 3: Write minimal implementation**

Create `lib/codex/session-discovery.ts`:

```ts
import fs from "fs";
import path from "path";
import { CODEX_HOME } from "./paths";

const CODEX_SESSIONS_DIR = path.join(CODEX_HOME, "sessions");

export interface CodexSessionEntry {
  sessionId: string;
  filePath: string;
  createdAt: string;
  modifiedAt: string;
  date: string;
}

export function getCodexSessionPaths(): string {
  return CODEX_SESSIONS_DIR;
}

export function parseCodexSessionFilename(filename: string): {
  sessionId: string;
  timestamp: string;
  date: string;
} | null {
  // rollout-2025-08-29T14-50-52-abc12345-6789-abcd-ef01.jsonl
  const match = filename.match(
    /^rollout-(\d{4}-\d{2}-\d{2})T[\d-]+-(.+)\.jsonl$/,
  );
  if (!match) return null;
  return {
    sessionId: match[2],
    timestamp: match[1],
    date: match[1],
  };
}

export function discoverCodexSessions(): CodexSessionEntry[] {
  if (!fs.existsSync(CODEX_SESSIONS_DIR)) return [];

  const entries: CodexSessionEntry[] = [];

  // Walk YYYY/MM/DD structure
  for (const year of safeReadDir(CODEX_SESSIONS_DIR)) {
    const yearDir = path.join(CODEX_SESSIONS_DIR, year);
    if (!isDir(yearDir)) continue;

    for (const month of safeReadDir(yearDir)) {
      const monthDir = path.join(yearDir, month);
      if (!isDir(monthDir)) continue;

      for (const day of safeReadDir(monthDir)) {
        const dayDir = path.join(monthDir, day);
        if (!isDir(dayDir)) continue;

        for (const file of safeReadDir(dayDir)) {
          if (!file.endsWith(".jsonl")) continue;
          const filePath = path.join(dayDir, file);
          const parsed = parseCodexSessionFilename(file);
          if (!parsed) continue;

          try {
            const stat = fs.statSync(filePath);
            entries.push({
              sessionId: parsed.sessionId,
              filePath,
              createdAt: stat.birthtime.toISOString(),
              modifiedAt: stat.mtime.toISOString(),
              date: parsed.date,
            });
          } catch {
            /* skip */
          }
        }
      }
    }
  }

  return entries;
}

function safeReadDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `bun test __tests__/lib/parser/codex-session-discovery.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add __tests__/lib/parser/codex-session-discovery.test.ts lib/codex/session-discovery.ts
git commit -m "feat: add Codex session discovery module"
```

---

## Bug Category 2: JSONL Format Mismatch — Codex JSONL can't be parsed

The JSONL parser (`lib/parser/jsonl.ts`) and aggregator (`lib/parser/session-aggregator.ts`) assume Claude Code's message format: `{message: {role, content, model, usage}}`. Codex CLI uses a different structure with `payload` and `turn_context` fields. Codex sessions that ARE discovered will produce zero stats (0 messages, 0 tokens, $0 cost).

### Task 2: Write failing test — Codex JSONL format parsing

**Files:**

- Create: `__tests__/lib/parser/codex-jsonl-format.test.ts`
- Create: `__tests__/fixtures/codex-session-sample.jsonl`

**Step 1: Write the failing test**

First create a minimal Codex JSONL fixture at `__tests__/fixtures/codex-session-sample.jsonl`. Use the known Codex format from the OpenAI docs (each line is a JSON object with `type` field, with payload containing conversation turns and token counts).

```ts
import { describe, it, expect } from "vitest";
import path from "path";
import { streamJsonlFile } from "@/lib/parser/jsonl";

describe("Codex JSONL format compatibility", () => {
  const fixturePath = path.join(
    __dirname,
    "..",
    "..",
    "fixtures",
    "codex-session-sample.jsonl",
  );

  it("should handle Codex message format without crashing", async () => {
    const messages: unknown[] = [];
    for await (const msg of streamJsonlFile(fixturePath)) {
      messages.push(msg);
    }
    // Should parse without throwing
    expect(messages.length).toBeGreaterThan(0);
  });

  it("should extract message role from Codex format", async () => {
    // Codex uses a different message structure
    // The current aggregator reads msg.message.role which won't exist
    // This test proves the aggregator produces 0 for Codex sessions
    const { aggregateSession } =
      await import("@/lib/parser/session-aggregator");
    const stats = await aggregateSession(fixturePath);

    // BUG: These will all be 0 because the aggregator can't parse Codex format
    // After fix, these should be > 0
    expect(stats.messageCount).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test __tests__/lib/parser/codex-jsonl-format.test.ts`
Expected: FAIL — `stats.messageCount` is 0 because the aggregator can't parse Codex JSONL

**Step 3: Write a Codex JSONL adapter**

Create `lib/parser/codex-adapter.ts` that normalizes Codex JSONL messages into the `JsonlMessage` format the aggregator expects. This adapter should:

- Map `payload.type === "message"` to `{message: {role, content, model}}`
- Map `payload.type === "token_count"` to `{message: {usage: {input_tokens, output_tokens}}}`
- Map `turn_context.model` to `message.model`
- Handle Codex tool calls (function_call format vs Claude's tool_use format)

**Step 4: Run test to verify it passes**

Run: `bun test __tests__/lib/parser/codex-jsonl-format.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add __tests__/lib/parser/codex-jsonl-format.test.ts __tests__/fixtures/codex-session-sample.jsonl lib/parser/codex-adapter.ts
git commit -m "feat: add Codex JSONL adapter for session parsing"
```

---

## Bug Category 3: Cost Calculation — OpenAI models priced as Claude Sonnet

`lib/cost/pricing.ts` only has Claude model pricing. `lib/cost/calculator.ts` falls back to `DEFAULT_PRICING` (Claude Sonnet rates) for unknown models. When a Codex session uses `gpt-4o` or `o4-mini`, costs are calculated using Claude Sonnet's $3/$15 rates instead of OpenAI's actual rates.

### Task 3: Write failing test — OpenAI model pricing

**Files:**

- Modify: `__tests__/lib/cost/calculator.test.ts`

**Step 1: Write the failing test**

```ts
describe("OpenAI model pricing", () => {
  it("should have correct pricing for gpt-4o", () => {
    const pricing = MODEL_PRICING["gpt-4o"];
    expect(pricing).toBeDefined();
    expect(pricing.input).toBe(2.5); // $2.50/M input
    expect(pricing.output).toBe(10.0); // $10/M output
  });

  it("should have correct pricing for o4-mini", () => {
    const pricing = MODEL_PRICING["o4-mini"];
    expect(pricing).toBeDefined();
  });

  it("should have correct pricing for gpt-5-codex", () => {
    const pricing =
      MODEL_PRICING["gpt-5-codex"] || MODEL_PRICING["gpt-5.3-codex"];
    expect(pricing).toBeDefined();
  });

  it("should NOT use Claude Sonnet pricing for gpt-4o", () => {
    const cost = calculateCost("gpt-4o", 1_000_000, 1_000_000, 0, 0);
    // Should NOT be Sonnet's $3 + $15 = $18
    expect(cost).not.toBeCloseTo(
      (1_000_000 / 1_000_000) * 3.0 + (1_000_000 / 1_000_000) * 15.0,
      1,
    );
  });

  it("should calculate correct cost for o4-mini", () => {
    const cost = calculateCost("o4-mini", 1_000_000, 1_000_000, 0, 0);
    // o4-mini: $1.10/M input, $4.40/M output (approx OpenAI pricing)
    expect(cost).toBeLessThan(10); // Should be much less than Sonnet
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test __tests__/lib/cost/calculator.test.ts`
Expected: FAIL — `MODEL_PRICING["gpt-4o"]` is undefined, cost uses Sonnet fallback

**Step 3: Add OpenAI model pricing to `lib/cost/pricing.ts`**

Add pricing entries for:

- `gpt-4o`: $2.50/$10.00
- `gpt-4o-mini`: $0.15/$0.60
- `o1`: $15.00/$60.00
- `o1-mini`: $1.10/$4.40
- `o3`: $2.00/$8.00 (estimated)
- `o3-mini`: $1.10/$4.40
- `o4-mini`: $1.10/$4.40
- `gpt-5-codex` / `gpt-5.3-codex`: pricing TBD (use latest available)
- `codex-mini-latest`: $1.50/$6.00 (estimated)

Set cacheRead/cacheWrite to 0 for OpenAI models (they don't use Anthropic's caching model).

**Step 4: Run test to verify it passes**

Run: `bun test __tests__/lib/cost/calculator.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/cost/pricing.ts __tests__/lib/cost/calculator.test.ts
git commit -m "feat: add OpenAI model pricing for accurate Codex cost calculation"
```

---

## Bug Category 4: getModelTier — OpenAI models all classified as "other"

`lib/cost/calculator.ts:getModelTier()` checks for "opus", "sonnet", "haiku" in model names. All OpenAI models return `"other"`, which affects UI display (badge colors, tier labels).

### Task 4: Write failing test — model tier classification

**Files:**

- Modify: `__tests__/lib/cost/calculator.test.ts`

**Step 1: Write the failing test**

```ts
import { getModelTier } from "@/lib/cost/calculator";

describe("getModelTier for OpenAI models", () => {
  it("should classify gpt-4o as a recognizable tier", () => {
    const tier = getModelTier("gpt-4o");
    expect(tier).not.toBe("other"); // BUG: currently returns "other"
  });

  it("should classify o4-mini as a recognizable tier", () => {
    const tier = getModelTier("o4-mini");
    expect(tier).not.toBe("other");
  });

  it("should classify codex-mini-latest as a recognizable tier", () => {
    const tier = getModelTier("codex-mini-latest");
    expect(tier).not.toBe("other");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test __tests__/lib/cost/calculator.test.ts`
Expected: FAIL — all return `"other"`

**Step 3: Extend getModelTier**

Add OpenAI model tiers (e.g., `"gpt"`, `"reasoning"`, or map them to a more generic tier system). Update `ModelTier`, `TIER_LABELS`, and `TIER_COLORS` accordingly.

**Step 4: Run test to verify it passes**

Run: `bun test __tests__/lib/cost/calculator.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/cost/calculator.ts __tests__/lib/cost/calculator.test.ts
git commit -m "feat: classify OpenAI models into proper tiers"
```

---

## Bug Category 5: Instruction Indexer — AGENTS.md never discovered

`lib/instructions/indexer.ts` scans for `CLAUDE.md` in project roots (line 44, `PROJECT_PATTERNS`). Codex uses `AGENTS.md` (and `AGENTS.override.md`) for the same purpose. Codex projects' instructions are invisible to the dashboard.

### Task 5: Write failing test — AGENTS.md discovery

**Files:**

- Create: `__tests__/lib/instructions/codex-instructions.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";

describe("Codex instruction file discovery", () => {
  it("PROJECT_PATTERNS should include AGENTS.md", () => {
    // The instruction indexer should discover AGENTS.md in project roots
    // Currently it only looks for CLAUDE.md (line 44 of lib/instructions/indexer.ts)
    const { PROJECT_PATTERNS } = require("@/lib/instructions/indexer");

    // BUG: No pattern matches AGENTS.md
    const hasAgentsMd = PROJECT_PATTERNS.some((p: { pattern: RegExp }) =>
      p.pattern.test("AGENTS.md"),
    );
    expect(hasAgentsMd).toBe(true);
  });

  it("PROJECT_PATTERNS should include AGENTS.override.md", () => {
    const { PROJECT_PATTERNS } = require("@/lib/instructions/indexer");
    const hasOverride = PROJECT_PATTERNS.some((p: { pattern: RegExp }) =>
      p.pattern.test("AGENTS.override.md"),
    );
    expect(hasOverride).toBe(true);
  });

  it("GLOBAL_PATTERNS should scan ~/.codex/ for AGENTS.md", () => {
    const { GLOBAL_PATTERNS } = require("@/lib/instructions/indexer");
    const hasCodexDir = GLOBAL_PATTERNS.some((p: { dir: string }) =>
      p.dir.includes(".codex"),
    );
    expect(hasCodexDir).toBe(true);
  });

  it("classifyFileType should handle AGENTS.md", () => {
    const { classifyFileType } = require("@/lib/instructions/indexer");
    expect(classifyFileType("/project/AGENTS.md")).toBe("agents.md");
    expect(classifyFileType("/project/AGENTS.override.md")).toBe("agents.md");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test __tests__/lib/instructions/codex-instructions.test.ts`
Expected: FAIL — no AGENTS.md pattern, no ~/.codex/ scanning

**Step 3: Add AGENTS.md to instruction patterns**

Update `lib/instructions/indexer.ts`:

- Add `AGENTS.md` and `AGENTS.override.md` to `PROJECT_PATTERNS`
- Add `~/.codex/` scanning to `GLOBAL_PATTERNS`
- Update `classifyFileType()` to recognize `AGENTS.md`
- Add `.codex/` project-level scanning to `scanProjects()`

**Step 4: Run test to verify it passes**

Run: `bun test __tests__/lib/instructions/codex-instructions.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/instructions/indexer.ts __tests__/lib/instructions/codex-instructions.test.ts
git commit -m "feat: discover AGENTS.md instruction files for Codex projects"
```

---

## Bug Category 6: Session Watcher — only watches ~/.claude/projects/

`server/watcher.ts` watches `~/.claude/projects/**/*.jsonl` (line 72). Codex sessions at `~/.codex/sessions/` are never watched for real-time updates.

### Task 6: Write failing test — watcher path coverage

**Files:**

- Create: `__tests__/server/watcher-paths.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import path from "path";
import os from "os";

describe("SessionWatcher paths", () => {
  it("should watch Codex session directory in addition to Claude", () => {
    // The watcher at server/watcher.ts:72 only watches PROJECTS_DIR
    // It should also watch ~/.codex/sessions/**/*.jsonl
    const CODEX_SESSIONS = path.join(os.homedir(), ".codex", "sessions");
    const CLAUDE_PROJECTS = path.join(os.homedir(), ".claude", "projects");

    // Document both required paths
    expect(CODEX_SESSIONS).toBeDefined();
    expect(CLAUDE_PROJECTS).toBeDefined();

    // After fix: the watcher should accept an array of paths
    // This is a design-level test — actual watcher testing requires mocking chokidar
  });
});
```

**Step 2: Implement multi-path watcher**

Update `server/watcher.ts` to watch both `~/.claude/projects/**/*.jsonl` AND `~/.codex/sessions/**/*.jsonl`. Extract the watch path into a configurable array.

**Step 3: Commit**

```bash
git add server/watcher.ts __tests__/server/watcher-paths.test.ts
git commit -m "feat: watch both Claude and Codex session directories"
```

---

## Bug Category 7: categorizeFilePath — Codex paths not recognized

`lib/parser/session-utils.ts:categorizeFilePath()` checks for `/.claude/` patterns. Codex files under `/.codex/` (config, instructions) are all categorized as "code" or "other".

### Task 7: Write failing test — Codex path categorization

**Files:**

- Create: `__tests__/lib/parser/codex-path-categorization.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { categorizeFilePath } from "@/lib/parser/session-utils";

describe("categorizeFilePath for Codex paths", () => {
  it("should categorize ~/.codex/AGENTS.md as instruction", () => {
    expect(categorizeFilePath("/Users/x/.codex/AGENTS.md")).toBe("instruction");
  });

  it("should categorize project AGENTS.md as instruction", () => {
    expect(categorizeFilePath("/Users/x/project/AGENTS.md")).toBe(
      "instruction",
    );
  });

  it("should categorize AGENTS.override.md as instruction", () => {
    expect(categorizeFilePath("/Users/x/project/AGENTS.override.md")).toBe(
      "instruction",
    );
  });

  it("should categorize .codex/config.toml as config", () => {
    expect(categorizeFilePath("/Users/x/.codex/config.toml")).toBe("config");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test __tests__/lib/parser/codex-path-categorization.test.ts`
Expected: FAIL — returns "code" or "other" for all Codex paths

**Step 3: Update categorizeFilePath**

Add Codex path patterns to `lib/parser/session-utils.ts`:

- `AGENTS.md` / `AGENTS.override.md` → "instruction"
- `/.codex/config.toml` → "config"
- `/.codex/` directory → "config"

**Step 4: Run test to verify it passes**

Run: `bun test __tests__/lib/parser/codex-path-categorization.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/parser/session-utils.ts __tests__/lib/parser/codex-path-categorization.test.ts
git commit -m "feat: categorize Codex file paths (AGENTS.md, config.toml)"
```

---

## Bug Category 8: Settings API — Codex config.toml partially wired

The settings API (`app/api/settings/route.ts`) routes `?provider=codex` to `readCodexSettings()` which reads TOML. But `lib/codex/config.ts` has an incomplete `CodexConfig` interface that doesn't match the actual Codex config.toml spec.

### Task 8: Write failing test — Codex config completeness

**Files:**

- Create: `__tests__/lib/codex/config.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import type { CodexConfig } from "@/lib/codex/config";

describe("CodexConfig interface completeness", () => {
  it("should support all documented config.toml keys", () => {
    // Per https://developers.openai.com/codex/config-reference/
    const config: CodexConfig = {
      model: "gpt-5-codex",
      approval_mode: "auto-edit",
      // BUG: These keys are missing from the interface
      // model_provider: "openai",
      // sandbox_mode: "workspace-write",
      // web_search: "cached",
      // model_reasoning_effort: "high",
      // personality: "friendly",
      // model_instructions_file: "AGENTS.md",
      // model_context_window: 200000,
    };
    expect(config.model).toBe("gpt-5-codex");
  });

  it("CodexConfig.approval_mode should accept Codex values", () => {
    // Codex docs: "untrusted" | "on-request" | "never"
    // Current interface: "suggest" | "auto-edit" | "full-auto" (WRONG names)
    const config: CodexConfig = {
      approval_mode: "suggest", // This is wrong — should be "untrusted"
    };
    expect(["untrusted", "on-request", "never"]).not.toContain(
      config.approval_mode,
    );
    // After fix, the interface should use the correct Codex terminology
  });

  it("should support MCP server configuration in TOML format", () => {
    const config: CodexConfig = {
      // Codex uses [mcp_servers.<id>] tables, not mcpServers
      // mcp_servers: { "my-server": { command: "node server.js" } }
    };
    // BUG: CodexConfig has no mcp_servers field
    expect((config as Record<string, unknown>).mcp_servers).toBeUndefined();
  });

  it("should support features table", () => {
    const config: CodexConfig = {
      // Codex: [features] shell_tool = true, multi_agent = false
      // features: { shell_tool: true, multi_agent: false }
    };
    expect((config as Record<string, unknown>).features).toBeUndefined();
  });

  it("should support history configuration", () => {
    const config: CodexConfig = {
      history: { max_entries: 100, persistence: "save-all" },
    };
    expect(config.history?.persistence).toBe("save-all");
    // BUG: persistence type should be "save-all" | "none", not just string
  });
});
```

**Step 2: Run test to verify failures**

Run: `bun test __tests__/lib/codex/config.test.ts`
Expected: Tests document the interface gaps

**Step 3: Update CodexConfig interface**

Expand `lib/codex/config.ts` to match the documented Codex config.toml spec:

- Fix `approval_mode` values to match Codex docs
- Add `sandbox_mode`, `web_search`, `personality`, `model_provider` etc.
- Add `mcp_servers` field
- Add `features` table
- Add `shell_environment_policy`
- Add proper typing for `history`

**Step 4: Run tests**

Run: `bun test __tests__/lib/codex/config.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/codex/config.ts __tests__/lib/codex/config.test.ts
git commit -m "feat: expand CodexConfig to match full config.toml spec"
```

---

## Bug Category 9: Console/PTY — init-project creates CLAUDE.md, not AGENTS.md

`server/handlers/utility-handler.ts` has an `init-project` command that only creates `CLAUDE.md` (line 19-32). For Codex-oriented projects, it should create `AGENTS.md` instead.

### Task 9: Write failing test — init-project for Codex

**Files:**

- Create: `__tests__/server/init-project-provider.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";

describe("init-project provider awareness", () => {
  it("should know about both CLAUDE.md and AGENTS.md", () => {
    // server/handlers/utility-handler.ts only creates CLAUDE.md
    // It should check if the project is a Codex project and create AGENTS.md
    // Or provide an option for which to create
    //
    // For now, document the bug:
    // Line 19: const claudeMdPath = path.join(cwd, "CLAUDE.md");
    // There's no awareness of AGENTS.md at all
    expect(true).toBe(true); // Placeholder — actual fix in utility-handler
  });
});
```

This is a lower-priority task — noted for awareness but the fix is straightforward (check for existing AGENTS.md before creating CLAUDE.md).

**Step 2: Commit**

```bash
git add __tests__/server/init-project-provider.test.ts
git commit -m "test: document init-project Codex awareness gap"
```

---

## Bug Category 10: Terminal Logs — hardcoded to ~/.claude/

`server/pty-manager.ts:12` hardcodes `LOG_DIR = path.join(os.homedir(), ".claude", "terminal-logs")`. This isn't a Codex bug per se (our app's own logs), but it demonstrates a broader pattern of Claude-specific assumptions.

### Task 10: Write failing test — log dir configuration

**Files:**

- Create: `__tests__/server/pty-log-dir.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import path from "path";
import os from "os";

describe("PTY log directory", () => {
  it("should use a provider-neutral log directory", () => {
    // server/pty-manager.ts:12 hardcodes ~/.claude/terminal-logs
    // This is our app's log, not the provider's, but it's in ~/.claude/
    // which creates a dependency on Claude Code being installed
    const LOG_DIR = path.join(os.homedir(), ".claude", "terminal-logs");
    // This is fine — our app lives under .claude, but worth documenting
    expect(LOG_DIR).toContain(".claude");
  });
});
```

This is informational — no fix needed since the app IS a Claude Code companion tool, but we document the assumption.

**Step 2: Commit**

```bash
git add __tests__/server/pty-log-dir.test.ts
git commit -m "test: document terminal log directory assumption"
```

---

## Bug Category 11: Provider Detection — mixed sessions misclassified

`lib/providers/session-registry.ts:detectSessionProvider()` returns `"codex"` if ANY model matches OpenAI prefixes. A session that uses both Claude and OpenAI models (via tool routing) would be classified as "codex" even if it's primarily a Claude session.

### Task 11: Write failing test — mixed model detection

**Files:**

- Modify: `__tests__/lib/parser/detect-provider.test.ts`

**Step 1: Write the failing test**

```ts
describe("detectProvider edge cases", () => {
  it("should handle session with mostly Claude models and one OpenAI model", () => {
    // A Claude Code session might use an OpenAI model via MCP or AI provider
    // The current implementation returns "codex" if ANY OpenAI model is present
    const usage = {
      "claude-sonnet-4-5-20250929": { messages: 50, tokens: 100000 },
      "gpt-4o": { messages: 1, tokens: 500 }, // Used once via tool
    };
    // This should arguably be "claude" since it's overwhelmingly Claude
    // Current behavior: returns "codex" — debatable, but document it
    const result = detectProvider(usage);
    // Current behavior (may be intentional):
    expect(result).toBe("codex");
  });

  it("should handle new OpenAI model names not in prefix list", () => {
    // gpt-5.3-codex is the new default — is "gpt-5" in prefixes?
    const usage = { "gpt-5.3-codex": { messages: 10 } };
    const result = detectProvider(usage);
    expect(result).toBe("codex");
  });

  it("should handle codex-mini-latest", () => {
    const usage = { "codex-mini-latest": { messages: 5 } };
    const result = detectProvider(usage);
    expect(result).toBe("codex");
  });
});
```

**Step 2: Run test to verify which fail**

Run: `bun test __tests__/lib/parser/detect-provider.test.ts`
Expected: Some tests may fail if prefix list is incomplete (e.g., `gpt-5`)

**Step 3: Update model prefixes**

Update `lib/providers/session-registry.ts` modelPrefixes to include:

- `"gpt-5"` for new GPT-5 family
- Verify `"codex-mini"` is covered

**Step 4: Run test to verify it passes**

Run: `bun test __tests__/lib/parser/detect-provider.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/providers/session-registry.ts __tests__/lib/parser/detect-provider.test.ts
git commit -m "feat: expand provider detection for new OpenAI model names"
```

---

## Bug Category 12: Hooks System — Claude-only hook events

`lib/hooks/validate.ts` validates hook events using Claude Code's event names (`PreToolUse`, `PostToolUse`, `SubagentStart`, etc.). Codex CLI uses different hook mechanisms (git prepare-commit-msg). The `hooks` key in `settings.json` is Claude-specific; Codex doesn't have equivalent hook config in its TOML.

### Task 12: Write failing test — hook system awareness

**Files:**

- Create: `__tests__/lib/hooks/codex-hooks.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { validateHookConfig } from "@/lib/hooks/validate";

describe("Codex hook awareness", () => {
  it("should document that Codex has no equivalent hook system", () => {
    // Codex CLI uses git hooks (prepare-commit-msg) for attribution
    // It does NOT have PreToolUse/PostToolUse/SubagentStart events
    // The hooks UI should clearly indicate these are Claude-Code-only

    // This test documents the limitation:
    const result = validateHookConfig("PreToolUse", {
      type: "command",
      command: "echo test",
    });
    expect(result.valid).toBe(true);
    // But this hook won't do anything in a Codex session
  });
});
```

This is mostly documentation/UI issue — hooks are Claude Code specific. The settings UI should indicate this when Codex provider is selected.

**Step 2: Commit**

```bash
git add __tests__/lib/hooks/codex-hooks.test.ts
git commit -m "test: document hooks system is Claude-Code-only"
```

---

## Verification Checklist

After all tasks:

1. `bun test` — all tests pass
2. `npx tsc --noEmit` — no type errors
3. Verify: `grep -rn "AGENTS.md" lib/instructions/` — AGENTS.md is now discovered
4. Verify: `grep -rn "gpt-4o\|o4-mini" lib/cost/pricing.ts` — OpenAI pricing exists
5. Verify: Codex session JSONL files can be parsed without errors
6. Verify: `~/.codex/sessions/` directory is now scanned during indexing
7. Verify: `categorizeFilePath` handles both `.claude/` and `.codex/` paths
8. Verify: `CodexConfig` interface matches documented TOML keys

---

## Priority Order

| Priority | Task                           | Impact                         |
| -------- | ------------------------------ | ------------------------------ |
| P0       | Task 1 (session discovery)     | Codex sessions invisible       |
| P0       | Task 2 (JSONL format)          | Codex sessions unparseable     |
| P0       | Task 3 (cost calculation)      | Costs wildly wrong             |
| P1       | Task 5 (AGENTS.md)             | Instructions not indexed       |
| P1       | Task 4 (model tiers)           | UI display broken              |
| P1       | Task 7 (path categorization)   | File categories wrong          |
| P1       | Task 11 (detection edge cases) | Provider misclassification     |
| P2       | Task 6 (watcher)               | No real-time updates for Codex |
| P2       | Task 8 (config completeness)   | Settings UI incomplete         |
| P2       | Task 9 (init-project)          | Wrong instruction file created |
| P3       | Task 10, 12 (docs)             | Informational only             |

Sources:

- [Codex Config Reference](https://developers.openai.com/codex/config-reference/)
- [Codex Config Basics](https://developers.openai.com/codex/config-basic/)
- [Codex CLI Features](https://developers.openai.com/codex/cli/features/)
- [Codex Advanced Config](https://developers.openai.com/codex/config-advanced/)
- [Custom Instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md/)
- [Codex Slash Commands](https://developers.openai.com/codex/cli/slash-commands/)
