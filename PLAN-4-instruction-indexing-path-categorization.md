# PLAN-4: Instruction Indexing and Path Categorization

> For Claude: REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

## Objective

Add support for `GEMINI.md` instruction files in the indexer and extend path categorization to recognize Gemini-specific paths. This mirrors the existing Codex support for `AGENTS.md` and `/.codex/` paths.

## Dependencies

- Plan 1 (ConfigProvider type includes "gemini")

## Files to Modify

1. `lib/instructions/indexer.ts` — Add GEMINI.md to global/project patterns, update `classifyFileType`
2. `lib/parser/session-utils.ts` — Add GEMINI.md and `/.gemini/` path categorization

## Files to Create (Tests)

1. `__tests__/lib/instructions/gemini-instructions.test.ts`
2. `__tests__/lib/parser/gemini-path-categorization.test.ts`

---

## Task 1: Write test for instruction indexing patterns

### Test file: `__tests__/lib/instructions/gemini-instructions.test.ts`

```typescript
import { describe, it, expect } from "vitest";

describe("Gemini instruction file discovery", () => {
  it("PROJECT_PATTERNS should include GEMINI.md", () => {
    const { PROJECT_PATTERNS } = require("@/lib/instructions/indexer");
    const hasGeminiMd = PROJECT_PATTERNS.some((p: { pattern: RegExp }) =>
      p.pattern.test("GEMINI.md"),
    );
    expect(hasGeminiMd).toBe(true);
  });

  it("GLOBAL_PATTERNS should scan ~/.gemini/ for GEMINI.md", () => {
    const { GLOBAL_PATTERNS } = require("@/lib/instructions/indexer");
    const hasGeminiDir = GLOBAL_PATTERNS.some((p: { dir: string }) =>
      p.dir.includes(".gemini"),
    );
    expect(hasGeminiDir).toBe(true);
  });

  it("classifyFileType should handle GEMINI.md", () => {
    const { classifyFileType } = require("@/lib/instructions/indexer");
    expect(classifyFileType("/project/GEMINI.md")).toBe("CLAUDE.md");
    // Gemini instruction files use the same type as CLAUDE.md (instruction files)
  });

  it("PROJECT_PATTERNS should include .gemini/ directory scan", () => {
    const { PROJECT_PATTERNS } = require("@/lib/instructions/indexer");
    const hasGeminiSubdir = PROJECT_PATTERNS.some(
      (p: { relativePath: string }) => p.relativePath === ".gemini",
    );
    expect(hasGeminiSubdir).toBe(true);
  });
});
```

**Run**: `bun test __tests__/lib/instructions/gemini-instructions.test.ts` — expect FAIL

---

## Task 2: Write test for path categorization

### Test file: `__tests__/lib/parser/gemini-path-categorization.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { categorizeFilePath } from "@/lib/parser/session-utils";

describe("categorizeFilePath for Gemini paths", () => {
  it("should categorize GEMINI.md as instruction", () => {
    expect(categorizeFilePath("/Users/x/project/GEMINI.md")).toBe(
      "instruction",
    );
  });

  it("should categorize ~/.gemini/GEMINI.md as instruction", () => {
    expect(categorizeFilePath("/Users/x/.gemini/GEMINI.md")).toBe(
      "instruction",
    );
  });

  it("should categorize .gemini/settings.json as config", () => {
    expect(categorizeFilePath("/Users/x/.gemini/settings.json")).toBe("config");
  });

  it("should categorize .gemini/ directory files as config", () => {
    expect(categorizeFilePath("/Users/x/project/.gemini/something.json")).toBe(
      "config",
    );
  });

  // Existing paths should still work
  it("should still categorize CLAUDE.md as instruction", () => {
    expect(categorizeFilePath("/Users/x/project/CLAUDE.md")).toBe(
      "instruction",
    );
  });

  it("should still categorize AGENTS.md as instruction", () => {
    expect(categorizeFilePath("/Users/x/project/AGENTS.md")).toBe(
      "instruction",
    );
  });

  it("should still categorize .codex/ as config", () => {
    expect(categorizeFilePath("/Users/x/.codex/config.toml")).toBe("config");
  });

  it("should still categorize .claude/knowledge/ as knowledge", () => {
    expect(categorizeFilePath("/Users/x/.claude/knowledge/topic.md")).toBe(
      "knowledge",
    );
  });
});
```

**Run**: `bun test __tests__/lib/parser/gemini-path-categorization.test.ts` — expect FAIL (GEMINI.md not recognized)

---

## Task 3: Update instruction indexer

### Modify: `lib/instructions/indexer.ts`

**Step 3a**: Add `GEMINI_DIR` constant after the existing `CODEX_DIR` constant (around line 17):

```typescript
const GEMINI_DIR = path.join(os.homedir(), ".gemini");
```

**Step 3b**: Add Gemini entries to `GLOBAL_PATTERNS` array. Add after the existing Codex entry (after `{ dir: CODEX_DIR, pattern: /^AGENTS\.md$/, fileType: "agents.md" }`):

```typescript
  // Gemini: scan ~/.gemini/ for GEMINI.md
  { dir: GEMINI_DIR, pattern: /^GEMINI\.md$/, fileType: "CLAUDE.md" },
```

**Step 3c**: Add Gemini entries to `PROJECT_PATTERNS` array. Add after the existing Codex entries:

```typescript
  // Gemini instruction files
  { relativePath: ".", pattern: /^GEMINI\.md$/, fileType: "CLAUDE.md" },
  { relativePath: ".gemini", pattern: /\.md$/, fileType: "other.md" },
