import fs from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";
import { getDb } from "@/lib/db/index";
import { deriveProjectPath } from "@/lib/parser/indexer";
import { indexerLog } from "@/lib/logger";
import {
  CODEX_HOME,
  CODEX_INSTRUCTIONS_DIR,
  CODEX_LEGACY_SKILLS_DIR,
  CODEX_SKILLS_DIR,
} from "@/lib/codex/paths";
import {
  readGeminiConfigFrom,
  resolveGeminiContextFileName,
} from "@/lib/gemini/config";
import {
  GEMINI_CONFIG,
  getGeminiAgentDirs,
  getGeminiSkillDirs,
  projectGeminiConfig,
} from "@/lib/gemini/paths";

export interface ScanResult {
  added: number;
  updated: number;
  removed: number;
  total: number;
}

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const GEMINI_DIR = path.join(os.homedir(), ".gemini");
const KNOWLEDGE_DIR = path.join(os.homedir(), ".claude", "knowledge");

export const GLOBAL_PATTERNS: { dir: string; pattern: RegExp; fileType: string }[] = [
  { dir: CLAUDE_DIR, pattern: /^CLAUDE\.md$/, fileType: "CLAUDE.md" },
  { dir: os.homedir(), pattern: /^CLAUDE\.md$/, fileType: "CLAUDE.md" },
  {
    dir: path.join(CLAUDE_DIR, "agents"),
    pattern: /\.md$/,
    fileType: "agents.md",
  },
  {
    dir: path.join(CLAUDE_DIR, "commands"),
    pattern: /\.md$/,
    fileType: "skill.md",
  },
  {
    dir: path.join(CLAUDE_DIR, "swarm-roles"),
    pattern: /\.md$/,
    fileType: "other.md",
  },
  // Codex: scan ~/.codex/ for AGENTS.md and skill entries.
  { dir: CODEX_HOME, pattern: /^AGENTS\.md$/, fileType: "agents.md" },
  { dir: CODEX_SKILLS_DIR, pattern: /\.md(\.disabled)?$/, fileType: "skill.md" },
  {
    dir: CODEX_LEGACY_SKILLS_DIR,
    pattern: /\.md(\.disabled)?$/,
    fileType: "skill.md",
  },
  {
    dir: CODEX_INSTRUCTIONS_DIR,
    pattern: /\.md(\.disabled)?$/,
    fileType: "skill.md",
  },
  // Gemini: scan ~/.gemini/ for GEMINI.md
  { dir: GEMINI_DIR, pattern: /^GEMINI\.md$/, fileType: "CLAUDE.md" },
];

export const PROJECT_PATTERNS: {
  relativePath: string;
  pattern: RegExp;
  fileType: string;
}[] = [
  { relativePath: ".", pattern: /^CLAUDE\.md$/, fileType: "CLAUDE.md" },
  { relativePath: ".", pattern: /^agents\.md$/, fileType: "agents.md" },
  // Codex instruction files
  { relativePath: ".", pattern: /^AGENTS\.md$/, fileType: "agents.md" },
  { relativePath: ".", pattern: /^AGENTS\.override\.md$/, fileType: "agents.md" },
  { relativePath: ".codex/skills", pattern: /\.md(\.disabled)?$/, fileType: "skill.md" },
  { relativePath: ".agents/skills", pattern: /\.md(\.disabled)?$/, fileType: "skill.md" },
  { relativePath: ".codex/instructions", pattern: /\.md(\.disabled)?$/, fileType: "skill.md" },
  // Gemini instruction files
  { relativePath: ".", pattern: /^GEMINI\.md$/, fileType: "CLAUDE.md" },
  { relativePath: ".gemini", pattern: /\.md$/, fileType: "other.md" },
  { relativePath: ".claude", pattern: /\.md$/, fileType: "other.md" },
  { relativePath: ".claude/commands", pattern: /\.md$/, fileType: "skill.md" },
  // .claude.local scope (user-local, gitignored)
  { relativePath: ".claude.local", pattern: /\.md$/, fileType: "other.md" },
  {
    relativePath: ".claude.local/commands",
    pattern: /\.md$/,
    fileType: "skill.md",
  },
];

