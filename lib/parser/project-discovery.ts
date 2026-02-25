import fs from "fs";
import path from "path";
import os from "os";
import type Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// Project path / name derivation
// ---------------------------------------------------------------------------

/**
 * Derive a human-readable project name from a Claude project directory name.
 * e.g. "-Users-jaelee-dm-repos-vision-agent-ui" -> "vision-agent-ui"
 * e.g. "-Users-jaelee-side-projects-claude-best" -> "claude-best"
 */
export function deriveProjectName(dirName: string): string {
  const realPath = deriveProjectPath(dirName);
  return realPath ? path.basename(realPath) : dirName;
}

/**
 * Derive the filesystem project path from a Claude project directory name.
 * e.g. "-Users-jaelee-side-projects-claude-best" -> "/Users/jaelee/side-projects/claude-best"
 *
 * Encoding scheme: Claude encodes project paths by replacing every "/" with "-"
 * in the directory name (with a leading "-" for the root "/"). For example,
 * the project at "/Users/jaelee/my-app" becomes "-Users-jaelee-my-app".
 *
 * Because actual path components can also contain hyphens, decoding is
 * ambiguous. We resolve by walking segment-by-segment: at each hyphen
 * boundary, try "/" (new directory) or "-" (continue current component).
 * We prune "/" branches by checking the parent is a real directory, but
 * always allow "-" branches since they extend the current component.
 *
 * Note: path.join / path.sep are intentionally NOT used here because the
 * encoded directory names always use POSIX-style "/" encoding regardless of
 * platform, and we need to reconstruct the original absolute path literally.
 */
export function deriveProjectPath(dirName: string): string | null {
  const segments = dirName.replace(/^-/, "").split("-");
  if (segments.length === 0) return null;

  function isDir(p: string): boolean {
    try {
      return fs.statSync(p).isDirectory();
    } catch {
      return false;
    }
  }

  const memo = new Map<string, string | null>();

  function resolve(idx: number, current: string): string | null {
    const key = `${idx}:${current}`;
    if (memo.has(key)) return memo.get(key)!;

    let result: string | null = null;

    if (idx >= segments.length) {
      result = isDir(current) ? current : null;
      memo.set(key, result);
      return result;
    }

    const seg = segments[idx];

    // Option 1: treat hyphen as "/" (new path segment) — only if current is a real directory
    if (isDir(current)) {
      result = resolve(idx + 1, current + "/" + seg);
      if (result) {
        memo.set(key, result);
        return result;
      }
    }

    // Option 2: treat hyphen as literal "-" (extend current path component)
    result = resolve(idx + 1, current + "-" + seg);
    memo.set(key, result);
    return result;
  }

  // Start with "/" + first segment to reconstruct the absolute path root
  return resolve(1, "/" + segments[0]);
}

// ---------------------------------------------------------------------------
// Subagent discovery
// ---------------------------------------------------------------------------

/**
 * Discover subagent JSONL files in <project>/<session-id>/subagents/ directories.
 * Returns array of { sessionId, filePath } for each subagent file found.
 */
export function discoverSubagentFiles(
  projectPath: string,
): { sessionId: string; filePath: string }[] {
  const results: { sessionId: string; filePath: string }[] = [];
  try {
    const entries = fs.readdirSync(projectPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const subagentsDir = path.join(projectPath, entry.name, "subagents");
      if (!fs.existsSync(subagentsDir)) continue;
      try {
        const subFiles = fs
          .readdirSync(subagentsDir)
          .filter((f) => f.endsWith(".jsonl"));
        for (const f of subFiles) {
          results.push({
            sessionId: path.basename(f, ".jsonl"),
            filePath: path.join(subagentsDir, f),
          });
        }
      } catch {
        /* skip unreadable dirs */
      }
    }
  } catch {
    /* skip */
  }
  return results;
}

// ---------------------------------------------------------------------------
// Session ↔ instruction file linking
// ---------------------------------------------------------------------------

/**
 * Link a session to the instruction files it used, based on:
 * 1. Directory hierarchy (CLAUDE.md auto-loading)
 * 2. Detected file reads (knowledge / instruction files)
 * 3. Skills -> ~/.claude/commands/{name}.md
 * 4. Agents -> ~/.claude/agents/{type}.md
 */
export function linkSessionInstructionFiles(
  insertSif: Database.Statement,
  lookupInstruction: Database.Statement,
  sessionId: string,
  projectPath: string | null,
  detectedPaths: string[],
): void {
  const homeDir = os.homedir();
  const seen = new Set<string>();

  function insertLink(filePath: string, method: string) {
    if (seen.has(filePath)) return;
    seen.add(filePath);
    const row = lookupInstruction.get(filePath) as { id: string } | undefined;
    if (row) {
      insertSif.run(sessionId, row.id, method);
    }
  }

  // 1. Hierarchy detection: walk from projectPath upward, check for CLAUDE.md
  if (projectPath) {
    let dir = projectPath;
    const root = path.parse(dir).root;
    while (dir && dir !== root) {
      const claudePath = path.join(dir, "CLAUDE.md");
      if (fs.existsSync(claudePath)) {
        insertLink(claudePath, "hierarchy");
      }
      dir = path.dirname(dir);
    }
  }
  // Always include ~/.claude/CLAUDE.md
  const globalClaude = path.join(homeDir, ".claude", "CLAUDE.md");
  if (fs.existsSync(globalClaude)) {
    insertLink(globalClaude, "hierarchy");
  }
  // Also include ~/CLAUDE.md if it exists
  const homeClaude = path.join(homeDir, "CLAUDE.md");
  if (fs.existsSync(homeClaude)) {
    insertLink(homeClaude, "hierarchy");
  }

  // 2-4. Detected paths from aggregator (file_read, skill, agent)
  for (const dp of detectedPaths) {
    // Expand ~ to home directory for matching against instruction_files.file_path
    const resolved = dp.startsWith("~/") ? path.join(homeDir, dp.slice(2)) : dp;
    // Determine method based on path pattern
    let method = "file_read";
    if (resolved.includes("/.claude/commands/")) method = "skill";
    else if (resolved.includes("/.claude/agents/")) method = "agent";
    insertLink(resolved, method);
  }
}