```

**Step 3d**: Update `classifyFileType` function. Add after the `AGENTS.md` check (after line 79):

```typescript
if (base === "GEMINI.md") return "CLAUDE.md";
```

The full updated `classifyFileType`:

```typescript
export function classifyFileType(filePath: string): string {
  const base = path.basename(filePath);
  if (base === "CLAUDE.md") return "CLAUDE.md";
  if (base === "GEMINI.md") return "CLAUDE.md";
  if (base === "agents.md") return "agents.md";
  if (base === "AGENTS.md" || base === "AGENTS.override.md") return "agents.md";
  // Files in commands/ directories are skills
  if (filePath.includes("/commands/")) return "skill.md";
  // Modern skills: SKILL.md or files under /skills/ directories
  if (base === "SKILL.md") return "skill.md";
  if (filePath.includes("/skills/")) return "skill.md";
  return "other.md";
}
```

---

## Task 4: Update path categorization

### Modify: `lib/parser/session-utils.ts`

**Step 4a**: Add GEMINI.md recognition to `categorizeFilePath`. Add after the AGENTS.md check (after line 17) and before the `.claude/agents/` check:

```typescript
// Gemini instruction file: GEMINI.md (anywhere in path)
if (p.endsWith("/GEMINI.md")) return "instruction";
// Gemini config directory (e.g. .gemini/settings.json)
if (p.includes("/.gemini/")) return "config";
```

The full updated `categorizeFilePath`:

```typescript
export function categorizeFilePath(filePath: string): FileCategory {
  const p = filePath.replace(/\\/g, "/");
  if (p.includes("/.claude/knowledge/")) return "knowledge";
  if (
    p.endsWith("/CLAUDE.md") ||
    (p.includes("/.claude/") && p.endsWith(".md") && p.includes("/projects/"))
  )
    return "instruction";
  // Codex instruction files: AGENTS.md, AGENTS.override.md (anywhere in path)
  if (/\/AGENTS(\.override)?\.md$/.test(p)) return "instruction";
  // Gemini instruction file: GEMINI.md (anywhere in path)
  if (p.endsWith("/GEMINI.md")) return "instruction";
  if (p.includes("/.claude/agents/")) return "agent";
  if (p.includes("/.claude/commands/") || p.includes("/.claude/plans/"))
    return "config";
  // Codex config directory (e.g. .codex/config.toml, .codex/settings.json)
  if (p.includes("/.codex/")) return "config";
  // Gemini config directory (e.g. .gemini/settings.json)
  if (p.includes("/.gemini/")) return "config";
  if (
    /\.(ts|tsx|js|jsx|py|rs|go|java|rb|css|html|json|yaml|yml|toml|md)$/.test(p)
  )
    return "code";
  return "other";
}
```

**IMPORTANT**: The `.gemini/` config check must come AFTER the `GEMINI.md` instruction check. Otherwise, `/.gemini/GEMINI.md` would be categorized as "config" instead of "instruction". Wait — actually `/.gemini/GEMINI.md` contains `/.gemini/` so it would match config first. We need to ensure `GEMINI.md` is checked before the `/.gemini/` catch-all.

Looking at the order above: `p.endsWith("/GEMINI.md")` is checked before `p.includes("/.gemini/")`, so `~/.gemini/GEMINI.md` will correctly be categorized as "instruction" first. This is correct.

---

## Task 5: Run tests — expect PASS

**Run**: `bun test __tests__/lib/instructions/gemini-instructions.test.ts __tests__/lib/parser/gemini-path-categorization.test.ts`

Both test files should pass.

**Also run existing tests** to confirm no regressions:

- `bun test __tests__/lib/instructions/codex-instructions.test.ts`
- `bun test __tests__/lib/parser/codex-path-categorization.test.ts`

---

## Anti-Hallucination Guardrails

1. **`GEMINI.md` is classified as `"CLAUDE.md"` file type** — this is intentional. The `"CLAUDE.md"` file type means "instruction file" in the schema. There is no separate "GEMINI.md" type because instruction files share the same schema/behavior regardless of provider.
2. **Do NOT create a new `InstructionFileType` variant** — reuse `"CLAUDE.md"` for all provider instruction files
3. **The `/.gemini/` config catch-all MUST come AFTER the `GEMINI.md` instruction check** in `categorizeFilePath` — otherwise `~/.gemini/GEMINI.md` would be misclassified
4. **Do NOT modify `lib/parser/session-aggregator.ts`** — path categorization is delegated to `session-utils.ts`
5. **The regex for `GEMINI.md` uses exact match** (`/^GEMINI\.md$/`) not a loose pattern

## Acceptance Criteria

- [ ] `GLOBAL_PATTERNS` includes an entry scanning `~/.gemini/` for `GEMINI.md`
- [ ] `PROJECT_PATTERNS` includes entries for `GEMINI.md` and `.gemini/` directory
- [ ] `classifyFileType("/project/GEMINI.md")` returns `"CLAUDE.md"`
- [ ] `categorizeFilePath("/Users/x/project/GEMINI.md")` returns `"instruction"`
- [ ] `categorizeFilePath("/Users/x/.gemini/settings.json")` returns `"config"`
- [ ] `categorizeFilePath("/Users/x/.gemini/GEMINI.md")` returns `"instruction"` (not "config")
- [ ] Existing Claude/Codex categorization tests still pass
- [ ] All tests pass
