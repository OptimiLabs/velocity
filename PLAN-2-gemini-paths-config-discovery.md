# PLAN-2: Gemini Paths, Config, and Session Discovery

> For Claude: REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

## Objective

Create the `lib/gemini/` module with path constants, config interface/read-write, and session discovery. This mirrors the `lib/codex/` module structure exactly.

## Dependencies

- Plan 1 (ConfigProvider type includes "gemini")

## Files to Create

1. `lib/gemini/paths.ts` — Path constants for Gemini CLI directories
2. `lib/gemini/config.ts` — GeminiConfig interface and JSON read/write
3. `lib/gemini/session-discovery.ts` — Discover session files from `~/.gemini/tmp/`

## Files to Create (Tests)

1. `__tests__/lib/gemini/paths.test.ts`
2. `__tests__/lib/gemini/config.test.ts`
3. `__tests__/lib/gemini/session-discovery.test.ts`

---

## Task 1: Write test for paths

### Test file: `__tests__/lib/gemini/paths.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import path from "path";
import os from "os";
import {
  GEMINI_HOME,
  GEMINI_CONFIG,
  GEMINI_TMP_DIR,
  projectGeminiDir,
  projectGeminiConfig,
} from "@/lib/gemini/paths";

describe("Gemini path constants", () => {
  it("GEMINI_HOME points to ~/.gemini", () => {
    expect(GEMINI_HOME).toBe(path.join(os.homedir(), ".gemini"));
  });

  it("GEMINI_CONFIG points to ~/.gemini/settings.json", () => {
    expect(GEMINI_CONFIG).toBe(
      path.join(os.homedir(), ".gemini", "settings.json"),
    );
  });

  it("GEMINI_TMP_DIR points to ~/.gemini/tmp", () => {
    expect(GEMINI_TMP_DIR).toBe(path.join(os.homedir(), ".gemini", "tmp"));
  });

  it("projectGeminiDir returns .gemini subdir of project", () => {
    expect(projectGeminiDir("/Users/x/my-project")).toBe(
      "/Users/x/my-project/.gemini",
    );
  });

  it("projectGeminiConfig returns .gemini/settings.json of project", () => {
    expect(projectGeminiConfig("/Users/x/my-project")).toBe(
      "/Users/x/my-project/.gemini/settings.json",
    );
  });
});
```

**Run**: `bun test __tests__/lib/gemini/paths.test.ts` — expect FAIL (module doesn't exist)

---

## Task 2: Implement paths module

### Create: `lib/gemini/paths.ts`

```typescript
import path from "path";
import os from "os";

export const GEMINI_HOME = path.join(os.homedir(), ".gemini");
export const GEMINI_CONFIG = path.join(GEMINI_HOME, "settings.json");
export const GEMINI_TMP_DIR = path.join(GEMINI_HOME, "tmp");

export function projectGeminiDir(projectPath: string): string {
  return path.join(projectPath, ".gemini");
}

export function projectGeminiConfig(projectPath: string): string {
  return path.join(projectPath, ".gemini", "settings.json");
}
```

**Run**: `bun test __tests__/lib/gemini/paths.test.ts` — expect PASS

---

## Task 3: Write test for config

### Test file: `__tests__/lib/gemini/config.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { GeminiConfig } from "@/lib/gemini/config";

describe("readGeminiConfigFrom", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gemini-cfg-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads model and theme from settings.json", async () => {
    const configPath = join(dir, "settings.json");
    writeFileSync(
      configPath,
      JSON.stringify({ selectedAuthType: "oauth", theme: "dark" }),
    );
    const { readGeminiConfigFrom } = await import("@/lib/gemini/config");
    const cfg = readGeminiConfigFrom(configPath);
    expect(cfg.selectedAuthType).toBe("oauth");
    expect(cfg.theme).toBe("dark");
  });

  it("returns empty config for missing file", async () => {
    const { readGeminiConfigFrom } = await import("@/lib/gemini/config");
    const cfg = readGeminiConfigFrom(join(dir, "missing.json"));
    expect(cfg).toEqual({});
  });

  it("returns empty config for malformed JSON", async () => {
    const configPath = join(dir, "settings.json");
    writeFileSync(configPath, "not valid json{{{");
    const { readGeminiConfigFrom } = await import("@/lib/gemini/config");
    const cfg = readGeminiConfigFrom(configPath);
    expect(cfg).toEqual({});
  });
});

describe("writeGeminiConfigTo", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gemini-cfg-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips config through JSON", async () => {
    const configPath = join(dir, "settings.json");
    const { writeGeminiConfigTo, readGeminiConfigFrom } =
      await import("@/lib/gemini/config");
    writeGeminiConfigTo(configPath, {
      selectedAuthType: "api-key",
      theme: "light",
    });
    const cfg = readGeminiConfigFrom(configPath);
    expect(cfg.selectedAuthType).toBe("api-key");
    expect(cfg.theme).toBe("light");
  });
});

