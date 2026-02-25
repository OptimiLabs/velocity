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

export function getCodexSessionsDir(): string {
  return CODEX_SESSIONS_DIR;
}

export function parseCodexSessionFilename(filename: string): {
  sessionId: string;
  timestamp: string;
  date: string;
} | null {
  // Format:
  // rollout-2025-08-29T14-50-52-019b1f04-bd19-7713-9b37-327c5b7b213d.jsonl
  // Prefix the parsed ID with "codex-" to avoid cross-provider key collisions.
  const match = filename.match(
    /^rollout-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(.+)\.jsonl$/,
  );
  if (!match) return null;
  const [, date, hh, mm, ss, rawId] = match;
  return {
    sessionId: `codex-${rawId}`,
    timestamp: `${date}T${hh}:${mm}:${ss}`,
    date,
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
            /* skip unreadable files */
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
