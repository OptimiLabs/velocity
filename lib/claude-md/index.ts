import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { createRequire } from "module";
import type { PromptSnippet } from "@/types/library";

const PROMPT_LIBRARY_DIR = path.join(os.homedir(), ".claude", "prompt-library");
const requireFromHere = createRequire(import.meta.url);

export interface PromptFileFrontmatter {
  name: string;
  category: PromptSnippet["category"];
  tags: string[];
}

export interface PromptFile {
  filename: string;
  frontmatter: PromptFileFrontmatter;
  content: string;
  fullPath: string;
}

/**
 * Ensure the prompt library directory exists and is a git repo.
 */
export function ensurePromptLibrary(): void {
  if (!fs.existsSync(PROMPT_LIBRARY_DIR)) {
    fs.mkdirSync(PROMPT_LIBRARY_DIR, { recursive: true });
  }
  const gitDir = path.join(PROMPT_LIBRARY_DIR, ".git");
  if (!fs.existsSync(gitDir)) {
    try {
      execSync("git init", { cwd: PROMPT_LIBRARY_DIR, stdio: "pipe" });
    } catch {
      // Git might not be available; non-fatal
    }
  }
}

/**
 * List all .md files in the prompt library, parsing frontmatter.
 */
export function listPromptFiles(): PromptFile[] {
  ensurePromptLibrary();
  const files = fs
    .readdirSync(PROMPT_LIBRARY_DIR)
    .filter((f) => f.endsWith(".md"));
  return files.map((filename) => {
    const fullPath = path.join(PROMPT_LIBRARY_DIR, filename);
    const raw = fs.readFileSync(fullPath, "utf-8");
    const { frontmatter, content } = parseFrontmatter(raw);
    return { filename, frontmatter, content, fullPath };
  });
}

/**
 * Read a single prompt file.
 */
export function readPromptFile(filename: string): PromptFile | null {
  const fullPath = path.join(PROMPT_LIBRARY_DIR, filename);
  if (!fs.existsSync(fullPath)) return null;
  const raw = fs.readFileSync(fullPath, "utf-8");
  const { frontmatter, content } = parseFrontmatter(raw);
  return { filename, frontmatter, content, fullPath };
}

/**
 * Write a prompt file with frontmatter.
 */
export function writePromptFile(
  filename: string,
  content: string,
  frontmatter: PromptFileFrontmatter,
): PromptFile {
  ensurePromptLibrary();
  const fullPath = path.join(PROMPT_LIBRARY_DIR, filename);
  const raw = serializeFrontmatter(frontmatter) + content;
  fs.writeFileSync(fullPath, raw, "utf-8");
  return { filename, frontmatter, content, fullPath };
}

/**
 * Delete a prompt file.
 */
export function deletePromptFile(filename: string): boolean {
  const fullPath = path.join(PROMPT_LIBRARY_DIR, filename);
  if (!fs.existsSync(fullPath)) return false;
  fs.unlinkSync(fullPath);
  return true;
}

/**
 * Commit all changes in the prompt library.
 */
export function commitChanges(message: string): boolean {
  try {
    execSync("git add -A", { cwd: PROMPT_LIBRARY_DIR, stdio: "pipe" });
    execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
      cwd: PROMPT_LIBRARY_DIR,
      stdio: "pipe",
    });
    return true;
  } catch {
    // Nothing to commit or git not available
    return false;
  }
}

/**
 * Sync filesystem prompt files to the prompt_snippets SQLite table.
 * Filesystem is source of truth.
 */
export function syncToDb(): { synced: number; removed: number } {
  // Dynamic import to avoid circular deps at module level
  const {
    listPromptSnippets,
    createPromptSnippet,
    updatePromptSnippet,
    deletePromptSnippet,
  } = requireFromHere("@/lib/db/prompt-snippets") as typeof import("@/lib/db/prompt-snippets");

  const files = listPromptFiles();
  const existingSnippets: PromptSnippet[] = listPromptSnippets();
  const existingByName = new Map(existingSnippets.map((s) => [s.name, s]));

  let synced = 0;
  let removed = 0;
  const fileNames = new Set(files.map((f) => f.frontmatter.name));

  // Upsert from filesystem
  for (const file of files) {
    const existing = existingByName.get(file.frontmatter.name);
    if (existing) {
      updatePromptSnippet(existing.id, {
        name: file.frontmatter.name,
        content: file.content,
        category: file.frontmatter.category,
        tags: file.frontmatter.tags,
      });
    } else {
      createPromptSnippet({
        name: file.frontmatter.name,
        content: file.content,
        category: file.frontmatter.category,
        tags: file.frontmatter.tags,
      });
    }
    synced++;
  }

  // Remove DB entries whose files no longer exist
  for (const snippet of existingSnippets) {
    if (!fileNames.has(snippet.name)) {
      deletePromptSnippet(snippet.id);
      removed++;
    }
  }

  return { synced, removed };
}

/**
 * Get the prompt library directory path.
 */
export function getPromptLibraryDir(): string {
  return PROMPT_LIBRARY_DIR;
}

// --- Frontmatter parsing ---

function parseFrontmatter(raw: string): {
  frontmatter: PromptFileFrontmatter;
  content: string;
} {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return {
      frontmatter: { name: "Untitled", category: "general", tags: [] },
      content: raw,
    };
  }

  const yamlBlock = match[1];
  const content = match[2].trim();

  // Simple YAML parser for flat key-value pairs
  const fm: Record<string, string | string[]> = {};
  for (const line of yamlBlock.split("\n")) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) {
      const [, key, value] = kv;
      if (value.startsWith("[") && value.endsWith("]")) {
        fm[key] = value
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
      } else {
        fm[key] = value.replace(/^["']|["']$/g, "");
      }
    }
  }

  return {
    frontmatter: {
      name: (fm.name as string) || "Untitled",
      category: (fm.category as PromptSnippet["category"]) || "general",
      tags: Array.isArray(fm.tags) ? fm.tags : [],
    },
    content,
  };
}

function serializeFrontmatter(fm: PromptFileFrontmatter): string {
  const lines = [
    "---",
    `name: "${fm.name}"`,
    `category: "${fm.category}"`,
    `tags: [${fm.tags.map((t) => `"${t}"`).join(", ")}]`,
    "---",
    "",
  ];
  return lines.join("\n");
}