describe("GeminiConfig interface completeness", () => {
  it("should support known Gemini settings keys", () => {
    const config: GeminiConfig = {
      selectedAuthType: "oauth",
      theme: "dark",
      selectedModel: "gemini-2.5-pro",
    };
    expect(config.selectedAuthType).toBe("oauth");
    expect(config.selectedModel).toBe("gemini-2.5-pro");
  });
});
```

**Run**: `bun test __tests__/lib/gemini/config.test.ts` — expect FAIL

---

## Task 4: Implement config module

### Create: `lib/gemini/config.ts`

```typescript
import fs from "fs";
import { GEMINI_CONFIG } from "./paths";

export interface GeminiConfig {
  selectedAuthType?: "oauth" | "api-key" | "service-account";
  theme?: "dark" | "light" | "system";
  selectedModel?: string;
  customInstructions?: string;
  [key: string]: unknown;
}

function readJson<T>(filePath: string): T {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return {} as T;
  }
}

function writeJson<T>(filePath: string, data: T): void {
  const dir = filePath.substring(0, filePath.lastIndexOf("/"));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export function readGeminiConfig(): GeminiConfig {
  return readJson<GeminiConfig>(GEMINI_CONFIG);
}

export function readGeminiConfigFrom(filePath: string): GeminiConfig {
  return readJson<GeminiConfig>(filePath);
}

export function writeGeminiConfig(data: GeminiConfig): void {
  writeJson(GEMINI_CONFIG, data);
}

export function writeGeminiConfigTo(
  filePath: string,
  data: GeminiConfig,
): void {
  writeJson(filePath, data);
}
```

**Run**: `bun test __tests__/lib/gemini/config.test.ts` — expect PASS

---

## Task 5: Write test for session discovery

### Test file: `__tests__/lib/gemini/session-discovery.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import path from "path";
import os from "os";

// We test the helper functions directly; discoverGeminiSessions depends on ~/.gemini/tmp
import {
  parseGeminiSessionFilename,
  getGeminiSessionsBaseDir,
} from "@/lib/gemini/session-discovery";

describe("parseGeminiSessionFilename", () => {
  it("parses a valid session-<name>.json filename", () => {
    const result = parseGeminiSessionFilename("session-my-chat.json");
    expect(result).toEqual({ sessionName: "my-chat" });
  });

  it("parses session-default.json", () => {
    const result = parseGeminiSessionFilename("session-default.json");
    expect(result).toEqual({ sessionName: "default" });
  });

  it("parses session with numeric suffix", () => {
    const result = parseGeminiSessionFilename("session-test-123.json");
    expect(result).toEqual({ sessionName: "test-123" });
  });

  it("returns null for non-session filenames", () => {
    expect(parseGeminiSessionFilename("chat.json")).toBeNull();
    expect(parseGeminiSessionFilename("random-file.json")).toBeNull();
  });

  it("returns null for non-json files", () => {
    expect(parseGeminiSessionFilename("session-foo.jsonl")).toBeNull();
    expect(parseGeminiSessionFilename("session-foo.txt")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseGeminiSessionFilename("")).toBeNull();
  });
});

describe("getGeminiSessionsBaseDir", () => {
  it("returns the expected path under ~/.gemini/tmp", () => {
    const expected = path.join(os.homedir(), ".gemini", "tmp");
    expect(getGeminiSessionsBaseDir()).toBe(expected);
  });
});

describe("discoverGeminiSessions", () => {
  it("returns empty array when tmp dir does not exist", async () => {
    const { discoverGeminiSessions } =
      await import("@/lib/gemini/session-discovery");
    // On CI or machines without Gemini CLI, the dir won't exist
    const result = discoverGeminiSessions();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("discoverGeminiSessionsFrom (custom base)", () => {
  let tmpBase: string;

  beforeEach(() => {
    tmpBase = mkdtempSync(join(tmpdir(), "gemini-sess-"));
  });
  afterEach(() => {
    rmSync(tmpBase, { recursive: true, force: true });
  });

  it("discovers session files nested under project hash dirs", async () => {
    // Create: <tmpBase>/<hash>/chats/session-default.json
    const hashDir = join(tmpBase, "abc123hash");
    const chatsDir = join(hashDir, "chats");
    mkdirSync(chatsDir, { recursive: true });
    writeFileSync(
      join(chatsDir, "session-default.json"),
      JSON.stringify([{ role: "user", parts: [{ text: "hello" }] }]),
    );

    const { discoverGeminiSessionsFrom } =
      await import("@/lib/gemini/session-discovery");
    const results = discoverGeminiSessionsFrom(tmpBase);
    expect(results).toHaveLength(1);
    expect(results[0].sessionName).toBe("default");
    expect(results[0].projectHash).toBe("abc123hash");
    expect(results[0].filePath).toContain("session-default.json");
  });

  it("discovers multiple sessions across multiple project hashes", async () => {
    for (const hash of ["hash1", "hash2"]) {
      const chatsDir = join(tmpBase, hash, "chats");
      mkdirSync(chatsDir, { recursive: true });
      writeFileSync(join(chatsDir, "session-default.json"), JSON.stringify([]));
    }
    // hash2 also has a second session
    writeFileSync(
      join(tmpBase, "hash2", "chats", "session-refactor.json"),
      JSON.stringify([]),
    );

    const { discoverGeminiSessionsFrom } =
      await import("@/lib/gemini/session-discovery");
    const results = discoverGeminiSessionsFrom(tmpBase);
    expect(results).toHaveLength(3);
  });

  it("skips non-session files", async () => {
    const chatsDir = join(tmpBase, "somehash", "chats");
    mkdirSync(chatsDir, { recursive: true });
    writeFileSync(join(chatsDir, "session-valid.json"), "[]");
    writeFileSync(join(chatsDir, "other-file.json"), "[]");
    writeFileSync(join(chatsDir, "session-also-valid.json"), "[]");

    const { discoverGeminiSessionsFrom } =
      await import("@/lib/gemini/session-discovery");
    const results = discoverGeminiSessionsFrom(tmpBase);
    expect(results).toHaveLength(2);
    const names = results.map((r: { sessionName: string }) => r.sessionName);
    expect(names).toContain("valid");
    expect(names).toContain("also-valid");
  });

  it("returns empty array when base dir is empty", async () => {
    const { discoverGeminiSessionsFrom } =
      await import("@/lib/gemini/session-discovery");
    const results = discoverGeminiSessionsFrom(tmpBase);
    expect(results).toEqual([]);
  });
});
```

**Run**: `bun test __tests__/lib/gemini/session-discovery.test.ts` — expect FAIL

---

## Task 6: Implement session discovery module

### Create: `lib/gemini/session-discovery.ts`

```typescript
import fs from "fs";
import path from "path";
import { GEMINI_TMP_DIR } from "./paths";

export interface GeminiSessionEntry {
  sessionName: string;
  projectHash: string;
  filePath: string;
  createdAt: string;
  modifiedAt: string;
}

export function getGeminiSessionsBaseDir(): string {
  return GEMINI_TMP_DIR;
}

export function parseGeminiSessionFilename(
  filename: string,
): { sessionName: string } | null {
  const match = filename.match(/^session-(.+)\.json$/);
  if (!match) return null;
  return { sessionName: match[1] };
}

export function discoverGeminiSessions(): GeminiSessionEntry[] {
  return discoverGeminiSessionsFrom(GEMINI_TMP_DIR);
}

export function discoverGeminiSessionsFrom(
  baseDir: string,
): GeminiSessionEntry[] {
  if (!fs.existsSync(baseDir)) return [];

  const entries: GeminiSessionEntry[] = [];

  // Walk <baseDir>/<project_hash>/chats/session-<name>.json
  for (const hashDirName of safeReadDir(baseDir)) {
    const hashDir = path.join(baseDir, hashDirName);
    if (!isDir(hashDir)) continue;

    const chatsDir = path.join(hashDir, "chats");
    if (!isDir(chatsDir)) continue;

    for (const file of safeReadDir(chatsDir)) {
      const parsed = parseGeminiSessionFilename(file);
      if (!parsed) continue;

      const filePath = path.join(chatsDir, file);
      try {
        const stat = fs.statSync(filePath);
        entries.push({
          sessionName: parsed.sessionName,
          projectHash: hashDirName,
          filePath,
          createdAt: stat.birthtime.toISOString(),
          modifiedAt: stat.mtime.toISOString(),
        });
      } catch {
        /* skip unreadable files */
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

**Run**: `bun test __tests__/lib/gemini/session-discovery.test.ts` — expect PASS

---

## Task 7: Run all Plan 2 tests together

**Run**: `bun test __tests__/lib/gemini/`

All 3 test files should pass.

---

## Anti-Hallucination Guardrails

1. **Gemini uses JSON, not TOML** — `readJson`/`writeJson`, not `readToml`/`writeToml`
2. **Config file is `settings.json`**, not `config.json` or `config.toml`
3. **Session directory structure is `~/.gemini/tmp/<hash>/chats/session-<name>.json`** — NOT `~/.gemini/sessions/`
4. **The project hash is the directory name** — we do NOT compute SHA-256 in this plan (that can come later for project mapping)
5. **`discoverGeminiSessionsFrom` is exposed for testing** — mirrors the pattern of making the base dir injectable
6. **Do NOT import or depend on the TOML module** — Gemini uses plain JSON

## Acceptance Criteria

- [ ] `GEMINI_HOME`, `GEMINI_CONFIG`, `GEMINI_TMP_DIR` resolve to correct `~/.gemini/` paths
- [ ] `projectGeminiDir` and `projectGeminiConfig` return correct `.gemini/` paths
- [ ] `readGeminiConfigFrom` reads JSON and handles missing/malformed files gracefully
- [ ] `writeGeminiConfigTo` writes valid JSON that round-trips correctly
- [ ] `parseGeminiSessionFilename` correctly parses `session-<name>.json` format
- [ ] `discoverGeminiSessionsFrom` finds sessions nested under `<hash>/chats/`
- [ ] Empty/missing directories return empty arrays, not errors
- [ ] All tests pass with `bun test __tests__/lib/gemini/`
