import fs from "fs";
import path from "path";
import { GEMINI_TMP_DIR } from "./paths";

export interface GeminiSessionEntry {
  sessionName: string;
  projectHash: string;
  filePath: string;
  createdAt: string;
  modifiedAt: string;
  projectPath: string | null;
}

export function getGeminiSessionsBaseDir(): string {
  return GEMINI_TMP_DIR;
}

export function parseGeminiSessionFilename(
  filename: string,
): { sessionName: string } | null {
  const match = filename.match(/^session-(.+)\.json$/);
  return match ? { sessionName: match[1] } : null;
}

export function discoverGeminiSessions(): GeminiSessionEntry[] {
  return discoverGeminiSessionsFrom(GEMINI_TMP_DIR);
}

export function discoverGeminiSessionsFrom(
  baseDir: string,
): GeminiSessionEntry[] {
  if (!fs.existsSync(baseDir)) return [];

  const entries: GeminiSessionEntry[] = [];

  for (const hashDir of safeReadDir(baseDir)) {
    const hashPath = path.join(baseDir, hashDir);
    if (!isDir(hashPath)) continue;
    const projectPath = readProjectPath(hashPath);

    const chatsDir = path.join(hashPath, "chats");
    if (!isDir(chatsDir)) continue;

    for (const file of safeReadDir(chatsDir)) {
      const parsed = parseGeminiSessionFilename(file);
      if (!parsed) continue;

      const filePath = path.join(chatsDir, file);
      try {
        const stat = fs.statSync(filePath);
        entries.push({
          sessionName: parsed.sessionName,
          projectHash: hashDir,
          filePath,
          createdAt: stat.birthtime.toISOString(),
          modifiedAt: stat.mtime.toISOString(),
          projectPath,
        });
      } catch {
        /* skip unreadable */
      }
    }
  }

  return entries;
}

function readProjectPath(hashDir: string): string | null {
  const markerPath = path.join(hashDir, ".project_root");
  try {
    const value = fs.readFileSync(markerPath, "utf-8").trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
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