function generateId(): string {
  return `if_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function computeHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

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
  if (filePath.includes("/.codex/instructions/")) return "skill.md";
  return "other.md";
}

function extractTitle(content: string, fallbackSlug: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match
    ? match[1].trim()
    : fallbackSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function indexKnowledgeFile(
  filePath: string,
  category: string,
  fileName: string,
): boolean {
  if (!fs.existsSync(filePath)) return false;

  const stat = fs.statSync(filePath);
  const mtime = stat.mtime.toISOString();
  const slug = fileName.replace(/\.md$/, "");

  const db = getDb();

  const existing = db
    .prepare(
      "SELECT id, file_mtime, content_hash FROM instruction_files WHERE file_path = ?",
    )
    .get(filePath) as
    | { id: string; file_mtime: string | null; content_hash: string | null }
    | undefined;

  if (existing) {
    if (existing.file_mtime === mtime) return false;

    const content = fs.readFileSync(filePath, "utf-8");
    const hash = computeHash(content);
    if (existing.content_hash === hash) {
      db.prepare(
        "UPDATE instruction_files SET file_mtime = ?, last_indexed_at = ? WHERE id = ?",
      ).run(mtime, new Date().toISOString(), existing.id);
      return false;
    }

    const now = new Date().toISOString();
    const title = extractTitle(content, slug);
    db.prepare(
      `
      UPDATE instruction_files
      SET content = ?, content_hash = ?, token_count = ?, char_count = ?,
          file_mtime = ?, last_indexed_at = ?, updated_at = ?, title = ?,
          category = ?, slug = ?
      WHERE id = ?
    `,
    ).run(
      content,
      hash,
      estimateTokens(content),
      content.length,
      mtime,
      now,
      now,
      title,
      category,
      slug,
      existing.id,
    );
    return true;
  }

  // New file
  const content = fs.readFileSync(filePath, "utf-8");
  const hash = computeHash(content);
  const now = new Date().toISOString();
  const id = generateId();
  const title = extractTitle(content, slug);

  db.prepare(
    `
    INSERT INTO instruction_files
      (id, file_path, file_type, project_path, project_id, file_name, content, content_hash,
       token_count, is_editable, last_indexed_at, file_mtime, source, tags,
       category, slug, title, description, char_count, is_active,
       created_at, updated_at)
    VALUES (?, ?, 'knowledge.md', NULL, NULL, ?, ?, ?, ?, 1, ?, ?, 'auto', '[]',
            ?, ?, ?, '', ?, 1, ?, ?)
  `,
  ).run(
    id,
    filePath,
    fileName,
    content,
    hash,
    estimateTokens(content),
    now,
    mtime,
    category,
    slug,
    title,
    content.length,
    now,
    now,
  );
  return true;
}

function scanKnowledge(): number {
  if (!fs.existsSync(KNOWLEDGE_DIR)) return 0;

  let count = 0;
  try {
    const categories = fs
      .readdirSync(KNOWLEDGE_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const category of categories) {
      const catDir = path.join(KNOWLEDGE_DIR, category);
      const files = fs.readdirSync(catDir).filter((f) => f.endsWith(".md"));
      for (const file of files) {
        if (indexKnowledgeFile(path.join(catDir, file), category, file)) {
          count++;
        }
      }
    }
  } catch (err) {
    indexerLog.debug("directory not readable", err, { path: KNOWLEDGE_DIR });
  }
  return count;
}

export function indexFile(
  filePath: string,
  projectPath: string | null,
  projectId: string | null,
  fileType?: string,
  isActive: boolean = true,
): boolean {
  if (!fs.existsSync(filePath)) return false;

  const stat = fs.statSync(filePath);
  const mtime = stat.mtime.toISOString();
  const fileName = path.basename(filePath);
  const resolvedType = fileType || classifyFileType(filePath);

  const db = getDb();

  // Check if already indexed
  const existing = db
    .prepare(
      "SELECT id, file_mtime, content_hash, project_id FROM instruction_files WHERE file_path = ?",
    )
    .get(filePath) as
    | { id: string; file_mtime: string | null; content_hash: string | null; project_id: string | null }
    | undefined;

  if (existing) {
    // Backfill project_id if it was missing but now available
    // Don't upgrade global entries (under ~/.claude/) to project-scoped
    if (projectId && !existing.project_id && !filePath.startsWith(CLAUDE_DIR + "/")) {
      db.prepare(
        "UPDATE instruction_files SET project_id = ?, project_path = ? WHERE id = ?",
      ).run(projectId, projectPath, existing.id);
    }

    // Fast path: mtime unchanged → skip
    if (existing.file_mtime === mtime) return false;

    // Mtime changed → read and check hash
    const content = fs.readFileSync(filePath, "utf-8");
    const hash = computeHash(content);
    if (existing.content_hash === hash) {
      // Content same, just update mtime
      db.prepare(
        "UPDATE instruction_files SET file_mtime = ?, last_indexed_at = ? WHERE id = ?",
      ).run(mtime, new Date().toISOString(), existing.id);
      return false;
    }

    // Content changed — update
    const now = new Date().toISOString();
    db.prepare(
      `
      UPDATE instruction_files
      SET content = ?, content_hash = ?, token_count = ?, file_mtime = ?,
          last_indexed_at = ?, updated_at = ?, project_id = ?, project_path = ?
      WHERE id = ?
    `,
    ).run(
      content,
      hash,
      estimateTokens(content),
      mtime,
      now,
      now,
      projectId,
      projectPath,
      existing.id,
    );
    return true;
  }

  // New file — insert
  const content = fs.readFileSync(filePath, "utf-8");
  const hash = computeHash(content);
  const now = new Date().toISOString();
  const id = generateId();

  // Check write permission
  let isEditable = 1;
  try {
    fs.accessSync(filePath, fs.constants.W_OK);
  } catch (err) {
    indexerLog.debug("access check failed", err, { path: filePath });
    isEditable = 0;
  }

  db.prepare(
    `
    INSERT INTO instruction_files
      (id, file_path, file_type, project_path, project_id, file_name, content, content_hash,
       token_count, is_editable, is_active, last_indexed_at, file_mtime, source, tags, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'auto', '[]', ?, ?)
  `,
  ).run(
    id,
    filePath,
    resolvedType,
    projectPath,
    projectId,
    fileName,
    content,
    hash,
    estimateTokens(content),
    isEditable,
    isActive ? 1 : 0,
    now,
    mtime,
    now,
    now,
  );
  return true;
}

function scanSkillsDirectory(
  baseDir: string,
  projectPath: string | null,
  projectId: string | null,
): number {
  if (!fs.existsSync(baseDir)) return 0;
  let count = 0;

  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      indexerLog.debug("directory not readable", err, { path: dir });
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const entryPath = path.join(dir, entry.name);
      const skillFile = path.join(entryPath, "SKILL.md");
      const disabledSkillFile = path.join(entryPath, "SKILL.md.disabled");
      if (fs.existsSync(skillFile)) {
        try {
          if (fs.statSync(skillFile).isFile()) {
            if (indexFile(skillFile, projectPath, projectId, "skill.md")) {
              count++;
            }
          }
        } catch (err) {
          indexerLog.debug("skill file stat failed", err, { path: skillFile });
        }
      } else if (fs.existsSync(disabledSkillFile)) {
        try {
          if (fs.statSync(disabledSkillFile).isFile()) {
            if (indexFile(disabledSkillFile, projectPath, projectId, "skill.md", false)) {
              count++;
            }
          }
        } catch (err) {
          indexerLog.debug("skill file stat failed", err, { path: disabledSkillFile });
        }
      }
      walk(entryPath); // recurse for nested categories
    }
  }

  walk(baseDir);
  return count;
}

function scanDirectory(
  dirPath: string,
  pattern: RegExp,
  fileType: string,
  projectPath: string | null,
  projectId: string | null,
): number {
  if (!fs.existsSync(dirPath)) return 0;

  let count = 0;
  try {
    const entries = fs.readdirSync(dirPath);
    for (const entry of entries) {
      if (pattern.test(entry)) {
        const fullPath = path.join(dirPath, entry);
        if (fs.statSync(fullPath).isFile()) {
          if (indexFile(fullPath, projectPath, projectId, fileType)) {
            count++;
          }
        }
      }
    }
  } catch (err) {
    indexerLog.debug("directory not readable", err, { path: dirPath });
  }
  return count;
}

function resolveGeminiEntrypointPath(projectPath: string | null): string {
  const settingsPath = projectPath
    ? projectGeminiConfig(projectPath)
    : GEMINI_CONFIG;
  const contextFileName = resolveGeminiContextFileName(
    readGeminiConfigFrom(settingsPath),
  );
  if (path.isAbsolute(contextFileName)) {
    return contextFileName;
  }
  const baseDir = projectPath || GEMINI_DIR;
  return path.resolve(baseDir, contextFileName);
}

function scanGeminiEntrypoint(
  projectPath: string | null,
  projectId: string | null,
): number {
  const entrypointPath = resolveGeminiEntrypointPath(projectPath);
  if (!fs.existsSync(entrypointPath)) return 0;
  try {
    if (!fs.statSync(entrypointPath).isFile()) return 0;
  } catch (err) {
    indexerLog.debug("gemini entrypoint stat failed", err, {
      path: entrypointPath,
    });
    return 0;
  }
  return indexFile(entrypointPath, projectPath, projectId, "CLAUDE.md")
    ? 1
    : 0;
}

function scanGlobal(): number {
  let count = 0;
  for (const { dir, pattern, fileType } of GLOBAL_PATTERNS) {
    count += scanDirectory(dir, pattern, fileType, null, null);
  }
  for (const dir of getGeminiAgentDirs()) {
    count += scanDirectory(dir, /\.md$/, "agents.md", null, null);
  }
  for (const dir of getGeminiSkillDirs()) {
    count += scanSkillsDirectory(dir, null, null);
  }
  // Codex package skills directory (recursive, SKILL.md-based)
  count += scanSkillsDirectory(CODEX_SKILLS_DIR, null, null);
  // Modern skills directory (recursive, handles nested categories)
  count += scanSkillsDirectory(path.join(CLAUDE_DIR, "skills"), null, null);
  count += scanGeminiEntrypoint(null, null);
  return count;
}

function scanProjects(): number {
  const db = getDb();
  // Get unique project paths from sessions table
  const rows = db
    .prepare(
      "SELECT DISTINCT project_path FROM sessions WHERE project_path IS NOT NULL AND project_path != ''",
    )
    .all() as { project_path: string }[];

  // Build a map of real project path → project ID
  // projects.path stores the .claude/projects/ directory (encoded), so we derive
  // the real filesystem path from the directory name to match sessions.project_path
  const projectRows = db.prepare("SELECT id, path FROM projects").all() as {
    id: string;
    path: string;
  }[];

  const projectMap = new Map<string, string>();
  for (const p of projectRows) {
    // p.path is like /Users/x/.claude/projects/-Users-x-my-repo
    // The directory name encodes the real path with dashes
    const dirName = path.basename(p.path);
    const realPath = deriveProjectPath(dirName);
    if (realPath) {
      projectMap.set(realPath, p.id);
    }
  }

  let count = 0;
  const seenPaths = new Set<string>();

  for (const row of rows) {
    const projectPath = row.project_path;
    if (seenPaths.has(projectPath)) continue;
    seenPaths.add(projectPath);

    if (!fs.existsSync(projectPath)) continue;

    const projectId = projectMap.get(projectPath) || null;

    for (const { relativePath, pattern, fileType } of PROJECT_PATTERNS) {
      const dir = path.join(projectPath, relativePath);
      count += scanDirectory(dir, pattern, fileType, projectPath, projectId);
    }
    count += scanGeminiEntrypoint(projectPath, projectId);

    // Modern project skills (recursive, handles nested categories)
    count += scanSkillsDirectory(
      path.join(projectPath, ".codex", "skills"),
      projectPath,
      projectId,
    );
    count += scanSkillsDirectory(
      path.join(projectPath, ".claude", "skills"),
      projectPath,
      projectId,
    );

    // .claude.local/ skills (user-local, gitignored)
    count += scanSkillsDirectory(
      path.join(projectPath, ".claude.local", "skills"),
      projectPath,
      projectId,
    );
    for (const dir of getGeminiAgentDirs(projectPath)) {
      count += scanDirectory(dir, /\.md$/, "agents.md", projectPath, projectId);
    }
    for (const dir of getGeminiSkillDirs(projectPath)) {
      count += scanSkillsDirectory(dir, projectPath, projectId);
    }

    // Parent directory traversal (ancestor .claude/skills/ and .claude/commands/)
    let ancestor = path.dirname(projectPath);
    const root = path.parse(ancestor).root;
    while (ancestor !== root && ancestor.length > root.length) {
      // Skip ~/.claude/ — already covered by scanGlobal()
      const ancestorClaudeDir = path.join(ancestor, ".claude");
      if (ancestorClaudeDir === CLAUDE_DIR) {
        ancestor = path.dirname(ancestor);
        continue;
      }

      count += scanSkillsDirectory(
        path.join(ancestor, ".claude", "skills"),
        projectPath,
        projectId,
      );
      count += scanDirectory(
        path.join(ancestor, ".claude", "commands"),
        /\.md$/,
        "skill.md",
        projectPath,
        projectId,
      );
      ancestor = path.dirname(ancestor);
    }
  }

  return count;
}

export function removeOrphanedFiles(): number {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, file_path FROM instruction_files")
    .all() as { id: string; file_path: string }[];
  let removed = 0;
  for (const row of rows) {
    if (!fs.existsSync(row.file_path)) {
      db.prepare("DELETE FROM instruction_files WHERE id = ?").run(row.id);
      removed++;
    }
  }
  return removed;
}

export type ScanScope =
  | { type: "file-type"; fileType: string }
  | { type: "project"; projectPath: string }
  | { type: "global" }
  | { type: "knowledge" }
  | { type: "file"; filePath: string };

export function scanScope(scope: ScanScope): ScanResult {
  const db = getDb();
  const beforeCount = (
    db.prepare("SELECT COUNT(*) as c FROM instruction_files").get() as {
      c: number;
    }
  ).c;

  let changed = 0;

  switch (scope.type) {
    case "global":
      changed = scanGlobal();
      break;
    case "knowledge":
      changed = scanKnowledge();
      break;
    case "project": {
      // Build project ID map (same logic as scanProjects but for one project)
      const projectRows = db
        .prepare("SELECT id, path FROM projects")
        .all() as { id: string; path: string }[];
      let projectId: string | null = null;
      for (const p of projectRows) {
        const dirName = path.basename(p.path);
        const realPath = deriveProjectPath(dirName);
        if (realPath === scope.projectPath) {
          projectId = p.id;
          break;
        }
      }
      for (const { relativePath, pattern, fileType } of PROJECT_PATTERNS) {
        const dir = path.join(scope.projectPath, relativePath);
        changed += scanDirectory(dir, pattern, fileType, scope.projectPath, projectId);
      }
      changed += scanGeminiEntrypoint(scope.projectPath, projectId);
      changed += scanSkillsDirectory(
        path.join(scope.projectPath, ".codex", "skills"),
        scope.projectPath,
        projectId,
      );
      changed += scanSkillsDirectory(
        path.join(scope.projectPath, ".claude", "skills"),
        scope.projectPath,
        projectId,
      );
      changed += scanSkillsDirectory(
        path.join(scope.projectPath, ".claude.local", "skills"),
        scope.projectPath,
        projectId,
      );
      for (const dir of getGeminiAgentDirs(scope.projectPath)) {
        changed += scanDirectory(
          dir,
          /\.md$/,
          "agents.md",
          scope.projectPath,
          projectId,
        );
      }
      for (const dir of getGeminiSkillDirs(scope.projectPath)) {
        changed += scanSkillsDirectory(dir, scope.projectPath, projectId);
      }
      break;
    }
    case "file-type": {
      // Re-index all files of a given type by removing and re-scanning
      // We just do a full scan but only count the matching type
      changed = scanGlobal() + scanProjects() + scanKnowledge();
      break;
    }
    case "file": {
      if (indexFile(scope.filePath, null, null)) {
        changed = 1;
      }
      break;
    }
  }

  const removed = removeOrphanedFiles();
  const afterCount = (
    db.prepare("SELECT COUNT(*) as c FROM instruction_files").get() as {
      c: number;
    }
  ).c;
  const added = afterCount - beforeCount + removed;

  return {
    added: Math.max(0, added),
    updated: changed - Math.max(0, added),
    removed,
    total: afterCount,
  };
}

export function fullScan(): ScanResult {
  const db = getDb();
  const beforeCount = (
    db.prepare("SELECT COUNT(*) as c FROM instruction_files").get() as {
      c: number;
    }
  ).c;

  const globalChanged = scanGlobal();
  const projectChanged = scanProjects();
  const knowledgeChanged = scanKnowledge();
  const removed = removeOrphanedFiles();

  // Clean up global files that were incorrectly assigned a project_id
  // (from ancestor traversal backfill before the guard was added)
  db.prepare(
    "UPDATE instruction_files SET project_id = NULL, project_path = NULL WHERE file_path LIKE ? AND project_id IS NOT NULL",
  ).run(CLAUDE_DIR + "/%");

  const afterCount = (
    db.prepare("SELECT COUNT(*) as c FROM instruction_files").get() as {
      c: number;
    }
  ).c;
  const added = afterCount - beforeCount + removed;

  return {
    added: Math.max(0, added),
    updated:
      globalChanged + projectChanged + knowledgeChanged - Math.max(0, added),
    removed,
    total: afterCount,
  };
}

export function addManualPath(inputPath: string): ScanResult {
  const resolved = path.resolve(inputPath);
  const db = getDb();
  const beforeCount = (
    db.prepare("SELECT COUNT(*) as c FROM instruction_files").get() as {
      c: number;
    }
  ).c;

  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    // Single file
    indexFile(resolved, null, null);
    // Mark as manual source
    db.prepare(
      "UPDATE instruction_files SET source = 'manual' WHERE file_path = ?",
    ).run(resolved);
  } else if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    // Directory — scan for .md files
    const entries = fs.readdirSync(resolved);
    for (const entry of entries) {
      if (entry.endsWith(".md")) {
        const fullPath = path.join(resolved, entry);
        if (fs.statSync(fullPath).isFile()) {
          indexFile(fullPath, null, null);
          db.prepare(
            "UPDATE instruction_files SET source = 'manual' WHERE file_path = ?",
          ).run(fullPath);
        }
      }
    }
  }

  const afterCount = (
    db.prepare("SELECT COUNT(*) as c FROM instruction_files").get() as {
      c: number;
    }
  ).c;
  return {
    added: afterCount - beforeCount,
    updated: 0,
    removed: 0,
    total: afterCount,
  };
}
