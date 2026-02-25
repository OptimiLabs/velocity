import path from "path";
import os from "os";
import { getDb } from "@/lib/db";
import { deriveProjectPath } from "@/lib/parser/indexer";

const GLOBAL_CLAUDE_PATH = path.join(os.homedir(), ".claude", "CLAUDE.md");

export function shortenPath(filePath: string): string {
  const home = os.homedir();
  const normalized = filePath.replace(/\\/g, "/");
  const normalizedHome = home.replace(/\\/g, "/");
  return normalized
    .replace(normalizedHome, "~")
    .replace(/~\/.claude\/knowledge\//, "knowledge/")
    .replace(/~\/.claude\/projects\/[^/]+\//, "project:/");
}

/**
 * Resolve the real filesystem path for a project given its DB id.
 * Projects store an encoded directory name like "-Users-jaelee-side-projects-claude-best".
 */
export function resolveProjectRealPath(
  db: ReturnType<typeof getDb>,
  projectId: string,
): string | null {
  const project = db
    .prepare("SELECT id, path FROM projects WHERE id = ?")
    .get(projectId) as { id: string; path: string } | undefined;

  if (!project) return null;
  const dirName = path.basename(project.path);
  return deriveProjectPath(dirName);
}

/**
 * Check if a CLAUDE.md file should be included for a given project path.
 *
 * Claude Code walks UP from the project root, loading CLAUDE.md from each
 * ancestor directory plus ~/.claude/CLAUDE.md. This function replicates
 * that hierarchy check.
 */
export function isClaudeMdRelevant(
  filePath: string,
  realProjectPath: string,
): boolean {
  // Always include ~/.claude/CLAUDE.md (global)
  if (filePath === GLOBAL_CLAUDE_PATH) return true;

  // Include if the file's directory is an ancestor of (or equal to) the project path
  const fileDir = path.dirname(filePath);
  return (
    realProjectPath.startsWith(fileDir + "/") || realProjectPath === fileDir
  );
}
