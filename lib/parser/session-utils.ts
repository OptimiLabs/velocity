import type { FileCategory, FileWriteEntry } from "@/types/session";

/**
 * Client-safe utilities extracted from session-aggregator.
 * These have no Node.js (fs) dependencies and can be imported in client components.
 */

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
  if (p.includes("/.claude/agents/")) return "agent";
  if (p.includes("/.claude/commands/") || p.includes("/.claude/plans/"))
    return "config";
  // Codex config directory (e.g. .codex/config.toml, .codex/settings.json)
  if (p.includes("/.codex/")) return "config";
  // Gemini instruction file: GEMINI.md (must come before /.gemini/ config catch-all)
  if (p.endsWith("/GEMINI.md")) return "instruction";
  // Gemini config directory (e.g. .gemini/settings.json)
  if (p.includes("/.gemini/")) return "config";
  if (
    /\.(ts|tsx|js|jsx|py|rs|go|java|rb|css|html|json|yaml|yml|toml|md)$/.test(p)
  )
    return "code";
  return "other";
}

/**
 * Normalize filesModified from either the old string[] format (existing sessions)
 * or the new FileWriteEntry[] format (new sessions) into FileWriteEntry[].
 */
export function normalizeFilesModified(
  raw: string[] | FileWriteEntry[],
): FileWriteEntry[] {
  if (!raw || raw.length === 0) return [];
  // Check if every element is a string (old format) or treat mixed arrays as strings
  const allStrings = raw.every((item) => typeof item === "string");
  if (allStrings) {
    return (raw as string[]).map((path) => ({
      path,
      count: 1,
      category: categorizeFilePath(path),
    }));
  }
  // Validate that all elements look like FileWriteEntry objects
  const allObjects = raw.every(
    (item) => typeof item === "object" && item !== null && "path" in item,
  );
  if (allObjects) {
    return raw as FileWriteEntry[];
  }
  // Mixed array fallback: coerce each element to string
  return raw.map((item) => {
    const path = typeof item === "string" ? item : String((item as FileWriteEntry).path ?? item);
    return { path, count: 1, category: categorizeFilePath(path) };
  });
}
