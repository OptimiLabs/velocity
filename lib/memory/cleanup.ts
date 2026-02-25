import fs from "fs";
import path from "path";
import { readSettings } from "../claude-settings";

const DEFAULTS = { maxAgeDays: 3, maxFiles: 5 };

function getMemoryLimits() {
  try {
    const s = readSettings();
    return {
      maxAgeDays: s.memoryMaxAgeDays ?? DEFAULTS.maxAgeDays,
      maxFiles: s.memoryMaxFiles ?? DEFAULTS.maxFiles,
    };
  } catch {
    return DEFAULTS;
  }
}

/**
 * Cleans up old .claude/memory/*.md files.
 * - Deletes files older than `memoryMaxAgeDays` (from settings, default 3)
 * - Keeps at most `memoryMaxFiles` files (from settings, default 5)
 * - Skips the file matching `currentFilename` (just written)
 */
export function cleanupMemoryFiles(
  projectPath: string,
  currentFilename?: string,
): void {
  const { maxAgeDays, maxFiles } = getMemoryLimits();
  const memoryDir = path.join(projectPath, ".claude", "memory");

  let entries: string[];
  try {
    entries = fs.readdirSync(memoryDir).filter((f) => f.endsWith(".md"));
  } catch {
    return; // directory doesn't exist yet
  }

  const now = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  // Parse dates from filenames (YYYY-MM-DD-...) and sort by date
  const files = entries
    .map((name) => {
      const dateMatch = name.match(/^(\d{4}-\d{2}-\d{2})/);
      const date = dateMatch ? new Date(dateMatch[1]).getTime() : 0;
      return { name, date, path: path.join(memoryDir, name) };
    })
    .sort((a, b) => b.date - a.date); // newest first

  // Delete files older than maxAgeDays
  for (const file of files) {
    if (file.name === currentFilename) continue;
    if (now - file.date > maxAgeMs) {
      try {
        fs.unlinkSync(file.path);
      } catch {
        /* ignore */
      }
    }
  }

  // Re-read remaining files and enforce cap
  let remaining: string[];
  try {
    remaining = fs.readdirSync(memoryDir).filter((f) => f.endsWith(".md"));
  } catch {
    return;
  }

  if (remaining.length > maxFiles) {
    const sorted = remaining
      .map((name) => {
        const dateMatch = name.match(/^(\d{4}-\d{2}-\d{2})/);
        const date = dateMatch ? new Date(dateMatch[1]).getTime() : 0;
        return { name, date, path: path.join(memoryDir, name) };
      })
      .sort((a, b) => b.date - a.date); // newest first

    // Delete oldest files beyond the cap
    for (const file of sorted.slice(maxFiles)) {
      if (file.name === currentFilename) continue;
      try {
        fs.unlinkSync(file.path);
      } catch {
        /* ignore */
      }
    }
  }
}
